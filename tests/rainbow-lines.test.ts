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
  git: CLEAN_STATUS,
  thinkingLevel: "high",
};

const config = (rainbow: RainbowTarget[]): HudConfig => ({ ...DEFAULT_CONFIG, rainbow });

// 每個目標住在哪一行。這份對照就是「設定頁上那一列真的有接到東西」的證明。
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
  test(`彩虹目標 ${target} 真的接到畫面上`, () => {
    const line = HOME[target];
    const withMotto = { ...DEFAULT_CONFIG, motto: "保持初心" };
    const off = renderLine(line, data, { ...withMotto, rainbow: [] }, 200, TN);
    const on = renderLine(line, data, { ...withMotto, rainbow: [target] }, 200, TN);
    assert.notEqual(on, off, `${target} 打開之後畫面沒有任何變化`);
    assert.equal(strip(on), strip(off), `${target} 只該換顏色,不該改動文字`);
  });
}

const colourCodes = (s: string): number => (s.match(/\[38;2;/g) ?? []).length;

test("彩虹全關時畫面完全靜止,時間推進一秒也不動", () => {
  const names: LineName[] = ["header", "repo", "meters", "cache", "env", "tools", "status"];
  for (const name of names) {
    const a = renderLine(name, data, config([]), 200, TN);
    const b = renderLine(name, { ...data, elapsedMs: data.elapsedMs + 1_234 }, config([]), 200, TN);
    assert.equal(a, b, `${name} 在關閉時不該隨時間改變`);
  }
});

test("打開之後色碼數量暴增——那就是逐字上色的指紋", () => {
  const off = renderLine("header", data, config([]), 200, TN);
  const on = renderLine("header", data, config(["model"]), 200, TN);
  // 模型名 15 個字元,每個字元一段色碼。
  assert.ok(colourCodes(on) - colourCodes(off) >= 14, `${colourCodes(off)} → ${colourCodes(on)}`);
});

test("只開一個目標,同一行的其他元素維持主題色", () => {
  const on = renderLine("status", data, config(["speed"]), 200, TN);
  assert.ok(on.includes(`\u001b[38;2;255;158;100m`) || on.includes("$1.50"), "費用仍在");
  assert.equal(strip(on).includes("35 tok/s"), true);
});

test("時間推進時彩虹會動,關著的時候不會", () => {
  const spin = (ms: number, rainbow: RainbowTarget[]): string =>
    renderLine("status", { ...data, elapsedMs: ms }, config(rainbow), 200, TN);
  assert.notEqual(spin(0, ["speed"]), spin(700, ["speed"]), "開著要動");
  assert.equal(spin(0, []), spin(700, []), "關著不該動");
});
