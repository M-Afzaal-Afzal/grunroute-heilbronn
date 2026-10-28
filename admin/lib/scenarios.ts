"use client";
// Saved weight scenarios for Fix first. This browser only (localStorage).
import { useSyncExternalStore } from "react";

export type Scenario = { name: string; code: string; saved: string };
const KEY = "planner.scenarios";
const EVENT = "planner:scenarios";
let raw: string | null = null;
let list: Scenario[] = [];
const EMPTY: Scenario[] = [];

function read(): Scenario[] {
  let r: string | null = null;
  try {
    r = localStorage.getItem(KEY);
  } catch {
    r = null;
  }
  if (r === raw) return list;
  raw = r;
  try {
    list = r ? (JSON.parse(r) as Scenario[]) : [];
  } catch {
    list = [];
  }
  return list;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export const useScenarios = () => useSyncExternalStore(subscribe, read, () => EMPTY);

function write(next: Scenario[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked storage */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function saveScenario(name: string, code: string) {
  const clean = name.trim().slice(0, 40) || "Scenario";
  write([...read().filter((s) => s.name !== clean), { name: clean, code, saved: new Date().toISOString() }]);
}
export const deleteScenario = (name: string) => write(read().filter((s) => s.name !== name));
