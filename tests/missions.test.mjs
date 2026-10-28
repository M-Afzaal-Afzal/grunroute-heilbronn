import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateStreets, enoughData, percentiles, presetById, rankSegments } from "../lib/priority.ts";
import { TOP_N, bundle, findGaps } from "../lib/missions.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "public/data/segments.json"), "utf8"));
const streets = aggregateStreets(data.segments);
const scored = rankSegments(streets, presetById("balanced"), percentiles(streets));
const top = scored.filter((x) => x.score != null && x.seg.length >= 20 && enoughData(x)).slice(0, TOP_N).map((x) => x.seg.id);

test("gaps have Low or no support, are 20 m or more, and are not top streets", () => {
  const gaps = findGaps(scored, top);
  assert.ok(gaps.length > 0);
  const topSet = new Set(top);
  for (const g of gaps) {
    assert.ok(g.support === "Low" || g.support === "none");
    assert.ok(g.street.length >= 20);
    assert.ok(!topSet.has(g.street.id));
    assert.ok(g.school || g.nextToTop);
  }
});

test("a bundle uses each street once and each role at most once", () => {
  const gaps = findGaps(scored, top).slice(0, 10);
  const b = bundle(gaps, (s) => s.name ?? "x");
  assert.equal(new Set(b.streets.map((s) => s.id)).size, b.streets.length);
  assert.equal(new Set(b.streets.map((s) => s.role)).size, b.streets.length);
  assert.equal(b.streets.length + b.missing.length, 4);
});

test("missions.json matches the format", () => {
  const f = JSON.parse(fs.readFileSync(path.join(root, "public/data/missions.json"), "utf8"));
  assert.equal(f.version, 1);
  assert.ok(f.rule.includes("Adults collect data for school streets"));
  for (const m of f.missions) for (const s of m.streets) assert.ok(["busy", "side", "school", "green"].includes(s.role) && Number.isFinite(s.lat) && Number.isFinite(s.lng));
});
