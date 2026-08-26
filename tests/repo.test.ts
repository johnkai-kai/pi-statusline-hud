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
  speedHistory: [],
  git: CLEAN_STATUS,
};

test("dirName takes the last path segment", () => {
  assert.equal(dirName("/a/b/c"), "c");
  assert.equal(dirName("/a/b/c/"), "c");
  assert.equal(dirName("C:\\a\\b\\c"), "c");
  assert.equal(dirName(""), "");
});

test("renderRepo on a clean branch prints the directory and the branch", () => {
  const line = renderRepo(data, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build git:(master)");
});

const DIRTY = { staged: 3, modified: 5, untracked: 2, conflicts: 0 };

test("renderRepo itemises the changes instead of one mark that hides their weight", () => {
  const line = renderRepo({ ...data, git: DIRTY }, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build git:(master) +3 ~5 ?2");
});

test("renderRepo lists only the non-zero items", () => {
  const only = { ...CLEAN_STATUS, untracked: 1 };
  assert.equal(
    renderRepo({ ...data, git: only }, DEFAULT_CONFIG, 200, MONO),
    "070-pi_plugin_build git:(master) ?1",
  );
});

test("renderRepo puts conflicts last, and shows them even on their own", () => {
  const conflicted = { staged: 0, modified: 1, untracked: 0, conflicts: 2 };
  assert.equal(
    renderRepo({ ...data, git: conflicted }, DEFAULT_CONFIG, 200, MONO),
    "070-pi_plugin_build git:(master) ~1 !2",
  );
});

test("renderRepo with a null branch shows only the directory, breakdown included in the omission", () => {
  const line = renderRepo({ ...data, branch: null, git: DIRTY }, DEFAULT_CONFIG, 200, MONO);
  assert.equal(line, "070-pi_plugin_build");
});

test("renderRepo colours the four classes: staged green, modified amber, untracked dim, conflicted red", () => {
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

test("repoGroup puts the breakdown in extra — it yields to the model name when the first line is tight", () => {
  const group = repoGroup({ ...data, git: DIRTY }, DEFAULT_CONFIG, MONO);
  assert.equal(spansWidth(group.core), "070-pi_plugin_build git:(master)".length);
  assert.equal(spansWidth(group.extra), " +3 ~5 ?2".length);
});

test("renderRepo never exceeds width under a width limit", () => {
  const plain = renderRepo({ ...data, cwdName: "x".repeat(200) }, DEFAULT_CONFIG, 30, MONO);
  assert.equal(plain.length, 30);
  const colored = renderRepo({ ...data, cwdName: "x".repeat(200) }, DEFAULT_CONFIG, 30, TN);
  assert.equal(visibleLength(colored), 30);
});

test("renderRepo does not throw on an empty cwdName", () => {
  assert.doesNotThrow(() => renderRepo({ ...data, cwdName: "" }, DEFAULT_CONFIG, 200, TN));
});

test("displayPath returns a tilde when cwd is the home directory, leaking no account name", () => {
  assert.equal(displayPath("/base/hm", "/base/hm"), "~");
  assert.equal(displayPath("/base/hm/", "/base/hm"), "~");
});

test("displayPath returns ~/lastSegment when cwd is under home", () => {
  assert.equal(displayPath("/base/hm/pi-statusline-hud", "/base/hm"), "~/pi-statusline-hud");
  assert.equal(displayPath("/base/hm/a/b/proj", "/base/hm"), "~/proj");
});

test("displayPath returns only the last segment when cwd is outside home", () => {
  assert.equal(displayPath("/srv/work/proj", "/base/hm"), "proj");
  assert.equal(displayPath("/base/other", "/base/hm"), "other");
});

test("displayPath with an empty home falls back to the last segment instead of matching home", () => {
  assert.equal(displayPath("/a/b", ""), "b");
});

test("displayPath returns a visible placeholder for a drive root or empty path, never an empty string", () => {
  // An empty string filters the whole repo group out as empty, blanking the right end of the first line.
  assert.equal(displayPath("", ""), "/");
  assert.equal(displayPath("/", "/base/hm"), "/");
  assert.equal(displayPath("C:\\", "/base/hm"), "C:");
});

test("displayPath still recognises home across drive and folder case differences", () => {
  assert.equal(displayPath("C:\\Users\\u\\proj", "c:\\users\\u"), "~/proj");
  assert.equal(displayPath("c:/users/U", "C:/Users/u"), "~");
});
