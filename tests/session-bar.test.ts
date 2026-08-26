import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSessionBar, sessionLabel } from "../src/lines/session-bar.ts";
import { PALETTES, visibleLength } from "../src/palette.ts";

const TN = PALETTES["tokyo-night"];
const MONO = PALETTES.mono;
const REVERSE = "[7m";
const ANSI = /\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");

test("the rule fills the width, label to the right, three cells left at the end", () => {
  const bar = renderSessionBar("重構 footer", 60, TN);
  assert.equal(visibleLength(bar), 60);
  const plain = strip(bar);
  assert.match(plain, /^─+ 重構 footer ─{3}$/);
});

test("the label is inverse video, and stays inverse with colour off — an attribute, not a colour", () => {
  assert.ok(renderSessionBar("x", 40, TN).includes(REVERSE));
  assert.ok(renderSessionBar("x", 40, MONO).includes(REVERSE));
  // Under mono there must be no colour code anywhere on the line
  assert.ok(!renderSessionBar("x", 40, MONO).includes("38;2;"));
});

test("CJK names count as two columns, so the width never overflows", () => {
  for (const name of ["純中文名稱", "mixed 混合 name", "日本語のセッション"]) {
    assert.equal(visibleLength(renderSessionBar(name, 72, TN)), 72, name);
  }
});

test("an overlong name is truncated and the line still equals the width exactly", () => {
  const bar = renderSessionBar("這是一個非常非常非常冗長的 session 名稱".repeat(3), 40, TN);
  assert.equal(visibleLength(bar), 40);
  assert.match(strip(bar), /…/);
});

test("too narrow to draw a readable rule draws nothing rather than something broken", () => {
  for (const width of [0, -5, 1, 8, Number.NaN]) {
    assert.equal(renderSessionBar("name", width, TN), "", String(width));
  }
});

test("an empty or whitespace-only name draws nothing — the fallback is the caller's call", () => {
  assert.equal(renderSessionBar("", 60, TN), "");
  assert.equal(renderSessionBar("   ", 60, TN), "");
});

test("sessionLabel prefers the session name and falls back to the first six of the id", () => {
  assert.equal(sessionLabel("重構 footer", "a3f9c1b2-dead"), "重構 footer");
  assert.equal(sessionLabel(undefined, "a3f9c1b2-dead"), "#a3f9c1");
  assert.equal(sessionLabel("  ", "a3f9c1b2-dead"), "#a3f9c1");
  assert.equal(sessionLabel(" 有空白 ", "a3f9c1b2-dead"), "有空白");
});

test("sessionLabel returns an empty string when the id is missing too, not # or #undefined", () => {
  assert.equal(sessionLabel(undefined, undefined), "");
  assert.equal(sessionLabel(undefined, ""), "");
});
