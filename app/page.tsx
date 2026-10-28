"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BANDS, CAMPAIGN, PLACES, bandFor, type PlaceKey } from "../lib/data";
import { LogoMark, Wordmark } from "../components/brand/Logo";
import InfoCard from "../components/InfoCard";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../components/ui/select";
import { fmtAnomaly, type DangerPoint } from "../lib/geo";
import { HEAT_WALK } from "../lib/heat-walks";
import { insightFor, shadeGaps, type Selection } from "../lib/insights";
import {
  MAX_WEIGHT,
  MEASURES,
  PRESETS,
  decodeWeights,
  encodeWeights,
  percentiles,
  presetById,
  presetForWeights,
  rankSegments,
  type MeasureKey,
  type PresetId,
  type Weights,
} from "../lib/priority";
import { RULE_150, heroFact, loadSegments, measureDetail, reasonLine, segName, segmentInsight, type SegmentData } from "../lib/segments";
import { SOURCES } from "../lib/sources";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { loadDangerPoints } from "../lib/atrai";
import { fetchRouteOptions, rankRoutes, type Mode, type RawRoute, type RouteOption } from "../lib/routing";
import type { Layers, MapPlace, TopItem } from "../components/MapView";

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="map map-loading" aria-hidden="true" />,
});

type View = "city" | "people";
type LiveState = "loading" | "ok" | "stale" | "offline";
type LiveValue = { temp: string | null; pm10: string | null; pm25: string | null; same: boolean; box: string; time: string };
type BoxDetail = {
  name?: string;
  sensors?: Array<{ title?: string; unit?: string; lastMeasurement?: { value?: string | number; createdAt?: string } | string | null }>;
};
type LoadState = "idle" | "loading" | "ok" | "error";

const WEIGHT_WORD = ["Off", "Low", "Medium", "High"];
const TOP_N = 20;
const nf = (n: number) => n.toLocaleString("en-GB");
const count = (meta: SegmentData["meta"] | undefined, key: string) => {
  const v = meta?.counts[key];
  return typeof v === "number" ? nf(v) : "Loading";
};

const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const ROUTE_NAME: Record<RouteOption["label"], string> = {
  green: "GrünRoute",
  fastest: "Fastest",
  both: "Fastest and greenest",
  other: "Another option",
};

function routeTips(r: RouteOption, mode: Mode) {
  const m = r.metrics;
  const tips: string[] = [];
  if (m.heat.covered >= 0.2 && m.heat.hottest && m.heat.hottest.anomaly >= 1) {
    tips.push(`The warmest heat walk spot on this route was ${fmtAnomaly(m.heat.hottest.anomaly)} compared with the same walk. Shade and water help on hot days.`);
  }
  if (m.heat.covered < 0.2) tips.push("Few heat walks went along this route, so heat is not compared here.");
  if (m.water > 0) tips.push(`${m.water} drinking water ${m.water === 1 ? "point" : "points"} close to the route.`);
  if (m.fixStreets.length) tips.push(`Passes ${m.fixStreets.join(", ")}, ${m.fixStreets.length === 1 ? "a street" : "streets"} on the fix first list. ${mode === "bike" ? "Ride with care, cars pass close there." : "Take care when crossing."}`);
  if (m.danger !== null && m.danger > 0 && mode === "bike") tips.push(`${m.danger} close pass ${m.danger === 1 ? "point was" : "points were"} recorded by bike sensors along this route.`);
  if (m.treeSource === "city" && m.bigCrowns !== null && m.bigCrowns > 0) tips.push(`${m.bigCrowns} big ${m.bigCrowns === 1 ? "tree" : "trees"} with a crown of 8 m or more within 20 m, good shade.`);
  else if (m.treeSource === "osm" && m.treesPerKm >= 40) tips.push("Many mapped trees along the way, so expect more shade.");
  if (!tips.length) tips.push("Nothing stands out in the data for this route.");
  return tips;
}

function compareLine(green: RouteOption | undefined, fast: RouteOption | undefined) {
  if (!green || !fast || green === fast) return null;
  const dMin = green.metrics.min - fast.metrics.min;
  const dTrees = green.metrics.trees - fast.metrics.trees;
  const parts: string[] = [];
  parts.push(dMin > 0 ? `${dMin} min longer` : dMin < 0 ? `${-dMin} min shorter` : "about the same time");
  if (dTrees > 0) parts.push(`${dTrees} more ${green.metrics.treeSource === "city" ? "city" : "mapped"} trees`);
  if (green.metrics.heat.avg !== null && fast.metrics.heat.avg !== null && green.metrics.heat.avg < fast.metrics.heat.avg) parts.push("cooler heat walk spots");
  if (green.metrics.fixStreets.length < fast.metrics.fixStreets.length) parts.push("fewer fix first streets");
  if (green.metrics.danger !== null && fast.metrics.danger !== null && green.metrics.danger < fast.metrics.danger) parts.push(`${fast.metrics.danger - green.metrics.danger} fewer close pass points`);
  return `GrünRoute: ${parts.join(", ")} than the fastest route.`;
}

export default function Home() {
  const [view, setView] = useState<View>("city");
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState<string>("all");
  const [resetKey, setResetKey] = useState(0);
  const [openCard, setOpenCard] = useState<number | null>(null);

  // Measured street network and the user's priorities.
  const [data, setData] = useState<SegmentData | null>(null);
  const [dataState, setDataState] = useState<LoadState>("loading");
  const [dataTry, setDataTry] = useState(0);
  const [presetId, setPresetId] = useState<PresetId | null>("balanced");
  const [weights, setWeights] = useState<Weights>(presetById("balanced")!.weights);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ id: number; key: number } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");
  const [urlReady, setUrlReady] = useState(false);
  const mapViewRef = useRef<string | null>(null);
  const focusSeq = useRef(0);
  const [liveState, setLiveState] = useState<LiveState>("loading");
  const [live, setLive] = useState<LiveValue | null>(null);

  // Map layers and selection.
  const [layers, setLayers] = useState<Layers>({ trees: true, heat: true, danger: false });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [danger, setDanger] = useState<DangerPoint[] | null>(null);
  const [dangerState, setDangerState] = useState<LoadState>("idle");
  const [cityTrees, setCityTrees] = useState<CityTrees | null>(null);

  // Trip planner.
  const [mode, setMode] = useState<Mode>("bike");
  const [startId, setStartId] = useState<string>("station");
  const [endId, setEndId] = useState<string>("campus");
  const [custom, setCustom] = useState<{ start?: MapPlace; end?: MapPlace }>({});
  const [rawRoutes, setRawRoutes] = useState<RawRoute[]>([]);
  const [routeState, setRouteState] = useState<LoadState>("idle");
  const [routeTry, setRouteTry] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const preset = presetId ? presetById(presetId)! : null;
  const pct = useMemo(() => (data ? percentiles(data.segments) : null), [data]);
  const ranked = useMemo(
    () => (data && pct ? rankSegments(data.segments, preset ?? { weights }, pct) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, pct, presetId, weights]
  );
  const mapRanked = useDeferredValue(ranked);
  const scoredCount = useMemo(() => (ranked ? ranked.filter((x) => x.score != null).length : 0), [ranked]);
  const rankOf = useMemo(() => new Map((ranked ?? []).map((x, i) => [x.seg.id, i + 1])), [ranked]);
  const districts = useMemo(() => (data ? [...new Set(data.segments.map((s) => s.district).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, "de")) : []), [data]);

  const filtered = useMemo(() => {
    if (!ranked) return [];
    const q = search.toLowerCase().trim();
    return ranked.filter((x) => {
      if (x.score == null) return false;
      if (district !== "all" && x.seg.district !== district) return false;
      return !q || (x.seg.name ?? x.seg.near ?? "").toLowerCase().includes(q) || (x.seg.district ?? "").toLowerCase().includes(q);
    });
  }, [ranked, search, district]);
  const top: TopItem[] = useMemo(() => filtered.slice(0, TOP_N).map((x) => ({ x, rank: rankOf.get(x.seg.id) ?? 0 })), [filtered, rankOf]);
  const hero = useMemo(() => (ranked ? heroFact(ranked, data?.meta ?? null) : null), [ranked, data]);
  const fixList = useMemo(
    () => (ranked ? ranked.filter((x) => x.score != null).slice(0, TOP_N).map((x) => ({ name: segName(x.seg), coords: x.seg.g })) : []),
    [ranked]
  );

  const placeFor = useCallback(
    (id: string): MapPlace => {
      if (id === "custom-start" && custom.start) return custom.start;
      if (id === "custom-end" && custom.end) return custom.end;
      return PLACES[(id in PLACES ? id : "station") as PlaceKey];
    },
    [custom]
  );
  const startPlace = placeFor(startId);
  const endPlace = placeFor(endId);

  // Measured street network (public/data/segments.json). The big file waits until the
  // first map tiles are in (or 4 s at most), so it does not hold up the first view.
  const [mapReady, setMapReady] = useState(false);
  const onMapReady = useCallback(() => setMapReady(true), []);
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!mapReady) return;
    let alive = true;
    const t = setTimeout(() => {
      setDataState("loading");
      loadSegments()
        .then((d) => {
          if (!alive) return;
          setData(d);
          setDataState("ok");
        })
        .catch(() => alive && setDataState("error"));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [dataTry, mapReady]);

  // City tree register (43,031 trees), also after the first map tiles.
  useEffect(() => {
    if (!mapReady) return;
    let alive = true;
    const t = setTimeout(() => {
      loadCityTrees()
        .then((ct) => alive && setCityTrees(ct))
        .catch(() => {
          // Keep the OpenStreetMap trees as a fallback.
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mapReady]);

  // Read the link once: view, priorities, selected segment, layers.
  // The map view (m) is read by the map itself when it is made.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      if (q.get("v") === "people") setView("people");
      const p = presetById(q.get("p"));
      const w = decodeWeights(q.get("w"));
      if (p) {
        setPresetId(p.id);
        setWeights(p.weights);
      } else if (w) {
        setPresetId(presetForWeights(w));
        setWeights(w);
      }
      const l = q.get("l");
      if (l) setLayers({ trees: l.includes("t"), heat: l.includes("h"), danger: l.includes("d") });
      const id = Number(q.get("s"));
      if (q.get("s") && Number.isInteger(id)) {
        setActiveId(id);
        setSelection({ kind: "segment", id });
        if (!q.get("m")) setFocus({ id, key: ++focusSeq.current });
      }
      setUrlReady(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Keep the link in step with what is on screen, so it can be shared.
  const urlState = useRef({ view, presetId, weights, activeId, layers });
  const writeUrl = useCallback(() => {
    const st = urlState.current;
    const q = new URLSearchParams();
    if (st.view === "people") q.set("v", "people");
    if (st.presetId) q.set("p", st.presetId);
    else q.set("w", encodeWeights(st.weights));
    if (st.activeId != null) q.set("s", String(st.activeId));
    q.set("l", (st.layers.trees ? "t" : "") + (st.layers.heat ? "h" : "") + (st.layers.danger ? "d" : "") || "0");
    if (mapViewRef.current) q.set("m", mapViewRef.current);
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}${window.location.hash}`);
  }, []);
  useEffect(() => {
    urlState.current = { view, presetId, weights, activeId, layers };
    if (urlReady) writeUrl();
  }, [view, presetId, weights, activeId, layers, urlReady, writeUrl]);
  const onViewChange = useCallback(
    (lat: number, lng: number, zoom: number) => {
      mapViewRef.current = `${lat.toFixed(5)},${lng.toFixed(5)},${Math.round(zoom * 100) / 100}`;
      if (urlReady) writeUrl();
    },
    [urlReady, writeUrl]
  );

  async function copyLink() {
    writeUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  function choosePreset(id: PresetId) {
    setPresetId(id);
    setWeights(presetById(id)!.weights);
    setFocus(null);
    setOpenCard(null);
  }

  function setWeight(key: MeasureKey, value: number) {
    const next = { ...weights, [key]: value };
    setWeights(next);
    setPresetId(presetForWeights(next));
    setFocus(null);
  }

  // Close pass points: load when the layer is on, or when routes need them.
  useEffect(() => {
    if (dangerState !== "idle") return;
    if (!layers.danger && view !== "people") return;
    const t = setTimeout(() => {
      setDangerState("loading");
      loadDangerPoints()
        .then((d) => {
          setDanger(d);
          setDangerState("ok");
        })
        .catch(() => setDangerState("error"));
    }, 0);
    return () => clearTimeout(t);
  }, [layers.danger, view, dangerState]);

  // Real routes from OSRM whenever the trip changes.
  useEffect(() => {
    if (view !== "people") return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setRouteState("loading");
      fetchRouteOptions([startPlace.lat, startPlace.lng], [endPlace.lat, endPlace.lng], mode, controller.signal)
        .then((r) => {
          setRawRoutes(r);
          setSelectedRouteId(null);
          setRouteState(r.length ? "ok" : "error");
        })
        .catch((e: unknown) => {
          if ((e as Error)?.name === "AbortError") return;
          setRawRoutes([]);
          setRouteState("error");
        });
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [view, startPlace.lat, startPlace.lng, endPlace.lat, endPlace.lng, mode, routeTry]);

  const routes = useMemo(() => rankRoutes(rawRoutes, danger, cityTrees, fixList), [rawRoutes, danger, cityTrees, fixList]);
  const activeRouteId = selectedRouteId && routes.some((r) => r.id === selectedRouteId) ? selectedRouteId : (routes[0]?.id ?? null);
  const greenRoute = routes.find((r) => r.label === "green" || r.label === "both");
  const fastRoute = routes.find((r) => r.label === "fastest" || r.label === "both");

  const insight = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "segment") {
      const i = ranked ? ranked.findIndex((x) => x.seg.id === selection.id) : -1;
      if (i < 0) return null;
      const x = ranked![i];
      return segmentInsight(x, preset, x.score != null ? i + 1 : null);
    }
    return insightFor(selection, danger, cityTrees);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, danger, cityTrees, ranked, presetId]);
  const gaps = useMemo(() => (cityTrees ? shadeGaps(cityTrees) : []), [cityTrees]);

  async function fetchLive() {
    setLiveState("loading");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const listRes = await fetch("https://api.opensensemap.org/boxes?bbox=8.95,49.02,9.40,49.28", { signal: controller.signal });
      if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
      const list = (await listRes.json()) as Array<{ _id?: string; updatedAt?: string }>;
      // The list endpoint gives lastMeasurement as an id only, so read the
      // 5 most recently updated boxes, where each sensor has a real value.
      const newestBoxes = [...list]
        .filter((b) => b._id)
        .sort((a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime())
        .slice(0, 5);
      if (newestBoxes.length === 0) throw new Error("No boxes found");
      const details = await Promise.all(
        newestBoxes.map(async (b) => {
          try {
            const r = await fetch(`https://api.opensensemap.org/boxes/${b._id}`, { signal: controller.signal });
            return r.ok ? ((await r.json()) as BoxDetail) : null;
          } catch {
            return null;
          }
        })
      );
      // Use ONE box: the newest box with a temperature or dust value, and
      // only that box's own values and name. Titles must match exactly, so
      // PM2.5 and PM10 never mix.
      const valueOf = (box: BoxDetail, match: (t: string) => boolean) => {
        for (const sn of box.sensors || []) {
          const lm = sn.lastMeasurement;
          if (!lm || typeof lm === "string" || lm.value == null || !lm.createdAt) continue;
          if (match((sn.title || "").trim().toLowerCase())) return { value: String(lm.value), text: `${String(lm.value)} ${sn.unit || ""}`.trim(), at: lm.createdAt };
        }
        return null;
      };
      let picked: { box: BoxDetail; temp: ReturnType<typeof valueOf>; pm10: ReturnType<typeof valueOf>; pm25: ReturnType<typeof valueOf> } | null = null;
      for (const box of details) {
        if (!box) continue;
        const temp = valueOf(box, (t) => t === "temperatur" || t === "temperature");
        const pm10 = valueOf(box, (t) => t === "pm10");
        const pm25 = valueOf(box, (t) => t === "pm2.5");
        if (temp || pm10 || pm25) {
          picked = { box, temp, pm10, pm25 };
          break;
        }
      }
      const temp = picked?.temp?.text ?? null;
      const pm10 = picked?.pm10?.text ?? null;
      const pm25 = picked?.pm25?.text ?? null;
      const same = !!(picked?.pm10 && picked?.pm25 && picked.pm10.value === picked.pm25.value);
      const newest = [picked?.temp?.at, picked?.pm10?.at, picked?.pm25?.at].filter((x): x is string => !!x).sort().pop() ?? "";
      const boxName = picked?.box.name || "openSenseMap box";
      clearTimeout(timeout);
      if (!temp && !pm10 && !pm25) throw new Error("No recent temperature or dust value");
      setLive({ temp, pm10, pm25, same, box: boxName, time: formatTime(newest) });
      setLiveState(Date.now() - new Date(newest).getTime() > 2 * 60 * 60 * 1000 ? "stale" : "ok");
    } catch {
      clearTimeout(timeout);
      setLive(null);
      setLiveState("offline");
    }
  }

  useEffect(() => {
    // Read the first snapshot after mount, outside the render pass.
    const t = setTimeout(fetchLive, 0);
    return () => clearTimeout(t);
  }, []);

  function selectSegment(id: number) {
    setActiveId(id);
    setView("city");
    setSelection({ kind: "segment", id });
  }

  function showOnMap(id: number) {
    selectSegment(id);
    setFocus({ id, key: ++focusSeq.current });
    // On phones the map sits above the list, so bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("map")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  function switchView(v: View) {
    setView(v);
    setSelection(null);
  }

  function pickStart(value: string) {
    if (value === endId) setEndId(startId);
    setStartId(value);
  }

  function pickEnd(value: string) {
    if (value === startId) setStartId(endId);
    setEndId(value);
  }

  function pickOnMap(which: "start" | "end", lat: number, lng: number) {
    const place: MapPlace = { name: which === "start" ? "Point on the map (A)" : "Point on the map (B)", lat, lng };
    setCustom((c) => ({ ...c, [which]: place }));
    if (which === "start") setStartId("custom-start");
    else setEndId("custom-end");
  }

  function toggleLayer(k: keyof Layers) {
    setLayers((l) => ({ ...l, [k]: !l[k] }));
    if (k === "danger" && dangerState === "error") setDangerState("idle");
  }

  const placeOptions = (which: "start" | "end") => (
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Places</SelectLabel>
        {PLACE_KEYS.map((k) => (
          <SelectItem key={k} value={k}>
            {PLACES[k].name}
          </SelectItem>
        ))}
      </SelectGroup>
      {custom[which] && (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Your pick</SelectLabel>
            <SelectItem value={`custom-${which}`}>{custom[which]!.name}</SelectItem>
          </SelectGroup>
        </>
      )}
    </SelectContent>
  );

  const selectionAt = insight ? insight.at : null;
  const active = activeId != null ? data?.segments.find((s) => s.id === activeId) : undefined;
  const compare = compareLine(greenRoute, fastRoute);

  return (
    <div className="page">
      <header className="topbar">
        <Wordmark />
      </header>

      <div className="stage">
        <section className="intro" aria-labelledby="headline">
          <h1 id="headline">Which street should Heilbronn fix first?</h1>
          <p className="tagline">Cooler, cleaner, and safer streets for Heilbronn</p>
          <div className="proof" role="note" aria-label="Data behind this map">
            <p className="proof-data">
              <b>
                {CAMPAIGN.rides} rides, {CAMPAIGN.km} km
              </b>
              , {CAMPAIGN.from} to {CAMPAIGN.to}
            </p>
            <p className="proof-promise">No app. No sign up. No personal tracking.</p>
            {hero && (
              <p className="proof-hero" aria-live="polite">
                <b>{hero.big}</b> {hero.text}{!hero.city && <span> Priorities: {preset ? preset.label : "your own mix"}.</span>}
              </p>
            )}
          </div>
          <div className="switch" role="tablist" aria-label="Choose a view">
            <button type="button" role="tab" aria-selected={view === "city"} aria-controls="panel" onClick={() => switchView("city")}>
              For the city
            </button>
            <button type="button" role="tab" aria-selected={view === "people"} aria-controls="panel" onClick={() => switchView("people")}>
              For people
            </button>
          </div>
        </section>

        <section className="mapzone" id="map" aria-label="Map">
          <div className={`mapframe${insight ? " has-card" : ""}`}>
            <MapView
              view={view}
              ranked={mapRanked}
              top={top}
              activeId={activeId}
              focus={focus}
              resetKey={resetKey}
              layers={layers}
              danger={danger}
              cityTrees={cityTrees}
              start={startPlace}
              end={endPlace}
              routes={view === "people" ? routes : []}
              selectedRouteId={activeRouteId}
              selection={selection}
              selectionAt={selectionAt}
              onSegmentSelect={selectSegment}
              onViewChange={onViewChange}
              onMapReady={onMapReady}
              onSelect={setSelection}
              onRouteSelect={setSelectedRouteId}
              onPick={pickOnMap}
            />

            <div className="layerbar" role="group" aria-label="Map layers">
              <button type="button" className="layer-chip" aria-pressed={layers.trees} onClick={() => toggleLayer("trees")}>
                <i className="dot dot-tree" aria-hidden="true" /> Trees
              </button>
              <button type="button" className="layer-chip" aria-pressed={layers.heat} onClick={() => toggleLayer("heat")}>
                <i className="dot dot-heat" aria-hidden="true" /> Heat walk
              </button>
              <button type="button" className="layer-chip" aria-pressed={layers.danger} onClick={() => toggleLayer("danger")} aria-busy={dangerState === "loading"}>
                <i className="dot dot-danger" aria-hidden="true" /> {dangerState === "loading" && layers.danger ? "Loading..." : "Close passes"}
              </button>
            </div>

            <button
              type="button"
              className="map-reset"
              aria-label="Reset map view"
              title="Reset map view"
              onClick={() => {
                setFocus(null);
                setSelection(null);
                setResetKey((k) => k + 1);
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {insight ? (
              <InfoCard insight={insight} onClose={() => setSelection(null)} />
            ) : (
              <>
              <button type="button" className="legend-toggle" aria-expanded={legendOpen} aria-controls="map-legend" onClick={() => setLegendOpen((o) => !o)}>
                {legendOpen ? "Hide legend" : "Legend"}
              </button>
              <div className={`map-legend${legendOpen ? " is-open" : ""}`} id="map-legend" aria-label="Map legend">
                {view === "city" ? (
                  <>
                    <p className="legend-title">Fix score</p>
                    <ul>
                      {BANDS.map((b) => (
                        <li key={b.key}>
                          <i style={{ background: b.color }} aria-hidden="true" />
                          {b.label}, {b.range}
                        </li>
                      ))}
                      <li>
                        <i className="line line-little" aria-hidden="true" />
                        Little data, not scored
                      </li>
                    </ul>
                    <p className="legend-note">A thicker line means more readings support it.</p>
                  </>
                ) : (
                  <>
                    <p className="legend-title">Routes</p>
                    <ul>
                      <li>
                        <i className="line line-green" aria-hidden="true" />
                        GrünRoute
                      </li>
                      <li>
                        <i className="line line-fast" aria-hidden="true" />
                        Fastest
                      </li>
                    </ul>
                  </>
                )}
                {(layers.heat || layers.trees || layers.danger) && (
                  <ul className="legend-layers">
                    {layers.trees && (
                      <li>
                        <i className="dot dot-tree" aria-hidden="true" /> {cityTrees ? "City tree, crown to scale" : "Mapped tree"}
                      </li>
                    )}
                    {layers.heat && (
                      <>
                        <li>
                          <i className="dot dot-heat" aria-hidden="true" /> Warmer on walk
                        </li>
                        <li>
                          <i className="dot dot-cool" aria-hidden="true" /> Cooler on walk
                        </li>
                      </>
                    )}
                    {layers.danger && (
                      <li>
                        <i className="dot dot-danger" aria-hidden="true" /> Close pass
                      </li>
                    )}
                  </ul>
                )}
                <p className="legend-note">Tap anything on the map to see what it means.</p>
              </div>
              </>
            )}
          </div>
          {layers.danger && dangerState === "error" && <p className="map-msg">Close pass points could not be loaded from ATRAI right now. Tap the layer again to retry.</p>}
        </section>

        <section className="panel" id="panel" role="tabpanel" aria-label={view === "city" ? "Fix first list" : "Plan a trip"}>
          {view === "city" ? (
            <>
              <div className="panel-head">
                <h2>Fix first list</h2>
                <p>
                  Ranked by your priorities. Measured streets only, {data ? nf(scoredCount) : "loading"} segments.
                </p>
              </div>

              <div className="priorities" role="group" aria-labelledby="prio-title">
                <div className="prio-head">
                  <h3 id="prio-title">Your priorities</h3>
                  <button type="button" className="btn btn-quiet copy-link" onClick={copyLink}>
                    {copied === "ok" ? "Link copied" : copied === "error" ? "Copy failed, use the address bar" : "Copy link"}
                  </button>
                </div>
                <p className="prio-note">You choose what matters. The map and list update.</p>
                <div className="chips" role="group" aria-label="Preset priorities">
                  {PRESETS.map((p) => (
                    <button key={p.id} type="button" className="chip" aria-pressed={presetId === p.id} onClick={() => choosePreset(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="sliders">
                  {MEASURES.map((m) => {
                    const v = weights[m.key];
                    return (
                      <label key={m.key} className="slider">
                        <span className="slider-label">
                          <span>{m.label}</span>
                          <b>{WEIGHT_WORD[v]}</b>
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={MAX_WEIGHT}
                          step={1}
                          value={v}
                          aria-valuetext={WEIGHT_WORD[v]}
                          onChange={(e) => setWeight(m.key, Number(e.target.value))}
                        />
                      </label>
                    );
                  })}
                </div>
                {presetId === "gap" && <p className="prio-note">Passing gap only keeps the old rule: 100 minus half the average passing gap in cm.</p>}
                {presetId === "school" && <p className="prio-note">Safe school routes counts close passes 1.5 times as much within 300 m of a school or kindergarten.</p>}
              </div>

              <div className="tools">
                <label className="search">
                  <span className="sr-only">Search streets</span>
                  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input type="search" placeholder="Search a street" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger aria-label="Filter by district" className="district-select">
                    <SelectValue placeholder="All districts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All districts</SelectItem>
                    {districts.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {dataState === "error" ? (
                <div className="empty">
                  <p>The street data could not be loaded.</p>
                  <button type="button" className="btn btn-quiet" onClick={() => setDataTry((n) => n + 1)}>
                    Try again
                  </button>
                </div>
              ) : !ranked ? (
                <p className="count">Loading the measured street network...</p>
              ) : (
                <p className="count" aria-live="polite">
                  {filtered.length === 0
                    ? "No street matches."
                    : `Top ${Math.min(TOP_N, filtered.length)} of ${nf(filtered.length)} scored segments${district !== "all" ? ` in ${district}` : ""}. Across Heilbronn, ${nf(ranked.length - scoredCount)} have little data for these priorities and stay grey on the map.`}
                </p>
              )}

              {ranked && filtered.length === 0 ? (
                <div className="empty">
                  <p>No street matches this search.</p>
                  <button type="button" className="btn btn-quiet" onClick={() => { setSearch(""); setDistrict("all"); }}>
                    Clear search
                  </button>
                </div>
              ) : (
                <ol className="streets">
                  {top.map(({ x, rank }) => {
                    const s = x.seg;
                    const band = bandFor(x.score!);
                    const isActive = s.id === activeId;
                    const isOpen = openCard === s.id;
                    return (
                      <li key={s.id} className={`street${isActive ? " is-active" : ""}`} style={{ ["--band" as string]: band.color }}>
                        <button type="button" className="street-main" aria-current={isActive ? "true" : undefined} onClick={() => showOnMap(s.id)}>
                          <span className={`street-rank${rank >= 100 ? " is-long" : ""}`} aria-hidden="true">{rank}</span>
                          <span className="street-body">
                            <span className="street-name">{segName(s)}</span>
                            <span className="street-area">{s.district ?? "Heilbronn"}, {nf(s.length)} m</span>
                            <span className="street-reason">{reasonLine(x)}</span>
                          </span>
                          <span className="street-score">
                            <b>{x.score}</b>
                            <span className="sr-only"> out of 100, {band.label}, rank {rank}</span>
                            <span className="score-bar" aria-hidden="true">
                              <span style={{ width: `${x.score}%` }} />
                            </span>
                          </span>
                        </button>
                        <div className="street-foot">
                          {x.weak ? (
                            <span className="badge badge-weak">Weak evidence, ground check first</span>
                          ) : (
                            <span className="badge">{x.support ?? "No"} data support</span>
                          )}
                          <button type="button" className="more" aria-expanded={isOpen} onClick={() => setOpenCard(isOpen ? null : s.id)}>
                            {isOpen ? "Less" : "More"}
                          </button>
                        </div>
                        {isOpen && (
                          <div className="street-detail">
                            {x.parts.map((part) => {
                              const d = measureDetail(s, part.key);
                              if (!d) return null;
                              return (
                                <p key={part.key}>
                                  <b>{MEASURES.find((m) => m.key === part.key)!.label}:</b> {d.value}. {d.count}.
                                </p>
                              );
                            })}
                            {x.gate && (
                              <p>
                                <b>Coverage gate (proposal):</b> {x.gate}, {s.raw.passes} of 20 overtakes.
                              </p>
                            )}
                            {s.m.safety != null && <p>{RULE_150}</p>}
                            {x.weak && <p className="rule">Weak evidence never gets an automatic fix. Check on the ground first, then decide with official data.</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="readfirst">
                <h3>Read before you decide</h3>
                <ul>
                  <li>
                    The fix score compares each street segment with all {data ? nf(data.meta.segments) : ""} measured segments in Heilbronn on the measures you weight, then adds them up. 100 means worst on everything you chose.
                  </li>
                  <li>Close passes are the share of measured passes under 150 cm. {RULE_150}</li>
                  <li>A segment needs at least 2 of your measures, and at least one from a sensor, to get a score. Tree cover and crashes exist for every street, so they cannot rank a street alone. Segments with little data stay grey on the map, never hidden.</li>
                  <li>Weak evidence means only 1 or 2 readings. Check those streets on the ground first.</li>
                  <li>Tree cover is an estimate from the city tree register, public trees only. Crashes are police recorded injury crashes with a bike or a person on foot, 2021 to 2025.</li>
                  <li>This is a screening tool, not an official legal measurement.</li>
                </ul>
              </div>

              {gaps.length > 0 && (
                <div className="gaps">
                  <h3>Shade gaps to check</h3>
                  <p>Spots that were at least 1 °C warmer than the rest of the same summer heat walk, with the fewest city trees within 40 m.</p>
                  <ol>
                    {gaps.map((g) => (
                      <li key={g.index}>
                        <button
                          type="button"
                          className="gap"
                          onClick={() => {
                            setSelection({ kind: "heat", index: g.index });
                            if (window.matchMedia("(max-width: 1023px)").matches) document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          <span className="gap-name">Near {g.near || "unnamed street"}</span>
                          <span className="gap-stats">
                            <b>{fmtAnomaly(g.anomaly)}</b> · {g.trees} {g.trees === 1 ? "tree" : "trees"} within 40 m
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <p className="gaps-note">Heat walks covered only a few routes in September 2026. Check each spot on the ground before planning trees.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="panel-head">
                <h2>Plan a trip</h2>
                <p>Pick a start and an end. Compare the fastest way with a greener, cooler GrünRoute.</p>
              </div>

              <div className="modes" role="radiogroup" aria-label="How do you travel?">
                {(["bike", "foot"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} className="mode" onClick={() => setMode(m)}>
                    {m === "bike" ? "By bike" : "On foot"}
                  </button>
                ))}
              </div>

              <div className="trip">
                <div className="trip-field trip-from">
                  <span className="trip-pin" aria-hidden="true">A</span>
                  <Select value={startId} onValueChange={pickStart}>
                    <SelectTrigger aria-label="Start">
                      <SelectValue placeholder="Choose a start" />
                    </SelectTrigger>
                    {placeOptions("start")}
                  </Select>
                </div>
                <button
                  type="button"
                  className="swap"
                  aria-label="Swap start and end"
                  onClick={() => {
                    setStartId(endId.replace("custom-end", "custom-start"));
                    setEndId(startId.replace("custom-start", "custom-end"));
                    setCustom((c) => ({ start: c.end ? { ...c.end, name: "Point on the map (A)" } : undefined, end: c.start ? { ...c.start, name: "Point on the map (B)" } : undefined }));
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M7 4v14m0 0l-3-3m3 3l3-3M17 20V6m0 0l-3 3m3-3l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="trip-field trip-to">
                  <span className="trip-pin" aria-hidden="true">B</span>
                  <Select value={endId} onValueChange={pickEnd}>
                    <SelectTrigger aria-label="End">
                      <SelectValue placeholder="Choose an end" />
                    </SelectTrigger>
                    {placeOptions("end")}
                  </Select>
                </div>
              </div>
              <p className="trip-hint">Tip: tap the map to use any point as your start or end.</p>

              <div className="routes" role="radiogroup" aria-label="Route options" aria-busy={routeState === "loading"}>
                {routeState === "loading" && (
                  <>
                    <div className="route route-skel" aria-hidden="true" />
                    <div className="route route-skel" aria-hidden="true" />
                    <p className="sr-only" aria-live="polite">Finding routes...</p>
                  </>
                )}
                {routeState === "error" && (
                  <div className="route route-error">
                    <p>The route service did not answer. Check your connection and try again.</p>
                    <button type="button" className="btn btn-quiet" onClick={() => setRouteTry((n) => n + 1)}>
                      Try again
                    </button>
                  </div>
                )}
                {routeState === "ok" &&
                  routes.map((r) => {
                    const sel = r.id === activeRouteId;
                    const m = r.metrics;
                    const isGreen = r.label === "green" || r.label === "both";
                    return (
                      <div key={r.id} className={`route${isGreen ? " route-green" : ""}${sel ? " is-selected" : ""}`}>
                        <button type="button" role="radio" aria-checked={sel} className="route-main" onClick={() => setSelectedRouteId(r.id)}>
                          <span className="route-radio" aria-hidden="true" />
                          <span className="route-top">
                            <span className="route-name">{ROUTE_NAME[r.label]}</span>
                            <span className="route-time">
                              {m.min} min <small>{m.km.toLocaleString("en-GB")} km</small>
                            </span>
                          </span>
                          <span className="route-stats">
                            <span title={m.treeSource === "city" ? "City register trees within 20 m, per km" : "Mapped trees within 25 m, per km"}>
                              <i className="dot dot-tree" aria-hidden="true" /> {m.treesPerKm} trees/km
                            </span>
                            <span title="Heat walk compared with the same walk">
                              <i className="dot dot-heat" aria-hidden="true" /> {m.heat.avg === null || m.heat.covered < 0.2 ? "No heat data" : fmtAnomaly(m.heat.avg)}
                            </span>
                            {mode === "bike" && (
                              <span title="ATRAI close pass points within 15 m">
                                <i className="dot dot-danger" aria-hidden="true" /> {m.danger === null ? "..." : `${m.danger} close ${m.danger === 1 ? "pass" : "passes"}`}
                              </span>
                            )}
                          </span>
                        </button>
                        {sel && (
                          <ul className="route-tips">
                            {routeTips(r, mode).map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </div>
              {routeState === "ok" && (
                <p className="route-compare" aria-live="polite">
                  {compare ?? "The fastest route is also the greenest option found for this trip."}
                </p>
              )}
              <details className="route-how">
                <summary>How routes are chosen</summary>
                <p>
                  Routes come from OSRM, a public router on OpenStreetMap roads and paths. We ask for the direct route and a few detours, then compare them on trees within 20 m and big crowns (Stadt Heilbronn tree register),
                  heat walk spots along the way (Heat Island Summer School, {HEAT_WALK.dates}), close pass points within 15 m (ATRAI), and streets on the fix first list. GrünRoute is the best of these
                  that is at most about 40 percent or 8 minutes slower. This is a simple rule, not an official rating.
                </p>
                <p>Only your start and end points go to the router to draw the line. Nothing is stored, and no one tracks your trip.</p>
              </details>
            </>
          )}
        </section>
      </div>

      <section className={`live is-${liveState}`} aria-labelledby="live-title">
        <div className="live-head">
          <h2 id="live-title">
            <i className="live-dot" aria-hidden="true" /> Sensor snapshot near Heilbronn
          </h2>
          <p>Latest public values from openSenseMap, read when you open this page. A single live value never changes a street score.</p>
        </div>
        {liveState === "loading" && <p className="live-msg">Reading openSenseMap...</p>}
        {liveState === "offline" && <p className="live-msg">No live values right now. The fix first list above uses checked historical data.</p>}
        {(liveState === "ok" || liveState === "stale") && live && (
          <dl className="live-grid">
            <div>
              <dt>Temperature</dt>
              <dd>{live.temp ?? "No value"}</dd>
            </div>
            <div>
              <dt>Dust PM10</dt>
              <dd>{live.pm10 ?? "No value"}</dd>
            </div>
            <div>
              <dt>Dust PM2.5</dt>
              <dd>{live.pm25 ?? "No value"}</dd>
            </div>
            <div>
              <dt>Sensor box</dt>
              <dd className="live-box">{live.box}</dd>
            </div>
          </dl>
        )}
        {(liveState === "ok" || liveState === "stale") && live?.same && <p className="live-msg">PM2.5 and PM10 show the same value reported by the sensor.</p>}
        <div className="live-foot">
          <button type="button" className="btn" onClick={fetchLive} disabled={liveState === "loading"}>
            Refresh values
          </button>
          {live && (liveState === "ok" || liveState === "stale") && (
            <span>
              {liveState === "stale" ? "Old data, newest value from " : "Newest value from "}
              {live.time}
            </span>
          )}
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How the list is made</h2>
        <ol className="steps">
          <li>
            <h3>Collect</h3>
            <p>Bike sensors record passing gaps, danger and dust, rough surfaces, and stop and go on normal rides. Summer heat walks, the city tree register, and police crash records add more.</p>
          </li>
          <li>
            <h3>Match</h3>
            <p>
              Everything joins the ATRAI street segments{data ? `, ${nf(data.meta.segments)} in Heilbronn` : ""}: dust points within 20 m, trees within 20 m, heat walk spots within 60 m, and crashes within 25 m.
            </p>
          </li>
          <li>
            <h3>Rank</h3>
            <p>You choose what matters. Each measure is compared with all measured streets, weighted, and added up to a fix score from 0 to 100. Streets with little data are marked, never hidden.</p>
          </li>
          <li>
            <h3>Check</h3>
            <p>Weak evidence means a ground check first. Final decisions still use official city data.</p>
          </li>
        </ol>
      </section>

      <section className="facts" aria-labelledby="facts-title">
        <div className="facts-intro">
          <h2 id="facts-title">The data behind it</h2>
          <p>Only data from the organisers, the partners, and the open sources the organisers list. Nothing is filled in to close a gap.</p>
        </div>
        <dl className="facts-grid">
          <div>
            <dt>Bike rides</dt>
            <dd>{CAMPAIGN.rides}</dd>
          </div>
          <div>
            <dt>Kilometres ridden</dt>
            <dd>{CAMPAIGN.km}</dd>
          </div>
          <div>
            <dt>Riders</dt>
            <dd>{CAMPAIGN.riders}</dd>
          </div>
          <div>
            <dt>Street segments in Heilbronn</dt>
            <dd>{data ? nf(data.meta.segments) : "Loading"}</dd>
          </div>
          <div>
            <dt>Measured passes</dt>
            <dd>{count(data?.meta, "passes")}</dd>
          </div>
          <div>
            <dt>Danger and dust points</dt>
            <dd>{count(data?.meta, "pmPoints")}</dd>
          </div>
          <div>
            <dt>Public trees, city register</dt>
            <dd>{count(data?.meta, "trees")}</dd>
          </div>
          <div>
            <dt>Heat walk readings</dt>
            <dd>{HEAT_WALK.points.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Bike or foot injury crashes, 2021 to 2025</dt>
            <dd>{count(data?.meta, "crashes")}</dd>
          </div>
        </dl>
        <p className="facts-source">Sources: {SOURCES.map((x) => x.name).join(", ")}. Details below.</p>
      </section>

      <section className="more-info" aria-label="More about GrünRoute">
        <details>
          <summary>What GrünRoute does</summary>
          <p>
            GrünRoute Heilbronn turns existing bike, school, and heat data into a ranked plan for the city, so it can fix the hottest, dustiest, and least safe streets first. The same evidence gives residents a simple web map for cooler, cleaner, and safer routes, with no app, sign up, or personal tracking.
          </p>
        </details>
        <details>
          <summary>All data sources in detail</summary>
          <ul className="sources">
            {SOURCES.map((x) => (
              <li key={x.id}>
                <p>
                  <a href={x.url} target="_blank" rel="noopener noreferrer">
                    <b>{x.name}</b>
                  </a>
                  {x.count && data && typeof data.meta.counts[x.count] === "number" ? `, ${nf(data.meta.counts[x.count] as number)} ${x.countLabel}` : ""}
                </p>
                <p>{x.use}</p>
                <p className="sources-meta">
                  {x.provider}. {x.date}. Licence: {x.licence}.
                </p>
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Coverage and timing</summary>
          <p>
            Bike data exists only where riders rode. Heat walks happen in summer only. Compare the same season, not summer heat with winter bike data, and note school holidays for school routes.
          </p>
          {data && (
            <ul className="coverage">
              {MEASURES.map((m) => {
                const n = data.meta.coverage[m.key];
                return n == null ? null : (
                  <li key={m.key}>
                    {m.label}: {nf(n)} of {nf(data.meta.segments)} segments ({Math.round((n / data.meta.segments) * 100)}%)
                  </li>
                );
              })}
            </ul>
          )}
        </details>
        <details>
          <summary>How new data will be added later</summary>
          <p>
            New data comes in a fixed template as a staged upload. It is matched to streets within 20 m, checked with the same rules, and approved by Green City before it goes public. Old and new scores are shown side by side. Only street averages are published, never personal ride tracks.
          </p>
        </details>
        <details>
          <summary>Fit with Heilbronn plans</summary>
          <p>
            GrünRoute supports plans the city already has: Landscape Plan 2030, Mobility Concept 2030, Climate Mitigation Concept, Climate Adaptation Concept, and European Green Capital 2027. It does not replace them. It shows which street fits which plan goal first.
          </p>
        </details>
        <details>
          <summary>Honest limits</summary>
          <p>
            Low cost sensors are affected by humidity, calibration, and ageing, so this is a screening tool, not a legal measurement. Few overtakes can mean few riders, not a safe street. Streets with thin data get a ground check first.
          </p>
        </details>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <LogoMark size={36} tone="green" />
          <p>
            <b>GrünRoute Heilbronn</b>
            <span>Built for the Heilbronn Green City Hackathon, 27 to 29 Oct 2026.</span>
          </p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/data-collection">How to collect data</Link>
        </nav>
        <p className="footer-fine">Map data from OpenStreetMap contributors. Fix scores cover the full measured street network of Heilbronn. They are a screening tool and need checking with official city data before any decision.</p>
      </footer>

      {active && view === "city" && (
        <p className="sr-only" aria-live="polite">
          Showing {segName(active)} on the map.
        </p>
      )}
    </div>
  );
}
