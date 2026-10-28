"use client";
// Planting plan, demo only: saved in this browser (localStorage), never sent.
import { useSyncExternalStore } from "react";

export type PlanItem = { id: number; trees: number; spacing: number; added: string };
export type Plan = PlanItem[];

const KEY = "planner.plan";
const EVENT = "planner:plan";
const EMPTY: Plan = [];
let cachedRaw: string | null = null;
let cached: Plan = EMPTY;

function read(): Plan {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? (JSON.parse(raw) as Plan) : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(plan: Plan) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    // private mode: the plan lives until reload
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export const usePlan = (): Plan => useSyncExternalStore(subscribe, read, () => EMPTY);

export function savePlanItem(item: Omit<PlanItem, "added">) {
  const plan = read().filter((p) => p.id !== item.id);
  write([...plan, { ...item, added: new Date().toISOString().slice(0, 10) }]);
}
export const removePlanItem = (id: number) => write(read().filter((p) => p.id !== id));
export const clearPlan = () => write([]);
export const COST_KEY = "planner.treeCost";
