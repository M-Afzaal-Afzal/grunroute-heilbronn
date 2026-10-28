// Run: npm test. People app logic: Hot or not rounds, Help measure badges, district league.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HEAT_CELLS } from "../lib/heat-walks.ts";
import { MIN_APART_M, MIN_GAP, MIN_POINTS, ROUNDS, pickRounds, seeded, warmer } from "../lib/play.ts";
import { badges, toggleAdopt } from "../lib/badges.ts";
import { MIN_LENGTH_M, SENSOR_KEYS, TRUSTED, districtLabel as dl, districtRows, isTrusted, sortRows, treeDistrictLabel, trustedShare } from "../lib/districts.ts";
import { MEASURES, MIN_SEGMENT_M, TRUSTED_PASSES, aggregateStreets, districtLabel } from "../lib/priority.ts";
import { speciesByDistrict } from "../lib/species.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KY = 111200;
const KX = 111320 * Math.cos((49.14 * Math.PI) / 180);

test("hot or not: five rounds of real spots, far enough apart in place and in value", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const rounds = pickRounds(HEAT_CELLS, ROUNDS, seeded(seed));
    assert.equal(rounds.length, ROUNDS);
    const seen = new Set();
    for (const [a, b] of rounds) {
      assert.ok(Math.abs(a.anomaly - b.anomaly) >= MIN_GAP);
      assert.ok(Math.hypot((a.lat - b.lat) * KY, (a.lng - b.lng) * KX) >= MIN_APART_M);
      assert.ok(a.points >= MIN_POINTS && b.points >= MIN_POINTS);
      for (const s of [a, b]) {
        assert.ok(!seen.has(s.index));
        seen.add(s.index);
        // The spot is a real heat walk cell, value unchanged.
        assert.equal(HEAT_CELLS[s.index][2], s.anomaly);
      }
    }
    const r = rounds[0];
    assert.equal(r[warmer(r)].anomaly, Math.max(r[0].anomaly, r[1].anomaly));
  }
});

test("badges come from adopted missions", () => {
  const m = (id, timeBand, school) => ({ id, title: id, district: "Böckingen", timeBand, why: "", missing: [], streets: [{ id: 1, name: "x", role: school ? "school" : "busy", lat: 49, lng: 9, length: 50 }] });
  let list = [];
  assert.ok(badges(list).every((b) => !b.earned));
  list = toggleAdopt(list, m("a", "am", false));
  assert.deepEqual(badges(list).map((b) => b.earned), [true, false, false]);
  list = toggleAdopt(list, m("b", "midday", true));
  list = toggleAdopt(list, m("c", "pm", false));
  assert.deepEqual(badges(list).map((b) => b.earned), [true, true, true]);
  list = toggleAdopt(list, m("b", "midday", true));
  assert.equal(list.length, 2);
  assert.deepEqual(badges(list).map((b) => b.earned), [true, false, false]);
});

test("district constants match the scoring code", () => {
  assert.equal(TRUSTED, TRUSTED_PASSES);
  assert.equal(MIN_LENGTH_M, MIN_SEGMENT_M);
  assert.deepEqual([...SENSOR_KEYS], MEASURES.filter((m) => m.sensor).map((m) => m.key));
  for (const d of [null, "Heilbronn", "Böckingen"]) assert.equal(dl(d), districtLabel(d));
  assert.equal(treeDistrictLabel("HN Innenstadt"), "Kernstadt (Heilbronn)");
  assert.equal(treeDistrictLabel("HN Äussere Bezirke"), "Kernstadt (Heilbronn)");
  assert.equal(treeDistrictLabel(""), null);
});

test("district rows add up to the street network", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, "public/data/segments.json"), "utf8"));
  const streets = aggregateStreets(data.segments);
  const rows = districtRows(streets);
  const long = streets.filter((s) => s.length >= MIN_SEGMENT_M);
  assert.equal(rows.reduce((a, r) => a + r.streets, 0), long.length);
  assert.equal(rows.reduce((a, r) => a + r.trusted, 0), long.filter(isTrusted).length);
  for (const r of rows) {
    assert.ok(r.measured <= r.streets && r.trusted <= r.measured);
    assert.ok(r.crownCover == null || (r.crownCover >= 0 && r.crownCover <= 1));
  }
  const byTrusted = sortRows(rows, "trusted");
  for (let i = 1; i < byTrusted.length; i++) assert.ok(byTrusted[i - 1].trusted / byTrusted[i - 1].streets >= byTrusted[i].trusted / byTrusted[i].streets);
  const share = trustedShare(streets);
  assert.equal(share.get("Kernstadt (Heilbronn)").streets, rows.find((r) => r.label === "Kernstadt (Heilbronn)").streets);
});

test("species mix counts groups as trees but not as a species", () => {
  const rows = [
    ["Tilia cordata", "Böckingen"], ["Tilia cordata 'Greenspire'", "Böckingen"], ["Acer platanoides", "Böckingen"], ["Mischbestand", "Böckingen"],
  ];
  const fake = { count: rows.length, get: (i) => ({ latin: rows[i][0], district: rows[i][1] }) };
  const [mix] = speciesByDistrict(fake);
  assert.equal(mix.trees, 4);
  assert.equal(mix.known, 3);
  assert.equal(mix.species.name, "Tilia cordata");
  assert.ok(Math.abs(mix.species.share - 2 / 3) < 1e-9);
  assert.equal(mix.family.name, "Malvaceae");
});
