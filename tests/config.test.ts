import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  parseConfig,
  configFilePath,
  agentSettingsPath,
  detectFooterConflicts,
} from "../src/config.ts";

test("parseConfig 對 undefined 回傳預設值", () => {
  assert.deepEqual(parseConfig(undefined), DEFAULT_CONFIG);
});

test("parseConfig 對損毀輸入回傳預設值而非拋例外", () => {
  assert.deepEqual(parseConfig("not an object"), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig(42), DEFAULT_CONFIG);
});

test("parseConfig 只採用已知的行名,忽略未知行名", () => {
  const result = parseConfig({ lines: ["header", "bogus", "tools"] });
  assert.deepEqual(result.lines, ["header", "tools"]);
});

test("parseConfig 保留合法欄位,其餘取預設", () => {
  const result = parseConfig({ motto: "keep going", maxToolEntries: 3 });
  assert.equal(result.motto, "keep going");
  assert.equal(result.maxToolEntries, 3);
  assert.equal(result.sessionBudget, DEFAULT_CONFIG.sessionBudget);
});

test("parseConfig 拒絕非正數的 sessionBudget", () => {
  assert.equal(parseConfig({ sessionBudget: -1 }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
  assert.equal(parseConfig({ sessionBudget: 0 }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
  assert.equal(parseConfig({ sessionBudget: "big" }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
});

test("預設 motto 為空字串,不含任何個人資訊", () => {
  assert.equal(DEFAULT_CONFIG.motto, "");
});

test("configFilePath 由 agentDir 組成,不寫死路徑", () => {
  assert.equal(configFilePath("/tmp/agent"), "/tmp/agent/pi-statusline-hud.json");
});

test("parseConfig 在 lines 過濾後為空時回退預設七行", () => {
  assert.deepEqual(parseConfig({ lines: ["heder"] }).lines, DEFAULT_CONFIG.lines);
  assert.deepEqual(parseConfig({ lines: [] }).lines, DEFAULT_CONFIG.lines);
});

test("預設 palettePreset 為 contra", () => {
  assert.equal(DEFAULT_CONFIG.palettePreset, "contra");
});

test("parseConfig 接受 mono 這個合法的 palettePreset", () => {
  assert.equal(parseConfig({ palettePreset: "mono" }).palettePreset, "mono");
  assert.equal(parseConfig({ palettePreset: "tokyo-night" }).palettePreset, "tokyo-night");
});

test("parseConfig 對未知的 palettePreset 回退 contra", () => {
  assert.equal(parseConfig({ palettePreset: "dracula" }).palettePreset, "contra");
  assert.equal(parseConfig({ palettePreset: 7 }).palettePreset, "contra");
  assert.equal(parseConfig({}).palettePreset, "contra");
});

test("detectFooterConflicts 抓到已知會搶 footer 的套件", () => {
  assert.deepEqual(detectFooterConflicts(["npm:@narumitw/pi-statusline"]), [
    "npm:@narumitw/pi-statusline",
  ]);
});

test("detectFooterConflicts 用特徵字而非白名單,抓得到沒見過的套件", () => {
  assert.deepEqual(detectFooterConflicts(["npm:some-other-statusline"]), [
    "npm:some-other-statusline",
  ]);
  assert.deepEqual(detectFooterConflicts(["git:example/fancy-footer"]), [
    "git:example/fancy-footer",
  ]);
  assert.deepEqual(detectFooterConflicts(["npm:PI-StatusLine-Pro"]), ["npm:PI-StatusLine-Pro"]);
});

test("detectFooterConflicts 不把本套件自己算成衝突", () => {
  assert.deepEqual(detectFooterConflicts(["npm:pi-statusline-hud"]), []);
  assert.deepEqual(detectFooterConflicts(["git:example/pi-statusline-hud"]), []);
});

test("detectFooterConflicts 忽略與 footer 無關的套件", () => {
  assert.deepEqual(detectFooterConflicts(["npm:pi-notes", "git:example/pi-lint"]), []);
});

test("detectFooterConflicts 對非陣列回傳空陣列", () => {
  assert.deepEqual(detectFooterConflicts(undefined), []);
  assert.deepEqual(detectFooterConflicts(null), []);
  assert.deepEqual(detectFooterConflicts("npm:@narumitw/pi-statusline"), []);
  assert.deepEqual(detectFooterConflicts({ packages: [] }), []);
});

test("detectFooterConflicts 含非字串元素時不拋例外", () => {
  assert.deepEqual(detectFooterConflicts([1, null, { name: "statusline" }, "npm:x-statusline"]), [
    "npm:x-statusline",
  ]);
});

test("detectFooterConflicts 重複的 spec 只回報一次", () => {
  assert.deepEqual(detectFooterConflicts(["npm:a-statusline", "npm:a-statusline"]), [
    "npm:a-statusline",
  ]);
});

test("agentSettingsPath 由 agentDir 組成", () => {
  assert.equal(agentSettingsPath("/base/agent"), "/base/agent/settings.json");
});

test("detectFooterConflicts 認得物件形式的 packages 條目", () => {
  assert.deepEqual(
    detectFooterConflicts([{ source: "npm:@narumitw/pi-statusline", extensions: ["./x.ts"] }]),
    ["npm:@narumitw/pi-statusline"],
  );
  assert.deepEqual(detectFooterConflicts([{ source: "npm:@narumitw/pi-statusline" }]), [
    "npm:@narumitw/pi-statusline",
  ]);
});

test("detectFooterConflicts 字串與物件混用時兩種都回報且維持順序", () => {
  assert.deepEqual(
    detectFooterConflicts([
      "npm:pi-notes",
      { source: "npm:@narumitw/pi-statusline" },
      "npm:other-statusline",
    ]),
    ["npm:@narumitw/pi-statusline", "npm:other-statusline"],
  );
});

test("detectFooterConflicts 物件形式的本套件自己不算衝突", () => {
  assert.deepEqual(detectFooterConflicts([{ source: "npm:pi-statusline-hud" }]), []);
  assert.deepEqual(detectFooterConflicts([{ source: "git:example/pi-statusline-hud" }]), []);
});

test("detectFooterConflicts 物件缺 source 或 source 非字串時仍略過", () => {
  assert.deepEqual(
    detectFooterConflicts([{ name: "statusline" }, { source: 1 }, { source: null }]),
    [],
  );
});

test("detectFooterConflicts 物件與字串指向同一 spec 時只回報一次", () => {
  assert.deepEqual(
    detectFooterConflicts(["npm:a-statusline", { source: "npm:a-statusline" }]),
    ["npm:a-statusline"],
  );
});


test("sessionBar 預設開啟,吃 on/off 也吃舊的布林值", () => {
  assert.equal(parseConfig({}).sessionBar, true);
  assert.equal(parseConfig({ sessionBar: "off" }).sessionBar, false);
  assert.equal(parseConfig({ sessionBar: "on" }).sessionBar, true);
  assert.equal(parseConfig({ sessionBar: false }).sessionBar, false);
  assert.equal(parseConfig({ sessionBar: "亂寫" }).sessionBar, true);
});

test("positiveInt 先取整再驗證——0 與 1 之間的小數不該通過", () => {
  assert.equal(parseConfig({ sessionBudget: 0.5 }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
  assert.equal(parseConfig({ maxToolEntries: 0.9 }).maxToolEntries, DEFAULT_CONFIG.maxToolEntries);
  assert.equal(parseConfig({ maxToolEntries: 3.7 }).maxToolEntries, 3);
});

test("lines 去重——同一行寫兩次不該渲染兩列", () => {
  assert.deepEqual(parseConfig({ lines: ["header", "header", "status"] }).lines, [
    "header",
    "status",
  ]);
});
