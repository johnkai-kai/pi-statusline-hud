import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEBUG_LOG_LIMIT, debugLogPath, writeDebug } from "../src/debug.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "hud-debug-"));
}

test("PI_HUD_DEBUG 沒設就沒有記錄檔——正常路徑不碰磁碟", () => {
  assert.equal(debugLogPath({}, "/agent"), null);
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "" }, "/agent"), null);
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "0" }, "/agent"), null);
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "off" }, "/agent"), null);
});

test("PI_HUD_DEBUG 開著就寫進 agent 目錄", () => {
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "1" }, "/agent"), "/agent/pi-statusline-hud.log");
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "on" }, "/agent"), "/agent/pi-statusline-hud.log");
});

test("PI_HUD_DEBUG 給的是路徑就用那個路徑", () => {
  assert.equal(debugLogPath({ PI_HUD_DEBUG: "/tmp/hud.log" }, "/agent"), "/tmp/hud.log");
});

test("writeDebug 記下場景與錯誤訊息", () => {
  const file = join(scratch(), "hud.log");
  writeDebug(file, "footer", new Error("boom"));
  const text = readFileSync(file, "utf-8");
  assert.match(text, /footer/);
  assert.match(text, /boom/);
  assert.ok(text.endsWith("\n"));
});

test("writeDebug 連續兩次是附加,不是覆蓋", () => {
  const file = join(scratch(), "hud.log");
  writeDebug(file, "footer", new Error("first"));
  writeDebug(file, "widget", new Error("second"));
  const text = readFileSync(file, "utf-8");
  assert.match(text, /first/);
  assert.match(text, /second/);
});

test("記錄檔漲過上限就重新開始,不會無限長", () => {
  const file = join(scratch(), "hud.log");
  writeFileSync(file, "x".repeat(DEBUG_LOG_LIMIT + 1));
  writeDebug(file, "footer", new Error("fresh"));
  const text = readFileSync(file, "utf-8");
  assert.ok(text.length < DEBUG_LOG_LIMIT);
  assert.match(text, /fresh/);
  assert.ok(!text.includes("xxxx"));
});

test("寫不進去也不該拋——除錯出口自己壞掉不能帶走 HUD", () => {
  assert.doesNotThrow(() => writeDebug(join(scratch(), "no-such-dir", "hud.log"), "footer", "x"));
  assert.doesNotThrow(() => writeDebug(null, "footer", "x"));
});
