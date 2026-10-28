// Street labels, urgency, ease, and tree reasons (lib/phenomena.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHENOMENA, labelsOf, mainFix, quadrantOf, treeReasons, urgencyOf } from "../lib/phenomena.ts";

const street = (over = {}) => ({
  length: 200,
  m: { safety: null, heat: null, dust: null, rough: null, stopgo: null, schoolZone: false, ...(over.m ?? {}) },
  cov: { safety: 0, heat: 0, dust: 0, rough: 0, stopgo: 0, crashes: 0, ...(over.cov ?? {}) },
  raw: { passes: 0, under150: 0, gapCm: null, heatSpots: 0, crownCover: 0.3, crashes: 0, crashesByCat: [0, 0, 0], flow: null, ...(over.raw ?? {}) },
});
const noPct = () => null;
const ids = (s, p = noPct) => labelsOf(s, p).map((h) => h.id);

test("Crash Course needs enough passes, a high share under 150 cm, and a low average gap", () => {
  assert.deepEqual(ids(street({ raw: { passes: 31, under150: 31, gapCm: 71 } })), ["crashCourse"]);
  assert.deepEqual(ids(street({ raw: { passes: 10, under150: 10, gapCm: 71 } })), [], "too few passes");
  assert.deepEqual(ids(street({ raw: { passes: 40, under150: 30, gapCm: 90 } })), [], "share under 90%");
  assert.deepEqual(ids(street({ raw: { passes: 40, under150: 40, gapCm: 120 } })), [], "gap 100 cm or more");
});

test("Severe Heat Zone needs 3 heat walk spots and +1.0 °C, crown cover is a separate label", () => {
  assert.deepEqual(ids(street({ m: { heat: 1.74 }, raw: { heatSpots: 26, crownCover: 0.3 } })), ["severeHeat"]);
  assert.deepEqual(ids(street({ m: { heat: 1.74 }, raw: { heatSpots: 2, crownCover: 0.3 } })), []);
  assert.deepEqual(ids(street({ m: { heat: 0.9 }, raw: { heatSpots: 26, crownCover: 0.3 } })), []);
  // Aubergweg: hot and no crowns earns both labels.
  assert.deepEqual(ids(street({ m: { heat: 1.74 }, raw: { heatSpots: 26, crownCover: 0 } })), ["severeHeat", "canopyDeficit"]);
});

test("High Traffic Stress: 3 serious crashes, or 10 bike or foot injury crashes", () => {
  assert.deepEqual(ids(street({ raw: { crashes: 4, crashesByCat: [0, 3, 1] } })), ["trafficStress"]);
  assert.deepEqual(ids(street({ raw: { crashes: 10, crashesByCat: [0, 0, 10] } })), ["trafficStress"]);
  assert.deepEqual(ids(street({ raw: { crashes: 9, crashesByCat: [0, 2, 7] } })), []);
});

test("sensor labels need a minimum of readings and the top 10%", () => {
  const p = () => 0.95;
  assert.deepEqual(ids(street({ m: { dust: 0.45 }, cov: { dust: 10 } }), p), ["highEmission"]);
  assert.deepEqual(ids(street({ m: { dust: 0.45 }, cov: { dust: 9 } }), p), []);
  assert.deepEqual(ids(street({ m: { rough: 60 }, cov: { rough: 3 } }), p), ["rattleRoad"]);
  assert.deepEqual(ids(street({ m: { dust: 0.45 }, cov: { dust: 50 } }), () => 0.85), []);
});

test("urgency starts at 1 and adds severe, school, strong evidence, and stacked labels", () => {
  const h = { id: "crashCourse", evidence: "", severe: false, strongEvidence: false };
  assert.equal(urgencyOf(h, { m: { schoolZone: false } }, 1), 1);
  assert.equal(urgencyOf({ ...h, severe: true, strongEvidence: true }, { m: { schoolZone: true } }, 2), 5);
  assert.equal(urgencyOf({ ...h, id: "blindSpot" }, { m: { schoolZone: true } }, 3), 1);
});

test("the grid places labels by urgency and the ease of the main fix", () => {
  assert.equal(quadrantOf(5, 5), "quickWin");
  assert.equal(quadrantOf(4, 3), "bigProject");
  assert.equal(quadrantOf(3, 4), "easyExtra");
  assert.equal(quadrantOf(2, 1), "later");
  for (const p of Object.values(PHENOMENA)) assert.equal(p.resolutions.filter((r) => r.main).length, 1, `${p.id} has one main fix`);
  assert.equal(mainFix("rattleRoad").ease, 5);
});

test("Tree Canopy Deficit needs low crown cover and heat or dust, a school alone is not enough", () => {
  assert.deepEqual(treeReasons(street({ m: { heat: 0.8 }, raw: { heatSpots: 4, crownCover: 0.02 } }), noPct), ["heat walk +0.8 °C"]);
  assert.deepEqual(treeReasons(street({ m: { schoolZone: true }, raw: { crownCover: 0 } }), noPct), []);
  assert.deepEqual(treeReasons(street({ m: { schoolZone: true, dust: 0.45 }, cov: { dust: 12 }, raw: { crownCover: 0 } }), () => 0.95), ["dust in the top 10%, trees as a buffer", "school or kindergarten within 300 m"]);
  assert.deepEqual(treeReasons(street({ m: { heat: 2 }, raw: { heatSpots: 9, crownCover: 0.2 } }), noPct), [], "crown cover 10% or more");
  assert.deepEqual(ids(street({ m: { heat: 0.8 }, raw: { heatSpots: 4, crownCover: 0.02 } })), ["canopyDeficit"]);
});

test("label colours: text stays readable, and no two labels share a colour", () => {
  const colors = Object.values(PHENOMENA).map((p) => p.color.toLowerCase());
  assert.equal(new Set(colors).size, colors.length);
  assert.equal(PHENOMENA.trafficStress.text, "#0F2A23", "dark text on yellow");
});

test("every resolution lead team is one the case panel offers, and no text has long dashes", () => {
  const panel = readFileSync(new URL("../components/street/CasePanel.tsx", import.meta.url), "utf8");
  const teams = JSON.parse(panel.match(/export const LEAD_TEAMS = (\[[^\]]*\]);/)[1]);
  for (const p of Object.values(PHENOMENA)) {
    for (const r of p.resolutions) assert.ok(teams.includes(r.team), `${p.id}: ${r.team}`);
    const text = [p.name, p.rule, p.assumption, p.needs, p.clears, ...p.guidance, ...p.resolutions.map((r) => r.text)].join(" ");
    assert.ok(!/[–—]/.test(text), `${p.id}: no long dashes`);
  }
});
