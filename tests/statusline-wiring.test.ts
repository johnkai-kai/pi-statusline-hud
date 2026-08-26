import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import type { Clock } from "../src/collect/scheduler.ts";

process.env.PI_CODING_AGENT_DIR ??= tmpdir();
const { default: statuslineHud } = await import("../src/statusline.ts");

function fakeClock(): Clock & { advance(ms: number): void } {
  let time = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    setTimeout(fn, ms) {
      const handle = ++seq;
      timers.set(handle, { at: time + ms, fn });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(ms) {
      time += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(handle);
          timer.fn();
        }
      }
    },
  };
}

interface Harness {
  fire(event: string, payload?: unknown): void;
  gitCalls(): number;
  advance(ms: number): void;
}

function harness(cwd = process.cwd()): Harness {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => void>>();
  const clock = fakeClock();
  let gitCalls = 0;
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => void) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    exec() {
      gitCalls += 1;
      return Promise.resolve({ code: 0, killed: false, stdout: "", stderr: "" });
    },
    registerCommand() {},
  };
  const ctx = { cwd, hasUI: false, mode: "rpc" };
  statuslineHud(pi as never, clock);
  return {
    fire(event, payload = {}) {
      for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
    },
    gitCalls: () => gitCalls,
    advance: (ms) => clock.advance(ms),
  };
}

test("ten tool events in a row ask git once", () => {
  const h = harness();
  for (let i = 0; i < 10; i += 1) h.fire("tool_execution_end", { toolName: "bash" });
  assert.equal(h.gitCalls(), 0, "nothing should run during the debounce");
  h.advance(800);
  assert.equal(h.gitCalls(), 1);
});

test("tool events far enough apart each ask once", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.advance(800);
  h.fire("tool_execution_end", { toolName: "read" });
  h.advance(800);
  assert.equal(h.gitCalls(), 2);
});

test("git is not asked before the quiet period is up", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.advance(799);
  assert.equal(h.gitCalls(), 0);
});

test("session_shutdown cancels the schedule in flight", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.fire("session_shutdown");
  h.advance(5_000);
  assert.equal(h.gitCalls(), 0, "the session is closed; git must not be asked again");
});

test("a failed git does not stop the tool events that follow", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.advance(800);
  assert.doesNotThrow(() => {
    h.fire("tool_execution_end", { toolName: "bash" });
    h.advance(800);
  });
  assert.equal(h.gitCalls(), 2);
});

interface RenderHarness extends Harness {
  lines(): string[];
}

// A fixture that really installs the footer and really renders once. The set above only counts
// git calls and cannot see whether an event becomes text on screen — which is the one thing
// this wiring can get wrong.
function renderHarness(options: {
  thinkingLevel?: string;
  breakRender?: boolean;
  entries?: unknown[];
} = {}): RenderHarness {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => void>>();
  const clock = fakeClock();
  let gitCalls = 0;
  let footer: { render(width: number): string[] } | undefined;
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => void) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    exec() {
      gitCalls += 1;
      return Promise.resolve({ code: 0, killed: false, stdout: "", stderr: "" });
    },
    registerCommand() {},
  };
  const ctx = {
    cwd: process.cwd(),
    hasUI: true,
    mode: "tui",
    thinkingLevel: options.thinkingLevel,
    model: { id: "test-model", provider: "test", contextWindow: 200_000 },
    getContextUsage: () => {
      if (options.breakRender) throw new Error("usage exploded");
      return { tokens: 1000, contextWindow: 200_000, percent: 5 };
    },
    sessionManager: { getEntries: () => options.entries ?? [] },
    ui: {
      setFooter(factory: (tui: unknown, theme: unknown, footerData: unknown) => unknown) {
        footer = factory(
          { requestRender() {} },
          { getFgAnsi: () => "\u001b[38;2;200;200;200m" },
          { getGitBranch: () => "master" },
        ) as { render(width: number): string[] };
      },
      setWidget() {},
      notify() {},
    },
  };
  statuslineHud(pi as never, clock);
  return {
    fire(event, payload = {}) {
      for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
    },
    gitCalls: () => gitCalls,
    advance: (ms) => clock.advance(ms),
    lines: () => (footer?.render(200) ?? []).map((line) => line.replace(ANSI, "")),
  };
}

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;

test("a reported tool failure reaches the tools line", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("tool_execution_start", { toolName: "bash" });
  h.fire("tool_execution_end", { toolName: "bash", isError: true });
  h.fire("tool_execution_start", { toolName: "bash" });
  h.fire("tool_execution_end", { toolName: "bash", isError: false });
  const tools = h.lines().find((line) => line.startsWith("Tools"));
  assert.ok(tools?.includes("bash \u00d72 !1"), `tools line is "${tools}"`);
});

test("compaction events accumulate and the last reason is remembered", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("session_compact", { reason: "manual" });
  h.fire("session_compact", { reason: "overflow" });
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21932"), `meters line is "${meters}"`);
});

test("a new session resets the compaction count", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("session_compact", { reason: "threshold" });
  h.fire("session_start");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(!meters?.includes("\u2193"), `meters line is "${meters}"`);
});

test("thinking effort comes from the ctx of the moment", () => {
  const h = renderHarness({ thinkingLevel: "xhigh" });
  h.fire("session_start");
  assert.ok(h.lines()[0]?.includes("xhigh"), `header is "${h.lines()[0]}"`);
});

test("a blown render still returns an empty array, and the error lands in the debug file", async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const file = join(mkdtempSync(join(tmpdir(), "hud-wire-")), "hud.log");
  process.env.PI_HUD_DEBUG = file;
  try {
    const h = renderHarness({ breakRender: true });
    h.fire("session_start");
    assert.deepEqual(h.lines(), []);
    assert.match(readFileSync(file, "utf-8"), /usage exploded/);
  } finally {
    delete process.env.PI_HUD_DEBUG;
  }
});

const withPrompt = (prompt: number) => ({
  message: { usage: { input: prompt, output: 10, cacheRead: 0, cacheWrite: 0 } },
});

test("a shrunk payload counts once whoever shrank it — with no session_compact too", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("turn_end");
  entries.push(withPrompt(20_000));
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `meters line is "${meters}"`);
});

test("a payload that only grows is never misreported", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  for (const prompt of [10_000, 30_000, 90_000]) {
    entries.push(withPrompt(prompt));
    h.fire("turn_end");
  }
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(!meters?.includes("\u2193"), `meters line is "${meters}"`);
});

test("the payload drop after a built-in compaction is not counted twice", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("turn_end");
  h.fire("session_compact", { reason: "threshold" });
  entries.push(withPrompt(20_000));
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `meters line is "${meters}"`);
  assert.ok(!meters?.includes("\u21932"), "the same compaction was counted twice");
});

test("switching branches is not a shrink — a shorter branch is not compaction", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(80_000));
  h.fire("turn_end");
  // fork / branch switch: a much shorter history takes over.
  entries.length = 0;
  entries.push(withPrompt(9_000));
  h.fire("session_tree");
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(!meters?.includes("\u2193"), `meters line is "${meters}"`);
});

test("a mid-turn shrink is caught too, without waiting for turn_end", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("message_end", { message: { role: "assistant" } });
  entries.push(withPrompt(15_000));
  h.fire("message_end", { message: { role: "assistant" } });
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `meters line is "${meters}"`);
});

test("one shrink seen by both message_end and turn_end is not counted twice", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("message_end", { message: { role: "assistant" } });
  entries.push(withPrompt(15_000));
  h.fire("message_end", { message: { role: "assistant" } });
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `meters line is "${meters}"`);
  assert.ok(!meters?.includes("\u21932"), "the same shrink was counted twice");
});

/** The status line starts with U+25B6 U+25B6. Do not look for "agents" — that group vanishes at zero. */
const STATUS_LEAD = "▶▶";

/** One text_delta event mid-stream. */
const delta = { assistantMessageEvent: { type: "text_delta", delta: "x" } };

test("deltas mid-stream become a live speed on the status line", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("message_start", { message: { role: "assistant" } });
  for (let i = 0; i < 20; i += 1) {
    h.advance(50);
    h.fire("message_update", delta);
  }
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.match(status ?? "", /~\d+ tok\/s/, `status line is "${status}"`);
});

test("once the message lands it becomes the exact value, with no tilde", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  h.fire("message_start", { message: { role: "assistant" } });
  for (let i = 0; i < 20; i += 1) {
    h.advance(50);
    h.fire("message_update", delta);
  }
  h.fire("message_end", { message: { role: "assistant", usage: { output: 40 } } });
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.match(status ?? "", /\d+ tok\/s/, `status line is "${status}"`);
  assert.ok(!status?.includes("~"), `it should not still be an estimate after landing: "${status}"`);
});

test("after two messages land, the status line can draw a speed trend", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  // Both must span MIN_SPAN_MS, or the second is unmeasurable and the history holds one entry.
  for (const gap of [50, 30]) {
    h.fire("message_start", { message: { role: "assistant" } });
    for (let i = 0; i < 20; i += 1) {
      h.advance(gap);
      h.fire("message_update", delta);
    }
    h.fire("message_end", { message: { role: "assistant", usage: { output: 40 } } });
  }
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.match(status ?? "", /[▁-█]{2}/, `status line is "${status}"`);
});

test("a user message is not mistaken for generation — it has no speed", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("message_start", { message: { role: "user" } });
  for (let i = 0; i < 20; i += 1) {
    h.advance(50);
    h.fire("message_update", delta);
  }
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.ok(!status?.includes("tok/s"), `status line is "${status}"`);
});

test("a new session zeroes the speed", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("message_start", { message: { role: "assistant" } });
  for (let i = 0; i < 20; i += 1) {
    h.advance(50);
    h.fire("message_update", delta);
  }
  h.fire("message_end", { message: { role: "assistant", usage: { output: 40 } } });
  h.fire("session_start");
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.ok(!status?.includes("tok/s"), `status line is "${status}"`);
});
