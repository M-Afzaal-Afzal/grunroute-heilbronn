"use client";
// Choose a start or end, the way map apps do it: a search sheet that covers
// the screen on phones (a centred dialog on wide screens), with your location,
// choose on the map, and known places. Search runs only on a tap of Search
// (Nominatim usage policy). The native dialog keeps focus inside and closes on Escape.
import { useEffect, useRef, useState } from "react";
import { PLACES, type PlaceKey } from "../lib/data";
import { searchPlaces, type Place } from "../lib/geocode";
import type { MapPlace } from "./MapView";

type Props = {
  which: "start" | "end";
  onPick: (p: MapPlace) => void;
  onMap: () => void;
  onClose: () => void;
};

type Find = "idle" | "loading" | "ok" | "empty" | "error";
type Here = "idle" | "loading" | "denied" | "error";

const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];

const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.4" fill="currentColor" />
  </svg>
);

export default function PlacePicker({ which, onPick, onMap, onClose }: Props) {
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
    if (!("geolocation" in navigator)) {
      setHere("error");
      return;
    }
    setHere("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere("idle");
        onPick({ name: "Your location", lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (err) => setHere(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  const title = which === "start" ? "Where from?" : "Where to?";
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
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
          <h2 id="sheet-title">{title}</h2>
        </div>

        <form className="sheet-search" onSubmit={search} role="search">
          <label className="sr-only" htmlFor="sheet-find">
            Address or place
          </label>
          <input ref={input} id="sheet-find" type="search" placeholder="Street, address, or place" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
          <button type="submit" className="btn" disabled={q.trim().length < 3 || find === "loading"}>
            {find === "loading" ? "Searching" : "Search"}
          </button>
        </form>

        <div aria-live="polite">
          {find === "empty" && <p className="sheet-msg">Nothing found. Try a street name with a house number, or a place below.</p>}
          {find === "error" && <p className="sheet-msg">The search did not answer. Try again, or choose on the map.</p>}
          {find === "ok" && (
            <>
              <h3 className="sheet-label">Results</h3>
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
              <b>{here === "loading" ? "Finding you..." : "Use my location"}</b>
              <small>Your location stays on this phone.</small>
            </button>
          </li>
          <li>
            <button type="button" onClick={onMap}>
              <span className="sheet-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </span>
              <b>Choose on the map</b>
              <small>Close this and tap a point.</small>
            </button>
          </li>
        </ul>
        {here === "denied" && <p className="sheet-msg">Location is blocked for this site. Allow it in the browser settings, or search instead.</p>}
        {here === "error" && <p className="sheet-msg">Your location could not be found right now. Search or choose on the map instead.</p>}

        <h3 className="sheet-label">Places in Heilbronn</h3>
        <ul className="sheet-list">
          {PLACE_KEYS.map((k) => (
            <li key={k}>
              <button type="button" onClick={() => onPick(PLACES[k])}>
                <span className="sheet-icon">
                  <PinIcon />
                </span>
                <b>{PLACES[k].name}</b>
              </button>
            </li>
          ))}
        </ul>
        <p className="sheet-note">Search sends only the text you type to OpenStreetMap Nominatim. Your location stays on this phone, except as the start or end point for the route.</p>
      </div>
    </dialog>
  );
}
