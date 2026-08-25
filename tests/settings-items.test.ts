import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, LINE_NAMES, type HudConfig } from "../src/config.ts";
import {
  applySettingChange,
  buildSettingItems,
  LINE_ITEM_PREFIX,
  lineItems,
} from "../src/settings-items.ts";

test("七個設定項,順序固定,目前值正確", () => {
  const items = buildSettingItems({
    ...DEFAULT_CONFIG,
    motto: "ship it",
    maxToolEntries: 3,
    palettePreset: "ember",
    icons: false,
  });
  assert.deepEqual(
    items.map((i) => i.id),
    ["lines", "motto", "sessionBudget", "maxToolEntries", "palettePreset", "icons", "sessionBar"],
  );
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.lines.currentValue, `${LINE_NAMES.length}/${LINE_NAMES.length}`);
  assert.equal(byId.motto.currentValue, "ship it");
  assert.equal(byId.maxToolEntries.currentValue, "3");
  assert.equal(byId.palettePreset.currentValue, "ember");
  assert.equal(byId.icons.currentValue, "off");
  assert.equal(byId.sessionBar.currentValue, "on");
});

test("motto 為空時顯示成看得懂的字,不是空白", () => {
  const items = buildSettingItems(DEFAULT_CONFIG);
  const motto = items.find((i) => i.id === "motto");
  assert.notEqual(motto?.currentValue.trim(), "");
});

test("只有開關類的項目帶 values——十種配色用選單,不用循環按十次", () => {
  const items = buildSettingItems(DEFAULT_CONFIG);
  const cycling = items.filter((i) => i.values !== undefined).map((i) => i.id);
  assert.deepEqual(cycling, ["icons", "sessionBar"]);
});

test("開關切換", () => {
  const off = applySettingChange(DEFAULT_CONFIG, "icons", "off");
  assert.equal(off.config.icons, false);
  assert.equal(off.rejected, undefined);
  assert.equal(applySettingChange(off.config, "icons", "on").config.icons, true);
  assert.equal(applySettingChange(DEFAULT_CONFIG, "sessionBar", "off").config.sessionBar, false);
});

test("正整數欄位拒絕非法輸入且原值不動", () => {
  for (const bad of ["abc", "", "-5", "0", "1.5", "  "]) {
    const result = applySettingChange(DEFAULT_CONFIG, "sessionBudget", bad);
    assert.ok(result.rejected !== undefined, `${JSON.stringify(bad)} 應該被拒絕`);
    assert.equal(result.config.sessionBudget, DEFAULT_CONFIG.sessionBudget);
  }
  const ok = applySettingChange(DEFAULT_CONFIG, "maxToolEntries", " 12 ");
  assert.equal(ok.config.maxToolEntries, 12);
  assert.equal(ok.rejected, undefined);
});

test("配色只收合法名稱", () => {
  assert.equal(applySettingChange(DEFAULT_CONFIG, "palettePreset", "ember").config.palettePreset, "ember");
  const bad = applySettingChange(DEFAULT_CONFIG, "palettePreset", "dracula");
  assert.ok(bad.rejected !== undefined);
  assert.equal(bad.config.palettePreset, DEFAULT_CONFIG.palettePreset);
});

test("motto 可以設成空字串——這裡的輸入框看得到目前值,不像 pi 的對話框", () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "x" };
  const result = applySettingChange(started, "motto", "");
  assert.equal(result.rejected, undefined);
  assert.equal(result.config.motto, "");
});

test("motto 進來就先消毒,控制碼進不了設定檔", () => {
  const result = applySettingChange(DEFAULT_CONFIG, "motto", "]0;pwnedhi");
  assert.equal(result.config.motto, "hi");
});

test("行的開關用前綴 id,關到剩零行會被拒絕", () => {
  const only: HudConfig = { ...DEFAULT_CONFIG, lines: ["status"] };
  const rejected = applySettingChange(only, `${LINE_ITEM_PREFIX}status`, "off");
  assert.ok(rejected.rejected !== undefined);
  assert.deepEqual(rejected.config.lines, ["status"]);

  const off = applySettingChange(DEFAULT_CONFIG, `${LINE_ITEM_PREFIX}tools`, "off");
  assert.ok(!off.config.lines.includes("tools"));
  const on = applySettingChange(off.config, `${LINE_ITEM_PREFIX}tools`, "on");
  assert.ok(on.config.lines.includes("tools"));
});

test("重新開啟的行回到 LINE_NAMES 的原始順序,不是接在最後面", () => {
  const off = applySettingChange(DEFAULT_CONFIG, `${LINE_ITEM_PREFIX}header`, "off");
  const on = applySettingChange(off.config, `${LINE_ITEM_PREFIX}header`, "on");
  assert.deepEqual(on.config.lines, [...LINE_NAMES]);
});

test("lineItems 七項,值反映目前開關", () => {
  const items = lineItems({ ...DEFAULT_CONFIG, lines: ["header", "status"] });
  assert.equal(items.length, LINE_NAMES.length);
  const byId = Object.fromEntries(items.map((i) => [i.id, i.currentValue]));
  assert.equal(byId[`${LINE_ITEM_PREFIX}header`], "on");
  assert.equal(byId[`${LINE_ITEM_PREFIX}tools`], "off");
});

test("不認得的 id 原樣退回,不是靜默吃掉", () => {
  const result = applySettingChange(DEFAULT_CONFIG, "nope", "x");
  assert.ok(result.rejected !== undefined);
  assert.deepEqual(result.config, DEFAULT_CONFIG);
});
