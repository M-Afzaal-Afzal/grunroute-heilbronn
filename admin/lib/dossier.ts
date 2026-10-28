// Everything the street dossier and its print pages show about one street,
// read from the build output (segments.json, crashes.json, schools.json,
// the tree register and the heat walk cells). Nothing here is typed in.
import { MEASURES, PRESETS, type MeasureKey, type Street } from "./shared/priority";
import { distToLine, HEAT, type LatLng } from "./shared/geo";
import type { CityTrees } from "./shared/cityTrees";
import { rankFor } from "./rank";
import type { PlannerData } from "./data";
import type { Crash } from "./hex";

export type School = { lat: number; lng: number; type: string; name: string | null; osm: string };
export type SchoolFile = { source: string; osmBase: string; schools: School[] };
export type CrashFile = { source: string; years: number[]; crashes: Crash[] };

/** Radii used on the dossier, in metres. */
export const NEAR = { crash: 25, heat: 60, pass: 25, school: 300, tree: 50 } as const;

/** Unfallatlas UKATEGORIE: 1 killed, 2 seriously injured, 3 slightly injured. */
export const SEVERITY = ["Killed", "Seriously injured", "Slightly injured"] as const;

/**
 * ATRAI "Overtaking Distance Counts" has five bins. ATRAI does not document
 * the edges in the files we have. 50 cm steps fit the stated average distance
 * on 1,387 of 1,388 measured segments, and the build counts the first three
 * bins as "under 150 cm". So the labels below are read from the data.
 */
export const PASS_BINS = ["0 to 50", "50 to 100", "100 to 150", "150 to 200", "200+"];
export const PASS_BIN_NOTE =
  "Bin edges are read from the data: 50 cm steps fit the average distance on 1,387 of 1,388 measured segments. ATRAI does not state them in the files we have.";

const minDist = (p: LatLng, lines: LatLng[][]) => Math.min(...lines.map((l) => distToLine(p, l)));

export function crashesNear(lines: LatLng[][], crashes: Crash[]) {
  return crashes.filter((c) => minDist([c.lat, c.lng], lines) <= NEAR.crash);
}

/** Heat walk cells within NEAR.heat: [lat, lng, anomaly, temp, points]. */
export function heatNear(lines: LatLng[][]) {
  return HEAT.filter((h) => minDist([h[0], h[1]], lines) <= NEAR.heat);
}

export function schoolsNear(lines: LatLng[][], schools: School[]) {
  return schools
    .map((s) => ({ ...s, d: minDist([s.lat, s.lng], lines) }))
    .filter((s) => s.d <= NEAR.school)
    .sort((a, b) => a.d - b.d);
}

export function treesNear(lines: LatLng[][], trees: CityTrees, r: number = NEAR.tree): number[] {
  const ids = new Set<number>();
  for (const l of lines) for (const i of trees.nearLine(l, r)) ids.add(i);
  return [...ids];
}

/** Species counts, largest first, the rest folded into "Other species". */
export function speciesMix(ids: number[], trees: CityTrees, top = 8) {
  const by = new Map<string, number>();
  for (const i of ids) {
    const n = trees.get(i).name;
    by.set(n, (by.get(n) ?? 0) + 1);
  }
  const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const rows = sorted.slice(0, top).map(([name, n]) => ({ name, n }));
  const rest = sorted.slice(top).reduce((a, [, n]) => a + n, 0);
  if (rest) rows.push({ name: `Other species (${sorted.length - top})`, n: rest });
  return { rows, species: sorted.length };
}

/** Crashes per year, split by severity, for every year in the file. */
export function crashesByYear(near: Crash[], years: number[]) {
  return years.map((year) => {
    const row: Record<string, number> = { year };
    SEVERITY.forEach((label, i) => (row[label] = near.filter((c) => c.year === year && c.category === i + 1).length));
    return row;
  });
}

/** Rank of this street under every preset, with the same list rules as Fix first. */
export function ranksByPreset(data: PlannerData, street: Street) {
  return PRESETS.map((p) => {
    const rows = rankFor(data, p, p.id, "streets", true);
    const row = rows.find((r) => r.seg.id === street.id) ?? null;
    return { id: p.id, label: p.label, rank: row?.rank ?? null, score: row?.score ?? null, listed: rows.filter((r) => r.rank != null).length };
  });
}

/** Percentile of this street among streets with a value, 0 to 100. */
export function percentileOf(data: PlannerData, street: Street, key: MeasureKey) {
  const v = street.m[key];
  if (v == null) return null;
  const p = data.streetPct[key].get(v);
  return p == null ? null : Math.round(p * 100);
}

export const measureLabel = (k: MeasureKey) => MEASURES.find((m) => m.key === k)!.label;
