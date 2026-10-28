"use client";
// Next step and suggested measures for one street (lib/actions.ts).
import { EFFORT_LABEL, IDEAS_NOTE, MIN_CRASHES, NEXT_HELP, SUPPORT_NOTE, driversOf, heldBack, nextStepOf, suggestionsFor, supportFrom, type Idea } from "@/lib/actions";
import { rawValue, worseThan } from "@/lib/driverText";
import { saveCase, useCases } from "@/lib/cases";
import { MEASURES, type Scored } from "@/lib/shared/priority";
import { NextTag } from "@/components/NextTag";

const label = (k: string) => MEASURES.find((m) => m.key === k)?.label ?? k;

export function ActionsPanel({ id, row }: { id: number; row: Scored }) {
  const cases = useCases();
  const c = cases[String(id)];
  const step = nextStepOf(row);
  const sugg = suggestionsFor(row);
  const pOf = new Map(driversOf(row).map((d) => [d.key, d.p]));
  const held = heldBack(row);

  function use(i: Idea) {
    saveCase(id, { lead: i.team, ...(i.fixType ? { fixType: i.fixType } : {}) });
  }

  return (
    <section className="gr-card" aria-labelledby="actions-title">
      <h2 id="actions-title" style={{ fontSize: 20 }}>
        What to do next <span className="pl-proposal">proposal</span>
      </h2>
      {step ? (
        <p style={{ margin: "8px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <NextTag step={step} />
          <span className="pl-note">{NEXT_HELP[step]}</span>
        </p>
      ) : (
        <p className="pl-note" style={{ margin: "8px 0" }}>
          Little data for this preset, so no next step. Collect more data first, see Data and missions.
        </p>
      )}
      <p className="pl-note" style={{ marginBottom: 8 }}>
        <b>Data support:</b> {supportFrom(row)}. {SUPPORT_NOTE}
      </p>
      {sugg.length === 0 ? (
        <p className="pl-note">No measure is worse than 75% of measured streets here, so there is no clear driver to act on.</p>
      ) : (
        <div className="pl-ideas">
          {sugg.map((s) => (
            <div key={s.driver}>
              <h3 style={{ fontSize: 16, margin: "8px 0 0" }}>{label(s.driver)}</h3>
              <p className="pl-note" style={{ margin: "0 0 4px" }}>
                {rawValue(row.seg, s.driver)}, {worseThan(pOf.get(s.driver) ?? 0)}.
              </p>
              <ul>
                {s.ideas.map((i) => {
                  const inCase = c?.lead === i.team && (!i.fixType || c?.fixType === i.fixType);
                  return (
                    <li key={i.text}>
                      <span className="pl-chip">{EFFORT_LABEL[i.effort]}</span>
                      <span>
                        {i.text} <span className="pl-note">Lead: {i.team}.</span>
                      </span>
                      <button type="button" className="pl-btn" disabled={inCase} onClick={() => use(i)} title="Set the lead team and fix type of this case">
                        {inCase ? "In the case" : "Use for this case"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {held.includes("crashes") && (
        <p className="pl-note" style={{ marginTop: 8 }}>
          Crashes are not a driver here: {rawValue(row.seg, "crashes")}. Most streets have no crash, so one crash already ranks high. Our rule counts crashes as a driver from {MIN_CRASHES} crashes. The crash still counts in the score.
        </p>
      )}
      <p className="pl-note" style={{ marginTop: 8 }}>
        {IDEAS_NOTE}
      </p>
    </section>
  );
}
