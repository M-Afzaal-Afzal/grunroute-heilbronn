"use client";
// Choose a start or end: search any address, use the phone's location, or a
// known place. Search runs only on a tap of Search (Nominatim usage policy).
import { useEffect, useRef, useState } from "react";
import { PLACES, type PlaceKey } from "../lib/data";
import { searchPlaces, type Place } from "../lib/geocode";
import type { MapPlace } from "./MapView";

type Props = {
  which: "start" | "end";
  onPick: (p: MapPlace) => void;
  onClose: () => void;
};

type Find = "idle" | "loading" | "ok" | "empty" | "error";
type Here = "idle" | "loading" | "denied" | "error";

const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];

export default function PlacePicker({ which, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [find, setFind] = useState<Find>("idle");
  const [here, setHere] = useState<Here>("idle");
  const input = useRef<HTMLInputElement | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    input.current?.focus();
    return () => ctl.current?.abort();
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

  const title = which === "start" ? "Choose a start" : "Choose an end";
  return (
    <div className="picker" role="dialog" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="picker-head">
        <h3>{title}</h3>
        <button type="button" className="info-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <form className="picker-search" onSubmit={search} role="search">
        <label className="sr-only" htmlFor={`find-${which}`}>
          Address or place
        </label>
        <input ref={input} id={`find-${which}`} type="search" placeholder="Address or place, for example Kaiserstraße 10" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <button type="submit" className="btn" disabled={q.trim().length < 3 || find === "loading"}>
          {find === "loading" ? "Searching" : "Search"}
        </button>
      </form>
      <div aria-live="polite">
        {find === "empty" && <p className="picker-msg">Nothing found. Try a street name with a house number, or a known place.</p>}
        {find === "error" && <p className="picker-msg">The search did not answer. Try again, or tap the map instead.</p>}
        {find === "ok" && (
          <ul className="picker-list">
            {hits.map((h) => (
              <li key={`${h.at[0]},${h.at[1]}`}>
                <button type="button" onClick={() => onPick({ name: h.label, lat: h.at[0], lng: h.at[1] })}>
                  <b>{h.label}</b>
                  <span>{h.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="picker-here" onClick={locate} disabled={here === "loading"}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        {here === "loading" ? "Finding you..." : "Use my location"}
      </button>
      {here === "denied" && <p className="picker-msg">Location is blocked for this site. Allow it in the browser settings, or search instead.</p>}
      {here === "error" && <p className="picker-msg">Your location could not be found right now. Search or tap the map instead.</p>}
      <p className="picker-label">Places</p>
      <ul className="picker-list">
        {PLACE_KEYS.map((k) => (
          <li key={k}>
            <button type="button" onClick={() => onPick(PLACES[k])}>
              <b>{PLACES[k].name}</b>
            </button>
          </li>
        ))}
      </ul>
      <p className="picker-note">You can also tap the map. Search sends only the text you type to OpenStreetMap Nominatim. Your location stays on this phone, except as the start or end point for the route.</p>
    </div>
  );
}
