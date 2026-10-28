"use client";
// Today's temperature by hour (recharts, MIT). Observed solid, forecast dashed.
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HEAT_DOT } from "@/lib/colors";
import { HOT_DAY_C, type HourTemp } from "@/lib/weather";

const AXIS = { fontSize: 12, fill: "var(--moss)" };
const GRID = "var(--stone-soft)";
const legendText = (v: string) => <span style={{ color: "var(--text)" }}>{v}</span>;

export function TempChart({ hours }: { hours: HourTemp[] }) {
  const vals = hours.flatMap((h) => [h.observed, h.forecast]).filter((v): v is number => v != null);
  const top = Math.max(HOT_DAY_C + 2, Math.ceil(Math.max(...vals) + 1));
  const bottom = Math.floor(Math.min(...vals) - 1);
  // Join the two lines at the last observed hour.
  const last = hours.map((h) => h.observed != null).lastIndexOf(true);
  const data = hours.map((h, i) => ({ ...h, forecast: h.forecast ?? (i === last ? h.observed : null) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={2} />
        <YAxis domain={[bottom, top]} tick={AXIS} tickLine={false} axisLine={false} width={40} unit=" °C" />
        <ReferenceLine y={HOT_DAY_C} stroke="var(--moss)" strokeDasharray="2 4" label={{ value: `hot day, ${HOT_DAY_C} °C`, position: "insideTopLeft", fontSize: 12, fill: "var(--text)" }} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--stone)", borderRadius: 8, fontSize: 13 }}
          formatter={(v, name) => [v == null ? "-" : `${v} °C`, name]}
          labelFormatter={(l) => `${l}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        <Line name="Measured" dataKey="observed" stroke={HEAT_DOT} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        <Line name="Forecast" dataKey="forecast" stroke={HEAT_DOT} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
