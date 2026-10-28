"use client";
// A6 Data and missions: coverage by support, gaps near schools and top
// streets, a mission builder with missions.json export and print cards, the
// new data approval demo, and sources with freshness.
import { useMemo } from "react";
import { SOURCES } from "@/lib/shared/sources";
import { usePlannerData, nf } from "@/lib/data";
import { useActivePreset } from "@/lib/preset";
import { listable, rankFor } from "@/lib/rank";
import { PEOPLE_APP } from "@/lib/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Coverage } from "@/components/data/Coverage";
import { Missions } from "@/components/data/Missions";
import { Approval } from "@/components/data/Approval";

const REBUILD = [
  ["node scripts/build-trees.mjs", "Tree register to public/data/baumkataster.json"],
  ["node scripts/build-segments.mjs", "Street measures to public/data/segments.json"],
  ["node scripts/build-shade.mjs", "OSM buildings and crowns to shade per segment (Kernstadt)"],
  ["node scripts/build-segments.mjs", "Again, so the shade estimate is in the scores"],
  ["node scripts/build-missions.mjs", "Default data missions to public/data/missions.json"],
  ["cd admin && node scripts/sync-shared.mjs", "Copy the shared code and data into the Planner (also runs before dev, build and test)"],
];

export default function DataPage() {
  const { data, error } = usePlannerData();
  const active = useActivePreset();
  const all = useMemo(() => (data ? rankFor(data, active.preset, active.code, "streets", false) : []), [data, active]);
  const top = useMemo(() => (data ? listable(rankFor(data, active.preset, active.code)) : []), [data, active]);

  return (
    <div className="pl-data">
      <header>
        <h1>Data and missions</h1>
        <p>Where the evidence is thin, which gaps matter most, how to send volunteers to fill them, and how new data would be checked before it counts.</p>
      </header>
      {error && <p role="alert">The street data did not load: {error}</p>}

      <section className="gr-card pl-section no-print" aria-labelledby="cov-h">
        <h2 id="cov-h">Coverage by data support</h2>
        {data ? <Coverage data={data} rows={all} /> : <Skeleton label="Loading the street network" />}
      </section>

      <section className="gr-card pl-section pl-missions-wrap" aria-labelledby="mis-h">
        <h2 id="mis-h" className="no-print">
          Data gaps and missions
        </h2>
        {data ? <Missions data={data} all={all} top={top} active={active} /> : <Skeleton label="Loading gaps" />}
      </section>

      <section className="gr-card pl-section no-print" aria-labelledby="app-h" id="new-data">
        <h2 id="app-h">New data approval</h2>
        <p className="sub">
          Template and field guide:{" "}
          <a href={`${PEOPLE_APP}/data-collection`} target="_blank" rel="noreferrer">
            Collect data page in GrünRoute
          </a>
          .
        </p>
        {data ? <Approval data={data} active={active} /> : <Skeleton label="Loading the street data" />}
      </section>

      <section className="gr-card pl-section no-print" aria-labelledby="src-h">
        <h2 id="src-h">Sources and freshness</h2>
        <p className="sub">Data build: {data?.meta.built ?? "loading"}. {data && `${nf(data.meta.segments)} road segments.`}</p>
        <table className="pl-table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Provider</th>
              <th scope="col">Licence</th>
              <th scope="col">Data date</th>
              <th scope="col">Used for</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                </th>
                <td>{s.provider}</td>
                <td>{s.licence}</td>
                <td>{s.date}</td>
                <td>{s.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 style={{ fontSize: 17, marginTop: 16 }}>Rebuild, from the repo root, in this order</h3>
        <table className="pl-table">
          <tbody>
            {REBUILD.map(([cmd, what], i) => (
              <tr key={i}>
                <td>
                  <code>{cmd}</code>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pl-note">Then build and deploy both apps. Some source files are not in git for size (Unfallatlas zips, the ATRAI dust file) and must be downloaded again first.</p>
      </section>
    </div>
  );
}
