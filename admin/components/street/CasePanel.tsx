"use client";
// Case workflow for one street. Demo only: saved in this browser, never sent.
import { useState } from "react";
import { STATUSES, saveCase, useCases, type CaseEntry, type Status } from "@/lib/cases";

export const LEAD_TEAMS = ["Grünflächenamt", "Tiefbauamt", "Straßenverkehrsbehörde", "Schulverwaltung", "Klimaschutz"];
export const FIX_TYPES = ["Trees", "Traffic calming", "Surface", "School route"];
const EMPTY: CaseEntry = { status: "New", lead: "", fixType: "", notes: "", history: [] };

export function CasePanel({ id }: { id: number }) {
  const cases = useCases();
  const c = cases[String(id)] ?? EMPTY;
  // Notes are saved on blur, so typing stays smooth.
  const [draft, setDraft] = useState<string | null>(null);
  const notes = draft ?? c.notes;

  return (
    <section className="gr-card" aria-labelledby="case-title">
      <h2 id="case-title" style={{ fontSize: 20 }}>
        Case <span className="pl-proposal">demo, saved in this browser only</span>
      </h2>
      <div className="pl-toolbar" style={{ marginTop: 12, marginBottom: 8 }}>
        <label className="f">
          Status
          <select value={c.status} onChange={(e) => saveCase(id, { status: e.target.value as Status })}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Lead team
          <select value={c.lead} onChange={(e) => saveCase(id, { lead: e.target.value })}>
            <option value="">Not set</option>
            {LEAD_TEAMS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Fix type
          <select value={c.fixType} onChange={(e) => saveCase(id, { fixType: e.target.value })}>
            <option value="">Not set</option>
            {FIX_TYPES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ display: "grid", gap: 2, fontSize: 13, fontWeight: 600, color: "var(--moss)", marginBottom: 8 }}>
        Notes, never leave this browser
        <textarea
          className="pl-input"
          rows={3}
          value={notes}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft != null && draft !== c.notes) saveCase(id, { notes: draft });
            setDraft(null);
          }}
        />
      </label>
      <h3 style={{ fontSize: 15, marginTop: 8 }}>History</h3>
      {c.history.length === 0 ? (
        <p className="pl-note">No status change yet. Every case starts as New.</p>
      ) : (
        <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>
          {c.history.map((h, i) => (
            <li key={i}>
              {h.status}, {new Date(h.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </li>
          ))}
        </ol>
      )}
      <p className="pl-note" style={{ marginTop: 12 }}>
        <b>Measure again:</b> after a fix, measure again with the same method in the same season window, and report before and after with the uncertainty.
      </p>
    </section>
  );
}
