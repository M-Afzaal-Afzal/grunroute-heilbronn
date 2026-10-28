"use client";
// "Help measure": ride missions where the city has little bike sensor data.
// Adopting is saved in this browser only. District progress comes from the
// street data (streets with trusted data), never from clicks.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROLES, ROLES_DE, TIME_BANDS, TIME_BAND_LABELS_DE, missionTitleDe, missionWhyDe, streetNameDe, type Mission, type MissionsFile, type Role } from "../lib/missions";
import { badges, toggleAdopt, type Adopted } from "../lib/badges";
import { KEYS, readJSON, writeJSON } from "../lib/store";
import { loadSegments } from "../lib/segments";
import { aggregateStreets } from "../lib/priority";
import { TRUSTED, trustedShare } from "../lib/districts";
import { fmtNum, type Lang } from "../lib/i18n";
import { useHref, useLang } from "./LangProvider";

const MAENGELMELDER = "https://www.heilbronn.de/rathaus/kontakt/maengelmelder.html";

const EN = {
  title: "Help measure",
  lead: "Some Heilbronn streets have little or no bike sensor data. These short missions show where one more ride with a sensor helps most. Pick one that fits a ride you already do.",
  rule: "Ride only your normal, safe routes in daylight. Adults collect data for school streets. We never record who you are.",
  badgesTitle: "Your badges",
  notYet: "Not yet.",
  badgesNote: "Badges count missions you adopted, not rides. They are saved in this browser only and never sent anywhere.",
  missionsTitle: "Missions by district",
  loadErr: "The missions could not load. Please try again later.",
  progressLabel: (district: string) => `${district}: streets with trusted data`,
  progress: (trusted: string, streets: string, pct: number) => `${trusted} of ${streets} streets have trusted data (${pct}%)`,
  streetErr: "Street data did not load.",
  streetLoading: "Loading street data...",
  missing: (roles: string[]) => `No ${roles.map((r) => r.toLowerCase()).join(" or ")} found for this district.`,
  seeRoute: "See the route",
  adopted: "Adopted. Tap to undo",
  adopt: "Adopt this mission",
  reportTitle: "Saw a problem on the street?",
  reportLead: "Potholes, broken lights, or blocked bike lanes go to the city through its own reporting service, the Mängelmelder. GrünRoute does not send reports.",
  reportBtn: "Open the Heilbronn Mängelmelder",
  howTitle: "How missions and progress work",
  how: (trusted: number) =>
    `Missions are built from the street data with the Balanced priorities: streets with little or no sensor data, near a school or kindergarten, or next to a street high on the city list. Progress shows the share of streets with at least ${trusted} recorded overtakes, our line for trusted data. It changes only when new sensor data arrives, never from a tap here.`,
  collectAsk: "Want to ride with a sensor?",
  collectLink: "See how to collect data",
};

const T: Record<Lang, typeof EN> = {
  en: EN,
  de: {
    title: "Mitmessen",
    lead: "Für manche Straßen in Heilbronn gibt es wenig oder keine Rad-Sensordaten. Diese kurzen Missionen zeigen, wo eine weitere Fahrt mit Sensor am meisten hilft. Such dir eine aus, die zu einer Fahrt passt, die du sowieso machst.",
    rule: "Fahre nur deine normalen, sicheren Wege bei Tageslicht. Für Schulstraßen sammeln Erwachsene die Daten. Wir speichern nie, wer du bist.",
    badgesTitle: "Deine Abzeichen",
    notYet: "Noch nicht.",
    badgesNote: "Abzeichen zählen übernommene Missionen, keine Fahrten. Sie sind nur in diesem Browser gespeichert und werden nie gesendet.",
    missionsTitle: "Missionen nach Stadtteil",
    loadErr: "Die Missionen konnten nicht geladen werden. Bitte versuche es später noch einmal.",
    progressLabel: (district) => `${district}: Straßen mit verlässlichen Daten`,
    progress: (trusted, streets, pct) => `${trusted} von ${streets} Straßen haben verlässliche Daten (${pct}%)`,
    streetErr: "Straßendaten nicht geladen.",
    streetLoading: "Straßendaten werden geladen...",
    missing: (roles) => `Für diesen Stadtteil nicht gefunden: ${roles.join(" oder ")}.`,
    seeRoute: "Route ansehen",
    adopted: "Übernommen. Tippe zum Zurücknehmen",
    adopt: "Mission übernehmen",
    reportTitle: "Ein Problem auf der Straße gesehen?",
    reportLead: "Schlaglöcher, kaputte Lampen oder blockierte Radwege meldest du der Stadt über ihren eigenen Meldedienst, den Mängelmelder. GrünRoute sendet keine Meldungen.",
    reportBtn: "Mängelmelder Heilbronn öffnen",
    howTitle: "So funktionieren Missionen und Fortschritt",
    how: (trusted) =>
      `Die Missionen entstehen aus den Straßendaten mit den ausgewogenen Prioritäten: Straßen mit wenig oder keinen Sensordaten, nahe einer Schule oder Kita oder neben einer Straße weit oben auf der Liste der Stadt. Der Fortschritt zeigt den Anteil der Straßen mit mindestens ${trusted} erfassten Überholungen, unsere Grenze für verlässliche Daten. Er ändert sich nur, wenn neue Sensordaten kommen, nie durch einen Tipp hier.`,
    collectAsk: "Willst du mit einem Sensor fahren?",
    collectLink: "So sammelst du Daten",
  },
};

const ROLE_TEXT: Record<Lang, Record<Role, string>> = { en: ROLES, de: ROLES_DE };

const bandLabel = (id: string, lang: Lang) =>
  lang === "de" && id in TIME_BAND_LABELS_DE ? TIME_BAND_LABELS_DE[id as keyof typeof TIME_BAND_LABELS_DE] : (TIME_BANDS.find((b) => b.id === id)?.label ?? id);

/** Link to the route map from the first to the last street of a mission. `home` is the home page in the page language. */
function routeHref(m: Mission, home: string) {
  const a = m.streets[0];
  const b = m.streets[m.streets.length - 1];
  const q = new URLSearchParams({ from: `${a.lat},${a.lng}`, to: `${b.lat},${b.lng}`, fn: a.name, tn: b.name });
  return `${home}?${q.toString()}`;
}

export default function Measure() {
  const lang = useLang();
  const t = T[lang];
  const href = useHref();
  const roles = ROLE_TEXT[lang];
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

  const earned = badges(adopted, lang);

  function adopt(m: Mission) {
    const next = toggleAdopt(adopted, m);
    setAdopted(next);
    writeJSON(KEYS.adopted, next);
  }

  return (
    <main className="sub measure">
      <h1>{t.title}</h1>
      <p className="sub-lead">{t.lead}</p>
      <p className="rule-box">{t.rule}</p>

      <section aria-labelledby="badges-title">
        <h2 id="badges-title">{t.badgesTitle}</h2>
        <ul className="badge-list">
          {earned.map((b) => (
            <li key={b.id} className={`badge-item${b.earned ? " is-earned" : ""}`}>
              <b>{b.label}</b>
              <span>{b.earned ? b.text : t.notYet}</span>
            </li>
          ))}
        </ul>
        <p className="play-note">{t.badgesNote}</p>
      </section>

      <section aria-labelledby="missions-title">
        <h2 id="missions-title">{t.missionsTitle}</h2>
        {!file && !err && <div className="skel" aria-hidden="true" />}
        {err && <p className="card">{t.loadErr}</p>}
        {groups.map(([district, list]) => {
          const s = share?.get(district);
          const pct = s && s.streets > 0 ? Math.round((100 * s.trusted) / s.streets) : null;
          return (
            <div key={district} className="mission-district">
              <h3>{district}</h3>
              <div className="progress-row">
                {pct != null ? (
                  <>
                    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t.progressLabel(district)}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="progress-text">{t.progress(fmtNum(s!.trusted, lang), fmtNum(s!.streets, lang), pct)}</span>
                  </>
                ) : (
                  <span className="progress-text">{shareErr ? t.streetErr : t.streetLoading}</span>
                )}
              </div>
              {list.map((m) => {
                const on = adopted.some((a) => a.id === m.id);
                return (
                  <article key={m.id} className="card mission">
                    <p className="mission-band">{bandLabel(m.timeBand, lang)}</p>
                    <h4>{lang === "de" ? missionTitleDe(m.title) : m.title}</h4>
                    <ol className="mission-streets">
                      {m.streets.map((st) => (
                        <li key={st.id}>
                          <span className={`role role-${st.role}`}>{roles[st.role]}</span> {lang === "de" ? streetNameDe(st.name) : st.name}, {fmtNum(st.length, lang)} m
                        </li>
                      ))}
                    </ol>
                    <p className="play-note">{lang === "de" ? missionWhyDe(m.why) : m.why}</p>
                    {m.missing.length > 0 && <p className="play-note">{t.missing(m.missing.map((r) => roles[r]))}</p>}
                    <div className="mission-actions">
                      <Link href={routeHref(m, href("/"))} className="btn btn-quiet">
                        {t.seeRoute}
                      </Link>
                      <button type="button" className={on ? "btn btn-quiet" : "btn"} aria-pressed={on} onClick={() => adopt(m)}>
                        {on ? t.adopted : t.adopt}
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
        <h2 id="report-title">{t.reportTitle}</h2>
        <p className="sub-lead">{t.reportLead}</p>
        <p>
          <a className="btn btn-quiet" href={MAENGELMELDER} target="_blank" rel="noopener noreferrer">
            {t.reportBtn}
          </a>
        </p>
      </section>

      <details className="route-how">
        <summary>{t.howTitle}</summary>
        <p>{t.how(TRUSTED)}</p>
        <p>
          {t.collectAsk} <Link href={href("/data-collection")}>{t.collectLink}</Link>.
        </p>
      </details>
    </main>
  );
}
