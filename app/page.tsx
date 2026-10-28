"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Map as LeafletMap } from "leaflet";
import { BANDS, CAMPAIGN, CENTER, PLACES, bandFor, type PlaceKey } from "../lib/data";
import { LogoMark } from "../components/brand/Logo";
import InfoCard from "../components/InfoCard";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../components/ui/select";
import { distM, fmtAnomaly, type DangerPoint, type LatLng } from "../lib/geo";
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
  aggregateStreets,
  enoughData,
  districtLabel,
  MIN_SEGMENT_M,
  type Scored,
  type Street,
  type MeasureKey,
  type PresetId,
  type Weights,
} from "../lib/priority";
import { RULE_150, heroFact, loadSegments, measureDetail, reasonLine, segName, segmentInsight, type SegmentData } from "../lib/segments";
import { SOURCES } from "../lib/sources";
import { fetchHeilbronnBoxes, type LiveReading } from "../lib/live";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { loadDangerPoints } from "../lib/atrai";
import { fetchDirect, fetchRouteOptions, rankRoutes, type Mode, type RawRoute, type RouteOption } from "../lib/routing";
import { bearingAt, buildTrack, fmtDist, nextStep, project, spokenDist, stepText, turnKind, type Fix, type Track, type TurnKind } from "../lib/navigate";
import type { Insets, Layers, MapPlace, Me, NavView, TopItem } from "../components/MapView";

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="map map-loading" aria-hidden="true" />,
});

type View = "city" | "people";
type LiveState = "loading" | "ok" | "stale" | "none" | "offline";
type LiveValue = { temp: string | null; pm10: string | null; pm25: string | null; same: boolean; box: string; time: string };
type LoadState = "idle" | "loading" | "ok" | "error";
// Phone bottom sheet heights, like a map app: just the title, half, or nearly full.
type Snap = "peek" | "half" | "full";
type Suggestion = { kind: "street"; id: number } | { kind: "place"; key: PlaceKey };
// A trip in progress. "preview" steps through the turns without a live position.
type Nav = {
  track: Track;
  mode: Mode;
  end: LatLng;
  endName: string;
  status: "locating" | "live" | "preview";
  step: number;
  fix: Fix | null;
  offCount: number;
  arrived: boolean;
  nearSaid: number;
  hazardSaid: number;
  user: { lat: number; lng: number; heading: number } | null;
  t: number;
};

const TURN_DEG: Partial<Record<TurnKind, number>> = { straight: 0, "slight-right": 45, right: 90, "sharp-right": 135, "sharp-left": -135, left: -90, "slight-left": -45 };

function TurnIcon({ kind, size = 40 }: { kind: TurnKind; size?: number }) {
  if (kind === "arrive") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="currentColor" />
        <circle cx="12" cy="10" r="2.6" fill="var(--nav-bg, #0f2a23)" />
      </svg>
    );
  }
  if (kind === "roundabout") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22v-5" />
        <circle cx="12" cy="11.5" r="5" />
        <path d="M16 8l4-4m-4 0h4v4" />
      </svg>
    );
  }
  if (kind === "uturn") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 22V9a4 4 0 0 0-8 0v6" />
        <path d="M5 12l3 3.5L11 12" />
      </svg>
    );
  }
  const rad = ((TURN_DEG[kind] ?? 0) * Math.PI) / 180;
  const ex = 12 + 8 * Math.sin(rad);
  const ey = 11 - 8 * Math.cos(rad);
  const bx = ex - 4 * Math.sin(rad);
  const by = ey + 4 * Math.cos(rad);
  const px = 3.5 * Math.cos(rad);
  const py = 3.5 * Math.sin(rad);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={`M12 23V11L${bx.toFixed(2)} ${by.toFixed(2)}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${ex.toFixed(2)} ${ey.toFixed(2)}L${(bx + px).toFixed(2)} ${(by + py).toFixed(2)}L${(bx - px).toFixed(2)} ${(by - py).toFixed(2)}z`} fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function clock(t: number) {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const WEIGHT_WORD = ["Off", "Low", "Medium", "High"];
const TOP_N = 20;
const nf = (n: number) => n.toLocaleString("en-GB");
const count = (meta: SegmentData["meta"] | undefined, key: string) => {
  const v = meta?.counts[key];
  return typeof v === "number" ? nf(v) : "Loading";
};

const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];

// Search ignores case, accents, and ß, so "strasse" finds "Straße".
function norm(t: string) {
  return t.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

  // Full screen map shell: search box, phone sheet, desktop side panel.
  const [wide, setWide] = useState(false);
  const [vh, setVh] = useState(800);
  const [panelOpen, setPanelOpen] = useState(true);
  const [snap, setSnap] = useState<Snap>("peek");
  const [dragH, setDragH] = useState<number | null>(null);
  const [peekH, setPeekH] = useState(250);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [layersOpen, setLayersOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const mapApi = useRef<LeafletMap | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const drag = useRef<{ y0: number; h0: number; t0: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  // Trip in progress (Start button).
  const [nav, setNav] = useState<Nav | null>(null);
  const [follow, setFollow] = useState(true);
  const [voice, setVoice] = useState(true);
  const [showSteps, setShowSteps] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const navRef = useRef<Nav | null>(null);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const locTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRef = useRef(true);
  const [query, setQuery] = useState("");

  const preset = presetId ? presetById(presetId)! : null;
  // Part 0: the list ranks streets (segments grouped by name and district), percentiles over streets.
  const streets = useMemo(() => (data ? aggregateStreets(data.segments) : null), [data]);
  const streetOfSeg = useMemo(() => {
    const m = new Map<number, number>();
    for (const st of streets ?? []) for (const id of st.segIds) m.set(id, st.id);
    return m;
  }, [streets]);
  const pct = useMemo(() => (streets ? percentiles(streets) : null), [streets]);
  const ranked = useMemo(
    () => (streets && pct ? (rankSegments(streets, preset ?? { weights }, pct) as (Scored & { seg: Street })[]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streets, pct, presetId, weights]
  );
  // The map still draws every segment, coloured by its street. Segments with no street stay grey.
  const segRanked = useMemo(() => {
    if (!ranked || !data) return null;
    const byId = new Map(data.segments.map((sg) => [sg.id, sg]));
    const out: Scored[] = [];
    for (const x of ranked) for (const id of x.seg.segIds) out.push({ ...x, seg: byId.get(id)! });
    for (const sg of data.segments)
      if (!streetOfSeg.has(sg.id)) out.push({ seg: sg, score: null, littleData: true, parts: [], support: null, supportCount: 0, supportKey: null, gate: null, weak: false });
    return out;
  }, [ranked, data, streetOfSeg]);
  const mapRanked = useDeferredValue(segRanked);
  const [enoughOnly, setEnoughOnly] = useState(true);
  // Ranks count only the rows the list can show, so they run 1, 2, 3 without gaps.
  const rankOf = useMemo(
    () => new Map((ranked ?? []).filter((x) => x.score != null && x.seg.length >= MIN_SEGMENT_M && (!enoughOnly || enoughData(x))).map((x, i) => [x.seg.id, i + 1])),
    [ranked, enoughOnly]
  );
  const scoredCount = useMemo(() => (ranked ? ranked.filter((x) => x.score != null).length : 0), [ranked]);

  const districts = useMemo(() => (data ? [...new Set(data.segments.map((s) => s.district).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, "de")) : []), [data]);

  const filtered = useMemo(() => {
    if (!ranked) return [];
    const q = search.toLowerCase().trim();
    return ranked.filter((x) => {
      if (x.score == null) return false;
      if (x.seg.length < MIN_SEGMENT_M) return false;
      if (enoughOnly && !enoughData(x)) return false;
      if (district !== "all" && x.seg.district !== district) return false;
      return !q || (x.seg.name ?? x.seg.near ?? "").toLowerCase().includes(q) || (x.seg.district ?? "").toLowerCase().includes(q);
    });
  }, [ranked, search, district, enoughOnly]);
  const lowHidden = useMemo(() => (ranked ? ranked.filter((x) => x.score != null && x.seg.length >= MIN_SEGMENT_M && !enoughData(x)).length : 0), [ranked]);
  const top: TopItem[] = useMemo(() => filtered.slice(0, TOP_N).map((x) => ({ x, rank: rankOf.get(x.seg.id) ?? 0 })), [filtered, rankOf]);
  const hero = useMemo(() => (ranked ? heroFact(data?.meta ?? null) : null), [ranked, data]);
  const fixList = useMemo(
    () => (ranked ? ranked.filter((x) => enoughData(x) && x.seg.length >= MIN_SEGMENT_M).slice(0, TOP_N).map((x) => ({ name: segName(x.seg), coords: x.seg.g })) : []),
    [ranked]
  );

  // Search box: streets from the fix first ranking, then places for a trip.
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = norm(query.trim());
    const streets = (ranked ?? [])
      .filter((x) => x.score != null && x.seg.length >= MIN_SEGMENT_M && x.seg.name && (!q || norm(x.seg.name).includes(q) || norm(x.seg.district ?? "").includes(q)))
      .slice(0, q ? 6 : 4)
      .map((x) => ({ kind: "street" as const, id: x.seg.id }));
    const places = PLACE_KEYS.filter((k) => !q || norm(PLACES[k].name).includes(q)).map((k) => ({ kind: "place" as const, key: k }));
    return [...streets, ...places];
  }, [query, ranked]);

  // Phone or desktop layout, and the screen height for the sheet.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => {
      setWide(mq.matches);
      setVh(window.innerHeight);
    };
    const t = setTimeout(on, 0);
    mq.addEventListener("change", on);
    window.addEventListener("resize", on);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  // The peeking sheet is exactly as tall as its title block.
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPeekH(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

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
      return segmentInsight(x, preset, rankOf.get(x.seg.id) ?? null);
    }
    return insightFor(selection, danger, cityTrees);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, danger, cityTrees, ranked, presetId, rankOf]);
  const gaps = useMemo(() => (cityTrees ? shadeGaps(cityTrees) : []), [cityTrees]);

  async function fetchLive() {
    setLiveState("loading");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Only boxes inside the city boundary, values below 0 dropped (lib/live.ts).
      const boxes = await fetchHeilbronnBoxes(controller.signal, 20);
      clearTimeout(timeout);
      // Use ONE box: the newest fresh box with a temperature or dust value, and only its own values.
      const picked = boxes.find((b) => b.fresh && (b.temp || b.pm10 || b.pm25));
      if (!picked) {
        setLive(null);
        setLiveState("none");
        return;
      }
      const text = (r: LiveReading | null) => (r ? `${r.value} ${r.unit}`.trim() : null);
      const same = !!(picked.pm10 && picked.pm25 && picked.pm10.value === picked.pm25.value);
      setLive({ temp: text(picked.temp), pm10: text(picked.pm10), pm25: text(picked.pm25), same, box: picked.name, time: formatTime(picked.updatedAt) });
      setLiveState("ok");
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

  function selectSegment(segOrStreet: number) {
    // A tap on the map gives a segment id; the list works on streets.
    const id = streetOfSeg.get(segOrStreet) ?? segOrStreet;
    setActiveId(id);
    setView("city");
    setSelection({ kind: "segment", id });
  }

  function showOnMap(id: number) {
    selectSegment(id);
    setFocus({ id, key: ++focusSeq.current });
    // On phones, lower the sheet so the map is in view.
    if (!wide) setSnap("peek");
  }

  function switchView(v: View) {
    setView(v);
    setSelection(null);
    // The trip planner needs room on phones.
    if (v === "people" && !wide) setSnap((s) => (s === "peek" ? "half" : s));
  }

  function choose(sg: Suggestion) {
    setSuggestOpen(false);
    searchRef.current?.blur();
    if (sg.kind === "street") {
      const x = ranked?.find((r) => r.seg.id === sg.id);
      setQuery(x ? segName(x.seg) : "");
      showOnMap(sg.id);
    } else {
      setQuery("");
      switchView("people");
      pickEnd(sg.key);
      if (!wide) setSnap("half");
    }
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      return;
    }
    if (!suggestions.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestOpen(true);
      setHi((h) => (h + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (e.key === "Enter" && suggestOpen) {
      e.preventDefault();
      choose(suggestions[Math.min(hi, suggestions.length - 1)]);
    }
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setToast("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (distM([lat, lng], CENTER) > 30000) {
          setToast("You seem to be outside Heilbronn, so the map stays on the city.");
          return;
        }
        setMe({ lat, lng, acc: Math.min(accuracy, 500), key: Date.now() });
        if (view === "people") {
          setCustom((c) => ({ ...c, start: { name: "Your location", lat, lng } }));
          setStartId("custom-start");
          setToast("Your location is now the start. Only start and end go to the route service.");
        } else {
          setToast("Showing your location. It stays in your browser.");
        }
      },
      () => {
        setLocating(false);
        setToast("Location is off or blocked in this browser.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // ---------- Trip: start, follow, speak, stop ----------
  function commitNav(n: Nav | null) {
    navRef.current = n;
    setNav(n);
  }

  function say(text: string, interrupt = true) {
    if (!voiceRef.current || !("speechSynthesis" in window)) return;
    if (interrupt) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    window.speechSynthesis.speak(u);
  }

  function stopWatch() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (locTimer.current) clearTimeout(locTimer.current);
    locTimer.current = null;
  }

  function toPreview(msg: string) {
    stopWatch();
    const n = navRef.current;
    if (!n) return;
    commitNav({ ...n, status: "preview", user: null, fix: null, step: 0, t: Date.now() });
    setToast(msg);
  }

  function onNavPos(pos: GeolocationPosition) {
    const n = navRef.current;
    if (!n || n.status === "preview" || n.arrived) return;
    const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
    const fix = project(n.track, p, n.fix ? n.fix.idx - 30 : 0);
    if (n.status === "locating") {
      if (locTimer.current) clearTimeout(locTimer.current);
      if (fix.off > 300) {
        toPreview("You are not near this route, so this is a preview of the turns. Go to the start and press Start again.");
        return;
      }
    }
    const h = pos.coords.heading;
    const heading = h !== null && !Number.isNaN(h) && (pos.coords.speed ?? 0) > 0.7 ? h : bearingAt(n.track.coords, fix.idx);
    const step = nextStep(n.track, fix.along);
    const st = n.track.steps[step];
    const toTurn = n.track.stepAlong[step] - fix.along;
    const offCount = fix.off > (n.mode === "bike" ? 40 : 30) ? n.offCount + 1 : 0;
    const arrived = n.track.total - fix.along < 25;
    let nearSaid = n.nearSaid;
    if (arrived) say(`You have arrived at ${n.endName}.`);
    else if (n.status === "locating") say(`${stepText(n.track.steps[0], n.endName)}. Then in ${spokenDist(toTurn)}, ${stepText(st, n.endName)}.`);
    else if (step !== n.step) say(`In ${spokenDist(toTurn)}, ${stepText(st, n.endName)}.`);
    else if (toTurn < 40 && nearSaid !== step) {
      say(`${stepText(st, n.endName)}.`);
      nearSaid = step;
    }
    if (offCount === 2) say("You are off the route.");
    let hazardSaid = n.hazardSaid;
    const hz = n.track.hazards.findIndex((x) => x.along > fix.along - 10 && x.along - fix.along < 150);
    if (hz > hazardSaid) {
      say(n.track.hazards[hz].text, false);
      hazardSaid = hz;
    }
    if (arrived) stopWatch();
    commitNav({ ...n, status: "live", fix, step, offCount, arrived, nearSaid, hazardSaid, user: { lat: p[0], lng: p[1], heading }, t: Date.now() });
  }

  function startNav() {
    const r = routes.find((x) => x.id === activeRouteId);
    if (!r) return;
    const track = buildTrack(r, mode, danger, fixList);
    commitNav({
      track,
      mode,
      end: [endPlace.lat, endPlace.lng],
      endName: endPlace.name,
      status: "locating",
      step: 0,
      fix: null,
      offCount: 0,
      arrived: false,
      nearSaid: -1,
      hazardSaid: -1,
      user: null,
      t: Date.now(),
    });
    setFollow(true);
    setShowSteps(false);
    setSelection(null);
    setLayersOpen(false);
    setSuggestOpen(false);
    // Keep the screen on during the trip, where the browser allows it.
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request("screen")
      .then((lock) => (wakeRef.current = lock))
      .catch(() => {});
    if (!("geolocation" in navigator)) {
      toPreview("This browser cannot share a location, so this is a preview of the turns.");
      return;
    }
    locTimer.current = setTimeout(() => {
      if (navRef.current?.status === "locating") toPreview("Your location was not found, so this is a preview of the turns.");
    }, 15000);
    watchRef.current = navigator.geolocation.watchPosition(
      onNavPos,
      () => {
        if (navRef.current?.status !== "live") toPreview("Location is off or blocked, so this is a preview of the turns.");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  }

  function exitNav() {
    stopWatch();
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    commitNav(null);
    setShowSteps(false);
    setFollow(true);
    setResetKey((k) => k + 1);
  }

  function previewStep(d: number) {
    const n = navRef.current;
    if (!n) return;
    commitNav({ ...n, step: Math.max(0, Math.min(n.track.steps.length - 1, n.step + d)) });
  }

  async function reroute() {
    const n = navRef.current;
    if (!n?.user) return;
    setRerouting(true);
    try {
      const r = await fetchDirect([n.user.lat, n.user.lng], n.end, n.mode);
      if (!r) throw new Error("No route");
      const track = buildTrack(r, n.mode, danger, fixList);
      const fix = project(track, [n.user.lat, n.user.lng]);
      const cur = navRef.current ?? n;
      commitNav({ ...cur, track, fix, step: nextStep(track, fix.along), offCount: 0, nearSaid: -1, hazardSaid: -1, t: Date.now() });
      setFollow(true);
      setToast("New route found. Only your current point and the end went to the route service.");
    } catch {
      setToast("No new route right now. Check your connection and try again.");
    } finally {
      setRerouting(false);
    }
  }

  function toggleVoice() {
    voiceRef.current = !voiceRef.current;
    setVoice(voiceRef.current);
    if (!voiceRef.current && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  // Stop watching the position if the page goes away mid trip.
  useEffect(() => {
    const watch = watchRef;
    const wake = wakeRef;
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      wake.current?.release().catch(() => {});
    };
  }, []);

  const navView = useMemo<NavView | null>(() => {
    if (!nav) return null;
    const st = nav.track.steps[nav.step];
    return {
      coords: nav.track.coords,
      idx: nav.fix?.idx ?? 0,
      at: nav.fix?.at ?? null,
      user: nav.user,
      follow: nav.status === "live" && follow,
      focus: nav.status === "live" ? null : st ? [st.lat, st.lng] : nav.track.coords[0],
    };
  }, [nav, follow]);

  function resetMap() {
    setFocus(null);
    setSelection(null);
    setResetKey((k) => k + 1);
  }

  // Drag the phone sheet by its title block. A short tap still works as a click.
  const snapPx: Record<Snap, number> = { peek: peekH, half: Math.max(peekH, Math.round(vh * 0.52)), full: Math.max(peekH, vh - 76) };
  const sheetPx = dragH ?? snapPx[snap];

  function onSheetDown(e: React.PointerEvent<HTMLDivElement>) {
    if (wide || e.button !== 0) return;
    drag.current = { y0: e.clientY, h0: sheetPx, t0: performance.now(), moved: false };
  }
  function onSheetMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;
    if (!d.moved) {
      if (Math.abs(dy) < 8) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragH(Math.min(snapPx.full, Math.max(peekH, d.h0 + dy)));
  }
  function onSheetUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    dragged.current = true;
    const h = Math.min(snapPx.full, Math.max(peekH, d.h0 + d.y0 - e.clientY));
    const v = (d.y0 - e.clientY) / Math.max(1, performance.now() - d.t0);
    let next: Snap;
    if (v > 0.5) next = h > snapPx.half ? "full" : "half";
    else if (v < -0.5) next = h < snapPx.half ? "peek" : "half";
    else next = (["peek", "half", "full"] as Snap[]).reduce((a, b) => (Math.abs(snapPx[b] - h) < Math.abs(snapPx[a] - h) ? b : a));
    setSnap(next);
    setDragH(null);
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

  // Free part of the map, so fits and selections land where people can see them.
  const insets: Insets = nav
    ? { top: wide ? 150 : 190, left: 0, right: 16, bottom: 110 }
    : wide
    ? { top: 76, left: panelOpen ? 408 : 0, right: insight ? 404 : 72, bottom: 0 }
    : { top: 120, left: 0, right: 56, bottom: insight ? Math.round(vh * 0.5) : Math.min(sheetPx, snapPx.half) };
  const fabsHidden = !wide && (!!insight || sheetPx > peekH + 40);

  const selectionAt = insight ? insight.at : null;
  const activeRoute = routes.find((r) => r.id === activeRouteId);

  // Trip numbers for the banner and the bottom bar.
  const navStep = nav ? nav.track.steps[nav.step] : null;
  const navAlong = nav ? (nav.status === "live" && nav.fix ? nav.fix.along : nav.status === "preview" ? nav.track.stepAlong[nav.step] : 0) : 0;
  const navToTurn = nav ? (nav.status === "live" ? nav.track.stepAlong[nav.step] - navAlong : nav.step > 0 ? nav.track.steps[nav.step - 1].distance : 0) : 0;
  const navThen = nav && navStep && navStep.type !== "arrive" && navStep.distance < 120 ? nav.track.steps[nav.step + 1] ?? null : null;
  const navRemainM = nav ? Math.max(0, nav.track.total - navAlong) : 0;
  const navRemainS = nav ? (nav.track.duration * navRemainM) / Math.max(1, nav.track.total) : 0;
  const navHazard = nav ? nav.track.hazards.find((x) => x.along > navAlong - 10 && x.along - navAlong < (nav.status === "live" ? 200 : 120)) ?? null : null;
  const active = activeId != null ? data?.segments.find((s) => s.id === activeId) : undefined;
  const compare = compareLine(greenRoute, fastRoute);

  const legend = (
    <>
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
    </>
  );

  const layerChips = (
    <>
      <button type="button" className="layer-chip" aria-pressed={layers.trees} onClick={() => toggleLayer("trees")}>
        <i className="dot dot-tree" aria-hidden="true" /> Trees
      </button>
      <button type="button" className="layer-chip" aria-pressed={layers.heat} onClick={() => toggleLayer("heat")}>
        <i className="dot dot-heat" aria-hidden="true" /> Heat walk
      </button>
      <button type="button" className="layer-chip" aria-pressed={layers.danger} onClick={() => toggleLayer("danger")} aria-busy={dangerState === "loading"}>
        <i className="dot dot-danger" aria-hidden="true" /> {dangerState === "loading" && layers.danger ? "Loading..." : "Close passes"}
      </button>
    </>
  );

  const showSuggest = suggestOpen && suggestions.length > 0;
  const hiIndex = Math.min(hi, suggestions.length - 1);

  return (
    <div
      className={`app${nav ? " is-nav" : ""}${insight ? " has-card" : ""}${panelOpen ? "" : " panel-closed"}${fabsHidden ? " fabs-hidden" : ""}`}
      style={{ ["--sheet-h" as string]: `${wide ? 0 : Math.min(sheetPx, peekH)}px` }}
    >
      <MapView
        view={view}
        ranked={mapRanked}
        top={top}
        activeId={activeId}
        activeLines={activeId != null ? ranked?.find((r) => r.seg.id === activeId)?.seg.lines ?? null : null}
        focus={focus}
        resetKey={resetKey}
        layers={layers}
        danger={danger}
        cityTrees={cityTrees}
        start={startPlace}
        end={endPlace}
        routes={view === "people" && !nav ? routes : []}
        selectedRouteId={activeRouteId}
        selection={selection}
        selectionAt={selectionAt}
        onSegmentSelect={selectSegment}
        onViewChange={onViewChange}
        onMapReady={onMapReady}
        onSelect={setSelection}
        onRouteSelect={setSelectedRouteId}
        onPick={pickOnMap}
        insets={insets}
        me={me}
        nav={navView}
        onNavPan={() => setFollow(false)}
        onMap={(m) => (mapApi.current = m)}
      />

      <div className={`searchbox${showSuggest ? " is-open" : ""}`}>
        <div className="search-row">
          <Link href="/" className="search-logo" aria-label="GrünRoute Heilbronn, home">
            <LogoMark size={30} />
          </Link>
          <input
            ref={searchRef}
            type="search"
            role="combobox"
            aria-expanded={showSuggest}
            aria-controls="search-list"
            aria-autocomplete="list"
            aria-activedescendant={showSuggest ? `sg-${hiIndex}` : undefined}
            aria-label="Search streets and places"
            placeholder="Search GrünRoute Heilbronn"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            onKeyDown={onSearchKey}
          />
          {query ? (
            <button
              type="button"
              className="search-icon"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <span className="search-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="20" height="20">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          )}
          <span className="search-sep" aria-hidden="true" />
          <button type="button" className="search-dir" aria-label="Plan a trip" title="Plan a trip" aria-pressed={view === "people"} onClick={() => switchView(view === "people" ? "city" : "people")}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" fill="currentColor" />
              <path d="M9 14v-2.5a1.5 1.5 0 0 1 1.5-1.5H15m-2-2l2 2-2 2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {showSuggest && (
          <ul className="suggest" id="search-list" role="listbox" aria-label="Suggestions" onMouseDown={(e) => e.preventDefault()}>
            {suggestions.map((sg, i) => {
              if (sg.kind === "street") {
                const x = ranked?.find((r) => r.seg.id === sg.id);
                if (!x || x.score == null) return null;
                const band = bandFor(x.score);
                const rank = rankOf.get(x.seg.id);
                return (
                  <li key={`s${sg.id}`} id={`sg-${i}`} role="option" aria-selected={i === hiIndex} className="sg" onClick={() => choose(sg)} onMouseEnter={() => setHi(i)}>
                    <span className={`sg-pin${rank && rank >= 100 ? " is-long" : ""}`} style={{ background: band.color }} aria-hidden="true">
                      {rank ?? ""}
                    </span>
                    <span className="sg-text">
                      <b>{segName(x.seg)}</b>
                      <span>
                        {districtLabel(x.seg.district)}, fix score {x.score}
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={`p${sg.key}`} id={`sg-${i}`} role="option" aria-selected={i === hiIndex} className="sg" onClick={() => choose(sg)} onMouseEnter={() => setHi(i)}>
                  <span className="sg-pin sg-place" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="currentColor" />
                      <circle cx="12" cy="10" r="2.6" fill="#fff" />
                    </svg>
                  </span>
                  <span className="sg-text">
                    <b>{PLACES[sg.key].name}</b>
                    <span>Plan a trip here</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="chipbar" role="group" aria-label="Map layers">
        {layerChips}
      </div>
      {layers.danger && dangerState === "error" && <p className="map-msg">Close pass points could not be loaded from ATRAI right now. Tap the layer again to retry.</p>}

      <div className="fabs">
        <button type="button" className="fab" aria-label="Map layers and legend" title="Map layers and legend" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 3l9 5-9 5-9-5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M3 13l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="fab" aria-label="Reset map view" title="Reset map view" onClick={resetMap}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className={`fab fab-locate${me ? " is-on" : ""}`} aria-label="Show my location" title="Show my location" aria-busy={locating} onClick={locate}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill={me ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 1.5V4M12 20v2.5M1.5 12H4M20 12h2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="fab-zoom" role="group" aria-label="Zoom">
          <button type="button" className="fab" aria-label="Zoom in" title="Zoom in" onClick={() => mapApi.current?.zoomIn()}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="fab" aria-label="Zoom out" title="Zoom out" onClick={() => mapApi.current?.zoomOut()}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {layersOpen && (
        <div className="layers-pop" role="dialog" aria-label="Map layers and legend" onKeyDown={(e) => e.key === "Escape" && setLayersOpen(false)}>
          <div className="layers-head">
            <p>Map layers</p>
            <button type="button" className="info-close" aria-label="Close map layers" onClick={() => setLayersOpen(false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="layers-chips">{layerChips}</div>
          <div className="layers-legend">{legend}</div>
          <p className="legend-note">Tap anything on the map to see what it means. Layers are context only, they never change a fix score.</p>
        </div>
      )}

      {!insight && (
        <div className="map-legend" aria-label="Map legend">
          {legend}
        </div>
      )}

      {insight && <InfoCard insight={insight} onClose={() => setSelection(null)} />}

      <aside className={`sheet${dragH !== null ? " is-dragging" : ""}`} data-snap={snap} aria-label="GrünRoute panel" style={wide ? undefined : { height: sheetPx }}>
        <div
          className="sheet-head"
          ref={headRef}
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragH(null);
          }}
          onClickCapture={(e) => {
            // A drag that ends on a button is not a tap.
            if (dragged.current) {
              e.stopPropagation();
              e.preventDefault();
              dragged.current = false;
            }
          }}
        >
          <button
            type="button"
            className="sheet-grab"
            aria-label={snap === "full" ? "Show less of the panel" : "Show more of the panel"}
            onClick={() => setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))}
          >
            <span aria-hidden="true" />
          </button>
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
                <b>{hero.big}</b> {hero.text} <span>{hero.caveat}</span>
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
        </div>

        <div className="sheet-body">
            <section className="panel" id="panel" role="tabpanel" aria-label={view === "city" ? "Fix first list" : "Plan a trip"}>
              {view === "city" ? (
            <>
              <div className="panel-head">
                <h2>Fix first list</h2>
                <p>
                  Ranked by your priorities. Measured streets only, {data ? nf(scoredCount) : "loading"} streets.
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
                {presetId === "gap" && <p className="prio-note">Passing gap only keeps the old rule: 100 minus half the average passing gap in cm. It now covers the full measured network, not the old 6 street sample.</p>}
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
                        {districtLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="check">
                  <input type="checkbox" checked={enoughOnly} onChange={(e) => setEnoughOnly(e.target.checked)} />
                  <span>Enough data only</span>
                </label>
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
                    : `Top ${Math.min(TOP_N, filtered.length)} of ${nf(filtered.length)} scored streets${district !== "all" ? ` in ${districtLabel(district)}` : ""}. Across Heilbronn, ${nf(ranked.length - scoredCount)} have little data for these priorities and stay grey on the map.`}
                  {enoughOnly && lowHidden > 0 && ` ${nf(lowHidden)} streets with low data support are hidden from the list. They stay on the map.`}
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
                            <span className="street-area">{districtLabel(s.district)}, {nf(s.length)} m</span>
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
                            if (!wide) setSnap("peek");
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

      <section className={`live is-${liveState}`} aria-labelledby="live-title">
        <div className="live-head">
          <h2 id="live-title">
            <i className="live-dot" aria-hidden="true" /> Sensor snapshot near Heilbronn
          </h2>
          <p>Latest public values from openSenseMap, read when you open this page. A single live value never changes a street score.</p>
        </div>
        {liveState === "loading" && <p className="live-msg">Reading openSenseMap...</p>}
        {liveState === "none" && <p className="live-msg">No fresh public sensor in Heilbronn right now.</p>}
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
        </div>

        {view === "people" && routeState === "ok" && activeRoute && (
          <div className="start-bar">
            <button type="button" className="btn-start" onClick={startNav}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M12 2l8 19-8-4.5L4 21z" fill="currentColor" />
              </svg>
              {mode === "bike" ? "Start ride" : "Start walk"}
            </button>
            <span className="start-meta">
              <b>{activeRoute.metrics.min} min</b>
              <span>
                {activeRoute.metrics.km.toLocaleString("en-GB")} km, {ROUTE_NAME[activeRoute.label]}
              </span>
            </span>
          </div>
        )}
      </aside>

      <button
        type="button"
        className="panel-toggle"
        aria-label={panelOpen ? "Hide side panel" : "Show side panel"}
        title={panelOpen ? "Hide side panel" : "Show side panel"}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d={panelOpen ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {nav && navStep && (
        <>
          <div className="nav-stack">
          <div className={`nav-top${nav.offCount >= 2 ? " is-off" : ""}`} role="status" aria-live="polite">
            <div className="nav-banner">
              <span className="nav-turn">
                <TurnIcon kind={turnKind(navStep)} size={44} />
              </span>
              <div className="nav-text">
                {nav.status === "locating" ? (
                  <>
                    <b>Finding you...</b>
                    <p>{stepText(nav.track.steps[0], nav.endName)}</p>
                  </>
                ) : (
                  <>
                    <b>{navStep.type === "depart" ? "Start" : fmtDist(navToTurn)}</b>
                    <p>{stepText(navStep, nav.endName)}</p>
                  </>
                )}
              </div>
            </div>
            {navThen && (
              <p className="nav-then">
                Then <TurnIcon kind={turnKind(navThen)} size={20} />
                <span className="sr-only">{stepText(navThen, nav.endName)}</span>
              </p>
            )}
            {nav.status === "preview" && (
              <div className="nav-stepper">
                <button type="button" aria-label="Previous turn" disabled={nav.step === 0} onClick={() => previewStep(-1)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span>
                  Preview, turn {nav.step + 1} of {nav.track.steps.length}
                </span>
                <button type="button" aria-label="Next turn" disabled={nav.step === nav.track.steps.length - 1} onClick={() => previewStep(1)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {navHazard && !nav.arrived && (
            <p className="nav-alert">
              <i className="dot dot-danger" aria-hidden="true" />
              <span>
                {nav.status === "live" && <b>In {fmtDist(Math.max(0, navHazard.along - navAlong))}: </b>}
                {navHazard.text}
              </span>
            </p>
          )}
          </div>

          {nav.offCount >= 2 && !nav.arrived && (
            <div className="nav-off">
              <p>You are off the route.</p>
              <button type="button" className="btn" onClick={reroute} disabled={rerouting}>
                {rerouting ? "Finding a route..." : "New route from here"}
              </button>
            </div>
          )}

          {nav.status === "live" && !follow && !nav.arrived && (
            <button type="button" className="nav-recenter" onClick={() => setFollow(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12 2l8 19-8-4.5L4 21z" fill="currentColor" />
              </svg>
              Re-centre
            </button>
          )}

          {showSteps && (
            <div className="nav-steps" role="dialog" aria-label="All turns">
              <div className="layers-head">
                <p>All turns</p>
                <button type="button" className="info-close" aria-label="Close the list of turns" onClick={() => setShowSteps(false)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <ol>
                {nav.track.steps.map((st, i) => (
                  <li key={i} className={i === nav.step ? "is-current" : i < nav.step ? "is-done" : undefined}>
                    <button
                      type="button"
                      onClick={() => {
                        if (nav.status !== "live") commitNav({ ...nav, step: i });
                        setShowSteps(false);
                      }}
                    >
                      <TurnIcon kind={turnKind(st)} size={24} />
                      <span>
                        {stepText(st, nav.endName)}
                        {st.distance > 0 && st.type !== "arrive" && <small>then {fmtDist(st.distance)}</small>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {nav.arrived ? (
            <div className="nav-done" role="dialog" aria-label="You have arrived">
              <TurnIcon kind="arrive" size={40} />
              <div>
                <b>You have arrived</b>
                <p>{nav.endName}</p>
              </div>
              <button type="button" className="btn" onClick={exitNav}>
                Done
              </button>
            </div>
          ) : (
            <div className="nav-bottom">
              <button type="button" className="nav-exit" aria-label="End the trip" title="End the trip" onClick={exitNav}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
              <div className="nav-eta">
                <b>{Math.max(1, Math.round(navRemainS / 60))} min</b>
                <span>
                  {fmtDist(navRemainM)}, arrive {clock(nav.t + navRemainS * 1000)}
                </span>
              </div>
              <button type="button" className="nav-tool" aria-label="Show all turns" title="Show all turns" aria-expanded={showSteps} onClick={() => setShowSteps((o) => !o)}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="4" cy="6" r="1.4" fill="currentColor" />
                  <circle cx="4" cy="12" r="1.4" fill="currentColor" />
                  <circle cx="4" cy="18" r="1.4" fill="currentColor" />
                </svg>
              </button>
              <button type="button" className="nav-tool" aria-label={voice ? "Mute spoken turns" : "Speak turns"} title={voice ? "Mute spoken turns" : "Speak turns"} aria-pressed={voice} onClick={toggleVoice}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
                  {voice ? (
                    <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  ) : (
                    <path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  )}
                </svg>
              </button>
              <p className="nav-privacy">Your position stays on this device.</p>
            </div>
          )}
        </>
      )}

      <p className={`toast${toast ? " is-on" : ""}`} role="status" aria-live="polite">
        {toast}
      </p>

      {active && view === "city" && (
        <p className="sr-only" aria-live="polite">
          Showing {segName(active)} on the map.
        </p>
      )}
    </div>
  );
}