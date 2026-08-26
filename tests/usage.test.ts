import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseUsage } from "../src/collect/usage.ts";

const entry = (usage: Record<string, number>) => ({ message: { usage } });

test("all four fields accumulate across every message", () => {
  const s = summariseUsage([
    entry({ input: 10, output: 2, cacheRead: 100, cacheWrite: 5 }),
    entry({ input: 20, output: 3, cacheRead: 200, cacheWrite: 0 }),
  ]);
  assert.equal(s.input, 30);
  assert.equal(s.output, 5);
  assert.equal(s.cacheRead, 300);
  assert.equal(s.cacheWrite, 5);
  assert.equal(s.total, 340);
});

test("the cache figures come only from the last message carrying usage", () => {
  const s = summariseUsage([
    entry({ input: 10, output: 1, cacheRead: 900, cacheWrite: 0 }),
    entry({ input: 5, output: 1, cacheRead: 45, cacheWrite: 0 }),
  ]);
  assert.equal(s.lastCacheRead, 45);
  assert.equal(s.lastPrompt, 50);
});

test("the compaction entry carries usage on itself and must not be missed", () => {
  const s = summariseUsage([{ usage: { input: 7, output: 1, cacheRead: 0, cacheWrite: 3 } }]);
  assert.equal(s.input, 7);
  assert.equal(s.lastPrompt, 10);
});

test("messages without usage are skipped and do not pollute the last one", () => {
  const s = summariseUsage([
    entry({ input: 10, output: 1, cacheRead: 40, cacheWrite: 0 }),
    { message: {} },
    {},
  ]);
  assert.equal(s.lastPrompt, 50);
  assert.equal(s.total, 51);
});

test("cost accumulates usage.cost.total", () => {
  const s = summariseUsage([
    { message: { usage: { input: 1, cost: { total: 0.25 } } } },
    { message: { usage: { input: 1, cost: { total: 0.75 } } } },
  ]);
  assert.equal(s.cost, 1);
});

test("an empty session is all zeros, not NaN", () => {
  const s = summariseUsage([]);
  assert.deepEqual(
    { ...s },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, lastCacheRead: 0, lastPrompt: 0, total: 0 },
  );
});
