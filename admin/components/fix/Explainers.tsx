"use client";
// Text blocks moved from the people app: read before you decide, shade gaps,
// how the list is made, and the data behind it. Counts come from segments.json.
import { useEffect, useState } from "react";
import type { SegmentsMeta } from "@/lib/shared/priority";
import { RULE_150 } from "@/lib/shared/segments";
import { CAMPAIGN } from "@/lib/shared/data";
import { HEAT_WALK } from "@/lib/shared/heat-walks";
import { SOURCES } from "@/lib/shared/sources";
import { loadCityTrees } from "@/lib/shared/cityTrees";
import { shadeGaps, type ShadeGap } from "@/lib/shared/insights";
import { fmtAnomaly } from "@/lib/shared/geo";
import { nf } from "@/lib/data";

export function Explainers({ meta }: { meta: SegmentsMeta }) {
  const [gaps, setGaps] = useState<ShadeGap[] | null>(null);
  useEffect(() => {
    let live = true;
    loadCityTrees().then(
      (ct) => live && setGaps(shadeGaps(ct)),
      () => live && setGaps([]),
    );
    return () => {
      live = false;
    };
  }, []);
  const c = (k: string) => (typeof meta.counts[k] === "number" ? nf(meta.counts[k] as number) : "n/a");

  return (
    <div className="pl-two pl-section">
      <section>
        <h2 style={{ fontSize: 20 }}>Read before you decide</h2>
        <ul style={{ paddingLeft: 18, fontSize: 14, display: "grid", gap: 6 }}>
          <li>The fix score compares each street with all measured streets in Heilbronn on the measures you weight, then adds them up. 100 means worst on everything you chose.</li>
          <li>Close passes are the share of measured passes under 150 cm. {RULE_150}</li>
          <li>A street needs at least 2 of your measures, and at least one from a sensor, to get a score. Tree cover and crashes exist for every street, so they cannot rank a street alone. Streets with little data stay grey on the map, never hidden.</li>
          <li>Weak evidence means only 1 or 2 readings. Check those streets on the ground first.</li>
          <li>Tree cover is an estimate from the city tree register, public trees only. Crashes are police recorded injury crashes with a bike or a person on foot, 2021 to 2025.</li>
          <li>This is a screening tool, not an official legal measurement.</li>
        </ul>

        <h2 style={{ fontSize: 20, marginTop: 24 }}>How the list is made</h2>
        <ol style={{ paddingLeft: 18, fontSize: 14, display: "grid", gap: 6 }}>
          <li>
            <b>Collect.</b> Bike sensors record passing gaps, danger and dust, rough surfaces, and stop and go on normal rides. Summer heat walks, the city tree register, and police crash records add more.
          </li>
          <li>
            <b>Match.</b> Everything joins the {nf(meta.segments)} ATRAI street segments: dust points within 20 m, trees within 20 m, heat walk spots within 60 m, crashes within 25 m.
          </li>
          <li>
            <b>Group.</b> Segments with the same name and district form a street. A street measure is the length weighted mean of its segments, crashes are per 100 m over the whole street.
          </li>
          <li>
            <b>Rank.</b> Each measure is turned into a percentile over all streets, weighted, and added up to a fix score from 0 to 100.
          </li>
          <li>
            <b>Check.</b> Weak evidence means a ground check first. Final decisions still use official city data.
          </li>
        </ol>
      </section>
      <section>
        <h2 style={{ fontSize: 20 }}>Shade gaps to check</h2>
        <p className="pl-note">Spots at least 1 °C warmer than the rest of the same summer heat walk, with the fewest city trees within 40 m.</p>
        {gaps == null ? (
          <p className="pl-note">Loading the tree register...</p>
        ) : (
          <ol style={{ paddingLeft: 18, fontSize: 14 }}>
            {gaps.map((g) => (
              <li key={g.index}>
                Near {g.near || "unnamed street"}: <b>{fmtAnomaly(g.anomaly)}</b>, {g.trees} {g.trees === 1 ? "tree" : "trees"} within 40 m
              </li>
            ))}
          </ol>
        )}
        <p className="pl-note">Heat walks covered only a few routes in September 2026. Check each spot on the ground before planning trees.</p>

        <h2 style={{ fontSize: 20, marginTop: 24 }}>The data behind it</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", fontSize: 14, margin: 0 }}>
          <dt>Bike rides</dt>
          <dd className="num" style={{ margin: 0 }}>{CAMPAIGN.rides}</dd>
          <dt>Kilometres ridden</dt>
          <dd className="num" style={{ margin: 0 }}>{CAMPAIGN.km}</dd>
          <dt>Street segments in Heilbronn</dt>
          <dd className="num" style={{ margin: 0 }}>{nf(meta.segments)}</dd>
          <dt>Measured passes</dt>
          <dd className="num" style={{ margin: 0 }}>{c("passes")}</dd>
          <dt>Danger and dust points</dt>
          <dd className="num" style={{ margin: 0 }}>{c("pmPoints")}</dd>
          <dt>Public trees, city register</dt>
          <dd className="num" style={{ margin: 0 }}>{c("trees")}</dd>
          <dt>Heat walk readings</dt>
          <dd className="num" style={{ margin: 0 }}>{nf(HEAT_WALK.points)}</dd>
          <dt>Bike or foot injury crashes, 2021 to 2025</dt>
          <dd className="num" style={{ margin: 0 }}>{c("crashes")}</dd>
        </dl>
        <p className="pl-note" style={{ marginTop: 8 }}>
          Sources: {SOURCES.map((x) => x.name).join(", ")}. Full list on <a href="/data">Data and missions</a>.
        </p>
      </section>
    </div>
  );
}
