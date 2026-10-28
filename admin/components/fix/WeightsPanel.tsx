"use client";
import { useState } from "react";
import { MAX_WEIGHT, MEASURES, PRESETS, type MeasureKey, type Weights } from "@/lib/shared/priority";

const WEIGHT_WORD = ["Off", "Low", "Medium", "High"];

type Props = {
  code: string;
  weights: Weights;
  onPreset: (id: string) => void;
  onWeights: (w: Weights) => void;
};

// Presets, the 7 sliders, and Copy link, moved here from the people app.
export function WeightsPanel({ code, weights, onPreset, onWeights }: Props) {
  const [copied, setCopied] = useState<"" | "ok" | "error">("");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(""), 2500);
  }
  const set = (key: MeasureKey, v: number) => onWeights({ ...weights, [key]: v });
  return (
    <section className="gr-card" aria-labelledby="prio-title">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h2 id="prio-title" style={{ fontSize: 20 }}>
          Priorities
        </h2>
        <button type="button" className="pl-btn" style={{ marginLeft: "auto" }} onClick={copyLink}>
          {copied === "ok" ? "Link copied" : copied === "error" ? "Copy failed, use the address bar" : "Copy link"}
        </button>
      </div>
      <div className="pl-seg" role="group" aria-label="Presets" style={{ flexWrap: "wrap", borderRadius: 16 }}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" aria-pressed={code === p.id} onClick={() => onPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "6px 16px", marginTop: 12 }}>
        {MEASURES.map((m) => {
          const v = weights[m.key];
          return (
            <label key={m.key} style={{ display: "grid", fontSize: 14 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{m.label}</span>
                <b>{WEIGHT_WORD[v]}</b>
              </span>
              <input
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={1}
                value={v}
                disabled={code === "gap"}
                aria-valuetext={WEIGHT_WORD[v]}
                onChange={(e) => set(m.key, Number(e.target.value))}
                style={{ accentColor: "var(--gruen)" }}
              />
            </label>
          );
        })}
      </div>
      {code === "gap" && <p className="pl-note">Passing gap only: 100 minus half the average passing gap in cm. Sliders are off for this preset.</p>}
      {code === "school" && <p className="pl-note">Safe school routes counts close passes 1.5 times as much within 300 m of a school or kindergarten.</p>}
    </section>
  );
}
