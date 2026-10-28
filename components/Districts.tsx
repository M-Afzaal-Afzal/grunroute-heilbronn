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
import { fmtNum, type Lang } from "../lib/i18n";
import { useLang } from "./LangProvider";

const SORT_KEYS: SortKey[] = ["measured", "trusted", "crown", "streets", "name"];

const EN = {
  sorts: {
    measured: "Share of streets measured",
    trusted: "Share with trusted data",
    crown: "Tree crown cover along streets",
    streets: "Number of streets",
    name: "Name, A to Z",
  } as Record<SortKey, string>,
  title: "District league",
  lead: "How well do we know the streets in each part of Heilbronn, and how green are they? Data about streets, not people.",
  sortBy: "Sort by",
  segErr: "The street data could not load. Please try again later.",
  streets: (n: string) => `${n} streets of 20 m or more`,
  littleData: "Little data",
  measured: "Measured",
  measuredNote: (n: string) => `(${n} with any bike sensor reading)`,
  trusted: "Trusted data",
  trustedNote: (n: string, min: number) => `(${n} with ${min} or more recorded overtakes)`,
  crown: "Tree crown along streets",
  estimate: (pct: number) => `${pct}% (estimate)`,
  mixTitle: "Tree mix (public register trees)",
  treeLoading: "Loading the tree register...",
  treeErr: "The tree register did not load.",
  noTrees: "No register trees in this district.",
  mixCount: (trees: string, known: string) => `${trees} trees, ${known} with a single species named.`,
  top: { species: "Top species", genus: "Top genus", family: "Top family" },
  rule: (over: boolean, limit: number) => `(${over ? "over the" : "within the"} ${limit}% rule)`,
  howTitle: "How this is worked out",
  how1: (trusted: number, few: number) =>
    `Streets are the measured ATRAI street network, grouped by name. Measured means at least one bike sensor reading. Trusted means at least ${trusted} recorded overtakes. Districts with fewer than ${few} streets are marked little data. Crown cover is an estimate: register tree crown area within 15 m of each street, as a share of that area, averaged by street length.`,
  how2: "The tree mix uses the Stadt Heilbronn tree register (public trees only, Stand 01.01.2026). The 10-20-30 rule of thumb says no more than 10% of trees should be one species, 20% one genus, and 30% one family, so one pest or disease cannot take out most trees. It is a rule of thumb, not a city rule. Tree groups count in the total but not in the mix. Innenstadt and Äussere Bezirke are shown together as Kernstadt.",
};

const T: Record<Lang, typeof EN> = {
  en: EN,
  de: {
    sorts: {
      measured: "Anteil gemessener Straßen",
      trusted: "Anteil mit verlässlichen Daten",
      crown: "Baumkronen entlang der Straßen",
      streets: "Anzahl der Straßen",
      name: "Name, A bis Z",
    },
    title: "Stadtteil-Liga",
    lead: "Wie gut kennen wir die Straßen in jedem Teil von Heilbronn, und wie grün sind sie? Daten über Straßen, nicht über Menschen.",
    sortBy: "Sortieren nach",
    segErr: "Die Straßendaten konnten nicht geladen werden. Bitte versuche es später noch einmal.",
    streets: (n) => `${n} Straßen ab 20 m`,
    littleData: "Wenig Daten",
    measured: "Gemessen",
    measuredNote: (n) => `(${n} mit mindestens einem Rad-Sensorwert)`,
    trusted: "Verlässliche Daten",
    trustedNote: (n, min) => `(${n} mit ${min} oder mehr erfassten Überholungen)`,
    crown: "Baumkronen entlang der Straßen",
    estimate: (pct) => `${pct}% (Schätzung)`,
    mixTitle: "Baummix (öffentliche Bäume aus dem Baumkataster)",
    treeLoading: "Baumkataster wird geladen...",
    treeErr: "Das Baumkataster wurde nicht geladen.",
    noTrees: "Keine Bäume aus dem Baumkataster in diesem Stadtteil.",
    mixCount: (trees, known) => `${trees} Bäume, ${known} davon mit genau einer Art.`,
    top: { species: "Häufigste Art", genus: "Häufigste Gattung", family: "Häufigste Familie" },
    rule: (over, limit) => `(${over ? "über der" : "innerhalb der"} ${limit}%-Regel)`,
    howTitle: "So wird das berechnet",
    how1: (trusted, few) =>
      `Die Straßen sind das gemessene ATRAI-Straßennetz, nach Namen gruppiert. Gemessen heißt mindestens ein Rad-Sensorwert. Verlässlich heißt mindestens ${trusted} erfasste Überholungen. Stadtteile mit weniger als ${few} Straßen sind als wenig Daten markiert. Die Kronenabdeckung ist eine Schätzung: Kronenfläche der Bäume aus dem Baumkataster im Umkreis von 15 m um jede Straße, als Anteil dieser Fläche, nach Straßenlänge gemittelt.`,
    how2: "Der Baummix nutzt das Baumkataster der Stadt Heilbronn (nur öffentliche Bäume, Stand 01.01.2026). Die 10-20-30-Faustregel sagt: höchstens 10% der Bäume sollen zu einer Art gehören, 20% zu einer Gattung und 30% zu einer Familie, damit ein Schädling oder eine Krankheit nicht die meisten Bäume trifft. Das ist eine Faustregel, keine Regel der Stadt. Baumgruppen zählen in der Summe mit, aber nicht im Mix. Innenstadt und Äussere Bezirke werden zusammen als Kernstadt gezeigt.",
  },
};

/** Below this many streets, shares swing a lot, so the district is flagged "Little data". */
const FEW = 10;
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function MixLine({ what, top, limit, rule }: { what: string; top: Top; limit: number; rule: (over: boolean, limit: number) => string }) {
  if (!top.name) return null;
  const over = top.share > limit;
  return (
    <li className={over ? "is-over" : ""}>
      <span>
        {what}: <i>{top.name}</i>
      </span>
      <b>
        {Math.round(top.share * 100)}% <small>{rule(over, Math.round(limit * 100))}</small>
      </b>
    </li>
  );
}

export default function Districts() {
  const lang = useLang();
  const t = T[lang];
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
      <h1>{t.title}</h1>
      <p className="sub-lead">{t.lead}</p>

      <div className="league-sort">
        <label htmlFor="league-sort">{t.sortBy}</label>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger id="league-sort" className="league-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t.sorts[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!rows && !segErr && <div className="skel" aria-hidden="true" />}
      {segErr && <p className="card">{t.segErr}</p>}

      {rows && (
        <ul className="league">
          {rows.map((r) => (
            <li key={r.label} className="card league-row">
              <h2>{r.label}</h2>
              <p className="league-streets">
                {t.streets(fmtNum(r.streets, lang))} {r.streets < FEW && <span className="badge">{t.littleData}</span>}
              </p>
              <dl className="league-stats">
                <div>
                  <dt>{t.measured}</dt>
                  <dd>
                    <span className="progress" aria-hidden="true">
                      <span style={{ width: `${pct(r.measured, r.streets)}%` }} />
                    </span>
                    {pct(r.measured, r.streets)}% <small>{t.measuredNote(fmtNum(r.measured, lang))}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t.trusted}</dt>
                  <dd>
                    <span className="progress" aria-hidden="true">
                      <span style={{ width: `${pct(r.trusted, r.streets)}%` }} />
                    </span>
                    {pct(r.trusted, r.streets)}% <small>{t.trustedNote(fmtNum(r.trusted, lang), TRUSTED)}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t.crown}</dt>
                  <dd>{r.crownCover == null ? <span className="badge">{t.littleData}</span> : t.estimate(Math.round(r.crownCover * 100))}</dd>
                </div>
              </dl>
              <div className="league-mix">
                <p className="league-mix-title">{t.mixTitle}</p>
                {!trees && !treeErr && <p className="play-note">{t.treeLoading}</p>}
                {treeErr && <p className="play-note">{t.treeErr}</p>}
                {trees && !r.mix && <p className="play-note">{t.noTrees}</p>}
                {r.mix && (
                  <>
                    <p className="play-note">{t.mixCount(fmtNum(r.mix.trees, lang), fmtNum(r.mix.known, lang))}</p>
                    <ul className="mix-lines">
                      <MixLine what={t.top.species} top={r.mix.species} limit={RULE.species} rule={t.rule} />
                      <MixLine what={t.top.genus} top={r.mix.genus} limit={RULE.genus} rule={t.rule} />
                      <MixLine what={t.top.family} top={r.mix.family} limit={RULE.family} rule={t.rule} />
                    </ul>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="route-how">
        <summary>{t.howTitle}</summary>
        <p>{t.how1(TRUSTED, FEW)}</p>
        <p>{t.how2}</p>
      </details>
    </main>
  );
}
