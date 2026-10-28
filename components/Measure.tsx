"use client";
// "Help measure": ride missions where the city has little bike sensor data.
// Adopting is saved in this browser only. District progress comes from the
// street data (streets with trusted data), never from clicks.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROLES, TIME_BANDS, type Mission, type MissionsFile } from "../lib/missions";
import { badges, toggleAdopt, type Adopted } from "../lib/badges";
import { KEYS, readJSON, writeJSON } from "../lib/store";
import { loadSegments } from "../lib/segments";
import { aggregateStreets } from "../lib/priority";
import { TRUSTED, trustedShare } from "../lib/districts";

const MEASURE_RULE = "Ride only your normal, safe routes in daylight. Adults collect data for school streets. We never record who you are.";
const MAENGELMELDER = "https://www.heilbronn.de/rathaus/kontakt/maengelmelder.html";

const bandLabel = (id: string) => TIME_BANDS.find((b) => b.id === id)?.label ?? id;

/** Link to the route map from the first to the last street of a mission. */
function routeHref(m: Mission) {
  const a = m.streets[0];
  const b = m.streets[m.streets.length - 1];
  const q = new URLSearchParams({ from: `${a.lat},${a.lng}`, to: `${b.lat},${b.lng}`, fn: a.name, tn: b.name });
  return `/?${q.toString()}`;
}

export default function Measure() {
  const [file, setFile] = useState<MissionsFile | null>(null);
  const [err, setErr] = useState(false);
  const [adopted, setAdopted] = useState<Adopted[]>([]);
  const [share, setShare] = useState<Map<string, { trusted: number; streets: number }> | null>(null);
  const [shareErr, setShareErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => alive && setAdopted(readJSON<Adopted[]>(KEYS.adopted, [])), 0);
    fetch("/data/missions.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<MissionsFile>;
      })
      .then((f) => alive && setFile(f))
      .catch(() => alive && setErr(true));
    loadSegments()
      .then((d) => alive && setShare(trustedShare(aggregateStreets(d.segments))))
      .catch(() => alive && setShareErr(true));
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const groups = useMemo(() => {
    const out = new Map<string, Mission[]>();
    for (const m of file?.missions ?? []) out.set(m.district, [...(out.get(m.district) ?? []), m]);
    return [...out.entries()];
  }, [file]);

  const earned = badges(adopted);

  function adopt(m: Mission) {
    const next = toggleAdopt(adopted, m);
    setAdopted(next);
    writeJSON(KEYS.adopted, next);
  }

  return (
    <main className="sub measure">
      <h1>Help measure</h1>
      <p className="sub-lead">
        Some Heilbronn streets have little or no bike sensor data. These short missions show where one more ride with a sensor helps most. Pick one that fits a ride you already do.
      </p>
      <p className="rule-box">{MEASURE_RULE}</p>

      <section aria-labelledby="badges-title">
        <h2 id="badges-title">Your badges</h2>
        <ul className="badge-list">
          {earned.map((b) => (
            <li key={b.id} className={`badge-item${b.earned ? " is-earned" : ""}`}>
              <b>{b.label}</b>
              <span>{b.earned ? b.text : "Not yet."}</span>
            </li>
          ))}
        </ul>
        <p className="play-note">Badges count missions you adopted, not rides. They are saved in this browser only and never sent anywhere.</p>
      </section>

      <section aria-labelledby="missions-title">
        <h2 id="missions-title">Missions by district</h2>
        {!file && !err && <div className="skel" aria-hidden="true" />}
        {err && <p className="card">The missions could not load. Please try again later.</p>}
        {groups.map(([district, list]) => {
          const s = share?.get(district);
          const pct = s && s.streets > 0 ? Math.round((100 * s.trusted) / s.streets) : null;
          return (
            <div key={district} className="mission-district">
              <h3>{district}</h3>
              <div className="progress-row">
                {pct != null ? (
                  <>
                    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${district}: streets with trusted data`}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="progress-text">
                      {s!.trusted.toLocaleString("en")} of {s!.streets.toLocaleString("en")} streets have trusted data ({pct}%)
                    </span>
                  </>
                ) : (
                  <span className="progress-text">{shareErr ? "Street data did not load." : "Loading street data..."}</span>
                )}
              </div>
              {list.map((m) => {
                const on = adopted.some((a) => a.id === m.id);
                return (
                  <article key={m.id} className="card mission">
                    <p className="mission-band">{bandLabel(m.timeBand)}</p>
                    <h4>{m.title}</h4>
                    <ol className="mission-streets">
                      {m.streets.map((st) => (
                        <li key={st.id}>
                          <span className={`role role-${st.role}`}>{ROLES[st.role]}</span> {st.name}, {st.length.toLocaleString("en")} m
                        </li>
                      ))}
                    </ol>
                    <p className="play-note">{m.why}</p>
                    {m.missing.length > 0 && <p className="play-note">No {m.missing.map((r) => ROLES[r].toLowerCase()).join(" or ")} found for this district.</p>}
                    <div className="mission-actions">
                      <Link href={routeHref(m)} className="btn btn-quiet">
                        See the route
                      </Link>
                      <button type="button" className={on ? "btn btn-quiet" : "btn"} aria-pressed={on} onClick={() => adopt(m)}>
                        {on ? "Adopted. Tap to undo" : "Adopt this mission"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="report-title">
        <h2 id="report-title">Saw a problem on the street?</h2>
        <p className="sub-lead">
          Potholes, broken lights, or blocked bike lanes go to the city through its own reporting service, the Mängelmelder. GrünRoute does not send reports.
        </p>
        <p>
          <a className="btn btn-quiet" href={MAENGELMELDER} target="_blank" rel="noopener noreferrer">
            Open the Heilbronn Mängelmelder
          </a>
        </p>
      </section>

      <details className="route-how">
        <summary>How missions and progress work</summary>
        <p>
          Missions are built from the street data with the Balanced priorities: streets with little or no sensor data, near a school or kindergarten, or next to a street high on the city list. Progress shows the share of
          streets with at least {TRUSTED} recorded overtakes, our line for trusted data. It changes only when new sensor data arrives, never from a tap here.
        </p>
        <p>
          Want to ride with a sensor? <Link href="/data-collection">See how to collect data</Link>.
        </p>
      </details>
    </main>
  );
}
