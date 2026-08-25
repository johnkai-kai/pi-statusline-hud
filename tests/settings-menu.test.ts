import { test } from "node:test";
import assert from "node:assert/strict";
import { SettingsList } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, type HudConfig } from "../src/config.ts";
import {
  applySettingChange,
  buildSettingItems,
  lineItems,
  LINE_ITEM_PREFIX,
  toSettingItems,
} from "../src/settings-items.ts";

// 這個檔案存在的理由:
//
// 舊的精靈用 ctx.ui.select 逐項編輯,每改完一項迴圈就重畫選單。pi 的 select
// 每次都是獨立的 selector 生命週期(關閉即銷毀),所以游標必然回到第一項,
// 而且重畫會閃。那個症狀當時只能靠肉眼看,沒辦法回歸。
//
// SettingsList 的 activateItem 切值時完全不碰 selectedIndex,游標保留是結構
// 性保證。既然是結構性的,就測得出來——下面第一個測試就是把原本的症狀
// 直接寫成斷言。

const DOWN = "[B";
const UP = "[A";
const SPACE = " ";
const PLAIN_THEME = {
  label: (text: string) => text,
  value: (text: string) => text,
  description: (text: string) => text,
  cursor: ">",
  hint: (text: string) => text,
};

interface Harness {
  list: SettingsList;
  changes: Array<{ id: string; value: string }>;
  cancelled: () => boolean;
  cursorLine: () => string;
  press: (...keys: string[]) => void;
}

function harness(config: HudConfig = DEFAULT_CONFIG): Harness {
  const changes: Array<{ id: string; value: string }> = [];
  let cancelled = false;
  const items = toSettingItems(buildSettingItems(config));
  const list = new SettingsList(
    items as never,
    20,
    PLAIN_THEME,
    (id, value) => changes.push({ id, value }),
    () => {
      cancelled = true;
    },
  );
  return {
    list,
    changes,
    cancelled: () => cancelled,
    cursorLine: () => list.render(80).find((line) => line.startsWith(">")) ?? "",
    press: (...keys) => {
      for (const key of keys) list.handleInput(key);
    },
  };
}

test("連續切值之後游標不動——這就是舊精靈的病", () => {
  const h = harness();
  h.press(DOWN, DOWN, DOWN, DOWN, DOWN); // 移到 icons
  const before = h.cursorLine();
  assert.ok(before.includes("emoji"), `游標應該在 emoji 那列: ${before}`);

  h.press(SPACE, SPACE, SPACE);
  assert.equal(h.changes.length, 3);
  assert.deepEqual(
    h.changes.map((c) => c.value),
    ["off", "on", "off"],
  );
  assert.ok(h.cursorLine().includes("emoji"), `切三次值後游標跑掉了: ${h.cursorLine()}`);
});

test("游標移動與切值互不干擾", () => {
  const h = harness();
  h.press(DOWN, DOWN, DOWN, DOWN, DOWN, SPACE, DOWN, SPACE, UP, SPACE);
  assert.deepEqual(
    h.changes.map((c) => c.id),
    ["icons", "sessionBar", "icons"],
  );
});

test("onChange 的輸出接得進 applySettingChange", () => {
  const h = harness();
  h.press(DOWN, DOWN, DOWN, DOWN, DOWN, SPACE);
  let config: HudConfig = { ...DEFAULT_CONFIG };
  for (const change of h.changes) {
    config = applySettingChange(config, change.id, change.value).config;
  }
  assert.equal(config.icons, false);
});

test("Esc 觸發 onCancel 而不是靜默不動", () => {
  const h = harness();
  assert.equal(h.cancelled(), false);
  h.press("");
  assert.equal(h.cancelled(), true);
});

test("十種配色不掛 values——不該要人按十次空白鍵", () => {
  const items = toSettingItems(buildSettingItems(DEFAULT_CONFIG));
  const palette = items.find((i) => i.id === "palettePreset");
  assert.equal(palette?.values, undefined);
});

test("行的子清單也保留游標", () => {
  const changes: Array<{ id: string; value: string }> = [];
  const list = new SettingsList(
    toSettingItems(lineItems(DEFAULT_CONFIG)) as never,
    20,
    PLAIN_THEME,
    (id, value) => changes.push({ id, value }),
    () => {},
  );
  list.handleInput(DOWN);
  list.handleInput(DOWN);
  const before = list.render(80).find((l) => l.startsWith(">")) ?? "";
  list.handleInput(SPACE);
  list.handleInput(SPACE);
  const after = list.render(80).find((l) => l.startsWith(">")) ?? "";
  assert.equal(before, after);
  assert.deepEqual(
    changes.map((c) => c.id),
    [`${LINE_ITEM_PREFIX}meters`, `${LINE_ITEM_PREFIX}meters`],
  );
});
