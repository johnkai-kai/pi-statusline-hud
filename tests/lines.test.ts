import { test } from "node:test";
import assert from "node:assert/strict";
import { renderLine, renderHud, type HudData } from "../src/lines/index.ts";
import { displayWidth, truncate, LABEL_WIDTH } from "../src/lines/types.ts";
import { PALETTES, paint, visibleLength } from "../src/palette.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

const TN = PALETTES["tokyo-night"];
const MONO = PALETTES.mono;
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");
const BLOCK = "\u2588";
const TRACK = "\u2591";

const data: HudData = {
  model: "Qwen3.6-35B-A3B",
  contextWindow: 256_000,
  provider: "unsloth",
  elapsedMs: 4_620_000,
  contextPercent: 18,
  contextTokens: 46_000,
  sessionTokens: 340_000,
  cacheHitRate: 71,
  cacheRead: 241_000,
  promptTokens: 340_000,
  speed: null,
  compactions: 0,
  compactReason: null,
  env: { agentsMd: 1, mcps: 6, packages: 6, extensions: 6, skills: 3 },
  tools: [
    { name: "bash", count: 15 },
    { name: "read", count: 3 },
  ],
  agents: 2,
  runningTools: 1,
  cost: 0,
  cwdName: "proj",
  branch: "main",
  dirty: false,
};

test("header 含模型、窗口、provider 與耗時", () => {
  const line = strip(renderLine("header", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /Qwen3\.6-35B-A3B/);
  assert.match(line, /256k/);
  assert.match(line, /unsloth/);
  assert.match(line, /1h17m/);
});

test("motto 為空時 header 的左段只留兩個分隔符", () => {
  const line = strip(renderLine("header", data, { ...DEFAULT_CONFIG, motto: "" }, 200, MONO));
  assert.equal((line.match(/\u2502/g) ?? []).length, 2);
});

test("motto 非空時 header 多一個分隔符並帶出 motto", () => {
  const line = strip(
    renderLine("header", data, { ...DEFAULT_CONFIG, motto: "keep going" }, 200, MONO),
  );
  assert.match(line, /keep going/);
  assert.equal((line.match(/\u2502/g) ?? []).length, 3);
});

test("header 把 repo 右對齊到終端寬度尾端", () => {
  const line = renderLine("header", data, DEFAULT_CONFIG, 100, MONO);
  assert.equal(visibleLength(line), 100);
  assert.ok(strip(line).endsWith("proj git:(main)"));
});

test("header 在 motto 很長時仍保住右側 repo 段", () => {
  const config = { ...DEFAULT_CONFIG, motto: "x".repeat(40) };
  const line = renderLine("header", data, config, 80, MONO);
  assert.equal(visibleLength(line), 80);
  assert.ok(strip(line).endsWith("git:(main)"), `右段被吃掉:${strip(line)}`);
});

test("header 的右對齊完全貼到右邊界(逐欄比對字面值)", () => {
  const line = renderLine("header", data, { ...DEFAULT_CONFIG, motto: "go" }, 100, MONO);
  const left =
    "[Qwen3.6-35B-A3B \u00b7 256k] \u2502 unsloth \u2502 \u23f1\ufe0f 1h17m \u2502 go";
  const right = "proj git:(main)";
  assert.equal(line, left + " ".repeat(100 - 50 - 15) + right);
});

test("header 的 motto 含 emoji 時仍不超寬", () => {
  for (const width of [80, 100, 120]) {
    const config = { ...DEFAULT_CONFIG, motto: "\u2705 ship it \u26a1" };
    const line = renderLine("header", data, config, width, MONO);
    assert.equal(visibleLength(line), width, `width=${width}`);
    assert.ok(strip(line).endsWith("proj git:(main)"), `width=${width} 右段被吃掉`);
  }
});

test("header 在 lines 未含 repo 時不附加 repo 段", () => {
  const config = { ...DEFAULT_CONFIG, lines: ["header" as const] };
  const line = strip(renderLine("header", data, config, 200, MONO));
  assert.ok(!line.includes("git:("));
  assert.ok(!line.includes("proj"));
});

test("header 的模型名與窗口塗 cyan、provider 塗 orange", () => {
  const line = renderLine("header", data, DEFAULT_CONFIG, 200, TN);
  assert.ok(line.includes(paint(TN.cyan, "Qwen3.6-35B-A3B")));
  assert.ok(line.includes(paint(TN.cyan, "256k")));
  assert.ok(line.includes(paint(TN.orange, "unsloth")));
});

test("meters 一行同時顯示 context、session 與 cache", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /Context/);
  assert.match(line, /18%/);
  assert.match(line, /Session/);
  assert.match(line, /340k/);
  assert.match(line, /Cache/);
  assert.match(line, /71% 241k\/340k/);
});

test("meters 在 lines 未含 cache 時不附加 cache 組", () => {
  const config = { ...DEFAULT_CONFIG, lines: ["meters" as const] };
  const line = strip(renderLine("meters", data, config, 200, MONO));
  assert.ok(!line.includes("Cache"));
  assert.ok(!line.includes("241k/340k"));
});

test("contextPercent 為 null 時顯示佔位符而非 NaN", () => {
  const line = strip(
    renderLine("meters", { ...data, contextPercent: null }, DEFAULT_CONFIG, 200, TN),
  );
  assert.ok(!line.includes("NaN"));
  assert.match(line, /--/);
});

test("cache 單獨成行時顯示命中率", () => {
  const line = strip(renderLine("cache", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /71%/);
  assert.ok(line.startsWith("Cache "));
});

test("env 列出四項計數", () => {
  const line = strip(renderLine("env", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /1 AGENTS\.md/);
  assert.match(line, /6 MCPs/);
  assert.match(line, /6 exts/);
  assert.match(line, /3 skills/);
});

test("tools 遵守 maxToolEntries", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `t${i}`, count: 10 - i }));
  const line = strip(
    renderLine("tools", { ...data, tools: many }, { ...DEFAULT_CONFIG, maxToolEntries: 3 }, 500, TN),
  );
  assert.equal(line.split("\u00b7").length, 3);
});

test("tools 無資料時顯示佔位符,保持行數固定", () => {
  const line = strip(renderLine("tools", { ...data, tools: [] }, DEFAULT_CONFIG, 200, TN));
  assert.ok(line.startsWith("Tools "));
  assert.equal(line.trimEnd(), "Tools —");
});

test("status 顯示 agent 數、執行中工具數與花費", () => {
  const line = strip(renderLine("status", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /2 agents/);
  assert.match(line, /1 running/);
  assert.match(line, /\$0\.00/);
});

test("第 3-5 行的標籤內嵌在段落裡,行首不再補白成一欄", () => {
  const env = strip(renderLine("env", data, DEFAULT_CONFIG, 200, TN));
  const tools = strip(renderLine("tools", data, DEFAULT_CONFIG, 200, TN));
  const status = strip(renderLine("status", data, DEFAULT_CONFIG, 200, TN));
  assert.equal(LABEL_WIDTH, 0);
  assert.ok(env.startsWith("Env "));
  assert.ok(!env.startsWith("Env       "));
  assert.ok(tools.startsWith("Tools "));
  assert.ok(!tools.startsWith("Tools     "));
  assert.ok(status.startsWith("\u25b6\u25b6 "));
  assert.ok(!status.startsWith("\u25b6\u25b6        "));
});

test("meters 的進度條格數在 width=300(adaptiveCells=10)為 10 / 10 / 10 並依角色上色", () => {
  const line = renderLine("meters", data, DEFAULT_CONFIG, 300, TN);
  assert.ok(line.includes(paint(TN.green, BLOCK.repeat(2))), "context 應有 2 格 green");
  assert.ok(line.includes(paint(TN.track, TRACK.repeat(8))), "context 應有 8 格 track");
  assert.ok(line.includes(paint(TN.track, TRACK.repeat(10))), "session 應有 10 格 track(填滿比例趨近 0)");
  assert.ok(line.includes(paint(TN.cyan, BLOCK.repeat(7))), "cache 應有 7 格 cyan");
  assert.ok(line.includes(paint(TN.track, TRACK.repeat(3))), "cache 應有 3 格 track");
  const cells = strip(line);
  assert.equal(cells.split(BLOCK).length - 1 + (cells.split(TRACK).length - 1), 30);
});

test("sessionBudget 變小時 session 條填滿格數增加", () => {
  const line = renderLine("meters", data, { ...DEFAULT_CONFIG, sessionBudget: 500_000 }, 300, TN);
  assert.ok(line.includes(paint(TN.blue, BLOCK.repeat(7))));
});

test("context 進度條依門檻換色:69 green、70 與 90 amber、91 red", () => {
  const tinted = (percent: number, color: string | null): boolean =>
    renderLine("meters", { ...data, contextPercent: percent }, DEFAULT_CONFIG, 300, TN).includes(
      paint(color, `${percent.toFixed(0)}%`),
    );
  assert.ok(tinted(69, TN.green));
  assert.ok(tinted(70, TN.amber));
  assert.ok(tinted(90, TN.amber));
  assert.ok(tinted(91, TN.red));
});

test("本地零花費以 dim 顯示且不帶 emoji,雲端花費以 amber 顯示並前置 emoji", () => {
  const local = renderLine("status", data, DEFAULT_CONFIG, 200, TN);
  assert.ok(local.includes(paint(TN.dim, "$0.00")));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(local));
  const cloud = renderLine("status", { ...data, cost: 1.25 }, DEFAULT_CONFIG, 200, TN);
  assert.ok(cloud.includes(paint(TN.amber, "$1.25")));
  assert.ok(strip(cloud).includes("\ud83d\udcb8 $1.25"));
});

test("icons 關閉時即使在雲端計費也不出現 emoji", () => {
  const plain = { ...DEFAULT_CONFIG, icons: false };
  const line = renderLine("status", { ...data, cost: 1.25 }, plain, 200, TN);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(line));
  assert.ok(line.includes(paint(TN.amber, "$1.25")));
});

test("寬度不足時整組丟棄,不在組中間切斷", () => {
  const meters = renderLine("meters", data, DEFAULT_CONFIG, 40, MONO);
  assert.equal(meters, meters.trimEnd());
  assert.ok(!meters.includes("Cache"));
  assert.ok(meters.endsWith("340k"));
  const header = renderLine("header", data, DEFAULT_CONFIG, 60, MONO);
  assert.ok(header.includes("[Qwen3.6-35B-A3B \u00b7 256k]"));
  assert.ok(header.includes("unsloth"));
  assert.ok(!header.includes("\u23f1"));
  assert.ok(header.endsWith("proj git:(main)"));
  const tools = renderLine("tools", data, DEFAULT_CONFIG, 20, MONO);
  assert.equal(tools, "Tools \u221a bash \u00d715");
});

test("間距常數:分隔一格、計量組以豎線分隔、條與數值一格", () => {
  const meters = renderLine("meters", data, DEFAULT_CONFIG, 300, MONO);
  assert.ok(meters.includes("\u2591 18% 46.0k/256k \u2502 Session"));
  assert.ok(meters.includes("340k/10.0M \u2502 Cache"));
  assert.ok(meters.includes("\u2591 71% 241k/340k"));
  const env = renderLine("env", data, DEFAULT_CONFIG, 200, MONO);
  assert.ok(env.includes("1 AGENTS.md \u00b7 6 MCPs"));
  const header = renderLine("header", data, DEFAULT_CONFIG, 200, MONO);
  assert.ok(header.includes("] \u2502 unsloth \u2502 "));
});

test("cacheHitRate 為 null 時顯示佔位符而非 NaN", () => {
  const line = strip(renderLine("meters", { ...data, cacheHitRate: null }, DEFAULT_CONFIG, 300, TN));
  assert.ok(!line.includes("NaN"));
  assert.match(line, /--%/);
  assert.ok(!line.includes("241k/340k"));
});

test("Env 整列、agents/running 整項、cache 百分比與絕對值各自同色", () => {
  const env = renderLine("env", data, DEFAULT_CONFIG, 200, TN);
  assert.ok(env.includes(paint(TN.dim, "1 AGENTS.md")));
  assert.ok(env.includes(paint(TN.dim, "3 skills")));
  const status = renderLine("status", data, DEFAULT_CONFIG, 200, TN);
  assert.ok(status.includes(paint(TN.fg, "2 agents")));
  assert.ok(status.includes(paint(TN.fg, "1 running")));
  const meters = renderLine("meters", data, DEFAULT_CONFIG, 300, TN);
  assert.ok(meters.includes(paint(TN.cyan, "71%")));
  assert.ok(meters.includes(paint(TN.cyan, "241k/340k")));
});

test("三個計量組都並列百分比與絕對值", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 300, TN));
  assert.match(line, /Context [\u2588\u2591]+ 18% 46\.0k\/256k/);
  assert.match(line, /Session [\u2588\u2591]+ 340k\/10\.0M/);
  assert.match(line, /Cache [\u2588\u2591]+ 71% 241k\/340k/);
});

test("contextPercent 為 null 時整段絕對值消失而不是 0/0", () => {
  const line = strip(
    renderLine(
      "meters",
      { ...data, contextPercent: null, contextTokens: 0 },
      DEFAULT_CONFIG,
      300,
      TN,
    ),
  );
  assert.ok(!line.includes("0/0"));
  assert.ok(!line.includes("/256k"));
  assert.match(line, /--%/);
});

test("cacheHitRate 為 null 時整段絕對值消失而不是 0/0", () => {
  const line = strip(
    renderLine(
      "meters",
      { ...data, cacheHitRate: null, cacheRead: 0, promptTokens: 0 },
      DEFAULT_CONFIG,
      300,
      TN,
    ),
  );
  assert.ok(!line.includes("0/0"));
  assert.match(line, /Cache [\u2588\u2591]+ --%/);
});

test("contextWindow 為 0 時不印出以 0 為分母的絕對值", () => {
  const line = strip(
    renderLine("meters", { ...data, contextWindow: 0 }, DEFAULT_CONFIG, 300, TN),
  );
  assert.ok(!line.includes("/0"));
  assert.match(line, /Context [\u2588\u2591]+ 18% \u2502 Session/);
});

test("寬度不足時絕對值先被丟棄,百分比仍在", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 55, MONO));
  assert.match(line, /Context/);
  assert.match(line, /18%/);
  assert.match(line, /Session/);
  assert.match(line, /340k/);
  assert.match(line, /Cache/);
  assert.match(line, /71%/);
  assert.ok(!line.includes("/"), `絕對值應先消失:${line}`);
});

test("寬度剛好容得下第一組絕對值時只補該組,不是全有全無", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 70, MONO));
  assert.match(line, /Context/);
  assert.match(line, /Session/);
  assert.match(line, /Cache/);
  assert.match(line, /18% 46\.0k\/256k/);
  assert.ok(!line.includes("/10.0M"));
  assert.ok(!line.includes("241k/340k"));
});

test("計量行資訊量隨寬度單調不減,不會變窄反而多顯示", () => {
  const markers = ["Session", "Cache", "46.0k/256k", "/10.0M", "241k/340k"];
  const seen = new Map(markers.map((marker) => [marker, 0]));
  for (let width = 80; width <= 200; width += 1) {
    const line = strip(renderLine("meters", data, DEFAULT_CONFIG, width, MONO));
    for (const marker of markers) {
      const has = line.includes(marker);
      const from = seen.get(marker) ?? 0;
      if (has && from === 0) seen.set(marker, width);
      assert.ok(
        has || from === 0,
        `${marker} 在 width=${from} 出現過,卻在更寬的 width=${width} 消失:${line}`,
      );
    }
  }
});

test("含 ANSI 的計量行在各寬度下顯示寬度都不超過 width", () => {
  for (const width of [30, 40, 60, 80, 108, 110, 120, 135, 136, 200]) {
    const line = renderLine("meters", data, DEFAULT_CONFIG, width, TN);
    assert.ok(
      visibleLength(line) <= width,
      `width ${width} 超寬:${visibleLength(line)}`,
    );
  }
  assert.ok(strip(renderLine("meters", data, DEFAULT_CONFIG, 136, TN)).includes("241k/340k"));
});

test("每行都不超過指定的顯示欄寬", () => {
  for (const name of DEFAULT_CONFIG.lines) {
    const line = renderLine(name, data, { ...DEFAULT_CONFIG, motto: "x".repeat(500) }, 40, TN);
    assert.ok(displayWidth(line) <= 40, `${name} 超寬:${displayWidth(line)}`);
  }
});

const wideData: HudData = {
  ...data,
  cwdName: "工作區及課程專案",
  branch: "功能分支",
  dirty: true,
  cost: 3.5,
  tools: [
    { name: "搜尋工具", count: 12 },
    { name: "bash", count: 3 },
  ],
};

test("寬字元內容在任一寬度下都不超出終端欄寬", () => {
  const config = { ...DEFAULT_CONFIG, motto: "保持專注,先釐清規格再動手" };
  for (let width = 5; width <= 120; width += 1) {
    for (const name of DEFAULT_CONFIG.lines) {
      const line = renderLine(name, wideData, config, width, MONO);
      assert.ok(
        displayWidth(line) <= width,
        `${name} 在 width=${width} 超寬:${displayWidth(line)}`,
      );
    }
  }
});

test("含 ANSI 上色時每行顯示寬度一樣不超過 width", () => {
  const config = { ...DEFAULT_CONFIG, motto: "保持專注,先釐清規格再動手" };
  for (const palette of [TN, MONO]) {
    for (let width = 5; width <= 120; width += 1) {
      for (const name of DEFAULT_CONFIG.lines) {
        const line = renderLine(name, wideData, config, width, palette);
        assert.ok(
          visibleLength(line) <= width,
          `${name} 在 width=${width} 顯示寬度 ${visibleLength(line)} 超出`,
        );
      }
      for (const line of renderHud(wideData, config, width, palette)) {
        assert.ok(visibleLength(line) <= width, `renderHud 在 width=${width} 超寬`);
      }
    }
  }
});

test("上色不會在行尾遺留半截逸出序列", () => {
  for (let width = 5; width <= 120; width += 1) {
    for (const name of DEFAULT_CONFIG.lines) {
      const line = renderLine(name, wideData, DEFAULT_CONFIG, width, TN);
      assert.ok(!/\u001b\[[0-9;]*$/.test(line), `${name} 在 width=${width} 留下半截序列`);
    }
  }
});

test("截斷不會切斷代理對,不留下孤立的半個字元", () => {
  for (let width = 5; width <= 120; width += 1) {
    for (const name of DEFAULT_CONFIG.lines) {
      const line = renderLine(name, wideData, DEFAULT_CONFIG, width, TN);
      assert.ok(
        [...line].every((ch) => {
          const cp = ch.codePointAt(0) ?? 0;
          return cp < 0xd800 || cp > 0xdfff;
        }),
        `${name} 在 width=${width} 留下孤立代理碼`,
      );
    }
  }
});

test("displayWidth 把寬字元算兩欄,ASCII 算一欄", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("工作區及課程專案"), 16);
});

test("displayWidth 忽略 ANSI 逸出序列", () => {
  assert.equal(displayWidth(paint(TN.cyan, "abc")), 3);
});

test("truncate 以顯示欄寬而非 code unit 裁切", () => {
  const cjk = "工作區及課程專案";
  assert.equal(truncate(cjk, 16), cjk);
  assert.equal(truncate(cjk, 10), "工作區及\u2026");
  assert.equal(truncate(cjk, 9), "工作區及\u2026");
  assert.equal(truncate(cjk, 8), "工作區\u2026");
  assert.equal(truncate(cjk, 1), "");
});

test("renderHud 產出五行:repo 併入第一行、cache 併入第二行", () => {
  const lines = renderHud(data, DEFAULT_CONFIG, 200, TN);
  assert.equal(lines.length, 5);
  const plain = lines.map(strip);
  assert.match(plain[0], /Qwen3\.6-35B-A3B/);
  assert.match(plain[0], /git:\(main\)/);
  assert.match(plain[1], /Context/);
  assert.match(plain[1], /Session/);
  assert.match(plain[1], /Cache/);
  assert.ok(plain[2].startsWith("Env "));
  assert.ok(plain[3].startsWith("Tools "));
  assert.ok(plain[4].startsWith("\u25b6\u25b6 "));
});

test("renderHud 只輸出設定啟用的行", () => {
  const lines = renderHud(data, { ...DEFAULT_CONFIG, lines: ["header", "tools"] }, 200, TN);
  assert.equal(lines.length, 2);
  assert.match(strip(lines[0]), /Qwen3\.6-35B-A3B/);
  assert.ok(strip(lines[1]).startsWith("Tools "));
});

test("tools 行即使沒有工具也佔一行,行數不隨工具出現而跳動", () => {
  const withTools = renderHud(data, { ...DEFAULT_CONFIG, lines: ["header", "tools"] }, 200, TN);
  const without = renderHud(
    { ...data, tools: [] },
    { ...DEFAULT_CONFIG, lines: ["header", "tools"] },
    200,
    TN,
  );
  assert.equal(without.length, withTools.length);
  assert.equal(strip(without[1]).trimEnd(), "Tools —");
});

test("寬度為零時不吐出任何行,也不拋例外", () => {
  assert.deepEqual(renderHud(data, DEFAULT_CONFIG, 0, TN), []);
});

test("啟用的行全部渲染成空時退回一條保底 status 行,不給空白 footer", () => {
  const none = renderHud(data, { ...DEFAULT_CONFIG, lines: [] }, 200, TN);
  assert.equal(none.length, 1);
  assert.ok(strip(none[0]).startsWith("\u25b6\u25b6 "));
});

test("保底行只在全空時出現,tools 有資料時不會多長一行", () => {
  const only = renderHud(data, { ...DEFAULT_CONFIG, lines: ["tools"] }, 200, TN);
  assert.equal(only.length, 1);
  assert.ok(strip(only[0]).startsWith("Tools "));
  assert.equal(renderHud(data, DEFAULT_CONFIG, 200, TN).length, 5);
});

test("保底行本身也不得是空白行", () => {
  for (let width = 1; width <= 60; width += 1) {
    for (const line of renderHud({ ...data, tools: [] }, { ...DEFAULT_CONFIG, lines: ["tools"] }, width, TN)) {
      assert.ok(visibleLength(line) > 0, `width=${width} 產出空白保底行`);
      assert.ok(visibleLength(line) <= width, `width=${width} 保底行超寬`);
    }
  }
});

test("repo 或 cache 單獨啟用時仍各自成行", () => {
  const repoOnly = renderHud(data, { ...DEFAULT_CONFIG, lines: ["repo"] }, 200, MONO);
  assert.deepEqual(repoOnly, ["proj git:(main)"]);
  const cacheOnly = renderHud(data, { ...DEFAULT_CONFIG, lines: ["cache"] }, 200, MONO);
  assert.equal(cacheOnly.length, 1);
  assert.match(cacheOnly[0], /^Cache /);
});

test("icons 開啟時 status/header/tools 各自帶自己的符號", () => {
  assert.ok(renderLine("status", data, DEFAULT_CONFIG, 200, TN).includes("\u25b6\u25b6"));
  assert.ok(renderLine("header", data, DEFAULT_CONFIG, 200, TN).includes("\u23f1"));
  assert.ok(renderLine("tools", data, DEFAULT_CONFIG, 200, TN).includes("\u221a"));
});

test("icons 關閉時 status/header/tools 一律不出現符號", () => {
  const plain = { ...DEFAULT_CONFIG, icons: false };
  const status = renderLine("status", data, plain, 200, TN);
  assert.ok(!status.includes("\u25b6\u25b6"));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(status));
  assert.ok(!renderLine("header", data, plain, 200, TN).includes("\u23f1"));
  assert.ok(!renderLine("tools", data, plain, 200, TN).includes("\u221a"));
});

test("mono 調色盤下輸出完全不含 ANSI 逸出碼", () => {
  for (const name of DEFAULT_CONFIG.lines) {
    const line = renderLine(name, data, DEFAULT_CONFIG, 200, MONO);
    assert.equal(line, strip(line), `${name} 在 mono 下仍帶顏色`);
  }
});

test("motto 為空且不顯示 repo 時,header 不以分隔符結尾", () => {
  const config = {
    ...DEFAULT_CONFIG,
    lines: DEFAULT_CONFIG.lines.filter((n) => n !== "repo"),
    motto: "",
  };
  const line = strip(renderLine("header", data, config, 200, MONO));
  assert.equal(line, line.trimEnd());
  assert.ok(!/\u2502\s*$/.test(line));
  assert.ok(line.endsWith("1h17m"));
});

test("motto 為空且顯示 repo 時,右段仍是 repo 而非分隔符", () => {
  const line = strip(renderLine("header", data, { ...DEFAULT_CONFIG, motto: "" }, 120, MONO));
  assert.ok(line.endsWith("proj git:(main)"));
  assert.equal((line.match(/\u2502/g) ?? []).length, 2);
});

test("沒有顏色時進度條仍分得出填滿與未填滿", () => {
  const at = (percent: number): string =>
    strip(renderLine("meters", { ...data, contextPercent: percent }, DEFAULT_CONFIG, 200, MONO));
  const [empty, half, full] = [at(0), at(50), at(100)];
  assert.notEqual(empty, half);
  assert.notEqual(half, full);
  // 未填滿的格子必須是另一個字元,不能只靠顏色區分——mono 是列在說明文件裡的
  // 合法選項,它底下的進度條不該退化成一整條實心方塊。
  assert.match(empty, /\u2591/);
  assert.match(full, new RegExp(BLOCK));
});

// ---- 外部文字消毒 ----
//
// motto 是使用者打的,風險低。真正的破口是 session 名(agent 寫得進 session_info)、
// 工具名與 MCP 伺服器名(來自第三方設定)。這些字串未經處理就進畫面時,
// visibleLength 會把 ANSI 當零寬跳過——版面不會歪,所以完全看不出來。

const OSC_TITLE = `\u001b]0;pwned\u0007`;
const CSI_CLEAR = `\u001b[2J`;
const BIDI = "\u202e";

test("motto 裡的 OSC 序列不會被送到終端", () => {
  const line = renderLine("header", data, { ...DEFAULT_CONFIG, motto: `${OSC_TITLE}ship it` }, 200, MONO);
  assert.ok(line.includes("ship it"), "正常文字要留著");
  assert.ok(!line.includes("pwned"), "OSC 的酬載不該出現");
  assert.ok(!line.includes("]0;"), "OSC 的開頭不該出現");
});

test("工具名與 repo 名裡的控制碼都會被剝掉", () => {
  const dirty = {
    ...data,
    cwdName: `${CSI_CLEAR}proj`,
    branch: `main${BIDI}`,
    tools: [{ name: `${OSC_TITLE}bash`, count: 3 }],
  };
  const header = renderLine("header", dirty, DEFAULT_CONFIG, 200, MONO);
  const tools = renderLine("tools", dirty, DEFAULT_CONFIG, 200, MONO);
  for (const line of [header, tools]) {
    assert.ok(!line.includes("pwned"));
    assert.ok(!line.includes("[2J"));
    assert.ok(!line.includes(BIDI));
  }
  assert.ok(header.includes("proj"));
  assert.ok(tools.includes("bash"));
});

test("mono 配色下整份 HUD 不該出現任何 ESC——我們自己也沒上色", () => {
  const dirty = {
    ...data,
    model: `${CSI_CLEAR}model`,
    provider: `${OSC_TITLE}prov`,
    cwdName: `${OSC_TITLE}proj`,
    branch: `main${BIDI}`,
    tools: [{ name: `${CSI_CLEAR}bash`, count: 1 }],
  };
  const lines = renderHud(dirty, { ...DEFAULT_CONFIG, motto: OSC_TITLE }, 200, MONO);
  for (const line of lines) {
    assert.ok(!line.includes(""), `仍有 ESC: ${JSON.stringify(line)}`);
  }
});

test("工具失敗過就在次數後面標紅色驚嘆數", () => {
  const failed: HudData = {
    ...data,
    tools: [{ name: "bash", count: 15, errors: 2 }],
  };
  const line = renderLine("tools", failed, DEFAULT_CONFIG, 200, TN);
  assert.match(strip(line), /bash \u00d715 !2/);
  assert.ok(line.includes(paint(TN.red, " !2")), "失敗數要用 red 角色上色");
});

test("工具沒失敗過就不佔那個位置", () => {
  const line = strip(renderLine("tools", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("!"));
});

test("關掉 icons 仍看得到失敗數", () => {
  const failed: HudData = { ...data, tools: [{ name: "bash", count: 4, errors: 1 }] };
  const line = strip(renderLine("tools", failed, { ...DEFAULT_CONFIG, icons: false }, 200, MONO));
  assert.equal(line.trimEnd(), "Tools bash \u00d74 !1");
});

test("壓縮過就在 Context 的百分比後面標次數", () => {
  const compacted: HudData = { ...data, compactions: 2, compactReason: "threshold" };
  const line = strip(renderLine("meters", compacted, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /18% \u21932 /);
});

test("被上下文擠爆而觸發的壓縮標紅色,主動壓縮標琥珀色", () => {
  const overflow: HudData = { ...data, compactions: 1, compactReason: "overflow" };
  const manual: HudData = { ...data, compactions: 1, compactReason: "manual" };
  assert.ok(renderLine("meters", overflow, DEFAULT_CONFIG, 200, TN).includes(paint(TN.red, "\u21931")));
  assert.ok(renderLine("meters", manual, DEFAULT_CONFIG, 200, TN).includes(paint(TN.amber, "\u21931")));
});

test("沒壓縮過的 session 不佔那個位置", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("\u2193"));
});

test("header 在模型後面顯示思考檔位", () => {
  const thinking: HudData = { ...data, thinkingLevel: "high" };
  const line = strip(renderLine("header", thinking, DEFAULT_CONFIG, 200, MONO));
  assert.match(line, /256k\] \u2502 \ud83e\udde0 high \u2502 unsloth/);
});

test("關掉 icons 時思考檔位改用文字標籤", () => {
  const thinking: HudData = { ...data, thinkingLevel: "xhigh" };
  const line = strip(
    renderLine("header", thinking, { ...DEFAULT_CONFIG, icons: false }, 200, MONO),
  );
  assert.match(line, /think xhigh/);
});

test("思考檔位為 off 或缺席時不佔 header 的位置", () => {
  const off: HudData = { ...data, thinkingLevel: "off" };
  for (const d of [data, off]) {
    const line = strip(renderLine("header", d, DEFAULT_CONFIG, 200, MONO));
    assert.ok(!line.includes("think"));
    assert.ok(!line.includes("\ud83e\udde0"));
  }
});

test("status 行顯示落地後的精確速度", () => {
  const fast: HudData = { ...data, speed: { tokensPerSecond: 33.4, live: false } };
  const line = strip(renderLine("status", fast, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /33 tok\/s/);
  assert.ok(!line.includes("~"), "精確值不該帶波浪號");
});

test("串流中的估計值加波浪號並用 dim,跟精確值分得出來", () => {
  const live: HudData = { ...data, speed: { tokensPerSecond: 41.2, live: true } };
  const line = renderLine("status", live, DEFAULT_CONFIG, 200, TN);
  assert.match(strip(line), /~41 tok\/s/);
  assert.ok(line.includes(paint(TN.dim, "~41 tok/s")), "估計值要用 dim");
});

test("慢速時保留一位小數——本地模型每秒個位數才看得出差別", () => {
  const slow: HudData = { ...data, speed: { tokensPerSecond: 4.27, live: false } };
  assert.match(strip(renderLine("status", slow, DEFAULT_CONFIG, 200, TN)), /4\.3 tok\/s/);
});

test("還沒有速度可報時整組不佔位", () => {
  const line = strip(renderLine("status", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("tok/s"));
});

test("關掉 icons 仍看得到速度,只是沒有閃電", () => {
  const fast: HudData = { ...data, speed: { tokensPerSecond: 33.4, live: false } };
  const line = strip(renderLine("status", fast, { ...DEFAULT_CONFIG, icons: false }, 200, MONO));
  assert.match(line, /33 tok\/s/);
  assert.ok(!line.includes("\u26a1"));
});
