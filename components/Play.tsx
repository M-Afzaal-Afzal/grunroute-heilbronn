"use client";
// "Hot or not?": five rounds, each with two real heat walk spots at least
// 0.8 degrees apart. Score and badge stay in this browser.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { HEAT_CELLS, HEAT_WALK } from "../lib/heat-walks";
import { fmtAnomaly } from "../lib/geo";
import { DETECTIVE_MIN, MIN_GAP, ROUNDS, pickRounds, warmer, type Round, type Spot } from "../lib/play";
import { KEYS, readJSON, writeJSON } from "../lib/store";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { fmtNum, type Lang } from "../lib/i18n";
import { useHref, useLang } from "./LangProvider";

const SpotMap = dynamic(() => import("./SpotMap"), { ssr: false, loading: () => <div className="spot-map skel" aria-hidden="true" /> });

type Saved = { best: number; plays: number; detective: boolean };
const EMPTY: Saved = { best: 0, plays: 0, detective: false };
const TREE_R = 40;

const EN = {
  title: "Hot or not?",
  lead: (dates: string, rounds: number) => `Two real spots from the Heat Island Summer School walks, ${dates}. Which one was warmer on the walk? ${rounds} rounds, no sign up.`,
  dates: HEAT_WALK.dates as string,
  empty: "Not enough heat walk spots to play right now.",
  count: (n: number, of: number, score: number) => `Round ${n} of ${of} · Score ${score}`,
  question: "Which was warmer on the walk?",
  spot: (k: string) => `Spot ${k}`,
  near: (street: string) => `near ${street}`,
  against: "against the walk",
  trees: (n: number, r: number) => `${n} register trees within ${r} m`,
  treeErr: "Tree register not loaded",
  counting: "Counting trees...",
  right: "Right!",
  wrong: "Not this time.",
  wasWarmer: (k: string) => `Spot ${k} was warmer.`,
  note: "Values are the difference from the middle value of the same walk, not raw temperatures. Shade from trees and buildings is one reason, but wind, surfaces, and time of day matter too.",
  seeScore: "See your score",
  nextRound: "Next round",
  youGot: (score: number, of: number) => `You got ${score} of ${of}`,
  badge: "Heat detective",
  earned: "Badge earned. It is saved in this browser only.",
  getMore: (n: number) => `Get ${n} or more right for the Heat detective badge.`,
  best: (best: number, of: number, plays: number) => `Best score in this browser: ${best} of ${of}. Played ${plays} ${plays === 1 ? "time" : "times"}.`,
  measure: "Help measure the streets",
  again: "Play again",
  howTitle: "How the rounds are made",
  how: (cells: string, gap: string) =>
    `Each round takes two of the ${cells} heat walk spots, at least ${gap} °C apart and at least 150 m apart, from spots with at least 20 readings. Tree counts come from the Stadt Heilbronn tree register, public trees only. Your score is kept in this browser and is never sent anywhere.`,
};

const T: Record<Lang, typeof EN> = {
  en: EN,
  de: {
    title: "Heiß oder nicht?",
    lead: (dates, rounds) => `Zwei echte Spots aus den Rundgängen der Heat Island Summer School, ${dates}. Welcher war beim Rundgang wärmer? ${rounds} Runden, keine Anmeldung.`,
    dates: "1. bis 3. Sep. 2026",
    empty: "Gerade gibt es nicht genug Hitze-Spots zum Spielen.",
    count: (n, of, score) => `Runde ${n} von ${of} · Punkte ${score}`,
    question: "Welcher war beim Rundgang wärmer?",
    spot: (k) => `Spot ${k}`,
    near: (street) => `nahe ${street}`,
    against: "gegenüber dem Rundgang",
    trees: (n, r) => `${n} Bäume aus dem Baumkataster im Umkreis von ${r} m`,
    treeErr: "Baumkataster nicht geladen",
    counting: "Bäume werden gezählt...",
    right: "Richtig!",
    wrong: "Diesmal nicht.",
    wasWarmer: (k) => `Spot ${k} war wärmer.`,
    note: "Die Werte sind die Abweichung vom mittleren Wert desselben Rundgangs, keine echten Temperaturen. Schatten von Bäumen und Gebäuden ist ein Grund, aber auch Wind, Oberflächen und Tageszeit spielen mit.",
    seeScore: "Zu deinen Punkten",
    nextRound: "Nächste Runde",
    youGot: (score, of) => `Du hast ${score} von ${of} richtig`,
    badge: "Hitze-Detektiv",
    earned: "Abzeichen verdient. Es ist nur in diesem Browser gespeichert.",
    getMore: (n) => `Mit ${n} oder mehr richtigen Antworten bekommst du das Abzeichen Hitze-Detektiv.`,
    best: (best, of, plays) => `Bester Stand in diesem Browser: ${best} von ${of}. ${plays} Mal gespielt.`,
    measure: "Straßen mitmessen",
    again: "Nochmal spielen",
    howTitle: "So entstehen die Runden",
    how: (cells, gap) =>
      `Jede Runde nimmt zwei der ${cells} Hitze-Spots, mindestens ${gap} °C und mindestens 150 m auseinander, aus Spots mit mindestens 20 Messwerten. Die Baumzahlen kommen aus dem Baumkataster der Stadt Heilbronn, nur öffentliche Bäume. Dein Punktestand bleibt in diesem Browser und wird nie gesendet.`,
  },
};

/** A location hint from the tree register: the street of the closest register tree. */
function hint(ct: CityTrees | null, s: Spot, near: (street: string) => string) {
  if (!ct) return null;
  const ids = ct.near(s.lat, s.lng, 80);
  const street = ids.map((i) => ct.get(i).street).find(Boolean);
  return street ? near(street) : null;
}

export default function Play() {
  const lang = useLang();
  const t = T[lang];
  const href = useHref();
  const anomaly = (a: number) => (lang === "de" ? fmtAnomaly(a).replace(".", ",") : fmtAnomaly(a));
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [i, setI] = useState(0);
  const [choice, setChoice] = useState<0 | 1 | null>(null);
  const [score, setScore] = useState(0);
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [trees, setTrees] = useState<CityTrees | null>(null);
  const [treeErr, setTreeErr] = useState(false);

  // Random rounds only in the browser, so the server page and the first paint match.
  useEffect(() => {
    const t = setTimeout(() => {
      setRounds(pickRounds(HEAT_CELLS));
      setSaved(readJSON<Saved>(KEYS.play, EMPTY));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Tree register for the reveal, loaded after the first round shows.
  useEffect(() => {
    let alive = true;
    loadCityTrees()
      .then((ct) => alive && setTrees(ct))
      .catch(() => alive && setTreeErr(true));
    return () => {
      alive = false;
    };
  }, []);

  const done = rounds != null && i >= rounds.length;
  const round = rounds && !done ? rounds[i] : null;
  const right = round ? warmer(round) : 0;

  function answer(c: 0 | 1) {
    if (!round || choice != null) return;
    setChoice(c);
    if (c === right) setScore((s) => s + 1);
  }

  function next() {
    const last = rounds && i + 1 >= rounds.length;
    if (last) {
      const s: Saved = { best: Math.max(saved.best, score), plays: saved.plays + 1, detective: saved.detective || score >= DETECTIVE_MIN };
      setSaved(s);
      writeJSON(KEYS.play, s);
    }
    setChoice(null);
    setI((n) => n + 1);
  }

  function again() {
    setRounds(pickRounds(HEAT_CELLS));
    setI(0);
    setScore(0);
    setChoice(null);
  }

  return (
    <main className="sub play">
      <h1>{t.title}</h1>
      <p className="sub-lead">{t.lead(t.dates, ROUNDS)}</p>

      {!rounds && <div className="skel" aria-hidden="true" />}

      {rounds && rounds.length === 0 && <p className="card">{t.empty}</p>}

      {round && (
        <section className="card play-round" aria-labelledby="round-title">
          <p className="play-count">{t.count(i + 1, rounds!.length, score)}</p>
          <h2 id="round-title">{t.question}</h2>
          <SpotMap round={round} revealed={choice != null} warmer={right} />
          <div className="play-choices">
            {round.map((s, k) => {
              const isRight = choice != null && k === right;
              const isWrong = choice === k && k !== right;
              const near = hint(trees, s, t.near);
              return (
                <button
                  key={s.index}
                  type="button"
                  className={`play-choice${isRight ? " is-right" : ""}${isWrong ? " is-wrong" : ""}`}
                  onClick={() => answer(k as 0 | 1)}
                  disabled={choice != null}
                  aria-pressed={choice === k}
                >
                  <b>{t.spot(k === 0 ? "A" : "B")}</b>
                  {near && <span>{near}</span>}
                  {choice != null && (
                    <span className="play-reveal">
                      <strong>{anomaly(s.anomaly)}</strong> {t.against}
                      <br />
                      {trees ? t.trees(trees.near(s.lat, s.lng, TREE_R).length, TREE_R) : treeErr ? t.treeErr : t.counting}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {choice != null && (
            <div className="play-after" aria-live="polite">
              <p className="play-verdict">
                {choice === right ? t.right : t.wrong} {t.wasWarmer(right === 0 ? "A" : "B")}
              </p>
              <p className="play-note">{t.note}</p>
              <button type="button" className="btn" onClick={next}>
                {i + 1 >= rounds!.length ? t.seeScore : t.nextRound}
              </button>
            </div>
          )}
        </section>
      )}

      {done && rounds!.length > 0 && (
        <section className="card play-end" aria-labelledby="end-title">
          <h2 id="end-title">{t.youGot(score, rounds!.length)}</h2>
          {score >= DETECTIVE_MIN ? (
            <p className="play-badge">
              <span className="badge badge-demo">{t.badge}</span> {t.earned}
            </p>
          ) : (
            <p>{t.getMore(DETECTIVE_MIN)}</p>
          )}
          <p className="play-note">{t.best(Math.max(saved.best, score), ROUNDS, saved.plays)}</p>
          <div className="play-end-actions">
            <Link href={href("/measure")} className="btn">
              {t.measure}
            </Link>
            <button type="button" className="btn btn-quiet" onClick={again}>
              {t.again}
            </button>
          </div>
        </section>
      )}

      <details className="route-how">
        <summary>{t.howTitle}</summary>
        <p>{t.how(fmtNum(HEAT_WALK.cells, lang), fmtNum(MIN_GAP, lang))}</p>
      </details>
    </main>
  );
}
