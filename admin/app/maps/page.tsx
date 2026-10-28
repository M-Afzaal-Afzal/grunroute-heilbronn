"use client";
// A3 Heat maps: one H3 layer at a time, or two synced maps to compare.
// Averaged layers hide cells with fewer than 5 points and say how many.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type * as Leaflet from "leaflet";
import { cellToBoundary, getResolution, latLngToCell } from "h3-js";
import { BANDS, bandFor } from "@/lib/shared/data";
import { districtLabel, type Segment } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { usePlannerData, useJson, nf } from "@/lib/data";
import { useUrlState } from "@/lib/url";
import { useActivePreset } from "@/lib/preset";
import { rankFor } from "@/lib/rank";
import { ramp, VIRIDIS } from "@/lib/colors";
import { ATTRIBUTION, download } from "@/lib/export";
import {
  LAYERS, MIN_POINTS, computeLayer, crashMatch, dustUnit, layerDef, segmentCells,
  type CrashFile, type HexFile, type LayerKey, type LayerResult,
} from "@/lib/hex";
import { HexMap, syncMaps, type HexCell, type Overlay } from "@/components/map/HexMap";

type Geo = { features: { properties: { name?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };
type SchoolFile = { schools: { lat: number; lng: number; name: string; type: string }[] };

const DEFAULTS = { l: "heat", r: "9", yr: "all", m: "all", t: "0", b: "", ov: "boundary", c: "" };
const OVERLAYS = [
  { key: "boundary", label: "City boundary" },
  { key: "districts", label: "Districts" },
  { key: "schools", label: "Schools and kindergartens" },
  { key: "streets", label: "Streets by fix score" },
];
const GREY = "#b8c2bd";

const rings = (g: Geo["features"][number]["geometry"]) =>
  (g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][])).map((p) => p[0].map(([x, y]) => [y, x] as [number, number]));

export default function MapsPage() {
  const [u, set, ready] = useUrlState(DEFAULTS);
  const { data } = usePlannerData();
  const res = Number(u.r);
  const { data: hex } = useJson<HexFile>(`/data/hex-r${res}.json`);
  const { data: crashFile } = useJson<CrashFile>("/data/crashes.json");
  const { data: boundary } = useJson<Geo>("/data/heilbronn-boundary.geojson");
  const { data: districts } = useJson<Geo>("/data/heilbronn-districts.geojson");
  const { data: schools } = useJson<SchoolFile>("/data/schools.json");
  const active = useActivePreset();
  const threshold = Number(u.t);
  const ov = useMemo(() => new Set(u.ov.split(",").filter(Boolean)), [u.ov]);

  const segScores = useMemo(() => {
    if (!data) return null;
    const m = new Map<number, number>();
    for (const x of rankFor(data, active.preset, active.code, "segments", false)) if (x.score != null) m.set(x.seg.id, x.score);
    return m;
  }, [data, active]);
  const streetRank = useMemo(() => {
    if (!data) return null;
    return new Map(rankFor(data, active.preset, active.code).map((x) => [x.seg.id, x]));
  }, [data, active]);
  const segCells = useMemo(() => (data ? segmentCells(data.segments, res) : new Map()), [data, res]);

  const layer = (k: LayerKey): LayerResult | null =>
    hex && hex.res === res ? computeLayer(k, { hex, res, crashes: crashFile?.crashes ?? null, year: u.yr, mode: u.m, threshold, scores: segScores, segCells }) : null;
  const keyA = layerDef(u.l).key;
  const keyB = u.b ? layerDef(u.b).key : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resA = useMemo(() => layer(keyA), [hex, res, crashFile, u.yr, u.m, threshold, segScores, segCells, keyA]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resB = useMemo(() => (keyB ? layer(keyB) : null), [hex, res, crashFile, u.yr, u.m, threshold, segScores, segCells, keyB]);

  const fmtFor = useCallback((k: LayerKey) => (k === "dust" && threshold > 0 ? (v: number) => `${Math.round(v)}%` : layerDef(k).fmt), [threshold]);
  const toCells = useCallback(
    (k: LayerKey, r: LayerResult | null): HexCell[] => {
      if (!r) return [];
      const def = layerDef(k);
      const fmt = fmtFor(k);
      const [lo, hi] = r.domain;
      return [...r.values].map(([id, x]) => ({
        id,
        color: ramp((x.v - lo) / (hi - lo)),
        title: `${def.label}: ${fmt(x.v)}, ${nf(x.n)} ${def.points}`,
      }));
    },
    [fmtFor],
  );
  const cellsA = useMemo(() => toCells(keyA, resA), [toCells, keyA, resA]);
  const cellsB = useMemo(() => (keyB ? toCells(keyB, resB) : []), [toCells, keyB, resB]);

  const overlays = useMemo(() => {
    const out: Overlay[] = [];
    if (ov.has("boundary") && boundary)
      out.push((_m, L) => L.polygon(boundary.features.flatMap((f) => rings(f.geometry)), { color: "#0f2a23", weight: 2.5, fill: false, interactive: false }));
    if (ov.has("districts") && districts)
      out.push((_m, L) =>
        L.layerGroup(
          districts.features.map((f) =>
            L.polygon(rings(f.geometry), { color: "#0f2a23", weight: 1.2, dashArray: "4 4", fill: false, interactive: false }).bindTooltip(districtLabel(f.properties.name ?? ""), { sticky: true }),
          ),
        ),
      );
    if (ov.has("schools") && schools)
      out.push((_m, L) =>
        L.layerGroup(
          schools.schools.map((s) =>
            L.circleMarker([s.lat, s.lng], { radius: 4, color: "#ffffff", weight: 1.5, fillColor: "#0f2a23", fillOpacity: 1 }).bindTooltip(s.name || (s.type === "school" ? "School" : "Kindergarten")),
          ),
        ),
      );
    if (ov.has("streets") && data && segScores)
      out.push((_m, L) => {
        const groups = new Map<string, [number, number][][]>();
        for (const s of data.segments) {
          const sc = segScores.get(s.id);
          const color = sc == null ? GREY : bandFor(sc).color;
          const list = groups.get(color) ?? [];
          list.push(s.g);
          groups.set(color, list);
        }
        const renderer = L.canvas();
        return L.layerGroup([...groups].map(([color, lines]) => L.polyline(lines, { color, weight: 2, opacity: 0.9, interactive: false, renderer })));
      });
    return out;
  }, [ov, boundary, districts, schools, data, segScores]);

  const [mapA, setMapA] = useState<Leaflet.Map | null>(null);
  const [mapB, setMapB] = useState<Leaflet.Map | null>(null);
  useEffect(() => {
    if (mapA && mapB) return syncMaps(mapA, mapB);
  }, [mapA, mapB]);
  // First view: the whole city.
  useEffect(() => {
    if (!mapA || !boundary) return;
    const pts = boundary.features.flatMap((f) => rings(f.geometry).flat());
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
    mapA.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [8, 8] });
  }, [mapA, boundary]);

  // A selected cell only makes sense at its own resolution.
  const cell = u.c && hex?.cells && (hex.cells[u.c] || segCells.has(u.c)) ? u.c : "";
  const toggleOverlay = (k: string) => {
    const next = new Set(ov);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    set({ ov: [...next].join(",") });
  };

  function exportGeoJson() {
    if (!resA || !hex) return;
    const def = layerDef(keyA);
    const fc = {
      type: "FeatureCollection",
      metadata: {
        title: `GrünRoute Planner heat map: ${def.label}, H3 resolution ${res}`,
        unit: keyA === "dust" ? dustUnit(threshold) : def.unit,
        hiddenCells: def.averaged ? `${resA.hidden} cells with fewer than ${MIN_POINTS} ${def.points} not exported` : "none",
        filters: keyA === "crash" ? `year ${u.yr}, ${u.m}` : keyA === "dust" ? `threshold ${threshold}` : "none",
        built: hex.built,
        exported: new Date().toISOString().slice(0, 10),
        note: "Screening tool. Final decisions use official city data.",
        sources: ATTRIBUTION,
      },
      features: [...resA.values].map(([id, x]) => ({
        type: "Feature",
        properties: { h3: id, value: Math.round(x.v * 100) / 100, points: x.n },
        geometry: { type: "Polygon", coordinates: [[...cellToBoundary(id, true)]] },
      })),
    };
    download(`grunroute-${keyA}-r${res}.geojson`, JSON.stringify(fc), "application/geo+json");
  }

  function exportPng() {
    if (!mapA || !resA) return;
    const size = mapA.getSize();
    const legendH = 90;
    const canvas = document.createElement("canvas");
    const dpr = 2;
    canvas.width = size.x * dpr;
    canvas.height = (size.y + legendH) * dpr;
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    g.fillStyle = "#f4f7f5";
    g.fillRect(0, 0, size.x, size.y + legendH);
    const pt = (lat: number, lng: number) => mapA.latLngToContainerPoint([lat, lng]);
    const path = (ring: [number, number][]) => {
      g.beginPath();
      ring.forEach(([la, ln], i) => {
        const p = pt(la, ln);
        if (i) g.lineTo(p.x, p.y);
        else g.moveTo(p.x, p.y);
      });
      g.closePath();
    };
    for (const c of cellsA) {
      path(cellToBoundary(c.id));
      g.fillStyle = c.color;
      g.fill();
    }
    g.strokeStyle = "#0f2a23";
    if (boundary) {
      g.lineWidth = 2;
      for (const f of boundary.features) for (const r of rings(f.geometry)) {
        path(r);
        g.stroke();
      }
    }
    if (ov.has("districts") && districts) {
      g.lineWidth = 0.8;
      g.setLineDash([4, 4]);
      for (const f of districts.features) for (const r of rings(f.geometry)) {
        path(r);
        g.stroke();
      }
      g.setLineDash([]);
    }
    const def = layerDef(keyA);
    const fmt = fmtFor(keyA);
    const y0 = size.y + 12;
    g.fillStyle = "#0f2a23";
    g.font = "600 15px sans-serif";
    g.fillText(`${def.label}, H3 resolution ${res}, ${def.date}`, 12, y0 + 12);
    VIRIDIS.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(12 + i * 28, y0 + 22, 28, 12);
    });
    g.fillStyle = "#0f2a23";
    g.font = "12px sans-serif";
    g.fillText(`${fmt(resA.domain[0])}   to   ${fmt(resA.domain[1])}   (${keyA === "dust" ? dustUnit(threshold) : def.unit})`, 12 + VIRIDIS.length * 28 + 10, y0 + 33);
    const hiddenNote = def.averaged ? `${resA.hidden} cells with fewer than ${MIN_POINTS} ${def.points} hidden. ` : "";
    g.fillText(`${hiddenNote}Source: ${def.source}. Base map not included. Screening tool, final decisions use official city data.`, 12, y0 + 54);
    g.fillText(`GrünRoute Planner, data built ${hex?.built ?? ""}`, 12, y0 + 70);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `grunroute-${keyA}-r${res}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  const loading = !ready || !hex || hex.res !== res || !resA;
  const years = crashFile?.years ?? [];

  return (
    <>
      <header>
        <h1>Heat maps</h1>
        <p>
          One layer at a time on H3 hexagons. Averaged layers hide cells with fewer than {MIN_POINTS} points, so a single reading never colours a cell. Use compare to put two layers side by side, for example hot and no trees.
        </p>
      </header>

      <section className="gr-card pl-section" aria-label="Layer and filters">
        <div className="pl-toolbar">
          <label className="f">
            Layer
            <select value={keyA} onChange={(e) => set({ l: e.target.value, c: "" })}>
              {LAYERS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="f" style={{ display: "grid", gap: 2, fontSize: 13, fontWeight: 600, color: "var(--moss)" }}>
            Resolution
            <div className="pl-seg" role="group" aria-label="H3 resolution">
              {["8", "9", "10"].map((r) => (
                <button key={r} type="button" aria-pressed={u.r === r} onClick={() => set({ r, c: "" })} title={r === "8" ? "about 0.7 km² per cell" : r === "9" ? "about 0.1 km² per cell" : "about 0.015 km² per cell"}>
                  r{r}
                </button>
              ))}
            </div>
          </div>
          <label className="f">
            Compare with
            <select value={keyB ?? ""} onChange={(e) => set({ b: e.target.value })}>
              <option value="">No compare</option>
              {LAYERS.filter((l) => l.key !== keyA).map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="pl-btn" onClick={() => set({ l: "heat", b: "crown", c: "" })}>
            Hot and no trees
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="pl-btn" onClick={exportGeoJson} disabled={loading}>
            Export GeoJSON
          </button>
          <button type="button" className="pl-btn" onClick={exportPng} disabled={loading}>
            Export PNG
          </button>
        </div>
        <div className="pl-toolbar" style={{ marginBottom: 0 }}>
          <label className="f">
            Crash year
            <select value={u.yr} onChange={(e) => set({ yr: e.target.value })}>
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Crashes with
            <select value={u.m} onChange={(e) => set({ m: e.target.value })}>
              <option value="all">Bike or foot</option>
              <option value="bike">Bike</option>
              <option value="foot">Person on foot</option>
            </select>
          </label>
          <label className="f">
            Danger threshold: {threshold > 0 ? threshold.toFixed(1) : "off, show the mean"}
            <input type="range" min={0} max={0.9} step={0.1} value={threshold} onChange={(e) => set({ t: e.target.value })} style={{ accentColor: "var(--gruen)", width: 200 }} />
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <legend className="sr-only">Overlays</legend>
            {OVERLAYS.map((o) => (
              <label key={o.key} className="check" style={{ fontSize: 14 }}>
                <input type="checkbox" checked={ov.has(o.key)} onChange={() => toggleOverlay(o.key)} /> {o.label}
              </label>
            ))}
          </fieldset>
        </div>
        <p className="pl-note" style={{ marginTop: 8 }}>
          Year and bike or foot apply to the crash layer. The threshold applies to danger and dust. Streets by fix score use the active preset, {active.label}.
        </p>
      </section>

      <div className="pl-section" style={{ display: "grid", gridTemplateColumns: keyB ? "1fr 1fr" : "1fr 340px", gap: 16, alignItems: "start" }}>
        <MapColumn
          k={keyA}
          r={resA}
          cells={cellsA}
          overlays={overlays}
          selected={cell}
          onPick={(id) => set({ c: id })}
          onReady={setMapA}
          loading={loading}
          threshold={threshold}
          fmt={fmtFor(keyA)}
          res={res}
          crashFilter={keyA === "crash" ? { yr: u.yr, m: u.m } : null}
        />
        {keyB ? (
          <MapColumn
            k={keyB}
            r={resB}
            cells={cellsB}
            overlays={overlays}
            selected={cell}
            onPick={(id) => set({ c: id })}
            onReady={setMapB}
            loading={loading}
            threshold={threshold}
            fmt={fmtFor(keyB)}
            res={res}
            crashFilter={keyB === "crash" ? { yr: u.yr, m: u.m } : null}
          />
        ) : (
          <CellPanel id={cell} hex={hex} crashFile={crashFile} yr={u.yr} m={u.m} segCells={segCells} segScores={segScores} streetRank={streetRank} streetOfSeg={data?.streetOfSeg ?? null} />
        )}
      </div>
      {keyB && (
        <div className="pl-section" style={{ maxWidth: 720 }}>
          <CellPanel id={cell} hex={hex} crashFile={crashFile} yr={u.yr} m={u.m} segCells={segCells} segScores={segScores} streetRank={streetRank} streetOfSeg={data?.streetOfSeg ?? null} />
        </div>
      )}
      <p className="pl-note pl-section">Sources: {ATTRIBUTION.join("; ")}. Base map tiles © OpenStreetMap contributors.</p>
    </>
  );
}

type ColumnProps = {
  k: LayerKey;
  r: LayerResult | null;
  cells: HexCell[];
  overlays: Overlay[];
  selected: string;
  onPick: (id: string) => void;
  onReady: (m: Leaflet.Map | null) => void;
  loading: boolean;
  threshold: number;
  fmt: (v: number) => string;
  res: number;
  crashFilter: { yr: string; m: string } | null;
};

function MapColumn({ k, r, cells, overlays, selected, onPick, onReady, loading, threshold, fmt, res, crashFilter }: ColumnProps) {
  const def = layerDef(k);
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <div style={{ position: "relative" }}>
        <HexMap cells={cells} overlays={overlays} selected={selected} onPick={onPick} onReady={onReady} label={`${def.label} heat map`} height={620} />
        {loading && (
          <div className="gr-skeleton" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 500 }} role="status">
            Loading the hex layer
          </div>
        )}
      </div>
      <Legend def={def} r={r} unit={k === "dust" ? dustUnit(threshold) : def.unit} fmt={fmt} res={res} crashFilter={crashFilter} />
    </div>
  );
}

function Legend({ def, r, unit, fmt, res, crashFilter }: { def: ReturnType<typeof layerDef>; r: LayerResult | null; unit: string; fmt: (v: number) => string; res: number; crashFilter: { yr: string; m: string } | null }) {
  return (
    <section className="gr-card" aria-label={`Legend for ${def.label}`} style={{ padding: 12 }}>
      <p style={{ fontWeight: 700 }}>
        {def.label} <span className="pl-note">({unit})</span>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span className="num" style={{ fontSize: 13 }}>{r ? fmt(r.domain[0]) : ""}</span>
        <span aria-hidden="true" style={{ display: "flex", flex: 1, maxWidth: 260, height: 12, borderRadius: 3, overflow: "hidden" }}>
          {VIRIDIS.map((c) => (
            <i key={c} style={{ flex: 1, background: c }} />
          ))}
        </span>
        <span className="num" style={{ fontSize: 13 }}>{r ? `${fmt(r.domain[1])}+` : ""}</span>
      </div>
      <p className="pl-note" style={{ marginTop: 6 }}>
        {r ? `${nf(r.values.size)} cells shown at H3 resolution ${res}. ` : ""}
        {def.averaged
          ? r
            ? `${nf(r.hidden)} cells with fewer than ${MIN_POINTS} ${def.points} are hidden. `
            : ""
          : `Counts, every cell with at least one ${def.one} is shown. `}
        Colours run over the middle 90% of cells{def.averaged ? "" : ", from 0"}. {def.date}. Source: {def.source}.
        {crashFilter ? ` Filter: ${crashFilter.yr === "all" ? "all years" : crashFilter.yr}, ${crashFilter.m === "all" ? "bike or foot" : crashFilter.m === "bike" ? "bike" : "person on foot"}.` : ""}
      </p>
      {def.key === "heat" && <p className="pl-note">Each walk ran at a different time of day, so values are differences against the same walk, not raw temperatures.</p>}
      {def.key === "pass" && <p className="pl-note">150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule.</p>}
      {def.key === "crown" && <p className="pl-note">Public register trees only. Crown area is a circle from the register crown diameter, overlaps count twice up to 100%.</p>}
    </section>
  );
}

type PanelProps = {
  id: string;
  hex: HexFile | null;
  crashFile: CrashFile | null;
  yr: string;
  m: string;
  segCells: Map<string, Segment[]>;
  segScores: Map<number, number> | null;
  streetRank: Map<number, { rank: number | null; score: number | null }> | null;
  streetOfSeg: Map<number, number> | null;
};

function CellPanel({ id, hex, crashFile, yr, m, segCells, segScores, streetRank, streetOfSeg }: PanelProps) {
  const info = useMemo(() => {
    if (!id || !hex) return null;
    const row = hex.cells[id];
    const crashes = (crashFile?.crashes ?? []).filter((c) => crashMatch(c, yr, m) && latLngIn(id, c.lat, c.lng));
    const segs = segCells.get(id) ?? [];
    const scored = segs.filter((s) => segScores?.get(s.id) != null);
    const len = scored.reduce((a, s) => a + s.length, 0);
    const meanScore = len ? scored.reduce((a, s) => a + segScores!.get(s.id)! * s.length, 0) / len : null;
    const streets = new Map<number, { name: string; district: string | null; rank: number | null; score: number | null }>();
    for (const s of segs) {
      const sid = streetOfSeg?.get(s.id);
      if (sid == null || streets.has(sid)) continue;
      const r = streetRank?.get(sid);
      streets.set(sid, { name: segName(s), district: s.district, rank: r?.rank ?? null, score: r?.score ?? null });
    }
    const list = [...streets].sort((a, b) => (a[1].rank ?? 1e9) - (b[1].rank ?? 1e9));
    return { row, crashes: crashes.length, segs: segs.length, scored: scored.length, meanScore, list };
  }, [id, hex, crashFile, yr, m, segCells, segScores, streetRank, streetOfSeg]);

  if (!info) {
    return (
      <section className="gr-card" aria-label="Cell details">
        <h2 style={{ fontSize: 20 }}>Cell details</h2>
        <p className="pl-note">Click a hexagon to see its values, the number of points behind each, and the streets inside it.</p>
      </section>
    );
  }
  const r = info.row;
  const rows: [string, string][] = [
    ["Heat walk anomaly", r && r[0] != null ? `${r[0] > 0 ? "+" : ""}${r[0].toFixed(1)} °C, ${nf(r[1])} readings` : "no heat walk here"],
    ["Close passes", r && r[3] ? `${nf(r[2])} of ${nf(r[3])} passes under 150 cm` : "no measured passes"],
    ["Danger and dust", r && r[4] != null ? `${r[4].toFixed(2)} mean risk, ${nf(r[5])} points` : "no sensor points"],
    ["Crashes", `${info.crashes} with the current filter`],
    ["Crown cover", r && r[7] ? `${r[8].toFixed(0)}%, ${nf(r[7])} register trees` : "no register trees"],
    ["Data coverage", r && r[9] != null ? `${Math.round(r[9] * 100)}% of street length, ${nf(r[10])} segments` : "no street segments"],
    ["Mean fix score", info.meanScore != null ? `${Math.round(info.meanScore)} over ${info.scored} scored segments` : "no scored segments"],
  ];
  return (
    <section className="gr-card" aria-label="Cell details">
      <h2 style={{ fontSize: 20 }}>Cell details</h2>
      <p className="pl-note num">{id}</p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 14, margin: "8px 0 0" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600 }}>{k}</dt>
            <dd style={{ margin: 0 }}>{v}</dd>
          </div>
        ))}
      </dl>
      <h3 style={{ fontSize: 16, marginTop: 12 }}>Streets in this cell ({info.list.length})</h3>
      {info.list.length === 0 ? (
        <p className="pl-note">No mapped street segment has its middle in this cell.</p>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 14, maxHeight: 260, overflow: "auto" }}>
          {info.list.map(([sid, s]) => (
            <li key={sid}>
              <Link href={`/street/${sid}`}>{s.name}</Link>{" "}
              <span className="pl-note">
                {districtLabel(s.district)}, {s.score != null ? `score ${s.score}, ${bandFor(s.score).label}` : "little data"}
                {s.rank != null ? `, rank ${s.rank}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="pl-note" style={{ marginTop: 8 }}>
        Bands: {BANDS.map((b) => b.label).join(", ")}. Ranks use the active preset.
      </p>
    </section>
  );
}

const latLngIn = (id: string, lat: number, lng: number) => latLngToCell(lat, lng, getResolution(id)) === id;
