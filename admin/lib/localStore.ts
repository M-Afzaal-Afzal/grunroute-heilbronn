"use client";
// A JSON value in localStorage as a React store, the same pattern as the
// planting plan (lib/plan.ts). Demo state only, never sent anywhere.
import { useSyncExternalStore } from "react";

export function localStore<T>(key: string, empty: T) {
  const event = `planner:${key}`;
  let cachedRaw: string | null = null;
  let cached = empty;
  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as T) : empty;
    } catch {
      cached = empty;
    }
    return cached;
  };
  const write = (v: T | null) => {
    try {
      if (v == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // Storage blocked: nothing is kept.
    }
    window.dispatchEvent(new Event(event));
  };
  const subscribe = (cb: () => void) => {
    window.addEventListener(event, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(event, cb);
      window.removeEventListener("storage", cb);
    };
  };
  const use = (): T => useSyncExternalStore(subscribe, read, () => empty);
  return { use, write, read };
}
