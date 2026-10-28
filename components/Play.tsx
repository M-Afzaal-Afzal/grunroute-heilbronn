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

const SpotMap = dynamic(() => import("./SpotMap"), { ssr: false, loading: () => <div className="spot-map skel" aria-hidden="true" /> });

type Saved = { best: number; plays: number; detective: boolean };
const EMPTY: Saved = { best: 0, plays: 0, detective: false };
const TREE_R = 40;

/** A location hint from the tree register: the street of the closest register tree. */
function hint(ct: CityTrees | null, s: Spot) {
  if (!ct) return null;
  const ids = ct.near(s.lat, s.lng, 80);
  const street = ids.map((i) => ct.get(i).street).find(Boolean);
  return street ? `near ${street}` : null;
}

export default function Play() {
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
      <h1>Hot or not?</h1>
      <p className="sub-lead">
        Two real spots from the Heat Island Summer School walks, {HEAT_WALK.dates}. Which one was warmer on the walk? {ROUNDS} rounds, no sign up.
      </p>

      {!rounds && <div className="skel" aria-hidden="true" />}

      {rounds && rounds.length === 0 && <p className="card">Not enough heat walk spots to play right now.</p>}

      {round && (
        <section className="card play-round" aria-labelledby="round-title">
          <p className="play-count">
            Round {i + 1} of {rounds!.length} · Score {score}
          </p>
          <h2 id="round-title">Which was warmer on the walk?</h2>
          <SpotMap round={round} revealed={choice != null} warmer={right} />
          <div className="play-choices">
            {round.map((s, k) => {
              const isRight = choice != null && k === right;
              const isWrong = choice === k && k !== right;
              const near = hint(trees, s);
              return (
                <button
                  key={s.index}
                  type="button"
                  className={`play-choice${isRight ? " is-right" : ""}${isWrong ? " is-wrong" : ""}`}
                  onClick={() => answer(k as 0 | 1)}
                  disabled={choice != null}
                  aria-pressed={choice === k}
                >
                  <b>Spot {k === 0 ? "A" : "B"}</b>
                  {near && <span>{near}</span>}
                  {choice != null && (
                    <span className="play-reveal">
                      <strong>{fmtAnomaly(s.anomaly)}</strong> against the walk
                      <br />
                      {trees ? `${trees.near(s.lat, s.lng, TREE_R).length} register trees within ${TREE_R} m` : treeErr ? "Tree register not loaded" : "Counting trees..."}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {choice != null && (
            <div className="play-after" aria-live="polite">
              <p className="play-verdict">{choice === right ? "Right!" : "Not this time."} Spot {right === 0 ? "A" : "B"} was warmer.</p>
              <p className="play-note">
                Values are the difference from the middle value of the same walk, not raw temperatures. Shade from trees and buildings is one reason, but wind, surfaces, and time of day matter too.
              </p>
              <button type="button" className="btn" onClick={next}>
                {i + 1 >= rounds!.length ? "See your score" : "Next round"}
              </button>
            </div>
          )}
        </section>
      )}

      {done && rounds!.length > 0 && (
        <section className="card play-end" aria-labelledby="end-title">
          <h2 id="end-title">
            You got {score} of {rounds!.length}
          </h2>
          {score >= DETECTIVE_MIN ? (
            <p className="play-badge">
              <span className="badge badge-demo">Heat detective</span> Badge earned. It is saved in this browser only.
            </p>
          ) : (
            <p>Get {DETECTIVE_MIN} or more right for the Heat detective badge.</p>
          )}
          <p className="play-note">
            Best score in this browser: {Math.max(saved.best, score)} of {ROUNDS}. Played {saved.plays} {saved.plays === 1 ? "time" : "times"}.
          </p>
          <div className="play-end-actions">
            <Link href="/measure" className="btn">
              Help measure the streets
            </Link>
            <button type="button" className="btn btn-quiet" onClick={again}>
              Play again
            </button>
          </div>
        </section>
      )}

      <details className="route-how">
        <summary>How the rounds are made</summary>
        <p>
          Each round takes two of the {HEAT_WALK.cells} heat walk spots, at least {MIN_GAP} °C apart and at least 150 m apart, from spots with at least 20 readings. Tree counts come from the Stadt Heilbronn tree register,
          public trees only. Your score is kept in this browser and is never sent anywhere.
        </p>
      </details>
    </main>
  );
}
