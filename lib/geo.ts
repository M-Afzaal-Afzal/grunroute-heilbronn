import { BASE, TREE_NAMES, TREES_RAW, TREE_ROWS_RAW, WATER_RAW } from "./osm-trees";
import { HEAT_CELLS, type HeatCell } from "./heat-walks";

export type LatLng = [number, number];

export type Tree = { id: number; lat: number; lng: number; name: string | null; landmark: boolean };
export type TreeRow = { id: number; coords: LatLng[]; name: string | null };
export type Water = { id: number; lat: number; lng: number; name: string | null };
export type DangerPoint = { id: number; lat: number; lng: number; risk: number };

// Metres per degree near Heilbronn (49.14 N). Good enough for distances of a
// few kilometres, which is all this app needs.
const KY = 111_200;
const KX = 111_320 * Math.cos((49.14 * Math.PI) / 180);

function decodePoint(s: string): LatLng {
  const [a, b] = s.split(",");
  return [BASE.lat + Number(a) / 1e5, BASE.lng + Number(b) / 1e5];
}

export const TREES: Tree[] = TREES_RAW.split(";").map((s, id) => {
  const p = s.split(",");
  const [lat, lng] = decodePoint(s);
  const nameIdx = p.length > 2 ? Number(p[2]) : -1;
  return { id, lat, lng, name: nameIdx >= 0 ? TREE_NAMES[nameIdx] : null, landmark: p[3] === "1" };
});

export const TREE_ROWS: TreeRow[] = TREE_ROWS_RAW.split(";").map((s, id) => {
  const [n, pts] = s.split("|");
  const idx = Number(n);
  return { id, coords: pts.split(" ").map(decodePoint), name: idx >= 0 ? TREE_NAMES[idx] : null };
});

export const WATER: Water[] = WATER_RAW.split(";").map((s, id) => {
  const [p, name] = s.split("|");
  const [lat, lng] = decodePoint(p);
  return { id, lat, lng, name: name || null };
});

export const HEAT = HEAT_CELLS;
export type { HeatCell };

export function distM(a: LatLng, b: LatLng) {
  const dx = (a[1] - b[1]) * KX;
  const dy = (a[0] - b[0]) * KY;
  return Math.sqrt(dx * dx + dy * dy);
}

function distToSegment(p: LatLng, a: LatLng, b: LatLng) {
  const ax = (a[1] - p[1]) * KX;
  const ay = (a[0] - p[0]) * KY;
  const bx = (b[1] - p[1]) * KX;
  const by = (b[0] - p[0]) * KY;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

export function distToLine(p: LatLng, line: LatLng[]) {
  if (line.length === 1) return distM(p, line[0]);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distToSegment(p, line[i], line[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

export function lineLengthM(line: LatLng[]) {
  let m = 0;
  for (let i = 0; i < line.length - 1; i++) m += distM(line[i], line[i + 1]);
  return m;
}

type Box = { s: number; w: number; n: number; e: number };
function boxOf(line: LatLng[], padM: number): Box {
  let s = 90, n = -90, w = 180, e = -180;
  for (const [la, lo] of line) {
    if (la < s) s = la;
    if (la > n) n = la;
    if (lo < w) w = lo;
    if (lo > e) e = lo;
  }
  const py = padM / KY;
  const px = padM / KX;
  return { s: s - py, n: n + py, w: w - px, e: e + px };
}
const inBox = (b: Box, lat: number, lng: number) => lat >= b.s && lat <= b.n && lng >= b.w && lng <= b.e;

/** Points of a list that lie within r metres of a line. */
export function pointsNear<T extends { lat: number; lng: number }>(items: T[], line: LatLng[], r: number): T[] {
  const box = boxOf(line, r);
  return items.filter((it) => inBox(box, it.lat, it.lng) && distToLine([it.lat, it.lng], line) <= r);
}

/** Sample a line every `step` metres, so heat coverage is not skewed by vertex density. */
export function sampleLine(line: LatLng[], step = 40): LatLng[] {
  if (line.length < 2) return line.slice();
  const out: LatLng[] = [line[0]];
  let carry = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const seg = distM(a, b);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += step;
    }
    carry = seg - (d - step);
  }
  out.push(line[line.length - 1]);
  return out;
}

export type HeatSummary = {
  covered: number; // share of the line with heat walk data, 0 to 1
  avg: number | null; // mean anomaly over covered parts, degrees C
  hottest: { anomaly: number; temp: number; lat: number; lng: number } | null;
  coolest: { anomaly: number; temp: number; lat: number; lng: number } | null;
};

/** Heat walk anomaly along a line. Each sample takes the nearest heat cell within `r` metres. */
export function heatAlong(line: LatLng[], r = 45): HeatSummary {
  const samples = sampleLine(line, 40);
  const box = boxOf(line, r);
  const cells = HEAT.filter((c) => inBox(box, c[0], c[1]));
  let covered = 0;
  let sum = 0;
  let hottest: HeatCell | null = null;
  let coolest: HeatCell | null = null;
  for (const s of samples) {
    let best: HeatCell | null = null;
    let bestD = r;
    for (const c of cells) {
      const d = distM(s, [c[0], c[1]]);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      covered++;
      sum += best[2];
      if (!hottest || best[2] > hottest[2]) hottest = best;
      if (!coolest || best[2] < coolest[2]) coolest = best;
    }
  }
  const pick = (c: HeatCell | null) => (c ? { anomaly: c[2], temp: c[3], lat: c[0], lng: c[1] } : null);
  return {
    covered: samples.length ? covered / samples.length : 0,
    avg: covered ? Math.round((sum / covered) * 10) / 10 : null,
    hottest: pick(hottest),
    coolest: pick(coolest),
  };
}

export function nearestTrees(lat: number, lng: number, r: number) {
  return TREES.filter((t) => distM([lat, lng], [t.lat, t.lng]) <= r);
}

export function nearestWater(lat: number, lng: number) {
  let best: Water | null = null;
  let bestD = Infinity;
  for (const w of WATER) {
    const d = distM([lat, lng], [w.lat, w.lng]);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best ? { water: best, m: Math.round(bestD) } : null;
}

export function fmtAnomaly(a: number) {
  const v = Math.abs(a).toFixed(1);
  if (a > 0) return `+${v} °C`;
  if (a < 0) return `-${v} °C`;
  return "0.0 °C";
}
