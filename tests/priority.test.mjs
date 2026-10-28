// Run: npm test (node --test). Node strips the TypeScript types in lib/priority.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { percentiles, rankSegments, scoreSegment, presetById, supportFor, decodeWeights, encodeWeights, presetForWeights } from "../lib/priority.ts";

const empty = { safety: null, gap: null, heat: null, shadeGap: null, dust: null, rough: null, stopgo: null, crashes: null, schoolZone: false };
const cov0 = { safety: 0, heat: 0, dust: 0, rough: 0, stopgo: 0, crashes: 0 };
const seg = (id, m, cov = {}) => ({ id, name: `S${id}`, district: "Heilbronn", length: 100, m: { ...empty, ...m }, cov: { ...cov0, ...cov }, raw: {}, g: [] });

// Four segments. A is worst on close passes and crashes, D has only tree cover and crashes.
const A = seg(1, { safety: 0.9, gap: 110, crashes: 3, shadeGap: 0.9, dust: 0.5 }, { safety: 24, dust: 40, crashes: 2 });
const B = seg(2, { safety: 0.5, gap: 150, crashes: 0, shadeGap: 0.5, dust: 0.3, schoolZone: true }, { safety: 5, dust: 10 });
const C = seg(3, { safety: 0.1, gap: 190, crashes: 1, shadeGap: 0.1, dust: 0.1 }, { safety: 2, dust: 3, crashes: 1 });
const D = seg(4, { crashes: 0, shadeGap: 1 });
const all = [A, B, C, D];

test("percentile is the share of other measured segments with a lower value", () => {
  const p = percentiles(all);
  assert.equal(p.safety.get(0.9), 1);
  assert.equal(p.safety.get(0.5), 0.5);
  assert.equal(p.safety.get(0.1), 0);
  // ties: two zeros in crashes both get 0
  assert.equal(p.crashes.get(0), 0);
  assert.equal(p.crashes.get(3), 1);
});

test("balanced score averages the weighted percentiles the segment has", () => {
  const p = percentiles(all);
  const r = scoreSegment(A, p, presetById("balanced"));
  // safety 1, shadeGap 0.667, dust 1, crashes 1 over 4 measures -> 91.7
  assert.equal(r.score, 92);
  assert.equal(r.littleData, false);
  assert.equal(Math.round(r.parts.reduce((a, x) => a + x.points, 0)), 92);
});

test("tree cover and crashes alone are little data, never hidden", () => {
  const ranked = rankSegments(all, presetById("balanced"));
  const d = ranked.find((r) => r.seg.id === 4);
  assert.equal(d.score, null);
  assert.equal(d.littleData, true);
  assert.equal(ranked.length, 4);
  assert.equal(ranked[3].seg.id, 4);
});

test("passing gap only keeps the old rule 100 minus gap / 2", () => {
  const p = percentiles(all);
  const g = presetById("gap");
  assert.equal(scoreSegment(A, p, g).score, 45);
  assert.equal(scoreSegment(C, p, g).score, 5);
  assert.equal(scoreSegment(D, p, g).littleData, true);
});

test("school preset gives close passes 1.5x weight in a school zone", () => {
  const p = percentiles(all);
  const school = presetById("school");
  const withZone = scoreSegment(B, p, school);
  const noZone = scoreSegment({ ...B, m: { ...B.m, schoolZone: false } }, p, school);
  // safety p 0.5, crashes p 0: (4.5 x 0.5) / 7.5 = 30 vs (3 x 0.5) / 6 = 25
  assert.equal(withZone.score, 30);
  assert.equal(noZone.score, 25);
});

test("support labels and the coverage gate", () => {
  assert.equal(supportFor(10), "High");
  assert.equal(supportFor(3), "Medium");
  assert.equal(supportFor(2), "Low");
  assert.equal(supportFor(0), null);
  const p = percentiles(all);
  const a = scoreSegment(A, p, presetById("school"));
  assert.equal(a.gate, "Trusted");
  const c = scoreSegment(C, p, presetById("school"));
  assert.equal(c.gate, "Indicative");
  // C: safety p 0 and crashes p 0.67, top sensor is safety with 2 passes -> Low, weak
  assert.equal(c.support, "Low");
  assert.equal(c.weak, true);
  assert.equal(scoreSegment(A, p, presetById("cool")).gate, null);
});

test("weights round trip through the URL string", () => {
  const w = presetById("cool").weights;
  assert.equal(encodeWeights(w), "0331000");
  assert.deepEqual(decodeWeights("0331000"), w);
  assert.equal(presetForWeights(w), "cool");
  assert.equal(decodeWeights("9"), null);
  assert.equal(presetForWeights(decodeWeights("2000000")), null);
});
