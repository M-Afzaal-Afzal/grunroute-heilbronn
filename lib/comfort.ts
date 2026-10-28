// The comfort rule that picks GrünRoute among the route options. Kept apart
// from lib/routing.ts so it has no runtime imports and `npm test` can load it.
import type { RouteMetrics, RouteOption } from "./routing";

/**
 * Comfort score, higher is better. Only uses provided or open data:
 * trees per km and big crowns (city tree register, OSM as fallback),
 * heat walk anomaly (Heat Island Summer School), and close pass points per km (ATRAI).
 * Weights are a simple, documented choice, not a validated model.
 */
export function comfortScore(m: Pick<RouteMetrics, "km" | "treesPerKm" | "bigCrowns" | "treeSource" | "heat" | "dangerPerKm">) {
  const heatPenalty = m.heat.avg === null ? 0 : m.heat.avg * m.heat.covered * 8;
  const dangerPenalty = (m.dangerPerKm ?? 0) * 0.3;
  // Big crowns give most of the shade, so they count double. Scale city
  // register counts down a little, they are much denser than OSM.
  const shade = m.treeSource === "city" ? (m.treesPerKm + (m.bigCrowns ?? 0) / Math.max(m.km, 0.1)) / 3 : m.treesPerKm;
  return shade - heatPenalty - dangerPenalty;
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
