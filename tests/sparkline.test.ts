import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_SIZE, History } from "../src/collect/history.ts";
import { SPARK_CHARS, sparkline } from "../src/lines/sparkline.ts";

const LOW = SPARK_CHARS[0];
const MID = SPARK_CHARS[3];
const HIGH = SPARK_CHARS[SPARK_CHARS.length - 1];

test("one point has no trend — fewer than two draws nothing", () => {
  assert.equal(sparkline([]), "");
  assert.equal(sparkline([42]), "");
});

test("the minimum sits at the bottom and the maximum at the top — the scale is relative to the window", () => {
  const line = sparkline([10, 20, 30]);
  assert.equal(line.length, 3);
  assert.equal(line[0], LOW);
  assert.equal(line[2], HIGH);
});

test("relative scale: a slow stretch still shows its shape instead of flatlining", () => {
  // An absolute scale (200 tok/s as full) makes a local model's 3 to 5 indistinguishable.
  const local = sparkline([3, 4, 5]);
  const cloud = sparkline([120, 160, 200]);
  assert.equal(local, cloud, "the same relative shape should draw the same figure");
});

test("an all-equal run draws a flat line, not a blank or a full bar", () => {
  assert.equal(sparkline([33, 33, 33]), MID.repeat(3));
});

test("only the most recent few are drawn; older ones roll out", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(sparkline(values, 4).length, 4);
  assert.equal(sparkline(values, 4)[3], HIGH);
});

test("History is a fixed-length ring buffer that evicts the oldest when full", () => {
  const history = new History(3);
  history.push(1);
  history.push(2);
  history.push(3);
  history.push(4);
  assert.deepEqual(history.recent(), [2, 3, 4]);
});

test("History rejects non-numbers and non-positive values — those are not speeds", () => {
  const history = new History(4);
  history.push(Number.NaN);
  history.push(Infinity);
  history.push(0);
  history.push(-5);
  history.push(33);
  assert.deepEqual(history.recent(), [33]);
});

test("History reset empties it", () => {
  const history = new History();
  history.push(10);
  history.reset();
  assert.deepEqual(history.recent(), []);
});

test("the default length and the sparkline's default cell count are the same constant", () => {
  assert.ok(HISTORY_SIZE >= 4);
  const history = new History();
  for (let i = 0; i < HISTORY_SIZE * 2; i += 1) history.push(i + 1);
  assert.equal(history.recent().length, HISTORY_SIZE);
  assert.equal(sparkline(history.recent()).length, HISTORY_SIZE);
});
