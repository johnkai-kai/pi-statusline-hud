import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEAN_STATUS, isDirty, parseStatus } from "../src/collect/git.ts";

test("parseStatus reports empty output as clean", () => {
  assert.deepEqual(parseStatus(""), CLEAN_STATUS);
  assert.deepEqual(parseStatus("\n\n"), CLEAN_STATUS);
});

test("parseStatus counts index and worktree separately — one file can count in both", () => {
  // MM = staged then modified again. Exactly what a boolean hides.
  assert.deepEqual(parseStatus("MM a.ts"), { staged: 1, modified: 1, untracked: 0, conflicts: 0 });
  assert.deepEqual(parseStatus("M  a.ts"), { staged: 1, modified: 0, untracked: 0, conflicts: 0 });
  assert.deepEqual(parseStatus(" M a.ts"), { staged: 0, modified: 1, untracked: 0, conflicts: 0 });
});

test("parseStatus keeps untracked and conflicted separate from the first two", () => {
  assert.deepEqual(parseStatus("?? new.ts"), { staged: 0, modified: 0, untracked: 1, conflicts: 0 });
  assert.deepEqual(parseStatus("UU both.ts"), { staged: 0, modified: 0, untracked: 0, conflicts: 1 });
  assert.deepEqual(parseStatus("AU mine.ts"), { staged: 0, modified: 0, untracked: 0, conflicts: 1 });
});

test("parseStatus ignores the branch header and ignored files", () => {
  assert.deepEqual(parseStatus("## master...origin/master\n!! dist/"), CLEAN_STATUS);
});

test("parseStatus handles CRLF and counts across lines", () => {
  const out = parseStatus("M  a.ts\r\n M b.ts\r\n?? c.ts\r\n?? d.ts\r\n");
  assert.deepEqual(out, { staged: 1, modified: 1, untracked: 2, conflicts: 0 });
});

test("isDirty is decided by the four counts", () => {
  assert.equal(isDirty(CLEAN_STATUS), false);
  assert.equal(isDirty({ staged: 1, modified: 0, untracked: 0, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 1, untracked: 0, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 1, conflicts: 0 }), true);
  assert.equal(isDirty({ staged: 0, modified: 0, untracked: 0, conflicts: 1 }), true);
});
