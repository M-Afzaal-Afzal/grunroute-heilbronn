import { pointsNear, type DangerPoint, type LatLng } from "./geo";
import type { FixStreet, Mode, RawRoute, Step } from "./routing";

// Turn by turn trip, run fully in the browser. Positions are compared with the
// route here and never sent anywhere.

const KY = 111_200;
const KX = 111_320 * Math.cos((49.14 * Math.PI) / 180);

export type Hazard = { along: number; text: string };
export type Track = {
  coords: LatLng[];
  steps: Step[];
  cum: number[]; // metres from the start to each point of the line
  total: number;
  duration: number; // seconds, from the router
  stepAlong: number[]; // metres from the start to each turn
  hazards: Hazard[];
};
export type Fix = { along: number; off: number; idx: number; at: LatLng };

/** Nearest place on the line to p, searched from point `from` onward. */
export function project(t: Pick<Track, "coords" | "cum">, p: LatLng, from = 0): Fix {
  let best: Fix = { along: 0, off: Infinity, idx: 0, at: t.coords[0] };
  for (let i = Math.max(0, from); i < t.coords.length - 1; i++) {
    const a = t.coords[i];
    const b = t.coords[i + 1];
    const ax = (a[1] - p[1]) * KX;
    const ay = (a[0] - p[0]) * KY;
    const dx = (b[1] - a[1]) * KX;
    const dy = (b[0] - a[0]) * KY;
    const len2 = dx * dx + dy * dy;
    const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const x = ax + k * dx;
    const y = ay + k * dy;
    const off = Math.sqrt(x * x + y * y);
    if (off < best.off) {
      best = { off, idx: i, along: t.cum[i] + k * Math.sqrt(len2), at: [a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])] };
    }
  }
  return best;
}

/** Compass bearing of the route at point i, so the arrow can point the way. */
export function bearingAt(coords: LatLng[], i: number) {
  const a = coords[Math.min(i, coords.length - 2)];
  const b = coords[Math.min(i + 1, coords.length - 1)];
  return (Math.atan2((b[1] - a[1]) * KX, (b[0] - a[0]) * KY) * 180) / Math.PI;
}

export function buildTrack(r: RawRoute, mode: Mode, danger: DangerPoint[] | null, fix: FixStreet[] = []): Track {
  const coords = r.coords;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = (coords[i][1] - coords[i - 1][1]) * KX;
    const dy = (coords[i][0] - coords[i - 1][0]) * KY;
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const base = { coords, cum };
  let from = 0;
  const stepAlong = r.steps.map((st) => {
    const f = project(base, [st.lat, st.lng], Math.max(0, from - 2));
    from = f.idx;
    return f.along;
  });
  const hazards: Hazard[] = [];
  // Close pass spots recorded by ATRAI bike sensors, merged when close together.
  if (mode === "bike" && danger) {
    const along = pointsNear(danger, coords, 15)
      .map((d) => project(base, [d.lat, d.lng]).along)
      .sort((a, b) => a - b);
    let last = -Infinity;
    for (const a of along) {
      if (a - last > 60) hazards.push({ along: a, text: "Close pass spot. Bike sensors recorded cars passing close here." });
      last = a;
    }
  }
  // Streets on the current fix first list (top 20).
  for (const s of fix) {
    const near = s.coords.filter(([la, lo]) => pointsNear([{ lat: la, lng: lo }], coords, 20).length);
    if (!near.length) continue;
    hazards.push({
      along: project(base, near[0]).along,
      text: `${s.name} is on the fix first list. ${mode === "bike" ? "Ride with care, cars pass close here." : "Take care when crossing."}`,
    });
  }
  hazards.sort((a, b) => a.along - b.along);
  return { coords, steps: r.steps, cum, total: cum[cum.length - 1] || r.distance, duration: r.duration, stepAlong, hazards };
}

/** Index of the next turn ahead of a point `along` metres into the trip. */
export function nextStep(t: Track, along: number) {
  const i = t.stepAlong.findIndex((a, k) => k > 0 && a > along + 8);
  return i < 0 ? t.steps.length - 1 : i;
}

export type TurnKind = "straight" | "slight-right" | "right" | "sharp-right" | "uturn" | "sharp-left" | "left" | "slight-left" | "roundabout" | "arrive";

export function turnKind(st: Step): TurnKind {
  if (st.type === "arrive") return "arrive";
  if (st.type === "roundabout" || st.type === "rotary" || st.type === "roundabout turn") return "roundabout";
  switch (st.modifier) {
    case "uturn":
      return "uturn";
    case "sharp right":
      return "sharp-right";
    case "right":
      return "right";
    case "slight right":
      return "slight-right";
    case "slight left":
      return "slight-left";
    case "left":
      return "left";
    case "sharp left":
      return "sharp-left";
    default:
      return "straight";
  }
}

const onto = (name: string) => (name ? ` onto ${name}` : "");

/** Plain English instruction for one step. */
export function stepText(st: Step, endName: string) {
  const dir = (st.modifier || "").replace("uturn", "U-turn");
  switch (st.type) {
    case "depart":
      return st.name ? `Start on ${st.name}` : "Start along the path";
    case "arrive":
      return `Arrive at ${endName}`;
    case "roundabout":
    case "rotary":
      return st.exit ? `At the roundabout, take exit ${st.exit}${onto(st.name)}` : `Go through the roundabout${onto(st.name)}`;
    case "roundabout turn":
      return `At the roundabout, turn ${dir}${onto(st.name)}`;
    case "fork":
      return `Keep ${dir.replace("slight ", "")} at the fork${onto(st.name)}`;
    case "merge":
      return `Merge ${dir.replace("slight ", "")}${onto(st.name)}`;
    case "new name":
    case "continue":
      if (st.modifier === "uturn") return `Make a U-turn${onto(st.name)}`;
      if (!st.modifier || st.modifier === "straight") return st.name ? `Continue on ${st.name}` : "Continue straight";
      return `Keep ${dir.replace("slight ", "")}${onto(st.name)}`;
    case "end of road":
      return `At the end of the road, turn ${dir}${onto(st.name)}`;
    default:
      if (st.modifier === "uturn") return `Make a U-turn${onto(st.name)}`;
      if (!st.modifier || st.modifier === "straight") return st.name ? `Go straight onto ${st.name}` : "Go straight";
      return `Turn ${dir}${onto(st.name)}`;
  }
}

export function fmtDist(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km`;
}

export function spokenDist(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} metres`;
  return `${(m / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} kilometres`;
}
