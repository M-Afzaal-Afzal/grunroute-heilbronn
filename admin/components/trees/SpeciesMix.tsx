"use client";
// Species mix per district from the tree register, against 10-20-30.
import { useMemo } from "react";
import { districtLabel } from "@/lib/shared/priority";
import type { CityTrees } from "@/lib/shared/cityTrees";
import { TREE_SOURCE } from "@/lib/shared/cityTrees";
import { nf } from "@/lib/data";
import { RULE, speciesByDistrict, type Top } from "@/lib/species";

function Cell({ top, limit }: { top: Top; limit: number }) {
  if (!top.name) return <td>-</td>;
  const over = top.share > limit;
  return (
    <td>
      <span className={over ? "pl-down" : undefined}>{(top.share * 100).toFixed(1)}%</span> <i>{top.name}</i>
      {over && <span className="pl-note"> over {Math.round(limit * 100)}%</span>}
    </td>
  );
}

export function SpeciesMix({ trees }: { trees: CityTrees }) {
  const rows = useMemo(() => speciesByDistrict(trees), [trees]);
  const all = rows.reduce((a, r) => a + r.trees, 0);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="pl-note">
        Rule of thumb, not a city rule: no more than 10% of trees from one species, 20% from one genus, 30% from one family, so one pest or disease cannot take out a whole
        street. Districts are as written in the tree register. Shares are of trees with a single species name. Group rows (Baumgruppe, mixed stands) are counted in the total but not in the shares.
      </p>
      <table className="pl-table">
        <thead>
          <tr>
            <th scope="col">District (register)</th>
            <th scope="col" className="n">Trees</th>
            <th scope="col" className="n">With species</th>
            <th scope="col">Top species (10%)</th>
            <th scope="col">Top genus (20%)</th>
            <th scope="col">Top family (30%)</th>
            <th scope="col" className="n">Over</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.district}>
              <th scope="row">{districtLabel(r.district)}</th>
              <td className="n">{nf(r.trees)}</td>
              <td className="n">{nf(r.known)}</td>
              <Cell top={r.species} limit={RULE.species} />
              <Cell top={r.genus} limit={RULE.genus} />
              <Cell top={r.family} limit={RULE.family} />
              <td className="n">{r.over} of 3</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pl-note">
        {nf(all)} register trees. Families are mapped from the genus with a short list in the code; trees of a genus not on that list count to no family
        ({nf(rows.reduce((a, r) => a + r.unmapped, 0))} trees), so a family share can be a little low. Source: {TREE_SOURCE}.
      </p>
    </div>
  );
}
