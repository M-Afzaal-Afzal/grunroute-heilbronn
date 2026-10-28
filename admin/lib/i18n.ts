// German and English text for the print pages. German is the default, since
// the reports go to city teams. Values come from segments.json, only the
// words change.
import type { MeasureKey, Segment, Support } from "./shared/priority";
import { measureDetail } from "./shared/segments";
import { fmtAnomaly } from "./shared/geo";

export type Lang = "de" | "en";

export const T = {
  de: {
    title: "Straßen-Dossier",
    top10: "Top 10 Straßen",
    district: "Stadtteil",
    length: "Länge",
    score: "Fix-Score",
    support: "Datenbasis",
    preset: "Gewichtung",
    rank: "Rang",
    notListed: "nicht gelistet",
    ranks: "Rang je Gewichtung",
    measures: "Messgrößen",
    measure: "Messgröße",
    weight: "Gewicht",
    value: "Rohwert",
    percentile: "Perzentil",
    count: "Anzahl",
    source: "Quelle",
    licence: "Lizenz",
    littleData: "wenig Daten",
    limits: "Grenzen der Aussage",
    sources: "Quellen und Lizenzen",
    map: "Karte: Straße, Baumkronen aus dem Baumkataster, Hitze-Spots, Unfälle und Schulen in der Nähe. Kartengrundlage OpenStreetMap.",
    built: "Datenstand",
    printed: "Gedruckt",
    print: "Drucken oder als PDF speichern",
    back: "Zurück",
    of: "von",
    segments: "ATRAI-Abschnitte",
    closing: "Screening-Werkzeug. Endgültige Entscheidungen nutzen amtliche Daten der Stadt.",
    rule150:
      "150 cm ist der Mindestabstand beim Überholen für Autos innerorts in Deutschland. Sensorwerte sind Schätzungen und beweisen nicht, dass ein einzelnes Überholen gegen die Regel verstieß.",
    weak: "Schwache Datenbasis, zuerst vor Ort prüfen.",
    limitsList: [
      "Screening-Werkzeug, keine rechtliche Bewertung. Keine Aussage über Grenzwerte.",
      "Sensorwerte stammen aus einer Rad-Sensor-Kampagne (Dez 2025 bis Okt 2026) und sind Schätzungen, keine amtlichen Messungen.",
      "Hitze-Werte sind Abweichungen vom Median desselben Rundgangs (1. bis 3. Sep 2026), keine Lufttemperaturen.",
      "Das Kronendach ist aus den Kronendurchmessern im Baumkataster geschätzt. Nur öffentliche Bäume.",
      "Fehlende Daten bleiben als wenig Daten markiert und werden nicht aufgefüllt.",
      "Datenbasis: Hoch ab 10 Punkten, Mittel 3 bis 9, Niedrig 1 bis 2.",
    ],
    measureLabel: { safety: "Enge Überholungen", heat: "Hitze-Spots", shadeGap: "Wenig Schatten", dust: "Gefahr und Staub", rough: "Rauer Belag", stopgo: "Stop-and-go", crashes: "Unfälle" } as Record<MeasureKey, string>,
    band: { "Fix soon": "Bald angehen", "Plan next": "Als Nächstes planen", "Check later": "Später prüfen" } as Record<string, string>,
    supportLabel: { High: "Hoch", Medium: "Mittel", Low: "Niedrig" } as Record<Support, string>,
    noSupport: "Keine",
  },
  en: {
    title: "Street dossier",
    top10: "Top 10 streets",
    district: "District",
    length: "Length",
    score: "Fix score",
    support: "Data support",
    preset: "Weights",
    rank: "Rank",
    notListed: "not listed",
    ranks: "Rank under each preset",
    measures: "Measures",
    measure: "Measure",
    weight: "Weight",
    value: "Raw value",
    percentile: "Percentile",
    count: "Count",
    source: "Source",
    licence: "Licence",
    littleData: "little data",
    limits: "Honest limits",
    sources: "Sources and licences",
    map: "Map: the street, register tree crowns, heat walk spots, crashes and schools nearby. Base map OpenStreetMap.",
    built: "Data built",
    printed: "Printed",
    print: "Print or save as PDF",
    back: "Back",
    of: "of",
    segments: "ATRAI segments",
    closing: "Screening tool. Final decisions use official city data.",
    rule150: "150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule.",
    weak: "Weak evidence, check on the ground first.",
    limitsList: [
      "Screening tool, not a legal finding. It says nothing about legal limits.",
      "Sensor values come from a bike sensor campaign (Dec 2025 to Oct 2026). They are estimates, not official measurements.",
      "Heat values are differences from the median of the same walk (1 to 3 Sep 2026), not air temperatures.",
      "Crown cover is estimated from crown diameters in the tree register. Public trees only.",
      "Missing data stays marked as little data and is never filled in.",
      "Data support: High 10+ points, Medium 3 to 9, Low 1 to 2.",
    ],
    measureLabel: { safety: "Close passes", heat: "Hot spots", shadeGap: "Little shade", dust: "Danger and dust", rough: "Rough surface", stopgo: "Stop and go", crashes: "Crashes" } as Record<MeasureKey, string>,
    band: { "Fix soon": "Fix soon", "Plan next": "Plan next", "Check later": "Check later" } as Record<string, string>,
    supportLabel: { High: "High", Medium: "Medium", Low: "Low" } as Record<Support, string>,
    noSupport: "None",
  },
};

const de = (n: number, d = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const pctDe = (v: number) => `${Math.round(v * 100)} %`;

/** Raw value and count for one measure, in the chosen language. */
export function measureText(s: Segment, key: MeasureKey, lang: Lang): { value: string; count: string } | null {
  if (lang === "en") return measureDetail(s, key);
  const r = s.raw;
  const v = s.m[key];
  if (v == null) return null;
  switch (key) {
    case "safety":
      return { value: `${pctDe(v)} der Überholungen unter 150 cm, mittlerer Abstand ${r.gapCm} cm`, count: `${de(r.passes)} gemessene Überholungen` };
    case "heat":
      return { value: `${fmtAnomaly(v).replace(".", ",")} gegenüber demselben Rundgang`, count: `${r.heatSpots} Hitze-Spots, ${de(s.cov.heat)} Messwerte` };
    case "shadeGap":
      if (r.shade) return { value: `etwa ${pctDe(r.shade[2])} im Schatten um 15 Uhr am 21. Juli, Schätzung aus OSM-Gebäudehöhen und Baumkronen`, count: `Kronendach etwa ${pctDe(r.crownCover ?? 0)}, ${de(r.trees)} Katasterbäume im Umkreis von 20 m` };
      return { value: `Kronendach etwa ${pctDe(r.crownCover ?? 0)}, Schätzung aus dem Baumkataster`, count: `${de(r.trees)} Katasterbäume im Umkreis von 20 m` };
    case "dust":
      return { value: `Gefahr- und Staubindex ${de(v, 2)} von 1`, count: `${de(s.cov.dust)} Sensorpunkte` };
    case "rough":
      return { value: `Rauheit ${de(v)} von 100`, count: `${s.cov.rough} Sensorboxen` };
    case "stopgo":
      return { value: `Verkehrsfluss ${de(r.flow ?? 0, 2)} von 1, 0 heißt Stop-and-go`, count: `${de(s.cov.stopgo)} Sensorpunkte` };
    case "crashes": {
      const [k, se, sl] = r.crashesByCat;
      return {
        value: r.crashes ? `${r.crashes} Unfälle mit Personenschaden (Rad oder zu Fuß) im Umkreis von 25 m, 2021 bis 2025` : "kein Unfall mit Personenschaden (Rad oder zu Fuß) im Umkreis von 25 m, 2021 bis 2025",
        count: r.crashes ? `getötet ${k}, schwer verletzt ${se}, leicht verletzt ${sl}` : "polizeilich erfasste Unfälle",
      };
    }
  }
}
