// CSV and GeoJSON downloads with the attribution and the weights used.
import { MEASURES, type Weights } from "./shared/priority";
import { DATA_BUILT } from "./shared/build-info";

export const ATTRIBUTION = [
  "ATRAI bike sensor campaign Heilbronn (hackathon organisers)",
  "Heat Island Summer School heat walks, Sep 2026",
  "Stadt Heilbronn, Baumkataster, Stand 01.01.2026, dl-de/by-2-0",
  "Unfallatlas, Statistische Ämter des Bundes und der Länder, dl-de/by-2-0",
  "OpenStreetMap contributors, ODbL",
];

export function exportHeader(presetLabel: string, weights: Weights) {
  return [
    "GrünRoute Planner export. Screening tool, final decisions use official city data.",
    `Data built ${DATA_BUILT ?? "unknown"}, exported ${new Date().toISOString().slice(0, 10)}`,
    `Preset: ${presetLabel}. Weights: ${MEASURES.map((m) => `${m.label} ${weights[m.key]}`).join(", ")}`,
    `Sources: ${ATTRIBUTION.join("; ")}`,
  ];
}

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], columns: string[], rows: unknown[][]) {
  return [...header.map((h) => `# ${h}`), columns.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** [lat, lng] lines to a GeoJSON geometry ([lng, lat]). */
export const lineGeometry = (lines: [number, number][][]) =>
  lines.length === 1
    ? { type: "LineString", coordinates: lines[0].map(([a, b]) => [b, a]) }
    : { type: "MultiLineString", coordinates: lines.map((l) => l.map(([a, b]) => [b, a])) };
