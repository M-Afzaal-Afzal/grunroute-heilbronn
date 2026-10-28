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
        {insight.why && insight.why.length > 0 && (
          <>
            <h4>Why this street</h4>
            {insight.why.some((w) => w.share > 0) && (
              <div className="why-bar" role="img" aria-label={insight.why.filter((w) => w.share > 0).map((w) => `${w.label} ${Math.round(w.share * 100)}%`).join(", ")}>
                {insight.why.filter((w) => w.share > 0).map((w) => (
                  <span key={w.key} style={{ width: `${w.share * 100}%`, background: w.color }} />
                ))}
              </div>
            )}
            <ul className="why-list">
              {insight.why.map((w) => (
                <li key={w.key}>
                  <span className="why-dot" style={{ background: w.color }} aria-hidden="true" />
                  <div>
                    <p className="why-head">
                      <strong>{w.label}</strong>
                      <span>{w.points != null ? `${Math.round(w.share * 100)}% of the score` : "not in your priorities"}</span>
                    </p>
                    <p>{w.value}</p>
                    <p className="why-meta">
                      {w.count}. {w.source}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
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
