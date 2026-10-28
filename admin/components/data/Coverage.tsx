"use client";
// A6 coverage: every street coloured by data support for the active preset,
// the 20 pass gate (a proposal) and counts per district.
import { useMemo, useState } from "react";
import { districtLabel, TRUSTED_PASSES } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import type { PlannerData } from "@/lib/data";
import { nf, pct } from "@/lib/data";
import type { RankedRow } from "@/lib/rank";
import { NetworkMap, type Focus, type MapLine } from "@/components/map/NetworkMap";

export const SUPPORT_COLORS = { High: "#46327e", Medium: "#1fa187", Low: "#a0da39", none: "#b9b4ad" } as const;
type Level = keyof typeof SUPPORT_COLORS;
const LEVELS: Level[] = ["High", "Medium", "Low", "none"];
const LABEL: Record<Level, string> = { High: "High, 10+ readings", Medium: "Medium, 3 to 9", Low: "Low, 1 to 2", none: "No sensor data" };

export function Coverage({ data, rows }: { data: PlannerData; rows: RankedRow[] }) {
  const [show, setShow] = useState<Record<Level, boolean>>({ High: true, Medium: true, Low: true, none: true });
  const [focus, setFocus] = useState<Focus>(null);
  const levelOf = (r: RankedRow): Level => r.support ?? "none";

  const lines = useMemo<MapLine[]>(
    () =>
      rows
        .filter((r) => show[levelOf(r)])
        .map((r) => {
          const s = data.streetById.get(r.seg.id);
          const l = levelOf(r);
          return { id: r.seg.id, lines: s?.lines ?? [r.seg.g], color: SUPPORT_COLORS[l], weight: l === "none" ? 2 : 3, title: `${segName(r.seg)}: ${LABEL[l]}` };
        }),
    [rows, show, data],
  );

  const table = useMemo(() => {
    const by = new Map<string, Record<Level, number> & { streets: number; trusted: number; indicative: number }>();
    for (const r of rows) {
      const d = districtLabel(r.seg.district);
      const t = by.get(d) ?? { streets: 0, High: 0, Medium: 0, Low: 0, none: 0, trusted: 0, indicative: 0 };
      t.streets++;
      t[levelOf(r)]++;
      if (r.seg.cov.safety >= TRUSTED_PASSES) t.trusted++;
      else if (r.seg.cov.safety > 0) t.indicative++;
      by.set(d, t);
    }
    return [...by].sort((a, b) => b[1].streets - a[1].streets);
  }, [rows]);
  const total = table.reduce((a, [, t]) => a + t.streets, 0);

  const pick = (id: number | string) => {
    const s = data.streetById.get(Number(id));
    if (s) setFocus({ id: s.id, lines: s.lines });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="pl-toolbar" style={{ marginBottom: 0 }}>
        <div className="pl-seg" role="group" aria-label="Support levels shown">
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-pressed={show[l]} onClick={() => setShow((s) => ({ ...s, [l]: !s[l] }))}>
              <i style={{ display: "inline-block", width: 12, height: 4, borderRadius: 2, background: SUPPORT_COLORS[l], marginRight: 6, verticalAlign: 2 }} aria-hidden="true" />
              {LABEL[l]}
            </button>
          ))}
        </div>
      </div>
      <NetworkMap lines={lines} focus={focus} onPick={pick} height={480} label="Street network coloured by data support" />
      <p className="pl-note">
        Support is the number of sensor readings behind the strongest measure of each street, for the active preset. Close pass gate{" "}
        <span className="pl-proposal">proposal</span>: a street with {TRUSTED_PASSES} or more recorded overtakes counts as trusted for close passes, fewer is indicative.
      </p>
      <table className="pl-table">
        <thead>
          <tr>
            <th scope="col">District</th>
            <th scope="col" className="n">Streets</th>
            {LEVELS.map((l) => (
              <th key={l} scope="col" className="n">
                {l === "none" ? "No data" : l}
              </th>
            ))}
            <th scope="col" className="n">
              Close pass trusted ({TRUSTED_PASSES}+)
            </th>
            <th scope="col" className="n">
              Indicative
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map(([d, t]) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              <td className="n">{nf(t.streets)}</td>
              {LEVELS.map((l) => (
                <td key={l} className="n">
                  {nf(t[l])} <span className="pl-note">({pct(t[l], t.streets)})</span>
                </td>
              ))}
              <td className="n">{nf(t.trusted)}</td>
              <td className="n">{nf(t.indicative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pl-note">{nf(total)} streets in the measured network.</p>
    </div>
  );
}
