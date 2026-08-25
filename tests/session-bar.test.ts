import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSessionBar, sessionLabel } from "../src/lines/session-bar.ts";
import { PALETTES, visibleLength } from "../src/palette.ts";

const TN = PALETTES["tokyo-night"];
const MONO = PALETTES.mono;
const REVERSE = "[7m";
const ANSI = /\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");

test("橫線佔滿整個寬度,標籤靠右且尾端留三格", () => {
  const bar = renderSessionBar("重構 footer", 60, TN);
  assert.equal(visibleLength(bar), 60);
  const plain = strip(bar);
  assert.match(plain, /^─+ 重構 footer ─{3}$/);
});

test("標籤反白,顏色關掉時仍反白——那是屬性不是顏色", () => {
  assert.ok(renderSessionBar("x", 40, TN).includes(REVERSE));
  assert.ok(renderSessionBar("x", 40, MONO).includes(REVERSE));
  // mono 下整條不該出現任何色碼
  assert.ok(!renderSessionBar("x", 40, MONO).includes("38;2;"));
});

test("CJK 名稱按兩欄計算,寬度不會爆版", () => {
  for (const name of ["純中文名稱", "mixed 混合 name", "日本語のセッション"]) {
    assert.equal(visibleLength(renderSessionBar(name, 72, TN)), 72, name);
  }
});

test("名稱過長時截斷,整條仍剛好等於寬度", () => {
  const bar = renderSessionBar("這是一個非常非常非常冗長的 session 名稱".repeat(3), 40, TN);
  assert.equal(visibleLength(bar), 40);
  assert.match(strip(bar), /…/);
});

test("寬度不足以畫出可讀的橫線時整條不畫,不畫壞", () => {
  for (const width of [0, -5, 1, 8, Number.NaN]) {
    assert.equal(renderSessionBar("name", width, TN), "", String(width));
  }
});

test("名稱為空或只有空白時不畫——退路由呼叫端決定", () => {
  assert.equal(renderSessionBar("", 60, TN), "");
  assert.equal(renderSessionBar("   ", 60, TN), "");
});

test("sessionLabel 優先用 session 名,沒有才退回 id 前六碼", () => {
  assert.equal(sessionLabel("重構 footer", "a3f9c1b2-dead"), "重構 footer");
  assert.equal(sessionLabel(undefined, "a3f9c1b2-dead"), "#a3f9c1");
  assert.equal(sessionLabel("  ", "a3f9c1b2-dead"), "#a3f9c1");
  assert.equal(sessionLabel(" 有空白 ", "a3f9c1b2-dead"), "有空白");
});

test("sessionLabel 在 id 也缺席時回傳空字串,而不是 # 或 #undefined", () => {
  assert.equal(sessionLabel(undefined, undefined), "");
  assert.equal(sessionLabel(undefined, ""), "");
});
