// New data approval, dev mode demo. A file in the Collect data template
// (app/data-collection in the people app) is checked, its rows are matched to
// streets, and the close pass rows are merged into a copy of the street
// measures so old and new scores can be compared. Nothing leaves the
// browser. Released versions live in localStorage and only feed this demo.
import { percentiles, rankSegments, enoughData, type Street } from "@/lib/shared/priority";
import type { ActivePreset } from "@/lib/preset";
import { localStore } from "@/lib/localStore";

export const REQUIRED = ["place", "time", "pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity", "close_pass_distance_cm"];
const NUMERIC = ["pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity", "close_pass_distance_cm"];
export const DEMO_LABEL = "dev mode demo, nothing is sent or stored on a server";
export const POINT_MATCH_M = 30;

export type Row = { line: number; place: string; time: string; lat?: number; lng?: number; values: Record<string, number | null> };
export type RowIssue = { line: number; text: string; level: "error" | "warning" };
export type Match = { row: Row; streetId: number | null; why: string };
export type Parsed = { file: string; kind: "csv" | "geojson"; rows: Row[]; issues: RowIssue[]; missingCols: string[] };

/** One street's new close pass readings: count and how many under 150 cm, plus the sum of distances. */
export type Delta = { streetId: number; passes: number; under150: number; sumCm: number };
export type Version = { id: string; at: string; file: string; rows: number; deltas: Delta[] };

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function checkRow(line: number, get: (k: string) => unknown, issues: RowIssue[], lat?: number, lng?: number): Row | null {
  const place = String(get("place") ?? "").trim();
  const time = String(get("time") ?? "").trim();
  let ok = true;
  if (!place && lat == null) {
    issues.push({ line, text: "No place.", level: "error" });
    ok = false;
  }
  if (!time || Number.isNaN(Date.parse(time))) {
    issues.push({ line, text: `Time "${time}" is not a date and time.`, level: "error" });
    ok = false;
  }
  const values: Record<string, number | null> = {};
  for (const k of NUMERIC) {
    const raw = get(k);
    if (raw == null || String(raw).trim() === "") {
      values[k] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
    issues.push({ line, text: `${k} "${raw}" is not a number.`, level: "error" });
    ok = false;
  }
    else values[k] = n;
  }
  if (values.humidity != null && values.humidity > 75) issues.push({ line, text: "Humidity over 75%, dust readings may read high.", level: "warning" });
  if (values.close_pass_distance_cm != null && (values.close_pass_distance_cm <= 0 || values.close_pass_distance_cm > 400))
    {
    issues.push({ line, text: "Close pass distance outside 1 to 400 cm, row skipped.", level: "error" });
    ok = false;
  }
  return ok ? { line, place, time, lat, lng, values } : null;
}

export function parseFile(name: string, text: string): Parsed {
  const issues: RowIssue[] = [];
  const rows: Row[] = [];
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
    const head = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
    const missingCols = REQUIRED.filter((c) => !head.includes(c));
    if (!missingCols.length)
      lines.slice(1).forEach((l, i) => {
        const cells = splitCsvLine(l);
        const r = checkRow(i + 2, (k) => cells[head.indexOf(k)], issues);
        if (r) rows.push(r);
      });
    return { file: name, kind: "csv", rows, issues, missingCols };
  }
  let json: { type?: string; features?: { geometry?: { type?: string; coordinates?: number[] }; properties?: Record<string, unknown> }[] };
  try {
    json = JSON.parse(text);
  } catch {
    return { file: name, kind: "geojson", rows, issues: [{ line: 0, text: "The file is not valid JSON.", level: "error" }], missingCols: [] };
  }
  const feats = json.type === "FeatureCollection" && Array.isArray(json.features) ? json.features : [];
  if (!feats.length) issues.push({ line: 0, text: "No features. A GeoJSON FeatureCollection of Point features is expected.", level: "error" });
  const missingCols = feats.length ? REQUIRED.filter((c) => c !== "place" && !feats.every((f) => f.properties && c in f.properties)) : [];
  if (!missingCols.length)
    feats.forEach((f, i) => {
      const c = f.geometry?.type === "Point" ? f.geometry.coordinates : undefined;
      if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
        issues.push({ line: i + 1, text: "Feature is not a Point with coordinates.", level: "error" });
        return;
      }
      const r = checkRow(i + 1, (k) => f.properties?.[k], issues, c[1], c[0]);
      if (r) rows.push(r);
    });
  return { file: name, kind: "geojson", rows, issues, missingCols };
}

/** Street names are compared without case, with "strasse" read as "straße". */
export const normName = (s: string) => s.toLowerCase().replace(/strasse\b/g, "straße").replace(/str\.$/, "straße").replace(/\s+/g, " ").trim();

const KY = 111200;
const KX = 111320 * Math.cos((49.14 * Math.PI) / 180);
function distToLine(lat: number, lng: number, line: [number, number][]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = line[i - 1][1] * KX, ay = line[i - 1][0] * KY, bx = line[i][1] * KX, by = line[i][0] * KY;
    const px = lng * KX, py = lat * KY;
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}

export function matchRows(rows: Row[], streets: Street[]): Match[] {
  const byName = new Map<string, Street[]>();
  for (const s of streets) {
    if (!s.name) continue;
    const k = normName(s.name);
    byName.set(k, [...(byName.get(k) ?? []), s]);
  }
  return rows.map((row) => {
    if (row.lat != null && row.lng != null) {
      let best: Street | null = null;
      let d = Infinity;
      for (const s of streets)
        for (const l of s.lines) {
          const x = distToLine(row.lat, row.lng, l);
          if (x < d) {
            d = x;
            best = s;
          }
        }
      return d <= POINT_MATCH_M && best ? { row, streetId: best.id, why: `${Math.round(d)} m from the street` } : { row, streetId: null, why: `No street within ${POINT_MATCH_M} m` };
    }
    const hits = byName.get(normName(row.place)) ?? [];
    if (hits.length === 1) return { row, streetId: hits[0].id, why: "Street name" };
    if (hits.length > 1) return { row, streetId: null, why: `Name used in ${hits.length} districts, add coordinates (GeoJSON) to match` };
    return { row, streetId: null, why: "No street with this name in the data" };
  });
}

export function deltasOf(matches: Match[]): Delta[] {
  const by = new Map<number, Delta>();
  for (const m of matches) {
    const cm = m.row.values.close_pass_distance_cm;
    if (m.streetId == null || cm == null) continue;
    const d = by.get(m.streetId) ?? { streetId: m.streetId, passes: 0, under150: 0, sumCm: 0 };
    d.passes++;
    if (cm < 150) d.under150++;
    d.sumCm += cm;
    by.set(m.streetId, d);
  }
  return [...by.values()];
}

/**
 * Copy of the streets with the deltas merged into the close pass measure:
 * share under 150 cm and mean gap over old plus new passes, and the support
 * count raised by the new passes. Street values in the build are length
 * weighted means of segments, so this pooled merge is an approximation.
 */
export function mergeDeltas(streets: Street[], deltas: Delta[]): Street[] {
  const by = new Map<number, Delta>();
  for (const d of deltas) {
    const a = by.get(d.streetId);
    by.set(d.streetId, a ? { ...a, passes: a.passes + d.passes, under150: a.under150 + d.under150, sumCm: a.sumCm + d.sumCm } : { ...d });
  }
  return streets.map((s) => {
    const d = by.get(s.id);
    if (!d) return s;
    const passes = s.raw.passes + d.passes;
    const under = s.raw.under150 + d.under150;
    const oldSum = (s.raw.gapCm ?? 0) * (s.raw.gapCm == null ? 0 : s.raw.passes);
    const oldN = s.raw.gapCm == null ? 0 : s.raw.passes;
    const gapCm = Math.round((oldSum + d.sumCm) / (oldN + d.passes));
    return {
      ...s,
      m: { ...s.m, safety: Math.round((under / passes) * 1000) / 1000, gap: gapCm },
      cov: { ...s.cov, safety: s.cov.safety + d.passes },
      raw: { ...s.raw, passes, under150: under, gapCm },
    };
  });
}

export type RankInfo = { score: number | null; rank: number | null; support: string | null; passes: number };
export function rankMap(streets: Street[], active: ActivePreset): Map<number, RankInfo> {
  const scored = rankSegments(streets, active.preset, percentiles(streets));
  const out = new Map<number, RankInfo>();
  let n = 0;
  for (const x of scored) {
    const ok = x.score != null && x.seg.length >= 20 && enoughData(x);
    out.set(x.seg.id, { score: x.score, rank: ok ? ++n : null, support: x.support, passes: x.seg.raw.passes });
  }
  return out;
}

export const allDeltas = (versions: Version[]) => versions.flatMap((v) => v.deltas);

const store = localStore<Version[]>("planner.dataVersions", []);
export const useVersions = store.use;
export const writeVersions = (v: Version[]) => store.write(v);
