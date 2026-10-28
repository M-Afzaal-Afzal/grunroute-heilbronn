"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useActivePreset } from "@/lib/preset";
import { useDossier } from "@/lib/useDossier";
import { nf } from "@/lib/data";
import { NEAR, PASS_BIN_NOTE, percentileOf } from "@/lib/dossier";
import { MEASURES, districtLabel } from "@/lib/shared/priority";
import { RULE_150, measureDetail, segName } from "@/lib/shared/segments";
import { sourceById } from "@/lib/shared/sources";
import { TREE_SOURCE } from "@/lib/shared/cityTrees";
import { DATA_BUILT } from "@/lib/shared/build-info";
import { BandTag } from "@/components/BandTag";
import { WhyPanel } from "@/components/fix/WhyPanel";
import { CasePanel } from "@/components/street/CasePanel";
import { StreetMapLegend } from "@/components/street/StreetMap";
import { DesktopNote } from "@/components/shell/DesktopNote";
import { Skeleton } from "@/components/ui/skeleton";

const StreetMap = dynamic(() => import("@/components/street/StreetMap").then((m) => m.StreetMap), { ssr: false, loading: () => <Skeleton label="Loading map" /> });
const PassChart = dynamic(() => import("@/components/street/Charts").then((m) => m.PassChart), { ssr: false, loading: () => <Skeleton label="Loading chart" /> });
const CrashChart = dynamic(() => import("@/components/street/Charts").then((m) => m.CrashChart), { ssr: false, loading: () => <Skeleton label="Loading chart" /> });
const SpeciesChart = dynamic(() => import("@/components/street/Charts").then((m) => m.SpeciesChart), { ssr: false, loading: () => <Skeleton label="Loading chart" /> });

export default function StreetPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const active = useActivePreset();
  const [withPasses, setWithPasses] = useState(true);
  const { data, dossier, notFound, error, treeError, passError } = useDossier(id, active.code, withPasses);

  if (error) return <p role="alert">Could not load the street data: {error}</p>;
  if (notFound || !Number.isFinite(id))
    return (
      <>
        <header>
          <h1>Street not found</h1>
          <p>
            There is no street with id {params.id} in this build. <Link href="/priorities">Back to Fix first</Link>
          </p>
        </header>
      </>
    );
  if (!data || !dossier)
    return (
      <>
        <header>
          <h1>Street dossier</h1>
        </header>
        <Skeleton label="Loading street" />
      </>
    );

  const { street, row, ranks } = dossier;
  const name = segName(street);
  const bins = street.raw.bins;
  const crashTotal = dossier.crashes?.length ?? null;

  return (
    <>
      <DesktopNote />
      <header>
        <p className="pl-note no-print">
          <Link href="/priorities">Fix first</Link> / Street dossier
        </p>
        <h1>{name}</h1>
        <p>
          {districtLabel(street.district)}, {nf(Math.round(street.length))} m, {street.segIds.length} ATRAI {street.segIds.length === 1 ? "segment" : "segments"}. Data built {DATA_BUILT ?? "unknown"}.
        </p>
      </header>

      <div className="pl-toolbar">
        <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <b style={{ fontSize: 34, fontFamily: "var(--font-display)" }}>{row?.score ?? "n/a"}</b>
          <BandTag score={row?.score ?? null} />
          <span className="pl-chip">{row?.support ?? "No"} data support{row?.supportCount ? ` (${row.supportCount})` : ""}</span>
          <span className="pl-chip">
            {active.label}: {row?.rank != null ? `rank ${row.rank}` : "not listed"}
          </span>
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link className="pl-btn" href={`/street/${id}/print`}>
            Print (Deutsch)
          </Link>
          <Link className="pl-btn" href={`/street/${id}/print?lang=en`}>
            Print (English)
          </Link>
        </span>
      </div>

      <section className="pl-section" style={{ marginTop: 0 }} aria-labelledby="ranks-title">
        <h2 id="ranks-title" style={{ fontSize: 18 }}>
          Rank under each preset
        </h2>
        <div className="pl-table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                {ranks.map((r) => (
                  <th key={r.id}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {ranks.map((r) => (
                  <td key={r.id}>
                    {r.rank != null ? <b>{r.rank}</b> : <span className="pl-note">not listed</span>}
                    <span className="pl-note"> of {nf(r.listed)}</span>
                    {r.score != null && <span className="pl-note">, score {r.score}</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="pl-note" style={{ marginTop: 4 }}>
          Ranks count streets of 20 m or more with enough data (Medium or High support). Not listed means little data or too short for this preset.
        </p>
      </section>

      <div className="pl-section" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: "var(--s5)" }}>
        <div>
          <StreetMap layers={dossier.layers} label={`Map of ${name} with nearby trees, heat walk spots, close passes, crashes and schools`} />
          <StreetMapLegend
            counts={{ crowns: dossier.layers.crowns.length, heat: dossier.heat.length, passes: dossier.passNear?.length ?? null, crashes: crashTotal ?? 0, schools: dossier.schools?.length ?? 0 }}
          />
          <p className="pl-note" style={{ marginTop: 4 }}>
            Within {NEAR.tree} m: register trees. {NEAR.heat} m: heat walk spots. {NEAR.crash} m: crashes. {NEAR.pass} m: close-pass points. {NEAR.school} m: schools.
          </p>
          <label className="check no-print" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={withPasses} onChange={(e) => setWithPasses(e.target.checked)} />
            Show close-pass points, read live from the public ATRAI API in this browser
          </label>
          {passError && <p className="pl-note">Close-pass points could not be loaded: {passError}</p>}
          {treeError && <p className="pl-note">Tree register could not be loaded: {treeError}</p>}
        </div>
        <div>{row && <WhyPanel x={row} rank={row.rank} dossierId={null} />}</div>
      </div>

      <section className="pl-section" aria-labelledby="measures-title">
        <h2 id="measures-title">Measures</h2>
        <p className="sub">Raw values come from the build output. Percentile is the share of streets with a lower value, so 90 means worse than 90% of measured streets.</p>
        <div className="pl-table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Measure</th>
                <th className="n">Weight, {active.label}</th>
                <th>Raw value</th>
                <th className="n">Percentile</th>
                <th>Count</th>
                <th>Source</th>
                <th>Licence</th>
              </tr>
            </thead>
            <tbody>
              {MEASURES.map((m) => {
                const d = measureDetail(street, m.key);
                const src = sourceById(m.source);
                const p = percentileOf(data, street, m.key);
                return (
                  <tr key={m.key}>
                    <td>
                      <b>{m.label}</b>
                    </td>
                    <td className="n">{active.preset.weights[m.key]}</td>
                    <td>{d ? d.value : <span className="pl-note">little data</span>}</td>
                    <td className="n">{p ?? "n/a"}</td>
                    <td>{d?.count ?? "none"}</td>
                    <td>{src ? <a href={src.url}>{src.name}</a> : m.source}</td>
                    <td className="pl-note">{src?.licence ?? "not stated"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pl-section" aria-labelledby="charts-title">
        <h2 id="charts-title">Charts</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "var(--s4)" }}>
          <article className="gr-card">
            <h3 style={{ fontSize: 17 }}>Passing distance</h3>
            {bins && bins.some((n) => n > 0) ? (
              <>
                <p className="pl-note">
                  {nf(street.raw.passes)} measured passes, {nf(street.raw.under150)} under 150 cm. ATRAI overtaking distance, {street.segIds.length > 1 ? "summed over the segments" : "one segment"}.
                </p>
                <PassChart bins={bins} />
                <p className="pl-note">{RULE_150}</p>
                <p className="pl-note">{PASS_BIN_NOTE}</p>
              </>
            ) : (
              <p className="pl-note">No measured passes on this street.</p>
            )}
          </article>
          <article className="gr-card">
            <h3 style={{ fontSize: 17 }}>Crashes by year and severity</h3>
            {dossier.crashYears ? (
              <>
                <p className="pl-note">
                  {crashTotal} injury {crashTotal === 1 ? "crash" : "crashes"} with a bike or person on foot within {NEAR.crash} m, each counted once. {dossier.crashSource}.
                </p>
                {crashTotal ? <CrashChart rows={dossier.crashYears} /> : <p>No such crash recorded within {NEAR.crash} m, 2021 to 2025.</p>}
              </>
            ) : (
              <Skeleton label="Loading crashes" />
            )}
          </article>
          <article className="gr-card">
            <h3 style={{ fontSize: 17 }}>Tree species within {NEAR.tree} m</h3>
            {dossier.species ? (
              <>
                <p className="pl-note">
                  {nf(dossier.treeIds!.length)} register trees, {dossier.species.species} species. {TREE_SOURCE}. Public trees only.
                </p>
                {dossier.species.rows.length ? <SpeciesChart rows={dossier.species.rows} /> : <p>No register tree within {NEAR.tree} m.</p>}
              </>
            ) : treeError ? (
              <p className="pl-note">Tree register could not be loaded.</p>
            ) : (
              <Skeleton label="Loading trees" />
            )}
          </article>
        </div>
      </section>

      <section className="pl-section" aria-label="Case">
        <CasePanel id={street.id} />
      </section>

      {dossier.schools && dossier.schools.length > 0 && (
        <section className="pl-section" aria-labelledby="schools-title">
          <h2 id="schools-title">Schools and kindergartens within {NEAR.school} m</h2>
          <ul style={{ paddingLeft: 18 }}>
            {dossier.schools.map((s) => (
              <li key={s.osm}>
                {s.name ?? "Unnamed"} ({s.type}), {Math.round(s.d)} m
              </li>
            ))}
          </ul>
          <p className="pl-note">OpenStreetMap contributors, ODbL.</p>
        </section>
      )}
    </>
  );
}
