import { test } from "node:test";
import assert from "node:assert/strict";
import { ToolTally } from "../src/collect/tools.ts";
import { AgentTracker } from "../src/collect/agents.ts";
import { formatElapsed } from "../src/collect/timing.ts";
import { type EnvCounts, sameCounts } from "../src/collect/env.ts";

test("ToolTally sorts by count, descending", () => {
  const t = new ToolTally();
  for (let i = 0; i < 3; i++) t.record("read");
  for (let i = 0; i < 15; i++) t.record("bash");
  t.record("mcp");
  assert.deepEqual(t.top(7), [
    { name: "bash", count: 15, errors: 0 },
    { name: "read", count: 3, errors: 0 },
    { name: "mcp", count: 1, errors: 0 },
  ]);
});

test("ToolTally honours limit", () => {
  const t = new ToolTally();
  for (const n of ["a", "b", "c"]) t.record(n);
  assert.equal(t.top(2).length, 2);
});

test("ToolTally tracks how many tools are running", () => {
  const t = new ToolTally();
  t.running("bash");
  t.running("read");
  assert.equal(t.runningCount(), 2);
  t.finished("bash");
  assert.equal(t.runningCount(), 1);
});

test("ToolTally does not go negative for a tool that ends without starting", () => {
  const t = new ToolTally();
  t.finished("ghost");
  assert.equal(t.runningCount(), 0);
});

test("ToolTally reset clears everything", () => {
  const t = new ToolTally();
  t.record("bash");
  t.running("bash");
  t.reset();
  assert.deepEqual(t.top(7), []);
  assert.equal(t.runningCount(), 0);
});

test("AgentTracker counts the live agents", () => {
  const a = new AgentTracker();
  a.start("one");
  a.start("two");
  assert.equal(a.activeCount(), 2);
  a.end("one");
  assert.equal(a.activeCount(), 1);
  a.end("unknown");
  assert.equal(a.activeCount(), 1);
});

test("formatElapsed produces a compact duration", () => {
  assert.equal(formatElapsed(0), "0m");
  assert.equal(formatElapsed(45_000), "0m");
  assert.equal(formatElapsed(60_000), "1m");
  assert.equal(formatElapsed(4_620_000), "1h17m");
  assert.equal(formatElapsed(-5), "0m");
});

test("sameCounts is true only when all five fields match", () => {
  const base: EnvCounts = { agentsMd: 1, mcps: 2, packages: 10, extensions: 11, skills: 11 };
  assert.equal(sameCounts(base, { ...base }), true);
  for (const key of ["agentsMd", "mcps", "packages", "extensions", "skills"] as const) {
    assert.equal(
      sameCounts(base, { ...base, [key]: base[key] + 1 }),
      false,
      `${key} changed but was reported unchanged`,
    );
  }
});

test("ToolTally records successes and failures separately", () => {
  const t = new ToolTally();
  t.record("bash");
  t.record("bash", true);
  t.record("read");
  assert.deepEqual(t.top(7), [
    { name: "bash", count: 2, errors: 1 },
    { name: "read", count: 1, errors: 0 },
  ]);
});

test("ToolTally reset clears the failure counts too", () => {
  const t = new ToolTally();
  t.record("bash", true);
  t.reset();
  t.record("bash");
  assert.deepEqual(t.top(7), [{ name: "bash", count: 1, errors: 0 }]);
});
