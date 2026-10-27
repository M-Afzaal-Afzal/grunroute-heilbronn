"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BANDS, CAMPAIGN, PLACES, STREETS, bandFor, type PlaceKey } from "../lib/data";
import { LogoMark, Wordmark } from "../components/brand/Logo";

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

const FIX_FILTERS = [
  { value: "all", label: "All" },
  { value: "bike", label: "Bike lane" },
  { value: "calming", label: "Traffic calming" },
] as const;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function Home() {
  const [view, setView] = useState<View>("city");
  const [activeRank, setActiveRank] = useState(1);
  const [focusRank, setFocusRank] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [fixFilter, setFixFilter] = useState<string>("all");
  const [start, setStart] = useState<PlaceKey>("station");
  const [end, setEnd] = useState<PlaceKey>("campus");
  const [resetKey, setResetKey] = useState(0);
  const [openCard, setOpenCard] = useState<number | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("loading");
  const [live, setLive] = useState<LiveValue | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return STREETS.filter((s) => {
      const okQ = !q || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q) || s.fix.toLowerCase().includes(q);
      const okF = fixFilter === "all" || s.fixType === fixFilter;
      return okQ && okF;
    });
  }, [search, fixFilter]);

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

  function selectStreet(rank: number) {
    setActiveRank(rank);
    setFocusRank(rank);
    setView("city");
  }

  function showOnMap(rank: number) {
    selectStreet(rank);
    // On phones the map sits above the list, so bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("map")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  function pickStart(value: PlaceKey) {
    if (value === end) setEnd(start);
    setStart(value);
  }

  function pickEnd(value: PlaceKey) {
    if (value === start) setStart(end);
    setEnd(value);
  }

  const sPlace = PLACES[start];
  const ePlace = PLACES[end];
  const approxKm = Math.max(0.8, Math.sqrt(Math.pow((ePlace.lng - sPlace.lng) * 73, 2) + Math.pow((ePlace.lat - sPlace.lat) * 111, 2)) * 1.3);
  const fastMin = Math.max(4, Math.round(approxKm / 0.25));
  const greenMin = fastMin + 3;
  const active = STREETS.find((s) => s.rank === activeRank);

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
            <button type="button" role="tab" aria-selected={view === "city"} aria-controls="panel" onClick={() => setView("city")}>
              For the city
            </button>
            <button type="button" role="tab" aria-selected={view === "people"} aria-controls="panel" onClick={() => setView("people")}>
              For people
            </button>
          </div>
        </section>

        <section className="mapzone" id="map" aria-label="Map">
          <div className="mapframe">
            <MapView view={view} activeRank={activeRank} focusRank={focusRank} start={start} end={end} resetKey={resetKey} onStreetSelect={selectStreet} />
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
                  <p className="legend-note">Heat and dust are not joined to streets yet.</p>
                </>
              ) : (
                <>
                  <p className="legend-title">Demo routes</p>
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
            </div>
            <button type="button" className="map-reset" onClick={() => { setFocusRank(null); setResetKey((k) => k + 1); }}>
              Reset view
            </button>
          </div>
        </section>

        <section className="panel" id="panel" role="tabpanel" aria-label={view === "city" ? "Fix first list" : "Try a route"}>
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
                  <li>Heat, dust, and road roughness did not change these scores.</li>
                  <li>Turmstraße is not ranked. No overtaking segment for it was found in this sample.</li>
                  <li>This is a screening tool, not an official legal measurement.</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="panel-head">
                <h2>Try a route</h2>
                <p>Pick a start and an end. See the fastest way next to a cooler, quieter GrünRoute.</p>
              </div>
              <div className="trip">
                <label className="field">
                  <span>From</span>
                  <select value={start} onChange={(e) => pickStart(e.target.value as PlaceKey)}>
                    {(Object.keys(PLACES) as PlaceKey[]).map((k) => (
                      <option key={k} value={k}>
                        {PLACES[k].name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="swap"
                  aria-label="Swap start and end"
                  onClick={() => {
                    setStart(end);
                    setEnd(start);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M7 4v14m0 0l-3-3m3 3l3-3M17 20V6m0 0l-3 3m3-3l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <label className="field">
                  <span>To</span>
                  <select value={end} onChange={(e) => pickEnd(e.target.value as PlaceKey)}>
                    {(Object.keys(PLACES) as PlaceKey[]).map((k) => (
                      <option key={k} value={k}>
                        {PLACES[k].name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="routes" aria-live="polite">
                <div className="route route-green">
                  <div className="route-top">
                    <h3>GrünRoute</h3>
                    <span className="route-time">about {greenMin} min</span>
                  </div>
                  <p>Side streets, park shade, and fewer close passes.</p>
                </div>
                <div className="route route-fast">
                  <div className="route-top">
                    <h3>Fastest</h3>
                    <span className="route-time">about {fastMin} min</span>
                  </div>
                  <p>Main roads, little shade, more traffic.</p>
                </div>
              </div>
              <p className="demo-note">
                <span className="badge badge-demo">Demo</span> These routes show how the people view will work. Lines and times are not provided data yet.
              </p>
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
        </dl>
        <p className="facts-source">
          ATRAI campaign Heilbronn, 5 Dec 2025 to 26 Oct 2026. Also used: openSenseMap, Heat Island Summer School 2026 heat walks, and OpenStreetMap.
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
            overtaking_distance_heilbronn: 1,388 segments, used here as a sample of the first 100 segments, with average overtaking distance in cm and point counts. bumpy_roads_heilbronn: 9,599 segments with roughness, checked but not joined to these streets. danger_zones_heilbronn: 7,095 points with a risk index from 0 to 1, not joined in this build. danger_zones_PM_heilbronn: 183,030 points, not used for scores here. road_network_heilbronn and bike_road_network_heilbronn: 34,243 segments each. osem_home_data_heilbronn: 2,012,544 points with temperature and dust, used only in the sensor snapshot through public openSenseMap boxes. Heat walks from Heat Island Summer School 2026: 73 km, 61,546 points, 9 devices, as a hotspot layer only.
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
