"use client";
// A6 new data approval, dev mode demo: upload, check, match to streets,
// compare old and new scores, then Release or Reject. Released versions are
// kept in localStorage with a rollback. Nothing is sent anywhere, and the
// people app and the other Planner pages never change.
import { useEffect, useMemo, useState } from "react";
import { districtLabel } from "@/lib/shared/priority";
import { segName } from "@/lib/shared/segments";
import type { PlannerData } from "@/lib/data";
import { nf } from "@/lib/data";
import type { ActivePreset } from "@/lib/preset";
import { BandTag } from "@/components/BandTag";
import { ACCEPT, downloadTemplate, readUpload, takePendingUpload } from "@/lib/upload";
import { UPLOAD_EVENT } from "@/components/data/UploadButton";
import { DEMO_LABEL, POINT_MATCH_M, REQUIRED, allDeltas, deltasOf, matchRows, mergeDeltas, rankMap, useVersions, writeVersions, type Match, type Parsed, type Version } from "@/lib/approval";

const PASS_SENTENCE = "150 cm is the minimum passing gap for cars in towns in Germany. Sensor readings are estimates and do not prove a single overtake broke the rule.";

function Move({ from, to }: { from: number | null; to: number | null }) {
  if (from == null && to == null) return <span>not listed</span>;
  if (from == null) return <span className="pl-up">new on the list at {to}</span>;
  if (to == null) return <span className="pl-down">leaves the list</span>;
  if (from === to) return <span>no change</span>;
  return to < from ? <span className="pl-up">up {from - to}</span> : <span className="pl-down">down {to - from}</span>;
}

export function Approval({ data, active }: { data: PlannerData; active: ActivePreset }) {
  const versions = useVersions();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => mergeDeltas(data.streets, allDeltas(versions)), [data, versions]);
  const matches = useMemo<Match[]>(() => (parsed ? matchRows(parsed.rows, base) : []), [parsed, base]);
  const deltas = useMemo(() => deltasOf(matches), [matches]);
  const compare = useMemo(() => {
    if (!deltas.length) return null;
    const before = rankMap(base, active);
    const after = rankMap(mergeDeltas(base, deltas), active);
    const byId = new Map(base.map((s) => [s.id, s]));
    return deltas
      .map((d) => ({ d, s: byId.get(d.streetId)!, a: before.get(d.streetId)!, b: after.get(d.streetId)! }))
      .sort((x, y) => (x.b.rank ?? 1e9) - (y.b.rank ?? 1e9));
  }, [deltas, base, active]);

  async function onFile(f: File | undefined) {
    setError(null);
    setParsed(null);
    if (!f) return;
    try {
      setParsed(await readUpload(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be read.");
    }
  }

  // A file picked with an upload button elsewhere (top bar, Overview) arrives here.
  useEffect(() => {
    const take = () => {
      const f = takePendingUpload();
      if (!f) return;
      void onFile(f);
      document.getElementById("new-data")?.scrollIntoView({ block: "start" });
    };
    take();
    window.addEventListener(UPLOAD_EVENT, take);
    return () => window.removeEventListener(UPLOAD_EVENT, take);
  }, []);

  function release() {
    if (!parsed || !deltas.length) return;
    const v: Version = { id: `v${versions.length + 1}`, at: new Date().toISOString(), file: parsed.file, rows: parsed.rows.length, deltas };
    const next = [...versions, v];
    writeVersions(next);
    setParsed(null);
  }
  function rollback(i: number) {
    const next = versions.slice(0, i);
    writeVersions(next);
  }

  const errors = parsed?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = parsed?.issues.filter((i) => i.level === "warning") ?? [];
  const matched = matches.filter((m) => m.streetId != null);
  const passRows = matched.filter((m) => m.row.values.close_pass_distance_cm != null).length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="pl-proposal" style={{ marginLeft: 0, fontSize: 14, width: "fit-content" }}>
        {DEMO_LABEL}
      </p>
      <p className="pl-note" style={{ maxWidth: "80ch" }}>
        Steps: upload a file in the template from the Collect data page, check it, match rows to streets, compare old and new scores, then Release or Reject, like
        the release step in the Mängelmelder. A release here only changes this demo in this browser. It never changes the people app, and the other Planner pages
        keep the built data.
      </p>
      <div className="pl-toolbar" style={{ marginBottom: 0, alignItems: "center" }}>
        <label className="pl-btn primary" style={{ width: "fit-content", cursor: "pointer", position: "relative" }}>
          1. Upload CSV, Excel, or GeoJSON
          <input
            type="file"
            accept={ACCEPT.all}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="pl-btn" onClick={downloadTemplate}>
          Download template (CSV, opens in Excel)
        </button>
      </div>
      <p className="pl-note">Accepted: .csv, .tsv, .xlsx (first sheet), .geojson. Columns: {REQUIRED.join(", ")}. Up to 5 MB.</p>
      {error && <p role="alert">{error}</p>}

      {parsed && (
        <div style={{ display: "grid", gap: 8 }} aria-live="polite">
          <h3 style={{ fontSize: 17 }}>2. Check and match: {parsed.file}</h3>
          {parsed.missingCols.length > 0 ? (
            <p role="alert">Missing columns: {parsed.missingCols.join(", ")}. Use the Collect data template.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              <li>
                {nf(parsed.rows.length)} {parsed.rows.length === 1 ? "row passes" : "rows pass"} the checks, {nf(errors.length)} {errors.length === 1 ? "problem" : "problems"}, {nf(warnings.length)}{" "}
                {warnings.length === 1 ? "warning" : "warnings"}.
              </li>
              <li>
                {nf(matched.length)} rows matched to a street ({parsed.kind === "csv" ? "by street name" : `nearest street within ${POINT_MATCH_M} m`}),{" "}
                {nf(matches.length - matched.length)} not matched.
              </li>
              <li>
                {nf(passRows)} matched rows have a close pass distance. Only these change a score. Dust, temperature and humidity rows are checked and counted, but
                not merged in this demo, because the street measures for those come from other sources.
              </li>
            </ul>
          )}
          {(parsed.issues.length > 0 || matches.some((m) => m.streetId == null)) && (
            <details>
              <summary style={{ cursor: "pointer" }}>Show problems and unmatched rows</summary>
              <ul style={{ paddingLeft: 18, fontSize: 14 }}>
                {parsed.issues.slice(0, 50).map((i, k) => (
                  <li key={`i${k}`}>
                    {i.line ? `Row ${i.line}: ` : ""}
                    {i.level === "warning" ? "Warning. " : ""}
                    {i.text}
                  </li>
                ))}
                {matches
                  .filter((m) => m.streetId == null)
                  .slice(0, 50)
                  .map((m) => (
                    <li key={`m${m.row.line}`}>
                      Row {m.row.line} ({m.row.place || "point"}): {m.why}.
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <h3 style={{ fontSize: 17 }}>3. Old and new scores, {active.label}</h3>
          {!compare ? (
            <p className="pl-note">No matched close pass rows, so no score changes.</p>
          ) : (
            <table className="pl-table">
              <thead>
                <tr>
                  <th scope="col">Street</th>
                  <th scope="col" className="n">New passes</th>
                  <th scope="col" className="n">Under 150 cm</th>
                  <th scope="col" className="n">Passes before, after</th>
                  <th scope="col">Score before</th>
                  <th scope="col">Score after</th>
                  <th scope="col" className="n">Rank before, after</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(({ d, s, a, b }) => (
                  <tr key={d.streetId}>
                    <th scope="row">
                      {segName(s)} <span className="pl-note">{districtLabel(s.district)}</span>
                    </th>
                    <td className="n">{nf(d.passes)}</td>
                    <td className="n">{nf(d.under150)}</td>
                    <td className="n">
                      {nf(a.passes)}, {nf(b.passes)}
                    </td>
                    <td>
                      {a.score ?? "-"} <BandTag score={a.score} />
                    </td>
                    <td>
                      {b.score ?? "-"} <BandTag score={b.score} />
                    </td>
                    <td className="n">
                      {a.rank ?? "-"}, {b.rank ?? "-"}
                    </td>
                    <td>
                      <Move from={a.rank} to={b.rank} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="pl-note">{PASS_SENTENCE} Old and new passes are pooled per street, an approximation of the build, which weights segments by length.</p>

          <div className="pl-toolbar">
            <button type="button" className="pl-btn primary" disabled={!compare} onClick={release}>
              4. Release
            </button>
            <button type="button" className="pl-btn" onClick={() => setParsed(null)}>
              Reject
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 style={{ fontSize: 17 }}>Version history in this browser</h3>
        <table className="pl-table">
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Released</th>
              <th scope="col">File</th>
              <th scope="col" className="n">Rows</th>
              <th scope="col" className="n">Streets changed</th>
              <th scope="col">Rollback</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">v0</th>
              <td>{data.meta.built}</td>
              <td>Built data (segments.json)</td>
              <td className="n">-</td>
              <td className="n">-</td>
              <td>
                <button type="button" className="pl-btn" disabled={!versions.length} onClick={() => rollback(0)}>
                  Roll back to v0
                </button>
              </td>
            </tr>
            {versions.map((v, i) => (
              <tr key={v.id}>
                <th scope="row">{v.id}</th>
                <td>{new Date(v.at).toLocaleString("en-GB")}</td>
                <td>{v.file}</td>
                <td className="n">{nf(v.rows)}</td>
                <td className="n">{nf(v.deltas.length)}</td>
                <td>
                  <button type="button" className="pl-btn" disabled={i === versions.length - 1} onClick={() => rollback(i + 1)}>
                    Roll back to {v.id}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
