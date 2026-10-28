// The comfort rule that picks GrünRoute among the route options. Kept apart
// from lib/routing.ts so it has no runtime imports and `npm test` can load it.
import type { Lang } from "./i18n";
import type { RouteMetrics, RouteOption } from "./routing";

/**
 * Comfort score, higher is better. Only uses provided or open data:
 * trees per km and big crowns (city tree register, OSM as fallback),
 * heat walk anomaly (Heat Island Summer School), and close pass points per km (ATRAI).
 * Weights are a simple, documented choice, not a validated model.
 */
type ComfortInput = Pick<RouteMetrics, "km" | "treesPerKm" | "bigCrowns" | "treeSource" | "heat" | "dangerPerKm">;
export type ComfortTerm = "shade" | "heat" | "danger";

/** The three parts of the comfort score. The score is their sum. */
export function comfortParts(m: ComfortInput): Record<ComfortTerm, number> {
  const heatPenalty = m.heat.avg === null ? 0 : m.heat.avg * m.heat.covered * 8;
  const dangerPenalty = (m.dangerPerKm ?? 0) * 0.3;
  // Big crowns give most of the shade, so they count double. Scale city
  // register counts down a little, they are much denser than OSM.
  const shade = m.treeSource === "city" ? (m.treesPerKm + (m.bigCrowns ?? 0) / Math.max(m.km, 0.1)) / 3 : m.treesPerKm;
  return { shade, heat: -heatPenalty, danger: -dangerPenalty };
}

export function comfortScore(m: ComfortInput) {
  const p = comfortParts(m);
  return p.shade + p.heat + p.danger;
}

/**
 * Route names, from the same rule. A route is named after the part of the
 * comfort score where it beats the other route by the most: more shade gives
 * "Shady route", cooler heat walk spots give "Cooler route", fewer close pass
 * points give "Fewer close passes". We never say "quiet", because we have no
 * traffic data. This is a simple rule on our data, not an official rating.
 */
export const ROUTE_THEME: Record<ComfortTerm, string> = {
  shade: "Shady route",
  heat: "Cooler route",
  danger: "Fewer close passes",
};

/** The same route names per language. English is ROUTE_THEME. */
export const ROUTE_THEMES: Record<Lang, Record<ComfortTerm, string>> = {
  en: ROUTE_THEME,
  de: {
    shade: "Schattige Route",
    heat: "Kühlere Route",
    danger: "Weniger enge Überholungen",
  },
};

/** The part of the comfort rule where route a beats route b the most, or null if a is not better on any part. */
export function mainGain(a: ComfortInput, b: ComfortInput): ComfortTerm | null {
  const pa = comfortParts(a);
  const pb = comfortParts(b);
  let best: ComfortTerm | null = null;
  let gap = 1e-9;
  for (const k of ["shade", "heat", "danger"] as const) {
    if (pa[k] - pb[k] > gap) {
      gap = pa[k] - pb[k];
      best = k;
    }
  }
  return best;
}

type Scored = Pick<RouteOption, "duration" | "score" | "label">;

/** Label the fastest and the most comfortable route. Show fastest, GrünRoute, and at most one more option. */
export function labelRoutes<T extends Scored>(scored: T[]): T[] {
  if (!scored.length) return [];
  const fastest = scored.reduce((a, b) => (b.duration < a.duration ? b : a));
  const green = scored.reduce((a, b) => (b.score > a.score ? b : a));
  fastest.label = "fastest";
  if (green !== fastest) green.label = "green";
  else fastest.label = "both";
  const rest = scored.filter((r) => r !== fastest && r !== green).sort((a, b) => b.score - a.score).slice(0, 1);
  return [green, fastest, ...rest].filter((r, i, arr) => arr.indexOf(r) === i);
}
