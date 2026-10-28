// Run: npm test. Turn by turn logic in lib/nav.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CUE, OFF_ROUTE_READS, bearing, fmtDistance, cueFor, cueSteps, cumulative, instruction, headingFor, offCount, pointAt, progress, project, sayDistance, splitAt, spoken, startLine, stepAlongs } from "../lib/nav.ts";

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

test("bearing: north is 0, east is 90", () => {
  assert.equal(Math.round(bearing([49.14, 9.2], [49.15, 9.2])), 0);
  assert.equal(Math.round(bearing([49.15, 9.2], [49.15, 9.2068])), 90);
  assert.equal(Math.round(bearing([49.15, 9.2], [49.14, 9.2])), 180);
});

test("heading: phone heading when moving, else the route, else the last one", () => {
  const onFirst = project([49.145, 9.2], line, cum);
  assert.equal(headingFor(200, 4, line, onFirst, null), 200);
  // Too slow to trust the phone: follow the route, which goes north here.
  assert.equal(Math.round(headingFor(200, 0.3, line, onFirst, null)), 0);
  const onSecond = project([49.15, 9.203], line, cum);
  assert.equal(Math.round(headingFor(null, null, line, onSecond, null)), 90);
  // Far off the route and no phone heading: keep the last one.
  const far = project([49.145, 9.21], line, cum);
  assert.equal(headingFor(null, null, line, far, 123), 123);
});

test("split: the covered part and the part ahead meet at the cut", () => {
  const total = cum[cum.length - 1];
  const { done, ahead } = splitAt(line, cum, 556);
  assert.equal(done.length, 2);
  assert.deepEqual(done[1], ahead[0]);
  assert.ok(Math.abs(done[1][0] - 49.145) < 0.0001);
  assert.deepEqual(ahead[ahead.length - 1], line[2]);
  assert.deepEqual(splitAt(line, cum, 0), { done: [], ahead: line });
  assert.deepEqual(splitAt(line, cum, total + 10), { done: line, ahead: [] });
  // Past the corner: the corner belongs to the covered part.
  const past = splitAt(line, cum, cum[1] + 100);
  assert.deepEqual(past.done.slice(0, 2), line.slice(0, 2));
  assert.equal(past.ahead.length, 2);
});

test("German instruction words", () => {
  const de = (s) => instruction(s, "de");
  assert.equal(de(steps[1]), "Rechts abbiegen auf Kranenstraße");
  assert.equal(de({ type: "turn", modifier: "slight right", name: "", lat: 0, lng: 0 }), "Leicht rechts halten");
  assert.equal(de({ type: "turn", modifier: "sharp left", name: "", lat: 0, lng: 0 }), "Scharf links abbiegen");
  assert.equal(de({ type: "roundabout", exit: 2, name: "", lat: 0, lng: 0 }), "Im Kreisverkehr die 2. Ausfahrt nehmen");
  assert.equal(de({ type: "end of road", modifier: "left", name: "Lauerweg", lat: 0, lng: 0 }), "Am Ende der Straße links abbiegen auf Lauerweg");
  assert.equal(de({ type: "fork", modifier: "slight left", name: "", lat: 0, lng: 0 }), "Links halten");
  assert.equal(de({ type: "continue", name: "Allee", lat: 0, lng: 0 }), "Weiter auf Allee");
  assert.equal(de(steps[2]), "Ziel erreichen");
  assert.equal(spoken({ type: "turn", modifier: "left", name: "Allee", lat: 0, lng: 0 }, 100, "de"), "In 100 m links abbiegen auf Allee");
  assert.equal(spoken(steps[2], 100, "de"), "In 100 m Ziel erreichen");
  assert.equal(spoken({ type: "roundabout", exit: 2, name: "", lat: 0, lng: 0 }, 1260, "de"), "In 1,3 km im Kreisverkehr die 2. Ausfahrt nehmen");
});

test("German distances use a decimal comma", () => {
  assert.equal(sayDistance(1260, "de"), "1,3 km");
  assert.equal(sayDistance(147, "de"), "150 m");
  assert.equal(fmtDistance(2340, "de"), "2,3 km");
  assert.equal(fmtDistance(2340), "2.3 km");
});

test("German cues and start line", () => {
  const alongs = stepAlongs(steps, line, cum);
  const total = cum[cum.length - 1];
  const said = new Set();
  const at = (along) => progress({ along, off: 0, idx: 0 }, alongs, total);
  assert.equal(cueFor(at(cum[1] - 120), steps, "bike", said, "de").text, "In 100 m rechts abbiegen auf Kranenstraße");
  assert.equal(cueFor(at(total), steps, "bike", said, "de").text, "Du bist angekommen");
  const dep = { type: "depart", modifier: null, name: "Allee" };
  const turn = { type: "turn", modifier: "left", name: "Kaiserstraße" };
  const arr = { type: "arrive", modifier: null, name: "" };
  assert.deepEqual(startLine([dep, turn, arr], "de"), { text: "Los geht's. Links abbiegen auf Kaiserstraße.", covers: 1 });
  assert.deepEqual(startLine([dep, arr], "de"), { text: "Los geht's. Folge der Route.", covers: null });
});

test("pointAt finds the point a distance along the line", () => {
  assert.deepEqual(pointAt(line, cum, 0), line[0]);
  assert.deepEqual(pointAt(line, cum, 1e9), line[2]);
  const mid = pointAt(line, cum, cum[1] / 2);
  assert.ok(Math.abs(mid[0] - 49.145) < 1e-9);
  assert.equal(mid[1], 9.2);
  const corner = pointAt(line, cum, cum[1] + 10);
  assert.equal(corner[0], 49.15);
  assert.ok(corner[1] > 9.2);
});
