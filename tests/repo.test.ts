import { test } from "node:test";
import assert from "node:assert/strict";
import { dirName, displayPath, isDirty } from "../src/collect/git.ts";
import { renderRepo } from "../src/lines/repo.ts";
import { type HudData } from "../src/lines/types.ts";
import { PALETTES, paint, visibleLength } from "../src/palette.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

const TN = PALETTES["tokyo-night"];
const MONO = PALETTES.mono;
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");

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
  tools: [],
  agents: 2,
  runningTools: 1,
  cost: 0,
  cwdName: "070-pi_plugin_build",
  branch: "master",
  dirty: false,
};

test("dirName 取路徑最末段", () => {
  assert.equal(dirName("/a/b/c"), "c");
  assert.equal(dirName("/a/b/c/"), "c");
  assert.equal(dirName("C:\\a\\b\\c"), "c");
  assert.equal(dirName(""), "");
});

test("isDirty 依四項計數判斷", () => {
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 0, conflicts: 0 }), false);
  assert.equal(isDirty({ staged: 1, modified: 0, untracked: 0, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 1, untracked: 0, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 1, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 0, conflicts: 1 }), true);
});

test("renderRepo 乾淨分支輸出目錄名與分支", () => {
  const line = renderRepo(data, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build git:(master)");
});

test("renderRepo 髒污時附加空格與 U+2717", () => {
  const line = renderRepo({ ...data, dirty: true }, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build git:(master) \u2717");
});

test("renderRepo branch 為 null 時只顯示目錄名,即使 dirty 為 true", () => {
  const line = renderRepo({ ...data, branch: null, dirty: true }, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build");
  assert.ok(!line.includes("\u2717"));
});

test("renderRepo 上色後純文字內容不變,目錄名 blue、分支 green、髒污 red", () => {
  const line = renderRepo({ ...data, dirty: true }, DEFAULT_CONFIG, 200, TN);
  assert.equal(strip(line), "070-pi_plugin_build git:(master) \u2717");
  assert.ok(line.includes(paint(TN.blue, "070-pi_plugin_build")));
  assert.ok(line.includes(paint(TN.green, "master")));
  assert.ok(line.includes(paint(TN.red, " \u2717")));
});

test("renderRepo 在寬度限制下不超過 width", () => {
  const plain = renderRepo({ ...data, cwdName: "x".repeat(200) }, DEFAULT_CONFIG, 30, MONO);
  assert.equal(plain.length, 30);
  const colored = renderRepo({ ...data, cwdName: "x".repeat(200) }, DEFAULT_CONFIG, 30, TN);
  assert.equal(visibleLength(colored), 30);
});

test("renderRepo cwdName 為空字串時不拋例外", () => {
  assert.doesNotThrow(() => renderRepo({ ...data, cwdName: "" }, DEFAULT_CONFIG, 200, TN));
});

test("displayPath cwd 等於家目錄時回傳波浪號,不外洩帳號名", () => {
  assert.equal(displayPath("/base/hm", "/base/hm"), "~");
  assert.equal(displayPath("/base/hm/", "/base/hm"), "~");
});

test("displayPath cwd 在家目錄底下時回傳 ~/最末一段", () => {
  assert.equal(displayPath("/base/hm/pi-statusline-hud", "/base/hm"), "~/pi-statusline-hud");
  assert.equal(displayPath("/base/hm/a/b/proj", "/base/hm"), "~/proj");
});

test("displayPath cwd 不在家目錄底下時只回傳最末一段", () => {
  assert.equal(displayPath("/srv/work/proj", "/base/hm"), "proj");
  assert.equal(displayPath("/base/other", "/base/hm"), "other");
});

test("displayPath 家目錄為空字串時退回最末一段而非誤判為家目錄", () => {
  assert.equal(displayPath("/a/b", ""), "b");
});

test("displayPath 對磁碟根或空路徑回傳可見佔位符,不回空字串", () => {
  // 回空字串會讓 repo 段被當成空內容整段濾掉,第一行右側莫名變空白。
  assert.equal(displayPath("", ""), "/");
  assert.equal(displayPath("/", "/base/hm"), "/");
  assert.equal(displayPath("C:\\", "/base/hm"), "C:");
});

test("displayPath 對大小寫不同的磁碟機與資料夾仍認得家目錄", () => {
  assert.equal(displayPath("C:\\Users\\u\\proj", "c:\\users\\u"), "~/proj");
  assert.equal(displayPath("c:/users/U", "C:/Users/u"), "~");
});
