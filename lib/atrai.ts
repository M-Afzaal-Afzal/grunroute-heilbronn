import type { DangerPoint } from "./geo";

// ATRAI danger_zones_heilbronn: 7,095 points where a bike sensor recorded a
// close overtaking manoeuvre. Risk Index Overtaking runs from 0 to 1:
// 0.3 x manoeuvre confidence + 0.7 x (1 - distance / 400 cm).
// Read in the browser from the public ATRAI API when needed. Nothing is sent
// except the request itself.
const URL = "https://api.atrai.bike/collections/danger_zones_heilbronn/items?f=json&limit=10000";

let cache: Promise<DangerPoint[]> | null = null;

type Feature = { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> };

export function loadDangerPoints(): Promise<DangerPoint[]> {
  if (!cache) {
    cache = fetch(URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ features?: Feature[] }>;
      })
      .then((j) =>
        (j.features || [])
          .map((f, i) => {
            const c = f.geometry?.coordinates;
            const risk = Number(f.properties?.["Risk Index Overtaking"]);
            if (!c || !Number.isFinite(risk)) return null;
            return { id: Number(f.properties?.id ?? i), lat: c[1], lng: c[0], risk };
          })
          .filter((p): p is DangerPoint => p !== null)
      )
      .catch((e) => {
        cache = null; // allow a retry later
        throw e;
      });
  }
  return cache;
}
