"use client";
// Planting plan, saved in this browser only. Each street is worked out on its
// own with lib/whatif.ts, so two streets in the plan do not move each other.
import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { districtLabel } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import { nf, type PlannerData } from "@/lib/data";
import type { ActivePreset } from "@/lib/preset";
import type { RankedRow } from "@/lib/rank";
import { whatIf } from "@/lib/whatif";
import { clearPlan, COST_KEY, removePlanItem, usePlan } from "@/lib/plan";
import { download, exportHeader, toCsv } from "@/lib/export";
import { BandTag } from "@/components/BandTag";

const COST_EVENT = "planner:cost";
const readCost = () => {
  try {
    return localStorage.getItem(COST_KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribeCost = (cb: () => void) => {
  window.addEventListener(COST_EVENT, cb);
  return () => window.removeEventListener(COST_EVENT, cb);
};
function writeCost(v: string) {
  try {
    if (v) localStorage.setItem(COST_KEY, v);
    else localStorage.removeItem(COST_KEY);
  } catch {
    // private mode
  }
  window.dispatchEvent(new Event(COST_EVENT));
}

export function PlantPlan({ data, active, rows, onPick }: { data: PlannerData; active: ActivePreset; rows: RankedRow[]; onPick: (id: number) => void }) {
  const plan = usePlan();
  const costText = useSyncExternalStore(subscribeCost, readCost, () => "");
  const cost = costText.trim() === "" ? null : Number(costText);
  const byId = useMemo(() => new Map(rows.map((r) => [r.seg.id, r])), [rows]);

  const items = useMemo(
    () =>
      plan
        .map((p) => {
          const street = data.streetById.get(p.id);
          if (!street) return null;
          const [, y10, y25] = whatIf(data, active.preset, active.code, street, p.trees, p.spacing);
          return { p, street, now: byId.get(p.id) ?? null, y10, y25 };
        })
        .filter((x) => x != null),
    [plan, data, active, byId],
  );

  const totalTrees = items.reduce((a, x) => a + x.y25.trees, 0);
  const fixSoonNow = items.filter((x) => x.now?.score != null && x.now.score >= 80);
  const leave10 = fixSoonNow.filter((x) => x.y10.score != null && x.y10.score < 80).length;
  const leave25 = fixSoonNow.filter((x) => x.y25.score != null && x.y25.score < 80).length;
  const districts = [...new Set(items.map((x) => districtLabel(x.street.district)))].sort();

  function exportCsv() {
    const header = [...exportHeader(active.label, active.preset.weights), "Planting plan, demo. Crown sizes are assumptions. Each street is worked out on its own."];
    const columns = ["street_id", "street", "district", "length_m", "trees", "spacing_m", "score_now", "rank_now", "score_10y", "rank_10y", "score_25y", "rank_25y", "cost_per_tree", "cost_total"];
    const out = items.map((x) => [
      x.street.id, segName(x.street), districtLabel(x.street.district), Math.round(x.street.length), x.y25.trees, x.p.spacing,
      x.now?.score ?? "", x.now?.rank ?? "", x.y10.score ?? "", x.y10.rank ?? "", x.y25.score ?? "", x.y25.rank ?? "",
      cost ?? "", cost != null ? cost * x.y25.trees : "",
    ]);
    download(`gruenroute-planting-plan-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, columns, out), "text/csv;charset=utf-8");
  }

  function printPlan() {
    document.documentElement.classList.add("print-plan");
    const done = () => {
      document.documentElement.classList.remove("print-plan");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="pl-toolbar" style={{ marginBottom: 0 }}>
        <label className="f">
          Cost per tree in EUR, your figure
          <input type="number" min={0} className="pl-input" value={costText} placeholder="not set" onChange={(e) => writeCost(e.target.value)} style={{ width: 160 }} />
        </label>
        <button type="button" className="pl-btn no-print" onClick={exportCsv} disabled={items.length === 0}>
          Export CSV
        </button>
        <button type="button" className="pl-btn no-print" onClick={printPlan} disabled={items.length === 0}>
          Print plan
        </button>
        <button type="button" className="pl-btn no-print" onClick={clearPlan} disabled={items.length === 0}>
          Clear plan
        </button>
      </div>

      {items.length === 0 ? (
        <p className="pl-note">No streets in the plan yet. Pick a street in the what-if above, or click a street on the shade map, then press Add to planting plan.</p>
      ) : (
        <>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            <Stat label="Streets" value={nf(items.length)} />
            <Stat label="New trees" value={nf(totalTrees)} />
            <Stat label="Cost" value={cost != null && Number.isFinite(cost) ? `${nf(cost * totalTrees)} EUR` : "enter a cost per tree"} />
            <Stat label="Leave Fix soon" value={fixSoonNow.length ? `${leave10} of ${fixSoonNow.length} in 10 years, ${leave25} in 25 years` : "none are Fix soon today"} />
          </dl>
          <p className="pl-note">Districts reached: {districts.join(", ")}.</p>
          <table className="pl-table pl-print-table">
            <thead>
              <tr>
                <th scope="col">Street</th>
                <th scope="col">District</th>
                <th scope="col" className="n">Trees</th>
                <th scope="col" className="n">Spacing</th>
                <th scope="col">Today</th>
                <th scope="col">In 10 years</th>
                <th scope="col">In 25 years</th>
                <th scope="col" className="no-print">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.p.id}>
                  <td>
                    <Link href={`/street/${x.street.id}`}>{segName(x.street)}</Link>
                  </td>
                  <td>{districtLabel(x.street.district)}</td>
                  <td className="n">{x.y25.trees}</td>
                  <td className="n">{x.p.spacing} m</td>
                  <td>
                    <BandTag score={x.now?.score ?? null} /> <span className="pl-note">rank {x.now?.rank ?? "-"}</span>
                  </td>
                  <td>
                    <BandTag score={x.y10.score} /> <span className="pl-note">rank {x.y10.rank ?? "-"}</span>
                  </td>
                  <td>
                    <BandTag score={x.y25.score} /> <span className="pl-note">rank {x.y25.rank ?? "-"}</span>
                  </td>
                  <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="pl-btn" onClick={() => onPick(x.p.id)}>
                      Edit
                    </button>{" "}
                    <button type="button" className="pl-btn" onClick={() => removePlanItem(x.p.id)} aria-label={`Remove ${segName(x.street)} from the plan`}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="pl-note">Demo: the plan and the cost stay in this browser and are not sent anywhere. Weighting: {active.label}.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="gr-card" style={{ padding: 12 }}>
      <dt className="pl-note">{label}</dt>
      <dd style={{ fontWeight: 700, fontSize: 18 }}>{value}</dd>
    </div>
  );
}
