import { test } from "node:test";
import assert from "node:assert/strict";
import { SettingsList } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, type HudConfig } from "../src/config.ts";
import { createSettingsComponent } from "../src/settings-menu.ts";
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

// ---- 整個選單的端對端:餵真的按鍵給真的元件 ----
//
// 這兩個 bug(游標跳回第一項、子選單選完不返回)都只有在真的元件收到真的
// 按鍵時才看得出來。單元測試驗不到,肉眼看得到——所以把它變成測試。

const ENTER = "\r";

function menu(overrides: Partial<HudConfig> = {}): {
  component: ReturnType<typeof createSettingsComponent>;
  saved: HudConfig[];
  previews: HudConfig[];
  notices: string[];
  closed: () => boolean;
  press: (...keys: string[]) => void;
  lines: () => string[];
} {
  let config: HudConfig = { ...DEFAULT_CONFIG, ...overrides };
  const saved: HudConfig[] = [];
  const previews: HudConfig[] = [];
  const notices: string[] = [];
  let closed = false;
  const component = createSettingsComponent(
    {
      loadConfig: () => config,
      saveConfig: (next) => {
        config = next;
        saved.push(next);
      },
      previewConfig: (next) => previews.push(next),
      notify: (message) => notices.push(message),
    },
    () => {
      closed = true;
    },
    { settings: PLAIN_THEME, select: SELECT_THEME },
  );
  return {
    component,
    saved,
    previews,
    notices,
    closed: () => closed,
    press: (...keys) => {
      for (const key of keys) component.handleInput(key);
    },
    lines: () => component.render(80),
  };
}

const SELECT_THEME = {
  selectedPrefix: (text: string) => text,
  selectedText: (text: string) => text,
  description: (text: string) => text,
  scrollInfo: (text: string) => text,
  noMatch: (text: string) => text,
};

test("配色子選單:Enter 選取之後要回到主選單並且寫檔", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN); // lines → motto → budget → maxTool → palette
  assert.ok(m.lines().join("\n").includes("配色"), "游標應該在配色那列");

  m.press(ENTER); // 開子選單
  const inSubmenu = m.lines().join("\n");
  assert.ok(inSubmenu.includes("tokyo-night"), `子選單沒開起來: ${inSubmenu}`);

  m.press(DOWN, ENTER); // 選下一個配色

  const after = m.lines().join("\n");
  // 判斷「回到主選單」要看主選單獨有的東西,不能看配色名——選完之後主選單
  // 本來就會把新配色顯示成目前值。
  assert.ok(after.includes("顯示哪幾行"), `沒有回到主選單: ${after}`);
  assert.ok(!after.includes("Esc 取消"), `還停在子選單: ${after}`);
  assert.equal(m.saved.length, 1, "應該寫檔一次");
  assert.notEqual(m.saved[0].palettePreset, DEFAULT_CONFIG.palettePreset);
});

test("配色子選單:Esc 取消不寫檔,但一樣要回到主選單", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, "\u001b");
  assert.ok(m.lines().join("\n").includes("顯示哪幾行"), "Esc 之後沒回到主選單");
  assert.equal(m.saved.length, 0);
  assert.equal(m.closed(), false, "Esc 只該關子選單,不該關掉整個選單");
});

test("子選單也要吃空白鍵——主選單的提示字教了使用者這件事", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, DOWN, " ");
  assert.equal(m.saved.length, 1, "空白鍵在配色子選單裡沒作用");
  assert.ok(m.lines().join("\n").includes("顯示哪幾行"), "空白鍵選完沒回到主選單");
});

test("行的子選單:切一行再 Esc,回到主選單而且有寫檔", () => {
  const m = menu();
  m.press(ENTER, DOWN, " ", "\u001b");
  const after = m.lines().join("\n");
  assert.ok(after.includes("座右銘"), `沒回到主選單: ${after}`);
  assert.equal(m.saved.length, 1);
  assert.equal(m.saved[0].lines.length, 6);
});

test("配色子選單:移動游標就即時預覽,而且不寫檔", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER); // 開配色子選單
  assert.equal(m.previews.length, 0, "剛開子選單不該先預覽");

  m.press(DOWN, DOWN); // 往下瀏覽兩個配色
  assert.equal(m.previews.length, 2, "每移動一格就該預覽一次");
  assert.equal(m.saved.length, 0, "瀏覽不該寫檔");
  assert.deepEqual(
    m.previews.map((c) => c.palettePreset),
    ["ember", "triad"],
  );
});

test("配色子選單:Esc 取消時把原本的配色套回去", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, DOWN, DOWN, "");
  assert.equal(m.saved.length, 0, "取消不該寫檔");
  assert.equal(
    m.previews.at(-1)?.palettePreset,
    DEFAULT_CONFIG.palettePreset,
    "Esc 之後畫面應該回到原本的配色",
  );
});

test("配色子選單:預覽過再按 Enter,只寫檔一次而且是游標所在的那個", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, DOWN, DOWN, ENTER);
  assert.equal(m.saved.length, 1);
  assert.equal(m.saved[0].palettePreset, "triad");
});

// 存檔失敗不該把 pi 帶走。onChange 是在 TUI 的輸入派送迴圈裡同步呼叫的,
// 例外逸出 handleInput 之後 pi-tui 不接,會變成 uncaughtException → 行程結束。
// 不需要攻擊者:防毒鎖檔、OneDrive 佔用、唯讀、磁碟滿都會走到這裡。
for (const [name, keys] of [
  ["主選單", [DOWN, DOWN, DOWN, DOWN, DOWN, SPACE]],
  ["行的子選單", [ENTER, DOWN, SPACE]],
] as Array<[string, string[]]>) {
  test(`${name}存檔失敗只通知,不讓例外炸進輸入迴圈`, () => {
    let config: HudConfig = { ...DEFAULT_CONFIG };
    const notices: string[] = [];
    const component = createSettingsComponent(
      {
        loadConfig: () => config,
        saveConfig: () => {
          throw new Error("EACCES: permission denied");
        },
        previewConfig: () => {},
        notify: (message) => notices.push(message),
      },
      () => {},
      { settings: PLAIN_THEME, select: SELECT_THEME },
    );
    assert.doesNotThrow(() => {
      for (const key of keys) component.handleInput(key);
    });
    assert.equal(notices.length, 1, `應該通知使用者一次: ${JSON.stringify(notices)}`);
    assert.match(notices[0], /EACCES/);
    void config;
  });
}
