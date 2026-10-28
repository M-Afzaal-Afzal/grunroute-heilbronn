"use client";
// Work queue: every scored street sorted into a next step (score band against
// data support), with the measures that drive its score, a first quick fix,
// and the team that would lead it. Rules in lib/actions.ts.
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePlannerData, nf } from "@/lib/data";
import { useActivePreset } from "@/lib/preset";
import { useUrlState } from "@/lib/url";
import { rankFor, isStreet, type RankedRow } from "@/lib/rank";
import { useCases, statusOf, type Status } from "@/lib/cases";
import { MIN_CRASHES, SUPPORT_NOTE, heldBack, supportFrom, DRAW_ORDER, LITTLE_LINE, NEXT_LINE, NEXT_COLOR, NEXT_HELP, NEXT_LABEL, NEXT_STEPS, IDEAS_NOTE, type LineStyle, firstIdea, nextStepOf, suggestionsFor, driversOf, type Idea, type NextStep, type Team } from "@/lib/actions";
import { driverLine, rawValue } from "@/lib/driverText";
import { ATTRIBUTION, download, exportHeader, toCsv } from "@/lib/export";
import { districtLabel } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { SortTable, type Column } from "@/components/SortTable";
import { BandTag } from "@/components/BandTag";
import { NextTag } from "@/components/NextTag";
import { NetworkMap, type Focus, type MapLine } from "@/components/map/NetworkMap";
import type { LeafletNS } from "@/components/map/useLeaflet";
import type * as Leaflet from "leaflet";
import { LEAD_TEAMS } from "@/components/street/CasePanel";
import { DesktopNote } from "@/components/shell/DesktopNote";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type QueueRow = { r: RankedRow; step: NextStep; idea: Idea | null; drivers: string[]; status: Status; held: boolean };

const DEFAULTS = { step: "act", team: "all", d: "all", closed: "hide", only: "no", little: "show", sel: "" };
const CLOSED: Status[] = ["Fixed, measure again", "Not needed"];
const linesOf = (r: RankedRow) => (isStreet(r.seg) ? r.seg.lines : [r.seg.g]);

/** A short line sample in the map style, for the legend. */
function Swatch({ s }: { s: LineStyle }) {
  return <span className="pl-swatch" style={{ borderTopWidth: s.weight, borderTopColor: s.color, borderTopStyle: s.dash ? "dashed" : "solid", opacity: s.opacity }} aria-hidden="true" />;
}

/** The next step rule as a grid: score band down, data support across. */
function StepMatrix() {
  const cell = (st: NextStep) => (
    <td>
      <Swatch s={NEXT_LINE[st]} />
      {NEXT_LABEL[st]}
    </td>
  );
  return (
    <table className="pl-matrix">
      <caption className="sr-only">How the map colour is chosen</caption>
      <thead>
        <tr>
          <th scope="col">Score band</th>
          <th scope="col">Medium or High support</th>
          <th scope="col">Low support, 1 or 2 readings</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Fix soon, 80+</th>
          {cell("act")}
          {cell("check")}
        </tr>
        <tr>
          <th scope="row">Plan next, 50 to 79</th>
          {cell("plan")}
          {cell("watch")}
        </tr>
        <tr>
          <th scope="row">Check later, below 50</th>
          {cell("watch")}
          {cell("watch")}
        </tr>
        <tr>
          <th scope="row">Little data</th>
          <td colSpan={2}>
            <Swatch s={LITTLE_LINE} />
            Not scored, no next step
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function QueuePage() {
  const { data, error } = usePlannerData();
  const active = useActivePreset();
  const cases = useCases();
  const [u, set] = useUrlState(DEFAULTS);
  const step: NextStep = (NEXT_STEPS as string[]).includes(u.step) ? (u.step as NextStep) : "act";
  const team = u.team;
  const district = u.d;
  const hideClosed = u.closed !== "show";
  const setStep = (v: NextStep) => set({ step: v });
  const setTeam = (v: string) => set({ team: v });
  const setDistrict = (v: string) => set({ d: v });
  const onlyStep = u.only === "yes";
  const showLittle = u.little !== "hide";

  // All scored streets, Low support included, since they belong in "Ground check first".
  const rows = useMemo<QueueRow[]>(() => {
    if (!data) return [];
    const out: QueueRow[] = [];
    for (const r of rankFor(data, active.preset, active.code, "streets", false)) {
      const s = nextStepOf(r);
      if (!s) continue;
      out.push({ r, step: s, idea: firstIdea(suggestionsFor(r)), drivers: driversOf(r).map((d) => driverLine(r.seg, d)), status: statusOf(cases, r.seg.id), held: heldBack(r).length > 0 });
    }
    return out;
  }, [data, active.preset, active.code, cases]);

  // Streets with little data: grey on the map so gaps stay visible, never in the queue.
  const little = useMemo(() => {
    if (!data) return [];
    return rankFor(data, active.preset, active.code, "streets", false).filter((r) => r.score == null && r.seg.length >= 20);
  }, [data, active.preset, active.code]);

  const districts = useMemo(() => [...new Set(rows.map((x) => x.r.seg.district ?? "Heilbronn"))].sort((a, b) => a.localeCompare(b, "de")), [rows]);

  // Team, district and closed filters apply to the counts too, the step filter only to the table.
  const scoped = useMemo(
    () =>
      rows.filter(
        (x) =>
          (team === "all" || (team === "none" ? !x.idea : x.idea?.team === team)) &&
          (district === "all" || (x.r.seg.district ?? "Heilbronn") === district) &&
          (!hideClosed || !CLOSED.includes(x.status)),
      ),
    [rows, team, district, hideClosed],
  );
  const counts = useMemo(() => {
    const c: Record<NextStep, number> = { act: 0, check: 0, plan: 0, watch: 0 };
    for (const x of scoped) c[x.step]++;
    return c;
  }, [scoped]);
  const shown = useMemo(() => scoped.filter((x) => x.step === step), [scoped, step]);

  // Map lines: colour by next step, line style by evidence, Act now drawn last so it sits on top.
  const mapLines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = [];
    if (showLittle && team === "all")
      for (const r of little)
        if (district === "all" || (r.seg.district ?? "Heilbronn") === district) out.push({ id: r.seg.id, lines: linesOf(r), ...LITTLE_LINE, title: `${segName(r.seg)}: little data` });
    for (const st of DRAW_ORDER) {
      if (onlyStep && st !== step) continue;
      for (const x of scoped)
        if (x.step === st) out.push({ id: x.r.seg.id, lines: linesOf(x.r), ...NEXT_LINE[st], title: `${segName(x.r.seg)}: ${NEXT_LABEL[st]}, score ${x.r.score}` });
    }
    return out;
  }, [scoped, little, showLittle, team, district, onlyStep, step]);

  // Act now and Ground check first streets are often short, so a ring marks each one at city zoom.
  const urgent = useMemo(() => scoped.filter((x) => (x.step === "act" || x.step === "check") && (!onlyStep || x.step === step)), [scoped, onlyStep, step]);
  const rings = useCallback(
    (map: Leaflet.Map, L: LeafletNS) => {
      const g = L.layerGroup().addTo(map);
      for (const x of urgent) {
        const pts = linesOf(x.r).flat();
        const at = pts[Math.floor(pts.length / 2)];
        if (!at) continue;
        L.circleMarker(at, { radius: 11, color: NEXT_COLOR[x.step], weight: 3, dashArray: x.step === "check" ? "4 4" : undefined, fill: false, interactive: false }).addTo(g);
      }
      return () => {
        g.remove();
      };
    },
    [urgent],
  );

  const selected = useMemo(() => (u.sel ? (rows.find((x) => String(x.r.seg.id) === u.sel) ?? null) : null), [rows, u.sel]);
  const focus: Focus = useMemo(() => (selected ? { id: selected.r.seg.id, lines: linesOf(selected.r) } : null), [selected]);
  const onPick = useCallback((id: number | string) => set({ sel: String(id) }), [set]);

  // Quick fixes per lead team, for the three steps that need work.
  const byTeam = useMemo(() => {
    const m = new Map<string, Record<NextStep, number>>();
    for (const x of rows) {
      if ((district !== "all" && (x.r.seg.district ?? "Heilbronn") !== district) || (hideClosed && CLOSED.includes(x.status))) continue;
      const k = x.idea?.team ?? "none";
      if (!m.has(k)) m.set(k, { act: 0, check: 0, plan: 0, watch: 0 });
      m.get(k)![x.step]++;
    }
    return [...m.entries()].sort((a, b) => b[1].act - a[1].act || b[1].check - a[1].check);
  }, [rows, district, hideClosed]);

  const cols: Column<QueueRow>[] = [
    { key: "name", label: "Street", sort: (x) => segName(x.r.seg), render: (x) => <Link href={`/street/${x.r.seg.id}`}>{segName(x.r.seg)}</Link> },
    { key: "district", label: "District", sort: (x) => districtLabel(x.r.seg.district), render: (x) => districtLabel(x.r.seg.district) },
    { key: "score", label: "Score", num: true, sort: (x) => x.r.score, render: (x) => x.r.score },
    { key: "band", label: "Band", render: (x) => <BandTag score={x.r.score} /> },
    { key: "support", label: "Support", sort: (x) => x.r.supportCount, title: SUPPORT_NOTE, render: (x) => <span className="pl-reason">{supportFrom(x.r)}</span> },
    {
      key: "drivers",
      label: "Driven by",
      render: (x) =>
        x.drivers.length ? (
          <span className="pl-reason">
            {x.drivers.map((d) => (
              <span key={d} style={{ display: "block" }}>
                {d}
              </span>
            ))}
          </span>
        ) : (
          <span className="pl-note">no clear driver</span>
        ),
    },
    { key: "idea", label: "First quick fix", render: (x) => (x.idea ? <span className="pl-reason">{x.idea.text}</span> : <span className="pl-note">none</span>) },
    { key: "team", label: "Lead", sort: (x) => x.idea?.team ?? null, render: (x) => x.idea?.team ?? <span className="pl-note">not set</span> },
    { key: "status", label: "Case", sort: (x) => x.status, render: (x) => x.status },
  ];

  function exportCsv() {
    const header = [...exportHeader(active.label, active.preset.weights), `Work queue: ${NEXT_LABEL[step]}. ${IDEAS_NOTE}`, `${SUPPORT_NOTE} Percentiles: share of measured streets with a lower value. Crashes count as a driver from ${MIN_CRASHES} crashes (our rule).`];
    const body = shown.map((x) => [
      x.r.seg.id,
      segName(x.r.seg),
      districtLabel(x.r.seg.district),
      Math.round(x.r.seg.length),
      x.r.score,
      NEXT_LABEL[x.step],
      x.r.support,
      x.r.supportCount || "",
      x.r.supportKey ? supportFrom(x.r) : "",
      x.drivers.join("; "),
      x.idea?.text ?? "",
      x.idea?.team ?? "",
      x.status,
    ]);
    const cols = ["id", "name", "district", "length_m", "score", "next_step", "support", "support_count", "support_from", "driven_by", "first_quick_fix", "lead_team", "case_status"];
    download(`grunroute-queue-${step}-${active.code}.csv`, toCsv(header, cols, body), "text/csv;charset=utf-8");
  }

  if (error) return <p role="alert">Could not load the street data: {error}</p>;

  return (
    <>
      <DesktopNote />
      <header>
        <h1>Work queue</h1>
        <p>
          Every scored street sorted into a next step, for the preset in use: <b>{active.label}</b>. The score says how bad a street looks, the data support says how sure we are. Both decide the next step.
        </p>
      </header>

      {!data ? (
        <Skeleton label="Loading streets" />
      ) : (
        <>
          <section className="pl-steps" aria-label="Next steps">
            {NEXT_STEPS.map((s) => (
              <button key={s} type="button" className={`pl-step${s === "check" ? " is-dashed" : ""}`} style={{ ["--step" as string]: NEXT_COLOR[s] }} aria-pressed={step === s} onClick={() => setStep(s)}>
                <span style={{ fontWeight: 700 }}>{NEXT_LABEL[s]}</span>
                <b className="num">{nf(counts[s])}</b>
                <span className="pl-note">{NEXT_HELP[s]}</span>
              </button>
            ))}
          </section>

          <div className="pl-toolbar pl-section" style={{ marginTop: "var(--s4)" }}>
            <label className="f">
              Lead team
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger aria-label="Lead team" style={{ minWidth: 220 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {LEAD_TEAMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">No clear driver</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="f">
              District
              <Select value={district} onValueChange={setDistrict}>
                <SelectTrigger aria-label="District" style={{ minWidth: 220 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {districtLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 38 }}>
              <input type="checkbox" checked={hideClosed} onChange={(e) => set({ closed: e.target.checked ? "hide" : "show" })} />
              Hide closed cases (fixed or not needed)
            </label>
            <span style={{ marginLeft: "auto" }}>
              <button type="button" className="pl-btn" onClick={exportCsv} disabled={!shown.length}>
                Export CSV
              </button>
            </span>
          </div>

          <section aria-labelledby="map-title" style={{ marginBottom: "var(--s5)" }}>
            <h2 id="map-title">Map of the queue</h2>
            <p className="sub">
              Colour says how bad a street looks, the line says how sure we are: solid for Medium or High support, dashed for only 1 or 2 readings. Click a street for its details. Team, district and closed case filters apply here too.
            </p>
            <div className="pl-qmap">
              <div>
                <NetworkMap lines={mapLines} focus={focus} onPick={onPick} extra={rings} height={540} label="Work queue map, streets coloured by next step" />
                <div className="pl-toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
                  <label className="check" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={onlyStep} onChange={(e) => set({ only: e.target.checked ? "yes" : "no" })} />
                    Show only {NEXT_LABEL[step]}
                  </label>
                  <label className="check" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={showLittle} disabled={team !== "all"} onChange={(e) => set({ little: e.target.checked ? "show" : "hide" })} />
                    Show streets with little data ({nf(little.length)})
                  </label>
                </div>
              </div>
              <div>
                <StepMatrix />
                {selected ? (
                  <div className="gr-card pl-pick" aria-live="polite">
                    <h3 style={{ fontSize: 17 }}>{segName(selected.r.seg)}</h3>
                    <p className="pl-note">
                      {districtLabel(selected.r.seg.district)}, {nf(Math.round(selected.r.seg.length))} m
                    </p>
                    <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "6px 0" }}>
                      <NextTag step={selected.step} />
                      <span className="pl-chip">score {selected.r.score}</span>
                    </p>
                    <p style={{ fontSize: 14 }}>
                      <b>Data support:</b> {supportFrom(selected.r)}
                    </p>
                    <div style={{ fontSize: 14 }}>
                      <b>Driven by:</b>
                      {selected.drivers.length ? (
                        <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                          {selected.drivers.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      ) : (
                        " no clear driver"
                      )}
                    </div>
                    {selected.held && (
                      <p className="pl-note">
                        Not a driver: {rawValue(selected.r.seg, "crashes")}. Crashes count as a driver from {MIN_CRASHES} crashes, our rule.
                      </p>
                    )}
                    {selected.idea && (
                      <p style={{ fontSize: 14 }}>
                        <b>First quick fix:</b> {selected.idea.text} <span className="pl-note">Lead: {selected.idea.team}.</span>
                      </p>
                    )}
                    <p style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Link className="pl-btn primary" href={`/street/${selected.r.seg.id}`}>
                        Open dossier
                      </Link>
                      <button type="button" className="pl-btn" onClick={() => set({ sel: "" })}>
                        Clear
                      </button>
                    </p>
                  </div>
                ) : (
                  <p className="pl-note pl-pick">Click a street on the map, or a row in the table, to see why it is in the queue.</p>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="queue-title">
            <h2 id="queue-title">
              {NEXT_LABEL[step]}, {nf(shown.length)} {shown.length === 1 ? "street" : "streets"}
            </h2>
            <p className="sub">{NEXT_HELP[step]} Open a street for its dossier, all suggested measures, and the case.</p>
            {shown.length ? (
              <SortTable columns={cols} rows={shown} rowKey={(x) => x.r.seg.id} onRowClick={(x) => set({ sel: String(x.r.seg.id) })} activeKey={selected?.r.seg.id ?? null} initial={{ key: "score", dir: "desc" }} caption={`Work queue, ${NEXT_LABEL[step]}`} maxHeight={640} />
            ) : (
              <p className="pl-note">No street in this step with these filters.</p>
            )}
            <p className="pl-note" style={{ marginTop: 8 }}>
              {IDEAS_NOTE} Streets with little data have no next step and are not in this queue. {SUPPORT_NOTE} &ldquo;Worse than&rdquo; is the share of measured streets with a lower value. Crashes count as a driver only from {MIN_CRASHES} crashes in 2021 to 2025, because one crash already ranks above about 90% of streets. That cutoff is our rule, not from the data.
            </p>
          </section>

          <section className="pl-section" aria-labelledby="teams-title">
            <h2 id="teams-title">Quick fixes by lead team</h2>
            <p className="sub">The lead is the team of the first quick fix for the measure that drives a street most. Click a team to filter the queue.</p>
            <div className="pl-table-wrap">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th>Lead team</th>
                    {NEXT_STEPS.map((s) => (
                      <th key={s} className="n">
                        {NEXT_LABEL[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTeam.map(([t, c]) => (
                    <tr key={t}>
                      <td>
                        <button type="button" className="pl-sort" aria-pressed={team === t} onClick={() => setTeam(team === t ? "all" : t)}>
                          {t === "none" ? "No clear driver" : (t as Team)}
                        </button>
                      </td>
                      {NEXT_STEPS.map((s) => (
                        <td key={s} className="n">
                          {nf(c[s])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pl-note" style={{ marginTop: 8 }}>
              Cases and status are a demo, saved in this browser only. Sources: {ATTRIBUTION.join("; ")}.
            </p>
          </section>
        </>
      )}
    </>
  );
}
