"use client";
// One A4 page per street, for /street/[id]/print and the Top 10 report.
import dynamic from "next/dynamic";
import { T, measureText, type Lang } from "@/lib/i18n";
import type { Dossier } from "@/lib/useDossier";
import type { ActivePreset } from "@/lib/preset";
import type { PlannerData } from "@/lib/data";
import { percentileOf } from "@/lib/dossier";
import { MEASURES, districtLabel } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { bandFor } from "@/lib/shared/data";
import { sourceById } from "@/lib/shared/sources";
import { DATA_BUILT } from "@/lib/shared/build-info";
import { Skeleton } from "@/components/ui/skeleton";

const StreetMap = dynamic(() => import("./StreetMap").then((m) => m.StreetMap), { ssr: false, loading: () => <Skeleton label="Loading map" /> });

/** Every source a report cites: the seven measures plus schools and the base map. */
const REPORT_SOURCES = [...new Set([...MEASURES.map((m) => m.source), "osm-schools"])];

export function StreetReport({ d, data, active, lang, place }: { d: Dossier; data: PlannerData; active: ActivePreset; lang: Lang; place?: string }) {
  const t = T[lang];
  const s = d.street;
  const row = d.row;
  const loc = lang === "de" ? "de-DE" : "en-GB";
  const n = (v: number) => v.toLocaleString(loc);
  const band = row?.score != null ? bandFor(row.score) : null;

  return (
    <article className="pl-print-page" lang={lang}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
        <div>
          <p className="pl-note">
            GrünRoute Planner, {t.title}
            {place ? `, ${place}` : ""}
          </p>
          <h1 style={{ fontSize: 26 }}>{segName(s)}</h1>
          <p>
            {t.district}: {districtLabel(s.district)}. {t.length}: {n(Math.round(s.length))} m, {s.segIds.length} {t.segments}.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1 }}>{row?.score ?? "n/a"}</div>
          <div style={{ fontWeight: 700 }}>
            {band && <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: band.color, marginRight: 6 }} aria-hidden="true" />}
            {band ? t.band[band.label] ?? band.label : t.littleData}
          </div>
          <div className="pl-note">
            {t.support}: {row?.support ? t.supportLabel[row.support] : t.noSupport}
            {row?.supportCount ? ` (${row.supportCount})` : ""}
          </div>
        </div>
      </header>

      <div style={{ marginTop: 10 }}>
        <StreetMap layers={d.layers} height={240} still label={t.map} />
        <p className="pl-note" style={{ marginTop: 2 }}>
          {t.map}
        </p>
      </div>

      <p style={{ marginTop: 8, fontSize: 13 }}>
        <b>{t.preset}:</b> {active.label}, {MEASURES.map((m) => `${t.measureLabel[m.key]} ${active.preset.weights[m.key]}`).join(", ")}.{" "}
        <b>{t.rank}:</b> {row?.rank ?? t.notListed}.{" "}
        <b>{t.ranks}:</b> {d.ranks.map((r) => `${r.label} ${r.rank ?? "-"}`).join(", ")}.
      </p>

      <table className="pl-table pl-print-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>{t.measure}</th>
            <th className="n">{t.weight}</th>
            <th>{t.value}</th>
            <th className="n">{t.percentile}</th>
            <th>{t.count}</th>
          </tr>
        </thead>
        <tbody>
          {MEASURES.map((m) => {
            const x = measureText(s, m.key, lang);
            const p = percentileOf(data, s, m.key);
            return (
              <tr key={m.key}>
                <td>{t.measureLabel[m.key]}</td>
                <td className="n">{active.preset.weights[m.key]}</td>
                <td>{x?.value ?? t.littleData}</td>
                <td className="n">{p ?? "-"}</td>
                <td>{x?.count ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.m.safety != null && <p className="pl-note" style={{ marginTop: 4 }}>{t.rule150}</p>}
      {row?.weak && <p style={{ marginTop: 4, fontWeight: 700 }}>{t.weak}</p>}

      <div className="pl-print-small" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 10, fontSize: 12 }}>
        <section>
          <h2 style={{ fontSize: 15 }}>{t.limits}</h2>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {t.limitsList.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 style={{ fontSize: 15 }}>{t.sources}</h2>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {REPORT_SOURCES.map((id) => {
              const src = sourceById(id);
              return src ? (
                <li key={id}>
                  {src.name}, {src.provider}, {src.date}. {src.licence}.
                </li>
              ) : null;
            })}
            <li>OpenStreetMap contributors, ODbL (base map).</li>
          </ul>
        </section>
      </div>

      <footer style={{ marginTop: 10, borderTop: "1px solid #999", paddingTop: 6, fontSize: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>
          {t.built}: {DATA_BUILT ?? "unknown"}. {t.printed}: {new Date().toLocaleDateString(loc)}.
        </span>
        <b>
          {t.closing}
          {lang === "de" && <span style={{ display: "block", fontWeight: 400 }}>{T.en.closing}</span>}
        </b>
      </footer>
    </article>
  );
}
