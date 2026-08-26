import { test } from "node:test";
import assert from "node:assert/strict";
import { type Span, fitGroups, paintSpans } from "../src/lines/types.ts";

const SEP: Span = { text: " | ", color: null };
const g = (text: string, priority?: number) => ({
  core: [{ text, color: null }],
  extra: [],
  priority,
});
const render = (groups: ReturnType<typeof g>[], width: number): string =>
  paintSpans(fitGroups(groups, SEP, width));

test("沒有標 priority 時行為與原本一致——放得下就留,尾端先丟", () => {
  const groups = [g("aaa"), g("bbb"), g("ccc")];
  assert.equal(render(groups, 100), "aaa | bbb | ccc");
  assert.equal(render(groups, 9), "aaa | bbb");
  assert.equal(render(groups, 3), "aaa");
});

test("priority 高的先保住,即使它排在後面", () => {
  const groups = [g("aaa"), g("bbb"), g("ccc", 9)];
  assert.equal(render(groups, 9), "aaa | ccc");
});

test("保住的順序照原始排列輸出,不照 priority 重排", () => {
  const groups = [g("aaa"), g("bbb", 5), g("ccc", 9)];
  assert.equal(render(groups, 15), "aaa | bbb | ccc");
  assert.equal(render(groups, 9), "bbb | ccc");
});

test("priority 相同時仍以原始順序為準,結果穩定", () => {
  const groups = [g("aaa", 2), g("bbb", 2), g("ccc", 2)];
  assert.equal(render(groups, 9), "aaa | bbb");
});

test("空內容的群組不佔位,也不影響 priority 排序", () => {
  const groups = [g(""), g("aaa"), g("ccc", 9)];
  assert.equal(render(groups, 9), "aaa | ccc");
});
