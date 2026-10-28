"use client";
// Tree what-if for one street: N new trees at a spacing, crown cover and
// 15:00 shade now, in 10 and in 25 years, and how score and rank would move.
import { useMemo } from "react";
import Link from "next/link";
import { districtLabel, type Street } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { nf, type PlannerData } from "@/lib/data";
import type { ActivePreset } from "@/lib/preset";
import type { RankedRow } from "@/lib/rank";
import { COOLING, CROWN_STAGES, maxTrees, whatIf } from "@/lib/whatif";
import { savePlanItem, usePlan } from "@/lib/plan";
import { BandTag } from "@/components/BandTag";

type Props = {
  data: PlannerData;
  active: ActivePreset;
  rows: RankedRow[];
  street: Street;
  trees: number;
  spacing: number;
  onChange: (patch: { street?: number; trees?: number; spacing?: number }) => void;
};

const pctText = (v: number | null) => (v == null ? "no estimate" : `${Math.round(v * 100)}%`);

export function WhatIf({ data, active, rows, street, trees, spacing, onChange }: Props) {
  const plan = usePlan();
  const me = rows.find((r) => r.seg.id === street.id);
  const cap = maxTrees(street.length, spacing);
  const result = useMemo(() => whatIf(data, active.preset, active.code, street, trees, spacing), [data, active, street, trees, spacing]);
  const inPlan = plan.some((p) => p.id === street.id);
  const shadeNow = street.raw.shade?.[2] ?? null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="pl-toolbar" style={{ marginBottom: 0 }}>
        <label className="f">
          Street
          <select value={street.id} onChange={(e) => onChange({ street: Number(e.target.value) })} style={{ maxWidth: 360 }}>
            {rows.map((r) => (
              <option key={r.seg.id} value={r.seg.id}>
                {r.rank}. {segName(r.seg)}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          New trees
          <input type="number" min={1} max={cap} value={trees} onChange={(e) => onChange({ trees: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 90 }} />
        </label>
        <label className="f">
          Spacing (m)
          <input type="number" min={6} max={40} value={spacing} onChange={(e) => onChange({ spacing: Math.min(40, Math.max(6, Number(e.target.value) || 12)) })} style={{ width: 90 }} />
        </label>
        <button type="button" className="pl-btn primary" onClick={() => savePlanItem({ id: street.id, trees: result[0].trees, spacing })}>
          {inPlan ? "Update in plan" : "Add to planting plan"}
        </button>
      </div>
      <p className="pl-note">
        {segName(street)}, {districtLabel(street.district)}, {nf(Math.round(street.length))} m. At {spacing} m spacing one side fits up to {cap} trees
        {trees > cap ? `, so the what-if uses ${cap}` : ""}. Today: crown cover {pctText(street.raw.crownCover ?? null)}, {pctText(shadeNow)} in shade at 15:00 on 21 July.{" "}
        <Link href={`/street/${street.id}`}>Open the street dossier</Link>
      </p>

      <table className="pl-table">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col" className="n">Crown per tree (assumption)</th>
            <th scope="col" className="n">Crown cover</th>
            <th scope="col" className="n">Shade at 15:00</th>
            <th scope="col" className="n">Score</th>
            <th scope="col" className="n">Rank</th>
            <th scope="col">Band</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Today, no new trees</th>
            <td className="n">-</td>
            <td className="n">{pctText(street.raw.crownCover ?? null)}</td>
            <td className="n">{pctText(shadeNow)}</td>
            <td className="n">{me?.score ?? "-"}</td>
            <td className="n">{me?.rank ?? "-"}</td>
            <td><BandTag score={me?.score ?? null} /></td>
          </tr>
          {result.map((r) => (
            <tr key={r.stage.id}>
              <th scope="row">
                {r.stage.label}, {r.trees} trees
              </th>
              <td className="n">{r.stage.crown} m</td>
              <td className="n">{pctText(r.crownCover)}</td>
              <td className="n">{pctText(r.shade15)}</td>
              <td className="n">
                {r.score ?? "-"}
                {me?.score != null && r.score != null && r.score !== me.score && <span className="pl-up"> {r.score - me.score}</span>}
              </td>
              <td className="n">
                {r.rank ?? "-"}
                {me?.rank != null && r.rank != null && r.rank !== me.rank && <span className="pl-up"> {r.rank > me.rank ? "+" : ""}{r.rank - me.rank}</span>}
              </td>
              <td><BandTag score={r.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pl-note">
        Crowns of {CROWN_STAGES.map((s) => `${s.crown} m`).join(", ")} are an assumption for a typical street tree, not register data. Only the little shade measure changes, the other six
        measures and all other streets stay as they are. A lower rank number means the street is higher on the list, so moving down the list shows up as a plus.
      </p>

      <div>
        <h3 style={{ fontWeight: 700, marginBottom: 4 }}>What trees can do for heat, as ranges</h3>
        <ul style={{ display: "grid", gap: 4, paddingLeft: 18, listStyle: "disc" }}>
          {COOLING.map((c) => (
            <li key={c.text}>
              {c.text} <span className="pl-note">Source: {c.source}.</span>
            </li>
          ))}
        </ul>
        <p className="pl-note" style={{ marginTop: 4 }}>These are general figures from other cities and studies, not a forecast for this street.</p>
      </div>
    </div>
  );
}
