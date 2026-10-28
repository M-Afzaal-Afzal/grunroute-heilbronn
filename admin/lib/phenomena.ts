// Street labels ("phenomena"): a repeating pattern in the data gets a short
// name, the numbers that earned it, a plain conclusion, and resolutions with
// an urgency and an ease rating. Self contained on purpose (type imports
// only), so `node --test` can load it.
//
// Every cutoff below is our rule, not from the data, and the page says so.
// A label needs a minimum number of readings, so one reading never earns one.
import type { MeasureKey, Segment } from "./shared/priority";

export type PhenomenonId = "crashCourse" | "hellValley" | "dustTrap" | "rattleRoad" | "stopGo" | "blackSpot" | "schoolGauntlet" | "blindSpot";

export type Resolution = {
  text: string;
  /** 5 very easy (signs, a check on site) to 1 very hard (rebuild). Our estimate. */
  ease: 1 | 2 | 3 | 4 | 5;
  team: "Grünflächenamt" | "Tiefbauamt" | "Straßenverkehrsbehörde" | "Schulverwaltung" | "Klimaschutz";
  /** The fix that meets the need. Its ease places the label in the urgency and ease grid. */
  main?: true;
};

export type Phenomenon = {
  id: PhenomenonId;
  name: string;
  color: string;
  measure: MeasureKey | null;
  /** The rule in words, with our cutoffs. */
  rule: string;
  /** What we think is going on, and what the street needs. */
  assumption: string;
  needs: string;
  /** When the label would go away, so a fix can be checked by measuring again. */
  clears: string;
  /** Rules and guidance to check before acting. Never a legal finding. */
  guidance: string[];
  resolutions: Resolution[];
};

export const RULE_150 = "150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule.";

export const PHENOMENA: Record<PhenomenonId, Phenomenon> = {
  crashCourse: {
    id: "crashCourse",
    name: "Crash Course",
    color: "#C8322B",
    measure: "safety",
    rule: "20 or more measured passes, 90% or more under 150 cm, and an average gap under 100 cm.",
    assumption: "Cars pass bikes close again and again, on many rides, not once.",
    needs: "More passing space for bikes.",
    clears: "Fewer than 90% of passes under 150 cm, or an average gap of 100 cm or more, when measured again.",
    guidance: [RULE_150, "ERA 2010 (FGSV) is the German guidance for bike lane widths. Check the road width on site before choosing a lane type."],
    resolutions: [
      { text: "Ask the police for passing gap checks and add signs.", ease: 5, team: "Straßenverkehrsbehörde" },
      { text: "Mark a wider bike lane, or a lane with a buffer, where the road is wide enough.", ease: 3, team: "Straßenverkehrsbehörde", main: true },
      { text: "30 km/h on this street, after a traffic study.", ease: 3, team: "Straßenverkehrsbehörde" },
      { text: "Protected bike lane or a bike street.", ease: 1, team: "Tiefbauamt" },
    ],
  },
  hellValley: {
    id: "hellValley",
    name: "Hell Valley",
    color: "#C2410C",
    measure: "heat",
    rule: "3 or more heat walk spots, at least +1.0 °C warmer than the rest of the same walk, and crown cover under 10%.",
    assumption: "The street heats up more than its surroundings and has almost no tree shade.",
    needs: "More shade.",
    clears: "Crown cover of 10% or more, or a heat walk below +1.0 °C, when measured again in summer.",
    guidance: [
      "Heilbronn Climate Adaptation Concept: shade and cooling in hot streets.",
      "Choose species with the 10-20-30 guideline on the Shade and trees page, so new trees do not repeat the current mix.",
    ],
    resolutions: [
      { text: "Put up a shade sail or a drinking fountain at the hottest spot.", ease: 4, team: "Klimaschutz" },
      { text: "Plant street trees in free spots on the sunny side.", ease: 3, team: "Grünflächenamt", main: true },
      { text: "Climbers on walls and lighter paving.", ease: 3, team: "Grünflächenamt" },
      { text: "Unseal paved areas and build tree trenches.", ease: 1, team: "Tiefbauamt" },
    ],
  },
  dustTrap: {
    id: "dustTrap",
    name: "Dust Trap",
    color: "#6B5B95",
    measure: "dust",
    rule: "10 or more sensor points and a danger and dust index in the top 10% of measured streets.",
    assumption: "Bikes ride in traffic exhaust and dust here, often next to waiting or slow cars.",
    needs: "Space between bikes and traffic, or less traffic.",
    clears: "A danger and dust index below the top 10% of streets, when measured again.",
    guidance: ["Low cost sensors are a screening tool. They are not a measurement under the EU Ambient Air Quality Directive. Compare with the LUBW stations before acting."],
    resolutions: [
      { text: "Check for idling, loading, or building site dust on the ground.", ease: 5, team: "Klimaschutz" },
      { text: "Move the bike route one street away, if a quiet parallel street exists.", ease: 3, team: "Straßenverkehrsbehörde" },
      { text: "A hedge or tree row between traffic and the bike path.", ease: 2, team: "Grünflächenamt", main: true },
      { text: "Calm or reroute through traffic.", ease: 1, team: "Straßenverkehrsbehörde" },
    ],
  },
  rattleRoad: {
    id: "rattleRoad",
    name: "Rattle Road",
    color: "#8A6D3B",
    measure: "rough",
    rule: "3 or more sensor boxes and roughness in the top 10% of measured streets.",
    assumption: "The surface shakes bikes: potholes, broken edges, or cobbles.",
    needs: "A smoother surface.",
    clears: "Roughness below the top 10% of streets, when measured again.",
    guidance: ["Check on site if the surface is damage or cobbles by design. Cobbles in a historic street may be a choice, not a fault."],
    resolutions: [
      { text: "Patch potholes and broken edges.", ease: 5, team: "Tiefbauamt", main: true },
      { text: "Resurface the bike lane or path strip.", ease: 3, team: "Tiefbauamt" },
      { text: "Rebuild the road surface in the next road works plan.", ease: 1, team: "Tiefbauamt" },
    ],
  },
  stopGo: {
    id: "stopGo",
    name: "Stop-and-Go Alley",
    color: "#365C8D",
    measure: "stopgo",
    rule: "10 or more sensor points and stop and go in the top 10% of measured streets.",
    assumption: "Bikes stop and start a lot here, usually at signals or busy junctions.",
    needs: "Smoother flow for bikes.",
    clears: "Stop and go below the top 10% of streets, when measured again.",
    guidance: ["Signal timing is set by the city. Check the wait times for bikes at the junctions on this street."],
    resolutions: [
      { text: "Check signal timing and wait times for bikes.", ease: 4, team: "Straßenverkehrsbehörde", main: true },
      { text: "Advance stop lines or a green wave for bikes.", ease: 3, team: "Straßenverkehrsbehörde" },
      { text: "Redesign the junction for bikes.", ease: 1, team: "Tiefbauamt" },
    ],
  },
  blackSpot: {
    id: "blackSpot",
    name: "Black Spot",
    color: "#1F2937",
    measure: "crashes",
    rule: "3 or more crashes within 25 m where someone on a bike or on foot was killed or seriously injured, 2021 to 2025.",
    assumption: "Serious crashes repeat here. Often a junction or a crossing is the cause.",
    needs: "A safety check of the junctions and crossings.",
    clears: "Fewer than 3 serious crashes in the latest 5 years of police data.",
    guidance: ["Use the full police crash records before any redesign. The local accident commission (Unfallkommission) reviews crash clusters."],
    resolutions: [
      { text: "Check sight lines, parking near crossings, and markings where the crashes were.", ease: 5, team: "Straßenverkehrsbehörde" },
      { text: "Raised crossing, crossing island, or better crossing lights.", ease: 3, team: "Tiefbauamt", main: true },
      { text: "Redesign the junction.", ease: 1, team: "Tiefbauamt" },
    ],
  },
  schoolGauntlet: {
    id: "schoolGauntlet",
    name: "School Gauntlet",
    color: "#B86E00",
    measure: "safety",
    rule: "Within 300 m of a school or kindergarten, 10 or more measured passes, and 80% or more under 150 cm.",
    assumption: "Children on the way to school share this street with cars that pass close.",
    needs: "A safer school route.",
    clears: "Fewer than 80% of passes under 150 cm, when measured again.",
    guidance: [RULE_150, "Plan school routes with the school. Adults collect data for school streets, never children."],
    resolutions: [
      { text: "Walk the route with the school and parents, and mark safe crossings.", ease: 5, team: "Schulverwaltung" },
      { text: "School street at drop off times, after a trial.", ease: 3, team: "Straßenverkehrsbehörde", main: true },
      { text: "30 km/h and wider footpaths near the school.", ease: 2, team: "Straßenverkehrsbehörde" },
    ],
  },
  blindSpot: {
    id: "blindSpot",
    name: "Blind Spot",
    color: "#7A8A84",
    measure: null,
    rule: "Little or no sensor data, near a school or next to a top 50 street. The same rule as the gap finder on Data and missions.",
    assumption: "We cannot tell how this street is, because almost nobody measured it.",
    needs: "Measurements, before any fix.",
    clears: "Medium or High data support after a data mission.",
    guidance: ["Ride only normal, safe routes in daylight. Adults collect data for school streets."],
    resolutions: [{ text: "Add the street to a data mission and measure it.", ease: 5, team: "Klimaschutz", main: true }],
  },
};

export const LABEL_ORDER: PhenomenonId[] = ["crashCourse", "schoolGauntlet", "blackSpot", "hellValley", "dustTrap", "rattleRoad", "stopGo", "blindSpot"];

type S = Pick<Segment, "length" | "raw" | "m" | "cov">;
/** Percentile of a street for a measure (share of streets with a lower value), null if not measured. */
export type Pct = (s: S, key: MeasureKey) => number | null;

const share = (s: S) => (s.raw.passes ? s.raw.under150 / s.raw.passes : 0);
const serious = (s: S) => (s.raw.crashesByCat?.[0] ?? 0) + (s.raw.crashesByCat?.[1] ?? 0);
const top10 = (p: number | null) => p != null && p >= 0.9;

export type Hit = {
  id: PhenomenonId;
  /** The numbers that earned the label. */
  evidence: string;
  severe: boolean;
  strongEvidence: boolean;
};

/** Labels a measured street earns. Blind Spot comes from the gap finder, not from here. */
export function labelsOf(s: S, p: Pct): Hit[] {
  const out: Hit[] = [];
  const r = s.raw;
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  if (r.passes >= 20 && share(s) >= 0.9 && r.gapCm != null && r.gapCm < 100)
    out.push({ id: "crashCourse", evidence: `${pc(share(s))} of ${r.passes} measured passes under 150 cm, average gap ${r.gapCm} cm`, severe: r.gapCm < 85, strongEvidence: r.passes >= 50 });
  if (s.m.schoolZone && r.passes >= 10 && share(s) >= 0.8)
    out.push({ id: "schoolGauntlet", evidence: `school or kindergarten within 300 m, ${pc(share(s))} of ${r.passes} passes under 150 cm`, severe: share(s) >= 0.95, strongEvidence: r.passes >= 30 });
  if (serious(s) >= 3)
    out.push({
      id: "blackSpot",
      evidence: `${serious(s)} serious crashes (${r.crashesByCat[0]} killed, ${r.crashesByCat[1]} seriously injured), ${r.crashes} crashes in all, 2021 to 2025`,
      severe: r.crashesByCat[0] >= 1 || serious(s) >= 5,
      strongEvidence: true,
    });
  if (r.heatSpots >= 3 && (s.m.heat ?? -99) >= 1.0 && (r.crownCover ?? 1) < 0.1)
    out.push({ id: "hellValley", evidence: `+${(s.m.heat as number).toFixed(1)} °C against the same heat walk, ${r.heatSpots} heat walk spots, crown cover about ${pc(r.crownCover ?? 0)}`, severe: (s.m.heat as number) >= 1.5, strongEvidence: r.heatSpots >= 10 });
  if (s.cov.dust >= 10 && top10(p(s, "dust")))
    out.push({ id: "dustTrap", evidence: `danger and dust index ${(s.m.dust as number).toFixed(2)} of 1, worse than ${pc(p(s, "dust")!)} of streets, ${s.cov.dust} sensor points`, severe: p(s, "dust")! >= 0.97, strongEvidence: s.cov.dust >= 30 });
  if (s.cov.rough >= 3 && top10(p(s, "rough")))
    out.push({ id: "rattleRoad", evidence: `roughness ${s.m.rough} of 100, worse than ${pc(p(s, "rough")!)} of streets, ${s.cov.rough} sensor boxes`, severe: p(s, "rough")! >= 0.97, strongEvidence: s.cov.rough >= 6 });
  if (s.cov.stopgo >= 10 && top10(p(s, "stopgo")))
    out.push({ id: "stopGo", evidence: `traffic flow ${(r.flow ?? 0).toFixed(2)} of 1 (0 is stop and go), worse than ${pc(p(s, "stopgo")!)} of streets, ${s.cov.stopgo} sensor points`, severe: p(s, "stopgo")! >= 0.97, strongEvidence: s.cov.stopgo >= 30 });
  return out;
}

/**
 * Urgency, 1 to 5. Our rule: start at 1, then +1 each for a severe case, a
 * school or kindergarten within 300 m, strong evidence, and two or more
 * labels on the same street. Blind spots are 1: measure first.
 */
export function urgencyOf(h: Hit, s: Pick<Segment, "m">, labels: number): 1 | 2 | 3 | 4 | 5 {
  if (h.id === "blindSpot") return 1;
  const u = 1 + (h.severe ? 1 : 0) + (s.m.schoolZone ? 1 : 0) + (h.strongEvidence ? 1 : 0) + (labels >= 2 ? 1 : 0);
  return Math.max(1, Math.min(5, u)) as 1 | 2 | 3 | 4 | 5;
}
export const URGENCY_RULE = "Urgency starts at 1, then +1 each for a severe case, a school or kindergarten within 300 m, strong evidence, and two or more labels on the same street. Blind spots are 1: measure first. Our rule.";
export const EASE_RULE = "Ease is our estimate of how hard a resolution is to put in place: 5 is a check on site or signs, 3 is paint or a small build, 1 is a rebuild.";

export const URGENCY_WORD = ["", "Low", "Some", "Medium", "High", "Very high"] as const;
export const EASE_WORD = ["", "Very hard", "Hard", "Medium", "Easy", "Very easy"] as const;

export type Quadrant = "quickWin" | "bigProject" | "easyExtra" | "later";
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  quickWin: "Quick wins: urgent and easy",
  bigProject: "Big projects: urgent but hard",
  easyExtra: "Easy extras: less urgent, easy",
  later: "Later: less urgent and hard",
};
export const mainFix = (id: PhenomenonId): Resolution => PHENOMENA[id].resolutions.find((r) => r.main) ?? PHENOMENA[id].resolutions[0];

export function quadrantOf(urgency: number, ease: number): Quadrant {
  if (urgency >= 4) return ease >= 4 ? "quickWin" : "bigProject";
  return ease >= 4 ? "easyExtra" : "later";
}

/**
 * Where trees would help most: crown cover under 10% plus at least one reason
 * from the data. Reasons are listed so the planting plan can be checked.
 */
export function treeReasons(s: S, labels: PhenomenonId[]): string[] {
  if ((s.raw.crownCover ?? 1) >= 0.1 || s.length < 50) return [];
  const why: string[] = [];
  if (labels.includes("hellValley")) why.push("Hell Valley");
  else if (s.raw.heatSpots >= 3 && (s.m.heat ?? -99) >= 0.5) why.push(`heat walk +${(s.m.heat as number).toFixed(1)} °C`);
  if (labels.includes("dustTrap")) why.push("Dust Trap, trees as a buffer");
  // A school alone does not make a planting spot, it only adds weight to heat or dust.
  if (!why.length) return [];
  if (s.m.schoolZone) why.push("school or kindergarten within 300 m");
  return why;
}
