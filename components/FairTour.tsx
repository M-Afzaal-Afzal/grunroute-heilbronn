"use client";
// Fair mode (?fair=1): large type and a tour that moves on every 12 s.
// Any tap or key press stops it and shows the normal page.
import { useEffect, useRef, useState } from "react";
import { RULE_150 } from "../lib/segments";
import type { RouteOption } from "../lib/routing";
import { fmtNum } from "../lib/i18n";
import { useLang } from "./LangProvider";

const EN = {
  label: "Fair tour, tap anywhere to stop",
  kicker0: "Bike sensors in Heilbronn",
  rule: RULE_150,
  loading: "Loading the street data...",
  kicker1: "A cooler way, not just the fastest",
  route: (min: number, trees: string) => `${min} min, ${trees} trees/km`,
  fastest: "Fastest",
  compare: "Pick any start and end. We compare the fastest route with a greener one.",
  kicker2: "Hot or not?",
  play: "Two real spots from the summer heat walks. Which one was warmer? Five rounds, no sign up.",
  kicker3: "Help measure",
  measure: "Short ride missions where the city has little data. Ride only your normal, safe routes in daylight.",
  kicker4: "Scan to try",
  promise: "No app. No sign up. No personal tracking.",
  stop: "Tap anywhere to explore",
};
const DE: typeof EN = {
  label: "Messe-Tour, tippe irgendwo zum Beenden",
  kicker0: "Rad-Sensoren in Heilbronn",
  rule: "150 cm ist der Mindestabstand beim Überholen für Autos innerorts in Deutschland. Sensorwerte sind Schätzungen und beweisen nicht, dass ein einzelnes Überholen gegen die Regel verstieß.",
  loading: "Straßendaten werden geladen...",
  kicker1: "Ein kühlerer Weg, nicht nur der schnellste",
  route: (min: number, trees: string) => `${min} min, ${trees} Bäume/km`,
  fastest: "Schnellste",
  compare: "Wähle einen Start und ein Ziel. Wir vergleichen die schnellste Route mit einer grüneren.",
  kicker2: "Heiß oder nicht?",
  play: "Zwei echte Orte aus den Hitze-Rundgängen im Sommer. Wo war es wärmer? Fünf Runden, keine Anmeldung.",
  kicker3: "Mitmessen",
  measure: "Kurze Rad-Missionen, wo die Stadt wenig Daten hat. Fahre nur deine normalen, sicheren Wege bei Tageslicht.",
  kicker4: "Zum Ausprobieren scannen",
  promise: "Keine App. Keine Anmeldung. Kein persönliches Tracking.",
  stop: "Tippe irgendwo zum Erkunden",
};
const T = { en: EN, de: DE };

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
  const lang = useLang();
  const t = T[lang];
  // English keeps the plain number as before, German gets a decimal comma.
  const num = (n: number) => (lang === "de" ? fmtNum(n, lang) : String(n));
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
    <div className="fair" role="dialog" aria-label={t.label}>
      <div className="fair-slide" key={step}>
        {step === 0 && (
          <>
            <p className="fair-kicker">{t.kicker0}</p>
            {hero ? (
              <>
                <p className="fair-big">{hero.big}</p>
                <p className="fair-text">{hero.text}</p>
                <p className="fair-note">
                  {hero.caveat} {t.rule}
                </p>
              </>
            ) : (
              <p className="fair-text">{t.loading}</p>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <p className="fair-kicker">{t.kicker1}</p>
            {green && fast && green !== fast ? (
              <dl className="fair-compare">
                <div>
                  <dt>GrünRoute</dt>
                  <dd>
                    {t.route(green.metrics.min, num(green.metrics.treesPerKm))}
                  </dd>
                </div>
                <div>
                  <dt>{t.fastest}</dt>
                  <dd>
                    {t.route(fast.metrics.min, num(fast.metrics.treesPerKm))}
                  </dd>
                </div>
              </dl>
            ) : null}
            <p className="fair-text">{compare ?? t.compare}</p>
          </>
        )}
        {step === 2 && (
          <>
            <p className="fair-kicker">{t.kicker2}</p>
            <p className="fair-text">{t.play}</p>
          </>
        )}
        {step === 3 && (
          <>
            <p className="fair-kicker">{t.kicker3}</p>
            <p className="fair-text">{t.measure}</p>
          </>
        )}
        {step === 4 && (
          <>
            <p className="fair-kicker">{t.kicker4}</p>
            <div className="fair-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="fair-text">{t.promise}</p>
          </>
        )}
      </div>
      <ol className="fair-dots" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => (
          <li key={i} className={i === step ? "is-on" : ""} />
        ))}
      </ol>
      <p className="fair-stop">{t.stop}</p>
    </div>
  );
}
