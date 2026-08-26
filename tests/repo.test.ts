import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEAN_STATUS, dirName, displayPath } from "../src/collect/git.ts";
import { renderRepo, repoGroup } from "../src/lines/repo.ts";
import { type HudData, spansWidth } from "../src/lines/types.ts";
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
  ttftMs: null,
  compactions: 0,
  compactReason: null,
  env: { agentsMd: 1, mcps: 6, packages: 6, extensions: 6, skills: 3 },
  tools: [],
  agents: 2,
  runningTools: 1,
  cost: 0,
  cwdName: "070-pi_plugin_build",
  branch: "master",
  git: CLEAN_STATUS,
};

test("dirName 取路徑最末段", () => {
  assert.equal(dirName("/a/b/c"), "c");
  assert.equal(dirName("/a/b/c/"), "c");
  assert.equal(dirName("C:\\a\\b\\c"), "c");
  assert.equal(dirName(""), "");
});

test("renderRepo 乾淨分支輸出目錄名與分支", () => {
  const line = renderRepo(data, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build git:(master)");
});

const DIRTY = { staged: 3, modified: 5, untracked: 2, conflicts: 0 };

test("renderRepo 逐項列出改動,不是一個看不出輕重的記號", () => {
  const line = renderRepo({ ...data, git: DIRTY }, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build git:(master) +3 ~5 ?2");
});

test("renderRepo 只列非零的項目", () => {
  const only = { ...CLEAN_STATUS, untracked: 1 };
  assert.equal(
    renderRepo({ ...data, git: only }, DEFAULT_CONFIG, 200, MONO),
    "070-pi_plugin_build git:(master) ?1",
  );
});

test("renderRepo 衝突排在最後,單獨一項也顯示", () => {
  const conflicted = { staged: 0, modified: 1, untracked: 0, conflicts: 2 };
  assert.equal(
    renderRepo({ ...data, git: conflicted }, DEFAULT_CONFIG, 200, MONO),
    "070-pi_plugin_build git:(master) ~1 !2",
  );
});

test("renderRepo branch 為 null 時只顯示目錄名,改動明細一併省略", () => {
  const line = renderRepo({ ...data, branch: null, git: DIRTY }, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build");
});

test("renderRepo 四類改動各有顏色:暫存 green、工作區 amber、未追蹤 dim、衝突 red", () => {
  const all = { staged: 1, modified: 2, untracked: 3, conflicts: 4 };
  const line = renderRepo({ ...data, git: all }, DEFAULT_CONFIG, 200, TN);
  assert.equal(strip(line), "070-pi_plugin_build git:(master) +1 ~2 ?3 !4");
  assert.ok(line.includes(paint(TN.blue, "070-pi_plugin_build")));
  assert.ok(line.includes(paint(TN.green, "master")));
  assert.ok(line.includes(paint(TN.green, "+1")));
  assert.ok(line.includes(paint(TN.amber, "~2")));
  assert.ok(line.includes(paint(TN.dim, "?3")));
  assert.ok(line.includes(paint(TN.red, "!4")));
});

test("repoGroup 把改動明細放在 extra——第一行擠的時候它該讓位給模型名稱", () => {
  const group = repoGroup({ ...data, git: DIRTY }, DEFAULT_CONFIG, MONO);
  assert.equal(spansWidth(group.core), "070-pi_plugin_build git:(master)".length);
  assert.equal(spansWidth(group.extra), " +3 ~5 ?2".length);
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
