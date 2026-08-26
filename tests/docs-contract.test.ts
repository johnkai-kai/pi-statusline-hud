import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG, LINE_NAMES, serialisableConfig } from "../src/config.ts";
import { PALETTE_NAMES } from "../src/palette.ts";

// 文件承諾的合約測試。
//
// 這個專案在同一週踩了三次「文件說 X、程式碼做 Y」:README 的版面示意寫 ░
// 但兩段程式碼都輸出 █;README 與 SKILL 說預設配色是 contra 但 DEFAULT_CONFIG
// 是 tokyo-night;首裝寫出的設定檔是 "icons": true 但文件宣稱 on/off。
//
// 三次都是綠燈通過的——因為測試只讀 src,文件是另一個宇宙。而 SKILL.md 是
// agent 回答使用者的唯一依據,錯的文件會被 agent 當事實複述,傳得比錯的
// 程式碼還遠。
//
// 只鎖鍵名與預設值兩欄,說明文字不比對:比對說明等於每次改排版都要修測試,
// 那種測試撐不過三個月就會被註解掉。

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = {
  README: "README.md",
  "configure SKILL": join("skills", "pi-statusline-hud", "SKILL.md"),
  "setup SKILL": join("skills", "pi-statusline-hud-setup", "SKILL.md"),
} as const;

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

/** 抓出 `| \`key\` | ... |` 這種表格列,回傳 key -> 各欄。 */
function tableRows(markdown: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\|\s*`([A-Za-z]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!match) continue;
    rows.set(
      match[1],
      match[2].split("|").map((cell) => cell.trim()),
    );
  }
  return rows;
}

/** 從 `` `"on"` `` 這種欄位取出字面值;不是程式碼字面就回 null。 */
function literal(cell: string | undefined): string | null {
  if (cell === undefined) return null;
  const match = /^`([^`]+)`$/.exec(cell);
  if (!match) return null;
  return match[1];
}

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);
const SERIALISED = serialisableConfig(DEFAULT_CONFIG);

test("README 與 configure SKILL 的表格涵蓋每一個設定鍵", () => {
  for (const doc of ["README", "configure SKILL"] as const) {
    const rows = tableRows(read(DOCS[doc]));
    for (const key of CONFIG_KEYS) {
      assert.ok(rows.has(key), `${doc} 的表格沒有 ${key}`);
    }
  }
});

test("文件寫成程式碼字面的預設值必須等於實際預設值", () => {
  for (const doc of ["README", "configure SKILL"] as const) {
    const rows = tableRows(read(DOCS[doc]));
    for (const key of CONFIG_KEYS) {
      const cells = rows.get(key);
      if (cells === undefined) continue;
      // README 是「鍵 | 預設 | 說明」,SKILL 是「鍵 | 型別 | 預設 | 說明」。
      const candidates = cells.slice(0, 2).map(literal).filter((v): v is string => v !== null);
      if (candidates.length === 0) continue;

      const actual = SERIALISED[key];
      // 陣列的 String() 是逗號串,不是任何人會寫進文件的東西——用 JSON 字面。
      const expected = Array.isArray(actual)
        ? [JSON.stringify(actual)]
        : typeof actual === "string"
          ? [`"${actual}"`, actual]
          : [String(actual)];
      assert.ok(
        candidates.some((c) => expected.includes(c)),
        `${doc} 的 ${key} 預設值寫 ${JSON.stringify(candidates)},實際是 ${JSON.stringify(actual)}`,
      );
    }
  }
});

test("文件列出的行名與配色名必須是真的存在的", () => {
  // setup SKILL 管的是裝不起來,不列行名——只有這兩份是描述外觀的。
  for (const doc of ["README", "configure SKILL"] as const) {
    const text = read(DOCS[doc]);
    for (const name of LINE_NAMES) {
      assert.ok(text.includes(`\`${name}\``), `${doc} 沒提到行名 ${name}`);
    }
  }
  const configure = read(DOCS["configure SKILL"]);
  for (const name of PALETTE_NAMES) {
    assert.ok(configure.includes(`\`${name}\``), `configure SKILL 沒列出配色 ${name}`);
  }
});

test("文件不該提到已經不存在的東西", () => {
  const gone = ["hasAlwaysVisibleLine", "renderMeter", "supportsTrueColor", "COLORTERM 與 WT_SESSION 都沒設就"];
  for (const [doc, path] of Object.entries(DOCS)) {
    const text = read(path);
    for (const dead of gone) {
      assert.ok(!text.includes(dead), `${doc} 還在講已經移除的 ${dead}`);
    }
  }
});
