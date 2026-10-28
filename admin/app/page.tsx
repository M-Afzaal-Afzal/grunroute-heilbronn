"use client";
import Link from "next/link";
import { useMemo } from "react";
import { usePlannerData, nf, pct } from "@/lib/data";
import { useActivePreset } from "@/lib/preset";
import { rankFor, listable, type RankedRow } from "@/lib/rank";
import { useCases, statusOf, STATUSES } from "@/lib/cases";
import { MEASURES, districtLabel, enoughData } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { bandFor, BANDS } from "@/lib/shared/data";
import { SortTable, type Column } from "@/components/SortTable";
import { BandTag } from "@/components/BandTag";
import { DesktopNote } from "@/components/shell/DesktopNote";
import { Skeleton } from "@/components/ui/skeleton";
import { NEXT_COLOR, NEXT_HELP, NEXT_LABEL, NEXT_STEPS, nextStepOf, type NextStep } from "@/lib/actions";
import { LABEL_ORDER, PHENOMENA, labelsOf, urgencyOf, type PhenomenonId } from "@/lib/phenomena";
import type { MeasureKey, Street } from "@/lib/shared/priority";

const SENSOR_KEYS = ["safety", "heat", "dust", "rough", "stopgo"] as const;

/** One bar per row: the share of all segments, with the number and a short note. */
function CoverBars({ rows, total, color }: { rows: { label: string; n: number; what: string; note?: string }[]; total: number; color: string }) {
  return (
    <ul className="pl-cover">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="pl-cover-head">
            <b>{r.label}</b>
            <span>
              <b className="num">{pct(r.n, total)}</b> {r.what}
            </span>
          </span>
          <span className="pl-bar" aria-hidden="true">
            <span style={{ width: `${(r.n / total) * 100}%`, background: color }} />
          </span>
          {r.note && <span className="pl-note">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}

type DistrictRow = {
  name: string;
  streets: number;
  km: number;
  scored: number;
  enough: number;
  mean: number | null;
  soon: number;
  next: number;
  crashes: number;
  passes: number;
  trees: number;
};

export default function Overview() {
  const { data, error } = usePlannerData();
  const active = useActivePreset();
  const cases = useCases();

  const ranked = useMemo(() => (data ? rankFor(data, active.preset, active.code) : null), [data, active.preset, active.code]);

  const districts = useMemo<DistrictRow[]>(() => {
    if (!ranked) return [];
    const by = new Map<string, DistrictRow>();
    for (const r of ranked) {
      const name = r.seg.district ?? "Heilbronn";
      let d = by.get(name);
      if (!d) by.set(name, (d = { name, streets: 0, km: 0, scored: 0, enough: 0, mean: null, soon: 0, next: 0, crashes: 0, passes: 0, trees: 0 }));
      d.streets++;
      d.km += r.seg.length / 1000;
      d.crashes += r.seg.raw.crashes;
      d.passes += r.seg.raw.passes;
      d.trees += r.seg.raw.trees;
      if (r.score != null) {
        d.scored++;
        d.mean = (d.mean ?? 0) + r.score;
      }
      if (r.rank != null) {
        d.enough++;
        const b = bandFor(r.score!).key;
        if (b === "soon") d.soon++;
        if (b === "next") d.next++;
      }
    }
    return [...by.values()].map((d) => ({ ...d, mean: d.scored ? Math.round(d.mean! / d.scored) : null }));
  }, [ranked]);

  // Next step per street (lib/actions.ts), Low support included.
  const steps = useMemo(() => {
    const c: Record<NextStep, number> = { act: 0, check: 0, plan: 0, watch: 0 };
    if (!data) return c;
    for (const r of rankFor(data, active.preset, active.code, "streets", false)) {
      const s = nextStepOf(r);
      if (s) c[s]++;
    }
    return c;
  }, [data, active.preset, active.code]);

  // Street labels, the same rules as What needs fixing, so both pages agree.
  const labels = useMemo(() => {
    const c = Object.fromEntries(LABEL_ORDER.map((id) => [id, 0])) as Record<PhenomenonId, number>;
    let urgent = 0;
    if (!data) return { c, urgent };
    const pct = (s: { m: Street["m"] }, k: MeasureKey) => (s.m[k] == null ? null : (data.streetPct[k].get(s.m[k] as number) ?? null));
    for (const s of data.streets) {
      if (s.length < 20) continue;
      const hits = labelsOf(s, pct);
      for (const h of hits) {
        c[h.id]++;
        if (urgencyOf(h, s, hits.length) >= 4) urgent++;
      }
    }
    return { c, urgent };
  }, [data]);
  const onlyLabel = (id: PhenomenonId) => `/fix-map?off=${LABEL_ORDER.filter((x) => x !== id).join(",")}`;

  // Crashes and little shade come from city-wide lists, so every segment has a value.
  // Count how many of those values are a real 0, so 100% is not read as "100% have a problem".
  const zeros = useMemo(() => {
    if (!data) return null;
    let crash = 0;
    let noCrown = 0;
    for (const s of data.segments) {
      if (s.raw.crashes > 0) crash++;
      if ((s.raw.crownCover ?? 0) === 0) noCrown++;
    }
    return { crash, noCrown, n: data.segments.length };
  }, [data]);

  const support = useMemo(() => {
    const c = { High: 0, Medium: 0, Low: 0, none: 0 };
    for (const r of ranked ?? []) {
      if (r.score == null || r.seg.length < 20) continue;
      if (r.support) c[r.support]++;
      else c.none++;
    }
    return c;
  }, [ranked]);

  const statusCounts = useMemo(() => {
    const out = new Map<string, number>(STATUSES.map((s) => [s, 0]));
    if (!data) return out;
    let touched = 0;
    for (const id of Object.keys(cases)) {
      if (!data.streetById.has(Number(id))) continue;
      out.set(cases[id].status, (out.get(cases[id].status) ?? 0) + 1);
      touched++;
    }
    out.set("New", data.streets.length - touched + (out.get("New") ?? 0));
    return out;
  }, [cases, data]);

  if (error) return <p role="alert">Could not load the street data: {error}</p>;

  const meta = data?.meta;
  const c = meta?.counts;
  const passes = Number(c?.passes ?? 0);
  const under = Number(c?.under150 ?? 0);
  const years = (c?.crashYears as number[] | undefined) ?? [];
  const top10 = ranked ? listable(ranked).slice(0, 10) : [];
  const supportTotal = support.High + support.Medium + support.Low + support.none;

  const districtCols: Column<DistrictRow>[] = [
    { key: "name", label: "District", sort: (d) => districtLabel(d.name), render: (d) => districtLabel(d.name) },
    { key: "streets", label: "Streets", num: true, sort: (d) => d.streets, render: (d) => nf(d.streets) },
    { key: "km", label: "Km measured", num: true, sort: (d) => d.km, render: (d) => d.km.toFixed(1) },
    { key: "enough", label: "Listed (enough data)", num: true, sort: (d) => d.enough, render: (d) => nf(d.enough) },
    { key: "mean", label: "Mean score", num: true, sort: (d) => d.mean, render: (d) => d.mean ?? "n/a" },
    { key: "soon", label: "Fix soon", num: true, sort: (d) => d.soon, render: (d) => nf(d.soon) },
    { key: "next", label: "Plan next", num: true, sort: (d) => d.next, render: (d) => nf(d.next) },
    { key: "passes", label: "Passes", num: true, sort: (d) => d.passes, render: (d) => nf(d.passes) },
    { key: "crashes", label: "Crashes", num: true, sort: (d) => d.crashes, render: (d) => nf(d.crashes) },
    { key: "trees", label: "Trees", num: true, sort: (d) => d.trees, render: (d) => nf(d.trees) },
  ];

  const topCols: Column<RankedRow>[] = [
    { key: "rank", label: "#", num: true, render: (r) => r.rank },
    { key: "name", label: "Street", render: (r) => <Link href={`/street/${r.seg.id}`}>{segName(r.seg)}</Link> },
    { key: "district", label: "District", render: (r) => districtLabel(r.seg.district) },
    { key: "len", label: "Length", num: true, render: (r) => `${Math.round(r.seg.length)} m` },
    { key: "score", label: "Score", num: true, render: (r) => r.score },
    { key: "band", label: "Band", render: (r) => <BandTag score={r.score} /> },
    { key: "support", label: "Support", render: (r) => r.support ?? "none" },
    { key: "status", label: "Status", render: (r) => statusOf(cases, r.seg.id) },
  ];

  return (
    <>
      <DesktopNote />
      <header>
        <h1>Overview</h1>
        <p>
          What the measured street network shows today, for the preset in use: <b>{active.label}</b>. A screening tool for ground checks, not a decision.
        </p>
      </header>

      {!data ? (
        <div className="pl-kpis">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} label="Loading figures" />
          ))}
        </div>
      ) : (
        <>
          <section aria-labelledby="start-title" className="pl-start">
            <h2 id="start-title">Start here</h2>
            <p className="sub">
              What to do next, street by street. The score band says how bad a street looks, the data support says how sure we are. Click a step to open its list.
            </p>
            <div className="pl-steps">
              {NEXT_STEPS.map((s) => (
                <Link key={s} className={`pl-step${s === "check" ? " is-dashed" : ""}`} style={{ ["--step" as string]: NEXT_COLOR[s] }} href={s === "act" ? "/queue" : `/queue?step=${s}`}>
                  <span style={{ fontWeight: 700 }}>{NEXT_LABEL[s]}</span>
                  <b className="num">{nf(steps[s])}</b>
                  <span className="pl-note">{NEXT_HELP[s]}</span>
                </Link>
              ))}
            </div>
            <h3 style={{ fontSize: 17, marginTop: "var(--s4)" }}>Problems by type</h3>
            <p className="pl-note" style={{ margin: "2px 0 8px" }}>
              Streets that earned a label on What needs fixing. {nf(labels.urgent)} labels have High or Very high urgency. A street can carry more than one label.
            </p>
            <div className="pl-labels">
              {LABEL_ORDER.filter((id) => id !== "blindSpot").map((id) => (
                <Link key={id} href={onlyLabel(id)} className="pl-labelchip" style={{ ["--lab" as string]: PHENOMENA[id].color }} title={PHENOMENA[id].rule}>
                  <i aria-hidden="true" />
                  <span aria-hidden="true">{PHENOMENA[id].icon}</span> {PHENOMENA[id].name} <b className="num">{nf(labels.c[id])}</b>
                </Link>
              ))}
            </div>
          </section>

          <h2 className="pl-section" style={{ marginBottom: 12 }}>
            The data behind it
          </h2>
          <section className="pl-kpis" aria-label="Key figures">
            <div className="pl-kpi">
              <div className="k-label">Streets and segments measured</div>
              <div className="k-value">{nf(data.streets.length)}</div>
              <div className="k-note">
                streets, from {nf(meta!.segments)} ATRAI road segments
              </div>
            </div>
            <div className="pl-kpi">
              <div className="k-label">Passes under 150 cm</div>
              <div className="k-value">{pct(under, passes)}</div>
              <div className="k-note">
                of the {nf(passes)} passes the bike sensors detected. Wide passes may be missed, so this share can be too high.
              </div>
            </div>
            <div className="pl-kpi">
              <div className="k-label">
                Bike and foot injury crashes {years[0]} to {years[years.length - 1]}
              </div>
              <div className="k-value">{nf(Number(c?.crashes ?? 0))}</div>
              <div className="k-note">Unfallatlas, police recorded crashes with injuries</div>
            </div>
            <div className="pl-kpi">
              <div className="k-label">Public trees</div>
              <div className="k-value">{nf(Number(c?.trees ?? 0))}</div>
              <div className="k-note">City tree register, Stand 01.01.2026</div>
            </div>
            <div className="pl-kpi">
              <div className="k-label">Heat walk spots</div>
              <div className="k-value">{nf(Number(c?.heatCells ?? 0))}</div>
              <div className="k-note">Heat Island Summer School walks, 1 to 3 Sep 2026</div>
            </div>
            <div className="pl-kpi">
              <div className="k-label">Schools and kindergartens</div>
              <div className="k-value">{nf(Number(c?.schools ?? 0))}</div>
              <div className="k-note">OpenStreetMap, used for school zones</div>
            </div>
          </section>

          <section className="pl-section">
            <h2>What we know, and where</h2>
            <p className="sub">Based on the {nf(meta!.segments)} street segments in Heilbronn.</p>
            <div className="pl-two" style={{ marginTop: 12 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>Measured by sensors</h3>
                <p className="pl-note" style={{ margin: "2px 0 8px" }}>
                  Only where someone measured. The bar shows how much of the city that is. Where nobody measured, we do not know.
                </p>
                <CoverBars
                  rows={SENSOR_KEYS.map((k) => ({ label: MEASURES.find((m) => m.key === k)!.label, n: Number(meta!.coverage[k] ?? 0), what: "measured" }))}
                  total={meta!.segments}
                  color="var(--gruen)"
                />
              </div>
              <div>
                <h3 style={{ fontSize: 17 }}>From city-wide lists</h3>
                <p className="pl-note" style={{ margin: "2px 0 8px" }}>
                  Known for every street, so the bar shows how much has the problem.
                </p>
                {zeros && (
                  <CoverBars
                    rows={[
                      { label: "Crashes", n: zeros.crash, what: "had a crash", note: "Bike or foot injury crash within 25 m, 2021 to 2025. Police records." },
                      { label: "Little shade", n: zeros.noCrown, what: "have no tree shade", note: "No public tree crown within 15 m. Public trees only." },
                    ]}
                    total={zeros.n}
                    color="#C2410C"
                  />
                )}
              </div>
            </div>
          </section>

          <div className="pl-two pl-section">
            <section>
              <h2>
                Data support <span className="pl-proposal">proposal</span>
              </h2>
              <p className="pl-note" style={{ margin: "4px 0 12px" }}>
                Scored streets of 20 m or more, by the point count behind the measure that adds most to the score: High 10+, Medium 3 to 9, Low 1 to 2. Low support streets are hidden from ranked lists by default and stay on maps.
              </p>
              <div className="pl-bar" style={{ height: 22 }} aria-hidden="true">
                <span style={{ width: `${(support.High / supportTotal) * 100}%`, background: "#1fa187" }} />
                <span style={{ width: `${(support.Medium / supportTotal) * 100}%`, background: "#365c8d" }} />
                <span style={{ width: `${(support.Low / supportTotal) * 100}%`, background: "#a0a7b4" }} />
              </div>
              <div className="pl-legend" style={{ marginTop: 8 }}>
                <span>
                  <i style={{ background: "#1fa187" }} />
                  High {nf(support.High)}
                </span>
                <span>
                  <i style={{ background: "#365c8d" }} />
                  Medium {nf(support.Medium)}
                </span>
                <span>
                  <i style={{ background: "#a0a7b4" }} />
                  Low {nf(support.Low)}
                </span>
              </div>
            </section>
            <section>
              <h2>Case status</h2>
              <p className="pl-note" style={{ margin: "4px 0 12px" }}>
                From the street dossiers. Demo, saved in this browser only.
              </p>
              <ul className="pl-legend" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {STATUSES.map((s) => (
                  <li key={s} className="pl-chip">
                    {s}: <b className="num">{nf(statusCounts.get(s) ?? 0)}</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>


          <section className="pl-section">
            <h2>Top 10 streets, {active.label}</h2>
            <p className="sub">
              Streets with enough data, 20 m or more. Change the preset on <Link href="/priorities">Fix first</Link>. Bands:{" "}
              {BANDS.map((b) => `${b.label} ${b.range}`).join(", ")}.
            </p>
            <p className="no-print" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Link className="pl-btn" href="/print/top10">
                Top 10 report (Deutsch)
              </Link>
              <Link className="pl-btn" href="/print/top10?lang=en">
                Top 10 report (English)
              </Link>
            </p>
            <SortTable columns={topCols} rows={top10} rowKey={(r) => r.seg.id} caption="Top 10 streets" />
            <p className="pl-note" style={{ marginTop: 8 }}>
              {nf(ranked!.filter((r) => r.score != null && r.seg.length >= 20 && !enoughData(r)).length)} scored streets with low data support are not listed. They stay on the maps.
            </p>
          </section>

          <section className="pl-section">
            <h2>Districts</h2>
            <p className="sub">Sort by any column. Districts are not ranked against each other. Counts are summed over streets.</p>
            <SortTable columns={districtCols} rows={districts} rowKey={(d) => d.name} initial={{ key: "name", dir: "asc" }} caption="Districts" />
          </section>
        </>
      )}
    </>
  );
}
