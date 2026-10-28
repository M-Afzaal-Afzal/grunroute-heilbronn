import { HEAT_WALK, HEAT_WALK_DATES_DE } from "./heat-walks";
import { fmtNum, type Lang } from "./i18n";
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

const REG = `Trees: ${TREE_SOURCE}.`;

// Card text per language. English is the original wording, unchanged.
const TX = {
  en: {
    osm: "Trees: OpenStreetMap contributors, mapped trees only, so real numbers can be higher.",
    reg: REG,
    heatSrc: `Heat: Heat Island Summer School walks, ${HEAT_WALK.dates}. Compared with the middle value of the same walk.`,
    atrai: "Close passes: ATRAI danger_zones_heilbronn, bike sensor campaign Dec 2025 to Oct 2026.",
    warmer: "warmer",
    cooler: "cooler",
    average: "about average",
    // Trees from OpenStreetMap
    type: "Type",
    rowOfTrees: "Row of trees",
    landmark: "Single tree, landmark",
    single: "Single tree",
    species: "Species",
    notTagged: "Not tagged in OpenStreetMap",
    mapped50: "Mapped trees within 50 m",
    heatHere: "Heat walk here",
    noHeat: "No heat walk passed here",
    nearestWater: "Nearest drinking water",
    treesShade: "Trees shade the street and the people under them, which makes walking and cycling easier on hot days.",
    greener: "This is one of the greener spots on the map, with many mapped trees close by.",
    fewMapped: "Few trees are mapped close by, so each tree here matters more for shade.",
    coolTree: (a: string) => `The heat walk measured this spot ${a} compared with the rest of that walk. Shade and green may help, but one walk cannot prove the cause.`,
    treeRow: "Tree row",
    tree: "Tree",
    streetTree: "Street tree",
    treeActions: [
      "Protect this shade during street works and repairs.",
      "Plan new trees where the heat walk ran warm and few trees are mapped.",
      "Missing species or trees? Anyone can add them in OpenStreetMap, and this map can use them.",
    ],
    // Heat walk spots
    sameWalk: "Compared with same walk",
    avgHere: "Average measured here",
    readings: "Readings in this spot",
    city50: "City trees within 50 m",
    bigCrowns: (near: number, big: number) => `${near}, ${big} with big crowns`,
    spotMeans: (fa: string, abs: string, warm: boolean) =>
      `${fa} means this spot was ${abs} °C ${warm ? "warmer" : "cooler"} than the middle value of the same walk. Comparing within one walk removes most of the change from the time of day.`,
    snapshot: "It is one summer snapshot from a few walks, not a heat map of the whole city.",
    gapCity: "The city tree register has few trees close by, so there is little shade here. A shade gap.",
    gapOsm: "Few trees are mapped close by, so there may be little shade here.",
    coolMany: "Many trees stand close by. Shade may be part of why it was cooler, but one walk cannot prove it.",
    warmActions: [
      "Check this spot for shade: street trees, shade sails, or lighter surfaces.",
      "On hot afternoons, a route around it may be more comfortable.",
      "Measure again next summer at the same time of day before deciding on a fix.",
    ],
    coolActions: ["Keep what works here, shade and green.", "Use this as a cool stop on hot days.", "Compare with warm spots nearby to learn what makes the difference."],
    avgActions: ["Nothing stands out here. Look at the warmer spots first."],
    heatKicker: "Heat walk spot",
    warmSpot: "Warmer spot",
    coolSpot: "Cooler spot",
    avgSpot: "Average spot",
    // City tree register
    typeName: { Laubbaum: "Broadleaf tree", Nadelbaum: "Conifer", Obstbaum: "Fruit tree", Baumgruppe: "Group of trees" } as Record<string, string>,
    notGiven: "Not given",
    latin: "Scientific name",
    crownWidth: "Crown width",
    maybeDefault: ", may be a default value",
    trunkAll: "Trunk girth, all trunks",
    trunk: "Trunk girth",
    street: "Street",
    bigCrown: (c: string, m2: number) => `A big crown of about ${c} m shades roughly ${m2} m² of ground. Big trees like this give most of a street's shade.`,
    usefulCrown: (c: string) => `A crown of about ${c} m gives useful shade for people walking or cycling past.`,
    defaultCrown: "The register shows 2 m, which is often a default for trees not checked by the city. The real crown may be bigger.",
    smallCrown: "A small or young crown, it gives little shade yet but will grow.",
    bigTrunk: (g: string) => `A trunk girth of ${g} m marks a large, mature tree. Old trees are hard to replace.`,
    groupNote: "This entry is a group of similar trees. The trunk girth is the sum of all trunks.",
    warmTree: "The heat walk ran warm here, so this tree's shade matters even more.",
    everyTree: "Every public tree in Heilbronn is in the city register, with its species and size.",
    regKicker: "City tree register",
    protectTree: "Protect this tree and its roots during street works.",
    bigCrownAction: "Keep it in mind when planning lanes or parking here, big crowns are slow to replace.",
    youngAction: "Water young trees in dry summers so they reach full size.",
    gapsAction: "Use gaps between trees on hot streets as places for new planting.",
    // Close pass points
    high: "High",
    medium: "Medium",
    low: "Low",
    passKicker: "Close pass point",
    risk: (level: string, r: string) => `${level} risk, ${r}`,
    riskIndex: "Risk index",
    ofOne: (r: string) => `${r} of 1`,
    pass50: "Close pass points within 50 m",
    passMeans: "A bike sensor recorded a car passing close here. The risk index is 30 percent how sure the sensor was, and 70 percent how close the car came.",
    cluster: "Several points cluster here, which makes it a stronger signal.",
    onePoint: "One point is a signal, not proof. Look for clusters of points.",
    passActions: ["Look at the street layout here: lane width, parked cars, and speed.", "If points cluster, check the spot on the ground and add it to the fix list."],
    // Drinking water
    waterKicker: "Drinking water",
    fountain: "Drinking fountain",
    waterType: "Public drinking water, mapped in OpenStreetMap",
    waterMeans: ["A place to refill water, which helps on hot days."],
    waterActions: ["Add it to hot weather routes and school route maps.", "Check that it works in summer."],
    waterSrc: "OpenStreetMap contributors, amenity=drinking_water.",
  },
  de: {
    osm: "Bäume: OpenStreetMap-Mitwirkende, nur kartierte Bäume, die echten Zahlen können also höher sein.",
    reg: `Bäume: ${TREE_SOURCE}.`,
    heatSrc: `Hitze: Rundgänge der Heat Island Summer School, ${HEAT_WALK_DATES_DE}. Verglichen mit dem Mittelwert desselben Rundgangs.`,
    atrai: "Enge Überholungen: ATRAI danger_zones_heilbronn, Rad-Sensor-Kampagne Dez 2025 bis Okt 2026.",
    warmer: "wärmer",
    cooler: "kühler",
    average: "etwa durchschnittlich",
    type: "Art",
    rowOfTrees: "Baumreihe",
    landmark: "Einzelbaum, markanter Baum",
    single: "Einzelbaum",
    species: "Baumart",
    notTagged: "In OpenStreetMap nicht angegeben",
    mapped50: "Kartierte Bäume im Umkreis von 50 m",
    heatHere: "Hitze-Rundgang hier",
    noHeat: "Hier ging kein Hitze-Rundgang vorbei",
    nearestWater: "Nächstes Trinkwasser",
    treesShade: "Bäume spenden der Straße und den Menschen darunter Schatten, das macht Gehen und Radfahren an heißen Tagen leichter.",
    greener: "Dies ist eine der grüneren Stellen auf der Karte, mit vielen kartierten Bäumen in der Nähe.",
    fewMapped: "In der Nähe sind wenige Bäume kartiert, daher zählt jeder Baum hier mehr für den Schatten.",
    coolTree: (a: string) => `Der Hitze-Rundgang hat diese Stelle mit ${a} gemessen, verglichen mit dem Rest des Rundgangs. Schatten und Grün können helfen, aber ein Rundgang kann die Ursache nicht beweisen.`,
    treeRow: "Baumreihe",
    tree: "Baum",
    streetTree: "Straßenbaum",
    treeActions: [
      "Schütze diesen Schatten bei Straßenarbeiten und Reparaturen.",
      "Plane neue Bäume dort, wo der Hitze-Rundgang warm war und wenige Bäume kartiert sind.",
      "Fehlen Baumarten oder Bäume? Alle können sie in OpenStreetMap eintragen, und diese Karte kann sie nutzen.",
    ],
    sameWalk: "Verglichen mit demselben Rundgang",
    avgHere: "Hier gemessener Mittelwert",
    readings: "Messwerte an dieser Stelle",
    city50: "Stadtbäume im Umkreis von 50 m",
    bigCrowns: (near: number, big: number) => `${near}, davon ${big} mit großer Krone`,
    spotMeans: (fa: string, abs: string, warm: boolean) =>
      `${fa} heißt, diese Stelle war ${abs} °C ${warm ? "wärmer" : "kühler"} als der Mittelwert desselben Rundgangs. Der Vergleich innerhalb eines Rundgangs entfernt den größten Teil des Einflusses der Tageszeit.`,
    snapshot: "Es ist eine Momentaufnahme aus einem Sommer und wenigen Rundgängen, keine Hitzekarte der ganzen Stadt.",
    gapCity: "Laut Baumkataster stehen wenige Bäume in der Nähe, hier gibt es also wenig Schatten. Eine Schattenlücke.",
    gapOsm: "In der Nähe sind wenige Bäume kartiert, hier gibt es also vielleicht wenig Schatten.",
    coolMany: "Viele Bäume stehen in der Nähe. Schatten kann ein Grund sein, warum es kühler war, aber ein Rundgang kann es nicht beweisen.",
    warmActions: [
      "Prüfe diese Stelle auf Schatten: Straßenbäume, Sonnensegel oder hellere Beläge.",
      "An heißen Nachmittagen ist eine Route drumherum vielleicht angenehmer.",
      "Miss nächsten Sommer zur gleichen Tageszeit noch einmal, bevor über eine Lösung entschieden wird.",
    ],
    coolActions: ["Erhalte, was hier wirkt: Schatten und Grün.", "Nutze die Stelle an heißen Tagen als kühle Pause.", "Vergleiche mit warmen Stellen in der Nähe, um den Unterschied zu verstehen."],
    avgActions: ["Hier fällt nichts auf. Schau zuerst auf die wärmeren Stellen."],
    heatKicker: "Hitze-Spot",
    warmSpot: "Wärmere Stelle",
    coolSpot: "Kühlere Stelle",
    avgSpot: "Durchschnittliche Stelle",
    typeName: { Laubbaum: "Laubbaum", Nadelbaum: "Nadelbaum", Obstbaum: "Obstbaum", Baumgruppe: "Baumgruppe" } as Record<string, string>,
    notGiven: "Nicht angegeben",
    latin: "Wissenschaftlicher Name",
    crownWidth: "Kronenbreite",
    maybeDefault: ", eventuell ein Standardwert",
    trunkAll: "Stammumfang, alle Stämme",
    trunk: "Stammumfang",
    street: "Straße",
    bigCrown: (c: string, m2: number) => `Eine große Krone von etwa ${c} m beschattet ungefähr ${m2} m² Boden. Große Bäume wie dieser geben den meisten Schatten einer Straße.`,
    usefulCrown: (c: string) => `Eine Krone von etwa ${c} m gibt nützlichen Schatten für Menschen, die zu Fuß oder mit dem Rad vorbeikommen.`,
    defaultCrown: "Das Kataster zeigt 2 m, oft ein Standardwert für Bäume, die die Stadt nicht geprüft hat. Die echte Krone kann größer sein.",
    smallCrown: "Eine kleine oder junge Krone, sie gibt noch wenig Schatten, wächst aber.",
    bigTrunk: (g: string) => `Ein Stammumfang von ${g} m zeigt einen großen, alten Baum. Alte Bäume sind schwer zu ersetzen.`,
    groupNote: "Dieser Eintrag ist eine Gruppe ähnlicher Bäume. Der Stammumfang ist die Summe aller Stämme.",
    warmTree: "Der Hitze-Rundgang war hier warm, daher zählt der Schatten dieses Baums noch mehr.",
    everyTree: "Jeder öffentliche Baum in Heilbronn steht im Baumkataster, mit Art und Größe.",
    regKicker: "Baumkataster",
    protectTree: "Schütze diesen Baum und seine Wurzeln bei Straßenarbeiten.",
    bigCrownAction: "Denk an ihn, wenn hier Spuren oder Parkplätze geplant werden, große Kronen wachsen nur langsam nach.",
    youngAction: "Gieße junge Bäume in trockenen Sommern, damit sie voll auswachsen.",
    gapsAction: "Nutze Lücken zwischen Bäumen auf heißen Straßen als Orte für neue Pflanzungen.",
    high: "Hohes",
    medium: "Mittleres",
    low: "Niedriges",
    passKicker: "Punkt mit enger Überholung",
    risk: (level: string, r: string) => `${level} Risiko, ${r}`,
    riskIndex: "Risikoindex",
    ofOne: (r: string) => `${r} von 1`,
    pass50: "Punkte mit enger Überholung im Umkreis von 50 m",
    passMeans: "Ein Rad-Sensor hat hier ein Auto erfasst, das eng überholt hat. Der Risikoindex besteht zu 30 Prozent daraus, wie sicher der Sensor war, und zu 70 Prozent daraus, wie nah das Auto kam.",
    cluster: "Hier häufen sich mehrere Punkte, das macht das Signal stärker.",
    onePoint: "Ein Punkt ist ein Signal, kein Beweis. Achte auf Häufungen von Punkten.",
    passActions: ["Schau dir die Straße hier an: Breite der Spur, parkende Autos und Tempo.", "Wenn sich Punkte häufen, prüfe die Stelle vor Ort und setze sie auf die Liste der Lösungen."],
    waterKicker: "Trinkwasser",
    fountain: "Trinkbrunnen",
    waterType: "Öffentliches Trinkwasser, kartiert in OpenStreetMap",
    waterMeans: ["Ein Ort zum Auffüllen von Wasser, das hilft an heißen Tagen."],
    waterActions: ["Nimm ihn in Routen für heiße Tage und in Schulwegkarten auf.", "Prüfe, ob er im Sommer funktioniert."],
    waterSrc: "OpenStreetMap-Mitwirkende, amenity=drinking_water.",
  },
};

export function insightFor(sel: Selection, danger: DangerPoint[] | null, ct: CityTrees | null = null, lang: Lang = "en"): Insight | null {
  const t$ = TX[lang];
  const fa = (a: number) => fmtAnomaly(a, lang);
  const num = (n: number, opts?: Intl.NumberFormatOptions) => fmtNum(n, lang, opts);
  const dec = (n: number, d: number) => (lang === "de" ? n.toFixed(d).replace(".", ",") : n.toFixed(d));
  const heatLabel = (a: number) => (a >= 0.5 ? t$.warmer : a <= -0.5 ? t$.cooler : t$.average);
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
      { label: t$.type, value: isRow ? t$.rowOfTrees : t!.landmark ? t$.landmark : t$.single },
      { label: t$.species, value: name ?? t$.notTagged },
      { label: t$.mapped50, value: String(near) },
      { label: t$.heatHere, value: heat.avg === null ? t$.noHeat : `${fa(heat.avg)}, ${heatLabel(heat.avg)}` },
    ];
    if (water && water.m <= 600) facts.push({ label: t$.nearestWater, value: `${water.m} m` });
    const meaning = [t$.treesShade, near >= 10 ? t$.greener : t$.fewMapped];
    if (heat.avg !== null && heat.avg <= -0.5) meaning.push(t$.coolTree(fa(heat.avg)));
    return {
      kicker: isRow ? t$.treeRow : t$.tree,
      title: name ?? (isRow ? t$.treeRow : t$.streetTree),
      tone: "green",
      facts,
      meaning,
      actions: [...t$.treeActions],
      source: t$.osm + (heat.avg !== null ? ` ${t$.heatSrc}` : ""),
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
      { label: t$.sameWalk, value: `${fa(a)}, ${heatLabel(a)}` },
      { label: t$.avgHere, value: `${dec(temp, 1)} °C` },
      { label: t$.readings, value: num(n) },
      { label: ct ? t$.city50 : t$.mapped50, value: big === null || near === 0 ? String(near) : t$.bigCrowns(near, big) },
    ];
    if (water) facts.push({ label: t$.nearestWater, value: `${water.m} m` });
    const meaning = [t$.spotMeans(fa(a), dec(Math.abs(a), 1), a >= 0), t$.snapshot];
    if (warm && near < 5) meaning.push(ct ? t$.gapCity : t$.gapOsm);
    if (cool && near >= 10) meaning.push(t$.coolMany);
    const actions = warm ? [...t$.warmActions] : cool ? [...t$.coolActions] : [...t$.avgActions];
    return {
      kicker: t$.heatKicker,
      title: warm ? t$.warmSpot : cool ? t$.coolSpot : t$.avgSpot,
      tone: warm ? "heat" : cool ? "cool" : "ink",
      facts,
      meaning,
      actions,
      source: t$.heatSrc + (ct ? ` ${t$.reg}` : ""),
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
    const facts = [
      { label: t$.type, value: t$.typeName[t.type] ?? (t.type || t$.notGiven) },
      { label: t$.latin, value: t.latin || t$.notGiven },
      { label: t$.crownWidth, value: t.crown ? `${num(t.crown)} m${t.crown === 2 ? t$.maybeDefault : ""}` : t$.notGiven },
      { label: group ? t$.trunkAll : t$.trunk, value: t.trunk ? `${num(t.trunk / 100, { maximumFractionDigits: 2 })} m` : t$.notGiven },
      { label: t$.street, value: [t.street, t.district].filter(Boolean).join(", ") || t$.notGiven },
      { label: t$.city50, value: String(nearIds.length - 1) },
    ];
    if (heat.avg !== null) facts.push({ label: t$.heatHere, value: `${fa(heat.avg)}, ${heatLabel(heat.avg)}` });
    const meaning: string[] = [];
    const cs = lang === "de" ? num(t.crown) : String(t.crown);
    if (t.crown >= 12) meaning.push(t$.bigCrown(cs, Math.round((Math.PI * t.crown * t.crown) / 4)));
    else if (t.crown >= 6) meaning.push(t$.usefulCrown(cs));
    else if (t.crown > 0) meaning.push(t.crown === 2 ? t$.defaultCrown : t$.smallCrown);
    if (!group && t.trunk >= 250) meaning.push(t$.bigTrunk(dec(t.trunk / 100, 2)));
    if (group) meaning.push(t$.groupNote);
    if (heat.avg !== null && heat.avg >= 0.5) meaning.push(t$.warmTree);
    if (!meaning.length) meaning.push(t$.everyTree);
    return {
      kicker: t$.regKicker,
      title: t.name,
      tone: "green",
      facts,
      meaning,
      actions: [t$.protectTree, t.crown >= 8 ? t$.bigCrownAction : t$.youngAction, t$.gapsAction],
      source: t$.reg + (heat.avg !== null ? ` ${t$.heatSrc}` : ""),
      at,
    };
  }

  if (sel.kind === "danger") {
    const p = sel.point;
    const level = p.risk >= 0.8 ? t$.high : p.risk >= 0.5 ? t$.medium : t$.low;
    const nearby = danger ? danger.filter((d) => distM([p.lat, p.lng], [d.lat, d.lng]) <= 50).length : 1;
    return {
      kicker: t$.passKicker,
      title: t$.risk(level, dec(p.risk, 2)),
      tone: p.risk >= 0.8 ? "soon" : "next",
      facts: [
        { label: t$.riskIndex, value: t$.ofOne(dec(p.risk, 2)) },
        { label: t$.pass50, value: String(nearby) },
      ],
      meaning: [t$.passMeans, nearby >= 5 ? t$.cluster : t$.onePoint],
      actions: [...t$.passActions],
      source: t$.atrai,
      at: [p.lat, p.lng],
    };
  }

  if (sel.kind === "water") {
    const w = WATER[sel.id];
    if (!w) return null;
    return {
      kicker: t$.waterKicker,
      title: w.name ?? t$.fountain,
      tone: "cool",
      facts: [{ label: t$.type, value: t$.waterType }],
      meaning: [...t$.waterMeans],
      actions: [...t$.waterActions],
      source: t$.waterSrc,
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
