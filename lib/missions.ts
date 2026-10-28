// Data missions: streets with little or no data near a school or next to a
// top 50 street, bundled into short rides for volunteers. Shared by the
// Planner (/data) and scripts/build-missions.mjs, which writes the default
// public/data/missions.json that the people app reads.
//
// missions.json format, version 1:
// {
//   version: 1, built: data build date, created: date the file was made,
//   rule: MISSION_RULE, preset: preset used for the top 50,
//   timeBands: [{ id, label, from, to }],
//   missions: [{
//     id, title, district, timeBand (a timeBands id),
//     streets: [{ id, name, role ("busy" | "side" | "school" | "green"), lat, lng, length }],
//     why: plain text, missing: roles that had no street
//   }]
// }
// Street ids are the Planner street ids (stable within one data build).
import type { Scored, Street } from "./priority";

export const MISSION_RULE = "Adults collect data for school streets. Normal, safe routes in daylight.";
export const MISSION_NEAR_M = 25;
export const TOP_N = 50;

export const TIME_BANDS = [
  { id: "am", label: "Morning, 7 to 9", from: "07:00", to: "09:00" },
  { id: "midday", label: "Midday, 12 to 14", from: "12:00", to: "14:00" },
  { id: "pm", label: "Afternoon, 15 to 18", from: "15:00", to: "18:00" },
] as const;
export type TimeBandId = (typeof TIME_BANDS)[number]["id"];

export const ROLES = {
  busy: "Busy road",
  side: "Side street",
  school: "School street",
  green: "Green alternative",
} as const;
export type Role = keyof typeof ROLES;

/** German labels for the people app at /de. Same keys as ROLES. */
export const ROLES_DE: Record<Role, string> = {
  busy: "Viel befahrene Straße",
  side: "Nebenstraße",
  school: "Schulstraße",
  green: "Grüne Alternative",
};

/** German labels for TIME_BANDS, by id. */
export const TIME_BAND_LABELS_DE: Record<TimeBandId, string> = {
  am: "Morgens, 7 bis 9",
  midday: "Mittags, 12 bis 14",
  pm: "Nachmittags, 15 bis 18",
};

export type Gap = { street: Street; support: "Low" | "none"; school: boolean; nextToTop: boolean };
export type MissionStreet = { id: number; name: string; role: Role; lat: number; lng: number; length: number };
export type Mission = { id: string; title: string; district: string; timeBand: TimeBandId; streets: MissionStreet[]; why: string; missing: Role[] };
export type MissionsFile = {
  version: 1;
  built: string;
  created: string;
  rule: string;
  preset: string;
  timeBands: typeof TIME_BANDS;
  missions: Mission[];
};

const KY = 111200;
const KX = 111320 * Math.cos((49.14 * Math.PI) / 180);

/** Ends of every line of the given streets, on a coarse grid for a near test. */
function endGrid(streets: Street[]) {
  const cell = (lat: number, lng: number) => `${Math.floor((lat * KY) / 100)}|${Math.floor((lng * KX) / 100)}`;
  const grid = new Map<string, [number, number][]>();
  for (const s of streets)
    for (const l of s.lines)
      for (const p of l) {
        const k = cell(p[0], p[1]);
        const a = grid.get(k);
        if (a) a.push(p);
        else grid.set(k, [p]);
      }
  return (p: [number, number], m: number) => {
    const cy = Math.floor((p[0] * KY) / 100), cx = Math.floor((p[1] * KX) / 100);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const q of grid.get(`${cy + dy}|${cx + dx}`) ?? []) if (Math.hypot((p[0] - q[0]) * KY, (p[1] - q[1]) * KX) <= m) return true;
    return false;
  };
}

/**
 * Gaps: streets with Low support or no sensor data that are in a school zone
 * (300 m, from the build) or touch a top 50 street at a line end.
 */
export function findGaps(scored: Scored[], topIds: number[]): Gap[] {
  const byId = new Map(scored.map((x) => [x.seg.id, x]));
  const top = topIds.map((id) => byId.get(id)?.seg as Street).filter(Boolean);
  const near = endGrid(top);
  const topSet = new Set(topIds);
  const out: Gap[] = [];
  for (const x of scored) {
    const s = x.seg as Street;
    if (topSet.has(s.id) || s.length < 20) continue;
    if (x.support === "High" || x.support === "Medium") continue;
    const school = s.m.schoolZone === true;
    const nextToTop = s.lines.some((l) => near(l[0], MISSION_NEAR_M) || near(l[l.length - 1], MISSION_NEAR_M));
    if (school || nextToTop) out.push({ street: s, support: x.support === "Low" ? "Low" : "none", school, nextToTop });
  }
  return out;
}

const mid = (s: Street): [number, number] => {
  const g = s.g;
  return g[Math.floor(g.length / 2)] ?? g[0];
};

/**
 * One bundle from a set of gaps: the school street is the longest school
 * zone gap, the busy road has the most traffic flow (ATRAI), the side
 * street the least, and the green alternative the most register crown cover.
 */
export function bundle(gaps: Gap[], name: (s: Street) => string): { streets: MissionStreet[]; missing: Role[] } {
  const left = [...gaps];
  const take = (pick: (a: Gap[]) => Gap | undefined) => {
    const g = pick(left);
    if (g) left.splice(left.indexOf(g), 1);
    return g;
  };
  const by = (f: (g: Gap) => number) => (a: Gap[]) => a.reduce<Gap | undefined>((b, g) => (b == null || f(g) > f(b) ? g : b), undefined);
  const flow = (g: Gap) => g.street.raw.flow ?? g.street.raw.speedKmh ?? 0;
  const picked: [Role, Gap | undefined][] = [
    ["school", take((a) => by((g) => g.street.length)(a.filter((g) => g.school)))],
    ["busy", take(by(flow))],
    ["side", take(by((g) => -flow(g)))],
    ["green", take(by((g) => g.street.raw.crownCover ?? -1))],
  ];
  const streets: MissionStreet[] = [];
  const missing: Role[] = [];
  for (const [role, g] of picked) {
    if (!g) {
      missing.push(role);
      continue;
    }
    const [lat, lng] = mid(g.street);
    streets.push({ id: g.street.id, name: name(g.street), role, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, length: Math.round(g.street.length) });
  }
  return { streets, missing };
}

export function missionWhy(gaps: Gap[]) {
  const school = gaps.filter((g) => g.school).length;
  const top = gaps.filter((g) => g.nextToTop).length;
  const none = gaps.filter((g) => g.support === "none").length;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const where = [school && `${school} near a school or kindergarten`, top && `${top} next to a street high on the city list`].filter(Boolean).join(", ");
  return `${n(gaps.length, "street here has", "streets here have")} little or no bike sensor data${none ? ` (${none} with none)` : ""}${where ? `: ${where}` : ""}.`;
}

const deNum = (v: string) => Number(v).toLocaleString("de-DE");

/** German version of a title built by scripts/build-missions.mjs. Other titles come back as they are. */
export function missionTitleDe(title: string): string {
  const m = title.match(/^(.+): (\d+) streets? to measure$/);
  if (!m) return title;
  return `${m[1]}: ${deNum(m[2])} ${m[2] === "1" ? "Straße" : "Straßen"} zum Messen`;
}

/** German version of a street name built by scripts/build-missions.mjs. Real names come back as they are. */
export function streetNameDe(name: string): string {
  const m = name.match(/^Unnamed (street|segment) near (.+)$/);
  if (m) return `${m[1] === "street" ? "Unbenannte Straße" : "Unbenannter Abschnitt"} bei ${m[2]}`;
  return name === "Street without a name in the data" ? "Straße ohne Namen in den Daten" : name;
}

/** German version of a missionWhy() text. Other texts come back as they are. */
export function missionWhyDe(why: string): string {
  const m = why.match(/^(\d+) (?:street here has|streets here have) little or no bike sensor data(?: \((\d+) with none\))?(?:: (.*))?\.$/);
  if (!m) return why;
  const parts: string[] = [];
  for (const p of m[3] ? m[3].split(", ") : []) {
    const s = p.match(/^(\d+) near a school or kindergarten$/);
    const t = p.match(/^(\d+) next to a street high on the city list$/);
    if (s) parts.push(`${deNum(s[1])} nahe einer Schule oder Kita`);
    else if (t) parts.push(`${deNum(t[1])} neben einer Straße weit oben auf der Liste der Stadt`);
    else return why;
  }
  const head = `${deNum(m[1])} ${m[1] === "1" ? "Straße hier hat" : "Straßen hier haben"} wenig oder keine Rad-Sensordaten`;
  return `${head}${m[2] ? ` (${deNum(m[2])} ohne Daten)` : ""}${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}
