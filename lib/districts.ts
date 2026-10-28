// District league for the people app: data about streets, not people.
// Measured share and trusted share come from segments.json (streets after
// aggregateStreets), crown cover along streets from the tree register values
// joined to each street, species mix from the tree register itself.
// Type imports only, so the tests can load this file on its own. The three
// values below match lib/priority.ts, and tests/districts.test.mjs checks that.
import type { Street } from "./priority";
import type { DistrictMix } from "./species";

export const TRUSTED = 20; // TRUSTED_PASSES
export const MIN_LENGTH_M = 20; // MIN_SEGMENT_M
/** Sensor measures in MEASURES, the street coverage keys that come from a sensor. */
export const SENSOR_KEYS = ["safety", "heat", "dust", "rough", "stopgo"] as const;
/** Same as districtLabel in lib/priority.ts. */
export const districtLabel = (d: string | null | undefined) => (d == null ? "Heilbronn" : d === "Heilbronn" ? "Kernstadt (Heilbronn)" : d);

export type DistrictRow = {
  label: string;
  streets: number;
  /** Streets with at least one sensor reading. */
  measured: number;
  /** Streets with TRUSTED or more recorded overtakes. */
  trusted: number;
  /** Length weighted mean crown cover along the streets, 0 to 1. */
  crownCover: number | null;
  mix: DistrictMix | null;
};

export const isMeasured = (s: Pick<Street, "cov">) => SENSOR_KEYS.some((k) => (s.cov[k] ?? 0) > 0);
export const isTrusted = (s: Pick<Street, "cov">) => s.cov.safety >= TRUSTED;

/** The tree register uses its own district names. Both inner city parts belong to the Kernstadt. */
export function treeDistrictLabel(d: string): string | null {
  if (!d) return null;
  if (d === "HN Innenstadt" || d === "HN Äussere Bezirke") return districtLabel("Heilbronn");
  return districtLabel(d);
}

export function districtRows(streets: Street[], mixes: DistrictMix[] = []): DistrictRow[] {
  const by = new Map<string, { streets: number; measured: number; trusted: number; cc: number; ccLen: number }>();
  for (const s of streets) {
    if (s.length < MIN_LENGTH_M) continue;
    const label = districtLabel(s.district);
    const t = by.get(label) ?? { streets: 0, measured: 0, trusted: 0, cc: 0, ccLen: 0 };
    t.streets++;
    if (isMeasured(s)) t.measured++;
    if (isTrusted(s)) t.trusted++;
    if (s.raw.crownCover != null) {
      t.cc += s.raw.crownCover * s.length;
      t.ccLen += s.length;
    }
    by.set(label, t);
  }
  const mixBy = new Map(mixes.map((m) => [m.district, m]));
  return [...by].map(([label, t]) => ({
    label,
    streets: t.streets,
    measured: t.measured,
    trusted: t.trusted,
    crownCover: t.ccLen ? t.cc / t.ccLen : null,
    mix: mixBy.get(label) ?? null,
  }));
}

export type SortKey = "name" | "measured" | "trusted" | "crown" | "streets";

export function sortRows(rows: DistrictRow[], key: SortKey): DistrictRow[] {
  const share = (n: number, d: number) => (d ? n / d : 0);
  const val = (r: DistrictRow) =>
    key === "measured" ? share(r.measured, r.streets) : key === "trusted" ? share(r.trusted, r.streets) : key === "crown" ? (r.crownCover ?? -1) : r.streets;
  return [...rows].sort((a, b) => (key === "name" ? a.label.localeCompare(b.label, "de") : val(b) - val(a) || a.label.localeCompare(b.label, "de")));
}

/** District progress for Help measure: the share of streets with trusted data. Never from clicks. */
export function trustedShare(streets: Street[]): Map<string, { trusted: number; streets: number }> {
  const out = new Map<string, { trusted: number; streets: number }>();
  for (const r of districtRows(streets)) out.set(r.label, { trusted: r.trusted, streets: r.streets });
  return out;
}
