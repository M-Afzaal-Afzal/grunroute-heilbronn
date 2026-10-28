// Raw values behind a driver, so a percentile is never shown alone.
// "Crashes: 1 crash 2021 to 2025, worse than 92% of measured streets".
import { MEASURES, type MeasureKey, type Segment } from "./shared/priority";
import type { Driver } from "./actions";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Short raw value for one measure on one street. */
export function rawValue(s: Segment, key: MeasureKey): string {
  const r = s.raw;
  switch (key) {
    case "safety":
      return `${pct(s.m.safety ?? 0)} of ${r.passes.toLocaleString("en-GB")} passes under 150 cm`;
    case "heat":
      return `${(s.m.heat ?? 0) > 0 ? "+" : ""}${(s.m.heat ?? 0).toFixed(1)} °C against the same heat walk`;
    case "shadeGap":
      return r.shade ? `about ${pct(r.shade[2])} in shade at 15:00` : `crown cover about ${pct(r.crownCover ?? 0)}`;
    case "dust":
      return `danger and dust index ${(s.m.dust ?? 0).toFixed(2)} of 1`;
    case "rough":
      return `roughness ${s.m.rough} of 100`;
    case "stopgo":
      return `traffic flow ${r.flow?.toFixed(2)} of 1, 0 is stop and go`;
    case "crashes": {
      const [k, se, sl] = r.crashesByCat;
      const parts = [k && `${k} killed`, se && `${se} seriously injured`, sl && `${sl} slightly injured`].filter(Boolean).join(", ");
      return `${r.crashes} ${r.crashes === 1 ? "crash" : "crashes"} 2021 to 2025${parts ? ` (${parts})` : ""}`;
    }
  }
}

export const measureName = (key: MeasureKey) => MEASURES.find((m) => m.key === key)?.label ?? key;

/** "worse than 92% of measured streets": the percentile, in words. */
export const worseThan = (p: number) => `worse than ${pct(p)} of measured streets`;

export function driverLine(s: Segment, d: Pick<Driver, "key" | "p">): string {
  return `${measureName(d.key)}: ${rawValue(s, d.key)}, ${worseThan(d.p)}`;
}
