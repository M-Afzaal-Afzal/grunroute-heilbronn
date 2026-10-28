"use client";
// Case workflow for the street dossier. Demo only: saved in this browser
// (localStorage), never sent anywhere.
import { useSyncExternalStore } from "react";

export const STATUSES = [
  "New",
  "Ground check planned",
  "Checked on the ground",
  "Fix proposed",
  "Fix planned",
  "Fixed, measure again",
  "Not needed",
] as const;
export type Status = (typeof STATUSES)[number];
export type CaseEntry = { status: Status; lead: string; fixType: string; notes: string; history: { status: Status; at: string }[] };
export type Cases = Record<string, CaseEntry>;

const KEY = "planner.cases";
const EVENT = "planner:cases";
let cachedRaw: string | null = null;
let cached: Cases = {};

function read(): Cases {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? (JSON.parse(raw) as Cases) : {};
  } catch {
    cached = {};
  }
  return cached;
}
const EMPTY: Cases = {};

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCases(): Cases {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const statusOf = (cases: Cases, id: number | string): Status => cases[String(id)]?.status ?? "New";

export function saveCase(id: number | string, patch: Partial<Omit<CaseEntry, "history">>) {
  const all = { ...read() };
  const prev: CaseEntry = all[String(id)] ?? { status: "New", lead: "", fixType: "", notes: "", history: [] };
  const next: CaseEntry = { ...prev, ...patch };
  if (patch.status && patch.status !== prev.status) next.history = [...prev.history, { status: patch.status, at: new Date().toISOString() }];
  all[String(id)] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}
