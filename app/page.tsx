"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PLACES, STREETS, type PlaceKey } from "../lib/data";
import type { Layers } from "../components/MapView";
import { Wordmark } from "../components/brand/Logo";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { List, ListItem, ListItemContent } from "../components/ui/list";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { SegmentedTabs } from "../components/ui/tabs";
import { BottomSheet } from "../components/ui/sheet";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

type LiveState = "loading" | "ok" | "stale" | "offline";
type LiveValue = { temp: string | null; pm10: string | null; pm25: string | null; box: string; time: string };

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

type BoxDetail = {
  name?: string;
  sensors?: Array<{ title?: string; unit?: string; lastMeasurement?: { value?: string | number; createdAt?: string } | string | null }>;
};

export default function Home() {
  const [view, setView] = useState<"city" | "people">("city");
  const [activeRank, setActiveRank] = useState(1);
  const [layers, setLayers] = useState<Layers>({ heat: true, dust: true, close: true });
  const [search, setSearch] = useState("");
  const [fixFilter, setFixFilter] = useState("all");
  const [start, setStart] = useState<PlaceKey>("station");
  const [end, setEnd] = useState<PlaceKey>("campus");
  const [resetKey, setResetKey] = useState(0);
  const [openCard, setOpenCard] = useState<Record<number, boolean>>({});
  const [liveState, setLiveState] = useState<LiveState>("loading");
  const [live, setLive] = useState<LiveValue | null>(null);
  const [liveNote, setLiveNote] = useState("Loading live data from api.opensensemap.org ...");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return STREETS.filter((s) => {
      const okQ = !q || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q) || s.fix.toLowerCase().includes(q);
      const okF =
        fixFilter === "all" ||
        s.fixType === fixFilter ||
        (fixFilter === "calming" && (s.fix.toLowerCase().includes("calming") || s.fix.toLowerCase().includes("30 zone")));
      return okQ && okF;
    });
  }, [search, fixFilter]);

  async function fetchLive() {
    setLiveState("loading");
    setLiveNote("Loading live data from api.opensensemap.org ...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const listRes = await fetch("https://api.opensensemap.org/boxes?bbox=8.95,49.02,9.40,49.28", { signal: controller.signal });
      if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
      const list = (await listRes.json()) as Array<{ _id?: string; updatedAt?: string }>;
      // The list endpoint returns lastMeasurement as an ID only, not a value.
      // So fetch detail for the 5 most recently updated boxes, where each
      // sensor carries a real value and timestamp. This was verified live.
      const newestBoxes = [...list]
        .filter((b) => b._id)
        .sort((a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime())
        .slice(0, 5);
      if (newestBoxes.length === 0) throw new Error("No boxes found");
      const details = await Promise.all(
        newestBoxes.map(async (b) => {
          try {
            const r = await fetch(`https://api.opensensemap.org/boxes/${b._id}`, { signal: controller.signal });
            if (!r.ok) return null;
            return (await r.json()) as BoxDetail;
          } catch {
            return null;
          }
        })
      );
      let temp: LiveValue["temp"] = null;
      let pm10: LiveValue["pm10"] = null;
      let pm25: LiveValue["pm25"] = null;
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
          if ((t.includes("temp") || t.includes("temperatur")) && (!tempAt || new Date(lm.createdAt) > new Date(tempAt))) {
            temp = text;
            tempAt = lm.createdAt;
          }
          if ((t.includes("pm10") || t.includes("pm 10")) && (!pm10At || new Date(lm.createdAt) > new Date(pm10At))) {
            pm10 = text;
            pm10At = lm.createdAt;
          }
          if ((t.includes("pm2") || t.includes("pm 2")) && (!pm25At || new Date(lm.createdAt) > new Date(pm25At))) {
            pm25 = text;
            pm25At = lm.createdAt;
          }
          if (!newest || new Date(lm.createdAt) > new Date(newest)) {
            newest = lm.createdAt;
            boxName = box.name || "openSenseMap box";
          }
        });
      });
      clearTimeout(timeout);
      if (!temp && !pm10 && !pm25) throw new Error("No recent temperature or dust value");
      setLive({ temp, pm10, pm25, box: boxName, time: formatTime(newest) });
      const stale = Date.now() - new Date(newest).getTime() > 2 * 60 * 60 * 1000;
      setLiveState(stale ? "stale" : "ok");
      setLiveNote(
        stale
          ? `Stale: newest live value is from ${formatTime(newest)}, more than 2 hours old, so this panel is grey. Historical data below is the decision source.`
          : `Updated: ${formatTime(newest)}. Source: api.opensensemap.org. Snapshot only, tap Refresh for a new snapshot.`
      );
    } catch {
      clearTimeout(timeout);
      setLiveState("offline");
      setLive(null);
      setLiveNote("Live data is not available right now, use the historical list below.");
    }
  }

  useEffect(() => {
    fetchLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleLayer(key: keyof Layers) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function swapPlaces() {
    setStart(end);
    setEnd(start);
  }

  function pickEnd(value: PlaceKey) {
    if (value === start) {
      setEnd(value === "campus" ? "marktplatz" : "campus");
    } else {
      setEnd(value);
    }
  }

  const sPlace = PLACES[start];
  const ePlace = PLACES[end];
  const approxKm = Math.max(
    0.8,
    Math.sqrt(Math.pow((ePlace.lng - sPlace.lng) * 85, 2) + Math.pow((ePlace.lat - sPlace.lat) * 111, 2))
  );
  const fastMin = Math.max(4, Math.round(approxKm / 0.28));
  const greenMin = fastMin + 3;

  return (
    <main className="wrap">
      <header className="slim-header">
        <Wordmark />
      </header>

      <section className="hero">
        <h1>Which street should Heilbronn fix first?</h1>
        <p className="tagline">Cooler, cleaner, and safer streets for Heilbronn.</p>
        <div className="proof-chip" role="note">
          <strong>2,281 rides</strong> <span>5,205 km</span> <span>Dec 2025 to Oct 2026</span> <span>No app. No sign up. No personal tracking.</span>
        </div>
        <SegmentedTabs
          label="Choose view"
          value={view}
          onChange={(v) => setView(v as "city" | "people")}
          options={[
            { value: "city", label: "For the city", hint: "Fix first list" },
            { value: "people", label: "For people", hint: "Find a better route" },
          ]}
        />
      </section>

      <div className="layout">
        <section className="mapcard">
          <div className="maphead">
            <b>{view === "city" ? "Fix first map, Heilbronn centre" : "Route map, Heilbronn"}</b>
            <span>OpenStreetMap. ATRAI sample, not a full city ranking.</span>
            <Button variant="outline" onClick={() => setResetKey((k) => k + 1)}>
              Reset view
            </Button>
          </div>
          <div className="layers" role="group" aria-label="Map layers">
            <b>LAYERS</b>
            <button type="button" className="layerbtn" aria-pressed={layers.heat} onClick={() => toggleLayer("heat")}>
              <i style={{ background: "#c2410c" }} /> Heat
            </button>
            <button type="button" className="layerbtn" aria-pressed={layers.dust} onClick={() => toggleLayer("dust")}>
              <i style={{ background: "#64748b" }} /> Dust
            </button>
            <button type="button" className="layerbtn" aria-pressed={layers.close} onClick={() => toggleLayer("close")}>
              <i style={{ background: "#991b1b" }} /> Close passes
            </button>
          </div>
          <MapView
            view={view}
            activeRank={activeRank}
            layers={layers}
            start={start}
            end={end}
            resetKey={resetKey}
            onStreetSelect={(rank) => {
              setActiveRank(rank);
              setView("city");
            }}
          />
          <div className="legend">
            {view === "city" ? (
              <>
                <span><i className="dot" style={{ background: "#b42318" }} /> Score 80 to 100, fix soon</span>
                <span><i className="dot" style={{ background: "#ca8a04" }} /> Score 50 to 79, plan next</span>
                <span><i className="dot" style={{ background: "#2e9e5b" }} /> Score below 50, check later</span>
                <span><i className="dot" style={{ background: "#991b1b" }} /> Close pass segment, ATRAI overtaking data</span>
              </>
            ) : (
              <>
                <span><i className="line" style={{ background: "#c2410c" }} /> Fastest route</span>
                <span><i className="line" style={{ background: "#2e9e5b" }} /> GrünRoute, cooler and safer</span>
                <span><i className="dot" style={{ background: "#0b4d2e" }} /> Start (A) and end (B)</span>
              </>
            )}
          </div>
        </section>

        <BottomSheet>
          {view === "city" ? (
            <>
              <div className="panelhead">
                <h2>Fix first list</h2>
                <p>
                  ATRAI sample, not a full city ranking. Ranked by overtaking distance only. Higher score means fix sooner. Tap Show on map to fly the map to a street.
                </p>
              </div>
              <div className="controls">
                <div className="searchrow">
                  <div className="gr-field">
                    <label htmlFor="streetSearch" className="gr-label">Search streets</label>
                    <Input id="streetSearch" type="search" placeholder="Type a street name" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Select id="fixFilter" label="Filter by fix type" value={fixFilter} onChange={(e) => setFixFilter(e.target.value)}>
                    <option value="all">All fix types</option>
                    <option value="trees">Trees and shade</option>
                    <option value="bike">Bike lane and safety</option>
                    <option value="calming">Traffic calming</option>
                    <option value="pavement">Pavement and green</option>
                  </Select>
                </div>
              </div>
              <p className="resultcount" aria-live="polite">
                {filtered.length} of {STREETS.length} streets shown.
              </p>
              {filtered.length === 0 && (
                <div className="empty">
                  No street matches this search or filter.
                  <div style={{ marginTop: 10 }}>
                    <Button variant="outline" onClick={() => { setSearch(""); setFixFilter("all"); }}>
                      Clear search and filter
                    </Button>
                  </div>
                </div>
              )}
              <List aria-label="Fix first list">
                {filtered.map((s) => (
                  <ListItem key={s.rank} active={s.rank === activeRank}>
                    <ListItemContent>
                      <span className="street-head">
                        <span className="rank">{s.rank}</span>
                        <span>
                          <span className="street-name">{s.name}</span>
                          <span className="area">{s.area}</span>
                        </span>
                        <span className="score">
                          <b>{s.score}</b>
                          <span>FIX SCORE / 100</span>
                        </span>
                      </span>
                      <span className="reason">{s.reason}</span>
                      <span className="fix"><b>Suggested fix:</b> {s.fix}</span>
                      <span className="meta">
                        {s.weak ? (
                          <Badge variant="destructive">WEAK EVIDENCE</Badge>
                        ) : (
                          <Badge variant="secondary">DATA SUPPORT: {s.support.toUpperCase()}</Badge>
                        )}
                      </span>
                      {s.weak && <span className="groundrule">Check on the ground first, no automatic fix for this street.</span>}
                      <span className="card-actions">
                        <Button variant="outline" onClick={() => setActiveRank(s.rank)}>
                          {s.rank === activeRank ? "Shown on map" : "Show on map"}
                        </Button>
                        <button
                          type="button"
                          className="detail-toggle"
                          aria-expanded={!!openCard[s.rank]}
                          onClick={() => setOpenCard((prev) => ({ ...prev, [s.rank]: !prev[s.rank] }))}
                        >
                          Details {openCard[s.rank] ? "hide" : "show"}
                          <span aria-hidden="true">{openCard[s.rank] ? " ^" : " v"}</span>
                        </button>
                      </span>
                      {openCard[s.rank] && (
                        <span className="detail">Based on {s.detail}. Coverage: {s.points}.</span>
                      )}
                    </ListItemContent>
                  </ListItem>
                ))}
              </List>
              <div className="notice">
                <b>Turmstrasse note:</b> Turmstrasse was in the old demo list, but no overtaking segment for it was found in the ATRAI sample checked, so it is not ranked here. Do not use the old demo score for it. Check on the ground first if it is added later with real values.
              </div>
              <div className="notice rule">
                <b>Decision rule:</b> A street with weak evidence never gets an automatic fix. It gets a check on the ground first, then a decision with official data.
              </div>
              <div className="notice">
                <b>Please note:</b> This is a screening tool to help the city choose where to look first. It is not an official legal measurement. Street values here come from the ATRAI overtaking sample shown, not a full city ranking. Route values in For people are demo, not provided data.
              </div>
            </>
          ) : (
            <>
              <div className="panelhead">
                <h2>Try a route</h2>
                <p>Pick a start and an end in Heilbronn. We compare the fastest route with the cooler, cleaner and safer GrünRoute.</p>
              </div>
              <div className="form">
                <Select id="startSel" label="Start" value={start} onChange={(e) => setStart(e.target.value as PlaceKey)}>
                  {(Object.keys(PLACES) as PlaceKey[]).map((k) => (
                    <option key={k} value={k}>{PLACES[k].name}</option>
                  ))}
                </Select>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                  <Button variant="outline" onClick={swapPlaces}>Swap start and end</Button>
                </div>
                <Select id="endSel" label="End" value={end} onChange={(e) => pickEnd(e.target.value as PlaceKey)}>
                  {(Object.keys(PLACES) as PlaceKey[]).map((k) => (
                    <option key={k} value={k}>{PLACES[k].name}</option>
                  ))}
                </Select>
              </div>
              <div className="compare" aria-live="polite">
                <div className="route-card fast">
                  <h3>Fastest route <span>{fastMin} min, about {approxKm.toFixed(1)} km</span></h3>
                  <p>Main roads, little shade, cars pass close.</p>
                </div>
                <div className="route-card green">
                  <h3>GrünRoute <span>{greenMin} min, about {(approxKm * 1.08).toFixed(1)} km</span></h3>
                  <p>Via Neckar side streets, Stadtgarten shade and quieter roads.</p>
                </div>
                <table className="compare-table">
                  <caption>One row per tradeoff, no extra taps needed.</caption>
                  <thead>
                    <tr><th scope="col">Tradeoff</th><th scope="col">Fastest</th><th scope="col">GrünRoute</th></tr>
                  </thead>
                  <tbody>
                    <tr><th scope="row">Time</th><td>{fastMin} min, about {approxKm.toFixed(1)} km</td><td>{greenMin} min, about {(approxKm * 1.08).toFixed(1)} km</td></tr>
                    <tr><th scope="row">Heat feel</th><td>High, 34 C</td><td>Lower, 29 C</td></tr>
                    <tr><th scope="row">Dust</th><td>High</td><td>38% lower</td></tr>
                    <tr><th scope="row">Close passes</th><td>High risk</td><td>Low risk</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="verdict">
                <b>Our tip:</b> Take the GrünRoute. It takes about 3 minutes longer, but it is cooler, cleaner and much safer, a good trade for school and daily trips.
              </div>
              <div className="notice">
                <b>Demo note:</b> Routes and values on this page are demo to show how the product will work. In the real version they will come from the data sources below.
              </div>
            </>
          )}
        </BottomSheet>
      </div>

      <section className={`livepanel ${liveState === "stale" || liveState === "offline" ? "stale" : ""}`} aria-label="Live data from openSenseMap">
        <div className="livehead">
          <h2><i className="livedot" aria-hidden="true" /> Live now, Heilbronn area</h2>
          <p className="livesub">
            Latest public sensor values near Heilbronn from openSenseMap. This is a snapshot when you open or refresh this page, not a promise of a live feed for every street. Helpful for parents, cyclists, and older people on hot days.
          </p>
        </div>
        {liveState === "loading" ? (
          <p className="live-loading" aria-live="polite">Loading live data from api.opensensemap.org ...</p>
        ) : liveState === "offline" ? (
          <p className="live-offline" aria-live="polite">Live data is not available right now, use the historical list below.</p>
        ) : (
          <div className="livegrid" aria-live="polite">
            <div className="livecell"><span>TEMPERATURE</span><b>{live?.temp ?? "No live value"}</b></div>
            <div className="livecell"><span>DUST PM10</span><b>{live?.pm10 ?? "No live value"}</b></div>
            <div className="livecell"><span>DUST PM2.5</span><b>{live?.pm25 ?? "No live value"}</b></div>
            <div className="livecell"><span>SENSOR BOX</span><b>{live ? live.box : "No live value"}</b><small>{live ? live.time : "Tap Refresh to try again"}</small></div>
          </div>
        )}
        <div className="livefoot">
          <Button variant="primary" size="large" onClick={fetchLive}>Refresh live data</Button>
          <span className="livetime">{liveNote}</span>
        </div>
        <p className="livenote">
          <b>One clear rule:</b> A single live point never changes a street score. Scores use checked historical data only. If live data is old or offline, this panel turns grey and the historical list above stays the source for decisions.
        </p>
      </section>

      <section className="brand-intro" aria-label="What GrünRoute does">
        <h2>What GrünRoute does</h2>
        <p>
          GrünRoute Heilbronn turns existing bike, school, and heat data into a ranked plan for the city, so it can fix the hottest, dustiest, and least safe streets first. The same evidence gives residents a simple web map for cooler, cleaner, and safer routes, with no app, sign-up, or personal tracking.
        </p>
      </section>

      <section className="datasource" aria-label="Data sources, in short">
        <h2>Data sources, in short</h2>
        <p>ATRAI Heilbronn collections: road network, bike road network, bumpy roads, danger zones, danger zones with dust, overtaking distance, speed map, traffic flow, and school home data. senseBox:bike measures GPS, dust (PM1, PM2.5, PM4, PM10), temperature, humidity, overtaking distance, road surface, and speed. senseBox:home fixed stations at schools measure temperature, humidity, air pressure, and dust, day and night. Heat walks from summer 2026 cover 73 km. Base map: OpenStreetMap.</p>
      </section>

      <section className="datasource" aria-label="Real data used">
        <h2>Real data used</h2>
        <p>
          Campaign Heilbronn, ATRAI: 2,281 tracks, 5,205.44 km, 304.07 hours, 32 riders, 5 Dec 2025 to 26 Oct 2026. overtaking_distance_heilbronn: 1,388 segments, used here as a sample of the first 100 segments checked, with average overtaking distance in cm and point counts per segment. bumpy_roads_heilbronn: 9,599 segments with roughness, checked but not joined to the streets shown, so roughness does not change any score here. danger_zones_heilbronn: 7,095 points with a Risk Index from 0 to 1, no street name on its own, joined to the nearest street within 20 m per the ATRAI guide, not joined in this build. danger_zones_PM_heilbronn: 183,030 points with a Risk Index, not loaded in the browser and not used for scores here. road_network_heilbronn: 34,243 segments with osmid, name, and surface. bike_road_network_heilbronn: 34,243 segments. osem_home_data_heilbronn: 2,012,544 points with real school box names, Temperature, and PM1, PM2.5, PM4, PM10, used only in the Live now panel through public openSenseMap boxes, not per street. Heat walks from Heat Island Summer School 2026: 73 km, 61,546 points, 9 devices, as a hotspot layer only, not full street coverage. Street geometry comes from ATRAI segments matched to OpenStreetMap streets within 20 m per the ATRAI guide. Limit: this list is a sample, not a full city ranking, and heat and dust were not joined to these streets in this build. Route values in For people are demo, not provided data.
        </p>
      </section>

      <section className="details-area" aria-label="Details">
        <div className="details-head">
          <h2>Details</h2>
          <p>Tap an item for the full text. Each item shows a short summary first, so a closed item never looks empty.</p>
        </div>
        <div className="details-grid">
          <details className="detail-item">
            <summary><span className="detail-title">How data is collected</span><span className="detail-summary">Bike sensors on rides, school stations day and night, and summer heat walks.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>Bike riders use senseBox:bike sensors on normal rides. School stations stay fixed and measure day and night. Heat walks use carried sensors on planned summer days. No new personal data is collected for this tool, and private zones in the bike app are respected. <a href="/data-collection">How to collect data</a></p>
          </details>
          <details className="detail-item">
            <summary><span className="detail-title">How we measure</span><span className="detail-summary">Each reading joins the nearest street within 20 m, then scores 0 to 100.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>Each measurement is matched to the nearest street, at most 20 m away, then averaged per street. Each street gets a score from 0 to 100 with a plain word reason. Streets with little data are marked as weak evidence, not hidden.</p>
          </details>
          <details className="detail-item">
            <summary><span className="detail-title">Coverage and timing</span><span className="detail-summary">School data runs all year, bike data only where riders rode, heat walks in summer only.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>School sensors run day and night. Bike data comes ride by ride, only where riders actually rode. Heat walks happen in summer only. Do not compare summer heat with winter bike data directly. Compare the same season. School holidays change school routes and ridership in summer, so school route scores need that note.</p>
          </details>
          <details className="detail-item">
            <summary><span className="detail-title">Future data update step</span><span className="detail-summary">New data is staged, checked, approved, then shown next to old scores.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>New data can be added in a fixed template, as a staged upload. It is matched to the nearest street within 20 m, checked with the same danger rules, and needs Green City approval before it goes public. Old and new scores are shown side by side, so the city can check if a fix worked. Only street averages are published, never personal ride tracks.</p>
          </details>
          <details className="detail-item">
            <summary><span className="detail-title">Plan fit</span><span className="detail-summary">One list that supports the city plans for green links, cycling, and heat.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>Landscape Plan 2030 wants green links and nature in streets. Mobility Concept 2030 wants safer walking and cycling. Climate Mitigation Concept aims for climate neutrality by 2035. Climate Adaptation Concept focuses on heat stress, green zones, and climate groves. GrünRoute fits European Green Capital 2027 by giving the city a re-measurable list for those plans. It does not invent a new plan, it shows which street fits which plan goal first.</p>
          </details>
          <details className="detail-item">
            <summary><span className="detail-title">Vision and mission</span><span className="detail-summary">Every street decision from real data, and a cool, clean, safe route for everyone.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>Vision: A Heilbronn where every street decision is based on real data, and every person can cycle or walk on a cool, clean, and safe route. Mission: To turn Heilbronn sensor data into a clear fix first list for the city, and an easy route map for people, so streets get better year after year.</p>
          </details>
          <details className="detail-item">
            <summary><span className="detail-title">Honest limits</span><span className="detail-summary">A screening tool only, not a legal measurement, thin streets need a ground check.</span><span className="chev" aria-hidden="true">v</span></summary>
            <p>This is a screening tool only, not official legal measurements. Low cost sensors are affected by humidity, calibration, and ageing. Never claim a street breaks a legal limit. Final planning decisions still use official data, and low coverage streets get a ground check first.</p>
          </details>
        </div>
      </section>

      <footer>
        <p className="brand-line">GrünRoute Heilbronn, built with open Heilbronn sensor data, no app, no sign up, no personal tracking.</p>
        <p><a href="/data-collection">How to collect data</a></p>
        <p>
          Map data from OpenStreetMap contributors. Historical street data here is an ATRAI sample, not a full city ranking, and needs checking with real city data before any decision. Live values, when shown, come from public openSenseMap boxes with the time shown in the Live now panel.
        </p>
      </footer>
    </main>
  );
}
