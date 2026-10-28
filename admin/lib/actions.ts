// What to do next for a scored street, from data the Planner already has.
// Self contained on purpose (type imports only), so `node --test` can load it.
//
// 1. Next step: the fix score band against the data support.
//      Fix soon, Medium or High support  -> Act now
//      Fix soon, Low support             -> Ground check first
//      Plan next, Medium or High support -> Put in the plan
//      everything else that is scored   -> Watch
//    Little data and streets under 20 m get no next step.
// 2. Suggested measures: for the measures that drive the score (worse than
//    75% of measured streets), ideas at three effort levels with a lead team.
//    The data has no road width, parking, or bus lanes, so these are ideas to
//    check on the ground, not a decision.
import type { MeasureKey, Scored } from "./shared/priority";

export type NextStep = "act" | "check" | "plan" | "watch";
export const NEXT_STEPS: NextStep[] = ["act", "check", "plan", "watch"];
export const NEXT_LABEL: Record<NextStep, string> = {
  act: "Act now",
  check: "Ground check first",
  plan: "Put in the plan",
  watch: "Watch",
};
export const NEXT_HELP: Record<NextStep, string> = {
  act: "Fix soon band and Medium or High data support. Ready for a fix proposal.",
  check: "Fix soon band, but only 1 or 2 readings. Check on the ground before any fix.",
  plan: "Plan next band with Medium or High data support. Add to the next budget round.",
  watch: "Check later band, or Plan next with thin data. Measure again later.",
};
// Same colours as the fix score bands. Ground check first shares the Fix soon red, drawn dashed.
export const NEXT_COLOR: Record<NextStep, string> = { act: "#C8322B", check: "#C8322B", plan: "#B86E00", watch: "#4E8C72" };

/**
 * Map style per next step. Colour says how bad, the line says how sure:
 * solid for Medium or High support, dashed for 1 or 2 readings, thin for watch.
 * Drawn in this order, so Act now sits on top.
 */
export type LineStyle = { color: string; weight: number; opacity: number; dash?: string };
export const NEXT_LINE: Record<NextStep, LineStyle> = {
  watch: { color: NEXT_COLOR.watch, weight: 2, opacity: 0.45 },
  plan: { color: NEXT_COLOR.plan, weight: 4, opacity: 0.9 },
  check: { color: NEXT_COLOR.check, weight: 5, opacity: 0.95, dash: "6 6" },
  act: { color: NEXT_COLOR.act, weight: 7, opacity: 1 },
};
export const DRAW_ORDER: NextStep[] = ["watch", "plan", "check", "act"];
export const LITTLE_LINE: LineStyle = { color: "#9AA6A0", weight: 1.5, opacity: 0.5, dash: "2 6" };

/** Same band edges as bandFor in lib/data.ts (a test checks they agree). */
export const SOON_MIN = 80;
export const NEXT_MIN = 50;
const MIN_LENGTH_M = 20;

type Row = Pick<Scored, "score" | "support" | "littleData"> & { seg: { length: number } };

export function nextStepOf(r: Row): NextStep | null {
  if (r.score == null || r.littleData || r.seg.length < MIN_LENGTH_M) return null;
  const solid = r.support === "High" || r.support === "Medium";
  if (r.score >= SOON_MIN) return solid ? "act" : "check";
  if (r.score >= NEXT_MIN && solid) return "plan";
  return "watch";
}

// Lead teams and fix types are the ones the case panel offers.
export type Team = "Grünflächenamt" | "Tiefbauamt" | "Straßenverkehrsbehörde" | "Schulverwaltung" | "Klimaschutz";
export type FixType = "Trees" | "Traffic calming" | "Surface" | "School route" | "";
export type Effort = "quick" | "medium" | "big";
export const EFFORT_LABEL: Record<Effort, string> = { quick: "Quick fix", medium: "Medium project", big: "Big project" };
export type Idea = { effort: Effort; text: string; team: Team; fixType: FixType };

const idea = (effort: Effort, text: string, team: Team, fixType: FixType = ""): Idea => ({ effort, text, team, fixType });

export const IDEAS: Record<MeasureKey, Idea[]> = {
  safety: [
    idea("quick", "Check lane markings and signs on the ground, and ask the police for passing gap checks.", "Straßenverkehrsbehörde", "Traffic calming"),
    idea("medium", "Mark a wider bike lane, or a bike lane with a buffer, where the road is wide enough.", "Straßenverkehrsbehörde", "Traffic calming"),
    idea("big", "Protected bike lane, bike street, or 30 km/h, after a traffic study.", "Straßenverkehrsbehörde", "Traffic calming"),
  ],
  heat: [
    idea("quick", "Check if a drinking fountain or a shade sail fits near the hot spot.", "Klimaschutz"),
    idea("medium", "Plant street trees or climbers where the heat walk was warmest.", "Grünflächenamt", "Trees"),
    idea("big", "Unseal paved areas and use lighter surfaces.", "Tiefbauamt", "Trees"),
  ],
  shadeGap: [
    idea("quick", "Look for free tree pits and planting spots on the ground.", "Grünflächenamt", "Trees"),
    idea("medium", "Plant trees on the sunny side. The Shade and trees page shows where shade is missing.", "Grünflächenamt", "Trees"),
    idea("big", "Rebuild the street side with tree trenches.", "Tiefbauamt", "Trees"),
  ],
  dust: [
    idea("quick", "Check for idling, loading, or building site dust on the ground.", "Klimaschutz"),
    idea("medium", "Add a green buffer, a hedge or trees, between traffic and the path.", "Grünflächenamt", "Trees"),
    idea("big", "Calm or reroute through traffic.", "Straßenverkehrsbehörde", "Traffic calming"),
  ],
  rough: [
    idea("quick", "Patch potholes and broken edges.", "Tiefbauamt", "Surface"),
    idea("medium", "Resurface the bike lane or path strip.", "Tiefbauamt", "Surface"),
    idea("big", "Rebuild the road surface in the next road works plan.", "Tiefbauamt", "Surface"),
  ],
  stopgo: [
    idea("quick", "Check signal timing and wait times for bikes.", "Straßenverkehrsbehörde"),
    idea("medium", "Advance stop lines or a green wave for bikes.", "Straßenverkehrsbehörde"),
    idea("big", "Redesign the junction for bikes.", "Tiefbauamt"),
  ],
  crashes: [
    idea("quick", "Check sight lines, parking near crossings, and markings where the crashes were.", "Straßenverkehrsbehörde", "Traffic calming"),
    idea("medium", "Raised crossing, crossing island, or better crossing lights.", "Tiefbauamt", "Traffic calming"),
    idea("big", "Redesign the junction, using the full police crash records.", "Straßenverkehrsbehörde", "Traffic calming"),
  ],
};

const SCHOOL_IDEA = idea("quick", "Walk the school route with the school and parents, and mark safe crossings.", "Schulverwaltung", "School route");

/** A measure drives the score when the street is worse than this share of measured streets. */
export const DRIVER_P = 0.75;
/**
 * Our rule, not from the data: most streets have no crash, so a single crash
 * already looks worse than about 90% of streets. Crashes only count as a
 * driver from this many crashes in 2021 to 2025.
 */
export const MIN_CRASHES = 2;

export type Driver = { key: MeasureKey; p: number; share: number };
type DriverRow = Pick<Scored, "parts"> & { seg: { raw: { crashes: number } } };

const strong = (x: Scored["parts"][number]) => x.weight > 0 && x.p >= DRIVER_P;

/** Measures that push the score up most, largest share first. At most 3. */
export function driversOf(r: DriverRow): Driver[] {
  const total = r.parts.reduce((s, x) => s + x.weight * x.p, 0);
  if (total <= 0) return [];
  return r.parts
    .filter(strong)
    .filter((x) => x.key !== "crashes" || r.seg.raw.crashes >= MIN_CRASHES)
    .map((x) => ({ key: x.key, p: x.p, share: (x.weight * x.p) / total }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
}

/** Measures above DRIVER_P that the crash rule held back, so the page can say why. */
export function heldBack(r: DriverRow): MeasureKey[] {
  return r.parts.filter(strong).filter((x) => x.key === "crashes" && r.seg.raw.crashes < MIN_CRASHES).map((x) => x.key);
}

const SUPPORT_UNIT: Record<MeasureKey, [string, string]> = {
  safety: ["measured pass", "measured passes"],
  heat: ["heat walk reading", "heat walk readings"],
  shadeGap: ["tree register entry", "tree register entries"],
  dust: ["danger and dust sensor point", "danger and dust sensor points"],
  rough: ["roughness sensor box", "roughness sensor boxes"],
  stopgo: ["stop and go sensor point", "stop and go sensor points"],
  crashes: ["crash", "crashes"],
};

/** What the support label counts: readings of one sensor measure, the one that adds most to the score. */
export function supportFrom(r: Pick<Scored, "support" | "supportCount" | "supportKey">): string {
  if (!r.support || !r.supportKey) return "No sensor support";
  const [one, many] = SUPPORT_UNIT[r.supportKey];
  return `${r.support}, ${r.supportCount.toLocaleString("en-GB")} ${r.supportCount === 1 ? one : many}`;
}
export const SUPPORT_NOTE = "Support counts the readings of one sensor measure only: the one that adds most to the score.";

export type Suggestion = { driver: MeasureKey; ideas: Idea[] };

/** Ideas per driving measure. School streets with close passes or crashes add a school route walk. */
export function suggestionsFor(r: Pick<Scored, "parts"> & { seg: { m: { schoolZone: boolean | null }; raw: { crashes: number } } }): Suggestion[] {
  const school = r.seg.m.schoolZone === true;
  return driversOf(r).map((d) => ({
    driver: d.key,
    ideas: school && (d.key === "safety" || d.key === "crashes") ? [SCHOOL_IDEA, ...IDEAS[d.key]] : IDEAS[d.key],
  }));
}

/** The quick fix for the main driver. Its team leads the street in the work queue. */
export function firstIdea(s: Suggestion[]): Idea | null {
  return s[0] ? (IDEAS[s[0].driver].find((i) => i.effort === "quick") ?? null) : null;
}

export const IDEAS_NOTE =
  "Ideas to check, not a decision. They come only from the measures that drive the score. The data has no road width, parking, or bus lanes, so check on the ground first.";
