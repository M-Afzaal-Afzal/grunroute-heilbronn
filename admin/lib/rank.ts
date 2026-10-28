// Street ranking for the Planner, same rules as the people app: percentiles
// over streets, streets under 20 m are not listed, "enough data only" hides
// Low support rows from lists (never from maps).
import { enoughData, rankSegments, rankableSegments, type Preset, type Scored, type Street, type Segment, type Percentiles } from "./shared/priority";
import type { PlannerData } from "./data";

export type Level = "streets" | "segments";
export type RankedRow = Scored & { rank: number | null };

const memo = new WeakMap<PlannerData, Map<string, RankedRow[]>>();

/** Ranks streets (or segments) for a preset. rank counts only listable rows (score, 20 m+, enough data when asked). */
export function rankFor(data: PlannerData, preset: Pick<Preset, "weights" | "schoolBoost" | "gapOnly">, code: string, level: Level = "streets", enoughOnly = true): RankedRow[] {
  let byKey = memo.get(data);
  if (!byKey) memo.set(data, (byKey = new Map()));
  const key = `${level}|${code}|${enoughOnly ? 1 : 0}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const rows: Segment[] = level === "streets" ? data.streets : data.segments;
  const pct: Percentiles = level === "streets" ? data.streetPct : data.segPct;
  const scored = rankSegments(rows, preset, pct);
  let n = 0;
  const out = scored.map((x) => {
    const listable = x.score != null && x.seg.length >= 20 && (!enoughOnly || enoughData(x));
    return { ...x, rank: listable ? ++n : null };
  });
  byKey.set(key, out);
  return out;
}

export const listable = (rows: RankedRow[]) => rows.filter((r) => r.rank != null);
export const isStreet = (s: Segment): s is Street => "segIds" in s;
export { rankableSegments };
