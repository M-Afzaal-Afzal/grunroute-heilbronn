"use client";
// Live directions on the map: the next turn at the top (with Re-route when off
// route), and the trip status with re-centre, mute and end at the bottom.
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

export default function NavPanel({ state, mode, endName, follow, onRecentre, onMute, onReroute, onEnd }: Props) {
  const p = state.progress;
  const next = state.next;
  const left = minutesLeft(state);
  const off = state.offRoute && state.status === "active";
  const bar = useRef<HTMLDivElement | null>(null);

  // Keep the map attribution just above the bottom bar, whatever its height.
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
      <div className={`nav-turn${state.offRoute ? " is-off" : ""}${state.status === "arrived" ? " is-done" : ""}`}>
        <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
          {state.offRoute ? (
            <path d="M12 3 2 20h20zM12 10v4.5M12 17.2v.3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d={arrow(state.status === "arrived" ? { type: "arrive", name: "", lat: 0, lng: 0 } : next)} fill={next?.type === "arrive" || state.status === "arrived" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        <div role="status" aria-live="polite">
          {state.status === "active" && !state.offRoute && p?.toNext != null && <p className="nav-dist">{fmtDistance(p.toNext)}</p>}
          <p className="nav-text">{head}</p>
          {state.offRoute && <p className="nav-sub">More than 40 m from the line for a few readings.</p>}
          {state.status === "denied" && <p className="nav-sub">Allow location for this site in the browser settings, then start again.</p>}
        </div>
        {off && (
          <button type="button" className="nav-reroute" onClick={onReroute} disabled={state.rerouting === "loading"}>
            {state.rerouting === "loading" ? "Finding a new route..." : state.rerouting === "error" ? "Try re-route again" : "Re-route from here"}
          </button>
        )}
      </div>

      <div className="nav-bar" ref={bar}>
        <div className="nav-status">
          <p>
            <b>{state.status === "arrived" ? "Arrived" : left != null ? `${left} min` : mode === "bike" ? "By bike" : "On foot"}</b>
            {p && state.status !== "arrived" && <span> · {fmtDistance(p.remaining)} left</span>}
          </p>
          <p className="nav-to">To {endName}</p>
          <p className="nav-privacy">Your location stays on this phone.</p>
        </div>
        <div className="nav-actions">
          {!follow && state.pos && (
            <button type="button" className="nav-centre" onClick={onRecentre} aria-label="Re-centre on my location">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Centre
            </button>
          )}
          <button type="button" className="nav-icon" onClick={() => onMute(!state.muted)} aria-pressed={state.muted} aria-label={state.muted ? "Sound off, tap to turn on" : "Sound on, tap to mute"}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {state.muted ? <path d="M16 9l5 6m0-6-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </button>
          <button type="button" className="btn nav-end" onClick={onEnd}>
            End
          </button>
        </div>
      </div>
    </>
  );
}
