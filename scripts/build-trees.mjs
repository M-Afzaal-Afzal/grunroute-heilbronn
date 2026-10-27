// Turns the official Heilbronn tree register (Baumkataster) into a compact
// file the app loads on demand: public/data/baumkataster.json
//
// Source: Stadt Heilbronn, Baumkataster, Stand 01.01.2026, WGS84 shapefile,
// https://opendata.heilbronn.de/dataset/baumkataster
// Licence: Datenlizenz Deutschland, Namensnennung 2.0 (dl-de/by-2-0).
//
// Run: node scripts/build-trees.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const ZIP = "data/source/SHAPE_BKA_HN20260101_EPSG4326.zip";
const BASE = "SHN_Baumkataster_open_WGS84_EPSG4326";
const OUT = "public/data/baumkataster.json";

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
    const data = buf.subarray(start, start + csize);
    files[name] = method === 0 ? data : inflateRawSync(data);
    off += 46 + fl + el + cl;
  }
  return files;
}

const files = unzip(readFileSync(ZIP));
const shp = files[`${BASE}.shp`];
const dbf = files[`${BASE}.dbf`];

// Points from the .shp file.
const pts = [];
for (let o = 100; o < shp.length; ) {
  const len = shp.readInt32BE(o + 4) * 2;
  const type = shp.readInt32LE(o + 8);
  pts.push(type === 1 ? [shp.readDoubleLE(o + 20), shp.readDoubleLE(o + 12)] : null);
  o += 8 + len;
}

// Attributes from the .dbf file (UTF-8 per the .cpg file).
const nrec = dbf.readUInt32LE(4), hlen = dbf.readUInt16LE(8), rlen = dbf.readUInt16LE(10);
const fields = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) fields.push({ name: dbf.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: dbf[o + 16] });
const rows = [];
for (let i = 0; i < nrec; i++) {
  let p = hlen + i * rlen + 1;
  const r = {};
  for (const f of fields) { r[f.name] = dbf.toString("utf8", p, p + f.len).trim(); p += f.len; }
  rows.push(r);
}
if (rows.length !== pts.length) throw new Error(`Count mismatch ${rows.length} vs ${pts.length}`);

const dict = () => { const list = []; const idx = new Map(); return { list, id(v) { if (!idx.has(v)) { idx.set(v, list.length); list.push(v); } return idx.get(v); } }; };
const species = dict(), streets = dict(), districts = dict(), types = dict();
const LAT0 = 49.09, LNG0 = 9.07;
const trees = rows
  .map((r, i) => ({ r, p: pts[i] }))
  .filter((t) => t.p)
  .sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1]);

const out = { lat: [], lng: [], sp: [], st: [], di: [], ty: [], crown: [], trunk: [] };
let prevLat = 0;
for (const { r, p } of trees) {
  const la = Math.round((p[0] - LAT0) * 1e5);
  out.lat.push(la - prevLat); // delta encoded, sorted by latitude
  prevLat = la;
  out.lng.push(Math.round((p[1] - LNG0) * 1e5));
  out.sp.push(species.id(`${r.DEU_TEXT}|${r.WIS_TEXT}`));
  out.st.push(streets.id(r.STRASSE));
  out.di.push(districts.id(r.STADTTEIL));
  out.ty.push(types.id(r.TYP));
  out.crown.push(Math.round(Number(r.KRONE_DM) * 10) / 10 || 0);
  out.trunk.push(Math.round(Number(r.ST_UMFANG) * 100) || 0); // cm
}

const json = {
  source: "Stadt Heilbronn, Baumkataster, Stand 01.01.2026",
  url: "https://opendata.heilbronn.de/dataset/baumkataster",
  license: "dl-de/by-2-0",
  count: trees.length,
  base: [LAT0, LNG0],
  species: species.list,
  streets: streets.list,
  districts: districts.list,
  types: types.list,
  ...out,
};
writeFileSync(OUT, JSON.stringify(json));
console.log(`${trees.length} trees, ${species.list.length} species, ${streets.list.length} streets -> ${OUT}`);
