"use client";
// The preset in use, shared by the top bar, Overview, and Fix first. Kept in
// this browser only (localStorage). Fix first also writes it to the URL.
import { useSyncExternalStore } from "react";
import { PRESETS, decodeWeights, encodeWeights, presetById, presetForWeights, type Preset, type Weights } from "./shared/priority";

const KEY = "planner.preset";
const EVENT = "planner:preset";
const DEFAULT = "balanced";

/** Stored as a preset id ("cool") or custom weights ("w1102000"). */
const valid = (v: string | null) => !!v && (!!presetById(v) || (v.startsWith("w") && !!decodeWeights(v.slice(1))));

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    return valid(v) ? v! : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Saves a preset id, or custom weights (matched back to a preset when equal). */
export function savePreset(choice: string | Weights) {
  const v = typeof choice === "string" ? choice : (presetForWeights(choice) ?? `w${encodeWeights(choice)}`);
  if (!valid(v)) return;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode: keep going without saving */
  }
  window.dispatchEvent(new Event(EVENT));
}

export type ActivePreset = { code: string; label: string; preset: Pick<Preset, "weights" | "schoolBoost" | "gapOnly">; id: string | null };

export function resolvePreset(code: string): ActivePreset {
  const p = presetById(code);
  if (p) return { code, label: p.label, preset: p, id: p.id };
  const w = decodeWeights(code.slice(1)) ?? PRESETS[0].weights;
  return { code, label: "Custom weights", preset: { weights: w }, id: null };
}

/** The preset in use in this browser. Balanced until someone picks another one. */
export function useActivePreset(): ActivePreset {
  const code = useSyncExternalStore(subscribe, read, () => DEFAULT);
  return resolvePreset(code);
}
