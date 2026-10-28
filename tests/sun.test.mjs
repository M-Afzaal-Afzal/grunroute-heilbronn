// Run: npm test. Sun position sanity checks for Heilbronn on 21 July.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sunPosition, shadowOffset, shadeDate } from "../lib/sun.ts";

const deg = (r) => (r * 180) / Math.PI;

test("solar noon in Heilbronn on 21 July: sun due south, about 61 degrees high", () => {
  // Solar noon at 9.22 E in CEST is about 13:29 local.
  const p = sunPosition(new Date("2026-07-21T13:29:00+02:00"), 49.14, 9.22);
  assert.ok(Math.abs(deg(p.azimuth) - 180) < 2, `azimuth ${deg(p.azimuth)}`);
  assert.ok(Math.abs(deg(p.altitude) - 61) < 1.5, `altitude ${deg(p.altitude)}`);
});

test("morning sun is in the east, evening sun in the west, shadows point away", () => {
  const am = sunPosition(shadeDate(9), 49.14, 9.22);
  const pm = sunPosition(shadeDate(18), 49.14, 9.22);
  assert.ok(deg(am.azimuth) > 70 && deg(am.azimuth) < 120, `am ${deg(am.azimuth)}`);
  assert.ok(deg(pm.azimuth) > 250 && deg(pm.azimuth) < 290, `pm ${deg(pm.azimuth)}`);
  const [east] = shadowOffset(10, am);
  assert.ok(east < 0, "morning shadow points west");
  assert.equal(shadowOffset(10, { azimuth: 0, altitude: -0.1 }), null);
});
