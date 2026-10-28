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

test("Hell Valley needs 3 heat walk spots, +1.0 °C, and crown cover under 10%", () => {
  const hv = { m: { heat: 1.74 }, raw: { heatSpots: 26, crownCover: 0 } };
  assert.deepEqual(ids(street(hv)), ["hellValley"]);
  assert.deepEqual(ids(street({ m: { heat: 1.74 }, raw: { heatSpots: 2, crownCover: 0 } })), []);
  assert.deepEqual(ids(street({ m: { heat: 0.9 }, raw: { heatSpots: 26, crownCover: 0 } })), []);
  assert.deepEqual(ids(street({ m: { heat: 1.74 }, raw: { heatSpots: 26, crownCover: 0.12 } })), []);
});

test("Black Spot counts killed and seriously injured, not all crashes", () => {
  assert.deepEqual(ids(street({ raw: { crashes: 16, crashesByCat: [0, 3, 13] } })), ["blackSpot"]);
  assert.deepEqual(ids(street({ raw: { crashes: 30, crashesByCat: [0, 2, 28] } })), []);
});

test("sensor labels need a minimum of readings and the top 10%", () => {
  const p = () => 0.95;
  assert.deepEqual(ids(street({ m: { dust: 0.45 }, cov: { dust: 10 } }), p), ["dustTrap"]);
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

test("trees need low crown cover and heat or dust, a school alone is not enough", () => {
  assert.deepEqual(treeReasons(street({ m: { heat: 0.8 }, raw: { heatSpots: 4, crownCover: 0.02 } }), []), ["heat walk +0.8 °C"]);
  assert.deepEqual(treeReasons(street({ m: { schoolZone: true }, raw: { crownCover: 0 } }), []), []);
  assert.deepEqual(treeReasons(street({ m: { schoolZone: true }, raw: { crownCover: 0 } }), ["dustTrap"]), ["Dust Trap, trees as a buffer", "school or kindergarten within 300 m"]);
  assert.deepEqual(treeReasons(street({ m: { heat: 2 }, raw: { heatSpots: 9, crownCover: 0.2 } }), ["hellValley"]), []);
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
