// Run: npm test. The comfort rule that picks GrünRoute: shade, heat walk spots, and close passes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { comfortScore, labelRoutes } from "../lib/comfort.ts";

const base = { km: 2, treesPerKm: 30, bigCrowns: null, treeSource: "osm", heat: { avg: null, covered: 0 }, dangerPerKm: null };

test("comfort: more shade is better", () => {
  assert.ok(comfortScore({ ...base, treesPerKm: 40 }) > comfortScore(base));
  // City register: big crowns add shade.
  const city = { ...base, treeSource: "city", treesPerKm: 60, bigCrowns: 0 };
  assert.ok(comfortScore({ ...city, bigCrowns: 20 }) > comfortScore(city));
});

test("comfort: warmer heat walk spots and more close passes cost points", () => {
  assert.ok(comfortScore({ ...base, heat: { avg: 1, covered: 0.8 } }) < comfortScore(base));
  assert.ok(comfortScore({ ...base, heat: { avg: -1, covered: 0.8 } }) > comfortScore(base));
  assert.ok(comfortScore({ ...base, dangerPerKm: 5 }) < comfortScore(base));
  // No heat data and no close pass data count as zero, not as good or bad.
  assert.equal(comfortScore({ ...base, heat: { avg: null, covered: 0 }, dangerPerKm: null }), base.treesPerKm);
});

test("comfort: uses only shade, heat walk spots, and close passes", () => {
  // Extra fields, such as the old fix first street list or drinking water, do not change the score.
  const plain = comfortScore(base);
  assert.equal(comfortScore({ ...base, fixStreets: ["A", "B", "C"], water: 4, trees: 999 }), plain);
});

test("labels: fastest, GrünRoute, and at most one more", () => {
  const r = (id, duration, score) => ({ id, duration, score, label: "other" });
  const out = labelRoutes([r("a", 600, 1), r("b", 700, 5), r("c", 650, 3), r("d", 680, 2)]);
  assert.deepEqual(
    out.map((x) => [x.id, x.label]),
    [
      ["b", "green"],
      ["a", "fastest"],
      ["c", "other"],
    ]
  );
  const same = labelRoutes([r("a", 600, 9), r("b", 700, 1)]);
  assert.equal(same[0].id, "a");
  assert.equal(same[0].label, "both");
  assert.deepEqual(labelRoutes([]), []);
});
