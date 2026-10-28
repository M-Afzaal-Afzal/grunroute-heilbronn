"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cellToBoundary, latLngToCell } from "h3-js";
import { usePlannerData, useJson, nf } from "@/lib/data";
import { rankFor, isStreet, type Level, type RankedRow } from "@/lib/rank";
import { resolvePreset, savePreset } from "@/lib/preset";
import { useUrlState } from "@/lib/url";
import { useCases, statusOf, STATUSES } from "@/lib/cases";
import { useScenarios, saveScenario, deleteScenario } from "@/lib/scenarios";
import { ATTRIBUTION, download, exportHeader, lineGeometry, toCsv } from "@/lib/export";
import { MEASURES, districtLabel, encodeWeights, presetForWeights, type MeasureKey, type Support, type Weights } from "@/lib/shared/priority";
import { heroFact, reasonLine, segName } from "@/lib/shared/segments";
import { bandFor, BANDS } from "@/lib/shared/data";
import { SortTable, type Column } from "@/components/SortTable";
import { BandTag } from "@/components/BandTag";
import { NetworkMap, type Focus, type MapLine, type MapPoly } from "@/components/map/NetworkMap";
import { WeightsPanel } from "@/components/fix/WeightsPanel";
import { WhyPanel } from "@/components/fix/WhyPanel";
import { Explainers } from "@/components/fix/Explainers";
import { Skeleton } from "@/components/ui/skeleton";

type ViewLevel = Level | "districts" | "h3";
const LEVELS: { id: ViewLevel; label: string }[] = [
  { id: "streets", label: "Streets" },
  { id: "segments", label: "Segments" },
  { id: "districts", label: "Districts" },
  { id: "h3", label: "H3 cells (r9)" },
];
const GREY = "#b8c2bd";
const UP = "#D55E00"; // more urgent in B (Okabe-Ito vermillion)
const DOWN = "#0072B2"; // less urgent in B (Okabe-Ito blue)
const TABLE_LIMIT = 400;

type Row = {
  key: string;
  name: string;
  district: string | null;
  length: number;
  score: number | null;
  support: Support | null;
  supportCount: number;
  rank: number | null;
  rankB: number | null;
  scoreB: number | null;
  status: string;
  count: number;
  reason: string;
  x: RankedRow | null;
  lines?: [number, number][][];
  rings?: [number, number][][];
  dossier: number | null;
};

const DEFAULTS = { p: "balanced", lv: "streets", d: "all", sup: "enough", sz: "0", ml: "20", mp: "any", st: "any", q: "", sort: "rank:asc", sel: "", b: "" };

type DistrictGeo = { features: { properties: { name: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };

export default function FixFirst() {
  const { data, error } = usePlannerData();
  const { data: districtsGeo } = useJson<DistrictGeo>("/data/heilbronn-districts.geojson");
  const [u, set, ready] = useUrlState(DEFAULTS);
  const cases = useCases();
  const scenarios = useScenarios();
  const [scenarioName, setScenarioName] = useState("");

  const A = resolvePreset(u.p);
  const scenarioB = scenarios.find((s) => s.name === u.b) ?? null;
  const B = scenarioB ? resolvePreset(scenarioB.code) : null;
  const level = (LEVELS.some((l) => l.id === u.lv) ? u.lv : "streets") as ViewLevel;
  const baseLevel: Level = level === "segments" || level === "h3" ? "segments" : "streets";
  const enoughOnly = u.sup === "enough";
  const minLen = Math.max(0, Number(u.ml) || 0);
  const [sortKey, sortDir] = u.sort.split(":") as [string, "asc" | "desc"];

  useEffect(() => {
    if (ready) savePreset(u.p);
  }, [ready, u.p]);

  const rankedA = useMemo(() => (data ? rankFor(data, A.preset, A.code, baseLevel, enoughOnly) : null), [data, A.preset, A.code, baseLevel, enoughOnly]);
  const rankedB = useMemo(() => (data && B ? rankFor(data, B.preset, B.code, baseLevel, enoughOnly) : null), [data, B, baseLevel, enoughOnly]);

  const districtNames = useMemo(() => (data ? [...new Set(data.segments.map((s) => s.district ?? "Heilbronn"))].sort((a, b) => a.localeCompare(b, "de")) : []), [data]);

  // Base rows: streets or segments with every filter applied.
  const baseRows = useMemo<Row[]>(() => {
    if (!data || !rankedA) return [];
    const bById = new Map(rankedB?.map((r) => [r.seg.id, r]) ?? []);
    const q = u.q.trim().toLowerCase();
    const out: Row[] = [];
    for (const x of rankedA) {
      const s = x.seg;
      if (u.d !== "all" && (s.district ?? "Heilbronn") !== u.d) continue;
      if (s.length < minLen) continue;
      if (u.sz === "1" && !s.m.schoolZone) continue;
      if (u.mp !== "any" && s.m[u.mp as MeasureKey] == null) continue;
      if (u.sup === "enough" && level !== "h3" && level !== "districts" && x.rank == null) continue;
      if (u.sup === "High" || u.sup === "Medium" || u.sup === "Low") {
        if (x.support !== u.sup) continue;
      }
      const streetId = isStreet(s) ? s.id : (data.streetOfSeg.get(s.id) ?? null);
      const status = streetId != null ? statusOf(cases, streetId) : "New";
      if (u.st !== "any" && status !== u.st) continue;
      const name = segName(s);
      if (q && !name.toLowerCase().includes(q)) continue;
      const b = bById.get(s.id);
      out.push({
        key: String(s.id),
        name,
        district: s.district,
        length: s.length,
        score: x.score,
        support: x.support,
        supportCount: x.supportCount,
        rank: x.rank,
        rankB: b?.rank ?? null,
        scoreB: b?.score ?? null,
        status,
        count: isStreet(s) ? s.segIds.length : 1,
        reason: reasonLine(x),
        x,
        lines: isStreet(s) ? s.lines : [s.g],
        dossier: streetId,
      });
    }
    return out;
  }, [data, rankedA, rankedB, u.q, u.d, u.sz, u.mp, u.sup, u.st, minLen, level, cases]);

  // Rolled up rows for districts and H3 cells: length weighted mean score.
  const rows = useMemo<Row[]>(() => {
    if (level === "streets" || level === "segments") return baseRows;
    const groups = new Map<string, { len: number; sumA: number; lenA: number; sumB: number; lenB: number; n: number; district: string | null; rings?: [number, number][][] }>();
    for (const r of baseRows) {
      const s = r.x!.seg;
      const key = level === "districts" ? (s.district ?? "Heilbronn") : latLngToCell(s.g[Math.floor(s.g.length / 2)][0], s.g[Math.floor(s.g.length / 2)][1], 9);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { len: 0, sumA: 0, lenA: 0, sumB: 0, lenB: 0, n: 0, district: s.district }));
      g.len += s.length;
      g.n++;
      if (r.score != null) {
        g.sumA += r.score * s.length;
        g.lenA += s.length;
      }
      if (r.scoreB != null) {
        g.sumB += r.scoreB * s.length;
        g.lenB += s.length;
      }
    }
    const list: Row[] = [...groups.entries()].map(([key, g]) => {
      let rings: [number, number][][] | undefined;
      if (level === "h3") rings = [cellToBoundary(key) as [number, number][]];
      else {
        const f = districtsGeo?.features.find((f) => f.properties.name === key);
        if (f) rings = f.geometry.type === "Polygon" ? (f.geometry.coordinates as number[][][]).map((r) => r.map(([x, y]) => [y, x] as [number, number])) : (f.geometry.coordinates as number[][][][]).flatMap((p) => p.map((r) => r.map(([x, y]) => [y, x] as [number, number])));
      }
      return {
        key,
        name: level === "districts" ? districtLabel(key) : key,
        district: g.district,
        length: g.len,
        score: g.lenA ? Math.round(g.sumA / g.lenA) : null,
        support: null,
        supportCount: 0,
        rank: null,
        rankB: null,
        scoreB: g.lenB ? Math.round(g.sumB / g.lenB) : null,
        status: "",
        count: g.n,
        reason: "",
        x: null,
        rings,
        dossier: null,
      };
    });
    const order = (k: "score" | "scoreB") => list.filter((r) => r[k] != null).sort((a, b) => b[k]! - a[k]! || b.length - a.length);
    order("score").forEach((r, i) => (r.rank = i + 1));
    order("scoreB").forEach((r, i) => (r.rankB = i + 1));
    return list;
  }, [level, baseRows, districtsGeo]);

  const selected = rows.find((r) => r.key === u.sel) ?? null;
  const focus: Focus = useMemo(() => (selected ? { id: selected.key, lines: selected.lines, rings: selected.rings } : null), [selected]);

  // Map: all streets or segments by band (grey for little data), even rows a list filter hides.
  const mapLines = useMemo<MapLine[] | undefined>(() => {
    if (!rankedA || level === "districts" || level === "h3") return undefined;
    const bById = B && rankedB ? new Map(rankedB.map((r) => [r.seg.id, r])) : null;
    return rankedA.map((x) => {
      const s = x.seg;
      let color = x.score == null ? GREY : bandFor(x.score).color;
      if (bById) {
        const b = bById.get(s.id);
        const ka = x.score == null ? -1 : BANDS.findIndex((bb) => bb.key === bandFor(x.score!).key);
        const kb = b?.score == null ? -1 : BANDS.findIndex((bb) => bb.key === bandFor(b.score!).key);
        color = ka === kb ? GREY : kb !== -1 && (ka === -1 || kb < ka) ? UP : DOWN;
      }
      return { id: String(s.id), lines: isStreet(s) ? s.lines : [s.g], color, weight: bById && color !== GREY ? 4 : 3, title: segName(s) };
    });
  }, [rankedA, rankedB, B, level]);

  const mapPolys = useMemo<MapPoly[] | undefined>(() => {
    if (level !== "districts" && level !== "h3") return undefined;
    return rows
      .filter((r) => r.rings)
      .map((r) => {
        let color = r.score == null ? GREY : bandFor(r.score).color;
        if (B && r.score != null && r.scoreB != null) {
          const ka = BANDS.findIndex((b) => b.key === bandFor(r.score!).key);
          const kb = BANDS.findIndex((b) => b.key === bandFor(r.scoreB!).key);
          color = ka === kb ? GREY : kb < ka ? UP : DOWN;
        }
        return { id: r.key, rings: r.rings!, color, opacity: level === "h3" ? 0.7 : 0.45, title: `${r.name}: ${r.score ?? "no score"}` };
      });
  }, [rows, level, B]);

  const onPick = useCallback(
    (id: number | string) => {
      const key = String(id);
      set({ sel: key });
      document.getElementById(`row-${key}`)?.scrollIntoView({ block: "nearest" });
    },
    [set],
  );

  function onWeights(w: Weights) {
    const id = presetForWeights(w);
    set({ p: id ?? `w${encodeWeights(w)}` });
  }

  function exportRows(kind: "csv" | "geojson") {
    const header = exportHeader(A.label, A.preset.weights);
    const base = `grunroute-${level}-${A.code}`;
    const measureCols = level === "streets" || level === "segments" ? MEASURES.map((m) => m.key) : [];
    if (kind === "csv") {
      const cols = ["rank", "id", "name", "district", "length_m", "score", "band", "support", "support_count", "status", "parts", ...measureCols, ...(B ? ["rank_b", "score_b", "rank_change"] : [])];
      const body = rows.map((r) => [
        r.rank,
        r.key,
        r.name,
        districtLabel(r.district),
        Math.round(r.length),
        r.score,
        r.score == null ? "Little data" : bandFor(r.score).label,
        r.support,
        r.supportCount || "",
        r.status,
        level === "districts" || level === "h3" ? `${r.count} ${baseLevel}` : "",
        ...measureCols.map((k) => {
          const v = r.x?.seg.m[k];
          return v == null ? "" : Math.round(v * 1000) / 1000;
        }),
        ...(B ? [r.rankB, r.scoreB, r.rank != null && r.rankB != null ? r.rank - r.rankB : ""] : []),
      ]);
      download(`${base}.csv`, toCsv([...header, ...(B ? [`Scenario B: ${scenarioB!.name} (${B.label})`] : [])], cols, body), "text/csv;charset=utf-8");
    } else {
      const fc = {
        type: "FeatureCollection",
        metadata: { note: header[0], built: header[1], weights: A.preset.weights, preset: A.label, attribution: ATTRIBUTION },
        features: rows
          .filter((r) => r.lines || r.rings)
          .map((r) => ({
            type: "Feature",
            geometry: r.rings ? { type: "Polygon", coordinates: r.rings.map((ring) => ring.map(([a, b]) => [b, a])) } : lineGeometry(r.lines!),
            properties: { rank: r.rank, id: r.key, name: r.name, district: districtLabel(r.district), length_m: Math.round(r.length), score: r.score, band: r.score == null ? "Little data" : bandFor(r.score).label, support: r.support, status: r.status || undefined, rank_b: B ? r.rankB : undefined },
          })),
      };
      download(`${base}.geojson`, JSON.stringify(fc), "application/geo+json");
    }
  }

  if (error) return <p role="alert">Could not load the street data: {error}</p>;
  const hero = data ? heroFact(data.meta) : null;
  const lowHidden = rankedA && enoughOnly ? rankedA.filter((x) => x.score != null && x.seg.length >= 20 && x.rank == null).length : 0;

  const cols: Column<Row>[] = [
    { key: "rank", label: "#", num: true, sort: (r) => r.rank, render: (r) => r.rank ?? "" },
    {
      key: "name",
      label: level === "districts" ? "District" : level === "h3" ? "Cell" : level === "segments" ? "Segment" : "Street",
      sort: (r) => r.name,
      render: (r) => (
        <>
          {r.dossier != null ? (
            <Link href={`/street/${r.dossier}`} onClick={(e) => e.stopPropagation()}>
              {r.name}
            </Link>
          ) : (
            r.name
          )}
          {r.reason && <span className="pl-reason">{r.reason}</span>}
        </>
      ),
    },
    ...(level === "streets" || level === "segments" || level === "h3" ? [{ key: "district", label: "District", sort: (r: Row) => districtLabel(r.district), render: (r: Row) => districtLabel(r.district) }] : []),
    { key: "length", label: level === "districts" || level === "h3" ? "Km" : "Length", num: true, sort: (r) => r.length, render: (r) => (level === "districts" || level === "h3" ? (r.length / 1000).toFixed(1) : `${Math.round(r.length)} m`) },
    { key: "score", label: "Score", num: true, sort: (r) => r.score, render: (r) => r.score ?? "" },
    { key: "band", label: "Band", sort: (r) => r.score, render: (r) => <BandTag score={r.score} /> },
    ...(level === "streets" || level === "segments"
      ? [
          { key: "support", label: "Support", sort: (r: Row) => r.supportCount, render: (r: Row) => (r.support ? `${r.support} (${r.supportCount})` : "none") },
          { key: "status", label: "Status", sort: (r: Row) => STATUSES.indexOf(r.status as (typeof STATUSES)[number]), render: (r: Row) => r.status },
        ]
      : [{ key: "count", label: level === "districts" ? "Streets" : "Segments", num: true, sort: (r: Row) => r.count, render: (r: Row) => nf(r.count) }]),
    ...(B
      ? [
          { key: "rankB", label: `# in ${scenarioB!.name}`, num: true, sort: (r: Row) => r.rankB, render: (r: Row) => r.rankB ?? "" },
          {
            key: "move",
            label: "Change",
            num: true,
            sort: (r: Row) => (r.rank != null && r.rankB != null ? r.rank - r.rankB : null),
            render: (r: Row) => {
              if (r.rank == null || r.rankB == null) return "";
              const d = r.rank - r.rankB;
              return d === 0 ? "same" : d > 0 ? <span className="pl-up">moves up {d}</span> : <span className="pl-down">moves down {-d}</span>;
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <header>
        <h1>Fix first</h1>
        <p>
          Which streets to check and fix first, by your priorities. Every filter, the level, the sort and the selection live in the URL, so <b>Copy link</b> shares this exact view.
        </p>
        {hero && (
          <p style={{ marginTop: 8, color: "var(--text)" }}>
            <b style={{ fontSize: 22, fontFamily: "var(--font-display)" }}>{hero.big}</b> {hero.text} <span className="pl-note">{hero.caveat}</span>
          </p>
        )}
      </header>

      {!data || !ready ? (
        <Skeleton label="Loading the street network" />
      ) : (
        <>
          <WeightsPanel code={u.p} weights={A.preset.weights} onPreset={(id) => set({ p: id })} onWeights={onWeights} />

          <div className="pl-toolbar" style={{ marginTop: 16 }} role="group" aria-label="Level and filters">
            <div className="f" style={{ display: "grid", gap: 2 }}>
              <span className="pl-note" style={{ fontWeight: 600 }}>
                Level
              </span>
              <div className="pl-seg" role="group" aria-label="Level">
                {LEVELS.map((l) => (
                  <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => set({ lv: l.id, sel: "", sort: "rank:asc" })}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="f">
              Search
              <input type="text" value={u.q} placeholder="Street name" onChange={(e) => set({ q: e.target.value })} />
            </label>
            <label className="f">
              District
              <select value={u.d} onChange={(e) => set({ d: e.target.value })}>
                <option value="all">All districts</option>
                {districtNames.map((d) => (
                  <option key={d} value={d}>
                    {districtLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              Data support
              <select value={u.sup} onChange={(e) => set({ sup: e.target.value })}>
                <option value="enough">Enough data only</option>
                <option value="all">All, including Low</option>
                <option value="High">High only</option>
                <option value="Medium">Medium only</option>
                <option value="Low">Low only</option>
              </select>
            </label>
            <label className="f">
              Measure present
              <select value={u.mp} onChange={(e) => set({ mp: e.target.value })}>
                <option value="any">Any</option>
                {MEASURES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              Status
              <select value={u.st} onChange={(e) => set({ st: e.target.value })}>
                <option value="any">Any</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              Min length (m)
              <input type="number" min={0} step={10} value={u.ml} style={{ width: 90 }} onChange={(e) => set({ ml: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={u.sz === "1"} onChange={(e) => set({ sz: e.target.checked ? "1" : "0" })} />
              <span>School zone only</span>
            </label>
          </div>

          <div className="pl-toolbar" role="group" aria-label="Scenarios and export">
            <label className="f">
              Save these weights as
              <input type="text" value={scenarioName} placeholder="Scenario name" maxLength={40} onChange={(e) => setScenarioName(e.target.value)} />
            </label>
            <button
              type="button"
              className="pl-btn"
              disabled={!scenarioName.trim()}
              onClick={() => {
                saveScenario(scenarioName, u.p);
                setScenarioName("");
              }}
            >
              Save scenario
            </button>
            <label className="f">
              Compare with (B)
              <select value={scenarioB ? u.b : ""} onChange={(e) => set({ b: e.target.value })}>
                <option value="">No comparison</option>
                {scenarios.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({resolvePreset(s.code).label})
                  </option>
                ))}
              </select>
            </label>
            {scenarioB && (
              <button type="button" className="pl-btn" onClick={() => (deleteScenario(scenarioB.name), set({ b: "" }))}>
                Delete {scenarioB.name}
              </button>
            )}
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button type="button" className="pl-btn" onClick={() => exportRows("csv")}>
                Export CSV
              </button>
              <button type="button" className="pl-btn" onClick={() => exportRows("geojson")}>
                Export GeoJSON
              </button>
            </span>
          </div>
          <p className="pl-note" style={{ marginTop: -8, marginBottom: 12 }}>
            Scenarios are saved in this browser only. A is the current weights ({A.label}){B ? `, B is ${scenarioB!.name} (${B.label})` : ""}.
          </p>

          <p aria-live="polite" style={{ fontSize: 14, marginBottom: 8 }}>
            {nf(rows.length)} {level === "h3" ? "cells" : level} match
            {level === "districts" || level === "h3" ? `, built from ${nf(baseRows.length)} ${baseLevel}` : ""}.
            {enoughOnly && lowHidden > 0 && ` ${nf(lowHidden)} ${baseLevel} with low data support are hidden from the list. They stay on the map.`}
            {rows.length > TABLE_LIMIT && ` The table shows the first ${TABLE_LIMIT} in this sort, export for all.`}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="pl-fix-grid">
            <div>
              <SortTable
                columns={cols}
                rows={rows}
                rowKey={(r) => r.key}
                sort={{ key: sortKey, dir: sortDir }}
                onSort={(s) => set({ sort: `${s.key}:${s.dir}` })}
                onRowClick={(r) => set({ sel: r.key === u.sel ? "" : r.key })}
                activeKey={u.sel || null}
                limit={TABLE_LIMIT}
                maxHeight={720}
                caption="Fix first table"
              />
            </div>
            <div style={{ position: "sticky", top: 70, display: "grid", gap: 12 }}>
              <NetworkMap lines={mapLines} polys={mapPolys} focus={focus} onPick={onPick} height={460} label="Network map, coloured by fix score band" />
              <div className="pl-legend">
                {B ? (
                  <>
                    <span>
                      <i style={{ background: UP }} />
                      More urgent band in B
                    </span>
                    <span>
                      <i style={{ background: DOWN }} />
                      Less urgent band in B
                    </span>
                    <span>
                      <i style={{ background: GREY }} />
                      Same band
                    </span>
                  </>
                ) : (
                  <>
                    {BANDS.map((b) => (
                      <span key={b.key}>
                        <i style={{ background: b.color }} />
                        {b.label} ({b.range})
                      </span>
                    ))}
                    <span>
                      <i style={{ background: GREY }} />
                      Little data
                    </span>
                  </>
                )}
              </div>
              {selected?.x ? (
                <WhyPanel x={selected.x} rank={selected.rank} dossierId={selected.dossier} />
              ) : selected ? (
                <section className="gr-card">
                  <h2 style={{ fontSize: 20 }}>{selected.name}</h2>
                  <p className="pl-note">
                    Length weighted mean score of {nf(selected.count)} {baseLevel}: <b>{selected.score ?? "no score"}</b>
                    {B && selected.scoreB != null ? `, in B ${selected.scoreB}` : ""}. Km measured {(selected.length / 1000).toFixed(1)}.
                  </p>
                </section>
              ) : (
                <p className="pl-note">Click a row or a line on the map to see why it ranks where it does.</p>
              )}
            </div>
          </div>

          <Explainers meta={data.meta} />
        </>
      )}
    </>
  );
}
