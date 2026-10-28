"use client";
// Reads an uploaded file into the rows the approval demo checks. CSV, TSV and
// Excel (.xlsx) all become CSV text first, so every check is the same for every
// format. GeoJSON keeps its own path. Everything stays in this browser.
import { REQUIRED, parseFile, type Parsed } from "./approval";

export const ACCEPT = {
  all: ".csv,.tsv,.txt,.xlsx,.json,.geojson,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: ".csv,.tsv,.txt,text/csv,text/tab-separated-values",
  excel: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  geojson: ".json,.geojson,application/json",
};
export const MAX_BYTES = 5_000_000;

const cell = (v: unknown) => {
  if (v == null) return "";
  const t = v instanceof Date ? v.toISOString().slice(0, 19) : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n");

/** Reads one file. Throws an Error with a plain message when the format is not supported. */
export async function readUpload(f: File): Promise<Parsed> {
  const name = f.name.toLowerCase();
  if (f.size > MAX_BYTES) throw new Error("File is over 5 MB. Split it into smaller files.");
  if (name.endsWith(".xls")) throw new Error("Old .xls files are not supported. In Excel, save as .xlsx or CSV and upload again.");
  if (name.endsWith(".xlsx")) {
    // Loaded only when someone uploads Excel, so the reader is not in every page.
    const { readSheet } = await import("read-excel-file/browser");
    const rows = (await readSheet(f)) as unknown[][];
    return parseFile(f.name, toCsv(rows), true);
  }
  if (name.endsWith(".tsv") || name.endsWith(".txt")) {
    const text = (await f.text()).replace(/^﻿/, "");
    return parseFile(f.name, toCsv(text.split(/\r?\n/).map((l) => l.split("\t"))), true);
  }
  if (name.endsWith(".csv") || name.endsWith(".json") || name.endsWith(".geojson")) return parseFile(f.name, await f.text());
  throw new Error("Use a CSV, Excel (.xlsx), TSV, or GeoJSON file in the Collect data template.");
}

/** The template: the header row only, so no example value is ever taken for a reading. */
export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([REQUIRED.join(",") + "\n"], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "grunroute-data-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A file picked on another page waits here until the approval step on Data and missions reads it.
let pending: File | null = null;
export const setPendingUpload = (f: File) => (pending = f);
export function takePendingUpload(): File | null {
  const f = pending;
  pending = null;
  return f;
}
