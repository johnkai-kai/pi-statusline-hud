import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_SHRINK_RATIO, MIN_SHRINK_TOKENS, ShrinkTracker } from "../src/collect/shrink.ts";

test("第一筆只當基準,不算縮水", () => {
  const t = new ShrinkTracker();
  assert.equal(t.observe(50_000), false);
});

test("payload 長大不算縮水", () => {
  const t = new ShrinkTracker();
  t.observe(50_000);
  assert.equal(t.observe(60_000), false);
});

test("payload 明顯掉下去算一次", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  assert.equal(t.observe(20_000), true);
});

test("掉完之後以新的低點為基準,不會重複計數", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  t.observe(20_000);
  assert.equal(t.observe(21_000), false);
  assert.equal(t.observe(22_000), false);
});

test("比例夠但絕對量太小不算——小 session 的抖動不是剪枝", () => {
  const t = new ShrinkTracker();
  t.observe(3_000);
  assert.equal(t.observe(3_000 - MIN_SHRINK_TOKENS + 1), false);
});

test("絕對量夠但比例太小不算——大 session 少幾百 token 是正常波動", () => {
  const t = new ShrinkTracker();
  t.observe(500_000);
  const gentle = Math.round(500_000 * (1 - MIN_SHRINK_RATIO / 2));
  assert.equal(t.observe(gentle), false);
});

test("sync 只更新基準,不計數——壓縮事件已經自己記過那一次了", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  t.sync(20_000);
  assert.equal(t.observe(20_500), false);
});

test("reset 之後第一筆重新只當基準", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  t.reset();
  assert.equal(t.observe(1_000), false);
});

test("非正數與非有限值一律忽略,不會變成基準", () => {
  const t = new ShrinkTracker();
  t.observe(60_000);
  assert.equal(t.observe(0), false);
  assert.equal(t.observe(Number.NaN), false);
  assert.equal(t.observe(20_000), true, "忽略的值不該把基準洗掉");
});
