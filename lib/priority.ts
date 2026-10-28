// Fix first scoring for the measured street network (public/data/segments.json).
// Self contained on purpose: no imports, so `node --test` can load it directly.
//
// 1. Normalise: per measure, the percentile of a segment is the share of the
//    other measured segments with a lower value (0 to 1). Ties share a value,
//    so the many streets with 0 crashes all get 0, not a middle rank.
// 2. Score = round(100 x sum(w x p) / sum(w)) over the weighted measures the
//    segment has. In the Safe school routes preset, close passes count 1.5
//    times as much on streets within 300 m of a school or kindergarten.
// 3. Minimum data: at least 2 weighted measures, and at least one of them from
//    a sensor (close passes, heat walks, dust, roughness, stop and go). Tree
//    cover and crash counts exist for every street, so on their own they would
//    rank streets nobody measured. Otherwise the segment is "little data".
// 4. Passing gap only keeps the old rule: 100 minus average gap in cm / 2.

export const MEASURE_KEYS = ["safety", "heat", "shadeGap", "dust", "rough", "stopgo", "crashes"] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];
export type Weights = Record<MeasureKey, number>;

export type Segment = {
  id: number;
  name: string | null;
  /** For unnamed segments: the nearest named ATRAI segment within 60 m, a location hint only. */
  near?: string | null;
  district: string | null;
  length: number;
  m: Record<MeasureKey, number | null> & { gap: number | null; schoolZone: boolean | null };
  cov: Record<Exclude<MeasureKey, "shadeGap">, number>;
  raw: {
    gapCm: number | null;
    passes: number;
    under150: number;
    bins: number[] | null;
    heatSpots: number;
    treesPer100: number | null;
    trees: number;
    crownCover: number | null;
    /** Share of the line in shade on 21 July at 9, 12, 15 and 18 h (Kernstadt only, scripts/build-shade.mjs). */
    shade?: number[] | null;
    dust: number | null;
    roughBoxes: number;
    speedKmh: number | null;
    flow: number | null;
    crashes: number;
    crashesByCat: number[];
    /** [index in crashes.json, category] for each crash within 25 m. Streets use it to count each crash once. */
    crashIds?: [number, number][];
  };
  g: [number, number][];
};

export type SegmentsMeta = {
  built: string;
  segments: number;
  coverage: Record<string, number | null>;
  counts: Record<string, number | number[] | string | null>;
};

/** Plain labels for the sliders and the "Why this street" bar. */
export const MEASURES: { key: MeasureKey; label: string; source: string; sensor: boolean }[] = [
  { key: "safety", label: "Close passes", source: "atrai-overtaking", sensor: true },
  { key: "heat", label: "Hot spots", source: "heat-walks", sensor: true },
  { key: "shadeGap", label: "Little shade", source: "baumkataster", sensor: false },
  { key: "dust", label: "Danger and dust", source: "atrai-pm", sensor: true },
  { key: "rough", label: "Rough surface", source: "atrai-bumpy", sensor: true },
  { key: "stopgo", label: "Stop and go", source: "atrai-flow", sensor: true },
  { key: "crashes", label: "Crashes", source: "unfallatlas", sensor: false },
];

export type PresetId = "balanced" | "cool" | "school" | "air" | "smooth" | "gap";
export type Preset = { id: PresetId; label: string; weights: Weights; schoolBoost?: number; gapOnly?: boolean };

const w = (safety: number, heat: number, shadeGap: number, dust: number, rough: number, stopgo: number, crashes: number): Weights => ({
  safety, heat, shadeGap, dust, rough, stopgo, crashes,
});

/** All preset weights in one place. Order: safety, heat, shadeGap, dust, rough, stopgo, crashes. */
export const PRESETS: Preset[] = [
  { id: "balanced", label: "Balanced", weights: w(1, 1, 1, 1, 1, 1, 1) },
  { id: "cool", label: "Cool streets", weights: w(0, 3, 3, 1, 0, 0, 0) },
  { id: "school", label: "Safe school routes", weights: w(3, 0, 0, 0, 0, 0, 3), schoolBoost: 1.5 },
  { id: "air", label: "Clean air", weights: w(1, 0, 0, 3, 0, 1, 0) },
  { id: "smooth", label: "Smooth riding", weights: w(0, 0, 0, 0, 3, 1, 0) },
  { id: "gap", label: "Passing gap only", weights: w(1, 0, 0, 0, 0, 0, 0), gapOnly: true },
];
export const presetById = (id: string | null | undefined): Preset | undefined => PRESETS.find((p) => p.id === id);

export const MAX_WEIGHT = 3;
export const MIN_MEASURES = 2;
/** Support labels on point counts, as before: High 10+, Medium 3 to 9, Low 1 to 2. */
export type Support = "High" | "Medium" | "Low";
export const supportFor = (n: number): Support | null => (n >= 10 ? "High" : n >= 3 ? "Medium" : n >= 1 ? "Low" : null);
/** README coverage gate, a proposal: 20+ overtakes make a safety ranking trusted. */
export const TRUSTED_PASSES = 20;

export type Part = { key: MeasureKey; weight: number; p: number; points: number };
export type Scored = {
  seg: Segment;
  score: number | null;
  littleData: boolean;
  parts: Part[];
  support: Support | null;
  supportCount: number;
  supportKey: MeasureKey | null;
  gate: "Trusted" | "Indicative" | null;
  weak: boolean;
};

/**
 * Little shade measure: 1 minus the 15:00 shade share where the shade
 * estimate exists (Kernstadt, OSM buildings plus register crowns), else
 * 1 minus the crown cover from the tree register.
 */
export const SHADE_HOUR_INDEX = 2;
export function shadeGapOf(crownCover: number | null, shade: number[] | null | undefined): number | null {
  const s = shade?.[SHADE_HOUR_INDEX];
  if (s != null) return Math.round((1 - s) * 1000) / 1000;
  return crownCover == null ? null : Math.round((1 - crownCover) * 1000) / 1000;
}

export type Percentiles = Record<MeasureKey, Map<number, number>>;

/** Percentile per distinct value: share of the other measured segments with a lower value. */
export function percentiles(segments: Segment[]): Percentiles {
  const out = {} as Percentiles;
  for (const key of MEASURE_KEYS) {
    const vals = segments.map((s) => s.m[key]).filter((v): v is number => v != null).sort((a, b) => a - b);
    const map = new Map<number, number>();
    const n = vals.length;
    for (let i = 0; i < n; i++) if (!map.has(vals[i])) map.set(vals[i], n > 1 ? i / (n - 1) : 0.5);
    out[key] = map;
  }
  return out;
}

const coverageOf = (s: Segment, key: MeasureKey) => (key === "shadeGap" ? 0 : s.cov[key]);

export function scoreSegment(s: Segment, pct: Percentiles, preset: Pick<Preset, "weights" | "schoolBoost" | "gapOnly">): Scored {
  const base = { seg: s, parts: [] as Part[], support: null, supportCount: 0, supportKey: null, gate: null, weak: false };
  if (preset.gapOnly) {
    const gap = s.m.gap;
    if (gap == null) return { ...base, score: null, littleData: true };
    const n = s.cov.safety;
    const support = supportFor(n);
    const score = Math.max(0, Math.min(100, Math.round(100 - gap / 2)));
    return {
      ...base,
      score,
      littleData: false,
      parts: [{ key: "safety", weight: 1, p: score / 100, points: score }],
      support,
      supportCount: n,
      supportKey: "safety",
      gate: n >= TRUSTED_PASSES ? "Trusted" : "Indicative",
      weak: support === "Low",
    };
  }

  const items: { key: MeasureKey; weight: number; p: number }[] = [];
  for (const key of MEASURE_KEYS) {
    let weight = preset.weights[key] || 0;
    const v = s.m[key];
    if (weight <= 0 || v == null) continue;
    if (key === "safety" && preset.schoolBoost && s.m.schoolZone) weight *= preset.schoolBoost;
    items.push({ key, weight, p: pct[key].get(v) ?? 0 });
  }
  const sensors = items.filter((i) => MEASURES.find((m) => m.key === i.key)!.sensor);
  if (items.length < MIN_MEASURES || sensors.length === 0) return { ...base, score: null, littleData: true };

  const wSum = items.reduce((a, i) => a + i.weight, 0);
  const parts = items.map((i) => ({ ...i, points: (100 * i.weight * i.p) / wSum }));
  const score = Math.round(parts.reduce((a, i) => a + i.points, 0));

  // Support comes from the sensor measure that adds the most to the score.
  const top = sensors.slice().sort((a, b) => b.weight * b.p - a.weight * a.p)[0];
  const supportCount = coverageOf(s, top.key);
  const support = supportFor(supportCount);
  const safetyUsed = items.some((i) => i.key === "safety");
  return {
    ...base,
    score,
    littleData: false,
    parts,
    support,
    supportCount,
    supportKey: top.key,
    gate: safetyUsed ? (s.cov.safety >= TRUSTED_PASSES ? "Trusted" : "Indicative") : null,
    weak: support === "Low",
  };
}

/** Scores every segment, best first. Little data segments come last, never dropped. */
export function rankSegments(segments: Segment[], preset: Pick<Preset, "weights" | "schoolBoost" | "gapOnly">, pct: Percentiles = percentiles(segments)): Scored[] {
  return segments
    .map((s) => scoreSegment(s, pct, preset))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.supportCount - a.supportCount || a.seg.id - b.seg.id);
}

/** Weights that match a preset exactly, or null for a custom mix. */
export function presetForWeights(weights: Weights): PresetId | null {
  const hit = PRESETS.find((p) => !p.gapOnly && MEASURE_KEYS.every((k) => p.weights[k] === weights[k]));
  return hit ? hit.id : null;
}

/** Weights as a short string for the URL, e.g. "1111111". */
export const encodeWeights = (weights: Weights) => MEASURE_KEYS.map((k) => weights[k]).join("");
export function decodeWeights(s: string | null | undefined): Weights | null {
  if (!s || !/^[0-3]{7}$/.test(s)) return null;
  return Object.fromEntries(MEASURE_KEYS.map((k, i) => [k, Number(s[i])])) as Weights;
}

// ---------- Street level (Part 0, 28 Oct 2026) ----------
// ATRAI segments are short (median 41 m), so a ranked list of segments shows
// 4 m stubs and many unnamed rows. Streets group segments by name and
// district; unnamed segments group by their location hint ("near") and
// district; segments with neither stay on the maps but are not ranked as a
// street. A street measure is the length weighted mean of its segments,
// coverage counts are summed, and crashes are weighted crashes per 100 m over
// the whole street. Percentiles are then taken over streets, not segments.

/** Segments shorter than this are left out of the segment ranking (they still count in street sums). */
export const MIN_SEGMENT_M = 20;
/** Unfallatlas category weights used in build-segments.mjs: killed 3, seriously injured 2, slightly injured 1. */
export const CRASH_WEIGHTS = [3, 2, 1];

export type Street = Segment & {
  /** Stable key, "name|district" or "near|district". */
  key: string;
  /** Ids of the segments in this street. */
  segIds: number[];
  /** Every segment geometry, for drawing the whole street. */
  lines: [number, number][][];
};

export const streetKey = (s: Pick<Segment, "name" | "near" | "district">): string | null =>
  s.name ? `${s.name}|${s.district ?? ""}` : s.near ? `near:${s.near}|${s.district ?? ""}` : null;

/** Rows long enough for a ranked list (segments or streets). Shorter ones stay on the maps and in street sums. */
export const rankableSegments = <T extends Pick<Segment, "length">>(rows: T[]) => rows.filter((s) => s.length >= MIN_SEGMENT_M);

function lengthMean(segs: Segment[], get: (s: Segment) => number | null | undefined, digits = 3): number | null {
  let sum = 0;
  let len = 0;
  for (const s of segs) {
    const v = get(s);
    if (v == null) continue;
    sum += v * s.length;
    len += s.length;
  }
  if (len === 0) return null;
  const f = 10 ** digits;
  return Math.round((sum / len) * f) / f;
}

const sumOf = (segs: Segment[], get: (s: Segment) => number | null | undefined) => segs.reduce((a, s) => a + (get(s) ?? 0), 0);

/** Crash categories for a group of segments, each crash once. Falls back to summed counts without ids. */
function streetCrashes(segs: Segment[]): number[] {
  if (segs.every((s) => s.raw.crashIds)) {
    const byId = new Map<number, number>();
    for (const s of segs) for (const [id, cat] of s.raw.crashIds!) byId.set(id, cat);
    return [...byId.values()];
  }
  const out: number[] = [];
  for (const s of segs) (s.raw.crashesByCat ?? []).forEach((n, i) => out.push(...Array<number>(n).fill(i + 1)));
  return out;
}

/** Groups segments into streets. Segments with no name and no location hint are left out. */
export function aggregateStreets(segments: Segment[]): Street[] {
  const groups = new Map<string, Segment[]>();
  for (const s of segments) {
    const k = streetKey(s);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }
  const out: Street[] = [];
  for (const [key, segs] of groups) {
    const length = segs.reduce((a, s) => a + s.length, 0);
    const first = segs[0];
    // A crash near a junction is within 25 m of several segments. Count it once per street when ids are known.
    const crashList = streetCrashes(segs);
    const crashW = crashList.reduce((a, cat) => a + (CRASH_WEIGHTS[cat - 1] ?? 1), 0);
    const anyCrashData = segs.some((s) => s.m.crashes != null);
    const bins = segs.reduce<number[] | null>((acc, s) => {
      if (!s.raw.bins) return acc;
      const b = acc ?? s.raw.bins.map(() => 0);
      s.raw.bins.forEach((n, i) => (b[i] = (b[i] ?? 0) + n));
      return b;
    }, null);
    const byCat = [0, 0, 0];
    for (const cat of crashList) byCat[cat - 1]++;
    const zones = segs.map((s) => s.m.schoolZone);
    const trees = sumOf(segs, (s) => s.raw.trees);
    const longest = segs.reduce((a, s) => (s.length > a.length ? s : a), first);
    out.push({
      id: Math.min(...segs.map((s) => s.id)),
      key,
      segIds: segs.map((s) => s.id).sort((a, b) => a - b),
      name: first.name,
      near: first.name ? null : first.near ?? null,
      district: first.district,
      length,
      m: {
        safety: lengthMean(segs, (s) => s.m.safety),
        gap: lengthMean(segs, (s) => s.m.gap, 0),
        heat: lengthMean(segs, (s) => s.m.heat, 2),
        shadeGap: lengthMean(segs, (s) => s.m.shadeGap),
        dust: lengthMean(segs, (s) => s.m.dust),
        rough: lengthMean(segs, (s) => s.m.rough, 1),
        stopgo: lengthMean(segs, (s) => s.m.stopgo),
        crashes: anyCrashData ? Math.round(((crashW / Math.max(length, 50)) * 100) * 100) / 100 : null,
        schoolZone: zones.some((z) => z === true) ? true : zones.every((z) => z == null) ? null : false,
      },
      cov: {
        safety: sumOf(segs, (s) => s.cov.safety),
        heat: sumOf(segs, (s) => s.cov.heat),
        dust: sumOf(segs, (s) => s.cov.dust),
        rough: sumOf(segs, (s) => s.cov.rough),
        stopgo: sumOf(segs, (s) => s.cov.stopgo),
        crashes: sumOf(segs, (s) => s.cov.crashes),
      },
      raw: {
        gapCm: lengthMean(segs, (s) => s.raw.gapCm, 0),
        passes: sumOf(segs, (s) => s.raw.passes),
        under150: sumOf(segs, (s) => s.raw.under150),
        bins,
        heatSpots: sumOf(segs, (s) => s.raw.heatSpots),
        treesPer100: Math.round((trees / Math.max(length, 50)) * 1000) / 10,
        trees,
        crownCover: lengthMean(segs, (s) => s.raw.crownCover),
        shade: segs.some((s) => s.raw.shade) ? [0, 1, 2, 3].map((h) => lengthMean(segs, (s) => s.raw.shade?.[h]) ?? 0) : null,
        dust: lengthMean(segs, (s) => s.raw.dust),
        roughBoxes: sumOf(segs, (s) => s.raw.roughBoxes),
        speedKmh: lengthMean(segs, (s) => s.raw.speedKmh, 1),
        flow: lengthMean(segs, (s) => s.raw.flow),
        crashes: crashList.length,
        crashesByCat: byCat,
      },
      g: longest.g,
      lines: segs.map((s) => s.g),
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** "Enough data" for ranked lists: a score, and support of Medium or High. Low support stays on maps. */
export const enoughData = (r: Pick<Scored, "littleData" | "support">) => !r.littleData && r.support !== "Low" && r.support != null;

/** The city centre district is called "Heilbronn" in the open data. Show it as "Kernstadt (Heilbronn)". */
export const districtLabel = (d: string | null | undefined) => (d == null ? "Heilbronn" : d === "Heilbronn" ? "Kernstadt (Heilbronn)" : d);
