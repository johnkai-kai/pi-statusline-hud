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
