"use client";
// District league: per Stadtteil, how much of the street network is measured,
// how much tree crown covers the streets, and the tree species mix against
// the 10-20-30 rule of thumb. Sorting only, no ranks or medals.
import { useEffect, useMemo, useState } from "react";
import { loadSegments } from "../lib/segments";
import { aggregateStreets, type Street } from "../lib/priority";
import { districtRows, sortRows, treeDistrictLabel, TRUSTED, type SortKey } from "../lib/districts";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { RULE, speciesByDistrict, type Top } from "../lib/species";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "measured", label: "Share of streets measured" },
  { key: "trusted", label: "Share with trusted data" },
  { key: "crown", label: "Tree crown cover along streets" },
  { key: "streets", label: "Number of streets" },
  { key: "name", label: "Name, A to Z" },
];

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function MixLine({ what, top, limit }: { what: string; top: Top; limit: number }) {
  if (!top.name) return null;
  const over = top.share > limit;
  return (
    <li className={over ? "is-over" : ""}>
      <span>
        Top {what}: <i>{top.name}</i>
      </span>
      <b>
        {Math.round(top.share * 100)}% <small>({over ? "over the" : "within the"} {Math.round(limit * 100)}% rule)</small>
      </b>
    </li>
  );
}

export default function Districts() {
  const [streets, setStreets] = useState<Street[] | null>(null);
  const [trees, setTrees] = useState<CityTrees | null>(null);
  const [segErr, setSegErr] = useState(false);
  const [treeErr, setTreeErr] = useState(false);
  const [sort, setSort] = useState<SortKey>("measured");

  useEffect(() => {
    let alive = true;
    loadSegments()
      .then((d) => alive && setStreets(aggregateStreets(d.segments)))
      .catch(() => alive && setSegErr(true));
    loadCityTrees()
      .then((ct) => alive && setTrees(ct))
      .catch(() => alive && setTreeErr(true));
    return () => {
      alive = false;
    };
  }, []);

  const mixes = useMemo(() => (trees ? speciesByDistrict(trees, treeDistrictLabel) : []), [trees]);
  const rows = useMemo(() => (streets ? sortRows(districtRows(streets, mixes), sort) : null), [streets, mixes, sort]);

  return (
    <main className="sub districts">
      <h1>District league</h1>
      <p className="sub-lead">How well do we know the streets in each part of Heilbronn, and how green are they? Data about streets, not people.</p>

      <div className="league-sort">
        <label htmlFor="league-sort">Sort by</label>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger id="league-sort" className="league-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!rows && !segErr && <div className="skel" aria-hidden="true" />}
      {segErr && <p className="card">The street data could not load. Please try again later.</p>}

      {rows && (
        <ul className="league">
          {rows.map((r) => (
            <li key={r.label} className="card league-row">
              <h2>{r.label}</h2>
              <p className="league-streets">{r.streets.toLocaleString("en")} streets of 20 m or more</p>
              <dl className="league-stats">
                <div>
                  <dt>Measured</dt>
                  <dd>
                    <span className="progress" aria-hidden="true">
                      <span style={{ width: `${pct(r.measured, r.streets)}%` }} />
                    </span>
                    {pct(r.measured, r.streets)}% <small>({r.measured.toLocaleString("en")} with any bike sensor reading)</small>
                  </dd>
                </div>
                <div>
                  <dt>Trusted data</dt>
                  <dd>
                    <span className="progress" aria-hidden="true">
                      <span style={{ width: `${pct(r.trusted, r.streets)}%` }} />
                    </span>
                    {pct(r.trusted, r.streets)}% <small>({r.trusted.toLocaleString("en")} with {TRUSTED} or more recorded overtakes)</small>
                  </dd>
                </div>
                <div>
                  <dt>Tree crown along streets</dt>
                  <dd>{r.crownCover == null ? <span className="badge">Little data</span> : `${Math.round(r.crownCover * 100)}% (estimate)`}</dd>
                </div>
              </dl>
              <div className="league-mix">
                <p className="league-mix-title">Tree mix (public register trees)</p>
                {!trees && !treeErr && <p className="play-note">Loading the tree register...</p>}
                {treeErr && <p className="play-note">The tree register did not load.</p>}
                {trees && !r.mix && <p className="play-note">No register trees in this district.</p>}
                {r.mix && (
                  <>
                    <p className="play-note">
                      {r.mix.trees.toLocaleString("en")} trees, {r.mix.known.toLocaleString("en")} with a single species named.
                    </p>
                    <ul className="mix-lines">
                      <MixLine what="species" top={r.mix.species} limit={RULE.species} />
                      <MixLine what="genus" top={r.mix.genus} limit={RULE.genus} />
                      <MixLine what="family" top={r.mix.family} limit={RULE.family} />
                    </ul>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="route-how">
        <summary>How this is worked out</summary>
        <p>
          Streets are the measured ATRAI street network, grouped by name. Measured means at least one bike sensor reading. Trusted means at least {TRUSTED} recorded overtakes. Crown cover is an estimate: register tree
          crown area within 15 m of each street, as a share of that area, averaged by street length.
        </p>
        <p>
          The tree mix uses the Stadt Heilbronn tree register (public trees only, Stand 01.01.2026). The 10-20-30 rule of thumb says no more than 10% of trees should be one species, 20% one genus, and 30% one family, so
          one pest or disease cannot take out most trees. It is a rule of thumb, not a city rule. Tree groups count in the total but not in the mix. Innenstadt and Äussere Bezirke are shown together as Kernstadt.
        </p>
      </details>
    </main>
  );
}
