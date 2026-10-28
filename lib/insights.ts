import { HEAT_WALK } from "./heat-walks";
import {
  HEAT,
  TREES,
  TREE_ROWS,
  WATER,
  distM,
  fmtAnomaly,
  heatAlong,
  nearestWater,
  type DangerPoint,
} from "./geo";
import { TREE_SOURCE, type CityTrees } from "./cityTrees";

export type Selection =
  | { kind: "tree"; id: number }
  | { kind: "ctree"; id: number }
  | { kind: "row"; id: number }
  | { kind: "heat"; index: number }
  | { kind: "danger"; point: DangerPoint }
  | { kind: "water"; id: number };

export type Insight = {
  kicker: string;
  title: string;
  tone: "soon" | "next" | "later" | "green" | "heat" | "cool" | "ink";
  facts: { label: string; value: string }[];
  meaning: string[];
  actions: string[];
  /** "Why this street": each measure's share of the score, with raw value, count and source. */
  why?: { key: string; label: string; color: string; share: number; points: number | null; value: string; count: string; source: string }[];
  source: string;
  at: [number, number];
};

const OSM = "Trees: OpenStreetMap contributors, mapped trees only, so real numbers can be higher.";
const REG = `Trees: ${TREE_SOURCE}.`;
const HEAT_SRC = `Heat: Heat Island Summer School walks, ${HEAT_WALK.dates}. Compared with the middle value of the same walk.`;
const ATRAI = "Close passes: ATRAI danger_zones_heilbronn, bike sensor campaign Dec 2025 to Oct 2026.";

function heatLabel(a: number) {
  if (a >= 0.5) return "warmer";
  if (a <= -0.5) return "cooler";
  return "about average";
}

export function insightFor(sel: Selection, danger: DangerPoint[] | null, ct: CityTrees | null = null): Insight | null {
  if (sel.kind === "tree" || sel.kind === "row") {
    const isRow = sel.kind === "row";
    const t = isRow ? null : TREES[sel.id];
    const r = isRow ? TREE_ROWS[sel.id] : null;
    if (!t && !r) return null;
    const at: [number, number] = t ? [t.lat, t.lng] : r!.coords[Math.floor(r!.coords.length / 2)];
    const near = TREES.filter((x) => distM(at, [x.lat, x.lng]) <= 50).length;
    const heat = heatAlong([at], 60);
    const water = nearestWater(at[0], at[1]);
    const name = (t ? t.name : r!.name) || null;
    const facts = [
      { label: "Type", value: isRow ? "Row of trees" : t!.landmark ? "Single tree, landmark" : "Single tree" },
      { label: "Species", value: name ?? "Not tagged in OpenStreetMap" },
      { label: "Mapped trees within 50 m", value: String(near) },
      { label: "Heat walk here", value: heat.avg === null ? "No heat walk passed here" : `${fmtAnomaly(heat.avg)}, ${heatLabel(heat.avg)}` },
    ];
    if (water && water.m <= 600) facts.push({ label: "Nearest drinking water", value: `${water.m} m` });
    const meaning = [
      "Trees shade the street and the people under them, which makes walking and cycling easier on hot days.",
      near >= 10 ? "This is one of the greener spots on the map, with many mapped trees close by." : "Few trees are mapped close by, so each tree here matters more for shade.",
    ];
    if (heat.avg !== null && heat.avg <= -0.5) meaning.push(`The heat walk measured this spot ${fmtAnomaly(heat.avg)} compared with the rest of that walk. Shade and green may help, but one walk cannot prove the cause.`);
    return {
      kicker: isRow ? "Tree row" : "Tree",
      title: name ?? (isRow ? "Tree row" : "Street tree"),
      tone: "green",
      facts,
      meaning,
      actions: [
        "Protect this shade during street works and repairs.",
        "Plan new trees where the heat walk ran warm and few trees are mapped.",
        "Missing species or trees? Anyone can add them in OpenStreetMap, and this map can use them.",
      ],
      source: OSM + (heat.avg !== null ? ` ${HEAT_SRC}` : ""),
      at,
    };
  }

  if (sel.kind === "heat") {
    const c = HEAT[sel.index];
    if (!c) return null;
    const [lat, lng, a, temp, n] = c;
    const nearIds = ct ? ct.near(lat, lng, 50) : null;
    const near = nearIds ? nearIds.length : TREES.filter((x) => distM([lat, lng], [x.lat, x.lng]) <= 50).length;
    const big = ct && nearIds ? nearIds.filter((i) => ct.crown[i] >= 8).length : null;
    const water = nearestWater(lat, lng);
    const warm = a >= 0.5;
    const cool = a <= -0.5;
    const facts = [
      { label: "Compared with same walk", value: `${fmtAnomaly(a)}, ${heatLabel(a)}` },
      { label: "Average measured here", value: `${temp.toFixed(1)} °C` },
      { label: "Readings in this spot", value: n.toLocaleString("en-GB") },
      { label: ct ? "City trees within 50 m" : "Mapped trees within 50 m", value: big === null || near === 0 ? String(near) : `${near}, ${big} with big crowns` },
    ];
    if (water) facts.push({ label: "Nearest drinking water", value: `${water.m} m` });
    const meaning = [
      `${fmtAnomaly(a)} means this spot was ${Math.abs(a).toFixed(1)} °C ${a >= 0 ? "warmer" : "cooler"} than the middle value of the same walk. Comparing within one walk removes most of the change from the time of day.`,
      "It is one summer snapshot from a few walks, not a heat map of the whole city.",
    ];
    if (warm && near < 5) meaning.push(ct ? "The city tree register has few trees close by, so there is little shade here. A shade gap." : "Few trees are mapped close by, so there may be little shade here.");
    if (cool && near >= 10) meaning.push("Many trees stand close by. Shade may be part of why it was cooler, but one walk cannot prove it.");
    const actions = warm
      ? [
          "Check this spot for shade: street trees, shade sails, or lighter surfaces.",
          "On hot afternoons, a route around it may be more comfortable.",
          "Measure again next summer at the same time of day before deciding on a fix.",
        ]
      : cool
        ? ["Keep what works here, shade and green.", "Use this as a cool stop on hot days.", "Compare with warm spots nearby to learn what makes the difference."]
        : ["Nothing stands out here. Look at the warmer spots first."];
    return {
      kicker: "Heat walk spot",
      title: warm ? "Warmer spot" : cool ? "Cooler spot" : "Average spot",
      tone: warm ? "heat" : cool ? "cool" : "ink",
      facts,
      meaning,
      actions,
      source: HEAT_SRC + (ct ? ` ${REG}` : ""),
      at: [lat, lng],
    };
  }

  if (sel.kind === "ctree") {
    if (!ct) return null;
    const t = ct.get(sel.id);
    const at: [number, number] = [t.lat, t.lng];
    const nearIds = ct.near(t.lat, t.lng, 50);
    const heat = heatAlong([at], 60);
    const group = t.type === "Baumgruppe";
    const typeEn: Record<string, string> = { Laubbaum: "Broadleaf tree", Nadelbaum: "Conifer", Obstbaum: "Fruit tree", Baumgruppe: "Group of trees" };
    const facts = [
      { label: "Type", value: typeEn[t.type] ?? (t.type || "Not given") },
      { label: "Scientific name", value: t.latin || "Not given" },
      { label: "Crown width", value: t.crown ? `${t.crown.toLocaleString("en-GB")} m${t.crown === 2 ? ", may be a default value" : ""}` : "Not given" },
      { label: group ? "Trunk girth, all trunks" : "Trunk girth", value: t.trunk ? `${(t.trunk / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })} m` : "Not given" },
      { label: "Street", value: [t.street, t.district].filter(Boolean).join(", ") || "Not given" },
      { label: "City trees within 50 m", value: String(nearIds.length - 1) },
    ];
    if (heat.avg !== null) facts.push({ label: "Heat walk here", value: `${fmtAnomaly(heat.avg)}, ${heatLabel(heat.avg)}` });
    const meaning: string[] = [];
    if (t.crown >= 12) meaning.push(`A big crown of about ${t.crown} m shades roughly ${Math.round((Math.PI * t.crown * t.crown) / 4)} m² of ground. Big trees like this give most of a street's shade.`);
    else if (t.crown >= 6) meaning.push(`A crown of about ${t.crown} m gives useful shade for people walking or cycling past.`);
    else if (t.crown > 0) meaning.push(t.crown === 2 ? "The register shows 2 m, which is often a default for trees not checked by the city. The real crown may be bigger." : "A small or young crown, it gives little shade yet but will grow.");
    if (!group && t.trunk >= 250) meaning.push(`A trunk girth of ${(t.trunk / 100).toFixed(2)} m marks a large, mature tree. Old trees are hard to replace.`);
    if (group) meaning.push("This entry is a group of similar trees. The trunk girth is the sum of all trunks.");
    if (heat.avg !== null && heat.avg >= 0.5) meaning.push("The heat walk ran warm here, so this tree's shade matters even more.");
    if (!meaning.length) meaning.push("Every public tree in Heilbronn is in the city register, with its species and size.");
    return {
      kicker: "City tree register",
      title: t.name,
      tone: "green",
      facts,
      meaning,
      actions: [
        "Protect this tree and its roots during street works.",
        t.crown >= 8 ? "Keep it in mind when planning lanes or parking here, big crowns are slow to replace." : "Water young trees in dry summers so they reach full size.",
        "Use gaps between trees on hot streets as places for new planting.",
      ],
      source: REG + (heat.avg !== null ? ` ${HEAT_SRC}` : ""),
      at,
    };
  }

  if (sel.kind === "danger") {
    const p = sel.point;
    const level = p.risk >= 0.8 ? "High" : p.risk >= 0.5 ? "Medium" : "Low";
    const nearby = danger ? danger.filter((d) => distM([p.lat, p.lng], [d.lat, d.lng]) <= 50).length : 1;
    return {
      kicker: "Close pass point",
      title: `${level} risk, ${p.risk.toFixed(2)}`,
      tone: p.risk >= 0.8 ? "soon" : "next",
      facts: [
        { label: "Risk index", value: `${p.risk.toFixed(2)} of 1` },
        { label: "Close pass points within 50 m", value: String(nearby) },
      ],
      meaning: [
        "A bike sensor recorded a car passing close here. The risk index is 30 percent how sure the sensor was, and 70 percent how close the car came.",
        nearby >= 5 ? "Several points cluster here, which makes it a stronger signal." : "One point is a signal, not proof. Look for clusters of points.",
      ],
      actions: [
        "Look at the street layout here: lane width, parked cars, and speed.",
        "If points cluster, check the spot on the ground and add it to the fix list.",
      ],
      source: ATRAI,
      at: [p.lat, p.lng],
    };
  }

  if (sel.kind === "water") {
    const w = WATER[sel.id];
    if (!w) return null;
    return {
      kicker: "Drinking water",
      title: w.name ?? "Drinking fountain",
      tone: "cool",
      facts: [{ label: "Type", value: "Public drinking water, mapped in OpenStreetMap" }],
      meaning: ["A place to refill water, which helps on hot days."],
      actions: ["Add it to hot weather routes and school route maps.", "Check that it works in summer."],
      source: "OpenStreetMap contributors, amenity=drinking_water.",
      at: [w.lat, w.lng],
    };
  }
  return null;
}

export type ShadeGap = { index: number; anomaly: number; trees: number; near: string };

/**
 * Warm heat walk spots (at least +1.0 °C against the same walk) with the
 * fewest register trees within 40 m. A screening list for where shade is
 * missing, to check on the ground, not a planting plan.
 */
export function shadeGaps(ct: CityTrees, limit = 5): ShadeGap[] {
  const out: ShadeGap[] = [];
  HEAT.forEach((c, index) => {
    if (c[2] < 1) return;
    const trees = ct.near(c[0], c[1], 40).length;
    const nearIds = ct.near(c[0], c[1], 150);
    let near = "";
    let best = Infinity;
    for (const i of nearIds) {
      const d = distM([c[0], c[1]], [ct.lat[i], ct.lng[i]]);
      if (d < best) {
        best = d;
        near = ct.get(i).street;
      }
    }
    out.push({ index, anomaly: c[2], trees, near });
  });
  // Drop spots next to each other, keep the hotter one.
  out.sort((a, b) => a.trees - b.trees || b.anomaly - a.anomaly);
  const kept: ShadeGap[] = [];
  for (const g of out) {
    const c = HEAT[g.index];
    if (kept.some((k) => distM([HEAT[k.index][0], HEAT[k.index][1]], [c[0], c[1]]) < 120)) continue;
    kept.push(g);
    if (kept.length >= limit) break;
  }
  return kept;
}
