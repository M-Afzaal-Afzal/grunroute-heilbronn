// Builds public/data/hex-r8.json, hex-r9.json, hex-r10.json for the Planner
// heat maps. Each file maps an H3 cell to the raw sums for one layer, so the
// page can show a value and the number of points behind it.
//
//   node scripts/build-hex.mjs
//
// Inputs, all local (run build-segments.mjs and build-trees.mjs first):
//   lib/heat-walks.ts                         heat walk cells (anomaly, points)
//   data/source/atrai/overtaking_distance_*   passes per ATRAI segment
//   data/source/atrai/danger_zones_PM_*       danger and dust points
//   public/data/baumkataster.json             city tree register crowns
//   public/data/segments.json                 sensor coverage per segment
//
// Crashes and the fix score are binned in the browser, because they depend on
// filters (year, bike or foot) and on the chosen weights.
import { readFileSync, writeFileSync } from "node:fs";
import { latLngToCell, cellArea } from "h3-js";

const OUT = "public/data";
const SRC = "data/source/atrai";
const RES = [8, 9, 10];
const r = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// Point in polygon for the city boundary, so nothing outside Heilbronn is binned.
const boundary = JSON.parse(readFileSync(`${OUT}/heilbronn-boundary.geojson`, "utf8"));
const polys = boundary.features.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates));
function inRing(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
const inside = (lat, lng) => polys.some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((h) => inRing(lng, lat, h)));

// Heat walk cells: [lat, lng, anomaly, temp, points]
const heatSrc = readFileSync("lib/heat-walks.ts", "utf8");
const heat = JSON.parse(heatSrc.match(/export const HEAT_CELLS[^=]*=\s*(\[[\s\S]*?\]\]);/)[1]);

const feats = (d) => d.features || d;
const overtaking = feats(JSON.parse(readFileSync(`${SRC}/overtaking_distance_heilbronn.json`, "utf8")));
const pm = JSON.parse(readFileSync(`${SRC}/danger_zones_PM_heilbronn.json`, "utf8"));
const pmFeatures = feats(pm);
const trees = JSON.parse(readFileSync(`${OUT}/baumkataster.json`, "utf8"));
const { segments, meta } = JSON.parse(readFileSync(`${OUT}/segments.json`, "utf8"));

const mid = (coords) => coords[Math.floor(coords.length / 2)];
const sensored = (s) => s.cov.safety > 0 || s.cov.heat > 0 || s.cov.dust > 0 || s.cov.rough > 0 || s.cov.stopgo > 0;

for (const res of RES) {
  const cells = new Map();
  const get = (lat, lng) => {
    const id = latLngToCell(lat, lng, res);
    let c = cells.get(id);
    if (!c) cells.set(id, (c = { hs: 0, hn: 0, pc: 0, pt: 0, ds: 0, dn: 0, dh: new Array(10).fill(0), tn: 0, ta: 0, sl: 0, ss: 0, sn: 0 }));
    return c;
  };

  for (const [lat, lng, anomaly, , n] of heat) {
    if (!inside(lat, lng)) continue;
    const c = get(lat, lng);
    c.hs += anomaly * n;
    c.hn += n;
  }
  for (const f of overtaking) {
    const [lng, lat] = mid(f.geometry.coordinates);
    if (!inside(lat, lng)) continue;
    const bins = String(f.properties["Overtaking Distance Counts"]).split(",").map((x) => Number(x.trim()) || 0);
    const c = get(lat, lng);
    c.pc += bins[0] + bins[1] + bins[2];
    c.pt += bins.reduce((a, b) => a + b, 0);
  }
  for (const f of pmFeatures) {
    const p = f.properties;
    const risk = Number(p["Risk Index"]);
    if (!Number.isFinite(risk) || risk < 0) continue;
    if (!inside(p.lat, p.lng)) continue;
    const c = get(p.lat, p.lng);
    c.ds += risk;
    c.dn++;
    c.dh[Math.min(9, Math.floor(risk * 10))]++;
  }
  let la = 0;
  for (let i = 0; i < trees.lat.length; i++) {
    la += trees.lat[i];
    const lat = trees.base[0] + la / 1e5, lng = trees.base[1] + trees.lng[i] / 1e5;
    const c = get(lat, lng);
    const d = trees.crown[i] || 0;
    c.tn++;
    c.ta += Math.PI * (d / 2) ** 2;
  }
  for (const s of segments) {
    const [lat, lng] = s.g[Math.floor(s.g.length / 2)];
    const c = get(lat, lng);
    c.sn++;
    c.sl += s.length;
    if (sensored(s)) c.ss += s.length;
  }

  // Compact rows: id -> [heatMean, heatPoints, closePasses, passes, dustMean,
  // dustPoints, dustHist10, trees, crownPct, sensorLengthShare, segments]
  const out = {};
  for (const [id, c] of cells) {
    const area = cellArea(id, "m2");
    out[id] = [
      c.hn ? r(c.hs / c.hn, 2) : null,
      c.hn,
      c.pc,
      c.pt,
      c.dn ? r(c.ds / c.dn) : null,
      c.dn,
      c.dn ? c.dh : null,
      c.tn,
      r(Math.min(1, c.ta / area) * 100, 1),
      c.sl ? r(c.ss / c.sl, 2) : null,
      c.sn,
    ];
  }
  const file = {
    res,
    built: meta.built,
    fields: ["heat", "heatPoints", "closePasses", "passes", "dust", "dustPoints", "dustHist", "trees", "crownPct", "sensorShare", "segments"],
    notes: [
      "heat: mean heat walk anomaly in °C against the same walk, weighted by points, Heat Island Summer School, 1 to 3 Sep 2026",
      "closePasses: passes under 150 cm, ATRAI overtaking_distance, binned at the segment midpoint",
      "dust: mean ATRAI danger and dust risk index, 0 to 1",
      "crownPct: city tree register crown area (circle from crown diameter) over cell area, capped at 100, approximate",
      "sensorShare: share of street length in the cell with at least one bike sensor measure",
    ],
    cells: out,
  };
  writeFileSync(`${OUT}/hex-r${res}.json`, JSON.stringify(file));
  const kb = Math.round(JSON.stringify(file).length / 1024);
  console.log(`  r${res}: ${cells.size} cells, ${kb} KB`);
}
