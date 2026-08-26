import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEBUG_LOG_LIMIT, debugLogPath, writeDebug } from "../src/debug.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "hud-debug-"));
}

test("with PI_HUD_DEBUG unset there is no log file — the normal path never touches the disk", () => {
  assert.equal(debugLogPath({}, "/agent"), null);
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "" }, "/agent"), null);
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "0" }, "/agent"), null);
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "off" }, "/agent"), null);
});

test("PI_HUD_DEBUG on writes into the agent directory", () => {
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "1" }, "/agent"), "/agent/pi-statusline-hud.log");
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "on" }, "/agent"), "/agent/pi-statusline-hud.log");
});

test("a path in PI_HUD_DEBUG is used as the path", () => {
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "/tmp/hud.log" }, "/agent"), "/tmp/hud.log");
});

test("writeDebug records the scene and the error message", () => {
  const file = join(scratch(), "hud.log");
  writeDebug(file, "footer", new Error("boom"));
  const text = readFileSync(file, "utf-8");
  assert.match(text, /footer/);
  assert.match(text, /boom/);
  assert.ok(text.endsWith("\n"));
});

test("two writeDebug calls append rather than overwrite", () => {
  const file = join(scratch(), "hud.log");
  writeDebug(file, "footer", new Error("first"));
  writeDebug(file, "widget", new Error("second"));
  const text = readFileSync(file, "utf-8");
  assert.match(text, /first/);
  assert.match(text, /second/);
});

test("a log past the cap restarts instead of growing forever", () => {
  const file = join(scratch(), "hud.log");
  writeFileSync(file, "x".repeat(DEBUG_LOG_LIMIT + 1));
  writeDebug(file, "footer", new Error("fresh"));
  const text = readFileSync(file, "utf-8");
  assert.ok(text.length < DEBUG_LOG_LIMIT);
  assert.match(text, /fresh/);
  assert.ok(!text.includes("xxxx"));
});

test("a failed write must not throw — a broken debug exit cannot take the HUD with it", () => {
  assert.doesNotThrow(() => writeDebug(join(scratch(), "no-such-dir", "hud.log"), "footer", "x"));
  assert.doesNotThrow(() => writeDebug(null, "footer", "x"));
});
