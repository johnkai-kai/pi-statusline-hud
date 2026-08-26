import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseUsage } from "../src/collect/usage.ts";

const entry = (usage: Record<string, number>) => ({ message: { usage } });

test("四個欄位跨全部訊息累加", () => {
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

test("快取指標只看最後一則有 usage 的訊息", () => {
  const s = summariseUsage([
    entry({ input: 10, output: 1, cacheRead: 900, cacheWrite: 0 }),
    entry({ input: 5, output: 1, cacheRead: 45, cacheWrite: 0 }),
  ]);
  assert.equal(s.lastCacheRead, 45);
  assert.equal(s.lastPrompt, 50);
});

test("壓縮那筆的 usage 掛在 entry 自己身上,不能漏掉", () => {
  const s = summariseUsage([{ usage: { input: 7, output: 1, cacheRead: 0, cacheWrite: 3 } }]);
  assert.equal(s.input, 7);
  assert.equal(s.lastPrompt, 10);
});

test("沒有 usage 的訊息直接跳過,不會污染最後一則", () => {
  const s = summariseUsage([
    entry({ input: 10, output: 1, cacheRead: 40, cacheWrite: 0 }),
    { message: {} },
    {},
  ]);
  assert.equal(s.lastPrompt, 50);
  assert.equal(s.total, 51);
});

test("成本取 usage.cost.total 累加", () => {
  const s = summariseUsage([
    { message: { usage: { input: 1, cost: { total: 0.25 } } } },
    { message: { usage: { input: 1, cost: { total: 0.75 } } } },
  ]);
  assert.equal(s.cost, 1);
});

test("空 session 全部是 0,不是 NaN", () => {
  const s = summariseUsage([]);
  assert.deepEqual(
    { ...s },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, lastCacheRead: 0, lastPrompt: 0, total: 0 },
  );
});
