"use client";
// A5 Shade and trees: building and crown shade on 21 July, a tree what-if
// per street, a planting plan in this browser, and the species mix.
import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";
import { segName } from "@/lib/shared/segments";
import { usePlannerData, useJson, nf } from "@/lib/data";
import { useUrlState } from "@/lib/url";
import { useActivePreset } from "@/lib/preset";
import { listable, rankFor } from "@/lib/rank";
import { VIRIDIS } from "@/lib/colors";
import { useCityTrees } from "@/lib/useDossier";
import { Skeleton } from "@/components/ui/skeleton";
import type { BuildingsFile, ShadeLine } from "@/components/trees/ShadeMap";
import { WhatIf } from "@/components/trees/WhatIf";
import { PlantPlan } from "@/components/trees/PlantPlan";
import { SpeciesMix } from "@/components/trees/SpeciesMix";

const ShadeMap = dynamic(() => import("@/components/trees/ShadeMap").then((m) => m.ShadeMap), { ssr: false, loading: () => <Skeleton label="Loading the shade map" /> });

const DEFAULTS = { h: "2", s: "", n: "10", sp: "12" };
const CAPTION = "Shade estimated from OSM building heights and register tree crowns. Not a measured temperature.";

export default function TreesPage() {
  const [u, set, ready] = useUrlState(DEFAULTS);
  const { data } = usePlannerData();
  const { data: buildings } = useJson<BuildingsFile>("/data/buildings.json");
  const { trees, error: treeError } = useCityTrees();
  const active = useActivePreset();
  const hourIdx = Number(u.h);

  const rows = useMemo(() => (data ? listable(rankFor(data, active.preset, active.code)) : []), [data, active]);
  const lines = useMemo<ShadeLine[]>(
    () => (data ? data.streets.filter((s) => s.raw.shade).map((s) => ({ id: s.id, lines: s.lines, shade: s.raw.shade as number[], title: segName(s) })) : []),
    [data],
  );
  const crowns = useMemo(() => {
    if (!trees || !buildings) return [];
    const [s, w, n, e] = buildings.bbox;
    return trees.inBox(s, w, n, e).filter((i) => trees.crown[i] > 0).map((i) => ({ lat: trees.lat[i], lng: trees.lng[i], r: trees.crown[i] / 2 }));
  }, [trees, buildings]);

  const streetId = useMemo(() => {
    if (u.s) return Number(u.s);
    const first = rows.find((r) => data?.streetById.get(r.seg.id)?.raw.shade);
    return first?.seg.id ?? rows[0]?.seg.id ?? null;
  }, [u.s, rows, data]);
  const street = streetId != null ? data?.streetById.get(streetId) : undefined;
  const pick = useCallback(
    (id: number) => {
      set({ s: String(id) });
      document.getElementById("whatif")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [set],
  );
  const mapPick = useCallback((id: number) => set({ s: String(id) }), [set]);
  const meanShade = lines.length ? lines.reduce((a, l) => a + l.shade[hourIdx], 0) / lines.length : null;

  return (
    <div className="pl-trees">
      <header>
        <h1>Shade and trees</h1>
        <p>Where the Kernstadt has shade on a hot July afternoon, what new street trees could change on the list, and how varied the tree stock is.</p>
      </header>

      <section className="gr-card pl-section" aria-labelledby="shade-h">
        <h2 id="shade-h">Shade simulator, 21 July</h2>
        {!buildings || !ready ? (
          <Skeleton label="Loading buildings" />
        ) : (
          <>
            <div className="pl-toolbar" style={{ marginTop: 8 }}>
              <div className="pl-seg" role="group" aria-label="Time of day">
                {buildings.hours.map((h, i) => (
                  <button key={h} type="button" aria-pressed={i === hourIdx} onClick={() => set({ h: String(i) })}>
                    {h}:00
                  </button>
                ))}
              </div>
              <label className="f" style={{ minWidth: 220 }}>
                Time slider
                <input type="range" min={0} max={buildings.hours.length - 1} step={1} value={hourIdx} onChange={(e) => set({ h: e.target.value })} aria-valuetext={`${buildings.hours[hourIdx]}:00`} />
              </label>
              <p className="pl-note" style={{ maxWidth: 420 }}>
                {meanShade != null && `${nf(lines.length)} streets with an estimate, on average ${Math.round(meanShade * 100)}% of their length in shade at ${buildings.hours[hourIdx]}:00.`}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
              <ShadeMap file={buildings} hourIdx={hourIdx} lines={lines} crowns={crowns} focus={streetId} onPick={mapPick} height={600} />
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <p style={{ fontWeight: 700 }}>Street length in shade</p>
                  <div style={{ height: 12, borderRadius: 6, background: `linear-gradient(90deg, ${VIRIDIS.join(",")})`, marginTop: 6 }} aria-hidden="true" />
                  <div className="pl-legend" style={{ justifyContent: "space-between", marginTop: 2 }}>
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="pl-legend" style={{ display: "grid", gap: 4 }}>
                  <span>
                    <i style={{ background: "#d9d4ce", border: "1px solid #8a847d" }} />
                    Building (OSM outline)
                  </span>
                  <span>
                    <i style={{ background: "#1f2a6b", opacity: 0.6 }} />
                    Building shadow at this hour
                  </span>
                  <span>
                    <i style={{ background: "#009E73", opacity: 0.7, borderRadius: "50%" }} />
                    Register tree crown, approximate
                  </span>
                </div>
                <p className="pl-note">
                  <strong>{CAPTION}</strong>
                </p>
                <p className="pl-note">
                  {nf(buildings.buildings)} OSM buildings. Height from the height tag for {nf(buildings.heightSource.height)}, from building levels x 3 m for{" "}
                  {nf(buildings.heightSource.levels)}, and a 9 m default for {nf(buildings.heightSource.default)}. Crowns are discs from the register crown diameter
                  {treeError ? " (the register did not load, so crowns are missing on the map)" : ""}. OSM data as of {buildings.osmBase?.slice(0, 10) ?? "unknown"}.
                </p>
                <p className="pl-note">
                  The little shade measure in the score uses the 15:00 estimate where a street has one, and register crown cover elsewhere. Click a street to try trees on
                  it.
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      <section id="whatif" className="gr-card pl-section" aria-labelledby="whatif-h">
        <h2 id="whatif-h">
          Tree what-if <span className="pl-proposal">assumption</span>
        </h2>
        {data && street ? (
          <WhatIf
            data={data}
            active={active}
            rows={rows}
            street={street}
            trees={Number(u.n) || 10}
            spacing={Number(u.sp) || 12}
            onChange={(p) => set({ ...(p.street != null && { s: String(p.street) }), ...(p.trees != null && { n: String(p.trees) }), ...(p.spacing != null && { sp: String(p.spacing) }) })}
          />
        ) : (
          <Skeleton label="Loading the street list" />
        )}
      </section>

      <section className="gr-card pl-section pl-plan" aria-labelledby="plan-h">
        <h2 id="plan-h">Planting plan</h2>
        {data ? <PlantPlan data={data} active={active} rows={rows} onPick={pick} /> : <Skeleton label="Loading the plan" />}
      </section>

      <section className="gr-card pl-section" aria-labelledby="mix-h">
        <h2 id="mix-h">
          Species mix per district <span className="pl-proposal">rule of thumb</span>
        </h2>
        {trees ? <SpeciesMix trees={trees} /> : treeError ? <p className="pl-note">The tree register did not load: {treeError}</p> : <Skeleton label="Loading the tree register" />}
      </section>
    </div>
  );
}
