"use client";
// The people app home: plan a trip, compare a cooler route with the fastest,
// and follow it with live directions.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppNav from "./AppNav";
import SiteFooter from "./SiteFooter";
import InfoCard from "./InfoCard";
import NavPanel from "./NavPanel";
import PlacePicker from "./PlacePicker";
import FairTour from "./FairTour";
import { CAMPAIGN, PLACES } from "../lib/data";
import { fmtAnomaly, type DangerPoint } from "../lib/geo";
import { HEAT_WALK } from "../lib/heat-walks";
import { insightFor, type Selection } from "../lib/insights";
import { MIN_SEGMENT_M, aggregateStreets, enoughData, percentiles, presetById, rankSegments } from "../lib/priority";
import { RULE_150, heroFact, loadSegments, type SegmentData } from "../lib/segments";
import { SOURCES } from "../lib/sources";
import { fetchHeilbronnBoxes, type LiveReading } from "../lib/live";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { loadDangerPoints } from "../lib/atrai";
import { fetchRouteOptions, rankRoutes, type Mode, type RawRoute, type RouteOption } from "../lib/routing";
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
  const [layers, setLayers] = useState<Layers>({ trees: false, heat: false, danger: false });
  const [legendOpen, setLegendOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [fair, setFair] = useState(false);

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
  const [follow, setFollow] = useState(true);

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
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const a = placeFromQuery(q.get("from"), q.get("fn"), "Start from the link");
      const b = placeFromQuery(q.get("to"), q.get("tn"), "End from the link");
      if (a) setStart(a);
      if (b) setEnd(b);
      if (q.get("mode") === "foot") setMode("foot");
      if (q.get("fair") === "1") setFair(true);
    }, 0);
    return () => clearTimeout(t);
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

  function scrollToMap() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("map")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
    setFollow(true);
    nav.start(activeRoute);
    // Wait for the directions layout, which is shorter, before scrolling.
    // On wide screens the map is sticky, so the top of the page shows it whole.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (window.matchMedia("(min-width: 1024px)").matches) window.scrollTo({ top: 0 });
        else scrollToMap();
      })
    );
  }

  const navView: NavView | null = navOn ? { route: (nav.state.route ?? activeRoute)?.coords ?? [], pos: nav.state.pos, follow } : null;
  const selectionAt = insight ? insight.at : null;

  return (
    <div className={`page${navOn ? " is-nav" : ""}`}>
      <AppNav />

      <div className="stage">
        <section className="intro" aria-labelledby="headline">
          <h1 id="headline">Find a cooler, safer way through Heilbronn</h1>
          <p className="tagline">Cooler, cleaner, and safer streets for Heilbronn</p>
          <div className="proof" role="note" aria-label="Data behind this map">
            <p className="proof-data">
              <b>
                {CAMPAIGN.rides} rides, {CAMPAIGN.km} km
              </b>
              , {CAMPAIGN.from} to {CAMPAIGN.to}
            </p>
            <p className="proof-promise">No app. No sign up. No personal tracking.</p>
          </div>

          <div className="planner" aria-label="Plan a trip">
            <div className="modes" role="radiogroup" aria-label="How do you travel?">
              {(["bike", "foot"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className="mode" onClick={() => setMode(m)} disabled={navOn}>
                  {m === "bike" ? "By bike" : "On foot"}
                </button>
              ))}
            </div>
            <div className="trip">
              <div className="trip-field trip-from">
                <span className="trip-pin" aria-hidden="true">A</span>
                <button type="button" id="trip-start" className="trip-btn" aria-label={`Start: ${start.name}. Change start`} aria-expanded={picker === "start"} onClick={() => setPicker(picker === "start" ? null : "start")} disabled={navOn}>
                  {start.name}
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
              <div className="trip-field trip-to">
                <span className="trip-pin" aria-hidden="true">B</span>
                <button type="button" id="trip-end" className="trip-btn" aria-label={`End: ${end.name}. Change end`} aria-expanded={picker === "end"} onClick={() => setPicker(picker === "end" ? null : "end")} disabled={navOn}>
                  {end.name}
                </button>
              </div>
            </div>
            {picker && <PlacePicker key={picker} which={picker} onPick={(p) => { choose(picker, p); closePicker(picker); }} onClose={() => closePicker(picker)} />}
            <p className="trip-hint">Search, use your location, or tap the map.</p>
          </div>
        </section>

        <section className="mapzone" id="map" aria-label="Map">
          <div className={`mapframe${insight ? " has-card" : ""}${navOn ? " is-nav" : ""}`}>
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
              onMapReady={onMapReady}
              onSelect={setSelection}
              onRouteSelect={setSelectedRouteId}
              onPick={pickOnMap}
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
                onEnd={() => {
                  nav.stop();
                  setFollow(true);
                }}
              />
            ) : (
              <>
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
              </>
            )}
          </div>
          {!navOn && layers.danger && dangerState === "error" && <p className="map-msg">Close pass points could not be loaded from ATRAI right now. Tap the layer again to retry.</p>}
        </section>

        <section className="panel" id="panel" aria-label="Route options">
          <div className="panel-head">
            <h2>Your routes</h2>
            <p>
              {start.name} to {end.name}, {mode === "bike" ? "by bike" : "on foot"}.
            </p>
          </div>

          {/* Start sits right under the map on phones and near the top of the panel on wide screens, so it is easy to find once routes load. */}
          {routeState === "ok" && activeRoute && !navOn && (
            <div className="go">
              <button type="button" className="btn btn-go" onClick={startDirections} aria-describedby="go-route">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M12 2l7 19-7-4-7 4z" fill="currentColor" />
                </svg>
                Start directions
              </button>
              <p className="go-route" id="go-route">
                <b>{ROUTE_NAME[activeRoute.label]}</b>, {activeRoute.metrics.min} min, {activeRoute.metrics.km.toLocaleString("en-GB")} km.{routes.length > 1 ? " Pick another route below." : ""}
              </p>
              <p>Spoken turns and sounds, like a map app. Your location stays on this phone. Only the start and end points go to the route service.</p>
            </div>
          )}
          {navOn && (
            <p className="go-on" role="status">
              Directions are on. Look at the map above, or tap End to stop.
            </p>
          )}
          {routeState === "ok" && (
            <p className="route-compare" aria-live="polite">
              {compare ?? "The fastest route is also the greenest option found for this trip."}
            </p>
          )}
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
                    <button type="button" role="radio" aria-checked={sel} className="route-main" onClick={() => setSelectedRouteId(r.id)} disabled={navOn}>
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
          <details className="route-how">
            <summary>How routes are chosen</summary>
            <p>
              Routes come from OSRM, a public router on OpenStreetMap roads and paths. We ask for the direct route and a few detours, then compare them on trees within 20 m and big crowns (Stadt Heilbronn tree register),
              heat walk spots along the way (Heat Island Summer School, {HEAT_WALK.dates})
              and close pass points within 15 m (ATRAI). GrünRoute is the best of these that is at most
              about 40 percent or 8 minutes slower. This is a simple rule, not an official rating.
            </p>
            <p>Only your start and end points go to the router to draw the line. During directions your location is used on this phone only. Nothing is stored, and no one tracks your trip.</p>
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
            GrünRoute Heilbronn uses existing bike, school, and heat data to show cooler, cleaner, and safer routes through Heilbronn, with no app, sign up, or personal tracking. The same data helps the city decide which streets to
            fix first.
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

      {fair && <FairTour qr={qr} hero={hero} compare={compare} green={greenRoute} fast={fastRoute} onStop={() => setFair(false)} />}
    </div>
  );
}
