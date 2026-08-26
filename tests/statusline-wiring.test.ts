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

test("連發十個工具事件,只問一次 git", () => {
  const h = harness();
  for (let i = 0; i < 10; i += 1) h.fire("tool_execution_end", { toolName: "bash" });
  assert.equal(h.gitCalls(), 0, "去抖動期間不該先跑");
  h.advance(800);
  assert.equal(h.gitCalls(), 1);
});

test("工具事件之間隔得夠開,就各問一次", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.advance(800);
  h.fire("tool_execution_end", { toolName: "read" });
  h.advance(800);
  assert.equal(h.gitCalls(), 2);
});

test("安靜期未滿不會問 git", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.advance(799);
  assert.equal(h.gitCalls(), 0);
});

test("session_shutdown 取消在飛的排程", () => {
  const h = harness();
  h.fire("tool_execution_end", { toolName: "bash" });
  h.fire("session_shutdown");
  h.advance(5_000);
  assert.equal(h.gitCalls(), 0, "session 已經關掉,不該再去問 git");
});

test("工具事件不會因為 git 失敗就中斷後續", () => {
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

// footer 真的裝起來、真的渲染一次的接線用夾具。上面那組只數 git 呼叫次數,
// 看不到「事件有沒有變成畫面上的字」——而這正是接線唯一會錯的地方。
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

test("工具回報失敗會走到工具行上", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("tool_execution_start", { toolName: "bash" });
  h.fire("tool_execution_end", { toolName: "bash", isError: true });
  h.fire("tool_execution_start", { toolName: "bash" });
  h.fire("tool_execution_end", { toolName: "bash", isError: false });
  const tools = h.lines().find((line) => line.startsWith("Tools"));
  assert.ok(tools?.includes("bash \u00d72 !1"), `工具行是「${tools}」`);
});

test("壓縮事件會累加,並記住最後一次的理由", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("session_compact", { reason: "manual" });
  h.fire("session_compact", { reason: "overflow" });
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21932"), `計量行是「${meters}」`);
});

test("新 session 開始時壓縮次數歸零", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("session_compact", { reason: "threshold" });
  h.fire("session_start");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(!meters?.includes("\u2193"), `計量行是「${meters}」`);
});

test("思考檔位取自事件當下的 ctx", () => {
  const h = renderHarness({ thinkingLevel: "xhigh" });
  h.fire("session_start");
  assert.ok(h.lines()[0]?.includes("xhigh"), `抬頭是「${h.lines()[0]}」`);
});

test("渲染爆掉時仍回空陣列,但錯誤會落到除錯檔", async () => {
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

test("payload 縮水就算一次,不管是誰縮的——沒有 session_compact 也算", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("turn_end");
  entries.push(withPrompt(20_000));
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `計量行是「${meters}」`);
});

test("payload 一路長大不會誤報", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  for (const prompt of [10_000, 30_000, 90_000]) {
    entries.push(withPrompt(prompt));
    h.fire("turn_end");
  }
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(!meters?.includes("\u2193"), `計量行是「${meters}」`);
});

test("內建壓縮之後那次 payload 下降不重複計數", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("turn_end");
  h.fire("session_compact", { reason: "threshold" });
  entries.push(withPrompt(20_000));
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `計量行是「${meters}」`);
  assert.ok(!meters?.includes("\u21932"), "同一次壓縮被數了兩遍");
});

test("切分支不算縮水——換一條比較短的分支不是壓縮", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(80_000));
  h.fire("turn_end");
  // fork / 切分支:換成另一條短很多的歷史。
  entries.length = 0;
  entries.push(withPrompt(9_000));
  h.fire("session_tree");
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(!meters?.includes("\u2193"), `計量行是「${meters}」`);
});

test("回合中途就縮的也算得到,不必等 turn_end", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("message_end", { message: { role: "assistant" } });
  entries.push(withPrompt(15_000));
  h.fire("message_end", { message: { role: "assistant" } });
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `計量行是「${meters}」`);
});

test("同一次縮水不會因為 message_end 與 turn_end 都看到就數兩遍", () => {
  const entries: unknown[] = [];
  const h = renderHarness({ entries });
  h.fire("session_start");
  entries.push(withPrompt(60_000));
  h.fire("message_end", { message: { role: "assistant" } });
  entries.push(withPrompt(15_000));
  h.fire("message_end", { message: { role: "assistant" } });
  h.fire("turn_end");
  const meters = h.lines().find((line) => line.startsWith("Context"));
  assert.ok(meters?.includes("\u21931"), `計量行是「${meters}」`);
  assert.ok(!meters?.includes("\u21932"), "同一次縮水被數了兩遍");
});

/** status 行以 U+25B6 U+25B6 開頭。不要拿「agents」去找它——那一項為零時整組不畫。 */
const STATUS_LEAD = "▶▶";

/** 串流中的一個 text_delta 事件。 */
const delta = { assistantMessageEvent: { type: "text_delta", delta: "x" } };

test("串流中的 delta 會變成 status 行上的即時速度", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("message_start", { message: { role: "assistant" } });
  for (let i = 0; i < 20; i += 1) {
    h.advance(50);
    h.fire("message_update", delta);
  }
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.match(status ?? "", /~\d+ tok\/s/, `狀態行是「${status}」`);
});

test("訊息落地後換成精確值,不再帶波浪號", () => {
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
  assert.match(status ?? "", /\d+ tok\/s/, `狀態行是「${status}」`);
  assert.ok(!status?.includes("~"), `落地後不該還是估計值:「${status}」`);
});

test("使用者訊息不會被當成生成——那沒有速度可言", () => {
  const h = renderHarness();
  h.fire("session_start");
  h.fire("message_start", { message: { role: "user" } });
  for (let i = 0; i < 20; i += 1) {
    h.advance(50);
    h.fire("message_update", delta);
  }
  const status = h.lines().find((line) => line.startsWith(STATUS_LEAD));
  assert.ok(!status?.includes("tok/s"), `狀態行是「${status}」`);
});

test("新 session 把速度歸零", () => {
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
  assert.ok(!status?.includes("tok/s"), `狀態行是「${status}」`);
});
