// Backup router: Valhalla, run by FOSSGIS on OpenStreetMap data, used only
// when the OSRM server does not answer. Its answer is turned into the same
// shape as an OSRM route (line, distance, duration, turn steps), so the route
// comparison and live directions work the same way.
// Only the start, end, and helper points are sent, never anything about the user.
import type { LatLng } from "./geo";
import type { NavStep } from "./nav";

const VALHALLA = "https://valhalla1.openstreetmap.de/route";

export type VhMode = "bike" | "foot";
export type VhRoute = { coords: LatLng[]; distance: number; duration: number; steps: NavStep[] };

type VhManeuver = { type: number; street_names?: string[]; begin_shape_index: number; roundabout_exit_count?: number };
type VhTrip = { summary: { length: number; time: number }; legs: { shape: string; maneuvers: VhManeuver[] }[] };

/** Decode a Valhalla line (Google polyline with 6 decimals) into [lat, lng] points. */
export function decodePolyline6(s: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += next();
    lng += next();
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}

// Valhalla maneuver type number to the OSRM type and modifier that lib/nav.ts reads.
// Types not listed (ferry, transit, elevator, steps, building) read as "continue".
const TYPES: Record<number, [string, string?]> = {
  1: ["depart"],
  2: ["depart"],
  3: ["depart"],
  4: ["arrive"],
  5: ["arrive"],
  6: ["arrive"],
  7: ["new name", "straight"],
  8: ["continue", "straight"],
  9: ["turn", "slight right"],
  10: ["turn", "right"],
  11: ["turn", "sharp right"],
  12: ["turn", "uturn"],
  13: ["turn", "uturn"],
  14: ["turn", "sharp left"],
  15: ["turn", "left"],
  16: ["turn", "slight left"],
  17: ["on ramp", "straight"],
  18: ["on ramp", "right"],
  19: ["on ramp", "left"],
  20: ["off ramp", "right"],
  21: ["off ramp", "left"],
  22: ["fork", "straight"],
  23: ["fork", "right"],
  24: ["fork", "left"],
  25: ["merge", "straight"],
  26: ["roundabout"],
  27: ["exit roundabout"],
  37: ["merge", "right"],
  38: ["merge", "left"],
};

/** Turn steps in the OSRM shape, located at the first point of each maneuver. */
export function valhallaSteps(trip: VhTrip): NavStep[] {
  const out: NavStep[] = [];
  trip.legs.forEach((leg, li) => {
    const shape = decodePolyline6(leg.shape);
    for (const m of leg.maneuvers) {
      const [type, modifier] = TYPES[m.type] ?? ["continue", "straight"];
      if (type === "arrive" && li < trip.legs.length - 1) continue;
      if (type === "depart" && li > 0) continue;
      const p = shape[Math.min(m.begin_shape_index, shape.length - 1)];
      if (!p) continue;
      out.push({ type, modifier, exit: type === "roundabout" ? m.roundabout_exit_count : undefined, name: m.street_names?.[0] ?? "", lat: p[0], lng: p[1] });
    }
  });
  return out;
}

/** One Valhalla trip as a route: the full line, metres, seconds, and turn steps. */
export function valhallaRoute(trip: VhTrip): VhRoute {
  return {
    coords: trip.legs.flatMap((l) => decodePolyline6(l.shape)),
    distance: Math.round(trip.summary.length * 1000),
    duration: trip.summary.time,
    steps: valhallaSteps(trip),
  };
}

/**
 * Ask Valhalla for a route through the points. Helper points in the middle are
 * "through" points, so the route passes them without a stop. GET keeps the
 * request simple, so the browser sends no preflight.
 */
export async function valhalla(mode: VhMode, pts: LatLng[], alternatives: number, signal: AbortSignal): Promise<VhRoute[]> {
  const body = {
    locations: pts.map(([lat, lon], i) => ({ lat: +lat.toFixed(6), lon: +lon.toFixed(6), type: i === 0 || i === pts.length - 1 ? "break" : "through" })),
    costing: mode === "bike" ? "bicycle" : "pedestrian",
    alternates: alternatives,
    directions_type: "maneuvers",
    units: "kilometers",
  };
  const res = await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`, { signal });
  if (!res.ok) throw new Error(`Backup routing HTTP ${res.status}`);
  const j = (await res.json()) as { trip?: VhTrip; alternates?: { trip: VhTrip }[] };
  if (!j.trip) throw new Error("Backup routing gave no route");
  return [j.trip, ...(j.alternates ?? []).map((a) => a.trip)].map(valhallaRoute);
}
