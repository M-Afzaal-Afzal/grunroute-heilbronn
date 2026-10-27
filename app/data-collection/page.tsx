"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STREETS } from "../../lib/data";
import { Wordmark } from "../../components/brand/Logo";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

const REQUIRED = ["place", "time", "pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity", "close_pass_distance_cm"];

const CSV_TEMPLATE = [
  "place,time,pm1,pm2.5,pm4,pm10,temperature,humidity,close_pass_distance_cm",
  "Bergstrasse,2026-07-14T08:15:00,8,12,15,18,24.5,55,120",
  "Salzstrasse,2026-07-14T08:22:00,10,14,17,21,25.1,58,95",
].join("\n");

const GEOJSON_TEMPLATE = JSON.stringify(
  {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.22, 49.14] },
        properties: {
          place: "Bergstrasse",
          time: "2026-07-14T08:15:00",
          pm1: 8,
          "pm2.5": 12,
          pm4: 15,
          pm10: 18,
          temperature: 24.5,
          humidity: 55,
          close_pass_distance_cm: 120,
        },
      },
    ],
  },
  null,
  2
);

type CheckResult = {
  status: "idle" | "ok" | "fail";
  fileName: string;
  checks: string[];
  errors: string[];
  warnings: string[];
  previewHeaders: string[];
  previewRows: string[][];
  allHeaders: string[];
  allRows: string[][];
};

const EMPTY_RESULT: CheckResult = {
  status: "idle",
  fileName: "",
  checks: [],
  errors: [],
  warnings: [],
  previewHeaders: [],
  previewRows: [],
  allHeaders: [],
  allRows: [],
};

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function validateRows(headers: string[], rows: string[][]): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: string[] = [];
  const missing: Record<string, number> = {};
  REQUIRED.forEach((c) => {
    missing[c] = 0;
  });
  const times: string[] = [];
  let humidOver75 = 0;
  let badNumber = 0;

  rows.forEach((row, ri) => {
    headers.forEach((h, hi) => {
      const v = row[hi] ?? "";
      if (REQUIRED.includes(h) && v === "") {
        missing[h] += 1;
      }
    });
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? "") : "";
    };
    const time = get("time");
    if (time === "") {
      errors.push(`Row ${ri + 2}: time is missing.`);
    } else if (!isValidDate(time)) {
      errors.push(`Row ${ri + 2}: time "${time}" is not a valid date.`);
    } else {
      times.push(time);
    }
    const place = get("place");
    if (place === "") {
      errors.push(`Row ${ri + 2}: place is missing.`);
    }
    ["pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity", "close_pass_distance_cm"].forEach((name) => {
      const v = get(name);
      if (v === "") return;
      if (Number.isNaN(Number(v))) {
        badNumber += 1;
        errors.push(`Row ${ri + 2}: ${name} "${v}" is not a number.`);
      }
    });
    const hum = get("humidity");
    if (hum !== "" && !Number.isNaN(Number(hum)) && Number(hum) > 75) {
      humidOver75 += 1;
    }
  });

  const missingTotal = Object.values(missing).reduce((a, b) => a + b, 0);
  checks.push(`Rows checked: ${rows.length}.`);
  checks.push(`Required columns present: ${REQUIRED.filter((c) => headers.includes(c)).join(", ")}.`);
  if (times.length > 0) {
    const sorted = [...times].sort();
    checks.push(`Date range: ${sorted[0]} to ${sorted[sorted.length - 1]}.`);
  }
  checks.push(`Missing values: ${missingTotal} empty cells in required columns.`);
  Object.entries(missing).forEach(([col, n]) => {
    if (n > 0) checks.push(`Missing in ${col}: ${n}.`);
  });
  if (badNumber > 0) checks.push(`Values that are not numbers: ${badNumber}.`);
  if (humidOver75 > 0) {
    warnings.push(
      `${humidOver75} rows have humidity over 75 percent. Those rows will be removed in the staged check, because humid readings can overstate dust.`
    );
  }
  warnings.push("Close pass distance can be blank for walking rows, because a walk has no overtake.");
  if (missing["place"] > 0 || missing["time"] > 0) {
    errors.push("Place and time must be filled in every row, because a street score needs a place and a date.");
  }
  const numericMissing = ["pm1", "pm2.5", "pm4", "pm10", "temperature", "humidity"].reduce((a, c) => a + missing[c], 0);
  if (numericMissing > 0) {
    errors.push("Dust, temperature, and humidity must be filled in every row, except close pass distance on walking rows.");
  }

  return {
    status: errors.length === 0 ? "ok" : "fail",
    fileName: "",
    checks,
    errors,
    warnings,
    previewHeaders: headers,
    previewRows: rows.slice(0, 5),
    allHeaders: headers,
    allRows: rows,
  };
}

function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

type UploadedGroup = {
  place: string;
  rows: number;
  avgClose: number | null;
  avgPm10: number | null;
  avgPm25: number | null;
  avgTemp: number | null;
  dateRange: string;
  matched: string | null;
  oldScore: number | null;
  newScore: number | null;
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function DataCollection() {
  const [result, setResult] = useState<CheckResult>(EMPTY_RESULT);

  const uploadedGroups: UploadedGroup[] = useMemo(() => {
    if (result.status !== "ok") return [];
    const headers = result.allHeaders;
    const idx = (name: string) => headers.indexOf(name);
    const byPlace = new Map<string, { display: string; rows: string[][] }>();
    result.allRows.forEach((row) => {
      const place = row[idx("place")] ?? "";
      const key = normalizePlace(place);
      if (!byPlace.has(key)) byPlace.set(key, { display: place, rows: [] });
      byPlace.get(key)?.rows.push(row);
    });
    const groups: UploadedGroup[] = [];
    byPlace.forEach((entry) => {
      const getNums = (name: string) =>
        entry.rows
          .map((r) => r[idx(name)] ?? "")
          .filter((v) => v !== "" && !Number.isNaN(Number(v)))
          .map((v) => Number(v));
      const times = entry.rows
        .map((r) => r[idx("time")] ?? "")
        .filter((v) => v !== "")
        .sort();
      const match = STREETS.find((s) => normalizePlace(s.name) === normalizePlace(entry.display));
      const close = avg(getNums("close_pass_distance_cm"));
      const newScore = match && close !== null ? Math.max(0, Math.min(100, Math.round(100 - close / 2))) : null;
      groups.push({
        place: entry.display,
        rows: entry.rows.length,
        avgClose: close,
        avgPm10: avg(getNums("pm10")),
        avgPm25: avg(getNums("pm2.5")),
        avgTemp: avg(getNums("temperature")),
        dateRange: times.length > 0 ? `${times[0]} to ${times[times.length - 1]}` : "No date",
        matched: match ? match.name : null,
        oldScore: match ? match.score : null,
        newScore,
      });
    });
    return groups;
  }, [result]);

  async function handleFile(file: File) {
    const text = await file.text();
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        setResult({ ...EMPTY_RESULT, status: "fail", fileName: file.name, errors: ["File has no data rows. Add at least one data row under the header."] });
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const missingCols = REQUIRED.filter((c) => !headers.includes(c));
      if (missingCols.length > 0) {
        setResult({
          ...EMPTY_RESULT,
          status: "fail",
          fileName: file.name,
          errors: [`Required columns missing: ${missingCols.join(", ")}.`],
        });
        return;
      }
      const rows = lines.slice(1).map((l) => parseCsvLine(l));
      const checked = validateRows(headers, rows);
      setResult({ ...checked, fileName: file.name });
      return;
    }
    if (name.endsWith(".json") || name.endsWith(".geojson")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setResult({ ...EMPTY_RESULT, status: "fail", fileName: file.name, errors: ["File is not valid JSON."] });
        return;
      }
      const obj = parsed as { type?: string; features?: Array<{ properties?: Record<string, unknown> }> };
      if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features) || obj.features.length === 0) {
        setResult({
          ...EMPTY_RESULT,
          status: "fail",
          fileName: file.name,
          errors: ["GeoJSON must be a FeatureCollection with at least one feature."],
        });
        return;
      }
      const props = obj.features.map((f) => f.properties ?? {});
      const missingCols = REQUIRED.filter((c) => !props.every((p) => p[c] !== undefined && p[c] !== null && p[c] !== ""));
      if (missingCols.length > 0) {
        setResult({
          ...EMPTY_RESULT,
          status: "fail",
          fileName: file.name,
          errors: [`Fields missing in some features: ${missingCols.join(", ")}.`],
        });
        return;
      }
      const headers = REQUIRED;
      const rows = props.map((p) => REQUIRED.map((c) => String(p[c] ?? "")));
      const checked = validateRows(headers, rows);
      setResult({ ...checked, fileName: file.name });
      return;
    }
    setResult({
      ...EMPTY_RESULT,
      status: "fail",
      fileName: file.name,
      errors: ["File type not supported. Choose a CSV file, or a GeoJSON file."],
    });
  }

  return (
    <main className="wrap">
      <header className="slim-header">
        <Wordmark />
      </header>
      <section className="hero">
        <h1>How to collect data</h1>
        <p className="tagline">Good data first. A street score is only as good as the rides and stations behind it.</p>
        <p><Badge variant="destructive">DEV MODE, DEMO ONLY</Badge></p>
        <p>
          This page is in dev mode and demo only. It is not official city data, and street scores here are still a sample, not official measurements. This page is for the city and the hackathon organisers. It shows how to collect street data in a clean way, and how to try a new file at once in this page.
        </p>
        <p>
          Nothing on this page sends data to a server, and nothing here changes the home page list. An upload changes only the demo list on this page, until you reload or clear it. Nothing here tracks a person.
        </p>
        <p>
          <Link href="/">Back to the fix first list</Link>
        </p>
      </section>

      <section className="datasource" aria-label="Important rules">
        <h2>Three rules first</h2>
        <p>
          Street scores are historical screening, not live data, and not a legal compliance measurement. Use only data from the organisers and partners, ATRAI, openSenseMap, heat walks, and OpenStreetMap. Do not invent a street score, a ride count, or any other number to fill a gap. If data is missing, mark the street as little data.
        </p>
      </section>

      <section className="dc-section" aria-label="How to collect">
        <h2>1. How to collect</h2>
        <div className="dc-grid">
          <article className="dc-card">
            <h3>Fixed stations anchor time and calibration</h3>
            <p>Fixed school stations measure day and night. They show the daily curve, the season curve, and school gate peaks. They also anchor the bike data in time. Heilbronn already has two official LUBW stations, one traffic station and one background station. Use them as the reference, do not build a second calibration chain from scratch if you can partner with them.</p>
          </article>
          <article className="dc-card">
            <h3>Bike sensors give street detail</h3>
            <p>senseBox:bike on a normal ride measures dust, temperature, humidity, overtaking distance, road surface, and speed, with GPS. This is how a street gets its own score. But bikes only ride where cyclists ride, so bike data alone will miss side streets and school streets.</p>
          </article>
          <article className="dc-card">
            <h3>Assigned walking routes fill the gaps</h3>
            <p>Walk the streets bikes miss. Plan the same walking routes each time, on side streets and school streets, at pavement height. For heat, walk on clear, calm warm nights, and also in daytime shade. Log sun or shade and surface with each point, because sun on asphalt is not the same as shade.</p>
          </article>
          <article className="dc-card">
            <h3>Fleet vehicles only as a bonus</h3>
            <p>Buses or waste trucks can repeat the same main roads for months, with power and care built in. They are a bonus only, and only if the city and the operator agree in writing. They still miss side streets, and their own exhaust and heat must be controlled. Do not promise fleet coverage until the agreement is signed.</p>
          </article>
        </div>
        <p className="dc-note">Satellite heat is a surface model, not the air temperature people feel. Use it only to choose where to measure next, and label it as modelled.</p>
      </section>

      <section className="dc-section" aria-label="Quality checks">
        <h2>2. Quality checks</h2>
        <ul className="dc-list">
          <li><b>Co-location first:</b> Put every new sensor next to a reference station for 2 weeks before it goes out, on dry days and humid days, if possible. That is the step that makes a low cost sensor trustworthy.</li>
          <li><b>Golden units:</b> Keep 1 or 2 units at the background station all the time. Compare other units to them, so drift shows up fast.</li>
          <li><b>Humidity correction:</b> Always log humidity and temperature with dust, at the same time, from the same unit. Dust without humidity cannot be corrected. Humid readings over 75 percent can overstate dust, so they are removed in the staged check.</li>
          <li><b>Ventilated temperature housing:</b> Do not mount a temperature sensor in direct sun on a dark box, or against the rider body. Sun and low wind can bias it by more than 1 to 2 degrees.</li>
          <li><b>Re-check every season:</b> Re-run a short co-location each season, and after any repair, cleaning, or software change. Record the calibration version with every dataset, so a score can be reproduced.</li>
          <li><b>Outliers and stuck sensors:</b> Flag a sensor that repeats the same value for hours, a value outside the valid range, or a single channel spike. Those rows stay internal only, never in a public score.</li>
        </ul>
      </section>

      <section className="dc-section" aria-label="Coverage gate">
        <h2>3. Coverage gate</h2>
        <p><Badge variant="secondary">PROPOSAL</Badge> These gates are a proposal built from published ranges, not a published finding. They stop a thin street from becoming Fix Number 1.</p>
        <table className="dc-table">
          <thead>
            <tr><th scope="col">Level</th><th scope="col">Rule</th><th scope="col">What it means</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Screening</b></td><td>At least 10 passes over at least 5 days</td><td>Show it greyed, as indicative only.</td></tr>
            <tr><td><b>Trusted</b></td><td>At least 20 passes over at least 10 days, in at least 3 time bands</td><td>Only trusted streets can be ranked for a fix.</td></tr>
            <tr><td><b>Close pass rate</b></td><td>At least 20 overtakes on the street</td><td>Below that, show the count and say too few overtakes to rank. Never show 0 percent or 100 percent from 1 or 2 events.</td></tr>
            <tr><td><b>Too little data</b></td><td>Below screening</td><td>Show as not yet measured. Check on the ground first, no automatic fix.</td></tr>
          </tbody>
        </table>
        <p>Assign route bundles, not free rides. Each rider gets a mix, for example 1 busy road, 1 side street, 1 school street, and 1 green alternative. Recruit where data is missing, through schools, clubs, and cargo bike parents, with loan kits, not only riders who already own a kit.</p>
      </section>

      <section className="dc-section" aria-label="Time rules">
        <h2>4. Time rules</h2>
        <ul className="dc-list">
          <li>Tag every point with season, school term or holiday, and time of day. Do not compare summer heat with winter bike data directly. Compare the same season.</li>
          <li>School scores use term time only. Holiday rides help the yearly layers, but they do not belong in a school peak score.</li>
          <li>For trusted status, cover at least 3 time bands, for example morning peak, midday, and afternoon or evening. A street ridden only at noon gets a noon score, not an all day score.</li>
          <li>Keep night heat and daytime comfort as two layers. A tree lined street can be cool at night and hot in sun, or the other way round.</li>
          <li>After a fix is built, measure again with the same protocol, in the same season window, and report before and after with uncertainty. One ride after a fix proves nothing.</li>
        </ul>
      </section>

      <section className="dc-section" aria-label="Privacy">
        <h2>5. Privacy</h2>
        <ul className="dc-list">
          <li>Publish street averages only, never personal ride tracks. Raw tracks stay access controlled, never public, and never shown to the city as tracks.</li>
          <li>Crop the start and end of every ride, about 200 m, so a home or school address does not leak from a track. For school campaigns, start at a neutral meeting point, not the school gate.</li>
          <li>Suppress any segment or time cell with few riders or days. Show insufficient data, not a number that could single out one rider commute.</li>
          <li>Do not use cameras, number plates, audio, or phone contacts. Overtake sensors measure distance only, not identity.</li>
          <li>For school routes, prefer adult riders on the school route, plus fixed school gate stations and walking audits, rather than tracking children.</li>
        </ul>
      </section>

      <section className="dc-section" aria-label="Upload and stage data">
        <h2>6. Upload data in dev mode</h2>
        <p>If you already have data, use the template below. Your file is checked in this browser only. It is not sent anywhere and not stored. In dev mode, a file that passes the checks is applied straight away in this page, as demo only.</p>
        <h3>Template columns</h3>
        <p>place, time, pm1, pm2.5, pm4, pm10, temperature, humidity, close_pass_distance_cm. Place is a street name only, not a home address. Time is a date and time, for example 2026-07-14T08:15:00. Temperature is in degrees Celsius. Humidity is in percent. Close pass distance is in centimetres, and can be blank for walking rows.</p>
        <div className="dc-actions">
          <Button variant="primary" onClick={() => downloadFile("grunroute-template.csv", CSV_TEMPLATE, "text/csv")}>Download CSV template</Button>
          <Button variant="outline" onClick={() => downloadFile("grunroute-template.geojson", GEOJSON_TEMPLATE, "application/geo+json")}>Download GeoJSON template</Button>
        </div>
        <h3>Check a file in this browser</h3>
        <label className="gr-label" htmlFor="dataFile">Choose a CSV or GeoJSON file</label>
        <input
          id="dataFile"
          className="gr-input"
          type="file"
          accept=".csv,.json,.geojson,text/csv,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p className="dc-note">Checks run in your browser only. No file leaves this page. No server receives it.</p>
        {result.status !== "idle" && (
          <div className="dc-result" aria-live="polite">
            <h3>{result.fileName}</h3>
            {result.status === "ok" ? (
              <p className="dc-ok"><b>Applied in this page, dev mode, demo only.</b> This is not official city data. The uploaded rows below are now shown in this page, and demo street values that match by street name are updated in the list below. This change lives only in this page. Reload the page, or tap Clear uploaded data, to go back to the original demo list.</p>
            ) : (
              <p className="dc-fail"><b>Not ready yet. Fix the failed checks below, then check the file again.</b></p>
            )}
            <h4>Checks</h4>
            <ul>
              {result.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {result.warnings.length > 0 && (
              <>
                <h4>Notes</h4>
                <ul>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
            {result.errors.length > 0 && (
              <>
                <h4>Failed checks, fix these</h4>
                <ul>
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
            {result.previewRows.length > 0 && (
              <>
                <h4>Preview, first rows</h4>
                <div className="dc-preview">
                  <table className="dc-table">
                    <thead>
                      <tr>
                        {result.previewHeaders.map((h) => (
                          <th key={h} scope="col">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {result.previewHeaders.map((h, hi) => (
                            <td key={h}>{row[hi] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {result.status === "ok" && (
          <>
            <h3>Uploaded data list</h3>
            <p>Grouped by street name. A street name is matched to the demo list without case and without German letter differences, so Bergstrasse matches Bergstraße. Unmatched streets are shown too, but they do not change a demo score.</p>
            <table className="dc-table">
              <thead>
                <tr><th scope="col">Place</th><th scope="col">Rows</th><th scope="col">Avg close pass</th><th scope="col">Avg PM10</th><th scope="col">Avg PM2.5</th><th scope="col">Avg temp</th><th scope="col">Date range</th><th scope="col">Matched demo street</th></tr>
              </thead>
              <tbody>
                {uploadedGroups.map((g) => (
                  <tr key={g.place}>
                    <td>{g.place}</td>
                    <td>{g.rows}</td>
                    <td>{g.avgClose !== null ? `${g.avgClose.toFixed(1)} cm` : "No value"}</td>
                    <td>{g.avgPm10 !== null ? g.avgPm10.toFixed(1) : "No value"}</td>
                    <td>{g.avgPm25 !== null ? g.avgPm25.toFixed(1) : "No value"}</td>
                    <td>{g.avgTemp !== null ? `${g.avgTemp.toFixed(1)} C` : "No value"}</td>
                    <td>{g.dateRange}</td>
                    <td>{g.matched ?? "No match in demo list"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Demo street values updated in this page</h3>
            {uploadedGroups.filter((g) => g.matched && g.newScore !== null).length === 0 ? (
              <p>No demo street score changed, because no matched street had a close pass distance in the upload. The uploaded list above still shows. Add a close pass distance to change a demo score, using the same formula as the demo list: score equals 100 minus average close pass distance in cm divided by 2.</p>
            ) : (
              <ul className="dc-list">
                {uploadedGroups
                  .filter((g) => g.matched && g.newScore !== null)
                  .map((g) => (
                    <li key={g.place}>
                      <b>{g.matched}:</b> demo score {g.oldScore} to {g.newScore}, from average close pass {g.avgClose !== null ? g.avgClose.toFixed(1) : ""} cm in {g.rows} uploaded rows. This is demo only, in this page only.
                    </li>
                  ))}
              </ul>
            )}
            <div className="dc-actions">
              <Button variant="outline" onClick={() => setResult(EMPTY_RESULT)}>Clear uploaded data</Button>
            </div>
          </>
        )}
        <h3>What dev mode does and does not do</h3>
        <ul className="dc-list">
          <li>Does: check the file in your browser, show the uploaded list above, and update matched demo street values in this page only.</li>
          <li>Does not: send the file anywhere, save it on a server, change the home page list, or publish official city data.</li>
          <li>Does not: keep the change after a reload. Reload, or tap Clear uploaded data, to go back to the original demo list.</li>
          <li>For a real city release, this dev shortcut would be replaced by a Green City approval step before any score goes public, with old and new scores side by side and a rollback option. That approval step is not the flow in dev mode.</li>
          <li>When a file is approved for a real release, the full check is: match each point to the nearest street, at most 20 m away, average per street with the same danger formulas and gates, remove humid readings over 75 percent and outliers, mark streets with little data, and publish street averages only, never personal ride tracks.</li>
        </ul>
      </section>

      <section className="dc-section" aria-label="What not to promise">
        <h2>What not to promise</h2>
        <ul className="dc-list">
          <li>Do not claim legal limit compliance or exceedance from low cost sensors. Compliance is the job of the official stationary network.</li>
          <li>Do not claim live air quality, temperature, or safety from campaign or historical data. If there is no live feed, say so.</li>
          <li>Do not claim a street is safe because few overtakes were recorded. Few overtakes can mean few cyclists, few passes, or no data.</li>
          <li>Do not claim one close pass proves an illegal overtake, or identifies a driver. Use aggregate rates, with sensor error and context.</li>
          <li>Do not promise a street average within 10 percent from a handful of rides. Promise tiers and uncertainty instead.</li>
          <li>Do not promise trees will cool a street by a fixed number of degrees, or that calming will cut dust by a fixed percent, without a before and after design.</li>
        </ul>
      </section>

      <section className="dc-section" aria-label="Not verified yet">
        <h2>Not verified yet, say so plainly</h2>
        <p>These items were flagged as not verified in the research, and are not claimed here: vendor prices for sensor kits, signed agreements with LUBW, UrbanAirLab, or any fleet operator, the total Heilbronn segment count, and official Baden-Württemberg holiday dates for the campaign year. Confirm them before you commit them to the city.</p>
      </section>

      <section className="dc-section" aria-label="Sources">
        <h2>Sources</h2>
        <p>All sources below come from the research report dated 27 Oct 2026. Counts and gates marked as proposal on this page are not from these sources alone.</p>
        <ul className="dc-sources">
          <li><a href="https://globalinnovationgathering.org/2025/12/17/senseboxbike-citizen-science/" target="_blank" rel="noreferrer">senseBox:bike, citizen science bike sensor</a></li>
          <li><a href="https://www.wecity.nl/en/snifferbike" target="_blank" rel="noreferrer">Snifferbike, Utrecht bike dust sensing</a></li>
          <li><a href="https://pubmed.ncbi.nlm.nih.gov/41305305/" target="_blank" rel="noreferrer">SenseBike, automatic overtake detection and dust</a></li>
          <li><a href="https://www.nature.com/articles/s41612-025-01216-4" target="_blank" rel="noreferrer">Nature review, low cost sensor calibration and lifetime</a></li>
          <li><a href="https://environment.ec.europa.eu/news/air-pollution-data-citizen-operated-sensors-improved-novel-quality-control-system-2025-11-06_en" target="_blank" rel="noreferrer">EU FILTER quality control for citizen sensors</a></li>
          <li><a href="https://www.mdpi.com/1424-8220/26/20/6441" target="_blank" rel="noreferrer">Humidity and temperature correction for low cost dust sensors</a></li>
          <li><a href="https://egusphere.copernicus.org/preprints/2025/egusphere-2025-5194/egusphere-2025-5194-manuscript-version2.pdf" target="_blank" rel="noreferrer">Temperature shielding and radiation bias</a></li>
          <li><a href="https://dec.ny.gov/sites/default/files/2024-08/aclimamethod.pdf" target="_blank" rel="noreferrer">Aclima method, passes per road section and modelled averages</a></li>
          <li><a href="https://www.frontiersin.org/journals/environmental-health/articles/10.3389/fenvh.2023.1232867/full" target="_blank" rel="noreferrer">Antwerp mobile study, passages needed for a stable average</a></li>
          <li><a href="https://www.heilbronn.de/fileadmin/daten/stadtheilbronn/formulare/umwelt_mobilitaet/EGC/European_Green_Capital_Bewerbung_Heilbronn_2027.pdf" target="_blank" rel="noreferrer">Heilbronn European Green Capital application, LUBW stations</a></li>
          <li><a href="https://elib.dlr.de/225306/1/HHN_EGU26-10792.html.pdf" target="_blank" rel="noreferrer">UrbanAirLab Heilbronn, low cost network and LUBW co-location</a></li>
          <li><a href="https://moewex.github.io/academic/publication/2020-simra/2020-simra.pdf" target="_blank" rel="noreferrer">SimRa, delayed recording, ride cropping, and per ride pseudonyms</a></li>
          <li><a href="https://link.springer.com/article/10.1186/s12544-025-00760-7" target="_blank" rel="noreferrer">GPS track privacy, start and end blurring</a></li>
          <li><a href="https://sensebox.github.io/en/osem" target="_blank" rel="noreferrer">openSenseMap, open data and open API</a></li>
          <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10404226/" target="_blank" rel="noreferrer">City Scanner, low cost fleet sensing</a></li>
          <li><a href="https://www.b-tu.de/en/news/article/19779-mit-dem-fahrrad-forschen-fuer-mehr-sicherheit-auf-brandenburgs-strassen" target="_blank" rel="noreferrer">OpenBikeSensor, overtaking distance rules in Germany</a></li>
          <li><a href="https://scambs.moderngov.co.uk/documents/s141417/Appendix%20B%20-%20Zephyr%20report%20-%20Comberton.pdf" target="_blank" rel="noreferrer">School term and holiday air quality, UK case study</a></li>
        </ul>
      </section>

      <footer>
        <p className="brand-line">GrünRoute Heilbronn, built with open Heilbronn sensor data, no app, no sign up, no personal tracking.</p>
        <p><Link href="/">Back to the fix first list</Link></p>
      </footer>
    </main>
  );
}
