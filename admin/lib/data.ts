"use client";
// Loads segments.json once and builds the street level view (Part 0 rules in
// lib/shared/priority.ts). Every number in the Planner comes from here or
// from the other files in public/data, never typed in.
import { useEffect, useState } from "react";
import { loadSegments } from "./shared/segments";
import { aggregateStreets, percentiles, type Percentiles, type Segment, type SegmentsMeta, type Street } from "./shared/priority";

export type PlannerData = {
  meta: SegmentsMeta;
  segments: Segment[];
  streets: Street[];
  streetPct: Percentiles;
  segPct: Percentiles;
  streetById: Map<number, Street>;
  segById: Map<number, Segment>;
  /** Segment id to the id of the street it belongs to. */
  streetOfSeg: Map<number, number>;
};

let pending: Promise<PlannerData> | null = null;
export function loadPlannerData(): Promise<PlannerData> {
  if (!pending) {
    pending = loadSegments().then(({ meta, segments }) => {
      const streets = aggregateStreets(segments);
      const streetOfSeg = new Map<number, number>();
      for (const st of streets) for (const id of st.segIds) streetOfSeg.set(id, st.id);
      return {
        meta,
        segments,
        streets,
        streetPct: percentiles(streets),
        segPct: percentiles(segments),
        streetById: new Map(streets.map((s) => [s.id, s])),
        segById: new Map(segments.map((s) => [s.id, s])),
        streetOfSeg,
      };
    });
    pending.catch(() => (pending = null));
  }
  return pending;
}

export function usePlannerData() {
  const [data, setData] = useState<PlannerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadPlannerData().then(
      (d) => live && setData(d),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, []);
  return { data, error };
}

/** Plain JSON loader with a cache, for the other data files. */
const cache = new Map<string, Promise<unknown>>();
export function loadJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export function useJson<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    loadJson<T>(path).then(
      (d) => live && setData(d),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [path]);
  return { data, error };
}

export const nf = (n: number) => n.toLocaleString("en-GB");
export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "n/a");
