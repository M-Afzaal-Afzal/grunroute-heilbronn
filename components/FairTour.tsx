"use client";
// Fair mode (?fair=1): large type and a tour that moves on every 12 s.
// Any tap or key press stops it and shows the normal page.
import { useEffect, useRef, useState } from "react";
import { RULE_150 } from "../lib/segments";
import type { RouteOption } from "../lib/routing";

type Props = {
  qr: string;
  hero: { big: string; text: string; caveat: string } | null;
  compare: string | null;
  green: RouteOption | undefined;
  fast: RouteOption | undefined;
  onStop: () => void;
};

const STEP_MS = 12000;
const STEPS = 5;

export default function FairTour({ qr, hero, compare, green, fast, onStop }: Props) {
  const [step, setStep] = useState(0);
  const stopRef = useRef(onStop);
  useEffect(() => {
    stopRef.current = onStop;
  });

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS), STEP_MS);
    const stop = () => stopRef.current();
    window.addEventListener("pointerdown", stop);
    window.addEventListener("keydown", stop);
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
    };
  }, []);

  return (
    <div className="fair" role="dialog" aria-label="Fair tour, tap anywhere to stop">
      <div className="fair-slide" key={step}>
        {step === 0 && (
          <>
            <p className="fair-kicker">Bike sensors in Heilbronn</p>
            {hero ? (
              <>
                <p className="fair-big">{hero.big}</p>
                <p className="fair-text">{hero.text}</p>
                <p className="fair-note">
                  {hero.caveat} {RULE_150}
                </p>
              </>
            ) : (
              <p className="fair-text">Loading the street data...</p>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <p className="fair-kicker">A cooler way, not just the fastest</p>
            {green && fast && green !== fast ? (
              <dl className="fair-compare">
                <div>
                  <dt>GrünRoute</dt>
                  <dd>
                    {green.metrics.min} min, {green.metrics.treesPerKm} trees/km
                  </dd>
                </div>
                <div>
                  <dt>Fastest</dt>
                  <dd>
                    {fast.metrics.min} min, {fast.metrics.treesPerKm} trees/km
                  </dd>
                </div>
              </dl>
            ) : null}
            <p className="fair-text">{compare ?? "Pick any start and end. We compare the fastest route with a greener one."}</p>
          </>
        )}
        {step === 2 && (
          <>
            <p className="fair-kicker">Hot or not?</p>
            <p className="fair-text">Two real spots from the summer heat walks. Which one was warmer? Five rounds, no sign up.</p>
          </>
        )}
        {step === 3 && (
          <>
            <p className="fair-kicker">Help measure</p>
            <p className="fair-text">Short ride missions where the city has little data. Ride only your normal, safe routes in daylight.</p>
          </>
        )}
        {step === 4 && (
          <>
            <p className="fair-kicker">Scan to try</p>
            <div className="fair-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="fair-text">No app. No sign up. No personal tracking.</p>
          </>
        )}
      </div>
      <ol className="fair-dots" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => (
          <li key={i} className={i === step ? "is-on" : ""} />
        ))}
      </ol>
      <p className="fair-stop">Tap anywhere to explore</p>
    </div>
  );
}
