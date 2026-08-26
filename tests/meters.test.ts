import { test } from "node:test";
import assert from "node:assert/strict";
import { meterFill, formatCount } from "../src/meters.ts";

test("formatCount abbreviates large numbers", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1234), "1.2k");
  assert.equal(formatCount(340_000), "340k");
  assert.equal(formatCount(1_200_000), "1.2M");
});

test("meterFill returns a cell count, not a string", () => {
  assert.equal(meterFill(0, 24), 0);
  assert.equal(meterFill(1, 24), 24);
  assert.equal(meterFill(0.18, 24), 4);
  assert.equal(meterFill(0.34, 12), 4);
  assert.equal(meterFill(0.71, 12), 9);
});

test("meterFill clamps out-of-range ratios and widths", () => {
  assert.equal(meterFill(-3, 12), 0);
  assert.equal(meterFill(9, 12), 12);
  assert.equal(meterFill(Number.NaN, 12), 0);
  assert.equal(meterFill(0.5, 0), 0);
  assert.equal(meterFill(0.5, -2), 0);
});

test("formatCount rechecks the unit after rounding, and never emits six columns", () => {
  assert.equal(formatCount(999_500), "1.0M");
  assert.equal(formatCount(99_950), "100k");
  assert.equal(formatCount(999_500_000), "1000M");
  for (const n of [999, 1000, 99_949, 99_950, 999_499, 999_500, 1_000_000]) {
    assert.ok(formatCount(n).length <= 5, `${n} -> ${formatCount(n)} exceeds five columns`);
  }
});
