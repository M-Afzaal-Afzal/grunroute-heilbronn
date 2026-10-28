"use client";
// A7 Live: openSenseMap boxes inside the city, today's DWD temperature via
// Bright Sky with a hot day flag, and links to the UBA stations. Live values
// are context only and never change a street score.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type * as Leaflet from "leaflet";
import { fetchHeilbronnBoxes, loadBoundaryRings, FRESH_MS, type LiveBox, type Ring } from "@/lib/shared/live";
import { nf } from "@/lib/data";
import { fetchToday, HOT_DAY_C, type DayWeather } from "@/lib/weather";
import { NetworkMap, type MapPoly } from "@/components/map/NetworkMap";
import type { LeafletNS } from "@/components/map/useLeaflet";
import { Skeleton } from "@/components/ui/skeleton";
import { DesktopNote } from "@/components/shell/DesktopNote";

const TempChart = dynamic(() => import("@/components/live/TempChart").then((m) => m.TempChart), { ssr: false, loading: () => <Skeleton label="Loading chart" /> });

const NOTE = "Live values are context. They never change a street score.";
const FRESH = "#46327e";
const STALE = "#9a958e";
const UBA = [
  { code: "DEBW015", name: "Heilbronn", kind: "urban background" },
  { code: "DEBW152", name: "Heilbronn Weinsberger Straße-Ost", kind: "traffic" },
];

function ago(iso: string) {
  if (!iso) return "no reading";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
const val = (r: LiveBox["temp"], d = 1) => (r ? `${r.value.toFixed(d)} ${r.unit}` : "-");

export default function LivePage() {
  const [boxes, setBoxes] = useState<LiveBox[] | null>(null);
  const [boxError, setBoxError] = useState<string | null>(null);
  const [rings, setRings] = useState<Ring[] | null>(null);
  const [weather, setWeather] = useState<DayWeather | null | undefined>(undefined);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    fetchHeilbronnBoxes(ac.signal, 500)
      .then((b) => {
        setBoxes(b);
        setBoxError(null);
        setReadAt(new Date());
      })
      .catch((e) => !ac.signal.aborted && setBoxError(String(e.message ?? e)));
    loadBoundaryRings().then(setRings, () => setRings([]));
    fetchToday(ac.signal)
      .then((w) => {
        setWeather(w);
        setWeatherError(null);
      })
      .catch((e) => !ac.signal.aborted && setWeatherError(String(e.message ?? e)));
    return () => ac.abort();
  }, [tick]);

  const polys = useMemo<MapPoly[]>(() => (rings ?? []).map((r, i) => ({ id: `b${i}`, rings: [r.map(([lng, lat]) => [lat, lng] as [number, number])], color: "#12A150", opacity: 0.04, title: "City of Heilbronn" })), [rings]);

  const extra = useCallback(
    (map: Leaflet.Map, L: LeafletNS) => {
      if (!boxes) return;
      const layer = L.layerGroup().addTo(map);
      for (const b of boxes) {
        L.circleMarker([b.lat, b.lng], { radius: 7, color: "#fff", weight: 2, fillColor: b.fresh ? FRESH : STALE, fillOpacity: 1 })
          .bindTooltip(`${b.name}: ${b.fresh ? "fresh" : "over 2 hours old"}, ${ago(b.updatedAt)}. Temp ${val(b.temp)}, PM10 ${val(b.pm10, 0)}`)
          .addTo(layer);
      }
      return () => {
        layer.remove();
      };
    },
    [boxes],
  );

  const fresh = boxes?.filter((b) => b.fresh).length ?? 0;
  const hot = weather?.max != null && weather.max >= HOT_DAY_C;

  return (
    <div className="pl-live">
      <DesktopNote />
      <header>
        <h1>Live</h1>
        <p>
          <strong>{NOTE}</strong> Values are read in this browser when the page opens.{" "}
          {readAt && `Read at ${readAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`}{" "}
          <button type="button" className="pl-btn" onClick={() => setTick((t) => t + 1)}>
            Read again
          </button>
        </p>
      </header>

      <section className="gr-card pl-section" aria-labelledby="w-h">
        <h2 id="w-h">Today&apos;s temperature, DWD via Bright Sky</h2>
        {weatherError ? (
          <p role="alert">Bright Sky did not answer: {weatherError}. No live weather right now.</p>
        ) : weather === undefined ? (
          <Skeleton label="Loading weather" />
        ) : weather === null ? (
          <p>No temperature from DWD stations 15547 or 03734 for today in Bright Sky. No live weather right now.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
            <TempChart hours={weather.hours} />
            <div style={{ display: "grid", gap: 8 }}>
              <p style={{ fontSize: 18, fontWeight: 700 }}>
                {hot ? (
                  <span className="pl-chip" style={{ background: "#C2410C", color: "#fff", fontSize: 15 }}>
                    Hot day, {weather.max} °C or more
                  </span>
                ) : (
                  <span className="pl-chip" style={{ fontSize: 15 }}>
                    Not a hot day
                  </span>
                )}
              </p>
              <p className="pl-note">
                Highest today {weather.max} °C{weather.maxObserved != null && weather.maxObserved !== weather.max ? `, measured so far ${weather.maxObserved} °C` : ""}. A hot day here
                means {HOT_DAY_C} °C or more, the DWD definition.
              </p>
              <p className="pl-note">
                Station: DWD {weather.station.id} {weather.station.name}.
                {weather.station.id !== "15547" &&
                  " Station 15547 Heilbronn/Neckar has no temperature in Bright Sky (wind only), so the nearest station with temperature is shown, about 10 km east of the city centre."}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="gr-card pl-section" aria-labelledby="osm-h">
        <h2 id="osm-h">openSenseMap boxes in the city</h2>
        <p className="sub">
          {boxError
            ? `openSenseMap did not answer: ${boxError}. No live feed right now.`
            : boxes
              ? `${nf(boxes.length)} boxes inside the city boundary, ${nf(fresh)} with a reading in the last ${FRESH_MS / 3600000} hours. Grey means over 2 hours old. Readings below 0 are dropped.`
              : "Loading boxes"}
        </p>
        <div className="pl-legend" style={{ marginBottom: 8 }}>
          <span>
            <i style={{ background: FRESH, borderRadius: "50%" }} />
            Fresh, last 2 hours
          </span>
          <span>
            <i style={{ background: STALE, borderRadius: "50%" }} />
            Over 2 hours old
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 16, alignItems: "start" }}>
          <NetworkMap polys={polys} extra={extra} height={480} label="openSenseMap boxes inside Heilbronn" />
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            {boxes ? (
              <table className="pl-table">
                <thead>
                  <tr>
                    <th scope="col">Box</th>
                    <th scope="col" className="n">Temp</th>
                    <th scope="col" className="n">PM10</th>
                    <th scope="col" className="n">PM2.5</th>
                    <th scope="col">Last reading</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b.id} style={b.fresh ? undefined : { color: "var(--moss)" }}>
                      <th scope="row">
                        <a href={`https://opensensemap.org/explore/${b.id}`} target="_blank" rel="noreferrer">
                          {b.name}
                        </a>
                      </th>
                      <td className="n">{val(b.temp)}</td>
                      <td className="n">{val(b.pm10, 0)}</td>
                      <td className="n">{val(b.pm25, 0)}</td>
                      <td>{b.fresh ? ago(b.updatedAt) : `${ago(b.updatedAt)}, old`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : boxError ? null : (
              <Skeleton label="Loading boxes" />
            )}
          </div>
        </div>
        <p className="pl-note">Citizen sensors, not official measuring stations. Low cost sensors can read high in humid air.</p>
      </section>

      <section className="gr-card pl-section" aria-labelledby="uba-h">
        <h2 id="uba-h">Official air stations, UBA</h2>
        <p>
          The Umweltbundesamt air data API does not allow calls from a browser (no CORS header, tested 28 Oct 2026), so this page links to the official values
          instead of showing them.
        </p>
        <ul style={{ paddingLeft: 18, marginTop: 8 }}>
          {UBA.map((s) => (
            <li key={s.code}>
              {s.code} {s.name}, {s.kind}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 8 }}>
          <a className="pl-btn" href="https://www.umweltbundesamt.de/en/data/air/air-data" target="_blank" rel="noreferrer">
            Open UBA air data
          </a>
        </p>
      </section>
    </div>
  );
}
