// The hex files must hold the same totals at every resolution, and no cell
// may show a value without points behind it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (r) => JSON.parse(readFileSync(`public/data/hex-r${r}.json`, "utf8"));
const sums = (f) => {
  const s = new Array(f.fields.length).fill(0);
  for (const row of Object.values(f.cells)) row.forEach((v, i) => typeof v === "number" && (s[i] += v));
  return s;
};

test("totals match across resolutions", () => {
  const [a, b, c] = [8, 9, 10].map((r) => load(r));
  const idx = (k) => a.fields.indexOf(k);
  for (const k of ["heatPoints", "closePasses", "passes", "dustPoints", "trees", "segments"]) {
    assert.equal(sums(a)[idx(k)], sums(b)[idx(k)], k);
    assert.equal(sums(a)[idx(k)], sums(c)[idx(k)], k);
  }
  const { meta } = JSON.parse(readFileSync("public/data/segments.json", "utf8"));
  assert.equal(sums(a)[idx("segments")], meta.segments);
  assert.equal(sums(a)[idx("trees")], meta.counts.trees);
});

test("no value without points", () => {
  const f = load(9);
  for (const row of Object.values(f.cells)) {
    if (row[1] === 0) assert.equal(row[0], null);
    if (row[5] === 0) assert.equal(row[4], null);
    assert.ok(row[2] <= row[3]);
  }
});
