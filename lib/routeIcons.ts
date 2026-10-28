// Icons along the chosen route, for the map at close zoom. Only data we have:
// big register trees (shade), heat walk spots warmer than the walk median,
// ATRAI close pass points, OSM drinking water, and openSenseMap boxes.
// No traffic, cars, live air quality, or elevation: we have no allowed source for them.
// No runtime imports, so `npm test` can load it.

import type { Lang } from "./i18n";

export type LatLng = [number, number];
export type IconKind = "shade" | "heat" | "danger" | "water" | "sensor";
export type RouteIcon = { kind: IconKind; lat: number; lng: number; label: string; ref: number };

// Map badges: a clear glyph in the brand and data colours (brand/BRAND.md). SVG inner markup, constants only.
export const ICON_COLOR: Record<IconKind, string> = { shade: "#12A150", heat: "#C2410C", danger: "#C8322B", water: "#2563A6", sensor: "#0F2A23" };
export const ICON_GLYPH: Record<IconKind, string> = {
  shade: '<circle cx="12" cy="9.5" r="6.5" fill="currentColor"/><path d="M12 15v6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  heat: '<path d="M12 2.5c.8 3.6 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.9 1.7-4.4 2.3-6.6 1.4 1 2.1 2.6 2.1 4.1 1.2-2.4 1.6-5.4 1.1-8.5z" fill="currentColor"/>',
  danger: '<path d="M12 3 2 20.5h20z" fill="currentColor"/><path d="M12 9.5v5M12 17.2v.3" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  water: '<path d="M12 3s6.5 7.2 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.2 12 3 12 3z" fill="currentColor"/>',
  sensor: '<rect x="7" y="10" width="10" height="10" rx="2" fill="currentColor"/><path d="M8.5 6.5a5 5 0 0 1 7 0M6 4a8.5 8.5 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
export const ICON_NAME: Record<IconKind, string> = {
  shade: "Big tree, shade",
  heat: "Heat walk spot, warmer than the walk median",
  danger: "Close pass point",
  water: "Drinking water",
  sensor: "Sensor box",
};
/** The same icon names per language. English is ICON_NAME. */
export const ICON_NAMES: Record<Lang, Record<IconKind, string>> = {
  en: ICON_NAME,
  de: {
    shade: "Großer Baum, Schatten",
    heat: "Hitze-Spot, wärmer als der Median des Rundgangs",
    danger: "Punkt mit enger Überholung",
    water: "Trinkwasser",
    sensor: "Sensorbox",
  },
};

// Labels on the map icons, per language.
const LABEL = {
  en: {
    shade: (crown: number) => `Shade: big tree, crown about ${crown} m`,
    heat: "Heat walk spot, warmer than the walk median",
    danger: "Close pass point, from bike sensors",
    water: "Drinking water",
    sensor: (name: string) => `Sensor box: ${name}`,
  },
  de: {
    shade: (crown: number) => `Schatten: großer Baum, Krone etwa ${crown} m`,
    heat: "Hitze-Spot, wärmer als der Median des Rundgangs",
    danger: "Punkt mit enger Überholung, von Rad-Sensoren",
    water: "Trinkwasser",
    sensor: (name: string) => `Sensorbox: ${name}`,
  },
};

type Pt = { lat: number; lng: number };

const M_LAT = 111_320;
const M_LNG = 111_320 * Math.cos((49.14 * Math.PI) / 180);

function metres(a: Pt, b: Pt) {
  return Math.hypot((a.lat - b.lat) * M_LAT, (a.lng - b.lng) * M_LNG);
}

function toLine(p: Pt, line: LatLng[]) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][1] * M_LNG, ay = line[i][0] * M_LAT;
    const bx = line[i + 1][1] * M_LNG, by = line[i + 1][0] * M_LAT;
    const px = p.lng * M_LNG, py = p.lat * M_LAT;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return line.length === 1 ? metres(p, { lat: line[0][0], lng: line[0][1] }) : best;
}

/** Points within r metres of the line, with a quick box check first. */
export function nearLine<T extends Pt>(items: T[], line: LatLng[], r: number): T[] {
  if (!line.length) return [];
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [la, ln] of line) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, ln); e = Math.max(e, ln);
  }
  const dLat = r / M_LAT, dLng = r / M_LNG;
  return items.filter((p) => p.lat >= s - dLat && p.lat <= n + dLat && p.lng >= w - dLng && p.lng <= e + dLng && toLine(p, line) <= r);
}

/** Keep points at least minM apart, in the given order (most important first), at most max of them. */
export function thin<T extends Pt>(items: T[], minM: number, max: number): T[] {
  const out: T[] = [];
  for (const p of items) {
    if (out.length >= max) break;
    if (out.every((q) => metres(p, q) >= minM)) out.push(p);
  }
  return out;
}

export type IconSources = {
  /** Register trees near the route, with their crown in m. */
  trees: { lat: number; lng: number; crown: number; ref: number }[];
  /** Heat walk cells: [lat, lng, anomaly against the walk median, ...]. */
  heat: readonly (readonly number[])[];
  danger: { lat: number; lng: number; id: number }[] | null;
  water: { lat: number; lng: number; id: number }[];
  sensors: { lat: number; lng: number; name: string }[];
};

/** Big crown, in m, that counts as good shade. Same as the "big crowns" in the comfort rule. */
export const BIG_CROWN_M = 8;
/** A heat walk spot gets a fire icon from this anomaly up, the same line the route tips use. */
export const WARM_SPOT = 1;

export function routeIcons(line: LatLng[], src: IconSources, lang: Lang = "en"): RouteIcon[] {
  if (line.length < 2) return [];
  const L = LABEL[lang];
  const shade = thin(
    nearLine(src.trees.filter((t) => t.crown >= BIG_CROWN_M), line, 20).sort((a, b) => b.crown - a.crown),
    80,
    25
  ).map((t): RouteIcon => ({ kind: "shade", lat: t.lat, lng: t.lng, ref: t.ref, label: L.shade(Math.round(t.crown)) }));

  const cells = src.heat.map((c, i) => ({ lat: c[0], lng: c[1], a: c[2], i })).filter((c) => c.a >= WARM_SPOT);
  const heat = thin(nearLine(cells, line, 45).sort((a, b) => b.a - a.a), 60, 15).map(
    (c): RouteIcon => ({ kind: "heat", lat: c.lat, lng: c.lng, ref: c.i, label: L.heat })
  );

  const danger = thin(nearLine(src.danger ?? [], line, 15), 40, 25).map(
    (p): RouteIcon => ({ kind: "danger", lat: p.lat, lng: p.lng, ref: p.id, label: L.danger })
  );

  const water = nearLine(src.water, line, 100).map((w): RouteIcon => ({ kind: "water", lat: w.lat, lng: w.lng, ref: w.id, label: L.water }));

  const sensors = thin(nearLine(src.sensors, line, 150), 50, 10).map(
    (b, i): RouteIcon => ({ kind: "sensor", lat: b.lat, lng: b.lng, ref: i, label: L.sensor(b.name) })
  );

  return [...shade, ...heat, ...danger, ...water, ...sensors];
}
