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

test("without priority the behaviour is unchanged — keep what fits, drop from the tail", () => {
  const groups = [g("aaa"), g("bbb"), g("ccc")];
  assert.equal(render(groups, 100), "aaa | bbb | ccc");
  assert.equal(render(groups, 9), "aaa | bbb");
  assert.equal(render(groups, 3), "aaa");
});

test("a higher priority survives even when it comes later", () => {
  const groups = [g("aaa"), g("bbb"), g("ccc", 9)];
  assert.equal(render(groups, 9), "aaa | ccc");
});

test("survivors are emitted in the original order, not reordered by priority", () => {
  const groups = [g("aaa"), g("bbb", 5), g("ccc", 9)];
  assert.equal(render(groups, 15), "aaa | bbb | ccc");
  assert.equal(render(groups, 9), "bbb | ccc");
});

test("equal priorities fall back to original order, so the result is stable", () => {
  const groups = [g("aaa", 2), g("bbb", 2), g("ccc", 2)];
  assert.equal(render(groups, 9), "aaa | bbb");
});

test("an empty group takes no space and does not disturb the priority order", () => {
  const groups = [g(""), g("aaa"), g("ccc", 9)];
  assert.equal(render(groups, 9), "aaa | ccc");
});
