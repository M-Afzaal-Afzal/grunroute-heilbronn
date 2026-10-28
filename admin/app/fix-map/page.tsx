"use client";
// What needs fixing: repeating patterns in the street data get a label
// ("Crash Course", "Hell Valley"), with the numbers that earned it, a plain
// conclusion, resolutions rated for urgency and ease, the areas where labels
// cluster, where trees would help, and where sensors are missing. Rules in
// lib/phenomena.ts. Every cutoff is our rule and the page says so.
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { cellToBoundary, cellToLatLng, latLngToCell } from "h3-js";
import type * as Leaflet from "leaflet";
import { usePlannerData, nf } from "@/lib/data";
import { useActivePreset } from "@/lib/preset";
import { useUrlState } from "@/lib/url";
import { listable, rankFor } from "@/lib/rank";
import { PEOPLE_APP } from "@/lib/nav";
import {
  EASE_RULE,
  EASE_WORD,
  LABEL_ORDER,
  PHENOMENA,
  QUADRANT_LABEL,
  URGENCY_RULE,
  URGENCY_WORD,
  labelsOf,
  mainFix,
  quadrantOf,
  treeReasons,
  urgencyOf,
  type Hit,
  type PhenomenonId,
  type Quadrant,
} from "@/lib/phenomena";
import { districtLabel, type MeasureKey, type Street } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { TOP_N, findGaps } from "@/lib/shared/missions";
import { NetworkMap, type Focus, type MapLine, type MapPoly } from "@/components/map/NetworkMap";
import type { LeafletNS } from "@/components/map/useLeaflet";
import { DesktopNote } from "@/components/shell/DesktopNote";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Lens = "labels" | "urgent" | "trees" | "sensors";
const LENSES: { id: Lens; label: string; help: string }[] = [
  { id: "labels", label: "All labels", help: "Every street that earned a label, coloured by its most urgent label." },
  { id: "urgent", label: "Immediate attention", help: "Labels with urgency High or Very high." },
  { id: "trees", label: "Plant trees here", help: "Crown cover under 10%, with heat or dust as the reason." },
  { id: "sensors", label: "Put sensors here", help: "Blind spots: little or no data near a school or next to a top 50 street." },
];
const DEFAULTS = { lens: "labels", d: "all", sel: "", area: "", off: "" };
const AREA_RES = 8;
const AREA_MIN = 3;

type LHit = Hit & { urgency: number };
type Item = { s: Street; hits: LHit[]; trees: string[] };
type Area = { key: string; cell: string; id: PhenomenonId; streets: Item[]; name: string };

const mid = (s: Street): [number, number] => {
  const pts = s.lines.flat();
  return pts[Math.floor(pts.length / 2)] ?? [0, 0];
};
const topHit = (it: Item) => it.hits.slice().sort((a, b) => b.urgency - a.urgency || LABEL_ORDER.indexOf(a.id) - LABEL_ORDER.indexOf(b.id))[0];

function Chip({ id }: { id: PhenomenonId }) {
  const p = PHENOMENA[id];
  return (
    <span className="pl-label" style={{ ["--lab" as string]: p.color }}>
      {p.name}
    </span>
  );
}

function Rating({ n, words, kind }: { n: number; words: readonly string[]; kind: string }) {
  return (
    <span className="pl-rating" title={`${kind} ${n} of 5`}>
      <span aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= n ? "on" : undefined} />
        ))}
      </span>
      <span className="sr-only">
        {kind} {n} of 5,
      </span>{" "}
      {words[n]}
    </span>
  );
}

export default function FixMapPage() {
  const { data, error } = usePlannerData();
  const active = useActivePreset();
  const [u, set] = useUrlState(DEFAULTS);
  const lens: Lens = LENSES.some((l) => l.id === u.lens) ? (u.lens as Lens) : "labels";
  const off = useMemo(() => new Set(u.off.split(",").filter(Boolean) as PhenomenonId[]), [u.off]);

  // Every street of 20 m or more with its labels, urgency, and tree reasons.
  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    const pct = (s: { m: Street["m"] }, k: MeasureKey) => (s.m[k] == null ? null : (data.streetPct[k].get(s.m[k] as number) ?? null));
    const all = rankFor(data, active.preset, active.code, "streets", false);
    const topIds = listable(rankFor(data, active.preset, active.code))
      .slice(0, TOP_N)
      .map((r) => r.seg.id);
    const gaps = new Map(findGaps(all, topIds).map((g) => [g.street.id, g]));
    const out: Item[] = [];
    for (const s of data.streets) {
      if (s.length < 20) continue;
      const hits: Hit[] = labelsOf(s, pct);
      const g = gaps.get(s.id);
      if (g)
        hits.push({
          id: "blindSpot",
          evidence: `${g.support === "none" ? "no sensor data" : "Low support, 1 or 2 readings"}${g.school ? ", school or kindergarten within 300 m" : ""}${g.nextToTop ? `, next to a top ${TOP_N} street` : ""}`,
          severe: false,
          strongEvidence: false,
        });
      const real = hits.filter((h) => h.id !== "blindSpot").length;
      const trees = treeReasons(s, hits.map((h) => h.id));
      if (hits.length || trees.length) out.push({ s, hits: hits.map((h) => ({ ...h, urgency: urgencyOf(h, s, real) })), trees });
    }
    return out;
  }, [data, active.preset, active.code]);

  const districts = useMemo(() => [...new Set(items.map((x) => x.s.district ?? "Heilbronn"))].sort((a, b) => a.localeCompare(b, "de")), [items]);
  const inDistrict = useCallback((x: Item) => u.d === "all" || (x.s.district ?? "Heilbronn") === u.d, [u.d]);

  // Hits shown for the lens, after the label and district filters.
  const visible = useMemo(() => {
    return items
      .filter(inDistrict)
      .map((x) => {
        let hits = x.hits.filter((h) => !off.has(h.id));
        if (lens === "urgent") hits = hits.filter((h) => h.urgency >= 4 && h.id !== "blindSpot");
        if (lens === "sensors") hits = hits.filter((h) => h.id === "blindSpot");
        if (lens === "labels") hits = hits.filter((h) => h.id !== "blindSpot");
        return { ...x, hits };
      })
      .filter((x) => (lens === "trees" ? x.trees.length > 0 : x.hits.length > 0));
  }, [items, inDistrict, off, lens]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(LABEL_ORDER.map((id) => [id, 0])) as Record<PhenomenonId, number>;
    for (const x of items.filter(inDistrict)) for (const h of x.hits) c[h.id]++;
    return c;
  }, [items, inDistrict]);

  // Areas of attention: H3 cells (about 0.7 km²) with 3 or more streets that share a label.
  const areas = useMemo<Area[]>(() => {
    if (lens === "trees") return [];
    const by = new Map<string, Area>();
    for (const x of visible) {
      const [lat, lng] = mid(x.s);
      const cell = latLngToCell(lat, lng, AREA_RES);
      for (const h of x.hits) {
        const key = `${cell}:${h.id}`;
        if (!by.has(key)) by.set(key, { key, cell, id: h.id, streets: [], name: "" });
        by.get(key)!.streets.push(x);
      }
    }
    return [...by.values()]
      .filter((a) => a.streets.length >= AREA_MIN)
      .map((a) => {
        // Named after its most urgent named street, so two areas with the same label stay apart.
        const lead = a.streets
          .filter((x) => x.s.name)
          .sort((p, q) => Math.max(...q.hits.filter((h) => h.id === a.id).map((h) => h.urgency)) - Math.max(...p.hits.filter((h) => h.id === a.id).map((h) => h.urgency)))[0];
        return { ...a, name: `${PHENOMENA[a.id].name} area${lead ? ` near ${lead.s.name}` : `, ${districtLabel(a.streets[0].s.district)}`}` };
      })
      .sort((a, b) => b.streets.length - a.streets.length);
  }, [visible, lens]);

  const lineFor = (x: Item): MapLine => {
    if (lens === "trees") return { id: x.s.id, lines: x.s.lines, color: "#12A150", weight: 2 + x.trees.length * 1.5, opacity: 0.95, title: `${segName(x.s)}: plant trees, ${x.trees.join(", ")}` };
    const h = topHit(x);
    const p = PHENOMENA[h.id];
    return {
      id: x.s.id,
      lines: x.s.lines,
      color: p.color,
      weight: 1.5 + h.urgency * 1.2,
      opacity: 0.95,
      dash: h.id === "blindSpot" ? "5 6" : undefined,
      title: `${segName(x.s)}: ${x.hits.map((k) => PHENOMENA[k.id].name).join(", ")}`,
    };
  };

  const mapLines = useMemo<MapLine[]>(() => {
    if (!data) return [];
    // Context: every street faint, so labels sit in the real network.
    const ctx: MapLine[] = data.streets.filter((s) => u.d === "all" || (s.district ?? "Heilbronn") === u.d).map((s) => ({ id: `c${s.id}`, lines: s.lines, color: "#9AA6A0", weight: 1, opacity: 0.35 }));
    const shown = visible.slice().sort((a, b) => (lens === "trees" ? a.trees.length - b.trees.length : topHit(a).urgency - topHit(b).urgency));
    return [...ctx, ...shown.map(lineFor)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visible, lens, u.d]);

  const mapPolys = useMemo<MapPoly[]>(
    () =>
      areas.map((a) => ({
        id: `a:${a.key}`,
        rings: [cellToBoundary(a.cell)],
        color: PHENOMENA[a.id].color,
        opacity: u.area === a.key ? 0.35 : 0.15,
        title: `${a.name}, ${a.streets.length} streets`,
      })),
    [areas, u.area],
  );

  // Labels on the map itself: area names, and the name of the street you clicked.
  // Other street names show on hover, so the map stays readable at every zoom.
  const labels = useCallback(
    (map: Leaflet.Map, L: LeafletNS) => {
      const g = L.layerGroup().addTo(map);
      const pick = items.find((x) => String(x.s.id) === u.sel);
      const pickTag =
        pick &&
        L.tooltip({ permanent: true, direction: "top", className: "pl-maptag is-street", opacity: 1, offset: [0, -4] })
          .setLatLng(mid(pick.s))
          .setContent(
            `<span class="pl-maptag-in" style="border-left-color:${pick.hits.length ? PHENOMENA[topHit(pick).id].color : "#12A150"}">${segName(pick.s)}${pick.hits.length ? `: ${pick.hits.map((h) => PHENOMENA[h.id].name).join(", ")}` : ""}</span>`,
          )
          .addTo(g);
      const areaTags: Leaflet.Tooltip[] = [];
      for (const a of areas.slice(0, 12)) {
        const [lat, lng] = cellToLatLng(a.cell);
        const t = L.tooltip({ permanent: true, direction: "center", className: "pl-maptag", opacity: 1 })
          .setLatLng([lat, lng])
          .setContent(`<span class="pl-maptag-in" style="background:${PHENOMENA[a.id].color}">${PHENOMENA[a.id].name} area · ${a.streets.length}</span>`)
          .addTo(g);
        areaTags.push(t);
      }
      // The clicked street always shows. Area tags follow, largest area first.
      // A tag that would cover one already shown is hidden until you zoom in.
      const declutter = () => {
        const kept: DOMRect[] = [];
        for (const t of pickTag ? [pickTag, ...areaTags] : areaTags) {
          const el = t.getElement();
          if (!el) continue;
          el.style.visibility = "visible";
          const r = el.getBoundingClientRect();
          const hit = kept.some((k) => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
          if (hit) el.style.visibility = "hidden";
          else kept.push(r);
        }
      };
      declutter();
      map.on("zoomend", declutter);
      return () => {
        map.off("zoomend", declutter);
        g.remove();
      };
    },
    [areas, items, u.sel],
  );

  const selected = useMemo(() => items.find((x) => String(x.s.id) === u.sel) ?? null, [items, u.sel]);
  const area = useMemo(() => areas.find((a) => a.key === u.area) ?? null, [areas, u.area]);
  const focus: Focus = useMemo(() => {
    if (selected) return { id: selected.s.id, lines: selected.s.lines };
    if (area) return { id: area.key, rings: [cellToBoundary(area.cell)] };
    return null;
  }, [selected, area]);
  const onPick = useCallback(
    (id: number | string) => {
      const k = String(id);
      if (k.startsWith("a:")) set({ area: k.slice(2), sel: "" });
      else if (!k.startsWith("c")) set({ sel: k, area: "" });
    },
    [set],
  );

  // Urgency and ease: each label on each street, placed by the ease of its main fix.
  const grid = useMemo(() => {
    const g: Record<Quadrant, { x: Item; h: LHit }[]> = { quickWin: [], bigProject: [], easyExtra: [], later: [] };
    for (const x of items.filter(inDistrict))
      for (const h of x.hits) if (h.id !== "blindSpot" && !off.has(h.id)) g[quadrantOf(h.urgency, mainFix(h.id).ease)].push({ x, h });
    for (const k of Object.keys(g) as Quadrant[]) g[k].sort((a, b) => b.h.urgency - a.h.urgency);
    return g;
  }, [items, inDistrict, off]);

  // Patterns: where each label repeats, in words.
  const patterns = useMemo(() => {
    const scope = items.filter(inDistrict);
    const lines: string[] = [];
    for (const id of LABEL_ORDER) {
      if (id === "blindSpot") continue;
      const with_ = scope.filter((x) => x.hits.some((h) => h.id === id));
      if (!with_.length) continue;
      const byD = new Map<string, number>();
      for (const x of with_) byD.set(districtLabel(x.s.district), (byD.get(districtLabel(x.s.district)) ?? 0) + 1);
      const [d, n] = [...byD].sort((a, b) => b[1] - a[1])[0];
      const school = with_.filter((x) => x.s.m.schoolZone).length;
      lines.push(
        `${PHENOMENA[id].name}: ${nf(with_.length)} ${with_.length === 1 ? "street" : "streets"}. ${u.d === "all" ? `${nf(n)} of them in ${d}. ` : ""}${school ? `${nf(school)} within 300 m of a school or kindergarten.` : ""}`,
      );
    }
    const stacked = scope.filter((x) => x.hits.filter((h) => h.id !== "blindSpot").length >= 2);
    if (stacked.length)
      lines.push(
        `${nf(stacked.length)} streets carry two or more labels, so several problems meet there: ${stacked
          .slice(0, 6)
          .map((x) => segName(x.s))
          .join(", ")}${stacked.length > 6 ? ", and more" : ""}.`,
      );
    return lines;
  }, [items, inDistrict, u.d]);

  const sensorIds = useMemo(() => visible.filter((x) => x.hits.some((h) => h.id === "blindSpot")).map((x) => x.s.id), [visible]);
  const treeList = useMemo(() => (lens === "trees" ? visible.slice().sort((a, b) => b.trees.length - a.trees.length) : []), [visible, lens]);

  if (error) return <p role="alert">Could not load the street data: {error}</p>;

  const toggleLabel = (id: PhenomenonId) => {
    const n = new Set(off);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    set({ off: [...n].join(",") });
  };

  return (
    <>
      <DesktopNote />
      <header>
        <h1>What needs fixing</h1>
        <p>
          Repeating patterns in the street data, given a short label, with the numbers behind each one, what we think is going on, and what the street needs. Labels, cutoffs, urgency, and ease are our rules for screening. They are not
          a legal finding.
        </p>
      </header>

      {!data ? (
        <Skeleton label="Loading streets" />
      ) : (
        <>
          <div className="pl-toolbar">
            <div className="pl-seg" role="group" aria-label="Lens">
              {LENSES.map((l) => (
                <button key={l.id} type="button" aria-pressed={lens === l.id} onClick={() => set({ lens: l.id, sel: "", area: "" })} title={l.help}>
                  {l.label}
                </button>
              ))}
            </div>
            <label className="f">
              District
              <Select value={u.d} onValueChange={(v) => set({ d: v, sel: "", area: "" })}>
                <SelectTrigger aria-label="District" style={{ minWidth: 220 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {districtLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <p className="pl-note" style={{ marginTop: -8, marginBottom: 12 }}>
            {LENSES.find((l) => l.id === lens)!.help}
          </p>

          {lens !== "trees" && (
            <div className="pl-labels" role="group" aria-label="Labels to show">
              {LABEL_ORDER.filter((id) => (lens === "sensors" ? id === "blindSpot" : id !== "blindSpot")).map((id) => (
                <button key={id} type="button" aria-pressed={!off.has(id)} onClick={() => toggleLabel(id)} title={PHENOMENA[id].rule} style={{ ["--lab" as string]: PHENOMENA[id].color }}>
                  <i aria-hidden="true" />
                  {PHENOMENA[id].name} <b className="num">{nf(counts[id])}</b>
                </button>
              ))}
            </div>
          )}

          <div className="pl-qmap is-wide pl-section" style={{ marginTop: 12 }}>
            <NetworkMap lines={mapLines} polys={mapPolys} focus={focus} onPick={onPick} extra={labels} height={600} label="Map of what needs fixing, streets coloured by label" />
            <div>
              {selected ? (
                <StreetCard x={selected} onClose={() => set({ sel: "" })} />
              ) : area ? (
                <section className="gr-card" aria-label="Area of attention">
                  <p style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Chip id={area.id} /> <b>area of attention</b>
                  </p>
                  <h2 style={{ fontSize: 17, marginTop: 6 }}>{area.name}</h2>
                  <p className="pl-note" style={{ margin: "6px 0" }}>
                    {area.streets.length} streets with this label in one map cell of about 0.7 km². {PHENOMENA[area.id].assumption} The area needs: {PHENOMENA[area.id].needs.toLowerCase()}
                  </p>
                  <ul style={{ paddingLeft: 18, fontSize: 14 }}>
                    {area.streets.map((x) => (
                      <li key={x.s.id}>
                        <button type="button" className="pl-linkbtn" onClick={() => set({ sel: String(x.s.id), area: "" })}>
                          {segName(x.s)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="pl-btn" onClick={() => set({ area: "" })}>
                    Clear
                  </button>
                </section>
              ) : (
                <section className="gr-card" aria-label="How to read the map">
                  <h2 style={{ fontSize: 17 }}>How to read the map</h2>
                  <p className="pl-note" style={{ margin: "6px 0" }}>
                    A thicker line is more urgent. Shaded cells are areas of attention: {AREA_MIN} or more streets with the same label close together. Hover over a street to see its name and labels. Click a street or a cell for the details.
                  </p>
                  <ul className="pl-legend" style={{ display: "grid", gap: 6, listStyle: "none", padding: 0 }}>
                    {LABEL_ORDER.map((id) => (
                      <li key={id} title={PHENOMENA[id].rule}>
                        <Chip id={id} /> <span>{PHENOMENA[id].needs}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>

          {lens === "trees" && (
            <section className="pl-section" aria-labelledby="trees-title">
              <h2 id="trees-title">Plant trees here, {nf(treeList.length)} streets</h2>
              <p className="sub">
                Crown cover under 10% from the city tree register, 50 m or longer, and heat or dust as a reason. A school nearby adds weight but is not a reason alone. Check free planting spots and pipes on site, then use the{" "}
                <Link href="/trees">Shade and trees</Link> page to plan species and spots.
              </p>
              <div className="pl-table-wrap" style={{ maxHeight: 420 }}>
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Street</th>
                      <th>District</th>
                      <th className="n">Crown cover</th>
                      <th>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treeList.map((x) => (
                      <tr key={x.s.id} onClick={() => set({ sel: String(x.s.id) })} style={{ cursor: "pointer" }}>
                        <td>{segName(x.s)}</td>
                        <td>{districtLabel(x.s.district)}</td>
                        <td className="n">{Math.round((x.s.raw.crownCover ?? 0) * 100)}%</td>
                        <td>{x.trees.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {lens === "sensors" && (
            <section className="pl-section" aria-labelledby="sensors-title">
              <h2 id="sensors-title">Put sensors here, {nf(sensorIds.length)} streets</h2>
              <p className="sub">
                {PHENOMENA.blindSpot.rule} Send them to the mission builder, which bundles them into short rides for volunteers and exports missions.json for the people app.
              </p>
              <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="pl-btn primary" href={`/data?pick=${sensorIds.slice(0, 40).join(",")}`}>
                  Plan a data mission for {nf(Math.min(40, sensorIds.length))} of these streets
                </Link>
                <a className="pl-btn" href={`${PEOPLE_APP}/data-collection`}>
                  How data is collected
                </a>
              </p>
              <p className="pl-note">{PHENOMENA.blindSpot.guidance.join(" ")} Choose a district first to keep a mission short. At most 40 streets go in one link.</p>
            </section>
          )}

          {lens !== "trees" && lens !== "sensors" && (
            <>
              <section className="pl-section" aria-labelledby="patterns-title">
                <h2 id="patterns-title">Patterns</h2>
                <p className="sub">What repeats across streets{u.d !== "all" ? ` in ${districtLabel(u.d)}` : ""}, condensed from the labels.</p>
                <ul style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
                  {patterns.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {areas.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 16, marginTop: 12 }}>Areas of attention</h3>
                    <div className="pl-labels">
                      {areas.slice(0, 16).map((a) => (
                        <button key={a.key} type="button" aria-pressed={u.area === a.key} style={{ ["--lab" as string]: PHENOMENA[a.id].color }} onClick={() => set({ area: a.key, sel: "" })}>
                          <i aria-hidden="true" />
                          {a.name} <b className="num">{a.streets.length}</b>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section className="pl-section" aria-labelledby="grid-title">
                <h2 id="grid-title">Urgency and ease</h2>
                <p className="sub">
                  Each label on each street, placed by its urgency and by how easy its main fix is. {URGENCY_RULE} {EASE_RULE}
                </p>
                <div className="pl-quad">
                  {(["quickWin", "bigProject", "easyExtra", "later"] as Quadrant[]).map((q) => (
                    <div key={q} className={`pl-quadcell is-${q}`}>
                      <h3>
                        {QUADRANT_LABEL[q]} <span className="num">{nf(grid[q].length)}</span>
                      </h3>
                      <ul>
                        {grid[q].slice(0, 8).map(({ x, h }) => (
                          <li key={`${x.s.id}-${h.id}`}>
                            <button type="button" className="pl-linkbtn" onClick={() => set({ sel: String(x.s.id), area: "" })}>
                              {segName(x.s)}
                            </button>{" "}
                            <Chip id={h.id} />
                            <span className="pl-note"> {mainFix(h.id).text}</span>
                          </li>
                        ))}
                      </ul>
                      {grid[q].length > 8 && <p className="pl-note">and {nf(grid[q].length - 8)} more on the map.</p>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <p className="pl-note pl-section">
            Sources: ATRAI bike sensor campaign Heilbronn, Heat Island Summer School heat walks (Sep 2026), Stadt Heilbronn Baumkataster (dl-de/by-2-0), Unfallatlas (dl-de/by-2-0), OpenStreetMap schools (ODbL). Scores use the
            preset in use, {active.label}, only for the top {TOP_N} streets behind blind spots. Labels use the measures, not the preset.
          </p>
        </>
      )}
    </>
  );
}

/** "What's going on": the labels on one street, the numbers, the conclusion, and what to do. */
function StreetCard({ x, onClose }: { x: Item; onClose: () => void }) {
  return (
    <section className="gr-card pl-whatcard" aria-label={`What is going on in ${segName(x.s)}`}>
      <h2 style={{ fontSize: 19 }}>{segName(x.s)}</h2>
      <p className="pl-note">
        {districtLabel(x.s.district)}, {nf(Math.round(x.s.length))} m{x.s.m.schoolZone ? ", school or kindergarten within 300 m" : ""}
      </p>
      {x.hits.length === 0 && <p style={{ marginTop: 8 }}>No label. Plant trees here: {x.trees.join(", ")}.</p>}
      {x.hits.map((h) => {
        const p = PHENOMENA[h.id];
        return (
          <article key={h.id} className="pl-what">
            <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Chip id={h.id} />
              <Rating n={h.urgency} words={URGENCY_WORD} kind="Urgency" />
            </p>
            <p>
              <b>Data:</b> {h.evidence}.
            </p>
            <p>
              <b>What we think:</b> {p.assumption} <b>Needs:</b> {p.needs}
            </p>
            <table className="pl-table pl-res">
              <thead>
                <tr>
                  <th>Resolution</th>
                  <th>Ease</th>
                  <th>Lead</th>
                </tr>
              </thead>
              <tbody>
                {p.resolutions.map((r) => (
                  <tr key={r.text}>
                    <td>
                      {r.text}
                      {r.main && <span className="pl-chip" style={{ marginLeft: 6 }}>main fix</span>}
                    </td>
                    <td>
                      <Rating n={r.ease} words={EASE_WORD} kind="Ease" />
                    </td>
                    <td className="pl-note">{r.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details>
              <summary className="pl-note">Rule, guidance, and when the label clears</summary>
              <p className="pl-note">
                <b>Rule:</b> {p.rule}
              </p>
              {p.guidance.map((g) => (
                <p key={g} className="pl-note">
                  {g}
                </p>
              ))}
              <p className="pl-note">
                <b>Clears when:</b> {p.clears}
              </p>
            </details>
          </article>
        );
      })}
      {x.hits.length > 0 && x.trees.length > 0 && (
        <p className="pl-note" style={{ marginTop: 6 }}>
          <b>Plant trees here:</b> {x.trees.join(", ")}.
        </p>
      )}
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Link className="pl-btn primary" href={`/street/${x.s.id}`}>
          Open dossier
        </Link>
        <Link className="pl-btn" href={`/data?pick=${x.s.id}`}>
          Add to a data mission
        </Link>
        <button type="button" className="pl-btn" onClick={onClose}>
          Clear
        </button>
      </p>
    </section>
  );
}
