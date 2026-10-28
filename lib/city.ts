import { HEAT, WATER, distM, distToLine, type DangerPoint, type LatLng } from "./geo";
import type { CityTrees } from "./cityTrees";

// City planning view: issues built only from data the partners provided.
// ATRAI segments are read live from the public API in the browser, then
// grouped by street. Every rule below is shown on the Data and method tab.

const API = "https://api.atrai.bike/collections/";

type Feature = { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };

export type Segment = {
  id: number;
  name: string;
  lines: LatLng[][];
  len: number; // metres
  boxes: number; // sensor boxes that measured this segment
  avgCm?: number; // overtaking: average passing gap
  points?: number; // overtaking: measured overtakes
  cycleway?: string | null; // OpenStreetMap cycleway tag
  rough?: number; // surface: ATRAI normalised roughness
};

const cache = new Map<string, Promise<Feature[]>>();

function loadCollection(id: string): Promise<Feature[]> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`${API}${id}/items?f=json&limit=20000`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ features?: Feature[] }>;
      })
      .then((j) => j.features || [])
      .catch((e) => {
        cache.delete(id);
        throw e;
      });
    cache.set(id, p);
  }
  return p;
}

function linesOf(g: Feature["geometry"]): LatLng[][] {
  const c = g?.coordinates as number[][] | number[][][] | undefined;
  if (!c) return [];
  const flip = (l: number[][]) => l.map(([lng, lat]) => [lat, lng] as LatLng);
  if (g?.type === "LineString") return [flip(c as number[][])];
  if (g?.type === "MultiLineString") return (c as number[][][]).map(flip);
  return [];
}

function lengthM(lines: LatLng[][]) {
  let m = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) m += distM(l[i - 1], l[i]);
  return m;
}

// ATRAI stores names as "Straße" or as a list like "['A', 'B']". Use the first.
function nameOf(raw: unknown): string {
  if (typeof raw !== "string" || !raw || raw === "nan" || raw === "None") return "";
  if (raw.startsWith("[")) {
    const m = raw.match(/'([^']+)'|"([^"]+)"/);
    return m ? (m[1] || m[2]).trim() : "";
  }
  return raw.trim();
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

export async function loadOvertaking(): Promise<Segment[]> {
  const fs = await loadCollection("overtaking_distance_heilbronn");
  return fs
    .map((f, i): Segment | null => {
      const p = f.properties || {};
      const avgCm = num(p["Average Overtaking Distance cm"]);
      const points = num(p["Number of Points"]);
      const lines = linesOf(f.geometry);
      if (!lines.length || !Number.isFinite(avgCm) || !(points > 0)) return null;
      const cw = p["cycleway"];
      return { id: Number(p.id ?? i), name: nameOf(p.name), lines, len: lengthM(lines), boxes: num(p["Number of Boxes"]) || 1, avgCm, points, cycleway: typeof cw === "string" ? cw : null };
    })
    .filter((s): s is Segment => s !== null);
}

export async function loadSurface(): Promise<Segment[]> {
  const fs = await loadCollection("bumpy_roads_heilbronn");
  return fs
    .map((f, i): Segment | null => {
      const p = f.properties || {};
      const rough = num(p["Normalized Roughness"]);
      const lines = linesOf(f.geometry);
      if (!lines.length || !Number.isFinite(rough)) return null;
      return { id: Number(p.id ?? i), name: nameOf(p.name), lines, len: lengthM(lines), boxes: num(p["Number of Boxes"]) || 1, rough };
    })
    .filter((s): s is Segment => s !== null);
}

// ---------- Issues ----------

export type IssueKind = "safety" | "surface" | "heat";
export type Evidence = "strong" | "medium" | "weak";
export type Severity = "high" | "medium" | "low";
export type Priority = "act" | "check" | "plan" | "watch";
export type Effort = "quick" | "medium" | "big";
export type Measure = { effort: Effort; text: string };
export type Fact = { label: string; value: string };

export type Issue = {
  id: string;
  kind: IssueKind;
  title: string;
  at: LatLng;
  lines: LatLng[][];
  metric: number; // higher is worse, used to sort within a kind
  metricText: string;
  severity: Severity;
  evidence: Evidence;
  evidenceText: string;
  priority: Priority;
  facts: Fact[];
  measures: Measure[];
  owner: string;
  plans: string[];
};

export const KIND_LABEL: Record<IssueKind, string> = { safety: "Close passes", surface: "Rough surface", heat: "Heat and shade" };
export const PRIORITY_LABEL: Record<Priority, string> = { act: "Act now", check: "Ground check first", plan: "Plan next", watch: "Watch" };
export const PRIORITY_ORDER: Priority[] = ["act", "check", "plan", "watch"];
export const EVIDENCE_LABEL: Record<Evidence, string> = { strong: "Strong evidence", medium: "Medium evidence", weak: "Weak evidence" };
export const EFFORT_LABEL: Record<Effort, string> = { quick: "Quick fix", medium: "Medium", big: "Big project" };

/** The priority rule: how bad it is, and how sure the data is. */
export function priorityOf(sev: Severity, ev: Evidence): Priority {
  if (sev === "high") return ev === "weak" ? "check" : "act";
  if (sev === "medium") return ev === "weak" ? "watch" : "plan";
  return "watch";
}

function midOf(lines: LatLng[][]): LatLng {
  let best = lines[0];
  for (const l of lines) if (l.length > best.length) best = l;
  return best[Math.floor((best.length - 1) / 2)];
}

function groupByName(segs: Segment[]) {
  const by = new Map<string, Segment[]>();
  for (const s of segs) {
    if (!s.name) continue;
    const list = by.get(s.name);
    if (list) list.push(s);
    else by.set(s.name, [s]);
  }
  return by;
}

export function fixScore(avgCm: number) {
  return Math.max(0, Math.min(100, Math.round(100 - avgCm / 2)));
}

export function scoreBand(score: number): Severity {
  return score >= 80 ? "high" : score >= 50 ? "medium" : "low";
}

export function safetyIssues(segs: Segment[]): Issue[] {
  const out: Issue[] = [];
  for (const [name, list] of groupByName(segs)) {
    let pts = 0;
    let sum = 0;
    let boxes = 0;
    const cw = new Set<string>();
    for (const s of list) {
      pts += s.points!;
      sum += s.avgCm! * s.points!;
      boxes = Math.max(boxes, s.boxes);
      if (s.cycleway && s.cycleway !== "crossing") cw.add(s.cycleway);
    }
    const avg = sum / pts;
    const score = fixScore(avg);
    const severity = scoreBand(score);
    // One sensor can be one rider's daily route, so strong needs two or more.
    const evidence: Evidence = pts >= 20 && boxes >= 2 ? "strong" : pts >= 5 ? "medium" : "weak";
    const lane = cw.size > 0;
    const lines = list.flatMap((s) => s.lines);
    out.push({
      id: `safety:${name}`,
      kind: "safety",
      title: name,
      at: midOf(lines),
      lines,
      metric: score,
      metricText: `Fix score ${score}`,
      severity,
      evidence,
      evidenceText: `${pts} overtaking ${pts === 1 ? "point" : "points"} on ${list.length} ${list.length === 1 ? "segment" : "segments"}, up to ${boxes} ${boxes === 1 ? "sensor" : "sensors"}`,
      priority: priorityOf(severity, evidence),
      facts: [
        { label: "Average passing gap", value: `${Math.round(avg)} cm` },
        { label: "Overtaking points", value: String(pts) },
        { label: "Segments with data", value: String(list.length) },
        { label: "Bike lane in OpenStreetMap", value: lane ? [...cw].join(", ").replace(/_/g, " ") : "None mapped" },
      ],
      measures: lane
        ? [
            { effort: "quick", text: "Check the existing lane on site: parking, bins, or narrow spots that push riders out." },
            { effort: "quick", text: "Add separators (flexible posts or kerbs) to the existing lane on the worst stretch." },
            { effort: "medium", text: "Widen the lane or turn it into a protected lane." },
            { effort: "big", text: "Redesign the street with a separated bike track." },
          ]
        : [
            { effort: "quick", text: "Ground check of width, parking, and speed on the worst stretch." },
            { effort: "quick", text: "Signs and road markings that remind drivers to keep a safe passing gap." },
            { effort: "medium", text: "Mark a bike lane or protected lane where the width allows, or ask the traffic authority to review the speed limit." },
            { effort: "big", text: "Redesign the street with a separated bike track." },
          ],
      owner: "Traffic and mobility",
      plans: ["Mobility Concept 2030"],
    });
  }
  return out;
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return Infinity;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function surfaceIssues(segs: Segment[]): { issues: Issue[]; p75: number; p90: number; segP75: number } {
  const groups = [...groupByName(segs)].map(([name, list]) => {
    let len = 0;
    let sum = 0;
    let boxes = 0;
    for (const s of list) {
      const w = Math.max(1, s.len);
      len += w;
      sum += s.rough! * w;
      boxes = Math.max(boxes, s.boxes);
    }
    return { name, list, rough: sum / len, len, boxes };
  });
  // Bands are relative: compared with the other streets that have enough segments.
  const base = groups.filter((g) => g.list.length >= 3).map((g) => g.rough).sort((a, b) => a - b);
  const p75 = quantile(base, 0.75);
  const p90 = quantile(base, 0.9);
  const segP75 = quantile(segs.map((s) => s.rough!).sort((a, b) => a - b), 0.75);
  const issues = groups.map((g): Issue => {
    const severity: Severity = g.rough >= p90 ? "high" : g.rough >= p75 ? "medium" : "low";
    const evidence: Evidence = g.list.length >= 10 && g.boxes >= 2 ? "strong" : g.list.length >= 3 ? "medium" : "weak";
    const rank = base.filter((v) => v < g.rough).length;
    const lines = g.list.flatMap((s) => s.lines);
    return {
      id: `surface:${g.name}`,
      kind: "surface",
      title: g.name,
      at: midOf(lines),
      lines,
      metric: Math.round(g.rough * 10) / 10,
      metricText: `Roughness ${Math.round(g.rough)}`,
      severity,
      evidence,
      evidenceText: `${g.list.length} ${g.list.length === 1 ? "segment" : "segments"}, ${Math.round(g.len)} m measured, up to ${g.boxes} ${g.boxes === 1 ? "sensor" : "sensors"}`,
      priority: priorityOf(severity, evidence),
      facts: [
        { label: "ATRAI roughness, length weighted", value: g.rough.toFixed(1) },
        { label: "Rougher than", value: base.length ? `${Math.round((rank / base.length) * 100)}% of streets` : "No comparison" },
        { label: "Length measured", value: `${Math.round(g.len)} m` },
        { label: "Segments", value: String(g.list.length) },
      ],
      measures: [
        { effort: "quick", text: "Patch holes, cracks, and broken edges on the roughest segments." },
        { effort: "quick", text: "Ground check: kerbs, drains, and cobbles on the bike line." },
        { effort: "medium", text: "Resurface the part riders use." },
        { effort: "big", text: "Add the street to the road renewal programme." },
      ],
      owner: "Road works",
      plans: ["Mobility Concept 2030"],
    };
  });
  return { issues, p75, p90, segP75 };
}

export function heatIssues(ct: CityTrees | null): Issue[] {
  const cells = HEAT.map((c, index) => ({ c, index })).filter((x) => x.c[2] >= 1);
  // Spots next to each other are one place: keep the warmer one.
  cells.sort((a, b) => b.c[2] - a.c[2]);
  const kept: typeof cells = [];
  for (const x of cells) {
    if (kept.some((k) => distM([k.c[0], k.c[1]], [x.c[0], x.c[1]]) < 120)) continue;
    kept.push(x);
  }
  return kept.map(({ c, index }): Issue => {
    const at: LatLng = [c[0], c[1]];
    const trees = ct ? ct.near(c[0], c[1], 40).length : null;
    let near = "";
    if (ct) {
      let best = Infinity;
      for (const i of ct.near(c[0], c[1], 150)) {
        const d = distM(at, [ct.lat[i], ct.lng[i]]);
        if (d < best) {
          best = d;
          near = ct.get(i).street;
        }
      }
    }
    let water = Infinity;
    for (const w of WATER) water = Math.min(water, distM(at, [w.lat, w.lng]));
    const severity: Severity = c[2] >= 1.5 ? "high" : "medium";
    const evidence: Evidence = c[4] >= 300 ? "strong" : c[4] >= 50 ? "medium" : "weak";
    const fewTrees = trees !== null && trees <= 3;
    const measures: Measure[] = [];
    if (trees === null || fewTrees) measures.push({ effort: "quick", text: "Shade sails or large mobile planters on the hottest stretch." });
    else measures.push({ effort: "quick", text: "Check tree health and summer watering. Trees are there, so the heat may come from sealed ground or traffic." });
    if (water > 300) measures.push({ effort: "quick", text: `Add a drinking water point. The nearest mapped one is ${water === Infinity ? "unknown" : `${Math.round(water)} m away`}.` });
    measures.push({ effort: "medium", text: "Plant street trees where space and pipes allow." });
    measures.push({ effort: "big", text: "Unseal and green the area, with light surfaces where trees cannot grow." });
    return {
      id: `heat:${index}`,
      kind: "heat",
      title: near ? `Hot spot, ${near}` : `Hot spot ${index + 1}`,
      at,
      lines: [],
      metric: c[2],
      metricText: `+${c[2].toFixed(1)} °C`,
      severity,
      evidence,
      evidenceText: `${c[4]} heat walk readings in this spot, 1 to 3 Sep 2026`,
      priority: priorityOf(severity, evidence),
      facts: [
        { label: "Warmer than its own walk", value: `+${c[2].toFixed(1)} °C` },
        { label: "Register trees within 40 m", value: trees === null ? "Loading" : String(trees) },
        { label: "Nearest drinking water", value: water === Infinity ? "None mapped" : `${Math.round(water)} m` },
        { label: "Readings", value: String(c[4]) },
      ],
      measures,
      owner: "Parks and trees",
      plans: ["Climate Adaptation Concept", "Landscape Plan 2030"],
    };
  });
}

/** Close pass points within 15 m of each safety issue. */
export function closePassCounts(issues: Issue[], danger: DangerPoint[]) {
  const out = new Map<string, number>();
  const padLat = 15 / 111_200;
  const padLng = 15 / 72_860;
  for (const is of issues) {
    let s = 90, n = -90, w = 180, e = -180;
    for (const l of is.lines) for (const [la, lo] of l) {
      if (la < s) s = la;
      if (la > n) n = la;
      if (lo < w) w = lo;
      if (lo > e) e = lo;
    }
    let count = 0;
    for (const d of danger) {
      if (d.lat < s - padLat || d.lat > n + padLat || d.lng < w - padLng || d.lng > e + padLng) continue;
      if (is.lines.some((l) => distToLine([d.lat, d.lng], l) <= 15)) count++;
    }
    out.set(is.id, count);
  }
  return out;
}

/** District of the nearest register tree, used to filter issues by area. */
export function districtAt(ct: CityTrees, at: LatLng) {
  for (const r of [60, 200, 600]) {
    let best = Infinity;
    let d = "";
    for (const i of ct.near(at[0], at[1], r)) {
      const m = distM(at, [ct.lat[i], ct.lng[i]]);
      if (m < best) {
        best = m;
        d = ct.get(i).district;
      }
    }
    if (d) return d;
  }
  return "";
}

// ---------- Trees by district ----------

export type DistrictStat = {
  district: string;
  trees: number;
  topSpecies: string;
  topSpeciesShare: number;
  topGenus: string;
  topGenusShare: number;
  bigShare: number; // crown 8 m or more
  youngShare: number; // trunk under 50 cm round, single trees with a known trunk
  groups: number; // Baumgruppe rows
};

function statFor(district: string, ids: number[], ct: CityTrees): DistrictStat {
  const sp = new Map<string, number>();
  const ge = new Map<string, number>();
  let big = 0;
  let young = 0;
  let trunkKnown = 0;
  let groups = 0;
  for (const i of ids) {
    const t = ct.get(i);
    sp.set(t.name, (sp.get(t.name) || 0) + 1);
    const genus = t.latin.match(/^[A-Z][a-z]+/)?.[0] || t.name.split(" ")[0];
    ge.set(genus, (ge.get(genus) || 0) + 1);
    if (t.crown >= 8) big++;
    if (t.type === "Baumgruppe") groups++;
    else if (t.trunk > 0) {
      trunkKnown++;
      if (t.trunk < 50) young++;
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const [ts, tsn] = top(sp);
  const [tg, tgn] = top(ge);
  const n = ids.length || 1;
  return {
    district,
    trees: ids.length,
    topSpecies: ts,
    topSpeciesShare: tsn / n,
    topGenus: tg,
    topGenusShare: tgn / n,
    bigShare: big / n,
    youngShare: trunkKnown ? young / trunkKnown : 0,
    groups,
  };
}

export function districtStats(ct: CityTrees): { city: DistrictStat; districts: DistrictStat[] } {
  const by = new Map<string, number[]>();
  const all: number[] = [];
  for (let i = 0; i < ct.count; i++) {
    all.push(i);
    const d = ct.get(i).district || "No district given";
    const l = by.get(d);
    if (l) l.push(i);
    else by.set(d, [i]);
  }
  return {
    city: statFor("Whole city", all, ct),
    districts: [...by].map(([d, ids]) => statFor(d, ids, ct)).sort((a, b) => b.trees - a.trees),
  };
}

// ---------- Export ----------

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function issuesCsv(issues: Issue[], district: (i: Issue) => string, work: (id: string) => { status: string; note: string }) {
  const head = ["Type", "Place", "District", "Priority", "Severity", "Evidence", "Key value", "Evidence detail", "Quick fix", "Team", "Plans", "Status", "Note", "Latitude", "Longitude"];
  const rows = issues.map((i) => {
    const w = work(i.id);
    return [
      KIND_LABEL[i.kind],
      i.title,
      district(i),
      PRIORITY_LABEL[i.priority],
      i.severity,
      EVIDENCE_LABEL[i.evidence],
      i.metricText,
      i.evidenceText,
      i.measures.find((m) => m.effort === "quick")?.text ?? "",
      i.owner,
      i.plans.join(", "),
      w.status,
      w.note,
      i.at[0].toFixed(6),
      i.at[1].toFixed(6),
    ];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
