"use client";
// "This street matters to me": a demo that stays in this browser. It never
// changes a score and is not sent anywhere.
import { useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "../lib/store";

export const MATTERS = [
  { id: "heat", label: "Heat" },
  { id: "passes", label: "Close passes" },
  { id: "dust", label: "Dust" },
  { id: "school", label: "School route" },
] as const;
type MatterId = (typeof MATTERS)[number]["id"];
type Saved = Record<string, MatterId[]>;

export default function StreetChips({ streetKey }: { streetKey: string }) {
  const [saved, setSaved] = useState<Saved>({});
  useEffect(() => {
    const t = setTimeout(() => setSaved(readJSON<Saved>(KEYS.matters, {})), 0);
    return () => clearTimeout(t);
  }, []);
  const mine = saved[streetKey] ?? [];

  function toggle(id: MatterId) {
    const next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    const all = { ...saved, [streetKey]: next };
    if (!next.length) delete all[streetKey];
    setSaved(all);
    writeJSON(KEYS.matters, all);
  }

  return (
    <div className="matters">
      <p className="matters-title">
        This street matters to me <span className="badge badge-demo">Demo, not sent anywhere</span>
      </p>
      <div className="chips" role="group" aria-label="This street matters to me because of">
        {MATTERS.map((m) => (
          <button key={m.id} type="button" className="chip" aria-pressed={mine.includes(m.id)} onClick={() => toggle(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="matters-note">Saved in this browser only. It never changes a street score. Sending these to the city&apos;s GrünRoute Planner is on the roadmap.</p>
    </div>
  );
}
