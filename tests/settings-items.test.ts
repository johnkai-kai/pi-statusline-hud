import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, LINE_NAMES, type HudConfig } from "../src/config.ts";
import {
  applySettingChange,
  buildSettingItems,
  LINE_ITEM_PREFIX,
  lineItems,
} from "../src/settings-items.ts";

test("eight settings, fixed order, correct current values", () => {
  const items = buildSettingItems({
    ...DEFAULT_CONFIG,
    motto: "ship it",
    maxToolEntries: 3,
    palettePreset: "ember",
    icons: false,
  });
  assert.deepEqual(
    items.map((i) => i.id),
    [
      "lines",
      "motto",
      "sessionBudget",
      "maxToolEntries",
      "palettePreset",
      "icons",
      "sessionBar",
      "rainbow",
    ],
  );
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.lines.currentValue, `${LINE_NAMES.length}/${LINE_NAMES.length}`);
  assert.equal(byId.motto.currentValue, "ship it");
  assert.equal(byId.maxToolEntries.currentValue, "3");
  assert.equal(byId.palettePreset.currentValue, "ember");
  assert.equal(byId.icons.currentValue, "off");
  assert.equal(byId.sessionBar.currentValue, "on");
  assert.equal(byId.rainbow.currentValue, "0/10");
});

test("an empty motto shows readable text rather than blank", () => {
  const items = buildSettingItems(DEFAULT_CONFIG);
  const motto = items.find((i) => i.id === "motto");
  assert.notEqual(motto?.currentValue.trim(), "");
});

test("only switch-like items carry values — sixteen palettes get a menu, not sixteen keypresses", () => {
  const items = buildSettingItems(DEFAULT_CONFIG);
  const cycling = items.filter((i) => i.values !== undefined).map((i) => i.id);
  assert.deepEqual(cycling, ["icons", "sessionBar"]);
});

test("switch toggling", () => {
  const off = applySettingChange(DEFAULT_CONFIG, "icons", "off");
  assert.equal(off.config.icons, false);
  assert.equal(off.rejected, undefined);
  assert.equal(applySettingChange(off.config, "icons", "on").config.icons, true);
  assert.equal(applySettingChange(DEFAULT_CONFIG, "sessionBar", "off").config.sessionBar, false);
});

test("positive-integer fields reject illegal input and keep the old value", () => {
  for (const bad of ["abc", "", "-5", "0", "1.5", "  "]) {
    const result = applySettingChange(DEFAULT_CONFIG, "sessionBudget", bad);
    assert.ok(result.rejected !== undefined, `${JSON.stringify(bad)} should have been rejected`);
    assert.equal(result.config.sessionBudget, DEFAULT_CONFIG.sessionBudget);
  }
  const ok = applySettingChange(DEFAULT_CONFIG, "maxToolEntries", " 12 ");
  assert.equal(ok.config.maxToolEntries, 12);
  assert.equal(ok.rejected, undefined);
});

test("the palette accepts only legal names", () => {
  assert.equal(applySettingChange(DEFAULT_CONFIG, "palettePreset", "ember").config.palettePreset, "ember");
  const bad = applySettingChange(DEFAULT_CONFIG, "palettePreset", "dracula");
  assert.ok(bad.rejected !== undefined);
  assert.equal(bad.config.palettePreset, DEFAULT_CONFIG.palettePreset);
});

test("the motto can be set to an empty string — this input box shows the current value, unlike pi's dialog", () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "x" };
  const result = applySettingChange(started, "motto", "");
  assert.equal(result.rejected, undefined);
  assert.equal(result.config.motto, "");
});

test("the motto is sanitised on the way in, so control codes never reach the config file", () => {
  const result = applySettingChange(DEFAULT_CONFIG, "motto", "]0;pwnedhi");
  assert.equal(result.config.motto, "hi");
});

test("lines are switched by a prefixed id, and going to zero lines is rejected", () => {
  const only: HudConfig = { ...DEFAULT_CONFIG, lines: ["status"] };
  const rejected = applySettingChange(only, `${LINE_ITEM_PREFIX}status`, "off");
  assert.ok(rejected.rejected !== undefined);
  assert.deepEqual(rejected.config.lines, ["status"]);

  const off = applySettingChange(DEFAULT_CONFIG, `${LINE_ITEM_PREFIX}tools`, "off");
  assert.ok(!off.config.lines.includes("tools"));
  const on = applySettingChange(off.config, `${LINE_ITEM_PREFIX}tools`, "on");
  assert.ok(on.config.lines.includes("tools"));
});

test("a re-enabled line returns to its place in LINE_NAMES rather than the end", () => {
  const off = applySettingChange(DEFAULT_CONFIG, `${LINE_ITEM_PREFIX}header`, "off");
  const on = applySettingChange(off.config, `${LINE_ITEM_PREFIX}header`, "on");
  assert.deepEqual(on.config.lines, [...LINE_NAMES]);
});

test("lineItems has seven entries whose values reflect the current state", () => {
  const items = lineItems({ ...DEFAULT_CONFIG, lines: ["header", "status"] });
  assert.equal(items.length, LINE_NAMES.length);
  const byId = Object.fromEntries(items.map((i) => [i.id, i.currentValue]));
  assert.equal(byId[`${LINE_ITEM_PREFIX}header`], "on");
  assert.equal(byId[`${LINE_ITEM_PREFIX}tools`], "off");
});

test("an unknown id comes back untouched instead of being swallowed", () => {
  const result = applySettingChange(DEFAULT_CONFIG, "nope", "x");
  assert.ok(result.rejected !== undefined);
  assert.deepEqual(result.config, DEFAULT_CONFIG);
});
