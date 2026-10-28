"use client";
// Live directions on the map: the next turn at the top with a "Then" row (and
// Re-route when off route), round buttons on the right, the phone's speed, and
// at the bottom the route card and the trip status with End.
import { useEffect, useRef } from "react";
import { fmtDistance, instruction, type NavStep } from "../lib/nav";
import type { NavState } from "../lib/useNavigation";
import type { Mode } from "../lib/routing";

type Props = {
  state: NavState;
  mode: Mode;
  endName: string;
  follow: boolean;
  onRecentre: () => void;
  onMute: (m: boolean) => void;
  onReroute: () => void;
  onEnd: () => void;
  /** Fit the whole followed line on the map. */
  onWhole: () => void;
  /** The chosen route's name and why, until the user dismisses it. */
  card: { name: string; reason: string } | null;
  onDismissCard: () => void;
};

// Speeds used only for the time left: OSRM's own average for the chosen route.
function minutesLeft(state: NavState) {
  const r = state.route;
  if (!r || !state.progress || !r.distance) return null;
  return Math.max(1, Math.round((r.duration * (state.progress.remaining / r.distance)) / 60));
}

function arrow(s: NavStep | null) {
  const m = s?.modifier ?? "";
  if (s?.type === "arrive") return "M12 3a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6zm0 8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z";
  if (s?.type === "roundabout" || s?.type === "rotary") return "M12 21v-6M12 15a4 4 0 1 0-4-4M8 11l-2-2m2 2 2-2";
  if (m === "uturn") return "M8 21V9a4 4 0 0 1 8 0v4m0 0-3-3m3 3 3-3";
  if (m.includes("left")) return "M16 21v-8a4 4 0 0 0-4-4H5m0 0 4-4M5 9l4 4";
  if (m.includes("right")) return "M8 21v-8a4 4 0 0 1 4-4h7m0 0-4-4m4 4-4 4";
  return "M12 21V4m0 0-5 5m5-5 5 5";
}

function Arrow({ step, size }: { step: NavStep | null; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={arrow(step)} fill={step?.type === "arrive" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function NavPanel({ state, mode, endName, follow, onRecentre, onMute, onReroute, onEnd, onWhole, card, onDismissCard }: Props) {
  const p = state.progress;
  const next = state.next;
  const then = state.status === "active" && !state.offRoute && next?.type !== "arrive" ? state.then : null;
  // Speed from watchPosition, m/s to km/h. It stays on this phone.
  const kmh = state.status === "active" && state.pos?.speed != null ? Math.round(state.pos.speed * 3.6) : null;
  const left = minutesLeft(state);
  const off = state.offRoute && state.status === "active";
  const bar = useRef<HTMLDivElement | null>(null);

  // Keep the map attribution and the round buttons just above the bottom part, whatever its height.
  useEffect(() => {
    const el = bar.current;
    const page = el?.closest<HTMLElement>(".page");
    if (!el || !page) return;
    const ro = new ResizeObserver(() => page.style.setProperty("--nav-bar-h", `${Math.ceil(el.offsetHeight)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      page.style.removeProperty("--nav-bar-h");
    };
  }, []);
  const head =
    state.status === "locating"
      ? "Finding your location..."
      : state.status === "arrived"
        ? "You have arrived"
        : state.status === "denied"
          ? "Location is blocked"
          : state.status === "unsupported"
            ? "This browser cannot share a location"
            : state.offRoute
              ? "Off route"
              : next
                ? instruction(next)
                : "Follow the green line";

  return (
    <>
      <div className={`nav-turn${state.offRoute ? " is-off" : ""}${state.status === "arrived" ? " is-done" : ""}`} data-map-cover="top">
        {state.offRoute ? (
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
            <path d="M12 3 2 20h20zM12 10v4.5M12 17.2v.3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <Arrow step={state.status === "arrived" ? { type: "arrive", name: "", lat: 0, lng: 0 } : next} size={40} />
        )}
        <div role="status" aria-live="polite">
          {state.status === "active" && !state.offRoute && p?.toNext != null && <p className="nav-dist">{fmtDistance(p.toNext)}</p>}
          <p className="nav-text">{head}</p>
          {state.offRoute && <p className="nav-sub">More than 40 m from the line for a few readings.</p>}
          {state.status === "denied" && <p className="nav-sub">Allow location for this site in the browser settings, then start again.</p>}
        </div>
        {then && (
          <p className="nav-then">
            <span>Then</span>
            <Arrow step={then} size={22} />
            <span className="nav-then-text">{instruction(then)}</span>
          </p>
        )}
        {off && (
          <button type="button" className="nav-reroute" onClick={onReroute} disabled={state.rerouting === "loading"}>
            {state.rerouting === "loading" ? "Finding a new route..." : state.rerouting === "error" ? "Try re-route again" : "Re-route from here"}
          </button>
        )}
      </div>

      <div className="nav-ctrls" role="group" aria-label="Map controls">
        {!follow && state.pos && (
          <button type="button" className="map-btn" onClick={onRecentre} aria-label="Re-centre on my location" title="Re-centre">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button type="button" className="map-btn" onClick={() => onMute(!state.muted)} aria-pressed={state.muted} aria-label={state.muted ? "Sound off, tap to turn on" : "Sound on, tap to mute"} title="Sound">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {state.muted ? <path d="M16 9l5 6m0-6-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button>
        <button type="button" className="map-btn" onClick={onWhole} aria-label="Show the whole route" title="Whole route">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {kmh != null && (
        <p className="nav-speed" aria-label={`Speed from this phone: ${kmh} kilometres per hour`}>
          <b>{kmh}</b>
          <span>km/h</span>
        </p>
      )}

      <div className="nav-bottom" ref={bar} data-map-cover="bottom">
        {card && (
          <div className="nav-card">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="nav-card-name">{card.name}</p>
              <p className="nav-card-why">{card.reason}</p>
            </div>
            <button type="button" className="nav-card-x" onClick={onDismissCard}>
              Dismiss
            </button>
          </div>
        )}
        <div className="nav-bar">
          <div className="nav-status">
            <p>
              <b>{state.status === "arrived" ? "Arrived" : left != null ? `${left} min` : mode === "bike" ? "By bike" : "On foot"}</b>
              {p && state.status !== "arrived" && <span> · {fmtDistance(p.remaining)} left</span>}
            </p>
            <p className="nav-to">To {endName}</p>
            <p className="nav-privacy">Your location stays on this phone.</p>
          </div>
          <button type="button" className="btn nav-end" onClick={onEnd}>
            End
          </button>
        </div>
      </div>
    </>
  );
}
