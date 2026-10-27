import { STREETS } from "./data";
import type { CityTrees } from "./cityTrees";
import {
  TREES,
  WATER,
  heatAlong,
  lineLengthM,
  pointsNear,
  type DangerPoint,
  type HeatSummary,
  type LatLng,
} from "./geo";

export type Mode = "bike" | "foot";

// Public OSRM servers run by FOSSGIS on OpenStreetMap data.
// Only the start, end, and helper points are sent, never anything about the user.
const OSRM: Record<Mode, string> = {
  bike: "https://routing.openstreetmap.de/routed-bike/route/v1/driving/",
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/driving/",
};

export type RawRoute = { id: string; coords: LatLng[]; distance: number; duration: number };

type OsrmRoute = { distance: number; duration: number; geometry: { coordinates: [number, number][] } };

async function osrm(mode: Mode, pts: LatLng[], alternatives: number, signal: AbortSignal): Promise<RawRoute[]> {
  const path = pts.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(";");
  const alt = alternatives > 0 ? `&alternatives=${alternatives}` : "";
  const res = await fetch(`${OSRM[mode]}${path}?overview=full&geometries=geojson&steps=false${alt}`, { signal });
  if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
  const j = (await res.json()) as { code: string; routes?: OsrmRoute[] };
  if (j.code !== "Ok" || !j.routes) throw new Error(`Routing ${j.code}`);
  return j.routes.map((r, i) => ({
    id: `${pts.length}-${i}-${Math.round(r.distance)}`,
    coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng),
    distance: r.distance,
    duration: r.duration,
  }));
}

/** Share of route a that runs within 25 m of route b. Used to drop near copies. */
function overlap(a: LatLng[], b: LatLng[]) {
  const step = Math.max(1, Math.floor(a.length / 40));
  let hit = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += step) {
    n++;
    if (pointsNear([{ lat: a[i][0], lng: a[i][1] }], b, 25).length) hit++;
  }
  return n ? hit / n : 1;
}

/**
 * Ask OSRM for the direct route, its own alternatives, and four detours
 * through helper points left and right of the straight line. Detours give the
 * scoring a real choice even when OSRM returns a single route.
 */
export async function fetchRouteOptions(a: LatLng, b: LatLng, mode: Mode, signal: AbortSignal): Promise<RawRoute[]> {
  const direct = await osrm(mode, [a, b], 2, signal);
  const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Perpendicular offset in degrees, scaled for the longitude squeeze.
  const dLat = b[0] - a[0];
  const dLng = (b[1] - a[1]) * 0.655;
  const via = [0.18, -0.18, 0.32, -0.32].map((k) => [mid[0] - dLng * k, mid[1] + (dLat * k) / 0.655] as LatLng);
  const detours = await Promise.all(via.map((v) => osrm(mode, [a, v, b], 0, signal).catch(() => [] as RawRoute[])));
  const all = [...direct, ...detours.flat()];
  const fastest = Math.min(...all.map((r) => r.duration));
  const kept: RawRoute[] = [];
  for (const r of all.sort((x, y) => x.duration - y.duration)) {
    // Skip loops and big detours, at most 40 percent or 8 minutes slower.
    if (r.duration > fastest * 1.4 && r.duration - fastest > 120) continue;
    if (r.duration - fastest > 8 * 60) continue;
    if (kept.some((k) => overlap(r.coords, k.coords) > 0.85 && overlap(k.coords, r.coords) > 0.85)) continue;
    kept.push(r);
  }
  return kept.map((r, i) => ({ ...r, id: `r${i}` }));
}

export type RouteMetrics = {
  km: number;
  min: number;
  trees: number; // trees within 20 m (city register) or 25 m (OSM fallback)
  treesPerKm: number;
  bigCrowns: number | null; // register trees with a crown of 8 m or more
  treeSource: "city" | "osm";
  heat: HeatSummary;
  danger: number | null; // ATRAI close pass points within 15 m, null if not loaded
  dangerPerKm: number | null;
  fixStreets: string[]; // ranked fix first streets the route touches
  water: number; // drinking fountains within 100 m
};

export type RouteOption = RawRoute & { metrics: RouteMetrics; score: number; label: "fastest" | "green" | "both" | "other" };

export function measure(r: RawRoute, danger: DangerPoint[] | null, ct: CityTrees | null): RouteMetrics {
  const len = lineLengthM(r.coords) || r.distance;
  const km = len / 1000;
  const cityIds = ct ? ct.nearLine(r.coords, 20) : null;
  const trees = cityIds ? cityIds.length : pointsNear(TREES, r.coords, 25).length;
  const bigCrowns = ct && cityIds ? cityIds.filter((i) => ct.crown[i] >= 8).length : null;
  const heat = heatAlong(r.coords);
  const d = danger ? pointsNear(danger, r.coords, 15).length : null;
  const fixStreets = STREETS.filter((s) => s.coords.some(([la, lo]) => pointsNear([{ lat: la, lng: lo }], r.coords, 20).length)).map((s) => s.name);
  return {
    km: Math.round(km * 10) / 10,
    min: Math.max(1, Math.round(r.duration / 60)),
    trees,
    treesPerKm: km ? Math.round((trees / km) * 10) / 10 : 0,
    bigCrowns,
    treeSource: ct ? "city" : "osm",
    heat,
    danger: d,
    dangerPerKm: d === null || !km ? null : Math.round((d / km) * 10) / 10,
    fixStreets,
    water: pointsNear(WATER, r.coords, 100).length,
  };
}

/**
 * Comfort score, higher is better. Only uses provided or open data:
 * trees per km (city tree register, OSM as fallback), heat walk anomaly (Heat Island Summer School),
 * close pass points per km (ATRAI), and ranked fix first streets.
 * Weights are a simple, documented choice, not a validated model.
 */
export function comfortScore(m: RouteMetrics) {
  const heatPenalty = m.heat.avg === null ? 0 : m.heat.avg * m.heat.covered * 8;
  const dangerPenalty = (m.dangerPerKm ?? 0) * 0.3;
  // Big crowns give most of the shade, so they count double. Scale city
  // register counts down a little, they are much denser than OSM.
  const shade = m.treeSource === "city" ? (m.treesPerKm + (m.bigCrowns ?? 0) / Math.max(m.km, 0.1)) / 3 : m.treesPerKm;
  return shade - heatPenalty - dangerPenalty - m.fixStreets.length * 4;
}

export function rankRoutes(raw: RawRoute[], danger: DangerPoint[] | null, ct: CityTrees | null): RouteOption[] {
  if (!raw.length) return [];
  const scored = raw.map((r) => {
    const metrics = measure(r, danger, ct);
    return { ...r, metrics, score: comfortScore(metrics), label: "other" as RouteOption["label"] };
  });
  const fastest = scored.reduce((a, b) => (b.duration < a.duration ? b : a));
  const green = scored.reduce((a, b) => (b.score > a.score ? b : a));
  fastest.label = "fastest";
  if (green !== fastest) green.label = "green";
  else fastest.label = "both";
  // Show fastest, GrünRoute, and at most one more option.
  const rest = scored.filter((r) => r !== fastest && r !== green).sort((a, b) => b.score - a.score).slice(0, 1);
  return [green, fastest, ...rest].filter((r, i, arr) => arr.indexOf(r) === i);
}
