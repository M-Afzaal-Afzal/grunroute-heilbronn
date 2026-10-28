// Tree what-if: add N street trees along a street and see the little shade
// measure, score and rank move. Every crown size here is an assumption, kept
// in one place and labelled so in the UI. Other streets keep their scores.
import { scoreSegment, SHADE_HOUR_INDEX, type Preset, type Street } from "./shared/priority";
import { bandFor } from "./shared/data";
import { rankFor, listable } from "./rank";
import type { PlannerData } from "./data";

/** Crown diameter of a new street tree, in metres. Assumption, not register data. */
export const CROWN_STAGES = [
  { id: "now", label: "At planting", crown: 3 },
  { id: "y10", label: "In 10 years", crown: 8 },
  { id: "y25", label: "In 25 years", crown: 12 },
] as const;
export type StageId = (typeof CROWN_STAGES)[number]["id"];

/** Same buffer as scripts/build-segments.mjs: 15 m each side plus round ends. */
const bufferArea = (length: number) => 2 * 15 * length + Math.PI * 15 * 15;

export const maxTrees = (length: number, spacing: number) => Math.max(1, Math.floor(length / Math.max(spacing, 1)) + 1);

export type WhatIf = {
  stage: (typeof CROWN_STAGES)[number];
  trees: number;
  crownCover: number;
  shade15: number | null;
  shadeGap: number;
  score: number | null;
  rank: number | null;
  band: string | null;
};

/** Share of other streets with a lower value, the same rule as lib/priority.ts. */
function percentileAmong(values: number[], x: number) {
  const lower = values.filter((v) => v < x).length;
  return values.length > 0 ? lower / values.length : 0.5;
}

export function whatIf(data: PlannerData, preset: Pick<Preset, "weights" | "schoolBoost" | "gapOnly">, code: string, street: Street, trees: number, spacing: number): WhatIf[] {
  const n = Math.min(trees, maxTrees(street.length, spacing));
  const others = data.streets.filter((s) => s.id !== street.id && s.m.shadeGap != null).map((s) => s.m.shadeGap as number);
  const rows = listable(rankFor(data, preset, code, "streets", true));
  const me = rows.find((r) => r.seg.id === street.id);
  return CROWN_STAGES.map((stage) => {
    const area = n * Math.PI * (stage.crown / 2) ** 2;
    const crownCover = Math.min(1, (street.raw.crownCover ?? 0) + area / bufferArea(street.length));
    const shadeNow = street.raw.shade?.[SHADE_HOUR_INDEX] ?? null;
    // Crowns in a row shade at most their own width of the line each.
    const covered = Math.min(1, (n * Math.min(stage.crown, spacing)) / Math.max(street.length, 1));
    const shade15 = shadeNow == null ? null : Math.min(1, shadeNow + (1 - shadeNow) * covered);
    const shadeGap = Math.round((shade15 != null ? 1 - shade15 : 1 - crownCover) * 1000) / 1000;

    const pct = { ...data.streetPct, shadeGap: new Map(data.streetPct.shadeGap) };
    pct.shadeGap.set(shadeGap, percentileAmong(others, shadeGap));
    const scored = scoreSegment({ ...street, m: { ...street.m, shadeGap } }, pct, preset);
    let rank: number | null = null;
    if (me && scored.score != null) {
      const s = scored.score;
      rank = 1 + rows.filter((r) => r.seg.id !== street.id && r.score != null && (r.score > s || (r.score === s && (r.supportCount > scored.supportCount || (r.supportCount === scored.supportCount && r.seg.id < street.id))))).length;
    }
    return { stage, trees: n, crownCover, shade15, shadeGap, score: scored.score, rank, band: scored.score != null ? bandFor(scored.score).label : null };
  });
}

/** Cooling figures shown as ranges only. Sources as named in the project brief, links not yet confirmed. */
export const COOLING = [
  { text: "10% more tree canopy is about 0.3 °C cooler air.", source: "World Resources Institute (WRI), as cited in the project brief" },
  { text: "Felt temperature in tree shade is 2 to 8 °C lower than in the sun.", source: "Range from the project brief, source not yet confirmed" },
  { text: "A mature lime tree gives up to about 2.3 kW of cooling.", source: "Technical University of Munich (TUM), as cited in the project brief" },
] as const;
