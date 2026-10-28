"use client";
// Regulations and documents library, demo only. A document is stored in this
// browser (details in localStorage, the file in IndexedDB) and tagged with the
// street labels it applies to. The Planner never reads or interprets a
// document: it only keeps it and links it next to the label.
import { localStore } from "./localStore";
import type { PhenomenonId } from "./phenomena";

export type Doc = { id: string; title: string; file: string; type: string; size: number; at: string; labels: PhenomenonId[] };

export const DOC_ACCEPT = ".pdf,.doc,.docx,.odt,.txt,.md,.html,.htm,application/pdf,text/plain,text/markdown,text/html";
export const DOC_MAX_BYTES = 20_000_000;
export const DOC_NOTE = "Demo: documents stay in this browser. The Planner does not read or check them, it only links them to the labels you choose.";

const meta = localStore<Doc[]>("planner.docs", []);
export const useDocs = meta.use;

const DB = "grunroute-planner";
const STORE = "docs";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = run(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Adds a file to the library. Throws an Error with a plain message when it cannot be kept. */
export async function addDoc(f: File): Promise<Doc> {
  if (f.size > DOC_MAX_BYTES) throw new Error("File is over 20 MB.");
  if (!/\.(pdf|docx?|odt|txt|md|html?)$/i.test(f.name)) throw new Error("Use a PDF, Word (.doc, .docx), OpenDocument (.odt), text, or HTML file.");
  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await tx("readwrite", (s) => s.put(f, id));
  const doc: Doc = { id, title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), file: f.name, type: f.type, size: f.size, at: new Date().toISOString(), labels: [] };
  meta.write([doc, ...(meta.read() ?? [])]);
  return doc;
}

export function updateDoc(id: string, patch: Partial<Pick<Doc, "title" | "labels">>) {
  meta.write((meta.read() ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

export async function removeDoc(id: string) {
  await tx("readwrite", (s) => s.delete(id)).catch(() => undefined);
  meta.write((meta.read() ?? []).filter((d) => d.id !== id));
}

/** Opens the stored file in a new tab. */
export async function openDoc(d: Doc) {
  const blob = (await tx<Blob | undefined>("readonly", (s) => s.get(d.id) as IDBRequest<Blob | undefined>)) ?? null;
  if (!blob) throw new Error("The file is no longer in this browser.");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const sizeText = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
