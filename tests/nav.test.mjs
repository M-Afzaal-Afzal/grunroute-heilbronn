// Run: npm test. Turn by turn logic in lib/nav.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CUE, OFF_ROUTE_READS, cueFor, cueSteps, cumulative, instruction, offCount, progress, project, sayDistance, spoken, startLine, stepAlongs } from "../lib/nav.ts";

// A straight line north, about 1,112 m long, then 500 m east.
const line = [[49.14, 9.2], [49.15, 9.2], [49.15, 9.2068]];
const cum = cumulative(line);
const steps = [
  { type: "depart", modifier: "right", name: "Allee", lat: 49.14, lng: 9.2 },
  { type: "turn", modifier: "right", name: "Kranenstraße", lat: 49.15, lng: 9.2 },
  { type: "arrive", name: "", lat: 49.15, lng: 9.2068 },
];

test("cumulative and project measure along and off the line", () => {
  assert.ok(Math.abs(cum[1] - 1112) < 1);
  const f = project([49.145, 9.2003], line, cum);
  assert.ok(Math.abs(f.along - 556) < 2);
  assert.ok(f.off > 15 && f.off < 30, `off ${f.off}`);
  assert.equal(f.idx, 0);
});

test("steps sit at their place along the line", () => {
  const a = stepAlongs(steps, line, cum);
  assert.equal(a[0], 0);
  assert.ok(Math.abs(a[1] - cum[1]) < 1);
  assert.ok(Math.abs(a[2] - cum[2]) < 1);
});

test("instruction words", () => {
  assert.equal(instruction(steps[1]), "Turn right onto Kranenstraße");
  assert.equal(instruction({ type: "turn", modifier: "slight left", name: "", lat: 0, lng: 0 }), "Bear left");
  assert.equal(instruction({ type: "roundabout", exit: 2, name: "Ring", lat: 0, lng: 0 }), "At the roundabout, take the second exit onto Ring");
  assert.equal(instruction({ type: "end of road", modifier: "left", name: "Lauerweg", lat: 0, lng: 0 }), "At the end of the road, turn left onto Lauerweg");
  assert.equal(instruction(steps[2]), "Arrive at your destination");
  assert.equal(spoken(steps[1], 100), "In 100 m, turn right onto Kranenstraße");
});

test("distances are said in round numbers", () => {
  assert.equal(sayDistance(147), "150 m");
  assert.equal(sayDistance(43), "40 m");
  assert.equal(sayDistance(3), "10 m");
  assert.equal(sayDistance(1260), "1.3 km");
});

test("cue steps drop plain continues and roundabout exits", () => {
  const kept = cueSteps([
    steps[0],
    { type: "continue", modifier: "straight", name: "", lat: 0, lng: 0 },
    { type: "exit roundabout", name: "", lat: 0, lng: 0 },
    steps[1],
    steps[2],
  ]);
  assert.deepEqual(kept.map((s) => s.type), ["depart", "turn", "arrive"]);
});

test("cues play once: early, then now, then arrive", () => {
  const alongs = stepAlongs(steps, line, cum);
  const total = cum[cum.length - 1];
  const said = new Set();
  const at = (along) => progress({ along, off: 0, idx: 0 }, alongs, total);

  assert.equal(cueFor(at(500), steps, "bike", said), null);
  const early = cueFor(at(cum[1] - 120), steps, "bike", said);
  assert.equal(early.kind, "early");
  assert.equal(early.text, "In 100 m, turn right onto Kranenstraße");
  said.add(`${early.step}:early`);
  assert.equal(cueFor(at(cum[1] - 100), steps, "bike", said), null);
  const now = cueFor(at(cum[1] - 20), steps, "bike", said);
  assert.equal(now.kind, "now");
  assert.equal(now.text, "Turn right onto Kranenstraße");
  said.add(`${now.step}:now`);
  const arrive = cueFor(at(total - CUE.bike.arrive + 1), steps, "bike", said);
  assert.equal(arrive.kind, "arrive");
  said.add("arrive");
  assert.equal(cueFor(at(total), steps, "bike", said), null);
});

test("off route needs several bad readings, poor accuracy is ignored", () => {
  let n = 0;
  for (let i = 0; i < OFF_ROUTE_READS - 1; i++) n = offCount(n, 60, 10);
  assert.ok(n < OFF_ROUTE_READS);
  assert.equal(offCount(n, 60, 200), n);
  n = offCount(n, 60, 10);
  assert.equal(n, OFF_ROUTE_READS);
  assert.equal(offCount(n, 10, 10), 0);
});

test("start line names the first turn, but not an arrival", () => {
  const dep = { type: "depart", modifier: null, name: "Allee" };
  const turn = { type: "turn", modifier: "left", name: "Kaiserstraße" };
  const arr = { type: "arrive", modifier: null, name: "" };
  assert.deepEqual(startLine([dep, turn, arr]), { text: "Starting. Turn left onto Kaiserstraße.", covers: 1 });
  assert.deepEqual(startLine([dep, arr]), { text: "Starting. Follow the route.", covers: null });
  assert.deepEqual(startLine([]), { text: "Starting. Follow the route.", covers: null });
});
