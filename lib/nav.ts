// Turn by turn help for a chosen route: where the phone is on the route, the
// next turn, the words to speak, and when the phone has left the route.
// Pure functions only, so they run in tests. The browser parts (location,
// voice, sounds, wake lock) live in lib/useNavigation.ts.
//
// Turn steps come from OSRM (routing.openstreetmap.de, steps=true). The
// location never leaves the browser, these functions only compare it with the
// route line that is already on the phone.
//
// Text functions take the page language as their last parameter. English is
// the default and its wording stays as it was. Only a type import from i18n,
// so the tests can load this file in plain Node.

import type { Lang } from "./i18n";

/** Same tags as LOCALE in lib/i18n.ts, kept here so this file has no runtime import. */
const NUM_LOCALE: Record<Lang, string> = { en: "en-GB", de: "de-DE" };

export type LatLng = [number, number];

/** One manoeuvre from OSRM, cut down to what the app needs. */
export type NavStep = {
  type: string;
  modifier?: string;
  name: string;
  /** Roundabout exit number, when OSRM gives one. */
  exit?: number;
  lat: number;
  lng: number;
};

const KY = 111_200;
const KX = 111_320 * Math.cos((49.14 * Math.PI) / 180);

export function dist(a: LatLng, b: LatLng) {
  const dx = (a[1] - b[1]) * KX;
  const dy = (a[0] - b[0]) * KY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance along the line at each vertex, in metres. */
export function cumulative(line: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + dist(line[i - 1], line[i]));
  return out;
}

export type Fix = { along: number; off: number; idx: number };

/** Nearest point on the line: metres along it, metres off it, and the segment index. */
export function project(p: LatLng, line: LatLng[], cum: number[]): Fix {
  if (line.length === 1) return { along: 0, off: dist(p, line[0]), idx: 0 };
  let best: Fix = { along: 0, off: Infinity, idx: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ax = (a[1] - p[1]) * KX;
    const ay = (a[0] - p[0]) * KY;
    const dx = (b[1] - a[1]) * KX;
    const dy = (b[0] - a[0]) * KY;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const x = ax + t * dx;
    const y = ay + t * dy;
    const off = Math.sqrt(x * x + y * y);
    if (off < best.off) best = { along: cum[i] + t * Math.sqrt(len2), off, idx: i };
  }
  return best;
}

/** Compass bearing from a to b in degrees: 0 is north, 90 is east. */
export function bearing(a: LatLng, b: LatLng): number {
  const deg = (Math.atan2((b[1] - a[1]) * KX, (b[0] - a[0]) * KY) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** From this speed in m/s the phone's own heading is steady enough to trust. */
export const HEADING_SPEED = 1;
/** Within this many metres of the line, the arrow may follow the route instead. */
export const HEADING_NEAR_M = 25;

/**
 * Which way the arrow on the dot points. The phone's own heading when it is
 * moving, else the way the route goes at the dot when the dot is on it, else
 * the last heading we had.
 */
export function headingFor(phone: number | null, speed: number | null, line: LatLng[], fix: Fix, prev: number | null): number | null {
  if (phone != null && Number.isFinite(phone) && speed != null && speed >= HEADING_SPEED) return phone;
  if (fix.off <= HEADING_NEAR_M && line.length > 1) {
    const i = Math.min(fix.idx, line.length - 2);
    return bearing(line[i], line[i + 1]);
  }
  return prev;
}

/** Cut the line at a distance along it: the part already covered, and the part still ahead. */
export function splitAt(line: LatLng[], cum: number[], along: number): { done: LatLng[]; ahead: LatLng[] } {
  if (line.length < 2 || along <= 0) return { done: [], ahead: line };
  if (along >= cum[cum.length - 1]) return { done: line, ahead: [] };
  let i = 0;
  while (i < line.length - 2 && cum[i + 1] < along) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg ? (along - cum[i]) / seg : 0;
  const at: LatLng = [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])];
  return { done: [...line.slice(0, i + 1), at], ahead: [at, ...line.slice(i + 1)] };
}

/** Where each step sits along the line, in metres. Searches forward, so a route that passes a spot twice keeps its order. */
export function stepAlongs(steps: NavStep[], line: LatLng[], cum: number[]): number[] {
  let from = 0;
  return steps.map((s) => {
    let bestI = from;
    let bestD = Infinity;
    for (let i = from; i < line.length; i++) {
      const d = dist([s.lat, s.lng], line[i]);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    from = bestI;
    return cum[bestI];
  });
}

const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const onto = (name: string) => (name ? ` onto ${name}` : "");
const side = (m?: string) => (m && m.includes("left") ? "left" : m && m.includes("right") ? "right" : "");

function turnWord(m?: string) {
  switch (m) {
    case "left":
    case "right":
      return `turn ${m}`;
    case "slight left":
    case "slight right":
      return `bear ${side(m)}`;
    case "sharp left":
    case "sharp right":
      return `turn sharp ${side(m)}`;
    case "uturn":
      return "make a U-turn";
    default:
      return "continue straight";
  }
}

/** Plain words for a step, starting with a capital letter. */
export function instruction(s: NavStep, lang: Lang = "en"): string {
  if (lang === "de") return cap(phraseDe(s));
  let t: string;
  switch (s.type) {
    case "depart":
      t = s.name ? `Start on ${s.name}` : "Start along the route";
      break;
    case "arrive":
      t = "Arrive at your destination";
      break;
    case "roundabout":
    case "rotary":
      t = s.exit && s.exit <= ORDINAL.length ? `At the roundabout, take the ${ORDINAL[s.exit - 1]} exit${onto(s.name)}` : `At the roundabout, follow the route${onto(s.name)}`;
      break;
    case "fork":
      t = `Keep ${side(s.modifier) || "straight"}${onto(s.name)}`;
      break;
    case "end of road":
      t = `At the end of the road, ${turnWord(s.modifier)}${onto(s.name)}`;
      break;
    case "merge":
      t = `Merge${side(s.modifier) ? ` ${side(s.modifier)}` : ""}${onto(s.name)}`;
      break;
    case "new name":
    case "continue":
      t = s.modifier && s.modifier !== "straight" ? `${turnWord(s.modifier)}${onto(s.name)}` : `Continue${onto(s.name)}`;
      break;
    default:
      t = `${turnWord(s.modifier)}${onto(s.name)}`;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// German wording, in the short form a navigation voice uses: "links abbiegen auf X".
const ontoDe = (name: string) => (name ? ` auf ${name}` : "");
const sideDe = (m?: string) => (side(m) === "left" ? "links" : side(m) === "right" ? "rechts" : "");

function turnWordDe(m?: string) {
  switch (m) {
    case "left":
    case "right":
      return `${sideDe(m)} abbiegen`;
    case "slight left":
    case "slight right":
      return `leicht ${sideDe(m)} halten`;
    case "sharp left":
    case "sharp right":
      return `scharf ${sideDe(m)} abbiegen`;
    case "uturn":
      return "wenden";
    default:
      return "geradeaus weiter";
  }
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** German words for a step, small first letter unless it is a noun, so it fits after "In 100 m". */
function phraseDe(s: NavStep): string {
  let t: string;
  switch (s.type) {
    case "depart":
      t = s.name ? `starte auf ${s.name}` : "folge der Route";
      break;
    case "arrive":
      t = "Ziel erreichen";
      break;
    case "roundabout":
    case "rotary":
      t = s.exit && s.exit <= ORDINAL.length ? `im Kreisverkehr die ${s.exit}. Ausfahrt nehmen${ontoDe(s.name)}` : `im Kreisverkehr der Route folgen${ontoDe(s.name)}`;
      break;
    case "fork":
      t = sideDe(s.modifier) ? `${sideDe(s.modifier)} halten${ontoDe(s.name)}` : `geradeaus weiter${ontoDe(s.name)}`;
      break;
    case "end of road":
      t = `am Ende der Straße ${turnWordDe(s.modifier)}${ontoDe(s.name)}`;
      break;
    case "merge":
      t = `${sideDe(s.modifier) ? `${sideDe(s.modifier)} ` : ""}einfädeln${ontoDe(s.name)}`;
      break;
    case "new name":
    case "continue":
      t = s.modifier && s.modifier !== "straight" ? `${turnWordDe(s.modifier)}${ontoDe(s.name)}` : `weiter${ontoDe(s.name)}`;
      break;
    default:
      t = `${turnWordDe(s.modifier)}${ontoDe(s.name)}`;
  }
  return t;
}

/**
 * The spoken start line, and the step whose early cue it already covers.
 * A route with no turn names no arrival at the start.
 */
export function startLine(steps: NavStep[], lang: Lang = "en"): { text: string; covers: number | null } {
  const at = steps.findIndex((s) => s.type !== "depart");
  const go = lang === "de" ? "Los geht's." : "Starting.";
  if (at < 0 || steps[at].type === "arrive") return { text: lang === "de" ? `${go} Folge der Route.` : `${go} Follow the route.`, covers: null };
  return { text: `${go} ${instruction(steps[at], lang)}.`, covers: at };
}

/** Steps worth a cue. Drops roundabout exits, notices, and a plain "continue" with no new street. */
export function cueSteps(steps: NavStep[]): NavStep[] {
  return steps.filter((s) => {
    if (s.type === "exit roundabout" || s.type === "exit rotary" || s.type === "notification") return false;
    if ((s.type === "continue" || s.type === "new name") && (!s.modifier || s.modifier === "straight") && !s.name) return false;
    return true;
  });
}

/** Rounded the way people say it: 10 m steps up to 100 m, then 50 m, then km. */
export function sayDistance(m: number, lang: Lang = "en"): string {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toLocaleString(NUM_LOCALE[lang])} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
}

export function spoken(s: NavStep, metres: number | null, lang: Lang = "en"): string {
  // German has no comma and keeps nouns capital: "In 100 m links abbiegen", "In 100 m Ziel erreichen".
  if (lang === "de") return metres == null ? cap(phraseDe(s)) : `In ${sayDistance(metres, lang)} ${phraseDe(s)}`;
  const text = instruction(s);
  if (metres == null) return text;
  return `In ${sayDistance(metres)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Cue distances by travel mode: an early cue, and a "now" cue. */
export const CUE = {
  bike: { early: 150, now: 30, arrive: 20 },
  foot: { early: 60, now: 15, arrive: 15 },
} as const;

/** Off route after this many readings in a row more than OFF_ROUTE_M from the line. */
export const OFF_ROUTE_M = 40;
export const OFF_ROUTE_READS = 3;
/** Readings worse than this are ignored for the off route test. */
export const MAX_ACCURACY_M = 80;

export type Cue = { kind: "early" | "now" | "arrive"; step: number; text: string };

export type Progress = {
  along: number;
  off: number;
  /** Index into the cue steps of the next turn, or -1 after the last. */
  next: number;
  toNext: number | null;
  remaining: number;
};

export function progress(fix: Fix, alongs: number[], total: number): Progress {
  // The next step is the first one still ahead. A small margin stops a cue from repeating right at the turn.
  let next = -1;
  for (let i = 0; i < alongs.length; i++)
    if (alongs[i] > fix.along + 5) {
      next = i;
      break;
    }
  return { along: fix.along, off: fix.off, next, toNext: next >= 0 ? alongs[next] - fix.along : null, remaining: Math.max(0, total - fix.along) };
}

/**
 * The cue to give now, if any. `said` holds keys already spoken ("3:early"),
 * so each cue plays once. Depart is never cued, the Start tap covers it.
 */
export function cueFor(p: Progress, steps: NavStep[], mode: keyof typeof CUE, said: Set<string>, lang: Lang = "en"): Cue | null {
  const c = CUE[mode];
  const de = lang === "de";
  if (p.remaining <= c.arrive) return said.has("arrive") ? null : { kind: "arrive", step: steps.length - 1, text: de ? "Du bist angekommen" : "You have arrived" };
  if (p.next < 0 || p.toNext == null) return null;
  const s = steps[p.next];
  if (s.type === "depart") return null;
  if (s.type === "arrive") {
    if (p.toNext <= c.early && p.toNext > c.now && !said.has(`${p.next}:early`)) return { kind: "early", step: p.next, text: de ? `In ${sayDistance(p.toNext, lang)} bist du am Ziel` : `In ${sayDistance(p.toNext)}, you arrive` };
    return null;
  }
  if (p.toNext <= c.now && !said.has(`${p.next}:now`)) return { kind: "now", step: p.next, text: instruction(s, lang) };
  if (p.toNext <= c.early && p.toNext > c.now + 10 && !said.has(`${p.next}:early`)) return { kind: "early", step: p.next, text: spoken(s, p.toNext, lang) };
  return null;
}

/** Counts readings off the line. Returns the new count; off route when it reaches OFF_ROUTE_READS. */
export function offCount(prev: number, off: number, accuracy: number): number {
  if (accuracy > MAX_ACCURACY_M) return prev;
  if (off > OFF_ROUTE_M) return prev + 1;
  if (off < OFF_ROUTE_M * 0.6) return 0;
  return prev;
}

export function fmtDistance(m: number, lang: Lang = "en"): string {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toLocaleString(NUM_LOCALE[lang])} km`;
  return `${Math.round(m / 10) * 10} m`;
}
