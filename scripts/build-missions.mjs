// Builds public/data/missions.json, the default data missions the people app
// shows under "Help measure". Same rules as the Planner mission builder
// (lib/missions.ts): Balanced top 50 streets, gaps with Low or no sensor
// data near a school or next to a top 50 street, one bundle per district.
// Run: node scripts/build-missions.mjs (after build-segments.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateStreets, districtLabel, enoughData, percentiles, presetById, rankSegments } from "../lib/priority.ts";
import { MISSION_RULE, TIME_BANDS, TOP_N, bundle, findGaps, missionWhy } from "../lib/missions.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "public/data/segments.json"), "utf8"));
const streets = aggregateStreets(data.segments);
const preset = presetById("balanced");
const scored = rankSegments(streets, preset, percentiles(streets));
const top = scored.filter((x) => x.score != null && x.seg.length >= 20 && enoughData(x)).slice(0, TOP_N).map((x) => x.seg.id);

// Same text as segName in lib/segments.ts.
const name = (s) => s.name ?? (s.near ? `Unnamed street near ${s.near}` : "Street without a name in the data");

const gaps = findGaps(scored, top);
const byDistrict = new Map();
for (const g of gaps) {
  const d = districtLabel(g.street.district);
  if (!byDistrict.has(d)) byDistrict.set(d, []);
  byDistrict.get(d).push(g);
}

const missions = [...byDistrict]
  .filter(([, list]) => list.length >= 2)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([district, list], i) => {
    const b = bundle(list, name);
    return {
      id: `m${String(i + 1).padStart(2, "0")}`,
      title: `${district}: ${b.streets.length} streets to measure`,
      district,
      timeBand: b.streets.some((s) => s.role === "school") ? "am" : "pm",
      streets: b.streets,
      why: missionWhy(list),
      missing: b.missing,
    };
  });

const out = {
  version: 1,
  built: data.meta.built,
  created: new Date().toISOString().slice(0, 10),
  rule: MISSION_RULE,
  preset: preset.label,
  timeBands: TIME_BANDS,
  missions,
};
fs.writeFileSync(path.join(root, "public/data/missions.json"), JSON.stringify(out, null, 1));
console.log(`Gaps: ${gaps.length} streets (${gaps.filter((g) => g.school).length} near a school, ${gaps.filter((g) => g.nextToTop).length} next to a top ${TOP_N} street)`);
console.log(`Missions: ${missions.length} in ${missions.length} districts, ${missions.reduce((a, m) => a + m.streets.length, 0)} streets`);
