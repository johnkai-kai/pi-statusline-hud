import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// 每個 src 檔案都要能在 strip-only 模式下載入。
//
// 起因:settings-menu.ts 用了 TypeScript 的參數屬性
// (constructor(private readonly x)),那是 strip-only 解析不了的語法——整個
// 模組在 import 的當下就爆。而 tsc --noEmit 完全不抱怨,所以它一路通過型別
// 檢查、通過 CI,卻讓那個檔案在測試裡連載入都做不到。
//
// 結果是那個檔案裡的兩個 bug 都只能靠肉眼在真的 pi 裡發現。
//
// 同一類地雷還有 enum、namespace、裝飾器、以及 `import x = require(...)`。
// 這條測試不管它們個別是什麼,只問一件事:import 得進來嗎。

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const FILES = tsFiles(SRC);

test("src 底下至少掃到十個檔案——掃不到東西的守衛等於沒有守衛", () => {
  assert.ok(FILES.length >= 10, `只掃到 ${FILES.length} 個檔案`);
});

for (const file of FILES) {
  const name = file.slice(SRC.length + 1).replace(/\\/g, "/");
  test(`src/${name} 在 strip-only 模式下載入得進來`, async () => {
    await assert.doesNotReject(
      () => import(pathToFileURL(file).href),
      `src/${name} 無法載入——多半是用了 strip-only 不支援的語法(參數屬性、enum、namespace、裝飾器)`,
    );
  });
}
