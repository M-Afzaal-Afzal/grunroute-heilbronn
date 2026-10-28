"use client";
// The people app home, map first: the map fills the screen, a small From and To
// card floats on top, and the routes sit in a bottom sheet (a side panel on wide
// screens). Compare a cooler route with the fastest and follow it with live directions.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppNav from "./AppNav";
import SiteFooter from "./SiteFooter";
import InfoCard from "./InfoCard";
import NavPanel from "./NavPanel";
import PlacePicker from "./PlacePicker";
import FairTour from "./FairTour";
import { CAMPAIGN, PLACES } from "../lib/data";
import { HEAT, WATER, fmtAnomaly, type DangerPoint } from "../lib/geo";
import { HEAT_WALK } from "../lib/heat-walks";
import { insightFor, type Selection } from "../lib/insights";
import { MIN_SEGMENT_M, aggregateStreets, enoughData, percentiles, presetById, rankSegments } from "../lib/priority";
import { RULE_150, heroFact, loadSegments, type SegmentData } from "../lib/segments";
import { SOURCES } from "../lib/sources";
import { fetchHeilbronnBoxes, type LiveBox, type LiveReading } from "../lib/live";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { loadDangerPoints } from "../lib/atrai";
import { fetchRouteOptions, rankRoutes, type Mode, type RawRoute, type RouteMetrics, type RouteOption } from "../lib/routing";
import { ROUTE_THEME, mainGain, type ComfortTerm } from "../lib/comfort";
import { ICON_COLOR, ICON_GLYPH, ICON_NAME, routeIcons, type IconKind } from "../lib/routeIcons";
import { useNavigation } from "../lib/useNavigation";
import type { Layers, MapPlace, NavView } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map map-loading" aria-hidden="true" />,
});

type LiveState = "loading" | "ok" | "stale" | "none" | "offline";
type LiveValue = { temp: string | null; pm10: string | null; pm25: string | null; same: boolean; box: string; time: string };
type LoadState = "idle" | "loading" | "ok" | "error";

const nf = (n: number) => n.toLocaleString("en-GB");
const count = (meta: SegmentData["meta"] | undefined, key: string, failed: boolean) => {
  const v = meta?.counts[key];
  return typeof v === "number" ? nf(v) : failed ? "Not loaded" : "Loading";
};
const BALANCED = presetById("balanced")!;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** "lat,lng" from the link, only inside a wide box around Heilbronn. */
function placeFromQuery(v: string | null, name: string | null, fallback: string): MapPlace | null {
  if (!v) return null;
  const [lat, lng] = v.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat - 49.14) > 0.5 || Math.abs(lng - 9.21) > 0.6) return null;
  return { name: name?.slice(0, 80) || fallback, lat, lng };
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
  if (m.danger !== null && m.danger > 0 && mode === "bike") tips.push(`${m.danger} close pass ${m.danger === 1 ? "point was" : "points were"} recorded by bike sensors along this route.`);
  if (m.treeSource === "city" && m.bigCrowns !== null && m.bigCrowns > 0) tips.push(`${m.bigCrowns} big ${m.bigCrowns === 1 ? "tree" : "trees"} with a crown of 8 m or more within 20 m, good shade.`);
  else if (m.treeSource === "osm" && m.treesPerKm >= 40) tips.push("Many mapped trees along the way, so expect more shade.");
  if (!tips.length) tips.push("Nothing stands out in the data for this route.");
  return tips;
}

/** What a route gains on the other one, in a few words, from the part of the comfort rule that wins. */
function gainText(term: ComfortTerm, a: RouteMetrics, b: RouteMetrics) {
  if (term === "shade") {
    const d = a.trees - b.trees;
    return d > 0 ? `${d} more ${a.treeSource === "city" ? "city" : "mapped"} trees` : "More trees per km";
  }
  if (term === "heat") return "Cooler heat walk spots";
  const d = (b.danger ?? 0) - (a.danger ?? 0);
  return d > 0 ? `${d} fewer close pass points` : "Fewer close passes per km";
}

/** One line under each route in the sheet: why pick it. */
function pickReason(r: RouteOption, green: RouteOption | undefined, fast: RouteOption | undefined) {
  if (r.label === "both") return "No better option found for this trip";
  if (r.label === "fastest") {
    const d = green && green !== r ? green.metrics.min - r.metrics.min : 0;
    return d > 0 ? `${d} min faster` : "Quickest found";
  }
  const g = fast ? mainGain(r.metrics, fast.metrics) : null;
  if (g && fast) return gainText(g, r.metrics, fast.metrics);
  const d = fast ? r.metrics.min - fast.metrics.min : 0;
  return d > 0 ? `${d} min longer` : "Another way";
}

/** The route card during directions: a name from the simple rule in lib/comfort.ts, and why. */
function navCard(r: RouteOption, green: RouteOption | undefined, fast: RouteOption | undefined) {
  if (r.label === "both") return { name: "Fastest and greenest", reason: "No other route was better on shade, heat or close passes." };
  if (r.label === "fastest") {
    const d = green && green !== r ? green.metrics.min - r.metrics.min : 0;
    return { name: "Fastest route", reason: d > 0 ? `${d} min faster than GrünRoute.` : "The quickest route found." };
  }
  const g = fast ? mainGain(r.metrics, fast.metrics) : null;
  if (g && fast) return { name: ROUTE_THEME[g], reason: `${gainText(g, r.metrics, fast.metrics)} than the fastest route.` };
  return { name: ROUTE_NAME[r.label], reason: "Another way to your end point." };
}

// Wide screens (1024 px and up) show the sheet as a side panel.
const WIDE = "(min-width: 1024px)";
function subscribeWide(cb: () => void) {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
}

function IconBadge({ kind }: { kind: IconKind }) {
  return (
    <span className="legend-poi" style={{ color: ICON_COLOR[kind] }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" dangerouslySetInnerHTML={{ __html: ICON_GLYPH[kind] }} />
    </span>
  );
}

const INTRO_KEY = "gr-intro-done";

function compareLine(green: RouteOption | undefined, fast: RouteOption | undefined) {
  if (!green || !fast || green === fast) return null;
  const dMin = green.metrics.min - fast.metrics.min;
  const dTrees = green.metrics.trees - fast.metrics.trees;
  const parts: string[] = [];
  parts.push(dMin > 0 ? `${dMin} min longer` : dMin < 0 ? `${-dMin} min shorter` : "about the same time");
  if (dTrees > 0) parts.push(`${dTrees} more ${green.metrics.treeSource === "city" ? "city" : "mapped"} trees`);
  if (green.metrics.heat.avg !== null && fast.metrics.heat.avg !== null && green.metrics.heat.avg < fast.metrics.heat.avg) parts.push("cooler heat walk spots");
  if (green.metrics.danger !== null && fast.metrics.danger !== null && green.metrics.danger < fast.metrics.danger) parts.push(`${fast.metrics.danger - green.metrics.danger} fewer close pass points`);
  return `GrünRoute against the fastest route: ${parts.join(", ")}.`;
}


export default function Home({ qr }: { qr: string }) {
  const [mode, setMode] = useState<Mode>("bike");
  const [start, setStart] = useState<MapPlace>(PLACES.station);
  const [end, setEnd] = useState<MapPlace>(PLACES.campus);
  const [picker, setPicker] = useState<"start" | "end" | null>(null);
  // Set when the user picked "Choose on the map": the next map tap sets this point.
  const [mapPick, setMapPick] = useState<"start" | "end" | null>(null);
  const [layers, setLayers] = useState<Layers>({ trees: false, heat: false, danger: false });
  const [legendOpen, setLegendOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [fair, setFair] = useState(false);
  // Bottom sheet on phones: peek (routes and Start) or full (details and more).
  const [sheetFull, setSheetFull] = useState(false);
  // First visit card with the headline. Closed for good once dismissed (localStorage only).
  const [introOpen, setIntroOpen] = useState(false);
  const [cardOff, setCardOff] = useState(false);
  const wide = useWide();

  // Measured street network (public/data/segments.json). The big file waits until the
  // first map tiles are in (or 4 s at most), so it does not hold up the first view.
  const [mapReady, setMapReady] = useState(false);
  const [data, setData] = useState<SegmentData | null>(null);
  const [dataState, setDataState] = useState<LoadState>("idle");
  const [cityTrees, setCityTrees] = useState<CityTrees | null>(null);
  const [danger, setDanger] = useState<DangerPoint[] | null>(null);
  const [dangerState, setDangerState] = useState<LoadState>("idle");
  const [rawRoutes, setRawRoutes] = useState<RawRoute[]>([]);
  const [routeState, setRouteState] = useState<LoadState>("idle");
  const [routeTry, setRouteTry] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveValue | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("loading");
  const [boxes, setBoxes] = useState<LiveBox[]>([]);
  const [follow, setFollow] = useState(true);

  const appRef = useRef<HTMLDivElement | null>(null);
  const tripRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const nav = useNavigation(mode, [end.lat, end.lng]);
  const navOn = nav.state.status !== "idle";

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
  }, [mapReady]);

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

  // Read the link once: a trip from Help measure (?from, ?to) and fair mode (?fair=1).
  // Also show the first visit card, unless it was closed before on this phone.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const a = placeFromQuery(q.get("from"), q.get("fn"), "Start from the link");
      const b = placeFromQuery(q.get("to"), q.get("tn"), "End from the link");
      if (a) setStart(a);
      if (b) setEnd(b);
      if (q.get("mode") === "foot") setMode("foot");
      if (q.get("fair") === "1") setFair(true);
      let seen = false;
      try {
        seen = localStorage.getItem(INTRO_KEY) === "1";
      } catch {
        // Storage blocked: show the card, it can still be closed.
      }
      if (!seen) setIntroOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Sizes of the floating trip card and the sheet at peek, for the map controls and the map fit.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const ro = new ResizeObserver(() => {
      if (tripRef.current) app.style.setProperty("--trip-h", `${Math.ceil(tripRef.current.offsetHeight)}px`);
      if (peekRef.current && handleRef.current) app.style.setProperty("--peek-h", `${Math.ceil(handleRef.current.offsetHeight + peekRef.current.offsetHeight)}px`);
    });
    for (const el of [tripRef.current, peekRef.current, handleRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Count of streets with enough data and at least 20 m long, for the facts.
  const enoughCount = useMemo(() => {
    if (!data) return null;
    const streets = aggregateStreets(data.segments);
    return rankSegments(streets, BALANCED, percentiles(streets)).filter((x) => x.score != null && enoughData(x) && x.seg.length >= MIN_SEGMENT_M).length;
  }, [data]);
  const hero = useMemo(() => heroFact(data?.meta ?? null), [data]);

  // Close pass points: load when the layer is on, or when routes are compared.
  useEffect(() => {
    if (dangerState !== "idle") return;
    if (!layers.danger && !rawRoutes.length) return;
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
  }, [layers.danger, rawRoutes.length, dangerState]);

  // Real routes from OSRM whenever the trip changes.
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      setRouteState("loading");
      fetchRouteOptions([start.lat, start.lng], [end.lat, end.lng], mode, controller.signal)
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
  }, [start.lat, start.lng, end.lat, end.lng, mode, routeTry]);

  const routes = useMemo(() => rankRoutes(rawRoutes, danger, cityTrees), [rawRoutes, danger, cityTrees]);
  const activeRouteId = selectedRouteId && routes.some((r) => r.id === selectedRouteId) ? selectedRouteId : (routes[0]?.id ?? null);
  const activeRoute = routes.find((r) => r.id === activeRouteId);
  const greenRoute = routes.find((r) => r.label === "green" || r.label === "both");
  const fastRoute = routes.find((r) => r.label === "fastest" || r.label === "both");
  const compare = compareLine(greenRoute, fastRoute);

  const insight = useMemo(() => (selection ? insightFor(selection, danger, cityTrees) : null), [selection, danger, cityTrees]);

  // Icons along the chosen (or followed) route, only from data we have.
  const iconRoute = navOn ? (nav.state.route ?? activeRoute) : activeRoute;
  const icons = useMemo(() => {
    const line = iconRoute?.coords;
    if (!line || line.length < 2) return [];
    const trees = cityTrees ? cityTrees.nearLine(line, 20).map((i) => ({ lat: cityTrees.lat[i], lng: cityTrees.lng[i], crown: cityTrees.crown[i], ref: i })) : [];
    return routeIcons(line, { trees, heat: HEAT, danger, water: WATER, sensors: boxes });
  }, [iconRoute, cityTrees, danger, boxes]);
  const iconKinds = (Object.keys(ICON_NAME) as IconKind[]).filter((k) => icons.some((i) => i.kind === k));

  async function fetchLive() {
    setLiveState("loading");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Only boxes inside the city boundary, values below 0 dropped (lib/live.ts).
      const boxes = await fetchHeilbronnBoxes(controller.signal, 20);
      clearTimeout(timeout);
      setBoxes(boxes);
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

  function setSheet(full: boolean) {
    setSheetFull(full);
    if (!full && scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  // The handle: a tap toggles, a drag up or down also works.
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  function handleDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (wide || e.button !== 0) return;
    drag.current = { y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 8) return;
    d.moved = true;
    el.classList.add("is-dragging");
    el.style.setProperty("--drag", `${sheetFull ? Math.max(0, dy) : Math.min(0, dy)}px`);
  }
  function handleUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove("is-dragging");
    el.style.removeProperty("--drag");
    if (!d.moved) return;
    skipClick.current = true;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 40) setSheet(dy < 0);
  }
  function handleClick() {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    setSheet(!sheetFull);
  }

  function closeIntro() {
    setIntroOpen(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Storage blocked: the card shows again next time.
    }
    requestAnimationFrame(() => document.getElementById("about-btn")?.focus({ preventScroll: true }));
  }
  function openIntro() {
    setIntroOpen(true);
    requestAnimationFrame(() => document.getElementById("intro-close")?.focus({ preventScroll: true }));
  }

  function choose(which: "start" | "end", p: MapPlace) {
    if (which === "start") setStart(p);
    else setEnd(p);
    setPicker(null);
  }

  // Closing the picker sends focus back to the A or B button that opened it.
  function closePicker(which: "start" | "end") {
    setPicker(null);
    requestAnimationFrame(() => document.getElementById(`trip-${which}`)?.focus({ preventScroll: true }));
  }

  function pickOnMap(which: "start" | "end", lat: number, lng: number) {
    choose(which, { name: which === "start" ? "Point on the map (A)" : "Point on the map (B)", lat, lng });
    setMapPick(null);
  }

  function chooseOnMap(which: "start" | "end") {
    setPicker(null);
    setSelection(null);
    setSheet(false);
    setMapPick(which);
  }

  // Escape cancels "Choose on the map".
  useEffect(() => {
    if (!mapPick) return;
    const off = (e: KeyboardEvent) => e.key === "Escape" && setMapPick(null);
    window.addEventListener("keydown", off);
    return () => window.removeEventListener("keydown", off);
  }, [mapPick]);

  // Arrow keys move between Bike and Walk, like a radio group.
  function modeKey(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next: Mode = mode === "bike" ? "foot" : "bike";
    setMode(next);
    document.getElementById(`mode-${next}`)?.focus();
  }

  function toggleLayer(k: keyof Layers) {
    setLayers((l) => ({ ...l, [k]: !l[k] }));
    if (k === "danger" && dangerState === "error") setDangerState("idle");
  }

  // Must run inside the tap: the sound needs a user gesture on iOS.
  function startDirections() {
    if (!activeRoute) return;
    setSelection(null);
    setPicker(null);
    setMapPick(null);
    setFollow(true);
    setCardOff(false);
    setSheet(false);
    nav.start(activeRoute);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }

  const navView: NavView | null = navOn ? { route: (nav.state.route ?? activeRoute)?.coords ?? [], pos: nav.state.pos, follow, covered: nav.state.covered } : null;
  const selectionAt = insight ? insight.at : null;
  const card = navOn && !cardOff && activeRoute && nav.state.route?.id === activeRoute.id ? navCard(activeRoute, greenRoute, fastRoute) : null;
  const proof = (
    <div className="proof" role="note" aria-label="Data behind this map">
      <p className="proof-data">
        <b>
          {CAMPAIGN.rides} rides, {CAMPAIGN.km} km
        </b>
        , {CAMPAIGN.from} to {CAMPAIGN.to}
      </p>
      <p className="proof-promise">No app. No sign up. No personal tracking.</p>
    </div>
  );

  return (
    <div className={`page${navOn ? " is-nav" : ""}`}>
      <AppNav />

      <div
        ref={appRef}
        className={`mapapp${navOn ? " is-nav" : ""}${insight ? " has-card" : ""}${mapPick && !navOn ? " is-picking" : ""}${sheetFull ? " is-full" : ""}${introOpen ? " has-intro" : ""}`}
      >
        {introOpen ? (
          <section className="intro-card" aria-labelledby="headline">
            <button type="button" id="intro-close" className="intro-x" aria-label="Close welcome" onClick={closeIntro}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
            <h1 id="headline">Find a cooler, safer way through Heilbronn</h1>
            <p className="tagline">Cooler, cleaner, and safer streets for Heilbronn</p>
            {proof}
            <button type="button" className="btn intro-go" onClick={closeIntro}>
              Show me the map
            </button>
          </section>
        ) : (
          <h1 id="headline" className="sr-only">
            Find a cooler, safer way through Heilbronn
          </h1>
        )}

        <div className="planner trip-card" role="group" aria-label="Plan a trip" ref={tripRef} data-map-cover="top">
          <div className="trip">
            <div className="trip-rows">
              <button type="button" id="trip-start" className="trip-row" aria-haspopup="dialog" aria-label={`From: ${start.name}. Change start`} onClick={() => setPicker("start")} disabled={navOn}>
                <span className="trip-pin" aria-hidden="true">A</span>
                <span className="trip-text">{start.name}</span>
              </button>
              <button type="button" id="trip-end" className="trip-row" aria-haspopup="dialog" aria-label={`To: ${end.name}. Change end`} onClick={() => setPicker("end")} disabled={navOn}>
                <span className="trip-pin" aria-hidden="true">B</span>
                <span className="trip-text">{end.name}</span>
              </button>
            </div>
            <button
              type="button"
              className="swap"
              aria-label="Swap start and end"
              disabled={navOn}
              onClick={() => {
                setStart(end);
                setEnd(start);
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M7 4v14m0 0l-3-3m3 3l3-3M17 20V6m0 0l-3 3m3-3l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="modes" role="radiogroup" aria-label="How do you travel?" onKeyDown={modeKey}>
              {(["bike", "foot"] as const).map((m) => (
                <button
                  key={m}
                  id={`mode-${m}`}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  aria-label={m === "bike" ? "Bike" : "Walk"}
                  title={m === "bike" ? "Bike" : "Walk"}
                  tabIndex={mode === m ? 0 : -1}
                  className="mode"
                  onClick={() => setMode(m)}
                  disabled={navOn}
                >
                  {m === "bike" ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="5.5" cy="16.5" r="3.5" />
                        <circle cx="18.5" cy="16.5" r="3.5" />
                        <path d="M5.5 16.5L9 9h7l2.5 7.5M9 9l3.5 7.5H5.5M14 6h2.5l-.5 3" />
                      </g>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="13" cy="4" r="2" fill="currentColor" stroke="none" />
                        <path d="M10 21l2-6-2.5-3 1-5 3 3.5h3M12 15l3 6M9.5 8L7 12" />
                      </g>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
          {picker && (
            <PlacePicker
              key={picker}
              which={picker}
              onPick={(p) => {
                choose(picker, p);
                closePicker(picker);
              }}
              onMap={() => chooseOnMap(picker)}
              onClose={() => closePicker(picker)}
            />
          )}
        </div>

        <section className="mapzone" id="map" aria-label="Map">
          <div className={`mapframe${insight ? " has-card" : ""}${navOn ? " is-nav" : ""}${mapPick && !navOn ? " is-picking" : ""}`}>
            <MapView
              resetKey={resetKey}
              layers={layers}
              danger={danger}
              cityTrees={cityTrees}
              start={start}
              end={end}
              routes={routes}
              selectedRouteId={activeRouteId}
              selection={selection}
              selectionAt={selectionAt}
              nav={navView}
              icons={icons}
              onMapReady={onMapReady}
              onSelect={setSelection}
              onRouteSelect={setSelectedRouteId}
              onPick={pickOnMap}
              pickFor={navOn ? null : mapPick}
              onUserPan={() => setFollow(false)}
            />

            {navOn ? (
              <NavPanel
                state={nav.state}
                mode={mode}
                endName={end.name}
                follow={follow}
                onRecentre={() => setFollow(true)}
                onMute={nav.setMuted}
                onReroute={nav.reroute}
                onWhole={() => {
                  setFollow(false);
                  setResetKey((k) => k + 1);
                }}
                card={card}
                onDismissCard={() => setCardOff(true)}
                onEnd={() => {
                  nav.stop();
                  setFollow(true);
                }}
              />
            ) : (
              <>
                {mapPick ? (
                  <div className="map-pickbar">
                    <p role="status">Tap the map to set the {mapPick === "start" ? "start (A)" : "end (B)"}.</p>
                    <button type="button" onClick={() => setMapPick(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
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
                )}
                {layers.danger && dangerState === "error" && <p className="map-msg">Close pass points could not be loaded from ATRAI right now. Tap the layer again to retry.</p>}

                <div className="map-ctrls" role="group" aria-label="Map controls">
                  <button type="button" id="about-btn" className="map-btn" aria-label="About GrünRoute" title="About GrünRoute" onClick={openIntro}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="map-btn"
                    aria-label="Reset map view"
                    title="Reset map view"
                    onClick={() => {
                      setSelection(null);
                      setResetKey((k) => k + 1);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {!insight && (
                    <button
                      type="button"
                      className="map-btn legend-toggle"
                      aria-expanded={legendOpen}
                      aria-controls="map-legend"
                      aria-label={legendOpen ? "Hide legend" : "Show legend"}
                      title="Legend"
                      onClick={() => setLegendOpen((o) => !o)}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path d="M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>

                {insight ? (
                  <InfoCard insight={insight} onClose={() => setSelection(null)} />
                ) : (
                  <div className={`map-legend${legendOpen ? " is-open" : ""}`} id="map-legend" aria-label="Map legend">
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
                      <li>
                        <i className="line line-chev" aria-hidden="true" />
                        Arrows show the way
                      </li>
                    </ul>
                    {iconKinds.length > 0 && (
                      <>
                        <p className="legend-title legend-sub">Along your route, zoom in</p>
                        <ul>
                          {iconKinds.map((k) => (
                            <li key={k}>
                              <IconBadge kind={k} /> {ICON_NAME[k]}
                            </li>
                          ))}
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
                )}
              </>
            )}
          </div>
        </section>

        <section
          ref={sheetRef}
          className="sheet-panel"
          id="panel"
          aria-labelledby="routes-title"
          data-map-cover="bottom"
          onKeyDown={(e) => {
            if (e.key === "Escape" && sheetFull && !wide) {
              setSheet(false);
              handleRef.current?.focus();
            }
          }}
        >
          <button
            ref={handleRef}
            type="button"
            className="sheet-handle"
            aria-expanded={sheetFull}
            aria-controls="sheet-more"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onClick={handleClick}
          >
            <span className="sheet-grab" aria-hidden="true" />
            <span className="sheet-handle-text">{sheetFull ? "Show less" : "Details"}</span>
          </button>
          <div className="sheet-scroll" ref={scrollRef}>
            <div className="sheet-peek" ref={peekRef}>
              <h2 id="routes-title" className="sr-only">
                Your routes
              </h2>
              <div className={`picks${routes.length > 2 ? " is-three" : ""}`} role="radiogroup" aria-label="Route options" aria-busy={routeState === "loading"}>
                {routeState === "loading" && (
                  <>
                    <div className="pick pick-skel" aria-hidden="true" />
                    <div className="pick pick-skel" aria-hidden="true" />
                    <p className="sr-only" aria-live="polite">
                      Finding routes...
                    </p>
                  </>
                )}
                {routeState === "error" && (
                  <div className="pick-error">
                    <p>The route service did not answer. Check your connection and try again.</p>
                    <button type="button" className="btn btn-quiet" onClick={() => setRouteTry((n) => n + 1)}>
                      Try again
                    </button>
                  </div>
                )}
                {routeState === "ok" &&
                  routes.map((r) => {
                    const sel = r.id === activeRouteId;
                    const isGreen = r.label === "green" || r.label === "both";
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        className={`pick${isGreen ? " pick-green" : ""}${sel ? " is-selected" : ""}`}
                        onClick={() => setSelectedRouteId(r.id)}
                        disabled={navOn}
                      >
                        <span className="pick-name">{ROUTE_NAME[r.label]}</span>
                        <span className="pick-time">
                          <b>{r.metrics.min} min</b> {r.metrics.km.toLocaleString("en-GB")} km
                        </span>
                        <span className="pick-why">{pickReason(r, greenRoute, fastRoute)}</span>
                      </button>
                    );
                  })}
              </div>

              {routeState === "ok" && activeRoute && !navOn && (
                <button type="button" className="btn btn-go" onClick={startDirections}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M12 2l7 19-7-4-7 4z" fill="currentColor" />
                  </svg>
                  Start directions
                </button>
              )}
              {navOn && (
                <p className="go-on" role="status">
                  Directions are on. Look at the map, or tap End to stop.
                </p>
              )}
              <p className="peek-proof">
                <b>
                  {CAMPAIGN.rides} rides, {CAMPAIGN.km} km
                </b>
                , {CAMPAIGN.from} to {CAMPAIGN.to}. <span>No app. No sign up. No personal tracking.</span>
              </p>
            </div>

            <div className="sheet-more" id="sheet-more" inert={!sheetFull && !wide}>
              <div className="panel-head">
                <p>
                  {start.name} to {end.name}, {mode === "bike" ? "by bike" : "on foot"}.
                </p>
              </div>
              {routeState === "ok" && (
                <p className="route-compare" aria-live="polite">
                  {compare ?? "The fastest route is also the greenest option found for this trip."}
                </p>
              )}
              {routeState === "ok" && activeRoute && (
                <div className="route-detail">
                  <h3>{ROUTE_NAME[activeRoute.label]}</h3>
                  <p className="route-stats">
                    <span title={activeRoute.metrics.treeSource === "city" ? "City register trees within 20 m, per km" : "Mapped trees within 25 m, per km"}>
                      <i className="dot dot-tree" aria-hidden="true" /> {activeRoute.metrics.treesPerKm} trees/km
                    </span>
                    <span title="Heat walk compared with the same walk">
                      <i className="dot dot-heat" aria-hidden="true" /> {activeRoute.metrics.heat.avg === null || activeRoute.metrics.heat.covered < 0.2 ? "No heat data" : fmtAnomaly(activeRoute.metrics.heat.avg)}
                    </span>
                    {mode === "bike" && (
                      <span title="ATRAI close pass points within 15 m">
                        <i className="dot dot-danger" aria-hidden="true" /> {activeRoute.metrics.danger === null ? "..." : `${activeRoute.metrics.danger} close ${activeRoute.metrics.danger === 1 ? "pass" : "passes"}`}
                      </span>
                    )}
                  </p>
                  <ul className="route-tips">
                    {routeTips(activeRoute, mode).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="sheet-privacy">Spoken turns and sounds, like a map app. Your location stays on this phone. Only the start and end points go to the route service.</p>

              <details className="route-how">
                <summary>How routes are chosen</summary>
                <p>
                  Routes come from OSRM, a public router on OpenStreetMap roads and paths. We ask for the direct route and a few detours, then compare them on trees within 20 m and big crowns (Stadt Heilbronn tree register),
                  heat walk spots along the way (Heat Island Summer School, {HEAT_WALK.dates})
                  and close pass points within 15 m (ATRAI). GrünRoute is the best of these that is at most
                  about 40 percent or 8 minutes slower. This is a simple rule, not an official rating.
                </p>
                <p>
                  Names like &quot;Shady route&quot; or &quot;Fewer close passes&quot; come from the same simple rule: the part where the route wins most against the fastest route. The icons along the route show big register
                  trees, heat walk spots warmer than the walk median, close pass points, drinking water, and public sensor boxes.
                </p>
                <p>Only your start and end points go to the router to draw the line. During directions your location and speed are used on this phone only. Nothing is stored, and no one tracks your trip.</p>
              </details>

              <div className="also">
                <Link href="/play" className="also-card">
                  <b>Hot or not?</b>
                  <span>Guess which spot was warmer on the summer heat walks.</span>
                </Link>
                <Link href="/measure" className="also-card">
                  <b>Help measure</b>
                  <span>Ride a short mission where the city has little data.</span>
                </Link>
              </div>

              <section className="sheet-about" aria-labelledby="about-title">
                <h2 id="about-title">About GrünRoute</h2>
                <p className="tagline">Cooler, cleaner, and safer streets for Heilbronn</p>
                {proof}
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
                {liveState === "offline" && <p className="live-msg">No live values right now. The map uses checked historical data.</p>}
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
                    <dt>Streets with enough data</dt>
                    <dd>{enoughCount != null ? nf(enoughCount) : dataState === "error" ? "Not loaded" : "Loading"}</dd>
                  </div>
                  <div>
                    <dt>Measured passes</dt>
                    <dd>{count(data?.meta, "passes", dataState === "error")}</dd>
                  </div>
                  <div>
                    <dt>Public trees, city register</dt>
                    <dd>{count(data?.meta, "trees", dataState === "error")}</dd>
                  </div>
                  <div>
                    <dt>Heat walk readings</dt>
                    <dd>{HEAT_WALK.points.toLocaleString("en-GB")}</dd>
                  </div>
                  <div>
                    <dt>Bike or foot injury crashes, 2021 to 2025</dt>
                    <dd>{count(data?.meta, "crashes", dataState === "error")}</dd>
                  </div>
                </dl>
                {hero && (
                  <p className="facts-hero">
                    <b>{hero.big}</b> {hero.text} {hero.caveat} {RULE_150}
                  </p>
                )}
                <p className="facts-source">Sources: {SOURCES.map((x) => x.name).join(", ")}. Details below.</p>
              </section>

              <section className="more-info" aria-label="More about GrünRoute">
                <details>
                  <summary>What GrünRoute does</summary>
                  <p>
                    GrünRoute Heilbronn uses existing bike, school, and heat data to show cooler, cleaner, and safer routes through Heilbronn, with no app, sign up, or personal tracking. The same data helps the city decide which streets
                    to fix first.
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
                  <p>Bike data exists only where riders rode. Heat walks happen in summer only. A street with little data is not shown as good or bad, it just has little data.</p>
                </details>
                <details>
                  <summary>Honest limits</summary>
                  <p>
                    Low cost sensors are affected by humidity, calibration, and ageing, so this is a screening tool, not a legal measurement. Few overtakes can mean few riders, not a safe street. Live directions follow OpenStreetMap
                    routes, so always watch the road and follow traffic signs.
                  </p>
                </details>
              </section>

              <SiteFooter />
            </div>
          </div>
        </section>
      </div>

      {fair && <FairTour qr={qr} hero={hero} compare={compare} green={greenRoute} fast={fastRoute} onStop={() => setFair(false)} />}
    </div>
  );
}
