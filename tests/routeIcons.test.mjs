// Run: npm test. Icons along the chosen route: only from data we have, thinned, never everything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeIcons, thin, nearLine } from "../lib/routeIcons.ts";

// A straight east-west line of about 1.1 km.
const line = [
  [49.14, 9.2],
  [49.14, 9.215],
];
const none = { trees: [], heat: [], danger: [], water: [], sensors: [] };

test("icons: only points close to the route", () => {
  const near = { lat: 49.1401, lng: 9.205, id: 1 };
  const far = { lat: 49.15, lng: 9.205, id: 2 };
  assert.deepEqual(nearLine([near, far], line, 15), [near]);
});

test("icons: thin keeps a gap and a cap", () => {
  const pts = Array.from({ length: 50 }, (_, i) => ({ lat: 49.14, lng: 9.2 + i * 0.0001 }));
  const out = thin(pts, 40, 5);
  assert.equal(out.length, 5);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].lng - out[i - 1].lng > 0.0005);
});

test("icons: shade only for big crowns, heat only for warmer spots, no temperature in labels", () => {
  const icons = routeIcons(line, {
    ...none,
    trees: [
      { lat: 49.1401, lng: 9.203, crown: 12, ref: 1 },
      { lat: 49.1401, lng: 9.209, crown: 4, ref: 2 },
    ],
    heat: [
      [49.1401, 9.204, 1.4, 27.1, 20],
      [49.1401, 9.21, -0.8, 25, 20],
    ],
  });
  assert.deepEqual(
    icons.map((i) => [i.kind, i.ref]),
    [
      ["shade", 1],
      ["heat", 0],
    ]
  );
  const heat = icons.find((i) => i.kind === "heat");
  assert.match(heat.label, /warmer than the walk median/);
  assert.ok(!/°C|degree/.test(heat.label));
});

test("icons: close passes, water and sensors, no other kinds", () => {
  const icons = routeIcons(line, {
    ...none,
    danger: [{ lat: 49.14, lng: 9.206, id: 7 }],
    water: [{ lat: 49.1405, lng: 9.207, id: 3 }],
    sensors: [{ lat: 49.1408, lng: 9.208, name: "Box A" }],
  });
  assert.deepEqual(icons.map((i) => i.kind).sort(), ["danger", "sensor", "water"]);
  for (const i of icons) assert.ok(!/traffic|car|congest|elevation|air quality/i.test(i.label));
});

test("icons: no route, no icons", () => {
  assert.deepEqual(routeIcons([], none), []);
});
