"use client";
// A6 gap finder and mission builder. Gaps are streets with little or no
// sensor data near a school or next to a top 50 street. Selected gaps become
// a route bundle (busy road, side street, school street, green alternative).
// Missions live in this browser until exported as missions.json.
import { useEffect, useMemo, useState } from "react";
import { districtLabel, type Street } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { MISSION_RULE, ROLES, TIME_BANDS, TOP_N, bundle, findGaps, missionWhy, type Gap, type Mission, type MissionsFile, type TimeBandId } from "@/lib/shared/missions";
import type { PlannerData } from "@/lib/data";
import { nf, useJson } from "@/lib/data";
import type { RankedRow } from "@/lib/rank";
import type { ActivePreset } from "@/lib/preset";
import { download } from "@/lib/export";
import { Skeleton } from "@/components/ui/skeleton";
import { localStore } from "@/lib/localStore";

const store = localStore<Mission[] | null>("planner.missions", null);
const name = (s: Street) => segName(s);

/** Streets sent from What needs fixing as ?pick=1,2,3, so a blind spot goes straight into a mission. */
function pickedFromUrl(): number[] {
  if (typeof window === "undefined") return [];
  const v = new URLSearchParams(window.location.search).get("pick");
  return v ? v.split(",").map(Number).filter(Number.isInteger) : [];
}

export function Missions({ data, all, top, active }: { data: PlannerData; all: RankedRow[]; top: RankedRow[]; active: ActivePreset }) {
  const { data: file } = useJson<MissionsFile>("/data/missions.json");
  const topIds = useMemo(() => top.slice(0, TOP_N).map((r) => r.seg.id), [top]);
  const gaps = useMemo(() => findGaps(all, topIds), [all, topIds]);
  const groups = useMemo(() => {
    const by = new Map<string, Gap[]>();
    for (const g of gaps) {
      const d = districtLabel(g.street.district);
      by.set(d, [...(by.get(d) ?? []), g]);
    }
    return [...by].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [gaps]);

  // This component mounts only after the data loads in the browser, so the link can be read here.
  const [picked] = useState(pickedFromUrl);
  const [sel, setSel] = useState<Set<number>>(() => new Set(picked));
  const [band, setBand] = useState<TimeBandId>("am");
  const [title, setTitle] = useState("");
  const local = store.use();
  const [open, setOpen] = useState<string | null>(() => {
    const g = gaps.find((x) => picked.includes(x.street.id));
    return g ? districtLabel(g.street.district) : null;
  });
  const pickedGaps = gaps.filter((g) => picked.includes(g.street.id)).length;
  useEffect(() => {
    if (picked.length) document.getElementById("mis-h")?.scrollIntoView({ block: "start" });
  }, [picked]);
  const missions = local ?? file?.missions ?? null;
  const save = store.write;

  const toggle = (ids: number[], on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  function build() {
    const picked = gaps.filter((g) => sel.has(g.street.id));
    if (!picked.length) return;
    const count = new Map<string, number>();
    for (const g of picked) count.set(districtLabel(g.street.district), (count.get(districtLabel(g.street.district)) ?? 0) + 1);
    const district = [...count].sort((a, b) => b[1] - a[1])[0][0];
    const b = bundle(picked, name);
    const list = missions ?? [];
    const ids = new Set(list.map((m) => m.id));
    let i = list.length + 1;
    while (ids.has(`m${String(i).padStart(2, "0")}`)) i++;
    const m: Mission = {
      id: `m${String(i).padStart(2, "0")}`,
      title: title.trim() || `${district}: ${b.streets.length} streets to measure`,
      district,
      timeBand: band,
      streets: b.streets,
      why: missionWhy(picked),
      missing: b.missing,
    };
    save([...list, m]);
    setSel(new Set());
    setTitle("");
  }

  function exportFile() {
    const out: MissionsFile = {
      version: 1,
      built: data.meta.built,
      created: new Date().toISOString().slice(0, 10),
      rule: MISSION_RULE,
      preset: active.label,
      timeBands: TIME_BANDS,
      missions: missions ?? [],
    };
    download("missions.json", JSON.stringify(out, null, 1), "application/json");
  }

  function printCards() {
    document.documentElement.classList.add("print-missions");
    const done = () => {
      document.documentElement.classList.remove("print-missions");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  const bandLabel = (id: string) => TIME_BANDS.find((b) => b.id === id)?.label ?? id;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="no-print">
        <h3 style={{ fontSize: 18 }}>Gap finder</h3>
        <p className="pl-note" style={{ maxWidth: "80ch" }}>
          Streets of 20 m or more with Low support (1 or 2 readings) or no sensor data, that are within 300 m of a school or kindergarten, or meet one of the top{" "}
          {TOP_N} streets for the active preset ({active.label}) within 25 m. {nf(gaps.length)} streets in {nf(groups.length)} districts.
        </p>
        {picked.length > 0 && (
          <p className="pl-note" style={{ marginTop: 6 }}>
            <b>
              {nf(pickedGaps)} {pickedGaps === 1 ? "street" : "streets"} picked from What needs fixing.
            </b>{" "}
            {pickedGaps < picked.length ? `${nf(picked.length - pickedGaps)} of the links are not gaps for this preset, so they are not picked.` : "Name the mission and build it below."}
          </p>
        )}
        <div style={{ display: "grid", gap: 6, marginTop: 8, maxHeight: 420, overflow: "auto", border: "1px solid var(--stone)", borderRadius: 8, padding: 8 }}>
          {groups.map(([d, list]) => {
            const ids = list.map((g) => g.street.id);
            const n = ids.filter((id) => sel.has(id)).length;
            return (
              <details key={d} open={open === d} onToggle={(e) => {
                if (e.currentTarget.open) setOpen(d);
                else if (open === d) setOpen(null);
              }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, padding: "4px 0" }}>
                  {d}: {nf(list.length)} gaps{n ? `, ${n} selected` : ""}
                </summary>
                <div className="pl-toolbar" style={{ margin: "4px 0" }}>
                  <button type="button" className="pl-btn" onClick={() => toggle(ids, n < ids.length)}>
                    {n < ids.length ? "Select all in this district" : "Clear this district"}
                  </button>
                </div>
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th scope="col">Pick</th>
                      <th scope="col">Street</th>
                      <th scope="col" className="n">Length</th>
                      <th scope="col">Data</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((g) => (
                      <tr key={g.street.id}>
                        <td>
                          <input type="checkbox" aria-label={`Pick ${segName(g.street)}`} checked={sel.has(g.street.id)} onChange={(e) => toggle([g.street.id], e.target.checked)} />
                        </td>
                        <td>{segName(g.street)}</td>
                        <td className="n">{nf(Math.round(g.street.length))} m</td>
                        <td>{g.support === "Low" ? "Low" : "None"}</td>
                        <td>{[g.school && "Near a school", g.nextToTop && "Next to a top street"].filter(Boolean).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            );
          })}
        </div>
      </div>

      <div className="no-print">
        <h3 style={{ fontSize: 18 }}>Mission builder</h3>
        <p style={{ fontWeight: 700, margin: "4px 0 8px" }}>Rule: {MISSION_RULE}</p>
        <div className="pl-toolbar">
          <div className="pl-seg" role="group" aria-label="Time band">
            {TIME_BANDS.map((b) => (
              <button key={b.id} type="button" aria-pressed={band === b.id} onClick={() => setBand(b.id)}>
                {b.label}
              </button>
            ))}
          </div>
          <label className="f">
            Mission name (optional)
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="District: N streets to measure" style={{ width: 260 }} />
          </label>
          <button type="button" className="pl-btn primary" disabled={!sel.size} onClick={build}>
            Build a bundle from {nf(sel.size)} selected
          </button>
        </div>
        <p className="pl-note">
          A bundle takes up to 4 of the selected streets: the longest school street, the busy road with the most traffic flow, the quietest side street, and the one
          with the most tree crown cover as the green alternative. Roles with no street are listed as missing.
        </p>
      </div>

      <div className="pl-missions">
        <div className="pl-toolbar no-print" style={{ marginBottom: 8 }}>
          <strong>{missions ? `${nf(missions.length)} missions` : "Loading missions"}</strong>
          <span className="pl-note">{local ? "Edited in this browser." : "From the default file built with the data (public/data/missions.json)."}</span>
          <button type="button" className="pl-btn" onClick={exportFile} disabled={!missions?.length}>
            Export missions.json
          </button>
          <button type="button" className="pl-btn" onClick={printCards} disabled={!missions?.length}>
            Print mission cards
          </button>
          {local && (
            <button type="button" className="pl-btn" onClick={() => save(null)}>
              Back to the default file
            </button>
          )}
        </div>
        {!missions ? (
          <Skeleton label="Loading missions" />
        ) : (
          <div className="pl-cards">
            {missions.map((m) => (
              <article key={m.id} className="pl-card">
                <header>
                  <span className="pl-chip">{m.id}</span> <strong>{m.title}</strong>
                </header>
                <p className="pl-note">
                  {m.district}. {bandLabel(m.timeBand)}.
                </p>
                <ol>
                  {m.streets.map((s) => (
                    <li key={s.id}>
                      <strong>{ROLES[s.role]}:</strong> {s.name}, {nf(s.length)} m
                    </li>
                  ))}
                </ol>
                {m.missing.length > 0 && <p className="pl-note">No street found for: {m.missing.map((r) => ROLES[r].toLowerCase()).join(", ")}.</p>}
                <p className="pl-note">{m.why}</p>
                <p style={{ fontWeight: 700, fontSize: 13 }}>{MISSION_RULE}</p>
                <button type="button" className="pl-btn no-print" onClick={() => save(missions.filter((x) => x.id !== m.id))}>
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
        <p className="pl-note no-print" style={{ marginTop: 8 }}>
          The people app reads public/data/missions.json at the repo root under Help measure. To publish new missions, export the file, replace that copy, and rebuild
          both apps. Format, version 1: {"{ version, built, created, rule, preset, timeBands, missions: [{ id, title, district, timeBand, streets: [{ id, name, role, lat, lng, length }], why, missing }] }"}.
        </p>
      </div>
    </div>
  );
}
