import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_SHRINK_RATIO, MIN_SHRINK_TOKENS, ShrinkTracker } from "../src/collect/shrink.ts";

test("the first sample is only a baseline, not a shrink", () => {
  const t = new ShrinkTracker();
  assert.equal(t.observe(50_000), false);
});

test("a growing payload is not a shrink", () => {
  const t = new ShrinkTracker();
  t.observe(50_000);
  assert.equal(t.observe(60_000), false);
});

test("a clear drop in payload counts once", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  assert.equal(t.observe(20_000), true);
});

test("after a drop the new low is the baseline, so it is not counted twice", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  t.observe(20_000);
  assert.equal(t.observe(21_000), false);
  assert.equal(t.observe(22_000), false);
});

test("a big enough ratio with too small an amount does not count — jitter in a small session is not pruning", () => {
  const t = new ShrinkTracker();
  t.observe(3_000);
  assert.equal(t.observe(3_000 - MIN_SHRINK_TOKENS + 1), false);
});

test("a big enough amount with too small a ratio does not count — a few hundred tokens in a big session is normal drift", () => {
  const t = new ShrinkTracker();
  t.observe(500_000);
  const gentle = Math.round(500_000 * (1 - MIN_SHRINK_RATIO / 2));
  assert.equal(t.observe(gentle), false);
});

test("sync only moves the baseline without counting — the compaction event already counted that one", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  t.sync(20_000);
  assert.equal(t.observe(20_500), false);
});

test("after reset the first sample is a baseline again", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  t.reset();
  assert.equal(t.observe(1_000), false);
});

test("non-positive and non-finite values are ignored and never become the baseline", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  assert.equal(t.observe(0), false);
  assert.equal(t.observe(Number.NaN), false);
  assert.equal(t.observe(20_000), true, "an ignored value must not wash out the baseline");
});
