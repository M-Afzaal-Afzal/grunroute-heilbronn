// "Hot or not?": pairs of real heat walk spots (Heat Island Summer School,
// 1 to 3 Sep 2026). Each value is the spot's difference from the middle value
// of its own walk, so the game asks which spot ran warmer on its walk.
import type { HeatCell } from "./heat-walks";

export type Spot = { index: number; lat: number; lng: number; anomaly: number; points: number };
export type Round = [Spot, Spot];

/** The two spots in a round differ by at least this much, in degrees. */
export const MIN_GAP = 0.8;
/** Spots with fewer readings are left out, one walker passing once is too thin. */
export const MIN_POINTS = 20;
/** The two spots should not be next door to each other. */
export const MIN_APART_M = 150;
export const ROUNDS = 5;
/** Right answers needed for the Heat detective badge. */
export const DETECTIVE_MIN = 4;

const KY = 111_200;
const KX = 111_320 * Math.cos((49.14 * Math.PI) / 180);
const apart = (a: Spot, b: Spot) => Math.hypot((a.lat - b.lat) * KY, (a.lng - b.lng) * KX);

export function spots(cells: HeatCell[]): Spot[] {
  return cells.flatMap((c, index) => (c[4] >= MIN_POINTS ? [{ index, lat: c[0], lng: c[1], anomaly: c[2], points: c[4] }] : []));
}

/** Small seeded random number maker, so a round set can be repeated in tests. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Rounds of two spots each, no spot used twice, gap and distance rules kept. */
export function pickRounds(cells: HeatCell[], n = ROUNDS, rand: () => number = Math.random): Round[] {
  const pool = spots(cells);
  const used = new Set<number>();
  const out: Round[] = [];
  for (let tries = 0; out.length < n && tries < 4000; tries++) {
    const a = pool[Math.floor(rand() * pool.length)];
    const b = pool[Math.floor(rand() * pool.length)];
    if (!a || !b || a === b || used.has(a.index) || used.has(b.index)) continue;
    if (Math.abs(a.anomaly - b.anomaly) < MIN_GAP || apart(a, b) < MIN_APART_M) continue;
    used.add(a.index);
    used.add(b.index);
    out.push([a, b]);
  }
  return out;
}

export const warmer = (r: Round): 0 | 1 => (r[0].anomaly >= r[1].anomaly ? 0 : 1);
