"use client";
// Choose a start or end, the way map apps do it: a search sheet that covers
// the screen on phones (a centred dialog on wide screens), with your location,
// choose on the map, and known places. Search runs only on a tap of Search
// (Nominatim usage policy). The native dialog keeps focus inside and closes on Escape.
import { useEffect, useRef, useState } from "react";
import { PLACES, type PlaceKey } from "../lib/data";
import { searchPlaces, type Place } from "../lib/geocode";
import type { MapPlace } from "./MapView";
import { useLang } from "./LangProvider";
import { locateOnce, type LocateFail } from "../lib/locate";

const EN = {
  here: "Your location",
  from: "Where from?",
  to: "Where to?",
  close: "Close",
  field: "Address or place",
  placeholder: "Street, address, or place",
  searching: "Searching",
  search: "Search",
  empty: "Nothing found. Try a street name with a house number, or a place below.",
  error: "The search did not answer. Try again, or choose on the map.",
  results: "Results",
  finding: "Finding you...",
  useHere: "Use my location",
  stays: "Your location stays on this phone.",
  onMap: "Choose on the map",
  onMapSub: "Close this and tap a point.",
  denied: "Location is blocked for this site. Allow it in the browser settings, or search instead.",
  hereOff: "This device gave the browser no position. Turn on location for your browser in the device settings (on a Mac: System Settings, Privacy and Security, Location Services). Or search instead.",
  hereSlow: "Finding your location took too long. Try again, or search instead.",
  places: "Places in Heilbronn",
  note: "Search sends only the text you type to OpenStreetMap Nominatim. Your location stays on this phone, except as the start or end point for the route.",
};
const DE: typeof EN = {
  here: "Dein Standort",
  from: "Von wo?",
  to: "Wohin?",
  close: "Schließen",
  field: "Adresse oder Ort",
  placeholder: "Straße, Adresse oder Ort",
  searching: "Suche läuft",
  search: "Suchen",
  empty: "Nichts gefunden. Versuche einen Straßennamen mit Hausnummer oder einen Ort unten.",
  error: "Die Suche hat nicht geantwortet. Versuche es noch einmal oder wähle auf der Karte.",
  results: "Ergebnisse",
  finding: "Standort wird gesucht...",
  useHere: "Meinen Standort nutzen",
  stays: "Dein Standort bleibt auf diesem Handy.",
  onMap: "Auf der Karte wählen",
  onMapSub: "Schließe dies und tippe auf einen Punkt.",
  denied: "Der Standort ist für diese Seite blockiert. Erlaube ihn in den Browser-Einstellungen oder suche stattdessen.",
  hereOff: "Dieses Gerät hat dem Browser keinen Standort gegeben. Schalte den Standort für deinen Browser in den Geräte-Einstellungen ein (auf dem Mac: Systemeinstellungen, Datenschutz und Sicherheit, Ortungsdienste). Oder suche stattdessen.",
  hereSlow: "Die Suche nach deinem Standort hat zu lange gedauert. Versuche es noch einmal oder suche stattdessen.",
  places: "Orte in Heilbronn",
  note: "Die Suche sendet nur den eingegebenen Text an OpenStreetMap Nominatim. Dein Standort bleibt auf diesem Handy, außer als Start- oder Zielpunkt für die Route.",
};
const T = { en: EN, de: DE };

/** German names for the known places whose English name has English words in it. */
const PLACE_DE: Partial<Record<PlaceKey, string>> = {
  station: "Hauptbahnhof",
  marktplatz: "Marktplatz und Rathaus",
  campus: "Bildungscampus und Hochschule",
};

type Props = {
  which: "start" | "end";
  onPick: (p: MapPlace) => void;
  onMap: () => void;
  onClose: () => void;
};

type Find = "idle" | "loading" | "ok" | "empty" | "error";
type Here = "idle" | "loading" | LocateFail;

const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];

const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.4" fill="currentColor" />
  </svg>
);

export default function PlacePicker({ which, onPick, onMap, onClose }: Props) {
  const lang = useLang();
  const t = T[lang];
  const place = (k: PlaceKey) => (lang === "de" && PLACE_DE[k] ? { ...PLACES[k], name: PLACE_DE[k] } : PLACES[k]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [find, setFind] = useState<Find>("idle");
  const [here, setHere] = useState<Here>("idle");
  const dlg = useRef<HTMLDialogElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    input.current?.focus();
    // The page behind the sheet should not scroll.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      ctl.current?.abort();
      root.style.overflow = before;
      if (d?.open) d.close();
    };
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setFind("loading");
    try {
      const r = await searchPlaces(q, c.signal);
      setHits(r);
      setFind(r.length ? "ok" : "empty");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setFind("error");
    }
  }

  function locate() {
    setHere("loading");
    locateOnce((p) => {
      setHere("idle");
      onPick({ name: t.here, lat: p.coords.latitude, lng: p.coords.longitude });
    }, setHere);
  }

  const title = which === "start" ? t.from : t.to;
  return (
    <dialog
      ref={dlg}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dlg.current && onClose()}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <button type="button" className="sheet-close" onClick={onClose} aria-label={t.close}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
          <h2 id="sheet-title">{title}</h2>
        </div>

        <form className="sheet-search" onSubmit={search} role="search">
          <label className="sr-only" htmlFor="sheet-find">
            {t.field}
          </label>
          <input ref={input} id="sheet-find" type="search" placeholder={t.placeholder} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
          <button type="submit" className="btn" disabled={q.trim().length < 3 || find === "loading"}>
            {find === "loading" ? t.searching : t.search}
          </button>
        </form>

        <div aria-live="polite">
          {find === "empty" && <p className="sheet-msg">{t.empty}</p>}
          {find === "error" && <p className="sheet-msg">{t.error}</p>}
          {find === "ok" && (
            <>
              <h3 className="sheet-label">{t.results}</h3>
              <ul className="sheet-list">
                {hits.map((h) => (
                  <li key={`${h.at[0]},${h.at[1]}`}>
                    <button type="button" onClick={() => onPick({ name: h.label, lat: h.at[0], lng: h.at[1] })}>
                      <span className="sheet-icon">
                        <PinIcon />
                      </span>
                      <b>{h.label}</b>
                      {h.detail && <small>{h.detail}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <ul className="sheet-list">
          <li>
            <button type="button" onClick={locate} disabled={here === "loading"}>
              <span className="sheet-icon is-here">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" fill="currentColor" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
              <b>{here === "loading" ? t.finding : t.useHere}</b>
              <small>{t.stays}</small>
            </button>
          </li>
          <li>
            <button type="button" onClick={onMap}>
              <span className="sheet-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </span>
              <b>{t.onMap}</b>
              <small>{t.onMapSub}</small>
            </button>
          </li>
        </ul>
        {here === "denied" && <p className="sheet-msg">{t.denied}</p>}
        {here === "off" && <p className="sheet-msg">{t.hereOff}</p>}
        {here === "slow" && <p className="sheet-msg">{t.hereSlow}</p>}

        <h3 className="sheet-label">{t.places}</h3>
        <ul className="sheet-list">
          {PLACE_KEYS.map((k) => (
            <li key={k}>
              <button type="button" onClick={() => onPick(place(k))}>
                <span className="sheet-icon">
                  <PinIcon />
                </span>
                <b>{place(k).name}</b>
              </button>
            </li>
          ))}
        </ul>
        <p className="sheet-note">{t.note}</p>
      </div>
    </dialog>
  );
}
