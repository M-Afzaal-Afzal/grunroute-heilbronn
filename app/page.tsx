"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BANDS, CAMPAIGN, PLACES, STREETS, bandFor, type PlaceKey } from "../lib/data";
import { LogoMark, Wordmark } from "../components/brand/Logo";
import InfoCard from "../components/InfoCard";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../components/ui/select";
import { fmtAnomaly, type DangerPoint } from "../lib/geo";
import { HEAT_WALK } from "../lib/heat-walks";
import { insightFor, shadeGaps, streetContext, type Selection } from "../lib/insights";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { loadDangerPoints } from "../lib/atrai";
import { fetchRouteOptions, rankRoutes, type Mode, type RawRoute, type RouteOption } from "../lib/routing";
import type { Layers, MapPlace } from "../components/MapView";

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="map map-loading" aria-hidden="true" />,
});

type View = "city" | "people";
type LiveState = "loading" | "ok" | "stale" | "offline";
type LiveValue = { temp: string | null; pm10: string | null; pm25: string | null; box: string; time: string };
type BoxDetail = {
  name?: string;
  sensors?: Array<{ title?: string; unit?: string; lastMeasurement?: { value?: string | number; createdAt?: string } | string | null }>;
};
type LoadState = "idle" | "loading" | "ok" | "error";

const FIX_FILTERS = [
  { value: "all", label: "All" },
  { value: "bike", label: "Bike lane" },
  { value: "calming", label: "Traffic calming" },
] as const;

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
  const [activeRank, setActiveRank] = useState(1);
  const [focusRank, setFocusRank] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [fixFilter, setFixFilter] = useState<string>("all");
  const [resetKey, setResetKey] = useState(0);
  const [openCard, setOpenCard] = useState<number | null>(null);
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return STREETS.filter((s) => {
      const okQ = !q || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q) || s.fix.toLowerCase().includes(q);
      const okF = fixFilter === "all" || s.fixType === fixFilter;
      return okQ && okF;
    });
  }, [search, fixFilter]);

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

  // City tree register (43,031 trees), loaded after the first paint.
  useEffect(() => {
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
  }, []);

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

  const routes = useMemo(() => rankRoutes(rawRoutes, danger, cityTrees), [rawRoutes, danger, cityTrees]);
  const activeRouteId = selectedRouteId && routes.some((r) => r.id === selectedRouteId) ? selectedRouteId : (routes[0]?.id ?? null);
  const greenRoute = routes.find((r) => r.label === "green" || r.label === "both");
  const fastRoute = routes.find((r) => r.label === "fastest" || r.label === "both");

  const insight = useMemo(() => (selection ? insightFor(selection, danger, cityTrees) : null), [selection, danger, cityTrees]);
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
      let temp: string | null = null;
      let pm10: string | null = null;
      let pm25: string | null = null;
      let tempAt = "";
      let pm10At = "";
      let pm25At = "";
      let newest = "";
      let boxName = "";
      details.forEach((box) => {
        if (!box) return;
        (box.sensors || []).forEach((sn) => {
          const lm = sn.lastMeasurement;
          if (!lm || typeof lm === "string" || lm.value == null || !lm.createdAt) return;
          const t = (sn.title || "").toLowerCase();
          const text = `${String(lm.value)} ${sn.unit || ""}`.trim();
          const at = new Date(lm.createdAt);
          if ((t.includes("temp") || t.includes("temperatur")) && (!tempAt || at > new Date(tempAt))) {
            temp = text;
            tempAt = lm.createdAt;
          }
          if ((t.includes("pm10") || t.includes("pm 10")) && (!pm10At || at > new Date(pm10At))) {
            pm10 = text;
            pm10At = lm.createdAt;
          }
          if ((t.includes("pm2") || t.includes("pm 2")) && (!pm25At || at > new Date(pm25At))) {
            pm25 = text;
            pm25At = lm.createdAt;
          }
          if (!newest || at > new Date(newest)) {
            newest = lm.createdAt;
            boxName = box.name || "openSenseMap box";
          }
        });
      });
      clearTimeout(timeout);
      if (!temp && !pm10 && !pm25) throw new Error("No recent temperature or dust value");
      setLive({ temp, pm10, pm25, box: boxName, time: formatTime(newest) });
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

  useEffect(() => {
    // Read the first snapshot after mount, outside the render pass.
    const t = setTimeout(fetchLive, 0);
    return () => clearTimeout(t);
  }, []);

  function selectStreet(rank: number) {
    setActiveRank(rank);
    setFocusRank(rank);
    setView("city");
    setSelection({ kind: "street", rank });
  }

  function showOnMap(rank: number) {
    selectStreet(rank);
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
  const active = STREETS.find((s) => s.rank === activeRank);
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
              activeRank={activeRank}
              focusRank={focusRank}
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
              onStreetSelect={selectStreet}
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
                setFocusRank(null);
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
              <div className="map-legend" aria-label="Map legend">
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
                    </ul>
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
            )}
          </div>
          {layers.danger && dangerState === "error" && <p className="map-msg">Close pass points could not be loaded from ATRAI right now. Tap the layer again to retry.</p>}
        </section>

        <section className="panel" id="panel" role="tabpanel" aria-label={view === "city" ? "Fix first list" : "Plan a trip"}>
          {view === "city" ? (
            <>
              <div className="panel-head">
                <h2>Fix first list</h2>
                <p>Ranked by how close cars pass bikes. ATRAI sample, not a full city ranking.</p>
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
                <div className="chips" role="group" aria-label="Filter by fix type">
                  {FIX_FILTERS.map((f) => (
                    <button key={f.value} type="button" className="chip" aria-pressed={fixFilter === f.value} onClick={() => setFixFilter(f.value)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="count" aria-live="polite">
                {filtered.length} of {STREETS.length} streets
              </p>

              {filtered.length === 0 ? (
                <div className="empty">
                  <p>No street matches this search.</p>
                  <button type="button" className="btn btn-quiet" onClick={() => { setSearch(""); setFixFilter("all"); }}>
                    Clear search
                  </button>
                </div>
              ) : (
                <ol className="streets">
                  {filtered.map((s) => {
                    const band = bandFor(s.score);
                    const isActive = s.rank === activeRank;
                    const isOpen = openCard === s.rank;
                    const ctx = isOpen ? streetContext(s.rank, danger, cityTrees) : null;
                    return (
                      <li key={s.rank} className={`street${isActive ? " is-active" : ""}`} style={{ ["--band" as string]: band.color }}>
                        <button type="button" className="street-main" aria-current={isActive ? "true" : undefined} onClick={() => showOnMap(s.rank)}>
                          <span className="street-rank" aria-hidden="true">{s.rank}</span>
                          <span className="street-body">
                            <span className="street-name">{s.name}</span>
                            <span className="street-area">{s.area}</span>
                            <span className="street-reason">{s.reason}</span>
                          </span>
                          <span className="street-score">
                            <b>{s.score}</b>
                            <span className="sr-only"> out of 100, {band.label}</span>
                            <span className="score-bar" aria-hidden="true">
                              <span style={{ width: `${s.score}%` }} />
                            </span>
                          </span>
                        </button>
                        <div className="street-foot">
                          {s.weak ? (
                            <span className="badge badge-weak">Weak evidence, ground check first</span>
                          ) : (
                            <span className="badge">{s.support} data support</span>
                          )}
                          <button type="button" className="more" aria-expanded={isOpen} onClick={() => setOpenCard(isOpen ? null : s.rank)}>
                            {isOpen ? "Less" : "More"}
                          </button>
                        </div>
                        {isOpen && (
                          <div className="street-detail">
                            <p>
                              <b>Suggested fix:</b> {s.fix}.
                            </p>
                            <p>
                              <b>Evidence:</b> {s.detail}. {s.points}.
                            </p>
                            {ctx && (
                              <p>
                                <b>Context:</b> {ctx.trees} {ctx.treeSource === "city" ? "city trees" : "mapped trees"} within 30 m
                                {ctx.street && ctx.street.count ? `, ${ctx.street.count} register trees on the whole street` : ""}.{" "}
                                {ctx.heat.avg === null ? "No heat walk passed here." : `Heat walk ${fmtAnomaly(ctx.heat.avg)} compared with the same walk.`}
                                {ctx.close !== null ? ` ${ctx.close} close pass points within 20 m.` : ""} Context does not change the score.
                              </p>
                            )}
                            {s.weak && <p className="rule">Weak evidence never gets an automatic fix. Check on the ground first, then decide with official data.</p>}
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
                  <li>Fix score is 100 minus half the average passing gap in cm. A closer pass gives a higher score.</li>
                  <li>Trees, heat, dust, and road roughness did not change these scores. Trees and heat walks are shown as context only.</li>
                  <li>Turmstraße is not ranked. No overtaking segment for it was found in this sample.</li>
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
            <p>Bike sensors record passing distance, dust, and heat on normal rides. School stations measure day and night.</p>
          </li>
          <li>
            <h3>Match</h3>
            <p>Each reading joins the nearest street, at most 20 m away, and is averaged per street.</p>
          </li>
          <li>
            <h3>Rank</h3>
            <p>Each street gets a fix score from 0 to 100. Streets with little data are marked, never hidden.</p>
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
          <p>Only data from the organisers and partners. Nothing is filled in to close a gap.</p>
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
            <dt>Hours of riding</dt>
            <dd>{CAMPAIGN.hours}</dd>
          </div>
          <div>
            <dt>Riders</dt>
            <dd>{CAMPAIGN.riders}</dd>
          </div>
          <div>
            <dt>Overtaking segments</dt>
            <dd>1,388</dd>
          </div>
          <div>
            <dt>School station readings</dt>
            <dd>2,012,544</dd>
          </div>
          <div>
            <dt>Public trees, city register</dt>
            <dd>43,031</dd>
          </div>
          <div>
            <dt>Tree species in register</dt>
            <dd>678</dd>
          </div>
          <div>
            <dt>Heat walk readings</dt>
            <dd>{HEAT_WALK.points.toLocaleString("en-GB")}</dd>
          </div>
        </dl>
        <p className="facts-source">
          ATRAI campaign Heilbronn, 5 Dec 2025 to 26 Oct 2026. Also used: openSenseMap, Heat Island Summer School 2026 heat walks ({HEAT_WALK.dates}), the Stadt Heilbronn tree register (Baumkataster, Stand 1 Jan 2026, dl-de/by-2-0), OpenStreetMap drinking water, and OSRM routing on OpenStreetMap.
        </p>
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
          <p>
            overtaking_distance_heilbronn: 1,388 segments, used here as a sample of the first 100 segments, with average overtaking distance in cm and point counts. bumpy_roads_heilbronn: 9,599 segments with roughness, checked but not joined to these streets. danger_zones_heilbronn: 7,095 points with a risk index from 0 to 1, not part of the fix score, used as an optional map layer and to compare routes. danger_zones_PM_heilbronn: 183,030 points, not used for scores here. road_network_heilbronn and bike_road_network_heilbronn: 34,243 segments each. osem_home_data_heilbronn: 2,012,544 points with temperature and dust, used only in the sensor snapshot through public openSenseMap boxes. Heat walks from Heat Island Summer School 2026: 61,546 points from 31 recordings, {HEAT_WALK.dates}. Each reading is compared with the middle value of its own walk, then grouped into about 50 m spots, so the map shows warmer and cooler spots, not raw temperatures from different times of day. Heat walks are a context layer only. Baumkataster of Stadt Heilbronn, Stand 1 Jan 2026: 43,031 public trees with species, trunk girth, crown width, street, and district, licence dl-de/by-2-0. It covers public trees only, not private gardens. Groups of trees are one entry, and trees of other public bodies often carry a default crown of 2 m. OpenStreetMap: 6 drinking water points, and 1,903 mapped trees used only if the register cannot load.
          </p>
        </details>
        <details>
          <summary>Coverage and timing</summary>
          <p>
            Bike data exists only where riders rode. School stations run day and night. Heat walks happen in summer only. Compare the same season, not summer heat with winter bike data, and note school holidays for school routes.
          </p>
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
        <p className="footer-fine">Map data from OpenStreetMap contributors. Street values are an ATRAI sample, not a full city ranking, and need checking with official city data before any decision.</p>
      </footer>

      {active && view === "city" && (
        <p className="sr-only" aria-live="polite">
          Showing {active.name} on the map.
        </p>
      )}
    </div>
  );
}
