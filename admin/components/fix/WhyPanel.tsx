"use client";
import Link from "next/link";
import { MEASURES, districtLabel, type Scored } from "@/lib/shared/priority";
import { MEASURE_COLOR, RULE_150, measureDetail, segName } from "@/lib/shared/segments";
import { BandTag } from "@/components/BandTag";

// "Why this street": what adds up to the score, measure by measure.
export function WhyPanel({ x, rank, dossierId }: { x: Scored; rank: number | null; dossierId: number | null }) {
  const s = x.seg;
  return (
    <section className="gr-card" aria-labelledby="why-title">
      <h2 id="why-title" style={{ fontSize: 20 }}>
        Why this street
      </h2>
      <p style={{ fontWeight: 700, marginTop: 4 }}>{segName(s)}</p>
      <p className="pl-note">
        {districtLabel(s.district)}, {Math.round(s.length)} m{rank != null ? `, rank ${rank}` : ", not listed"}
      </p>
      {x.score == null ? (
        <p style={{ marginTop: 8 }}>Little data for these priorities, not scored. It stays grey on the map.</p>
      ) : (
        <>
          <p style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
            <b style={{ fontSize: 28, fontFamily: "var(--font-display)" }}>{x.score}</b>
            <BandTag score={x.score} />
            <span className="pl-chip">{x.support ?? "No"} data support</span>
            {x.gate && (
              <span className="pl-chip" title="Coverage gate, a proposal: 20+ overtakes">
                {x.gate}
              </span>
            )}
          </p>
          <div className="pl-bar" style={{ height: 18, marginTop: 8 }} aria-hidden="true">
            {x.parts.map((p) => (
              <span key={p.key} style={{ width: `${p.points}%`, background: MEASURE_COLOR[p.key] }} title={`${p.key} ${Math.round(p.points)}`} />
            ))}
          </div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14 }}>
            {x.parts
              .slice()
              .sort((a, b) => b.points - a.points)
              .map((p) => {
                const d = measureDetail(s, p.key);
                return (
                  <li key={p.key}>
                    <i style={{ display: "inline-block", width: 10, height: 10, background: MEASURE_COLOR[p.key], marginRight: 6 }} aria-hidden="true" />
                    <b>{MEASURES.find((m) => m.key === p.key)!.label}</b>, {Math.round(p.points)} points, percentile {Math.round(p.p * 100)}.{" "}
                    {d && (
                      <span className="pl-note">
                        {d.value}. {d.count}.
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
          {s.m.safety != null && <p className="pl-note" style={{ marginTop: 8 }}>{RULE_150}</p>}
          {x.weak && <p style={{ marginTop: 8, fontWeight: 600 }}>Weak evidence, check on the ground first.</p>}
        </>
      )}
      {dossierId != null && (
        <p style={{ marginTop: 12 }}>
          <Link className="pl-btn primary" href={`/street/${dossierId}`}>
            Open the street dossier
          </Link>
        </p>
      )}
    </section>
  );
}
