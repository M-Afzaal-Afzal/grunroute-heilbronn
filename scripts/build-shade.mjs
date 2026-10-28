// Shade estimate for the Kernstadt, 21 July, at 9, 12, 15 and 18 h.
//
//   node scripts/build-shade.mjs            (uses the Overpass cache in data/source)
//   node scripts/build-shade.mjs --refresh  (fetches OSM buildings again)
//   node scripts/build-segments.mjs         (then merges the shade into segments.json)
//
// Inputs:
// - OSM buildings in the Kernstadt box from Overpass, ODbL. Height is the
//   `height` tag, else `building:levels` x 3 m, else 9 m. The source of each
//   height is counted in the output.
// - Register tree crowns from public/data/baumkataster.json (approximate:
//   a flat disc at the tree, no tree height).
// - Segment lines from public/data/segments.json.
// Method: a flat roof block casts the footprint moved away from the sun by
// height / tan(sun altitude). A point is in shade when the line from it
// towards the sun, that long, hits the footprint, or it is under a crown.
// Points every 5 m along each segment; shade = shaded points / all points.
// Only segments fully inside the box minus a 100 m margin get a value, so
// missing buildings outside the box do not count as sun.
//
// Outputs: public/data/buildings.json (footprints and heights for the map)
// and data/derived/segment-shade.json (read by build-segments.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SHADE_DAY, SHADE_HOURS, shadeDate, shadowOffset, sunPosition } from "../lib/sun.ts";

const REFRESH = process.argv.includes("--refresh");
const SRC = "data/source/osm-buildings-kernstadt.json";
const OUT = "public/data";
const DERIVED = "data/derived";
const BBOX = [49.125, 9.195, 49.16, 9.235]; // south, west, north, east
const MARGIN = [0.0009, 0.0014]; // about 100 m
const STEP = 5;
const DEFAULT_H = 9;
const LEVEL_H = 3;
const CENTRE = [49.142, 9.215];
mkdirSync(DERIVED, { recursive: true });

const KY = 111200;
const KX = 111320 * Math.cos((49.14 * Math.PI) / 180);
const toXY = ([lat, lng]) => [lng * KX, lat * KY];

// ---------- 1. Buildings ----------
async function fetchBuildings() {
  const q = `[out:json][timeout:180];(way["building"](${BBOX.join(",")});relation["building"](${BBOX.join(",")}););out tags geom;`;
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), headers: { "User-Agent": "GruenRoute-Heilbronn/0.1 (hackathon build script)" } });
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.elements?.length > 100) return json;
    } catch {
      // next mirror
    }
  }
  throw new Error("Overpass not reachable and no cache in " + SRC);
}
if (REFRESH || !existsSync(SRC)) writeFileSync(SRC, JSON.stringify(await fetchBuildings()));
const osm = JSON.parse(readFileSync(SRC, "utf8"));
const osmBase = osm.osm3s?.timestamp_osm_base ?? null;

function heightOf(tags) {
  const h = parseFloat(String(tags.height ?? "").replace(",", "."));
  if (Number.isFinite(h) && h > 0 && h < 200) return [h, "height"];
  const lv = parseFloat(String(tags["building:levels"] ?? "").replace(",", "."));
  if (Number.isFinite(lv) && lv > 0 && lv < 60) return [lv * LEVEL_H, "levels"];
  return [DEFAULT_H, "default"];
}
const closed = (g) => g.length >= 4 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon;
const buildings = [];
const heightSource = { height: 0, levels: 0, default: 0 };
let skipped = 0;
for (const el of osm.elements) {
  const tags = el.tags ?? {};
  const rings = [];
  if (el.type === "way" && el.geometry && closed(el.geometry)) rings.push(el.geometry);
  else if (el.type === "relation") for (const m of el.members ?? []) if (m.role === "outer" && m.geometry && closed(m.geometry)) rings.push(m.geometry);
  if (!rings.length) {
    skipped++;
    continue;
  }
  const [h, src] = heightOf(tags);
  heightSource[src]++;
  for (const g of rings) {
    const ll = g.slice(0, -1).map((p) => [p.lat, p.lon]);
    buildings.push({ h, ll, xy: ll.map(toXY) });
  }
}
console.log(`Buildings: ${buildings.length} footprints from ${osm.elements.length} OSM elements (${skipped} without a closed outline skipped)`);
console.log(`  height from tag ${heightSource.height}, from levels ${heightSource.levels}, default ${DEFAULT_H} m ${heightSource.default}`);

// ---------- 2. Sun ----------
const sun = SHADE_HOURS.map((hour) => {
  const s = sunPosition(shadeDate(hour), CENTRE[0], CENTRE[1]);
  return { hour, ...s, unit: shadowOffset(1, s) };
});
for (const s of sun) console.log(`  ${s.hour}:00 sun altitude ${((s.altitude * 180) / Math.PI).toFixed(1)}, azimuth ${((s.azimuth * 180) / Math.PI).toFixed(1)}`);

// ---------- 3. Geometry ----------
function inPoly(p, xy) {
  let inside = false;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    const [xi, yi] = xy[i], [xj, yj] = xy[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segHit(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function lineHitsPoly(a, b, xy) {
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) if (segHit(a, b, xy[j], xy[i])) return true;
  return false;
}

const CELL = 50;
const cellKey = (cx, cy) => cx * 100000 + cy;
function gridFor(items, boxOf) {
  const grid = new Map();
  items.forEach((it, i) => {
    const [x0, y0, x1, y1] = boxOf(it);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = cellKey(cx, cy);
        const c = grid.get(k);
        if (c) c.push(i);
        else grid.set(k, [i]);
      }
  });
  return (p) => grid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL))) ?? [];
}
for (const b of buildings) {
  const xs = b.xy.map((p) => p[0]), ys = b.xy.map((p) => p[1]);
  b.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
// One grid per hour over footprint plus shadow.
const shadowGrids = sun.map((s) =>
  s.unit
    ? gridFor(buildings, (b) => {
        const dx = s.unit[0] * b.h, dy = s.unit[1] * b.h;
        return [Math.min(b.box[0], b.box[0] + dx), Math.min(b.box[1], b.box[1] + dy), Math.max(b.box[2], b.box[2] + dx), Math.max(b.box[3], b.box[3] + dy)];
      })
    : () => [],
);

// Register crowns, approximate discs.
const tr = JSON.parse(readFileSync(`${OUT}/baumkataster.json`, "utf8"));
const crowns = [];
{
  let la = 0;
  for (let i = 0; i < tr.lat.length; i++) {
    la += tr.lat[i];
    const lat = tr.base[0] + la / 1e5, lng = tr.base[1] + tr.lng[i] / 1e5;
    const r = (tr.crown[i] || 0) / 2;
    if (r > 0 && lat > BBOX[0] - 0.001 && lat < BBOX[2] + 0.001 && lng > BBOX[1] - 0.0015 && lng < BBOX[3] + 0.0015) crowns.push({ xy: toXY([lat, lng]), r });
  }
}
const crownGrid = gridFor(crowns, (c) => [c.xy[0] - c.r, c.xy[1] - c.r, c.xy[0] + c.r, c.xy[1] + c.r]);
const underCrown = (p) => crownGrid(p).some((i) => Math.hypot(p[0] - crowns[i].xy[0], p[1] - crowns[i].xy[1]) <= crowns[i].r);
console.log(`Crowns: ${crowns.length} register trees with a crown in or near the box`);

function inBuildingShade(p, hourIdx) {
  const s = sun[hourIdx];
  if (!s.unit) return true; // sun down
  for (const i of shadowGrids[hourIdx](p)) {
    const b = buildings[i];
    const toSun = [p[0] - s.unit[0] * b.h, p[1] - s.unit[1] * b.h];
    if (inPoly(p, b.xy) || lineHitsPoly(p, toSun, b.xy)) return true;
  }
  return false;
}

// ---------- 4. Segments ----------
const seg = JSON.parse(readFileSync(`${OUT}/segments.json`, "utf8")).segments;
const inner = [BBOX[0] + MARGIN[0], BBOX[1] + MARGIN[1], BBOX[2] - MARGIN[0], BBOX[3] - MARGIN[1]];
const inside = (g) => g.every(([lat, lng]) => lat >= inner[0] && lat <= inner[2] && lng >= inner[1] && lng <= inner[3]);
function samples(g) {
  const xy = g.map(toXY);
  const pts = [xy[0]];
  for (let i = 1; i < xy.length; i++) {
    const [a, b] = [xy[i - 1], xy[i]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = STEP; t < l; t += STEP) pts.push([a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l]);
    pts.push(b);
  }
  return pts;
}
const ids = [], shade = [], bOnly = [];
const r3 = (v) => Math.round(v * 1000) / 1000;
for (const s of seg) {
  if (!s.g?.length || !inside(s.g)) continue;
  const pts = samples(s.g);
  const crowned = pts.map(underCrown);
  const row = [], rowB = [];
  for (let h = 0; h < sun.length; h++) {
    let n = 0, nb = 0;
    pts.forEach((p, i) => {
      const b = inBuildingShade(p, h);
      if (b) nb++;
      if (b || crowned[i]) n++;
    });
    row.push(r3(n / pts.length));
    rowB.push(r3(nb / pts.length));
  }
  ids.push(s.id);
  shade.push(row);
  bOnly.push(rowB);
}
const mean = (h) => shade.reduce((a, r) => a + r[h], 0) / shade.length;
console.log(`Segments with a shade value: ${ids.length}`);
console.log(`  mean shade ${sun.map((s, h) => `${s.hour}h ${(mean(h) * 100).toFixed(0)}%`).join(", ")}`);

// ---------- 5. Output ----------
const meta = {
  source: "OpenStreetMap contributors, ODbL, via Overpass",
  osmBase,
  bbox: BBOX,
  day: SHADE_DAY,
  hours: [...SHADE_HOURS],
  heightRule: `height tag, else building:levels x ${LEVEL_H} m, else ${DEFAULT_H} m`,
  heightSource,
  buildings: buildings.length,
  crowns: crowns.length,
  step: STEP,
};
writeFileSync(`${DERIVED}/segment-shade.json`, JSON.stringify({ meta: { ...meta, segments: ids.length }, ids, shade, buildingsOnly: bOnly }));
// Footprints for the map: [height, lat0, lng0, dlat1, dlng1, ...] in 1e-5 degrees from the box corner.
const base = [BBOX[0], BBOX[1]];
const enc = buildings.map((b) => {
  const out = [Math.round(b.h * 2) / 2];
  let pl = 0, pg = 0;
  b.ll.forEach(([lat, lng], i) => {
    const a = Math.round((lat - base[0]) * 1e5), g = Math.round((lng - base[1]) * 1e5);
    out.push(i ? a - pl : a, i ? g - pg : g);
    pl = a;
    pg = g;
  });
  return out;
});
const json = JSON.stringify({ ...meta, base, b: enc });
writeFileSync(`${OUT}/buildings.json`, json);
console.log(`Wrote ${OUT}/buildings.json (${(json.length / 1024).toFixed(0)} KB) and ${DERIVED}/segment-shade.json`);
