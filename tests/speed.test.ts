import { test } from "node:test";
import assert from "node:assert/strict";
import { SpeedMeter } from "../src/collect/speed.ts";

test("waiting and transport remain in the denominator: 264 tokens over 8s is 33, not 88", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  for (let t = 5000; t <= 8000; t += 100) meter.tick(t);
  assert.equal(meter.current(7000), null);
  assert.equal(meter.end(8000, 264), 33);
  assert.deepEqual(meter.current(9000), { tokensPerSecond: 33, live: false });
  assert.equal(meter.latency(), 5000);
});

test("buffering and chunk boundaries cannot alter average throughput", () => {
  for (const ticks of [[], [7999], [5000, 5250, 5500], [100, 200, 400, 8000]]) {
    const meter = new SpeedMeter();
    meter.begin(0);
    for (const t of ticks) meter.tick(t);
    assert.equal(meter.end(8000, 264), 33);
  }
});

test("a half-second delivery burst cannot turn 44000 tokens into 88000 tok/s", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  meter.tick(1000000);
  meter.tick(1000250);
  meter.tick(1000500);
  assert.equal(meter.end(1000500, 44000), 44000 / 1000.5);
});

test("a new turn immediately clears the previous rate and latency", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  meter.tick(500);
  meter.end(1000, 30);
  meter.begin(2000);
  assert.equal(meter.current(2000), null);
  assert.equal(meter.latency(), null);
});

test("failed and aborted replies never become speed samples", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  assert.equal(meter.end(1000, 30, false), null);
  assert.equal(meter.current(1000), null);
});

test("missing, nonpositive and invalid usage is not a measurement", () => {
  for (const count of [0, -1, NaN, Infinity]) {
    const meter = new SpeedMeter();
    meter.begin(0);
    assert.equal(meter.end(1000, count), null);
  }
});

test("untimed and duplicate completion events cannot create a sample", () => {
  const meter = new SpeedMeter();
  assert.equal(meter.end(1000, 30), null);
  meter.begin(1000);
  assert.equal(meter.end(2000, 30), 30);
  assert.equal(meter.end(3000, 30), null);
});

test("invalid or nonpositive elapsed time cannot create a rate", () => {
  for (const end of [0, -1, NaN, Infinity]) {
    const meter = new SpeedMeter();
    meter.begin(0);
    assert.equal(meter.end(end, 30), null);
  }
});

test("reset clears timing and output across sessions and model changes", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  meter.tick(500);
  meter.end(1000, 30);
  meter.reset();
  assert.equal(meter.current(2000), null);
  assert.equal(meter.latency(), null);
  assert.equal(meter.end(3000, 30), null);
});
