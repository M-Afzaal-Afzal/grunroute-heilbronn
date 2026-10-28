// Run: npm test. The Valhalla backup router: its answer must read like an OSRM route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePolyline6, valhallaRoute } from "../lib/valhalla.ts";
import { instruction } from "../lib/nav.ts";

// The Google polyline example, read with 6 decimals instead of 5.
const SHAPE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

test("valhalla: decodes a polyline with 6 decimals", () => {
  assert.deepEqual(decodePolyline6(SHAPE), [
    [3.85, -12.02],
    [4.07, -12.095],
    [4.3252, -12.6453],
  ]);
});

test("valhalla: trip becomes an OSRM shaped route", () => {
  const trip = {
    summary: { length: 2.163, time: 460.5 },
    legs: [
      {
        shape: SHAPE,
        maneuvers: [
          { type: 1, begin_shape_index: 0 },
          { type: 15, street_names: ["Frei-Otto-Straße"], begin_shape_index: 1 },
          { type: 26, street_names: ["Mannheimer Straße"], roundabout_exit_count: 2, begin_shape_index: 1 },
          { type: 39, begin_shape_index: 2 },
          { type: 6, begin_shape_index: 2 },
        ],
      },
    ],
  };
  const r = valhallaRoute(trip);
  assert.equal(r.distance, 2163);
  assert.equal(r.duration, 460.5);
  assert.equal(r.coords.length, 3);
  assert.deepEqual(
    r.steps.map((s) => [s.type, s.modifier, s.exit, s.name]),
    [
      ["depart", undefined, undefined, ""],
      ["turn", "left", undefined, "Frei-Otto-Straße"],
      ["roundabout", undefined, 2, "Mannheimer Straße"],
      ["continue", "straight", undefined, ""],
      ["arrive", undefined, undefined, ""],
    ],
  );
  assert.deepEqual([r.steps[1].lat, r.steps[1].lng], [4.07, -12.095]);
  // The steps read the same as OSRM steps, in both languages.
  assert.equal(instruction(r.steps[1]), "Turn left onto Frei-Otto-Straße");
  assert.match(instruction(r.steps[2], "de"), /Kreisverkehr/);
});
