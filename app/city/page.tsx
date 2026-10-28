"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import "./city.css";
import { BANDS } from "../../lib/data";
import { HEAT_WALK } from "../../lib/heat-walks";
import { loadDangerPoints } from "../../lib/atrai";
import { loadCityTrees, type CityTrees } from "../../lib/cityTrees";
import { HEAT, type DangerPoint } from "../../lib/geo";
import {
  EFFORT_LABEL,
  EVIDENCE_LABEL,
  KIND_LABEL,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  closePassCounts,
  districtAt,
  districtStats,
  heatIssues,
  issuesCsv,
  loadOvertaking,
  loadSurface,
  safetyIssues,
  surfaceIssues,
  type Effort,
  type Evidence,
  type Issue,
  type IssueKind,
  type Priority,
  type Segment,
} from "../../lib/city";
import { LogoMark } from "../../components/brand/Logo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import type { CityLayers } from "../../components/city/CityMap";

const CityMap = dynamic(() => import("../../components/city/CityMap"), {
  ssr: false,
  loading: () => <div className="cp-mapdiv cp-map-loading" aria-hidden="true" />,
});

type Tab = "overview" | "issues" | "map" | "trees" | "data";
type Load = "loading" | "ok" | "error";
type Status = "new" | "check" | "planned" | "doing" | "done" | "none";
type Work = Record<string, { status: Status; note: string; at: string }>;

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "issues", label: "Issues" },
  { id: "map", label: "Map" },
  { id: "trees", label: "Trees by district" },
  { id: "data", label: "Data and method" },
];

const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  check: "Ground check booked",
  planned: "Planned",
  doing: "In progress",
  done: "Done",
  none: "No action needed",
};
const STATUSES = Object.keys(STATUS_LABEL) as Status[];
const KINDS: IssueKind[] = ["safety", "surface", "heat"];
const TEAMS = ["Traffic and mobility", "Road works", "Parks and trees"];
const EVIDENCE_RANK: Record<Evidence, number> = { strong: 0, medium: 1, weak: 2 };
const WORK_KEY = "grunroute-city-work-v1";
const PAGE = 40;

const fmt = (n: number) => n.toLocaleString("en-GB");
const pct = (x: number) => `${Math.round(x * 100)}%`;

function KindIcon({ kind }: { kind: IssueKind }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === "safety" && <path d="M5 17a3 3 0 1 0 0-.01M19 17a3 3 0 1 0 0-.01M5 17l4-8h6l4 8M9 9l3 8h2" />}
      {kind === "surface" && <path d="M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0M3 9h18" />}
      {kind === "heat" && <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />}
    </svg>
  );
}

function PrioTag({ p }: { p: Priority }) {
  return <span className={`cp-prio cp-prio-${p}`}>{PRIORITY_LABEL[p]}</span>;
}

function sortIssues(list: Issue[]) {
  return [...list].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      EVIDENCE_RANK[a.evidence] - EVIDENCE_RANK[b.evidence] ||
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
      b.metric - a.metric
  );
}

export default function CityPage() {
  const [tab, setTab] = useState<Tab>("overview");

  // Data, read live in the browser.
  const [over, setOver] = useState<Segment[] | null>(null);
  const [surface, setSurface] = useState<Segment[] | null>(null);
  const [danger, setDanger] = useState<DangerPoint[] | null>(null);
  const [ct, setCt] = useState<CityTrees | null>(null);
  const [state, setState] = useState<Record<"over" | "surface" | "danger" | "trees", Load>>({ over: "loading", surface: "loading", danger: "loading", trees: "loading" });
  const [tryN, setTryN] = useState(0);

  // Issue list controls.
  const [kind, setKind] = useState<IssueKind | "all">("all");
  const [prios, setPrios] = useState<Priority[]>(["act", "check", "plan"]);
  const [district, setDistrict] = useState("all");
  const [team, setTeam] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  // Map.
  const [layers, setLayers] = useState<CityLayers>({ issues: true, safety: false, density: true, surface: false, heat: false, trees: false, coverage: false });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  // Status and notes, kept in this browser only.
  const [work, setWork] = useState<Work>({});
  const [briefDate, setBriefDate] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setWork(JSON.parse(localStorage.getItem(WORK_KEY) || "{}") as Work);
      } catch {
        // Private mode or blocked storage: start empty.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const done = (k: keyof typeof state, s: Load) => alive && setState((x) => ({ ...x, [k]: s }));
    loadOvertaking()
      .then((d) => alive && (setOver(d), done("over", "ok")))
      .catch(() => done("over", "error"));
    loadDangerPoints()
      .then((d) => alive && (setDanger(d), done("danger", "ok")))
      .catch(() => done("danger", "error"));
    loadCityTrees()
      .then((d) => alive && (setCt(d), done("trees", "ok")))
      .catch(() => done("trees", "error"));
    loadSurface()
      .then((d) => alive && (setSurface(d), done("surface", "ok")))
      .catch(() => done("surface", "error"));
    return () => {
      alive = false;
    };
  }, [tryN]);

  const retry = () => {
    setState((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === "error" ? "loading" : v])) as typeof x);
    setTryN((n) => n + 1);
  };

  // ---------- Issues ----------
  const safety = useMemo(() => (over ? safetyIssues(over) : []), [over]);
  const surf = useMemo(() => (surface ? surfaceIssues(surface) : null), [surface]);
  const heat = useMemo(() => heatIssues(ct), [ct]);
  const closeCounts = useMemo(() => (danger && safety.length ? closePassCounts(safety, danger) : null), [danger, safety]);

  const all = useMemo(() => {
    const s = closeCounts ? safety.map((i) => ({ ...i, facts: [...i.facts, { label: "Close pass points within 15 m", value: fmt(closeCounts.get(i.id) ?? 0) }] })) : safety;
    return sortIssues([...s, ...(surf?.issues ?? []), ...heat]);
  }, [safety, surf, heat, closeCounts]);

  const districtOf = useMemo(() => {
    const m = new Map<string, string>();
    if (ct) for (const i of all) m.set(i.id, districtAt(ct, i.at));
    return m;
  }, [ct, all]);
  const districts = useMemo(() => [...new Set(districtOf.values())].filter(Boolean).sort(), [districtOf]);

  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const workOf = useCallback((id: string) => work[id] ?? { status: "new" as Status, note: "", at: "" }, [work]);

  function updateWork(id: string, patch: Partial<{ status: Status; note: string }>) {
    setWork((w) => {
      const n: Work = { ...w, [id]: { ...(w[id] ?? { status: "new", note: "" }), ...patch, at: new Date().toISOString() } };
      try {
        localStorage.setItem(WORK_KEY, JSON.stringify(n));
      } catch {
        // Storage blocked: the change still shows until the page reloads.
      }
      return n;
    });
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        prios.includes(i.priority) &&
        (district === "all" || districtOf.get(i.id) === district) &&
        (team === "all" || i.owner === team) &&
        (!term || i.title.toLowerCase().includes(term))
    );
  }, [all, kind, prios, district, team, q, districtOf]);

  const count = (p: Priority, k?: IssueKind) => all.filter((i) => i.priority === p && (!k || i.kind === k)).length;
  const loadingAny = Object.values(state).some((s) => s === "loading");
  const errorAny = Object.values(state).some((s) => s === "error");

  const focus = focusId ? byId.get(focusId) ?? null : null;
  const mapIssues = useMemo(() => all.filter((i) => i.priority !== "watch"), [all]);

  function showOnMap(id: string) {
    setFocusId(id);
    setFocusKey((k) => k + 1);
    setTab("map");
    window.scrollTo({ top: 0 });
  }

  function openIssue(id: string) {
    setOpenId(id);
    setFocusId(id);
  }

  function exportCsv() {
    const csv = issuesCsv(all, (i) => districtOf.get(i.id) ?? "", (id) => {
      const w = workOf(id);
      return { status: STATUS_LABEL[w.status], note: w.note };
    });
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grunroute-heilbronn-issues-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function printBrief() {
    setBriefDate(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
    setTimeout(() => window.print(), 50);
  }

  const trees = useMemo(() => (ct ? districtStats(ct) : null), [ct]);
  const heatWarm = HEAT.filter((c) => c[2] >= 1).length;
  const open = all.filter((i) => i.priority !== "watch");
  const statusCounts = STATUSES.map((s) => ({ s, n: open.filter((i) => workOf(i.id).status === s).length }));

  // ---------- Pieces ----------

  const detail = (i: Issue, compact = false) => {
    const w = workOf(i.id);
    const byEffort = (e: Effort) => i.measures.filter((m) => m.effort === e);
    return (
      <div className="cp-detail">
        <dl className="cp-facts">
          {i.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className={`cp-ev cp-ev-${i.evidence}`}>
          <b>{EVIDENCE_LABEL[i.evidence]}.</b> {i.evidenceText}.{i.evidence === "weak" && " Check on the ground before any decision."}
        </p>
        <div className="cp-measures">
          {(["quick", "medium", "big"] as Effort[]).map((e) =>
            byEffort(e).length ? (
              <div key={e}>
                <h4 className={`cp-eff cp-eff-${e}`}>{EFFORT_LABEL[e]}</h4>
                <ul>
                  {byEffort(e).map((m) => (
                    <li key={m.text}>{m.text}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
        <p className="cp-meta">
          <span>
            <b>Team:</b> {i.owner}
          </span>
          <span>
            <b>Supports:</b> {i.plans.join(", ")}
          </span>
          {districtOf.get(i.id) && (
            <span>
              <b>District:</b> {districtOf.get(i.id)}
            </span>
          )}
        </p>
        <div className="cp-work">
          <label className="cp-field">
            <span>Status</span>
            <Select value={w.status} onValueChange={(v) => updateWork(i.id, { status: v as Status })}>
              <SelectTrigger aria-label={`Status of ${i.title}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="cp-field cp-note">
            <span>Note</span>
            <textarea rows={compact ? 2 : 2} value={w.note} placeholder="For example: site visit on 12 Nov, parked cars on the lane" onChange={(e) => updateWork(i.id, { note: e.target.value })} />
          </label>
        </div>
        {!compact && (
          <button type="button" className="cp-btn cp-btn-quiet" onClick={() => showOnMap(i.id)}>
            Show on map
          </button>
        )}
      </div>
    );
  };

  const issueRow = (i: Issue) => {
    const open = openId === i.id;
    const st = workOf(i.id).status;
    return (
      <li key={i.id} className={`cp-row${open ? " is-open" : ""}`}>
        <button type="button" className="cp-row-main" aria-expanded={open} onClick={() => setOpenId(open ? null : i.id)}>
          <span className={`cp-kind cp-kind-${i.kind}`} title={KIND_LABEL[i.kind]}>
            <KindIcon kind={i.kind} />
          </span>
          <span className="cp-row-body">
            <span className="cp-row-title">{i.title}</span>
            <span className="cp-row-sub">
              {KIND_LABEL[i.kind]}
              {districtOf.get(i.id) ? `, ${districtOf.get(i.id)}` : ""}
            </span>
          </span>
          <span className="cp-row-metric">{i.metricText}</span>
          <span className="cp-row-tags">
            <PrioTag p={i.priority} />
            <span className={`cp-evtag cp-evtag-${i.evidence}`}>{EVIDENCE_LABEL[i.evidence].replace(" evidence", "")}</span>
            {st !== "new" && <span className="cp-status">{STATUS_LABEL[st]}</span>}
          </span>
        </button>
        {open && detail(i)}
      </li>
    );
  };

  return (
    <div className="cp">
      <header className="cp-head">
        <Link href="/" className="cp-brand" aria-label="GrünRoute Heilbronn, resident map">
          <LogoMark size={30} />
          <span>
            <b>GrünRoute</b> Heilbronn
          </span>
        </Link>
        <span className="cp-badge">City planning view</span>
        <nav className="cp-head-actions" aria-label="Actions">
          <button type="button" className="cp-btn cp-btn-quiet" onClick={exportCsv} disabled={!all.length}>
            Export CSV
          </button>
          <button type="button" className="cp-btn" onClick={printBrief} disabled={!all.length}>
            Print briefing
          </button>
          <Link href="/" className="cp-link">
            Resident map
          </Link>
        </nav>
      </header>

      <div className="cp-tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-controls="cp-panel" onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "issues" && all.length > 0 && <span className="cp-count">{count("act")}</span>}
          </button>
        ))}
      </div>

      {(loadingAny || errorAny) && (
        <p className={`cp-loadbar${errorAny ? " is-error" : ""}`} role="status">
          {errorAny ? (
            <>
              Some data could not be loaded:{" "}
              {[state.over === "error" && "ATRAI overtaking", state.surface === "error" && "ATRAI road surface", state.danger === "error" && "ATRAI close pass points", state.trees === "error" && "tree register"].filter(Boolean).join(", ")}.{" "}
              <button type="button" className="cp-linkbtn" onClick={retry}>
                Try again
              </button>
            </>
          ) : (
            <>Reading live data from ATRAI and the tree register...</>
          )}
        </p>
      )}

      <main id="cp-panel" role="tabpanel" className={`cp-main cp-main-${tab}`}>
        {tab === "overview" && (
          <>
            <section className="cp-hero">
              <h1>Which street should Heilbronn fix first?</h1>
              <p>
                Issues from bike sensors, summer heat walks, and the city tree register, ranked by how serious they are and how sure the data is. A screening tool for planning, not an official
                measurement.
              </p>
            </section>

            <section className="cp-kpis" aria-label="Key numbers">
              <div className="cp-kpi cp-kpi-act">
                <span>Act now</span>
                <b>{all.length ? fmt(count("act")) : "..."}</b>
                <small>Serious, with enough data</small>
              </div>
              <div className="cp-kpi">
                <span>Ground check first</span>
                <b>{all.length ? fmt(count("check")) : "..."}</b>
                <small>Serious, but little data</small>
              </div>
              <div className="cp-kpi">
                <span>Streets with passing data</span>
                <b>{over ? fmt(safety.length) : "..."}</b>
                <small>{over ? `${fmt(over.length)} ATRAI segments` : "Loading"}</small>
              </div>
              <div className="cp-kpi">
                <span>Close pass points</span>
                <b>{danger ? fmt(danger.length) : "..."}</b>
                <small>{danger ? `${fmt(danger.filter((d) => d.risk >= 0.8).length)} with risk 0.8 or more` : "Loading"}</small>
              </div>
              <div className="cp-kpi">
                <span>Warm heat walk spots</span>
                <b>{fmt(heatWarm)}</b>
                <small>+1.0 °C or more, of {HEAT_WALK.cells} spots</small>
              </div>
              <div className="cp-kpi">
                <span>Public trees</span>
                <b>{ct ? fmt(ct.count) : "..."}</b>
                <small>City tree register, 1 Jan 2026</small>
              </div>
            </section>

            <section className="cp-block">
              <div className="cp-block-head">
                <h2>Act now</h2>
                <p>The most serious issues with enough data behind them, by area.</p>
              </div>
              <div className="cp-cols">
                {KINDS.map((k) => {
                  const top = all.filter((i) => i.kind === k && i.priority === "act").slice(0, 4);
                  const fallback = top.length ? [] : all.filter((i) => i.kind === k && i.priority === "check").slice(0, 3);
                  const loaded = k === "safety" ? !!over : k === "surface" ? !!surf : true;
                  return (
                    <div key={k} className="cp-col">
                      <h3>
                        <span className={`cp-kind cp-kind-${k}`}>
                          <KindIcon kind={k} />
                        </span>
                        {KIND_LABEL[k]}
                        <small>{count("act", k)} act now</small>
                      </h3>
                      {!loaded && <p className="cp-muted">Loading...</p>}
                      {loaded && !top.length && !fallback.length && <p className="cp-muted">Nothing serious with enough data.</p>}
                      {loaded && !top.length && fallback.length > 0 && <p className="cp-muted">No issue with enough data yet. These need a ground check:</p>}
                      <ol>
                        {[...top, ...fallback].map((i) => (
                          <li key={i.id}>
                            <button type="button" onClick={() => showOnMap(i.id)}>
                              <span className="cp-top-title">
                                {i.title}
                                <em>{i.metricText}</em>
                              </span>
                              <span className="cp-top-fix">{i.measures.find((m) => m.effort === "quick")?.text}</span>
                              <span className="cp-top-ev">{i.evidenceText}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="cp-block">
              <div className="cp-block-head">
                <h2>Quick fixes by team</h2>
                <p>First low effort step for each Act now issue, so every team knows where to start.</p>
              </div>
              <div className="cp-cols">
                {TEAMS.map((t) => {
                  const list = all.filter((i) => i.owner === t && i.priority === "act");
                  return (
                    <div key={t} className="cp-col">
                      <h3>
                        {t}
                        <small>
                          {list.length} {list.length === 1 ? "task" : "tasks"}
                        </small>
                      </h3>
                      <ul className="cp-tasks">
                        {list.slice(0, 6).map((i) => (
                          <li key={i.id}>
                            <b>{i.title}:</b> {i.measures.find((m) => m.effort === "quick")?.text}
                          </li>
                        ))}
                      </ul>
                      {list.length > 6 && (
                        <button
                          type="button"
                          className="cp-linkbtn"
                          onClick={() => {
                            setTeam(t);
                            setPrios(["act"]);
                            setKind("all");
                            setTab("issues");
                          }}
                        >
                          See all {list.length}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="cp-block cp-two">
              <div>
                <div className="cp-block-head">
                  <h2>Progress</h2>
                  <p>Status of the {fmt(open.length)} Act now, Ground check, and Plan next issues. Saved in this browser only, use Export CSV to share.</p>
                </div>
                <ul className="cp-bars">
                  {statusCounts.map(({ s, n }) => (
                    <li key={s}>
                      <span>{STATUS_LABEL[s]}</span>
                      <i style={{ width: `${open.length ? Math.max(n ? 2 : 0, (n / open.length) * 100) : 0}%` }} aria-hidden="true" />
                      <b>{fmt(n)}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="cp-block-head">
                  <h2>How sure is the data?</h2>
                  <p>Issues by evidence strength. Weak evidence never leads straight to a fix.</p>
                </div>
                <ul className="cp-bars">
                  {(["strong", "medium", "weak"] as Evidence[]).map((e) => {
                    const n = all.filter((i) => i.evidence === e).length;
                    return (
                      <li key={e} className={`cp-bar-${e}`}>
                        <span>{EVIDENCE_LABEL[e]}</span>
                        <i style={{ width: `${all.length ? (n / all.length) * 100 : 0}%` }} aria-hidden="true" />
                        <b>{fmt(n)}</b>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <p className="cp-caveat">
              Bike data exists only where riders rode, and few overtakes can mean few riders, not a safe street. Heat walks are one summer snapshot (1 to 3 Sep 2026). Low cost sensors are not a legal
              measurement. Check on the ground and with official city data before deciding.
            </p>
          </>
        )}

        {tab === "issues" && (
          <section className="cp-issues">
            <div className="cp-filters">
              <label className="cp-search">
                <span className="sr-only">Search issues by street</span>
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input type="search" placeholder="Search a street" value={q} onChange={(e) => (setQ(e.target.value), setShown(PAGE))} />
              </label>
              <div className="cp-chips" role="group" aria-label="Type">
                {(["all", ...KINDS] as const).map((k) => (
                  <button key={k} type="button" className="cp-chip" aria-pressed={kind === k} onClick={() => (setKind(k), setShown(PAGE))}>
                    {k === "all" ? "All types" : KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="cp-chips" role="group" aria-label="Priority">
                {PRIORITY_ORDER.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`cp-chip cp-chip-${p}`}
                    aria-pressed={prios.includes(p)}
                    onClick={() => {
                      setPrios((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
                      setShown(PAGE);
                    }}
                  >
                    {PRIORITY_LABEL[p]} <span>{count(p)}</span>
                  </button>
                ))}
              </div>
              <div className="cp-selects">
                <Select value={district} onValueChange={(v) => (setDistrict(v), setShown(PAGE))}>
                  <SelectTrigger aria-label="District">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All districts</SelectItem>
                    {districts.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={team} onValueChange={(v) => (setTeam(v), setShown(PAGE))}>
                  <SelectTrigger aria-label="Team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {TEAMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="cp-result" aria-live="polite">
              {fmt(filtered.length)} {filtered.length === 1 ? "issue" : "issues"}, sorted by priority, then evidence, then how serious.
            </p>

            {filtered.length === 0 ? (
              <div className="cp-empty">
                <p>{all.length ? "No issue matches these filters." : "Loading issues..."}</p>
                {all.length > 0 && (
                  <button
                    type="button"
                    className="cp-btn cp-btn-quiet"
                    onClick={() => {
                      setKind("all");
                      setPrios(["act", "check", "plan"]);
                      setDistrict("all");
                      setTeam("all");
                      setQ("");
                    }}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <ol className="cp-list">{filtered.slice(0, shown).map(issueRow)}</ol>
            )}
            {filtered.length > shown && (
              <button type="button" className="cp-btn cp-btn-quiet cp-more" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, filtered.length - shown)} more
              </button>
            )}
          </section>
        )}

        {tab === "map" && (
          <section className="cp-maplayout">
            <div className="cp-mapbox">
              <CityMap layers={layers} overtaking={over} surface={surface} danger={danger} cityTrees={ct} issues={mapIssues} focus={focus} focusKey={focusKey} onIssue={(id) => openIssue(id)} />
            </div>
            <aside className="cp-side">
              {focus ? (
                <div className="cp-focus">
                  <div className="cp-focus-head">
                    <span className={`cp-kind cp-kind-${focus.kind}`}>
                      <KindIcon kind={focus.kind} />
                    </span>
                    <div>
                      <p>{KIND_LABEL[focus.kind]}</p>
                      <h2>{focus.title}</h2>
                    </div>
                    <button type="button" className="cp-x" aria-label="Close issue" onClick={() => setFocusId(null)}>
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <p className="cp-focus-tags">
                    <PrioTag p={focus.priority} /> <b>{focus.metricText}</b>
                  </p>
                  {detail(focus, true)}
                </div>
              ) : (
                <p className="cp-hint">Tap a pin or a line to see the issue, the evidence, and the suggested fixes.</p>
              )}
              <fieldset className="cp-layers">
                <legend>Layers</legend>
                {(
                  [
                    ["issues", "Issue pins", "Act now, ground check, and plan next issues"],
                    ["density", "Close pass heat map", danger ? `${fmt(danger.length)} ATRAI points, weighted by risk` : "Loading ATRAI points"],
                    ["safety", "Fix score by segment", over ? `${fmt(over.length)} ATRAI overtaking segments` : "Loading"],
                    ["surface", "Roughest road segments", "Roughest 25% of ATRAI segments, darkest is roughest 10%"],
                    ["heat", "Heat walk spots", `Against the same walk, ${HEAT_WALK.dates}`],
                    ["trees", "Tree canopy", ct ? "City register, crowns to scale" : "Loading tree register"],
                    ["coverage", "Where bikes measured", "All ATRAI surface segments, shows data coverage"],
                  ] as [keyof CityLayers, string, string][]
                ).map(([k, label, sub]) => (
                  <label key={k} className="cp-layer">
                    <input type="checkbox" checked={layers[k]} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
                    <span>
                      <b>{label}</b>
                      <small>{sub}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="cp-legend">
                {layers.issues && (
                  <p>
                    {(["act", "check", "plan"] as Priority[]).map((p) => (
                      <span key={p}>
                        <i className={`cp-dot cp-dot-${p}`} /> {PRIORITY_LABEL[p]}
                      </span>
                    ))}
                  </p>
                )}
                {layers.density && (
                  <p>
                    <span className="cp-ramp" aria-hidden="true" /> Few to many close passes
                  </p>
                )}
                {layers.safety && (
                  <p>
                    {BANDS.map((b) => (
                      <span key={b.key}>
                        <i className="cp-line" style={{ background: b.color }} /> {b.label}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </aside>
          </section>
        )}

        {tab === "trees" && (
          <section className="cp-trees">
            <div className="cp-block-head">
              <h2>Trees by district</h2>
              <p>
                From the city tree register (Baumkataster, 1 Jan 2026), public trees only. A common rule of thumb for resilient street trees (Santamour) is no more than 10% of one species and 20% of one
                genus, so one pest or a hot summer cannot take out too many trees at once.
              </p>
            </div>
            {!trees ? (
              <p className="cp-muted">{state.trees === "error" ? "The tree register could not be loaded." : "Loading the tree register..."}</p>
            ) : (
              <>
                <div className="cp-kpis cp-kpis-3">
                  <div className={`cp-kpi${trees.city.topSpeciesShare > 0.1 ? " cp-kpi-warn" : ""}`}>
                    <span>Most common species, whole city</span>
                    <b>{pct(trees.city.topSpeciesShare)}</b>
                    <small>{trees.city.topSpecies}. Guide: at most 10%</small>
                  </div>
                  <div className={`cp-kpi${trees.city.topGenusShare > 0.2 ? " cp-kpi-warn" : ""}`}>
                    <span>Most common genus, whole city</span>
                    <b>{pct(trees.city.topGenusShare)}</b>
                    <small>{trees.city.topGenus}. Guide: at most 20%</small>
                  </div>
                  <div className="cp-kpi">
                    <span>Big crowns, 8 m or more</span>
                    <b>{pct(trees.city.bigShare)}</b>
                    <small>Of {fmt(trees.city.trees)} register entries</small>
                  </div>
                </div>
                <div className="cp-tablewrap">
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th scope="col">District</th>
                        <th scope="col">Trees</th>
                        <th scope="col">Top species</th>
                        <th scope="col">Top genus</th>
                        <th scope="col">Big crowns</th>
                        <th scope="col">Young trees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trees.districts.map((d) => (
                        <tr key={d.district}>
                          <th scope="row">{d.district}</th>
                          <td>{fmt(d.trees)}</td>
                          <td className={d.topSpeciesShare > 0.1 ? "is-warn" : undefined}>
                            {pct(d.topSpeciesShare)} <small>{d.topSpecies}</small>
                          </td>
                          <td className={d.topGenusShare > 0.2 ? "is-warn" : undefined}>
                            {pct(d.topGenusShare)} <small>{d.topGenus}</small>
                          </td>
                          <td>{pct(d.bigShare)}</td>
                          <td>{pct(d.youngShare)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="cp-caveat">
                  Red cells are above the rule of thumb. Big crowns: crown 8 m wide or more. Young trees: trunk under 50 cm round, single trees with a known trunk. Groups of trees (Baumgruppe) are one entry each,
                  and trees of other public bodies often carry a default 2 m crown, so big crowns are undercounted there.
                </p>
              </>
            )}
          </section>
        )}

        {tab === "data" && (
          <section className="cp-data">
            <div className="cp-block-head">
              <h2>Data and method</h2>
              <p>Only data from the organisers and partners. Nothing is filled in to close a gap. Every rule on this page is shown here.</p>
            </div>
            <div className="cp-cols">
              <div className="cp-col">
                <h3>Sources, read live</h3>
                <ul className="cp-sources">
                  <li>
                    <b>ATRAI overtaking_distance_heilbronn</b> {over ? `${fmt(over.length)} segments with overtakes` : state.over === "error" ? "not loaded" : "loading"}. Average passing gap per segment, from
                    bike sensors.
                  </li>
                  <li>
                    <b>ATRAI bumpy_roads_heilbronn</b> {surface ? `${fmt(surface.length)} segments` : state.surface === "error" ? "not loaded" : "loading"}. Normalised roughness per segment.
                  </li>
                  <li>
                    <b>ATRAI danger_zones_heilbronn</b> {danger ? `${fmt(danger.length)} points` : state.danger === "error" ? "not loaded" : "loading"}. Close passes with a risk index from 0 to 1.
                  </li>
                  <li>
                    <b>Heat Island Summer School heat walks</b> {fmt(HEAT_WALK.points)} readings, {HEAT_WALK.dates}, grouped into {HEAT_WALK.cells} spots. Each value is compared with the middle value of its
                    own walk, not a raw temperature.
                  </li>
                  <li>
                    <b>Stadt Heilbronn tree register</b> {ct ? `${fmt(ct.count)} trees` : state.trees === "error" ? "not loaded" : "loading"}, Stand 1 Jan 2026, licence dl-de/by-2-0.
                  </li>
                  <li>
                    <b>OpenStreetMap</b> bike lane tags on ATRAI segments, drinking water points, and the base map.
                  </li>
                </ul>
              </div>
              <div className="cp-col">
                <h3>How issues are scored</h3>
                <ul className="cp-sources">
                  <li>
                    <b>Close passes:</b> fix score = 100 minus half the average passing gap in cm, per street, weighted by overtaking points. 80 or more is serious, 50 to 79 medium. Evidence: 20 or more
                    points from 2 or more sensors strong, 5 or more points medium, fewer weak.
                  </li>
                  <li>
                    <b>Rough surface:</b> length weighted ATRAI roughness per street. Serious if in the roughest 10% of streets with 3 or more segments{surf ? ` (${surf.p90.toFixed(1)} or more)` : ""}, medium if
                    in the roughest 25%{surf ? ` (${surf.p75.toFixed(1)})` : ""}. Evidence: 10 or more segments and 2 or more sensors strong, 3 or more segments medium.
                  </li>
                  <li>
                    <b>Heat and shade:</b> heat walk spots at least +1.0 °C warmer than their own walk, neighbours within 120 m merged. +1.5 °C or more is serious. Evidence: 300 or more readings strong,
                    50 or more medium.
                  </li>
                  <li>Trees, heat, and close passes never change each other&apos;s scores. Types are not added into one number.</li>
                </ul>
              </div>
            </div>

            <h3 className="cp-h3">Priority rule</h3>
            <div className="cp-tablewrap">
              <table className="cp-table cp-matrix">
                <thead>
                  <tr>
                    <th scope="col">How serious</th>
                    <th scope="col">Strong evidence</th>
                    <th scope="col">Medium evidence</th>
                    <th scope="col">Weak evidence</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Serious</th>
                    <td>
                      <span className="cp-prio cp-prio-act">Act now</span>
                    </td>
                    <td>
                      <span className="cp-prio cp-prio-act">Act now</span>
                    </td>
                    <td>
                      <span className="cp-prio cp-prio-check">Ground check first</span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Medium</th>
                    <td>
                      <span className="cp-prio cp-prio-plan">Plan next</span>
                    </td>
                    <td>
                      <span className="cp-prio cp-prio-plan">Plan next</span>
                    </td>
                    <td>
                      <span className="cp-prio cp-prio-watch">Watch</span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Low</th>
                    <td colSpan={3}>
                      <span className="cp-prio cp-prio-watch">Watch</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="cp-h3">Limits</h3>
            <ul className="cp-limits">
              <li>This is a screening tool. It does not say a street breaks any legal limit, and low cost sensors are not a legal measurement.</li>
              <li>Bike data exists only where riders rode. Few overtakes can mean few riders, not a safe street.</li>
              <li>Heat walks covered a few routes on three summer days. Places without walks have no heat issue, which does not mean they are cool.</li>
              <li>Suggested fixes are starting points for the responsible team, not a design. Costs and timing are not estimated.</li>
              <li>Districts come from the nearest register tree and can be wrong near borders.</li>
              <li>No one is tracked. ATRAI publishes only street segment averages and points, never personal ride tracks.</li>
              <li>Status and notes stay in this browser. Use Export CSV to share them with colleagues.</li>
            </ul>
          </section>
        )}
      </main>

      {/* Printed briefing: top issues per area, with the limits. */}
      <section className="cp-brief" aria-hidden="true">
        <h1>GrünRoute Heilbronn, planning briefing</h1>
        <p>
          {briefDate}. Screening from ATRAI bike sensors, Heat Island Summer School heat walks, and the Stadt Heilbronn tree register. Not a legal measurement. Check on the ground before deciding.
        </p>
        {KINDS.map((k) => (
          <div key={k}>
            <h2>
              {KIND_LABEL[k]}: {count("act", k)} act now, {count("check", k)} ground check first
            </h2>
            <ol>
              {all
                .filter((i) => i.kind === k && (i.priority === "act" || i.priority === "check"))
                .slice(0, 8)
                .map((i) => (
                  <li key={i.id}>
                    <b>
                      {i.title} ({i.metricText}, {PRIORITY_LABEL[i.priority]})
                    </b>
                    {districtOf.get(i.id) ? `, ${districtOf.get(i.id)}` : ""}. {i.evidenceText}. Quick fix: {i.measures.find((m) => m.effort === "quick")?.text} Team: {i.owner}. Status:{" "}
                    {STATUS_LABEL[workOf(i.id).status]}
                    {workOf(i.id).note ? `. Note: ${workOf(i.id).note}` : ""}.
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}
