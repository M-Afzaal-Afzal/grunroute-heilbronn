// Builds the measured street network for the "For the city" view:
//   public/data/segments.json   street segments with their measures
//   public/data/crashes.json    bike and foot injury crashes in Heilbronn
//   public/data/schools.json    schools and kindergartens (OSM)
//   public/data/heilbronn-districts.geojson, heilbronn-boundary.geojson
//
// Sources (full list with licences in lib/sources.ts):
// - ATRAI collections from api.atrai.bike (hackathon organisers)
// - Stadt Heilbronn Baumkataster, already built into public/data/baumkataster.json
// - Heat Island Summer School heat walks, lib/heat-walks.ts
// - Unfallatlas 2021 to 2025, Statistische Ämter des Bundes und der Länder, dl-de/by-2-0
// - Stadtteil and Stadtkreis boundaries, Stadt Heilbronn, dl-de/by-2-0
// - Schools and kindergartens from OpenStreetMap via Overpass, ODbL
//
// Raw downloads are cached in data/source/. Pass --refresh to download again.
// Run: node scripts/build-segments.mjs
//
// Segment base: the ATRAI line collections share one road segment id
// (overtaking `id`, bumpy `id`, speed and flow `road_segment`, same geometry).
// We join on that id. Merging by intersecting osmid sets, as first planned,
// chains whole corridors into one record (44 edges in the largest), so it is
// not used. Higher measure values always mean more need. Missing data is null.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { gzipSync, inflateRawSync } from "node:zlib";

const REFRESH = process.argv.includes("--refresh");
const SRC = "data/source";
const OUT = "public/data";
const UA = "GruenRoute-Heilbronn/0.1 (hackathon build script)";
mkdirSync(`${SRC}/atrai`, { recursive: true });

// ---------- geometry helpers (local metres around Heilbronn) ----------
const KY = 111200;
const KX = 111320 * Math.cos((49.14 * Math.PI) / 180);
const toXY = ([lat, lng]) => [lng * KX, lat * KY];
function distPtSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function distToLineXY(p, xy) {
  let d = Infinity;
  for (let i = 1; i < xy.length; i++) d = Math.min(d, distPtSeg(p, xy[i - 1], xy[i]));
  return xy.length === 1 ? Math.hypot(p[0] - xy[0][0], p[1] - xy[0][1]) : d;
}
function lengthXY(xy) {
  let s = 0;
  for (let i = 1; i < xy.length; i++) s += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  return s;
}
function midpoint(latlng, xy) {
  const half = lengthXY(xy) / 2;
  let s = 0;
  for (let i = 1; i < xy.length; i++) {
    const l = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    if (s + l >= half && l > 0) {
      const t = (half - s) / l;
      return [latlng[i - 1][0] + t * (latlng[i][0] - latlng[i - 1][0]), latlng[i - 1][1] + t * (latlng[i][1] - latlng[i - 1][1])];
    }
    s += l;
  }
  return latlng[0];
}
function douglasPeucker(pts, xy, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distPtSeg(xy[i], xy[a], xy[b]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function inRing([lng, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeometry(lnglat, g) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some((rings) => inRing(lnglat, rings[0]) && !rings.slice(1).some((h) => inRing(lnglat, h)));
}

// Grid index of segments in metres for "near" lookups.
const CELL = 100;
const grid = new Map();
const gkey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
function indexSegment(k, xy) {
  const seen = new Set();
  for (const [x, y] of xy) seen.add(gkey(x, y));
  for (let i = 1; i < xy.length; i++) {
    const n = Math.ceil(Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]) / (CELL / 2));
    for (let s = 1; s < n; s++) seen.add(gkey(xy[i - 1][0] + ((xy[i][0] - xy[i - 1][0]) * s) / n, xy[i - 1][1] + ((xy[i][1] - xy[i - 1][1]) * s) / n));
  }
  for (const c of seen) (grid.get(c) || grid.set(c, []).get(c)).push(k);
}
function segmentsNear(p, r) {
  const out = new Set();
  const n = Math.ceil(r / CELL);
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const k of grid.get(`${cx + i},${cy + j}`) || []) out.add(k);
  return out;
}

// ---------- downloads with cache ----------
async function fetchRetry(url, opts = {}, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
      if (r.ok) return r;
      console.warn(`  ${r.status} ${url}`);
    } catch (e) {
      console.warn(`  ${e.message} ${url}`);
    }
    await new Promise((res) => setTimeout(res, 3000 * (t + 1)));
  }
  return null;
}
async function cached(path, download) {
  if (!REFRESH && existsSync(path)) return readFileSync(path);
  const buf = await download();
  if (!buf) {
    if (existsSync(path)) { console.warn(`  download failed, using old cache ${path}`); return readFileSync(path); }
    return null;
  }
  writeFileSync(`${path}.tmp`, buf);
  renameSync(`${path}.tmp`, path);
  return buf;
}
async function atrai(name) {
  const buf = await cached(`${SRC}/atrai/${name}.json`, async () => {
    const features = [];
    let matched = Infinity;
    for (let offset = 0; offset < matched; offset += 10000) {
      const r = await fetchRetry(`https://api.atrai.bike/collections/${name}/items?f=json&limit=10000&offset=${offset}`);
      if (!r) return null;
      const j = await r.json();
      matched = j.numberMatched;
      features.push(...j.features);
      if (!j.features.length) break;
    }
    if (features.length !== matched) throw new Error(`${name}: got ${features.length} of ${matched}`);
    return Buffer.from(JSON.stringify({ numberMatched: matched, features }));
  });
  if (!buf) throw new Error(`ATRAI ${name} could not be downloaded`);
  return JSON.parse(buf).features;
}

// Python list strings such as "['A', 'B']" or "[1, 2]".
function pyList(v) {
  if (v == null) return [];
  const s = String(v).trim();
  if (!s.startsWith("[")) return [s];
  return s.slice(1, -1).split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

// ---------- 1. ATRAI segment base ----------
console.log("ATRAI collections");
const overtaking = await atrai("overtaking_distance_heilbronn");
const bumpy = await atrai("bumpy_roads_heilbronn");
const speed = await atrai("speed_map_heilbronn");
const flow = await atrai("traffic_flow_heilbronn");
const pm = await atrai("danger_zones_PM_heilbronn");
console.log(`  overtaking ${overtaking.length}, bumpy ${bumpy.length}, speed ${speed.length}, flow ${flow.length}, PM points ${pm.length}`);

const segs = new Map();
function seg(id, f) {
  let s = segs.get(id);
  if (!s) {
    s = { id, names: [], geom: null, raw: {} };
    segs.set(id, s);
  }
  const g = f.geometry;
  if (g && g.type === "LineString" && (!s.geom || g.coordinates.length > s.geom.length)) s.geom = g.coordinates.map(([lng, lat]) => [lat, lng]);
  for (const n of pyList(f.properties.name)) if (!s.names.includes(n)) s.names.push(n);
  return s;
}
for (const f of overtaking) {
  const p = f.properties;
  const s = seg(p.id, f);
  const bins = String(p["Overtaking Distance Counts"]).split(",").map((x) => Number(x.trim()) || 0);
  const total = bins.reduce((a, b) => a + b, 0);
  s.raw.gapCm = p["Average Overtaking Distance cm"];
  s.raw.passes = total;
  s.raw.under150 = bins[0] + bins[1] + bins[2];
  s.raw.bins = bins;
  s.raw.overtakeBoxes = p["Number of Boxes"];
}
for (const f of bumpy) {
  const p = f.properties;
  const s = seg(p.id, f);
  s.raw.rough = p["Normalized Roughness"];
  s.raw.roughBoxes = p["Number of Boxes"];
}
for (const f of speed) {
  const p = f.properties;
  const s = seg(p.road_segment, f);
  s.raw.speedKmh = p["avg_speed[km/h]"];
  s.raw.speedPoints = p.points_in_segment;
}
for (const f of flow) {
  const p = f.properties;
  const s = seg(p.road_segment, f);
  s.raw.flow = p.avg_traffic_flow;
  s.raw.flowPoints = p.points_in_segment;
}
console.log(`  ${segs.size} unique road segments across the line collections`);

// ---------- 2. City boundary and districts ----------
console.log("Boundaries");
const odh = "https://opendata.heilbronn.de/sites/default/files";
async function geojson(file) {
  const buf = await cached(`${SRC}/${file}`, async () => {
    const r = await fetchRetry(`${odh}/${file}`);
    return r ? Buffer.from(await r.arrayBuffer()) : null;
  });
  if (!buf) throw new Error(`${file} could not be downloaded`);
  return JSON.parse(buf);
}
const boundary = await geojson("Heilbronn_Stadtkreisgrenzen_Gen_0.geojson");
const districtsGj = await geojson("Heilbronn_Stadtteilgrenzen_Gen_0.geojson");
const roundCoords = (c) => (typeof c[0] === "number" ? [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5] : c.map(roundCoords));
const slim = (gj, keep) => ({
  type: "FeatureCollection",
  features: gj.features.map((f) => ({ type: "Feature", properties: keep(f.properties), geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) } })),
});
const boundaryGeom = boundary.features[0].geometry;
const districts = districtsGj.features.map((f) => ({ name: f.properties.ORTSTEIL, geometry: f.geometry }));
console.log(`  boundary 1 polygon, ${districts.length} districts`);

// ---------- 3. Build segment list, clip to the city ----------
let outside = 0, noGeom = 0;
const list = [];
for (const s of segs.values()) {
  if (!s.geom || s.geom.length < 2) { noGeom++; continue; }
  s.xy = s.geom.map(toXY);
  s.length = lengthXY(s.xy);
  const mid = midpoint(s.geom, s.xy);
  if (!inGeometry([mid[1], mid[0]], boundaryGeom)) { outside++; continue; }
  s.district = districts.find((d) => inGeometry([mid[1], mid[0]], d.geometry))?.name ?? null;
  list.push(s);
}
list.forEach((s, k) => indexSegment(k, s.xy));
console.log(`  ${list.length} segments inside Heilbronn, ${outside} outside the city dropped, ${noGeom} without geometry dropped`);

// ---------- 4. PM danger index, nearest segment within 20 m ----------
console.log("Danger plus dust points");
const pmSum = new Float64Array(list.length), pmN = new Uint32Array(list.length);
let pmUsed = 0;
for (const f of pm) {
  const v = f.properties["Risk Index"];
  if (typeof v !== "number" || !f.geometry) continue;
  const p = toXY([f.geometry.coordinates[1], f.geometry.coordinates[0]]);
  let best = -1, bd = 20;
  for (const k of segmentsNear(p, 20)) {
    const d = distToLineXY(p, list[k].xy);
    if (d <= bd) { bd = d; best = k; }
  }
  if (best >= 0) { pmSum[best] += v; pmN[best]++; pmUsed++; }
}
console.log(`  ${pmUsed} of ${pm.length} points within 20 m of a segment`);

// ---------- 5. Trees from the city register ----------
console.log("Trees");
const tr = JSON.parse(readFileSync(`${OUT}/baumkataster.json`, "utf8"));
const trees = [];
{
  let la = 0;
  for (let i = 0; i < tr.lat.length; i++) {
    la += tr.lat[i];
    trees.push({ xy: toXY([tr.base[0] + la / 1e5, tr.base[1] + tr.lng[i] / 1e5]), crown: tr.crown[i] || 0 });
  }
}
const tCount = new Uint32Array(list.length), crownArea = new Float64Array(list.length);
for (const t of trees) {
  for (const k of segmentsNear(t.xy, 20)) {
    const d = distToLineXY(t.xy, list[k].xy);
    if (d <= 20) tCount[k]++;
    if (d <= 15) crownArea[k] += Math.PI * (t.crown / 2) ** 2;
  }
}
console.log(`  ${trees.length} register trees`);

// ---------- 6. Heat walks ----------
console.log("Heat walks");
const heatSrc = readFileSync("lib/heat-walks.ts", "utf8");
const heatArr = heatSrc.match(/export const HEAT_CELLS[^=]*=\s*(\[[\s\S]*?\]\]);/);
const heatCells = JSON.parse(heatArr[1]).map(([lat, lng, anomaly, , points]) => ({ xy: toXY([lat, lng]), anomaly, points }));
const hSum = new Float64Array(list.length), hN = new Uint32Array(list.length), hPts = new Uint32Array(list.length);
for (const c of heatCells) {
  for (const k of segmentsNear(c.xy, 60)) {
    if (distToLineXY(c.xy, list[k].xy) <= 60) { hSum[k] += c.anomaly; hN[k]++; hPts[k] += c.points; }
  }
}
console.log(`  ${heatCells.length} heat walk spots`);

// ---------- 7. Unfallatlas 2021 to 2025 ----------
console.log("Unfallatlas");
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const fl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + fl);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    files[name] = () => (method === 0 ? buf.subarray(start, start + csize) : inflateRawSync(buf.subarray(start, start + csize)));
    off += 46 + fl + el + cl;
  }
  return files;
}
const num = (v) => Number(String(v ?? "").replace(",", "."));
const crashes = [];
const crashYears = [];
for (let year = 2021; year <= 2025; year++) {
  const file = `Unfallorte${year}_EPSG25832_CSV.zip`;
  const buf = await cached(`${SRC}/${file}`, async () => {
    const r = await fetchRetry(`https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/${file}`);
    return r ? Buffer.from(await r.arrayBuffer()) : null;
  });
  if (!buf) { console.warn(`  ${year}: not downloaded, skipped`); continue; }
  const files = unzip(buf);
  const entry = Object.keys(files).find((n) => /(LinRef|LR_BasisDLM)\.(csv|txt)$/i.test(n));
  if (!entry) { console.warn(`  ${year}: no CSV in zip, skipped`); continue; }
  const lines = files[entry]().toString("utf8").replace(/^﻿/, "").split(/\r?\n/);
  const head = lines[0].split(";").map((h) => h.trim());
  const col = (name) => head.findIndex((h) => h.toUpperCase() === name.toUpperCase());
  const c = { land: col("ULAND"), rb: col("UREGBEZ"), kr: col("UKREIS"), cat: col("UKATEGORIE"), rad: col("IstRad"), fuss: col("IstFuss"), x: col("XGCSWGS84"), y: col("YGCSWGS84") };
  if (Object.values(c).some((i) => i < 0)) throw new Error(`${year}: missing columns ${JSON.stringify(c)}`);
  let inKreis = 0, kept = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = lines[i].split(";");
    if (num(r[c.land]) !== 8 || num(r[c.rb]) !== 1 || num(r[c.kr]) !== 21) continue;
    inKreis++;
    const bike = num(r[c.rad]) === 1, foot = num(r[c.fuss]) === 1;
    if (!bike && !foot) continue;
    const lng = num(r[c.x]), lat = num(r[c.y]);
    if (!inGeometry([lng, lat], boundaryGeom)) continue;
    kept++;
    crashes.push({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, year, category: num(r[c.cat]), bike, foot });
  }
  crashYears.push(year);
  console.log(`  ${year}: ${inKreis} crashes in Stadtkreis Heilbronn, ${kept} with a bike or person on foot inside the boundary`);
}
const WEIGHT = { 1: 3, 2: 2, 3: 1 };
const cW = new Float64Array(list.length), cN = new Uint32Array(list.length);
const cCat = list.map(() => [0, 0, 0]);
for (const cr of crashes) {
  const p = toXY([cr.lat, cr.lng]);
  for (const k of segmentsNear(p, 25)) {
    if (distToLineXY(p, list[k].xy) <= 25) {
      cW[k] += WEIGHT[cr.category] || 0;
      cN[k]++;
      cCat[k][cr.category - 1]++;
    }
  }
}

// ---------- 8. Schools and kindergartens ----------
console.log("Schools");
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const q = `[out:json][timeout:60];area["de:amtlicher_gemeindeschluessel"="08121000"]->.a;(nwr["amenity"="school"](area.a);nwr["amenity"="kindergarten"](area.a););out center tags;`;
const schoolBuf = await cached(`${SRC}/osm-schools.json`, async () => {
  for (const url of OVERPASS) {
    const r = await fetchRetry(url, { method: "POST", body: new URLSearchParams({ data: q }) }, 3);
    if (r) {
      const t = Buffer.from(await r.arrayBuffer());
      try { if (JSON.parse(t).elements) return t; } catch { /* not JSON, try next */ }
    }
  }
  return null;
});
let schools = null;
try {
  const j = JSON.parse(schoolBuf);
  schools = j.elements
    .map((e) => ({ lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, type: e.tags?.amenity, name: e.tags?.name ?? null, osm: `${e.type}/${e.id}` }))
    .filter((s) => s.lat && s.lng)
    .map((s) => ({ ...s, lat: Math.round(s.lat * 1e5) / 1e5, lng: Math.round(s.lng * 1e5) / 1e5 }));
  schools.osmBase = j.osm3s?.timestamp_osm_base ?? null;
} catch {
  console.warn("  Overpass not reachable and no cache: schoolZone stays null");
}
const schoolZone = new Array(list.length).fill(schools ? false : null);
if (schools) {
  for (const s of schools) {
    const p = toXY([s.lat, s.lng]);
    for (const k of segmentsNear(p, 300)) if (!schoolZone[k] && distToLineXY(p, list[k].xy) <= 300) schoolZone[k] = true;
  }
  console.log(`  ${schools.length} schools and kindergartens, OSM data of ${schools.osmBase}`);
}

// ---------- 9. Measures and output ----------
const r2 = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
// Per 100 m values use at least 50 m, so very short pieces do not blow up.
const per100 = (n, len) => (n / Math.max(len, 50)) * 100;
const out = list.map((s, k) => {
  const raw = s.raw;
  const bufferArea = 2 * 15 * s.length + Math.PI * 15 * 15;
  const crownCover = Math.min(1, crownArea[k] / bufferArea);
  const m = {
    safety: raw.passes ? r2(raw.under150 / raw.passes, 3) : null,
    gap: raw.gapCm != null ? r2(raw.gapCm, 0) : null,
    heat: hN[k] ? r2(hSum[k] / hN[k], 2) : null,
    shadeGap: r2(1 - crownCover, 3),
    dust: pmN[k] ? r2(pmSum[k] / pmN[k], 3) : null,
    rough: raw.rough != null ? r2(raw.rough, 1) : null,
    stopgo: raw.flow != null ? r2(1 - raw.flow, 3) : null,
    crashes: crashYears.length ? r2(per100(cW[k], s.length), 2) : null,
    schoolZone: schoolZone[k],
  };
  const cov = {
    safety: raw.passes ?? 0,
    heat: hPts[k],
    dust: pmN[k],
    rough: raw.roughBoxes ?? 0,
    stopgo: raw.flowPoints ?? 0,
    crashes: cN[k],
  };
  const geom = douglasPeucker(s.geom, s.xy, 3).map(([lat, lng]) => [r2(lat, 5), r2(lng, 5)]);
  return {
    id: s.id,
    name: s.names.length ? s.names.join(" / ") : null,
    district: s.district,
    length: Math.round(s.length),
    m,
    cov,
    raw: {
      gapCm: raw.gapCm != null ? r2(raw.gapCm, 0) : null,
      passes: raw.passes ?? 0,
      under150: raw.under150 ?? 0,
      bins: raw.bins ?? null,
      heatSpots: hN[k],
      treesPer100: r2(per100(tCount[k], s.length), 1),
      trees: tCount[k],
      crownCover: r2(crownCover, 3),
      dust: pmN[k] ? r2(pmSum[k] / pmN[k], 3) : null,
      roughBoxes: raw.roughBoxes ?? 0,
      speedKmh: raw.speedKmh != null ? r2(raw.speedKmh, 1) : null,
      flow: raw.flow != null ? r2(raw.flow, 3) : null,
      crashes: cN[k],
      crashesByCat: cCat[k],
    },
    g: geom,
  };
});
out.sort((a, b) => a.id - b.id);

const has = (key) => out.filter((s) => s.m[key] != null).length;
const coverage = Object.fromEntries(["safety", "gap", "heat", "shadeGap", "dust", "rough", "stopgo", "crashes"].map((k) => [k, has(k)]));
coverage.schoolZone = schools ? out.filter((s) => s.m.schoolZone).length : null;
const meta = {
  built: new Date().toISOString().slice(0, 10),
  segments: out.length,
  coverage,
  counts: {
    overtaking: overtaking.length,
    bumpy: bumpy.length,
    speed: speed.length,
    flow: flow.length,
    pmPoints: pm.length,
    pmPointsJoined: pmUsed,
    trees: trees.length,
    heatCells: heatCells.length,
    crashes: crashes.length,
    crashYears,
    schools: schools ? schools.length : null,
    schoolsOsmBase: schools ? schools.osmBase : null,
    districts: districts.length,
    passes: out.reduce((a, s) => a + s.raw.passes, 0),
    under150: out.reduce((a, s) => a + s.raw.under150, 0),
    droppedOutside: outside,
  },
  notes: {
    segmentBase: "ATRAI road segment id shared by overtaking, bumpy, speed and flow collections",
    crownCover: "estimate from the tree register",
    per100MinLength: 50,
    crashWeights: WEIGHT,
  },
};
const json = JSON.stringify({ meta, segments: out });
writeFileSync(`${OUT}/segments.json`, json);
writeFileSync(`${OUT}/crashes.json`, JSON.stringify({ source: "Unfallatlas, Statistische Ämter des Bundes und der Länder, dl-de/by-2-0", years: crashYears, crashes }));
if (schools) writeFileSync(`${OUT}/schools.json`, JSON.stringify({ source: "OpenStreetMap contributors, ODbL", osmBase: schools.osmBase, schools: [...schools] }));
writeFileSync(`${OUT}/heilbronn-boundary.geojson`, JSON.stringify(slim(boundary, () => ({ name: "Stadtkreis Heilbronn" }))));
writeFileSync(`${OUT}/heilbronn-districts.geojson`, JSON.stringify(slim(districtsGj, (p) => ({ name: p.ORTSTEIL }))));

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log("\nSummary");
console.log(`  segments: ${out.length}`);
for (const [k, v] of Object.entries(coverage)) console.log(`  ${k.padEnd(10)} ${v == null ? "no data" : `${v} (${((v / out.length) * 100).toFixed(1)}%)`}`);
console.log(`  crashes: ${crashes.length} (${crashYears.join(", ")}), schools: ${schools ? schools.length : "none"}`);
console.log(`  segments.json ${kb(json.length)}, gzipped ${kb(gzipSync(json).length)}`);
