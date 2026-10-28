"use client";
// Page state in the URL query, so any view can be shared as a link.
// Reads once on mount, then writes with history.replaceState.
import { useCallback, useEffect, useState } from "react";

export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void, boolean] {
  const [state, setState] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      const v = q.get(k as string);
      if (v != null) next[k] = v as T[keyof T];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one time read of the URL after hydration
    setState(next);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = useCallback(
    (patch: Partial<T>) =>
      setState((prev) => {
        const next = { ...prev, ...patch };
        const q = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(next)) {
          if (v === defaults[k]) q.delete(k);
          else q.set(k, v as string);
        }
        const s = q.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
        return next;
      }),
    [defaults],
  );
  return [state, update, ready];
}
