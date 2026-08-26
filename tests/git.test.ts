import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEAN_STATUS, isDirty, parseStatus } from "../src/collect/git.ts";

test("parseStatus 空輸出是乾淨的", () => {
  assert.deepEqual(parseStatus(""), CLEAN_STATUS);
  assert.deepEqual(parseStatus("\n\n"), CLEAN_STATUS);
});

test("parseStatus 分開數暫存與工作區——同一個檔可以兩邊都算一次", () => {
  // MM = 暫存過又再改過。這正是壓成 boolean 時看不見的東西。
  assert.deepEqual(parseStatus("MM a.ts"), { staged: 1, modified: 1, untracked: 0, conflicts: 0 });
  assert.deepEqual(parseStatus("M  a.ts"), { staged: 1, modified: 0, untracked: 0, conflicts: 0 });
  assert.deepEqual(parseStatus(" M a.ts"), { staged: 0, modified: 1, untracked: 0, conflicts: 0 });
});

test("parseStatus 未追蹤與衝突各自成一類,不混進前兩項", () => {
  assert.deepEqual(parseStatus("?? new.ts"), { staged: 0, modified: 0, untracked: 1, conflicts: 0 });
  assert.deepEqual(parseStatus("UU both.ts"), { staged: 0, modified: 0, untracked: 0, conflicts: 1 });
  assert.deepEqual(parseStatus("AU mine.ts"), { staged: 0, modified: 0, untracked: 0, conflicts: 1 });
});

test("parseStatus 忽略分支標頭與被忽略的檔案", () => {
  assert.deepEqual(parseStatus("## master...origin/master\n!! dist/"), CLEAN_STATUS);
});

test("parseStatus 吃得下 CRLF,也數得出多行", () => {
  const out = parseStatus("M  a.ts\r\n M b.ts\r\n?? c.ts\r\n?? d.ts\r\n");
  assert.deepEqual(out, { staged: 1, modified: 1, untracked: 2, conflicts: 0 });
});

test("isDirty 依四項計數判斷", () => {
  assert.equal(isDirty(CLEAN_STATUS), false);
  assert.equal(isDirty({ staged: 1, modified: 0, untracked: 0, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 1, untracked: 0, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 1, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 0, conflicts: 1 }), true);
});
