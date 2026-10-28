// Run: npm test. Street level aggregation in lib/priority.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateStreets, rankSegments, rankableSegments, presetById, enoughData, districtLabel, streetKey, MIN_SEGMENT_M } from "../lib/priority.ts";

const empty = { safety: null, gap: null, heat: null, shadeGap: null, dust: null, rough: null, stopgo: null, crashes: null, schoolZone: false };
const cov0 = { safety: 0, heat: 0, dust: 0, rough: 0, stopgo: 0, crashes: 0 };
const raw0 = { gapCm: null, passes: 0, under150: 0, bins: null, heatSpots: 0, treesPer100: null, trees: 0, crownCover: null, dust: null, roughBoxes: 0, speedKmh: null, flow: null, crashes: 0, crashesByCat: [0, 0, 0] };
const seg = (id, o) => ({ id, name: null, near: null, district: "Heilbronn", length: 100, g: [[49, 9], [49.001, 9]], ...o, m: { ...empty, ...o.m }, cov: { ...cov0, ...o.cov }, raw: { ...raw0, ...o.raw } });

const a1 = seg(10, { name: "Allee", length: 300, m: { safety: 0.8, shadeGap: 0.5, crashes: 0 }, cov: { safety: 10 }, raw: { passes: 10, under150: 8, bins: [1, 2, 3, 4, 0], trees: 3 } });
const a2 = seg(11, { name: "Allee", length: 100, m: { safety: 0.4, shadeGap: 0.9, crashes: 3, schoolZone: true }, cov: { safety: 5, crashes: 1 }, raw: { passes: 5, under150: 2, bins: [0, 1, 1, 1, 2], trees: 1, crashes: 1, crashesByCat: [1, 0, 0] } });
const a3 = seg(12, { name: "Allee", district: "Böckingen", length: 5, m: { shadeGap: 1 } });
const u1 = seg(20, { near: "Allee", length: 40, m: { dust: 0.2, shadeGap: 0.4 }, cov: { dust: 7 } });
const u2 = seg(21, { near: "Allee", length: 10, m: { dust: 0.6, shadeGap: 0.4 }, cov: { dust: 3 } });
const lost = seg(30, { length: 80, m: { shadeGap: 0.2 } });
const all = [a1, a2, a3, u1, u2, lost];

test("streets group by name and district, unnamed by near and district, none are left out", () => {
  const streets = aggregateStreets(all);
  assert.deepEqual(streets.map((s) => s.key), ["Allee|Heilbronn", "Allee|Böckingen", "near:Allee|Heilbronn"]);
  assert.equal(streetKey(lost), null);
  assert.ok(!streets.some((s) => s.segIds.includes(30)));
});

test("street measures are length weighted means, coverage is summed", () => {
  const [allee] = aggregateStreets(all);
  assert.equal(allee.id, 10);
  assert.deepEqual(allee.segIds, [10, 11]);
  assert.equal(allee.length, 400);
  // (0.8 x 300 + 0.4 x 100) / 400 = 0.7
  assert.equal(allee.m.safety, 0.7);
  assert.equal(allee.m.shadeGap, 0.6);
  assert.equal(allee.cov.safety, 15);
  assert.equal(allee.raw.passes, 15);
  assert.equal(allee.raw.under150, 10);
  assert.deepEqual(allee.raw.bins, [1, 3, 4, 5, 2]);
  assert.equal(allee.m.schoolZone, true);
  assert.equal(allee.lines.length, 2);
});

test("crashes are weighted crashes per 100 m over the whole street", () => {
  const [allee] = aggregateStreets(all);
  // one fatal crash (weight 3) over 400 m = 0.75 per 100 m
  assert.equal(allee.m.crashes, 0.75);
  assert.equal(allee.raw.crashes, 1);
  assert.deepEqual(allee.raw.crashesByCat, [1, 0, 0]);
});

test("short segments are kept in street sums but not ranked as segments", () => {
  const short = seg(40, { name: "Kurz", length: MIN_SEGMENT_M - 1, m: { safety: 1, dust: 1 }, cov: { safety: 30, dust: 30 } });
  const ok = seg(41, { name: "Kurz", length: 81, m: { safety: 0, dust: 0 }, cov: { safety: 1, dust: 1 } });
  assert.deepEqual(rankableSegments([short, ok]).map((s) => s.id), [41]);
  const [kurz] = aggregateStreets([short, ok]);
  assert.equal(kurz.length, 100);
  assert.equal(kurz.cov.safety, 31);
  assert.equal(kurz.m.safety, 0.19);
});

test("percentiles are taken over streets", () => {
  const streets = aggregateStreets(all);
  const ranked = rankSegments(streets, presetById("balanced"));
  assert.equal(ranked.length, 3);
  // Allee in Heilbronn has close passes and shade gap, so it is scored
  const allee = ranked.find((r) => r.seg.key === "Allee|Heilbronn");
  assert.equal(allee.littleData, false);
  // Böckingen piece has only shade gap: little data, never hidden
  assert.equal(ranked.find((r) => r.seg.key === "Allee|Böckingen").littleData, true);
});

test("enough data hides low support from lists", () => {
  assert.equal(enoughData({ littleData: false, support: "High" }), true);
  assert.equal(enoughData({ littleData: false, support: "Medium" }), true);
  assert.equal(enoughData({ littleData: false, support: "Low" }), false);
  assert.equal(enoughData({ littleData: true, support: null }), false);
});

test("the city centre district gets a clear label", () => {
  assert.equal(districtLabel("Heilbronn"), "Kernstadt (Heilbronn)");
  assert.equal(districtLabel("Böckingen"), "Böckingen");
});

test("live boxes: inside the boundary only, negative values dropped", async () => {
  const { boundaryRings, insideRings, usableValue } = await import("../lib/live.ts");
  const rings = boundaryRings({ features: [{ geometry: { type: "Polygon", coordinates: [[[9, 49], [9.1, 49], [9.1, 49.1], [9, 49.1], [9, 49]]] } }] });
  assert.equal(insideRings(rings, 9.05, 49.05), true);
  assert.equal(insideRings(rings, 9.2, 49.05), false);
  assert.equal(usableValue(-3), null);
  assert.equal(usableValue("4.5"), 4.5);
  assert.equal(usableValue(null), null);
});
