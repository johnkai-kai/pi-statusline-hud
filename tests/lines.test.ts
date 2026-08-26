import { test } from "node:test";
import { CLEAN_STATUS } from "../src/collect/git.ts";
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
  ttftMs: null,
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
  speedHistory: [],
  git: CLEAN_STATUS,
};

test("header carries model, window, provider and elapsed time", () => {
  const line = strip(renderLine("header", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /Qwen3\.6-35B-A3B/);
  assert.match(line, /256k/);
  assert.match(line, /unsloth/);
  assert.match(line, /1h17m/);
});

test("an empty motto leaves the left of the header with two separators", () => {
  const line = strip(renderLine("header", data, { ...DEFAULT_CONFIG, motto: "" }, 200, MONO));
  assert.equal((line.match(/\u2502/g) ?? []).length, 2);
});

test("a non-empty motto adds a separator and carries the motto", () => {
  const line = strip(
    renderLine("header", data, { ...DEFAULT_CONFIG, motto: "keep going" }, 200, MONO),
  );
  assert.match(line, /keep going/);
  assert.equal((line.match(/\u2502/g) ?? []).length, 3);
});

test("header right-aligns repo to the end of the terminal width", () => {
  const line = renderLine("header", data, DEFAULT_CONFIG, 100, MONO);
  assert.equal(visibleLength(line), 100);
  assert.ok(strip(line).endsWith("proj git:(main)"));
});

test("header shows the git breakdown on the right when there is room", () => {
  const dirty = { ...data, git: { staged: 3, modified: 5, untracked: 2, conflicts: 0 } };
  const line = strip(renderLine("header", dirty, DEFAULT_CONFIG, 120, MONO));
  assert.ok(line.endsWith("git:(main) +3 ~5 ?2"), line);
});

test("header drops the breakdown rather than the model name when space runs out", () => {
  const dirty = { ...data, git: { staged: 3, modified: 5, untracked: 2, conflicts: 0 } };
  const line = strip(renderLine("header", dirty, DEFAULT_CONFIG, 46, MONO));
  assert.ok(line.endsWith("git:(main)"), `the breakdown did not yield: ${line}`);
  assert.ok(line.includes(data.model), `the model name was eaten: ${line}`);
});

test("header keeps the repo segment on the right even with a very long motto", () => {
  const config = { ...DEFAULT_CONFIG, motto: "x".repeat(40) };
  const line = renderLine("header", data, config, 80, MONO);
  assert.equal(visibleLength(line), 80);
  assert.ok(strip(line).endsWith("git:(main)"), `the right segment was eaten: ${strip(line)}`);
});

test("the header's right alignment touches the right edge exactly (compared column by column)", () => {
  const line = renderLine("header", data, { ...DEFAULT_CONFIG, motto: "go" }, 100, MONO);
  const left =
    "[Qwen3.6-35B-A3B \u00b7 256k] \u2502 unsloth \u2502 \u23f1\ufe0f 1h17m \u2502 go";
  const right = "proj git:(main)";
  assert.equal(line, left + " ".repeat(100 - 50 - 15) + right);
});

test("a header whose motto contains emoji still does not overflow", () => {
  for (const width of [80, 100, 120]) {
    const config = { ...DEFAULT_CONFIG, motto: "\u2705 ship it \u26a1" };
    const line = renderLine("header", data, config, width, MONO);
    assert.equal(visibleLength(line), width, `width=${width}`);
    assert.ok(strip(line).endsWith("proj git:(main)"), `width=${width}: the right segment was eaten`);
  }
});

test("header appends no repo segment when lines does not include repo", () => {
  const config = { ...DEFAULT_CONFIG, lines: ["header" as const] };
  const line = strip(renderLine("header", data, config, 200, MONO));
  assert.ok(!line.includes("git:("));
  assert.ok(!line.includes("proj"));
});

test("the model name and window are cyan, the provider orange", () => {
  const line = renderLine("header", data, DEFAULT_CONFIG, 200, TN);
  assert.ok(line.includes(paint(TN.cyan, "Qwen3.6-35B-A3B")));
  assert.ok(line.includes(paint(TN.cyan, "256k")));
  assert.ok(line.includes(paint(TN.orange, "unsloth")));
});

test("the meters line shows context, session and cache at once", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /Context/);
  assert.match(line, /18%/);
  assert.match(line, /Session/);
  assert.match(line, /340k/);
  assert.match(line, /Cache/);
  assert.match(line, /71% 241k\/340k/);
});

test("meters appends no cache group when lines does not include cache", () => {
  const config = { ...DEFAULT_CONFIG, lines: ["meters" as const] };
  const line = strip(renderLine("meters", data, config, 200, MONO));
  assert.ok(!line.includes("Cache"));
  assert.ok(!line.includes("241k/340k"));
});

test("a null contextPercent shows a placeholder rather than NaN", () => {
  const line = strip(
    renderLine("meters", { ...data, contextPercent: null }, DEFAULT_CONFIG, 200, TN),
  );
  assert.ok(!line.includes("NaN"));
  assert.match(line, /--/);
});

test("cache on its own line shows the hit rate", () => {
  const line = strip(renderLine("cache", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /71%/);
  assert.ok(line.startsWith("Cache "));
});

test("env lists the four counts", () => {
  const line = strip(renderLine("env", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /1 AGENTS\.md/);
  assert.match(line, /6 MCPs/);
  assert.match(line, /6 exts/);
  assert.match(line, /3 skills/);
});

test("tools honours maxToolEntries", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `t${i}`, count: 10 - i }));
  const line = strip(
    renderLine("tools", { ...data, tools: many }, { ...DEFAULT_CONFIG, maxToolEntries: 3 }, 500, TN),
  );
  assert.equal(line.split("\u00b7").length, 3);
});

test("tools shows a placeholder with no data, keeping the line count fixed", () => {
  const line = strip(renderLine("tools", { ...data, tools: [] }, DEFAULT_CONFIG, 200, TN));
  assert.ok(line.startsWith("Tools "));
  assert.equal(line.trimEnd(), "Tools —");
});

test("status shows agents, running tools and cost", () => {
  const line = strip(renderLine("status", data, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /2 agents/);
  assert.match(line, /1 running/);
  assert.match(line, /\$0\.00/);
});

test("status draws the recent trend beside the speed", () => {
  const trend = {
    ...data,
    speed: { tokensPerSecond: 33, live: false },
    speedHistory: [10, 20, 33],
  };
  const line = strip(renderLine("status", trend, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /33 tok\/s ▁▄█/, line);
});

test("status draws no trend from a single sample — one point has no trend", () => {
  const one = { ...data, speed: { tokensPerSecond: 33, live: false }, speedHistory: [33] };
  const line = strip(renderLine("status", one, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /33 tok\/s/);
  assert.ok(!/[▁-█]/.test(line), `drawn from one sample: ${line}`);
});

test("the trend goes first when space runs short, and the speed itself stays", () => {
  const trend = {
    ...data,
    cost: 1.25,
    speed: { tokensPerSecond: 33, live: false },
    speedHistory: [10, 20, 33],
  };
  const line = strip(renderLine("status", trend, { ...DEFAULT_CONFIG, icons: false }, 26, TN));
  assert.match(line, /33 tok\/s/, line);
  assert.ok(!/[▁-█]/.test(line), `the trend did not yield: ${line}`);
});

test("with no agents and no tools running, that whole group is omitted", () => {
  const idle = { ...data, agents: 0, runningTools: 0 };
  const line = strip(renderLine("status", idle, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("agents"), `a normally-zero item is holding space: ${line}`);
  assert.ok(!line.includes("running"), line);
  assert.match(line, /\$0\.00/);
});

test("narrowing sacrifices agents/running first; cost and speed survive longest", () => {
  const busy = {
    ...data,
    cost: 1.25,
    speed: { tokensPerSecond: 33, live: false },
    ttftMs: null,
  };
  const line = strip(renderLine("status", busy, { ...DEFAULT_CONFIG, icons: false }, 26, TN));
  assert.match(line, /\$1\.25/, `cost was dropped: ${line}`);
  assert.match(line, /33 tok\/s/, `speed was dropped: ${line}`);
  assert.ok(!line.includes("agents"), `agents must not outlive cost: ${line}`);
});

test("labels on lines 3-5 sit inline in the segment, no longer padded into a column", () => {
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

test("at width=300 (adaptiveCells=10) the bars are 10 / 10 / 10 cells and coloured by role", () => {
  const line = renderLine("meters", data, DEFAULT_CONFIG, 300, TN);
  assert.ok(line.includes(paint(TN.green, BLOCK.repeat(2))), "context should have 2 green cells");
  assert.ok(line.includes(paint(TN.track, TRACK.repeat(8))), "context should have 8 track cells");
  assert.ok(line.includes(paint(TN.track, TRACK.repeat(10))), "session should have 10 track cells (fill approaches 0)");
  assert.ok(line.includes(paint(TN.cyan, BLOCK.repeat(7))), "cache should have 7 cyan cells");
  assert.ok(line.includes(paint(TN.track, TRACK.repeat(3))), "cache should have 3 track cells");
  const cells = strip(line);
  assert.equal(cells.split(BLOCK).length - 1 + (cells.split(TRACK).length - 1), 30);
});

test("a smaller sessionBudget fills more cells of the session bar", () => {
  const line = renderLine("meters", data, { ...DEFAULT_CONFIG, sessionBudget: 500_000 }, 300, TN);
  assert.ok(line.includes(paint(TN.blue, BLOCK.repeat(7))));
});

test("the context bar changes colour by threshold: 69 green, 70 and 90 amber, 91 red", () => {
  const tinted = (percent: number, color: string | null): boolean =>
    renderLine("meters", { ...data, contextPercent: percent }, DEFAULT_CONFIG, 300, TN).includes(
      paint(color, `${percent.toFixed(0)}%`),
    );
  assert.ok(tinted(69, TN.green));
  assert.ok(tinted(70, TN.amber));
  assert.ok(tinted(90, TN.amber));
  assert.ok(tinted(91, TN.red));
});

test("zero local cost is dim without an emoji; cloud cost is amber with one", () => {
  const local = renderLine("status", data, DEFAULT_CONFIG, 200, TN);
  assert.ok(local.includes(paint(TN.dim, "$0.00")));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(local));
  const cloud = renderLine("status", { ...data, cost: 1.25 }, DEFAULT_CONFIG, 200, TN);
  assert.ok(cloud.includes(paint(TN.amber, "$1.25")));
  assert.ok(strip(cloud).includes("\ud83d\udcb8 $1.25"));
});

test("with icons off there is no emoji even on cloud billing", () => {
  const plain = { ...DEFAULT_CONFIG, icons: false };
  const line = renderLine("status", { ...data, cost: 1.25 }, plain, 200, TN);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(line));
  assert.ok(line.includes(paint(TN.amber, "$1.25")));
});

test("a group that does not fit is dropped whole, never cut in the middle", () => {
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

test("spacing constants: one space between items, meters separated by a bar, one space between bar and value", () => {
  const meters = renderLine("meters", data, DEFAULT_CONFIG, 300, MONO);
  assert.ok(meters.includes("\u2591 18% 46.0k/256k \u2502 Session"));
  assert.ok(meters.includes("340k/10.0M \u2502 Cache"));
  assert.ok(meters.includes("\u2591 71% 241k/340k"));
  const env = renderLine("env", data, DEFAULT_CONFIG, 200, MONO);
  assert.ok(env.includes("1 AGENTS.md \u00b7 6 MCPs"));
  const header = renderLine("header", data, DEFAULT_CONFIG, 200, MONO);
  assert.ok(header.includes("] \u2502 unsloth \u2502 "));
});

test("a null cacheHitRate shows a placeholder rather than NaN", () => {
  const line = strip(renderLine("meters", { ...data, cacheHitRate: null }, DEFAULT_CONFIG, 300, TN));
  assert.ok(!line.includes("NaN"));
  assert.match(line, /--%/);
  assert.ok(!line.includes("241k/340k"));
});

test("the whole Env row, each agents/running item, and cache percent vs absolute each share a colour", () => {
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

test("all three meter groups show percentage and absolute side by side", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 300, TN));
  assert.match(line, /Context [\u2588\u2591]+ 18% 46\.0k\/256k/);
  assert.match(line, /Session [\u2588\u2591]+ 340k\/10\.0M/);
  assert.match(line, /Cache [\u2588\u2591]+ 71% 241k\/340k/);
});

test("a null contextPercent drops the whole absolute segment rather than showing 0/0", () => {
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

test("a null cacheHitRate drops the whole absolute segment rather than showing 0/0", () => {
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

test("a contextWindow of 0 prints no absolute value with 0 as the denominator", () => {
  const line = strip(
    renderLine("meters", { ...data, contextWindow: 0 }, DEFAULT_CONFIG, 300, TN),
  );
  assert.ok(!line.includes("/0"));
  assert.match(line, /Context [\u2588\u2591]+ 18% \u2502 Session/);
});

test("absolutes are dropped first when width is short; the percentages stay", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 55, MONO));
  assert.match(line, /Context/);
  assert.match(line, /18%/);
  assert.match(line, /Session/);
  assert.match(line, /340k/);
  assert.match(line, /Cache/);
  assert.match(line, /71%/);
  assert.ok(!line.includes("/"), `absolutes should go first: ${line}`);
});

test("when exactly one group's absolutes fit, only that group gets them — not all or nothing", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 70, MONO));
  assert.match(line, /Context/);
  assert.match(line, /Session/);
  assert.match(line, /Cache/);
  assert.match(line, /18% 46\.0k\/256k/);
  assert.ok(!line.includes("/10.0M"));
  assert.ok(!line.includes("241k/340k"));
});

test("the meters line's information is monotone in width — narrower never shows more", () => {
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
        `${marker} appeared at width=${from} but vanished at the wider width=${width}: ${line}`,
      );
    }
  }
});

test("a meters line with ANSI never exceeds width at any width", () => {
  for (const width of [30, 40, 60, 80, 108, 110, 120, 135, 136, 200]) {
    const line = renderLine("meters", data, DEFAULT_CONFIG, width, TN);
    assert.ok(
      visibleLength(line) <= width,
      `width ${width} overflows: ${visibleLength(line)}`,
    );
  }
  assert.ok(strip(renderLine("meters", data, DEFAULT_CONFIG, 136, TN)).includes("241k/340k"));
});

test("no line exceeds the given display width", () => {
  for (const name of DEFAULT_CONFIG.lines) {
    const line = renderLine(name, data, { ...DEFAULT_CONFIG, motto: "x".repeat(500) }, 40, TN);
    assert.ok(displayWidth(line) <= 40, `${name} overflows: ${displayWidth(line)}`);
  }
});

const wideData: HudData = {
  ...data,
  cwdName: "工作區及課程專案",
  branch: "功能分支",
  git: { staged: 0, modified: 1, untracked: 0, conflicts: 0 },
  cost: 3.5,
  tools: [
    { name: "搜尋工具", count: 12 },
    { name: "bash", count: 3 },
  ],
};

test("wide-character content stays inside the terminal width at every width", () => {
  const config = { ...DEFAULT_CONFIG, motto: "保持專注,先釐清規格再動手" };
  for (let width = 5; width <= 120; width += 1) {
    for (const name of DEFAULT_CONFIG.lines) {
      const line = renderLine(name, wideData, config, width, MONO);
      assert.ok(
        displayWidth(line) <= width,
        `${name} overflows at width=${width}: ${displayWidth(line)}`,
      );
    }
  }
});

test("with ANSI colouring the display width still never exceeds width", () => {
  const config = { ...DEFAULT_CONFIG, motto: "保持專注,先釐清規格再動手" };
  for (const palette of [TN, MONO]) {
    for (let width = 5; width <= 120; width += 1) {
      for (const name of DEFAULT_CONFIG.lines) {
        const line = renderLine(name, wideData, config, width, palette);
        assert.ok(
          visibleLength(line) <= width,
          `${name} at width=${width} has display width ${visibleLength(line)}, over the limit`,
        );
      }
      for (const line of renderHud(wideData, config, width, palette)) {
        assert.ok(visibleLength(line) <= width, `renderHud overflows at width=${width}`);
      }
    }
  }
});

test("colouring leaves no half escape sequence at the end of a line", () => {
  for (let width = 5; width <= 120; width += 1) {
    for (const name of DEFAULT_CONFIG.lines) {
      const line = renderLine(name, wideData, DEFAULT_CONFIG, width, TN);
      assert.ok(!/\u001b\[[0-9;]*$/.test(line), `${name} left a half sequence at width=${width}`);
    }
  }
});

test("truncation never splits a surrogate pair or leaves half a character", () => {
  for (let width = 5; width <= 120; width += 1) {
    for (const name of DEFAULT_CONFIG.lines) {
      const line = renderLine(name, wideData, DEFAULT_CONFIG, width, TN);
      assert.ok(
        [...line].every((ch) => {
          const cp = ch.codePointAt(0) ?? 0;
          return cp < 0xd800 || cp > 0xdfff;
        }),
        `${name} left a lone surrogate at width=${width}`,
      );
    }
  }
});

test("displayWidth counts wide characters as two columns and ASCII as one", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("工作區及課程專案"), 16);
});

test("displayWidth ignores ANSI escape sequences", () => {
  assert.equal(displayWidth(paint(TN.cyan, "abc")), 3);
});

test("truncate cuts by display width, not by code unit", () => {
  const cjk = "工作區及課程專案";
  assert.equal(truncate(cjk, 16), cjk);
  assert.equal(truncate(cjk, 10), "工作區及\u2026");
  assert.equal(truncate(cjk, 9), "工作區及\u2026");
  assert.equal(truncate(cjk, 8), "工作區\u2026");
  assert.equal(truncate(cjk, 1), "");
});

test("renderHud produces five lines: repo folded into the first, cache into the second", () => {
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

test("renderHud emits only the lines enabled in the config", () => {
  const lines = renderHud(data, { ...DEFAULT_CONFIG, lines: ["header", "tools"] }, 200, TN);
  assert.equal(lines.length, 2);
  assert.match(strip(lines[0]), /Qwen3\.6-35B-A3B/);
  assert.ok(strip(lines[1]).startsWith("Tools "));
});

test("the tools line takes a row even with no tools, so the count never jumps", () => {
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

test("zero width emits no lines and does not throw", () => {
  assert.deepEqual(renderHud(data, DEFAULT_CONFIG, 0, TN), []);
});

test("when every enabled line renders empty, one fallback status line appears instead of a blank footer", () => {
  const none = renderHud(data, { ...DEFAULT_CONFIG, lines: [] }, 200, TN);
  assert.equal(none.length, 1);
  assert.ok(strip(none[0]).startsWith("\u25b6\u25b6 "));
});

test("the fallback appears only when everything is empty; it adds no row when tools has data", () => {
  const only = renderHud(data, { ...DEFAULT_CONFIG, lines: ["tools"] }, 200, TN);
  assert.equal(only.length, 1);
  assert.ok(strip(only[0]).startsWith("Tools "));
  assert.equal(renderHud(data, DEFAULT_CONFIG, 200, TN).length, 5);
});

test("the fallback line itself must not be blank", () => {
  for (let width = 1; width <= 60; width += 1) {
    for (const line of renderHud({ ...data, tools: [] }, { ...DEFAULT_CONFIG, lines: ["tools"] }, width, TN)) {
      assert.ok(visibleLength(line) > 0, `width=${width} produced a blank fallback line`);
      assert.ok(visibleLength(line) <= width, `width=${width} fallback line overflows`);
    }
  }
});

test("repo or cache enabled on their own still each get a line", () => {
  const repoOnly = renderHud(data, { ...DEFAULT_CONFIG, lines: ["repo"] }, 200, MONO);
  assert.deepEqual(repoOnly, ["proj git:(main)"]);
  const cacheOnly = renderHud(data, { ...DEFAULT_CONFIG, lines: ["cache"] }, 200, MONO);
  assert.equal(cacheOnly.length, 1);
  assert.match(cacheOnly[0], /^Cache /);
});

test("with icons on, status/header/tools each carry their own symbol", () => {
  assert.ok(renderLine("status", data, DEFAULT_CONFIG, 200, TN).includes("\u25b6\u25b6"));
  assert.ok(renderLine("header", data, DEFAULT_CONFIG, 200, TN).includes("\u23f1"));
  assert.ok(renderLine("tools", data, DEFAULT_CONFIG, 200, TN).includes("\u221a"));
});

test("with icons off, status/header/tools carry no symbols at all", () => {
  const plain = { ...DEFAULT_CONFIG, icons: false };
  const status = renderLine("status", data, plain, 200, TN);
  assert.ok(!status.includes("\u25b6\u25b6"));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(status));
  assert.ok(!renderLine("header", data, plain, 200, TN).includes("\u23f1"));
  assert.ok(!renderLine("tools", data, plain, 200, TN).includes("\u221a"));
});

test("the mono palette emits no ANSI escape codes at all", () => {
  for (const name of DEFAULT_CONFIG.lines) {
    const line = renderLine(name, data, DEFAULT_CONFIG, 200, MONO);
    assert.equal(line, strip(line), `${name} still carries colour under mono`);
  }
});

test("with an empty motto and repo hidden, the header does not end in a separator", () => {
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

test("with an empty motto and repo shown, the right segment is still repo, not a separator", () => {
  const line = strip(renderLine("header", data, { ...DEFAULT_CONFIG, motto: "" }, 120, MONO));
  assert.ok(line.endsWith("proj git:(main)"));
  assert.equal((line.match(/\u2502/g) ?? []).length, 2);
});

test("without colour the bar still distinguishes filled from unfilled", () => {
  const at = (percent: number): string =>
    strip(renderLine("meters", { ...data, contextPercent: percent }, DEFAULT_CONFIG, 200, MONO));
  const [empty, half, full] = [at(0), at(50), at(100)];
  assert.notEqual(empty, half);
  assert.notEqual(half, full);
  // The unfilled cell must be a different character rather than colour alone — mono is a legal
  // documented option, and the bar under it must not degrade into one solid block.
  assert.match(empty, /\u2591/);
  assert.match(full, new RegExp(BLOCK));
});

// ---- Sanitising external text ----
//
// The motto is typed by the user and is low risk. The real openings are the session name (the
// agent can write session_info) and tool and MCP server names (from third-party config). Those
// strings reaching the screen unprocessed are invisible: visibleLength skips ANSI as zero-width,
// so the layout never shifts.

const OSC_TITLE = `\u001b]0;pwned\u0007`;
const CSI_CLEAR = `\u001b[2J`;
const BIDI = "\u202e";

test("an OSC sequence in the motto never reaches the terminal", () => {
  const line = renderLine("header", data, { ...DEFAULT_CONFIG, motto: `${OSC_TITLE}ship it` }, 200, MONO);
  assert.ok(line.includes("ship it"), "the normal text must stay");
  assert.ok(!line.includes("pwned"), "the OSC payload must not appear");
  assert.ok(!line.includes("]0;"), "the OSC opener must not appear");
});

test("control codes in tool and repo names are stripped", () => {
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

test("under mono the whole HUD carries no ESC — we emit no colour of our own either", () => {
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
    assert.ok(!line.includes(""), `ESC remains: ${JSON.stringify(line)}`);
  }
});

test("a tool that has failed gets a red exclamation count after its call count", () => {
  const failed: HudData = {
    ...data,
    tools: [{ name: "bash", count: 15, errors: 2 }],
  };
  const line = renderLine("tools", failed, DEFAULT_CONFIG, 200, TN);
  assert.match(strip(line), /bash \u00d715 !2/);
  assert.ok(line.includes(paint(TN.red, " !2")), "the failure count should use the red role");
});

test("a tool that has never failed takes no such space", () => {
  const line = strip(renderLine("tools", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("!"));
});

test("the failure count is still visible with icons off", () => {
  const failed: HudData = { ...data, tools: [{ name: "bash", count: 4, errors: 1 }] };
  const line = strip(renderLine("tools", failed, { ...DEFAULT_CONFIG, icons: false }, 200, MONO));
  assert.equal(line.trimEnd(), "Tools bash \u00d74 !1");
});

test("after a compaction the count is marked after the Context percentage", () => {
  const compacted: HudData = { ...data, compactions: 2, compactReason: "threshold" };
  const line = strip(renderLine("meters", compacted, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /18% \u21932 /);
});

test("a compaction forced by a full context is red; a deliberate one is amber", () => {
  const overflow: HudData = { ...data, compactions: 1, compactReason: "overflow" };
  const manual: HudData = { ...data, compactions: 1, compactReason: "manual" };
  assert.ok(renderLine("meters", overflow, DEFAULT_CONFIG, 200, TN).includes(paint(TN.red, "\u21931")));
  assert.ok(renderLine("meters", manual, DEFAULT_CONFIG, 200, TN).includes(paint(TN.amber, "\u21931")));
});

test("a session that was never compacted takes no such space", () => {
  const line = strip(renderLine("meters", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("\u2193"));
});

test("the header shows the thinking effort after the model", () => {
  const thinking: HudData = { ...data, thinkingLevel: "high" };
  const line = strip(renderLine("header", thinking, DEFAULT_CONFIG, 200, MONO));
  assert.match(line, /256k\] \u2502 \ud83e\udde0 high \u2502 unsloth/);
});

test("with icons off the thinking effort uses a text label", () => {
  const thinking: HudData = { ...data, thinkingLevel: "xhigh" };
  const line = strip(
    renderLine("header", thinking, { ...DEFAULT_CONFIG, icons: false }, 200, MONO),
  );
  assert.match(line, /think xhigh/);
});

test("an off or absent thinking effort takes no space in the header", () => {
  const off: HudData = { ...data, thinkingLevel: "off" };
  for (const d of [data, off]) {
    const line = strip(renderLine("header", d, DEFAULT_CONFIG, 200, MONO));
    assert.ok(!line.includes("think"));
    assert.ok(!line.includes("\ud83e\udde0"));
  }
});

test("the status line shows the exact speed once the message lands", () => {
  const fast: HudData = { ...data, speed: { tokensPerSecond: 33.4, live: false } };
  const line = strip(renderLine("status", fast, DEFAULT_CONFIG, 200, TN));
  assert.match(line, /33 tok\/s/);
  assert.ok(!line.includes("~"), "the exact value must not carry a tilde");
});

test("a mid-stream estimate carries a tilde and uses dim, telling it from the exact value", () => {
  const live: HudData = { ...data, speed: { tokensPerSecond: 41.2, live: true } };
  const line = renderLine("status", live, DEFAULT_CONFIG, 200, TN);
  assert.match(strip(line), /~41 tok\/s/);
  assert.ok(line.includes(paint(TN.dim, "~41 tok/s")), "the estimate should use dim");
});

test("one decimal is kept when slow — single digits per second only differ there", () => {
  const slow: HudData = { ...data, speed: { tokensPerSecond: 4.27, live: false } };
  assert.match(strip(renderLine("status", slow, DEFAULT_CONFIG, 200, TN)), /4\.3 tok\/s/);
});

test("with no speed to report the whole group takes no space", () => {
  const line = strip(renderLine("status", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!line.includes("tok/s"));
});

test("the speed is still visible with icons off, just without the lightning", () => {
  const fast: HudData = { ...data, speed: { tokensPerSecond: 33.4, live: false } };
  const line = strip(renderLine("status", fast, { ...DEFAULT_CONFIG, icons: false }, 200, MONO));
  assert.match(line, /33 tok\/s/);
  assert.ok(!line.includes("\u26a1"));
});

test("the status line shows the time to first token", () => {
  const d: HudData = { ...data, ttftMs: 953 };
  assert.match(strip(renderLine("status", d, DEFAULT_CONFIG, 200, TN)), /0\.95s/);
});

test("a long latency uses whole seconds — twenty seconds of queueing needs no decimal", () => {
  const d: HudData = { ...data, ttftMs: 20_022 };
  assert.match(strip(renderLine("status", d, DEFAULT_CONFIG, 200, TN)), /20s/);
});

test("with no latency to report the whole group takes no space", () => {
  const line = strip(renderLine("status", data, DEFAULT_CONFIG, 200, TN));
  assert.ok(!/\ds\b/.test(line.replace(/agents/g, "")), line);
});

test("speed and latency can appear together, speed first", () => {
  const d: HudData = { ...data, speed: { tokensPerSecond: 35, live: false }, ttftMs: 953 };
  const line = strip(renderLine("status", d, DEFAULT_CONFIG, 200, TN));
  assert.ok(line.indexOf("tok/s") < line.indexOf("0.95s"), line);
});

test("the latency is still visible with icons off, just without the stopwatch", () => {
  const d: HudData = { ...data, ttftMs: 953 };
  const line = strip(renderLine("status", d, { ...DEFAULT_CONFIG, icons: false }, 200, MONO));
  assert.match(line, /0\.95s/);
  assert.ok(!line.includes("\u23f1"));
});
