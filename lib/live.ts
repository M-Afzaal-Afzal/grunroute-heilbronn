// Live openSenseMap boxes inside the Heilbronn city boundary, read in the browser.
// Context only: a live value never changes a street score. No imports, so
// `node --test` can load the pure helpers directly.

export type Ring = [number, number][];
export type BoundaryGeo = { features: { geometry: { type: string; coordinates: unknown } }[] };

/** Outer rings of the boundary polygons, as [lng, lat]. */
export function boundaryRings(geo: BoundaryGeo): Ring[] {
  const rings: Ring[] = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (g.type === "Polygon") rings.push((g.coordinates as Ring[])[0]);
    if (g.type === "MultiPolygon") for (const p of g.coordinates as Ring[][]) rings.push(p[0]);
  }
  return rings;
}

/** Ray casting point in polygon over [lng, lat] rings. */
export function insideRings(rings: Ring[], lng: number, lat: number): boolean {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

export function ringsBbox(rings: Ring[]): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of rings) for (const [x, y] of r) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  return [w, s, e, n];
}

/** A reading is usable when it is a finite number and not below 0 (negative dust or broken sensors). */
export const usableValue = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const FRESH_MS = 2 * 60 * 60 * 1000;

export type LiveReading = { value: number; unit: string; at: string };
export type LiveBox = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  updatedAt: string;
  fresh: boolean;
  temp: LiveReading | null;
  pm10: LiveReading | null;
  pm25: LiveReading | null;
};

type RawBox = {
  _id?: string;
  name?: string;
  updatedAt?: string;
  currentLocation?: { coordinates?: number[] };
  sensors?: { title?: string; unit?: string; lastMeasurement?: { value?: unknown; createdAt?: string } | string | null }[];
};

function reading(box: RawBox, match: (t: string) => boolean): LiveReading | null {
  for (const sn of box.sensors ?? []) {
    const lm = sn.lastMeasurement;
    if (!lm || typeof lm === "string" || !lm.createdAt) continue;
    if (!match((sn.title ?? "").trim().toLowerCase().replace(",", "."))) continue;
    const v = usableValue(lm.value);
    if (v != null) return { value: v, unit: sn.unit ?? "", at: lm.createdAt };
  }
  return null;
}

let ringsCache: Promise<Ring[]> | null = null;
export function loadBoundaryRings(): Promise<Ring[]> {
  ringsCache ??= fetch("/data/heilbronn-boundary.geojson")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((g: BoundaryGeo) => boundaryRings(g))
    .catch((e) => {
      ringsCache = null;
      throw e;
    });
  return ringsCache;
}

/**
 * openSenseMap boxes inside the city boundary (not just a bounding box),
 * newest first, at most `limit`, with temperature and dust readings.
 * Values below 0 are dropped.
 */
export async function fetchHeilbronnBoxes(signal?: AbortSignal, limit = 8): Promise<LiveBox[]> {
  const rings = await loadBoundaryRings();
  const [w, s, e, n] = ringsBbox(rings);
  // Bbox rounded outward to 2 decimals. openSenseMap sometimes sends a cut off
  // body (seen 28 Oct 2026 for the exact boundary bbox), so one retry.
  const bbox = [Math.floor(w * 100) / 100, Math.floor(s * 100) / 100, Math.ceil(e * 100) / 100, Math.ceil(n * 100) / 100].join(",");
  let list: RawBox[] | null = null;
  for (let attempt = 0; attempt < 2 && !list; attempt++) {
    const res = await fetch(`https://api.opensensemap.org/boxes?bbox=${bbox}&full=true`, { signal, cache: attempt ? "reload" : "default" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try {
      list = JSON.parse(await res.text()) as RawBox[];
    } catch {
      if (attempt) throw new Error("openSenseMap sent an incomplete answer");
    }
  }
  if (!list) throw new Error("openSenseMap sent no data");
  const now = Date.now();
  const inside = list
    .filter((b) => b._id && (b.currentLocation?.coordinates?.length ?? 0) >= 2)
    .filter((b) => insideRings(rings, b.currentLocation!.coordinates![0], b.currentLocation!.coordinates![1]))
    .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    .slice(0, limit);
  return inside.map((b) => {
    const temp = reading(b, (t) => t === "temperatur" || t === "temperature");
    const pm10 = reading(b, (t) => t === "pm10" || t === "finedust pm10");
    const pm25 = reading(b, (t) => t === "pm2.5" || t === "finedust pm2.5");
    const newest = [temp?.at, pm10?.at, pm25?.at].filter((x): x is string => !!x).sort().pop() ?? b.updatedAt ?? "";
    return {
      id: b._id!,
      name: b.name || "openSenseMap box",
      lng: b.currentLocation!.coordinates![0],
      lat: b.currentLocation!.coordinates![1],
      updatedAt: newest,
      fresh: !!newest && now - new Date(newest).getTime() <= FRESH_MS,
      temp,
      pm10,
      pm25,
    };
  });
}
