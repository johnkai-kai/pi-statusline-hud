import { test } from "node:test";
import assert from "node:assert/strict";
import { ToolTally } from "../src/collect/tools.ts";
import { AgentTracker } from "../src/collect/agents.ts";
import { formatElapsed } from "../src/collect/timing.ts";

test("ToolTally 依次數降冪排序", () => {
  const t = new ToolTally();
  for (let i = 0; i < 3; i++) t.record("read");
  for (let i = 0; i < 15; i++) t.record("bash");
  t.record("mcp");
  assert.deepEqual(t.top(7), [
    { name: "bash", count: 15 },
    { name: "read", count: 3 },
    { name: "mcp", count: 1 },
  ]);
});

test("ToolTally 遵守 limit", () => {
  const t = new ToolTally();
  for (const n of ["a", "b", "c"]) t.record(n);
  assert.equal(t.top(2).length, 2);
});

test("ToolTally 追蹤執行中的工具數", () => {
  const t = new ToolTally();
  t.running("bash");
  t.running("read");
  assert.equal(t.runningCount(), 2);
  t.finished("bash");
  assert.equal(t.runningCount(), 1);
});

test("ToolTally 對未開始就結束的工具不會變成負數", () => {
  const t = new ToolTally();
  t.finished("ghost");
  assert.equal(t.runningCount(), 0);
});

test("ToolTally reset 清空全部", () => {
  const t = new ToolTally();
  t.record("bash");
  t.running("bash");
  t.reset();
  assert.deepEqual(t.top(7), []);
  assert.equal(t.runningCount(), 0);
});

test("AgentTracker 計算存活中的 agent", () => {
  const a = new AgentTracker();
  a.start("one");
  a.start("two");
  assert.equal(a.activeCount(), 2);
  a.end("one");
  assert.equal(a.activeCount(), 1);
  a.end("unknown");
  assert.equal(a.activeCount(), 1);
});

test("formatElapsed 產生精簡的時間長度", () => {
  assert.equal(formatElapsed(0), "0m");
  assert.equal(formatElapsed(45_000), "0m");
  assert.equal(formatElapsed(60_000), "1m");
  assert.equal(formatElapsed(4_620_000), "1h17m");
  assert.equal(formatElapsed(-5), "0m");
});
