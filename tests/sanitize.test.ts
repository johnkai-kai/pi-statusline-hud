import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeText } from "../src/sanitize.ts";

const ESC = "";

test("strips CSI sequences", () => {
  assert.equal(sanitizeText(`${ESC}[31mred${ESC}[0m`), "red");
  assert.equal(sanitizeText(`a${ESC}[2Jb`), "ab");
});

test("strips OSC sequences — both terminators", () => {
  // BEL-terminated: changes the terminal title
  assert.equal(sanitizeText(`${ESC}]0;pwnedhi`), "hi");
  // ST-terminated: OSC 52 writes the clipboard
  assert.equal(sanitizeText(`${ESC}]52;c;cGF5bG9hZA==${ESC}\\hi`), "hi");
  // OSC 8 hyperlink
  assert.equal(sanitizeText(`${ESC}]8;;http://evil${ESC}\\text${ESC}]8;;${ESC}\\`), "text");
});

test("strips a lone ESC and 7-bit C1", () => {
  assert.equal(sanitizeText(`a${ESC}Mb`), "ab");
  assert.equal(sanitizeText(`a${ESC}b`), "ab");
});

test("strips C0 controls — a newline would stretch the footer over several rows", () => {
  assert.equal(sanitizeText("一行\n第二行"), "一行第二行");
  // Whitespace stays; only control characters are stripped
  assert.equal(sanitizeText("a\rb\tc\u0000d e"), "abcd e");
});

test("strips bidi overrides — zero-width to the width calculation, yet they reverse text visually", () => {
  assert.equal(sanitizeText("safe‮cod.exe"), "safecod.exe");
  assert.equal(sanitizeText("a‎b⁦c⁩d"), "abcd");
});

test("normal text is untouched — CJK, emoji, punctuation, existing box drawing", () => {
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

test("empty strings and non-string input do not blow up", () => {
  assert.equal(sanitizeText(""), "");
  assert.equal(sanitizeText(undefined as unknown as string), "");
  assert.equal(sanitizeText(null as unknown as string), "");
  assert.equal(sanitizeText(42 as unknown as string), "");
});
