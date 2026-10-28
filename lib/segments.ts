// Loads the measured street network (public/data/segments.json, built by
// scripts/build-segments.mjs) and turns scored segments into the info card,
// the list text, and the hero number. Every number here comes from that file.
import { bandFor } from "./data";
import { fmtAnomaly } from "./geo";
import type { Insight } from "./insights";
import { MEASURES, districtLabel, type MeasureKey, type Preset, type Scored, type Segment, type SegmentsMeta } from "./priority";
import { sourceById } from "./sources";

export type SegmentData = { meta: SegmentsMeta; segments: Segment[] };

let pending: Promise<SegmentData> | null = null;
export function loadSegments(): Promise<SegmentData> {
  if (!pending) {
    pending = fetch("/data/segments.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SegmentData>;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  }
  return pending;
}

/** Colours for the "Why this street" bar. Data colours, always shown with a label. */
export const MEASURE_COLOR: Record<MeasureKey, string> = {
  safety: "#0F2A23",
  heat: "#C2410C",
  shadeGap: "#2E8B57",
  dust: "#6B6F80",
  rough: "#8B6B3E",
  stopgo: "#2563A6",
  crashes: "#7A3E9D",
};

export const RULE_150 =
  "150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule.";

const nf = (n: number) => n.toLocaleString("en-GB");
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const segName = (s: Segment) =>
  s.name ?? (s.near ? `Unnamed ${"segIds" in s ? "street" : "segment"} near ${s.near}` : "Street without a name in the data");
export const segMid = (s: Segment): [number, number] => s.g[Math.floor((s.g.length - 1) / 2)];
export const measureLabel = (k: MeasureKey) => MEASURES.find((m) => m.key === k)!.label;

/** Raw value, count and source for one measure, or null when the segment has no data for it. */
export function measureDetail(s: Segment, key: MeasureKey): { value: string; count: string; source: string } | null {
  const r = s.raw;
  const src = sourceById(MEASURES.find((m) => m.key === key)!.source)?.name ?? "";
  if (s.m[key] == null) return null;
  switch (key) {
    case "safety":
      return { value: `${pct(s.m.safety!)} of passes under 150 cm, average gap ${r.gapCm} cm`, count: `${nf(r.passes)} measured ${r.passes === 1 ? "pass" : "passes"}`, source: src };
    case "heat":
      return { value: `${fmtAnomaly(s.m.heat!)} compared with the same walk`, count: `${r.heatSpots} heat walk ${r.heatSpots === 1 ? "spot" : "spots"}, ${nf(s.cov.heat)} readings`, source: src };
    case "shadeGap":
      return { value: `crown cover about ${pct(r.crownCover ?? 0)}, estimate from the tree register`, count: `${nf(r.trees)} register ${r.trees === 1 ? "tree" : "trees"} within 20 m`, source: src };
    case "dust":
      return { value: `danger and dust index ${s.m.dust!.toFixed(2)} of 1`, count: `${nf(s.cov.dust)} sensor points`, source: src };
    case "rough":
      return { value: `roughness ${s.m.rough} of 100`, count: `${s.cov.rough} sensor ${s.cov.rough === 1 ? "box" : "boxes"}`, source: src };
    case "stopgo":
      return { value: `traffic flow ${r.flow?.toFixed(2)} of 1, where 0 is stop and go`, count: `${nf(s.cov.stopgo)} sensor points`, source: src };
    case "crashes": {
      const [k, se, sl] = r.crashesByCat;
      return {
        value: r.crashes ? `${r.crashes} bike or foot injury ${r.crashes === 1 ? "crash" : "crashes"} within 25 m, 2021 to 2025` : "no bike or foot injury crash within 25 m, 2021 to 2025",
        count: r.crashes ? `killed ${k}, seriously injured ${se}, slightly injured ${sl}` : "police recorded crashes",
        source: src,
      };
    }
  }
}

/** Short reason line for a list card: the two measures that add most to the score. */
export function reasonLine(x: Scored): string {
  if (x.littleData || x.score == null) return "Little data for your priorities, not scored.";
  const top = [...x.parts].sort((a, b) => b.points - a.points).slice(0, 2);
  return top
    .map((p) => {
      const s = x.seg;
      if (p.key === "safety") return `${pct(s.m.safety!)} of ${s.raw.passes} passes under 150 cm`;
      if (p.key === "heat") return `heat walk ${fmtAnomaly(s.m.heat!)}`;
      if (p.key === "shadeGap") return `crown cover about ${pct(s.raw.crownCover ?? 0)}`;
      if (p.key === "dust") return `danger and dust ${s.m.dust!.toFixed(2)}`;
      if (p.key === "rough") return `roughness ${s.m.rough} of 100`;
      if (p.key === "stopgo") return `flow ${s.raw.flow?.toFixed(2)} of 1`;
      return `${s.raw.crashes} ${s.raw.crashes === 1 ? "crash" : "crashes"} 2021 to 2025`;
    })
    .join(", ")
    .replace(/^./, (c) => c.toUpperCase());
}

const supportWord = (x: Scored) => {
  if (!x.supportKey || !x.support) return "No sensor support";
  const n = nf(x.supportCount);
  const what = x.supportKey === "safety" ? "passes" : x.supportKey === "rough" ? "sensor boxes" : x.supportKey === "heat" ? "heat walk readings" : "sensor points";
  return `${x.support}, ${n} ${what}`;
};

const ACTION: Record<MeasureKey, string> = {
  safety: "Look at passing space for bikes: a protected bike lane, a wider lane, or traffic calming.",
  heat: "Look for space for street trees, shade, or lighter surfaces, the spot ran warm on the heat walk.",
  shadeGap: "Look for space for street trees, the register shows little crown cover here.",
  dust: "Check traffic and waiting cars here, and where bikes ride in exhaust.",
  rough: "Check the surface on the ground and plan a repair if needed.",
  stopgo: "Check signals and crossings, bikes stop and start often here.",
  crashes: "Look at the crash spots with the police and the road office.",
};

export function segmentInsight(x: Scored, preset: Preset | null, rank: number | null): Insight {
  const s = x.seg;
  const band = x.score != null ? bandFor(x.score) : null;
  const facts = [
    { label: "Fix score", value: x.score != null && band ? `${x.score} of 100, ${band.label}` : "Little data, not scored" },
    { label: "Priorities", value: preset ? preset.label : "Your own mix" },
    { label: "Data support", value: x.weak ? `${supportWord(x)}, weak evidence` : supportWord(x) },
  ];
  if (x.gate) facts.push({ label: "Coverage gate (proposal)", value: x.gate === "Trusted" ? `Trusted, ${s.raw.passes} overtakes` : `Indicative, ${s.raw.passes} of 20 overtakes` });
  facts.push({ label: "Length", value: `${nf(s.length)} m` });
  facts.push({ label: "Near a school or kindergarten", value: s.m.schoolZone == null ? "Not known" : s.m.schoolZone ? "Yes, within 300 m" : "No" });

  const total = x.parts.reduce((a, p) => a + p.points, 0);
  const why = MEASURES.flatMap((m) => {
    const d = measureDetail(s, m.key);
    if (!d) return [];
    const part = x.parts.find((p) => p.key === m.key);
    return [{ key: m.key, label: m.label, color: MEASURE_COLOR[m.key], share: part && total > 0 ? part.points / total : 0, points: part ? Math.round(part.points) : null, ...d }];
  });

  const meaning: string[] = [];
  if (x.littleData) meaning.push("This street has fewer than 2 of your chosen measures, or none from a sensor, so it gets no score. It stays on the map in grey, never hidden.");
  else meaning.push(`The score adds up the measures you chose. Each one is compared with all measured streets in Heilbronn, from 0 (best) to 1 (worst), then weighted.`);
  if (s.m.safety != null) meaning.push(`${s.raw.under150} of ${s.raw.passes} measured passes were under 150 cm. ${RULE_150}`);
  if (x.weak) meaning.push("Only 1 or 2 sensor readings support this, so it is weak evidence, not a finding.");
  if (x.gate === "Indicative") meaning.push("Fewer than 20 overtakes were measured here, so the safety part is indicative only (proposed gate).");

  const actions: string[] = [];
  if (x.weak || x.littleData) actions.push("Check on the ground first. Weak evidence never gets an automatic fix.");
  const top = [...x.parts].sort((a, b) => b.points - a.points).slice(0, 2);
  for (const p of top) actions.push(ACTION[p.key]);
  if (x.gate === "Indicative") actions.push("Collect more rides here. The proposed gate asks for at least 20 overtakes before a trusted rank.");
  actions.push("Confirm with official city data before any decision.");

  return {
    kicker: x.score != null && rank ? `Rank ${nf(rank)}, ${districtLabel(s.district)}` : `Little data, ${districtLabel(s.district)}`,
    title: segName(s),
    tone: band ? band.key : "ink",
    facts,
    meaning,
    actions,
    why,
    source: `Sources: ${[...new Set(why.map((w) => w.source))].join(", ")}. Full list under All data sources in detail.`,
    at: segMid(s),
  };
}

/** The most striking true statement about the current ranking. Picked at runtime, never typed in. */
/** The hero line, computed from segments.json meta: share of detected passes under 150 cm, with the detection caveat. */
export function heroFact(meta: SegmentsMeta | null): { big: string; text: string; caveat: string } | null {
  const passes = Number(meta?.counts.passes ?? 0), under = Number(meta?.counts.under150 ?? 0);
  if (!passes) return null;
  return {
    big: pct(under / passes),
    text: `of the ${nf(passes)} passes the bike sensors detected were under 150 cm.`,
    caveat: "Wide passes may be missed, so this share can be too high.",
  };
}
