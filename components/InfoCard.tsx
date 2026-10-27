"use client";

import type { Insight } from "../lib/insights";

type Props = { insight: Insight; onClose: () => void };

// Detail card for whatever is selected on the map: what it is, what it
// means, and what to do about it.
export default function InfoCard({ insight, onClose }: Props) {
  return (
    <aside className={`info-card tone-${insight.tone}`} aria-live="polite" aria-label={`${insight.kicker}: ${insight.title}`}>
      <div className="info-head">
        <div>
          <p className="info-kicker">{insight.kicker}</p>
          <h3 className="info-title">{insight.title}</h3>
        </div>
        <button type="button" className="info-close" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="info-body">
        <dl className="info-facts">
          {insight.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <h4>What this means</h4>
        <ul className="info-list">
          {insight.meaning.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <h4>What to do</h4>
        <ul className="info-list info-actions">
          {insight.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="info-source">{insight.source}</p>
      </div>
    </aside>
  );
}
