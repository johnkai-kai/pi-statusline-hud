import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RAINBOW_PERIOD_MS,
  RAINBOW_TARGETS,
  isRainbowTarget,
  rainbowHex,
  paintRainbow,
} from "../src/rainbow.ts";

const HEX = /^#[0-9a-f]{6}$/;

test("回傳的一律是合法的六位十六進位色碼", () => {
  for (let i = 0; i < 12; i += 1) assert.match(rainbowHex(i, 12, 0), HEX);
});

test("同一個元素裡相鄰字元色相不同——那才叫漸層", () => {
  const a = rainbowHex(0, 8, 0);
  const b = rainbowHex(1, 8, 0);
  assert.notEqual(a, b);
});

test("一個元素橫跨完整一圈色相:頭尾繞回同一個顏色", () => {
  assert.equal(rainbowHex(0, 6, 0), rainbowHex(6, 6, 0));
});

test("時間推進會整體位移——這就是流動", () => {
  const still = rainbowHex(0, 8, 0);
  const later = rainbowHex(0, 8, RAINBOW_PERIOD_MS / 4);
  assert.notEqual(still, later);
});

test("時間走滿一個週期就回到原點", () => {
  assert.equal(rainbowHex(2, 8, 0), rainbowHex(2, 8, RAINBOW_PERIOD_MS));
});

test("長度為零或非法時不炸,退回單一顏色", () => {
  assert.match(rainbowHex(0, 0, 0), HEX);
  assert.match(rainbowHex(3, Number.NaN, 0), HEX);
});

test("paintRainbow 逐字元上色,原文照樣看得到", () => {
  const painted = paintRainbow("abc", 0);
  assert.equal(painted.replace(/\u001b\[[0-9;]*m/g, ""), "abc");
  const codes = painted.match(/\u001b\[38;2;\d+;\d+;\d+m/g) ?? [];
  assert.equal(codes.length, 3, "三個字元三段色碼");
  assert.equal(new Set(codes).size, 3, "三個顏色要不一樣");
});

test("paintRainbow 以碼點為單位,不會把 emoji 從中間切開", () => {
  const painted = paintRainbow("a\u{1F600}b", 0);
  assert.equal(painted.replace(/\u001b\[[0-9;]*m/g, ""), "a\u{1F600}b");
  assert.equal((painted.match(/\u001b\[38;2;/g) ?? []).length, 3);
});

test("空字串進來就空字串出去,不留下孤兒跳脫碼", () => {
  assert.equal(paintRainbow("", 0), "");
});

test("目標清單是具名的,而且認得出自己人", () => {
  assert.ok(RAINBOW_TARGETS.includes("model"));
  assert.ok(RAINBOW_TARGETS.includes("speed"));
  assert.ok(isRainbowTarget("motto"));
  assert.ok(!isRainbowTarget("狗"));
});

// --- 設定層 ---
import { DEFAULT_CONFIG, parseConfig } from "../src/config.ts";

test("預設完全關閉——沒人要求就不該有東西在畫面上動", () => {
  assert.deepEqual(DEFAULT_CONFIG.rainbow, []);
});

test("設定檔讀進來只留認得的目標,亂寫的直接丟掉", () => {
  const config = parseConfig({ rainbow: ["model", "狗", "speed", "model"] });
  assert.deepEqual(config.rainbow, ["model", "speed"]);
});

test("rainbow 不是陣列時退回預設,不是拋錯", () => {
  assert.deepEqual(parseConfig({ rainbow: "全部" }).rainbow, []);
});

// --- 渲染層 ---
import { paintSpans, renderSpans, type Span } from "../src/lines/types.ts";

test("沒標 rainbow 的 span 走原本那條路,輸出一個位元組都不變", () => {
  const spans: Span[] = [{ text: "abc", color: "#ff0000" }, { text: " x", color: null }];
  assert.equal(paintSpans(spans, 1234), paintSpans(spans, 0));
  assert.equal(paintSpans(spans, 999), paintSpans(spans));
});

test("標了 rainbow 的 span 逐字上色,而且會隨時間變", () => {
  const spans: Span[] = [{ text: "abcd", color: "#ff0000", rainbow: true }];
  const a = paintSpans(spans, 0);
  const b = paintSpans(spans, RAINBOW_PERIOD_MS / 3);
  assert.equal(a.replace(/\u001b\[[0-9;]*m/g, ""), "abcd");
  assert.notEqual(a, b, "時間推進畫面要變");
  assert.equal((a.match(/\u001b\[38;2;/g) ?? []).length, 4);
});

test("彩虹與一般 span 可以並存在同一行", () => {
  const spans: Span[] = [
    { text: "模型 ", color: "#00ffff" },
    { text: "gpt", color: "#00ffff", rainbow: true },
  ];
  assert.equal(paintSpans(spans, 0).replace(/\u001b\[[0-9;]*m/g, ""), "模型 gpt");
});

test("截斷之後仍然是彩虹——fitSpans 不該把旗標弄丟", () => {
  const spans: Span[] = [{ text: "abcdefgh", color: null, rainbow: true }];
  const out = renderSpans(spans, 4, 0);
  assert.equal(out.replace(/\u001b\[[0-9;]*m/g, ""), "abcd");
  assert.ok(out.includes("\u001b[38;2;"));
});

// --- 設定頁 ---
import {
  RAINBOW_ITEM_PREFIX,
  applySettingChange,
  buildSettingItems,
  rainbowItems,
} from "../src/settings-items.ts";

test("主選單有一列彩虹,而且顯示選了幾個", () => {
  const spec = buildSettingItems({ ...DEFAULT_CONFIG, rainbow: ["model", "speed"] })
    .find((item) => item.id === "rainbow");
  assert.ok(spec !== undefined, "主選單缺了彩虹那一列");
  assert.equal(spec.kind, "rainbow");
  assert.match(spec.currentValue, /2\//);
});

test("彩虹子頁每個目標一列,關著的顯示 off", () => {
  const items = rainbowItems({ ...DEFAULT_CONFIG, rainbow: ["speed"] });
  assert.equal(items.length, RAINBOW_TARGETS.length);
  assert.equal(items.find((i) => i.id === `${RAINBOW_ITEM_PREFIX}speed`)?.currentValue, "on");
  assert.equal(items.find((i) => i.id === `${RAINBOW_ITEM_PREFIX}model`)?.currentValue, "off");
  for (const item of items) assert.ok(item.description.length > 0, `${item.id} 沒有說明`);
});

test("打開一個目標就進清單,關掉就出來", () => {
  const on = applySettingChange(DEFAULT_CONFIG, `${RAINBOW_ITEM_PREFIX}motto`, "on");
  assert.deepEqual(on.config.rainbow, ["motto"]);
  const off = applySettingChange(on.config, `${RAINBOW_ITEM_PREFIX}motto`, "off");
  assert.deepEqual(off.config.rainbow, []);
});

test("清單順序照 RAINBOW_TARGETS,不是照按下的先後", () => {
  let config = DEFAULT_CONFIG;
  for (const id of ["cost", "model", "speed"]) {
    config = applySettingChange(config, `${RAINBOW_ITEM_PREFIX}${id}`, "on").config;
  }
  assert.deepEqual(config.rainbow, ["model", "speed", "cost"]);
});

test("不認得的彩虹目標被擋下來,設定不動", () => {
  const result = applySettingChange(DEFAULT_CONFIG, `${RAINBOW_ITEM_PREFIX}狗`, "on");
  assert.ok(result.rejected !== undefined);
  assert.deepEqual(result.config.rainbow, []);
});

test("重複打開同一個不會變成兩筆", () => {
  const once = applySettingChange(DEFAULT_CONFIG, `${RAINBOW_ITEM_PREFIX}cache`, "on").config;
  const twice = applySettingChange(once, `${RAINBOW_ITEM_PREFIX}cache`, "on").config;
  assert.deepEqual(twice.rainbow, ["cache"]);
});

// --- 精靈 ---
import { menuEntries, parseRainbowOption, rainbowOptions } from "../src/wizard.ts";

test("精靈主選單有彩虹那一項,標籤帶著選了幾個", () => {
  const entry = menuEntries({ ...DEFAULT_CONFIG, rainbow: ["model"] })
    .find((e) => e.key === "rainbow");
  assert.ok(entry !== undefined, "精靈選單缺了彩虹");
  assert.match(entry.label, /1\/10/);
});

test("精靈的彩虹選項每個目標一列,標示開關", () => {
  const options = rainbowOptions({ ...DEFAULT_CONFIG, rainbow: ["cost"] });
  assert.equal(options.length, RAINBOW_TARGETS.length);
  assert.ok(options.some((o) => o.startsWith("cost  [")));
  assert.equal(parseRainbowOption(options.find((o) => o.startsWith("cost")) ?? ""), "cost");
  assert.equal(parseRainbowOption("狗  [on]"), null);
});

// --- 動畫節拍 ---
import { FRAME_MS, IDLE_STOP_MS, shouldAnimate } from "../src/collect/animation.ts";

test("一個目標都沒開就不該有任何動畫", () => {
  assert.equal(shouldAnimate(0, 0), false);
  assert.equal(shouldAnimate(0, IDLE_STOP_MS * 10), false);
});

test("開著而且最近有動靜就跑", () => {
  assert.equal(shouldAnimate(1, 0), true);
  assert.equal(shouldAnimate(3, IDLE_STOP_MS - 1), true);
});

test("閒置夠久就停下來——沒人在看的時候不該一直重畫", () => {
  assert.equal(shouldAnimate(1, IDLE_STOP_MS), false);
  assert.equal(shouldAnimate(1, IDLE_STOP_MS + 5_000), false);
});

test("節拍與閒置門檻是公開常數,而且節拍遠小於閒置門檻", () => {
  assert.ok(FRAME_MS >= 50 && FRAME_MS <= 200, `${FRAME_MS}`);
  assert.ok(IDLE_STOP_MS > FRAME_MS * 100);
});
