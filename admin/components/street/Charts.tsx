"use client";
// Dossier charts (recharts, MIT). Loaded lazily from the dossier page.
import { Bar, BarChart, CartesianGrid, Legend, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PASS_BINS, SEVERITY } from "@/lib/dossier";

const AXIS = { fontSize: 12, fill: "var(--moss)" };
const GRID = "var(--stone-soft)";
const TIP = { contentStyle: { background: "var(--surface)", border: "1px solid var(--stone)", borderRadius: 8, fontSize: 13 }, cursor: { fill: "var(--stone-soft)" } };
// One hue, stronger is more severe (ordinal, not categories). Light and dark
// steps are set in globals.css.
const SEVERITY_COLOR = ["var(--sev-1)", "var(--sev-2)", "var(--sev-3)"];
const legendText = (v: string) => <span style={{ color: "var(--text)" }}>{v}</span>;
const BAR = "#2c7bb6";

export function PassChart({ bins }: { bins: number[] }) {
  const data = PASS_BINS.map((label, i) => ({ label, n: bins[i] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 24, right: 8, bottom: 8, left: 0 }} barCategoryGap={6}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <ReferenceArea x1="0 to 50" x2="100 to 150" fill="#D55E00" fillOpacity={0.08} label={{ value: "under 150 cm", position: "top", fontSize: 12, fill: "var(--text)" }} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: "passing distance, cm", position: "insideBottom", offset: -4, fontSize: 12, fill: "var(--moss)" }} height={40} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
        <Tooltip {...TIP} formatter={(v) => [`${v} passes`, "Measured"]} labelFormatter={(l) => `${l} cm`} />
        <Bar dataKey="n" fill={BAR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CrashChart({ rows }: { rows: Record<string, number>[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }} barCategoryGap={10}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        {SEVERITY.map((s, i) => (
          <Bar key={s} dataKey={s} stackId="a" fill={SEVERITY_COLOR[i]} stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpeciesChart({ rows }: { rows: { name: string; n: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 28 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={170} />
        <Tooltip {...TIP} formatter={(v) => [`${v} trees`, "Register"]} />
        <Bar dataKey="n" fill="#009E73" radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
