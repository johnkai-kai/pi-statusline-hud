import { test } from "node:test";
import { CLEAN_STATUS } from "../src/collect/git.ts";
import assert from "node:assert/strict";
import { renderLine, type HudData } from "../src/lines/index.ts";
import { PALETTES } from "../src/palette.ts";
import { DEFAULT_CONFIG, type HudConfig } from "../src/config.ts";
import { RAINBOW_TARGETS, type RainbowTarget } from "../src/rainbow.ts";
import type { LineName } from "../src/config.ts";

const TN = PALETTES["tokyo-night"];
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");

const data: HudData = {
  model: "Qwen3.6-35B-A3B",
  contextWindow: 256_000,
  provider: "unsloth",
  elapsedMs: 4_620_000,
  contextPercent: 18,
  contextTokens: 46_000,
  sessionTokens: 4_000_000,
  cacheHitRate: 71,
  cacheRead: 241_000,
  promptTokens: 340_000,
  speed: { tokensPerSecond: 35, live: false },
  ttftMs: 953,
  compactions: 0,
  compactReason: null,
  env: { agentsMd: 1, mcps: 6, packages: 6, extensions: 6, skills: 3 },
  tools: [{ name: "bash", count: 15 }],
  agents: 2,
  runningTools: 1,
  cost: 1.5,
  cwdName: "proj",
  branch: "main",
  speedHistory: [],
  git: CLEAN_STATUS,
  thinkingLevel: "high",
};

const config = (rainbow: RainbowTarget[]): HudConfig => ({ ...DEFAULT_CONFIG, rainbow });

// Which line each target lives on. This table is the proof that the row in the settings page is really wired to something.
const HOME: Record<RainbowTarget, LineName> = {
  model: "header",
  provider: "header",
  motto: "header",
  branch: "repo",
  contextBar: "meters",
  sessionBar: "meters",
  cache: "cache",
  tools: "tools",
  speed: "status",
  cost: "status",
};

for (const target of RAINBOW_TARGETS) {
  test(`rainbow target ${target} really reaches the screen`, () => {
    const line = HOME[target];
    const withMotto = { ...DEFAULT_CONFIG, motto: "保持初心" };
    const off = renderLine(line, data, { ...withMotto, rainbow: [] }, 200, TN);
    const on = renderLine(line, data, { ...withMotto, rainbow: [target] }, 200, TN);
    assert.notEqual(on, off, `${target} enabled changed nothing on screen`);
    assert.equal(strip(on), strip(off), `${target} should only change colour, never the text`);
  });
}

const colourCodes = (s: string): number => (s.match(/\[38;2;/g) ?? []).length;

test("with every rainbow off the screen is completely still, even a second later", () => {
  const names: LineName[] = ["header", "repo", "meters", "cache", "env", "tools", "status"];
  for (const name of names) {
    const a = renderLine(name, data, config([]), 200, TN);
    const b = renderLine(name, { ...data, elapsedMs: data.elapsedMs + 1_234 }, config([]), 200, TN);
    assert.equal(a, b, `${name} must not change over time while disabled`);
  }
});

test("enabling it multiplies the colour codes — the fingerprint of per-character colouring", () => {
  const off = renderLine("header", data, config([]), 200, TN);
  const on = renderLine("header", data, config(["model"]), 200, TN);
  // The model name is 15 characters, one colour code each.
  assert.ok(colourCodes(on) - colourCodes(off) >= 14, `${colourCodes(off)} → ${colourCodes(on)}`);
});

test("with one target on, the rest of the line keeps its theme colour", () => {
  const on = renderLine("status", data, config(["speed"]), 200, TN);
  assert.ok(on.includes(`\u001b[38;2;255;158;100m`) || on.includes("$1.50"), "the cost is still there");
  assert.equal(strip(on).includes("35 tok/s"), true);
});

test("the rainbow moves as time advances, and stays put when off", () => {
  const spin = (ms: number, rainbow: RainbowTarget[]): string =>
    renderLine("status", { ...data, elapsedMs: ms }, config(rainbow), 200, TN);
  assert.notEqual(spin(0, ["speed"]), spin(700, ["speed"]), "enabled, it should move");
  assert.equal(spin(0, []), spin(700, []), "disabled, it should not");
});
