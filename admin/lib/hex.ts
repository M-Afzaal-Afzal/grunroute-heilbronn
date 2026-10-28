// H3 heat map layers for the Planner. Point layers come from the hex files
// built by scripts/build-hex.mjs. Crashes and the fix score are binned here,
// because they follow the filters and the chosen weights.
import { latLngToCell } from "h3-js";
import type { Segment } from "./shared/priority";
import { CAMPAIGN } from "./shared/data";
import { DATA_BUILT } from "./shared/build-info";

export type HexRow = [number | null, number, number, number, number | null, number, number[] | null, number, number, number | null, number];
export type HexFile = { res: number; built: string; fields: string[]; notes: string[]; cells: Record<string, HexRow> };
export type Crash = { lat: number; lng: number; year: number; category: number; bike: boolean; foot: boolean; hour: number; month: number; light: number; type: number };
export type CrashFile = { source: string; years: number[]; crashes: Crash[] };

export type LayerKey = "heat" | "pass" | "dust" | "crash" | "crown" | "cover" | "score";

/** Cells with fewer points than this are hidden on averaged layers. */
export const MIN_POINTS = 5;

export type LayerDef = {
  key: LayerKey;
  label: string;
  unit: string;
  /** Averaged layers hide cells with fewer than MIN_POINTS points. Counts never hide. */
  averaged: boolean;
  points: string;
  /** One point, singular, for "every cell with at least one ...". */
  one: string;
  date: string;
  source: string;
  fmt: (v: number) => string;
};

const campaign = `${CAMPAIGN.from} to ${CAMPAIGN.to}`;
export const LAYERS: LayerDef[] = [
  { key: "heat", label: "Heat walk anomaly", unit: "°C against the same walk", averaged: true, points: "heat walk readings", one: "reading", date: "1 to 3 Sep 2026", source: "Heat Island Summer School heat walks", fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} °C` },
  { key: "pass", label: "Close passes", unit: "passes under 150 cm per cell", averaged: true, points: "measured passes", one: "pass", date: campaign, source: "ATRAI overtaking distance", fmt: (v) => `${Math.round(v)}` },
  { key: "dust", label: "Danger and dust", unit: "mean risk index, 0 to 1", averaged: true, points: "sensor points", one: "point", date: campaign, source: "ATRAI danger zones PM", fmt: (v) => v.toFixed(2) },
  { key: "crash", label: "Crashes", unit: "injury crashes with a bike or person on foot", averaged: false, points: "crashes", one: "crash", date: "2021 to 2025", source: "Unfallatlas, dl-de/by-2-0", fmt: (v) => `${Math.round(v)}` },
  { key: "crown", label: "Crown cover", unit: "% of the cell under a register crown, approximate", averaged: false, points: "register trees", one: "tree", date: "Stand 01.01.2026", source: "Stadt Heilbronn Baumkataster, dl-de/by-2-0", fmt: (v) => `${v.toFixed(0)}%` },
  { key: "cover", label: "Data coverage", unit: "% of street length with a bike sensor measure", averaged: false, points: "street segments", one: "segment", date: `built ${DATA_BUILT ?? "unknown"}`, source: "ATRAI segments, GrünRoute build", fmt: (v) => `${Math.round(v)}%` },
  { key: "score", label: "Mean fix score", unit: "length weighted mean, 0 to 100, active preset", averaged: true, points: "scored segments", one: "segment", date: `built ${DATA_BUILT ?? "unknown"}`, source: "GrünRoute fix score", fmt: (v) => `${Math.round(v)}` },
];
export const layerDef = (k: string) => LAYERS.find((l) => l.key === k) ?? LAYERS[0];

export type CellValue = { v: number; n: number; note?: string };
export type LayerResult = { values: Map<string, CellValue>; hidden: number; domain: [number, number] };

export type LayerCtx = {
  hex: HexFile;
  res: number;
  crashes: Crash[] | null;
  year: string;
  mode: string;
  threshold: number;
  /** Segment scores for the active preset, by segment id. */
  scores: Map<number, number> | null;
  segCells: Map<string, Segment[]>;
};

/** Segments grouped by the H3 cell of their middle point. */
export function segmentCells(segments: Segment[], res: number) {
  const out = new Map<string, Segment[]>();
  for (const s of segments) {
    const [lat, lng] = s.g[Math.floor(s.g.length / 2)];
    const id = latLngToCell(lat, lng, res);
    const list = out.get(id);
    if (list) list.push(s);
    else out.set(id, [s]);
  }
  return out;
}

export const crashMatch = (c: Crash, year: string, mode: string) =>
  (year === "all" || c.year === Number(year)) && (mode === "all" || (mode === "bike" ? c.bike : c.foot));

/** Share of dust points at or above a threshold, from the 10 bin histogram. */
const aboveShare = (hist: number[], t: number) => {
  const from = Math.round(t * 10);
  const n = hist.reduce((a, b) => a + b, 0);
  return n ? (hist.slice(from).reduce((a, b) => a + b, 0) / n) * 100 : 0;
};

export function computeLayer(key: LayerKey, ctx: LayerCtx): LayerResult {
  const values = new Map<string, CellValue>();
  const raw: Array<[string, number, number]> = [];
  if (key === "crash") {
    for (const c of ctx.crashes ?? []) {
      if (!crashMatch(c, ctx.year, ctx.mode)) continue;
      const id = latLngToCell(c.lat, c.lng, ctx.res);
      const cur = values.get(id);
      if (cur) cur.v = cur.n = cur.n + 1;
      else values.set(id, { v: 1, n: 1 });
    }
  } else if (key === "score") {
    for (const [id, segs] of ctx.segCells) {
      let sum = 0, len = 0, n = 0;
      for (const s of segs) {
        const sc = ctx.scores?.get(s.id);
        if (sc == null) continue;
        sum += sc * s.length;
        len += s.length;
        n++;
      }
      if (n) raw.push([id, sum / len, n]);
    }
  } else {
    for (const [id, r] of Object.entries(ctx.hex.cells)) {
      if (key === "heat" && r[0] != null) raw.push([id, r[0], r[1]]);
      else if (key === "pass" && r[3] > 0) raw.push([id, r[2], r[3]]);
      else if (key === "dust" && r[4] != null) raw.push([id, ctx.threshold > 0 && r[6] ? aboveShare(r[6], ctx.threshold) : r[4], r[5]]);
      else if (key === "crown" && r[7] > 0) raw.push([id, r[8], r[7]]);
      else if (key === "cover" && r[9] != null) raw.push([id, r[9] * 100, r[10]]);
    }
  }
  const def = layerDef(key);
  let hidden = 0;
  for (const [id, v, n] of raw) {
    if (def.averaged && n < MIN_POINTS) {
      hidden++;
      continue;
    }
    values.set(id, { v, n });
  }
  const sorted = [...values.values()].map((x) => x.v).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  // Averaged layers stretch over the middle 90% of cells, counts start at 0.
  let domain: [number, number] = def.averaged ? [q(0.05), q(0.95)] : [0, Math.max(1, q(0.95))];
  if (domain[1] <= domain[0]) domain = [domain[0], domain[0] + 1];
  return { values, hidden, domain };
}

export const dustUnit = (t: number) => (t > 0 ? `% of sensor points with risk ${t.toFixed(1)} or more` : "mean risk index, 0 to 1");
