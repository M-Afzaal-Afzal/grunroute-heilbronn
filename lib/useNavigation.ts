"use client";
// Live directions in the browser: the location dot, voice and sound cues,
// off route help, and the screen kept on. The maths is in lib/nav.ts.
//
// Privacy: the location is read with watchPosition and only compared with the
// route already on the phone. It is never sent or stored. A re-route sends the
// current spot as the new start to the router, and the screen says so first.
import { useCallback, useEffect, useRef, useState } from "react";
import { CUE, OFF_ROUTE_M, OFF_ROUTE_READS, cueFor, cueSteps, cumulative, headingFor, offCount, startLine, progress, project, stepAlongs, type LatLng, type NavStep, type Progress } from "./nav";
import { fetchDirect, type Mode, type RawRoute } from "./routing";
import { LOCALE, type Lang } from "./i18n";
import { useLang } from "../components/LangProvider";

/** Spoken lines that are not turn instructions, in the page language. */
const SAY: Record<Lang, { off: string; newRoute: string }> = {
  en: { off: "Off route. Tap re-route to find a new way from here.", newRoute: "New route found." },
  de: { off: "Abseits der Route. Tippe auf Neue Route, um von hier einen neuen Weg zu finden.", newRoute: "Neue Route gefunden." },
};

export type NavStatus = "idle" | "locating" | "active" | "arrived" | "denied" | "unsupported";
/**
 * speed is in m/s from the phone, null when the phone does not give one.
 * heading is the way the arrow on the dot points, in degrees from north.
 * Neither leaves the browser.
 */
export type NavPos = { lat: number; lng: number; acc: number; speed: number | null; heading: number | null };

export type NavState = {
  status: NavStatus;
  pos: NavPos | null;
  route: RawRoute | null;
  progress: Progress | null;
  /** Metres of the route already covered. It only grows, so a jumpy reading does not bring a passed part back. */
  covered: number;
  next: NavStep | null;
  /** The turn after the next one, for the "Then" row. */
  then: NavStep | null;
  offRoute: boolean;
  rerouting: "idle" | "loading" | "error";
  muted: boolean;
};

type Prepared = { route: RawRoute; cum: number[]; steps: NavStep[]; alongs: number[]; total: number };

function prepare(route: RawRoute): Prepared {
  const cum = cumulative(route.coords);
  const steps = cueSteps(route.steps);
  return { route, cum, steps, alongs: stepAlongs(steps, route.coords, cum), total: cum[cum.length - 1] ?? 0 };
}

type Sound = "start" | "early" | "now" | "arrive" | "off";
// Short tones in the spirit of map apps: two rising notes before a turn, a quick double at the turn.
const PATTERN: Record<Sound, [number, number][]> = {
  start: [[523, 0], [784, 0.14]],
  early: [[660, 0], [880, 0.16]],
  now: [[880, 0], [880, 0.14]],
  arrive: [[523, 0], [659, 0.15], [784, 0.3]],
  off: [[440, 0], [330, 0.18]],
};

const IDLE: NavState = { status: "idle", pos: null, route: null, progress: null, covered: 0, next: null, then: null, offRoute: false, rerouting: "idle", muted: false };

export function useNavigation(mode: Mode, end: LatLng) {
  const lang = useLang();
  const [state, setState] = useState<NavState>(IDLE);
  const audio = useRef<AudioContext | null>(null);
  const watchId = useRef<number | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);
  const prep = useRef<Prepared | null>(null);
  const said = useRef(new Set<string>());
  const offN = useRef(0);
  const muted = useRef(false);
  const last = useRef<NavPos | null>(null);
  const active = useRef(false);
  const ctx = useRef({ mode, end, lang });
  useEffect(() => {
    ctx.current = { mode, end, lang };
  });

  const beep = useCallback((s: Sound) => {
    const a = audio.current;
    if (!a || muted.current) return;
    const t0 = a.currentTime + 0.02;
    for (const [f, at] of PATTERN[s]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.13);
      o.connect(g).connect(a.destination);
      o.start(t0 + at);
      o.stop(t0 + at + 0.15);
    }
  }, []);

  const say = useCallback((text: string, delay = 0) => {
    if (muted.current || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LOCALE[ctx.current.lang];
      u.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };
    if (delay) setTimeout(go, delay);
    else go();
  }, []);

  const releaseLock = useCallback(() => {
    lock.current?.release().catch(() => {});
    lock.current = null;
  }, []);

  const takeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && !lock.current) lock.current = await navigator.wakeLock.request("screen");
    } catch {
      // Not allowed (low battery, or the page is hidden). Directions still work.
    }
  }, []);

  const stopWatch = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const stop = useCallback(() => {
    active.current = false;
    stopWatch();
    releaseLock();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    audio.current?.close().catch(() => {});
    audio.current = null;
    prep.current = null;
    last.current = null;
    setState(IDLE);
  }, [stopWatch, releaseLock]);

  const onPos = useCallback(
    (gp: GeolocationPosition) => {
      const p = prep.current;
      if (!p || !active.current) return;
      const sp = gp.coords.speed;
      const speed = sp != null && Number.isFinite(sp) && sp >= 0 ? sp : null;
      const fix = project([gp.coords.latitude, gp.coords.longitude], p.route.coords, p.cum);
      const heading = headingFor(gp.coords.heading, speed, p.route.coords, fix, last.current?.heading ?? null);
      const pos: NavPos = { lat: gp.coords.latitude, lng: gp.coords.longitude, acc: gp.coords.accuracy, speed, heading };
      last.current = pos;
      const pr = progress(fix, p.alongs, p.total);
      const wasOff = offN.current >= OFF_ROUTE_READS;
      offN.current = offCount(offN.current, fix.off, pos.acc);
      const off = offN.current >= OFF_ROUTE_READS;
      let arrived = false;
      if (off && !wasOff) {
        beep("off");
        say(SAY[ctx.current.lang].off, 400);
      } else if (!off) {
        const cue = cueFor(pr, p.steps, ctx.current.mode, said.current, ctx.current.lang);
        if (cue) {
          said.current.add(cue.kind === "arrive" ? "arrive" : `${cue.step}:${cue.kind}`);
          beep(cue.kind === "arrive" ? "arrive" : cue.kind);
          say(cue.text, 450);
          arrived = cue.kind === "arrive";
        }
      }
      if (arrived) {
        // Done: stop reading the location and let the screen sleep again.
        stopWatch();
        releaseLock();
      }
      setState((s) => ({ ...s, status: arrived ? "arrived" : "active", pos, progress: pr, covered: off || fix.off > OFF_ROUTE_M ? s.covered : Math.max(s.covered, arrived ? p.total : fix.along), next: pr.next >= 0 ? p.steps[pr.next] : null, then: pr.next >= 0 ? (p.steps[pr.next + 1] ?? null) : null, offRoute: off }));
    },
    [beep, say, stopWatch, releaseLock]
  );

  const onErr = useCallback(
    (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) {
        active.current = false;
        stopWatch();
        releaseLock();
        setState((s) => ({ ...s, status: "denied" }));
      }
      // Timeouts and lost signal: keep watching, the next reading may come.
    },
    [stopWatch, releaseLock]
  );

  /** Must run inside the Start tap: iOS only allows sound and speech that a tap started. */
  const start = useCallback(
    (route: RawRoute) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setState({ ...IDLE, status: "unsupported" });
        return;
      }
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          audio.current = new AC();
          audio.current.resume().catch(() => {});
        }
      } catch {
        audio.current = null;
      }
      prep.current = prepare(route);
      said.current = new Set();
      offN.current = 0;
      active.current = true;
      const start = startLine(prep.current.steps, ctx.current.lang);
      // The start line already names the first turn, so skip its early cue.
      if (start.covers != null) said.current.add(`${start.covers}:early`);
      beep("start");
      say(start.text, 300);
      setState({ ...IDLE, muted: muted.current, status: "locating", route });
      watchId.current = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
      void takeLock();
    },
    [beep, say, onPos, onErr, takeLock]
  );

  const reroute = useCallback(async () => {
    const pos = last.current;
    if (!pos || !active.current) return;
    setState((s) => ({ ...s, rerouting: "loading" }));
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    try {
      const r = await fetchDirect([pos.lat, pos.lng], ctx.current.end, ctx.current.mode, c.signal);
      if (!r || !active.current) throw new Error("No route");
      prep.current = prepare(r);
      said.current = new Set();
      offN.current = 0;
      say(SAY[ctx.current.lang].newRoute);
      setState((s) => ({ ...s, route: r, covered: 0, offRoute: false, rerouting: "idle" }));
    } catch {
      setState((s) => ({ ...s, rerouting: "error" }));
    } finally {
      clearTimeout(t);
    }
  }, [say]);

  const setMuted = useCallback((m: boolean) => {
    muted.current = m;
    if (m && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState((s) => ({ ...s, muted: m }));
  }, []);

  // The screen lock drops when the page is hidden, take it again on return.
  // Leaving the page stops everything.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && active.current) void takeLock();
    };
    const onHide = () => {
      if (active.current) stop();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [takeLock, stop]);

  // Stop on unmount too.
  useEffect(() => () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    lock.current?.release().catch(() => {});
    audio.current?.close().catch(() => {});
  }, []);

  return { state, start, stop, reroute, setMuted, cue: CUE[mode] };
}
