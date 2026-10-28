// Next step and suggested measures (lib/actions.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDEAS, MIN_CRASHES, NEXT_MIN, SOON_MIN, driversOf, firstIdea, heldBack, nextStepOf, suggestionsFor, supportFrom } from "../lib/actions.ts";
import { readFileSync } from "node:fs";
import { bandFor } from "../../lib/data.ts";

// The case panel is JSX, so read its two lists from the source text.
const panel = readFileSync(new URL("../components/street/CasePanel.tsx", import.meta.url), "utf8");
const list = (name) => JSON.parse(panel.match(new RegExp(`export const ${name} = (\\[[^\\]]*\\]);`))[1]);
const LEAD_TEAMS_FOR_TEST = list("LEAD_TEAMS");
const FIX_TYPES_FOR_TEST = list("FIX_TYPES");

const row = (score, support, extra = {}) => ({ score, support, littleData: score == null, seg: { length: 100, m: { schoolZone: false } }, parts: [], ...extra });

test("band edges match bandFor in lib/data.ts", () => {
  assert.equal(bandFor(SOON_MIN).key, "soon");
  assert.equal(bandFor(SOON_MIN - 1).key, "next");
  assert.equal(bandFor(NEXT_MIN).key, "next");
  assert.equal(bandFor(NEXT_MIN - 1).key, "later");
});

test("next step is the score band against data support", () => {
  assert.equal(nextStepOf(row(85, "High")), "act");
  assert.equal(nextStepOf(row(85, "Medium")), "act");
  assert.equal(nextStepOf(row(85, "Low")), "check");
  assert.equal(nextStepOf(row(60, "Medium")), "plan");
  assert.equal(nextStepOf(row(60, "Low")), "watch");
  assert.equal(nextStepOf(row(30, "High")), "watch");
});

test("little data and short streets get no next step", () => {
  assert.equal(nextStepOf(row(null, null)), null);
  assert.equal(nextStepOf({ ...row(90, "High"), seg: { length: 10, m: { schoolZone: false } } }), null);
});

test("drivers are measures worse than 75% of streets, largest share first, at most 3", () => {
  const parts = [
    { key: "safety", weight: 1, p: 0.9, points: 10 },
    { key: "heat", weight: 1, p: 0.5, points: 5 },
    { key: "rough", weight: 3, p: 0.8, points: 4 },
    { key: "crashes", weight: 1, p: 0.76, points: 0 },
    { key: "dust", weight: 1, p: 0.95, points: 9 },
    { key: "stopgo", weight: 0, p: 1, points: 9 },
  ];
  const seg = { raw: { crashes: 5 } };
  assert.deepEqual(driversOf({ parts, seg }).map((d) => d.key), ["rough", "dust", "safety"]);
  assert.deepEqual(driversOf({ parts: [{ key: "heat", weight: 1, p: 0.6, points: 3 }], seg }), []);
});

test("one crash is held back as a driver, two or more count", () => {
  const parts = [
    { key: "crashes", weight: 1, p: 0.92, points: 20 },
    { key: "dust", weight: 1, p: 0.8, points: 18 },
  ];
  assert.equal(MIN_CRASHES, 2);
  const one = { parts, seg: { raw: { crashes: 1 } } };
  assert.deepEqual(driversOf(one).map((d) => d.key), ["dust"]);
  assert.deepEqual(heldBack(one), ["crashes"]);
  const two = { parts, seg: { raw: { crashes: 2 } } };
  assert.deepEqual(driversOf(two).map((d) => d.key), ["crashes", "dust"]);
  assert.deepEqual(heldBack(two), []);
});

test("support text names the readings it counts", () => {
  assert.equal(supportFrom({ support: "Medium", supportCount: 9, supportKey: "dust" }), "Medium, 9 danger and dust sensor points");
  assert.equal(supportFrom({ support: "Low", supportCount: 1, supportKey: "rough" }), "Low, 1 roughness sensor box");
  assert.equal(supportFrom({ support: null, supportCount: 0, supportKey: null }), "No sensor support");
});

test("school streets with close passes add a school route walk, but the lead stays with the main measure", () => {
  const r = { parts: [{ key: "safety", weight: 1, p: 0.9, points: 20 }], seg: { m: { schoolZone: true }, raw: { crashes: 0 } } };
  const s = suggestionsFor(r);
  assert.equal(s[0].ideas[0].team, "Schulverwaltung");
  assert.equal(firstIdea(s).team, "Straßenverkehrsbehörde");
});

test("every idea uses a lead team and fix type the case panel offers, one per effort level", () => {
  for (const [key, ideas] of Object.entries(IDEAS)) {
    assert.deepEqual(ideas.map((i) => i.effort), ["quick", "medium", "big"], key);
    for (const i of ideas) {
      assert.ok(LEAD_TEAMS_FOR_TEST.includes(i.team), `${key}: ${i.team}`);
      assert.ok(i.fixType === "" || FIX_TYPES_FOR_TEST.includes(i.fixType), `${key}: ${i.fixType}`);
      assert.ok(!/[–—]/.test(i.text), `${key}: no long dashes`);
    }
  }
});
