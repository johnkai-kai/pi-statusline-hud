import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeText } from "../src/sanitize.ts";

const ESC = "";

test("剝掉 CSI 序列", () => {
  assert.equal(sanitizeText(`${ESC}[31mred${ESC}[0m`), "red");
  assert.equal(sanitizeText(`a${ESC}[2Jb`), "ab");
});

test("剝掉 OSC 序列——兩種終止方式都要", () => {
  // BEL 終止:改終端標題
  assert.equal(sanitizeText(`${ESC}]0;pwnedhi`), "hi");
  // ST 終止:OSC 52 寫剪貼簿
  assert.equal(sanitizeText(`${ESC}]52;c;cGF5bG9hZA==${ESC}\\hi`), "hi");
  // OSC 8 超連結
  assert.equal(sanitizeText(`${ESC}]8;;http://evil${ESC}\\text${ESC}]8;;${ESC}\\`), "text");
});

test("剝掉單獨的 ESC 與 7-bit C1", () => {
  assert.equal(sanitizeText(`a${ESC}Mb`), "ab");
  assert.equal(sanitizeText(`a${ESC}b`), "ab");
});

test("剝掉 C0 控制字元——換行會把 footer 撐成多行", () => {
  assert.equal(sanitizeText("一行\n第二行"), "一行第二行");
  // 空白要留著,被剝掉的只有控制字元
  assert.equal(sanitizeText("a\rb\tc\u0000d e"), "abcd e");
});

test("剝掉 bidi 覆寫——它在寬度計算裡是零寬,但會把文字視覺上倒過來", () => {
  assert.equal(sanitizeText("safe‮cod.exe"), "safecod.exe");
  assert.equal(sanitizeText("a‎b⁦c⁩d"), "abcd");
});

test("正常文字原封不動——中文、emoji、標點、既有的 box drawing", () => {
  for (const text of [
    "ship it",
    "mixed 混合 text",
    "🚀 ship it",
    "~/proj git:(master) ✗",
    "Context ██░░ 17%",
    "a-b_c.d/e:f",
  ]) {
    assert.equal(sanitizeText(text), text, text);
  }
});

test("空字串與非字串輸入不炸", () => {
  assert.equal(sanitizeText(""), "");
  assert.equal(sanitizeText(undefined as unknown as string), "");
  assert.equal(sanitizeText(null as unknown as string), "");
  assert.equal(sanitizeText(42 as unknown as string), "");
});
