import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, readAgentPackages } from "../src/settings-io.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

test("loadConfig 對不存在的檔案回傳預設值", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG);
});

test("loadConfig 對損毀的 JSON 回傳預設值而非拋例外", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  writeFileSync(join(dir, "pi-statusline-hud.json"), "{ this is not json", "utf-8");
  assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG);
});

test("saveConfig 寫出的內容可被 loadConfig 讀回", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  saveConfig(dir, { ...DEFAULT_CONFIG, motto: "keep going", maxToolEntries: 4 });
  const loaded = loadConfig(dir);
  assert.equal(loaded.motto, "keep going");
  assert.equal(loaded.maxToolEntries, 4);
  const raw = readFileSync(join(dir, "pi-statusline-hud.json"), "utf-8");
  assert.ok(raw.endsWith("\n"));
});

test("readAgentPackages 讀出 settings.json 的 packages 陣列", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ packages: ["npm:@narumitw/pi-statusline", "npm:pi-statusline-hud"] }),
    "utf-8",
  );
  assert.deepEqual(readAgentPackages(dir), [
    "npm:@narumitw/pi-statusline",
    "npm:pi-statusline-hud",
  ]);
});

test("readAgentPackages 對缺檔、壞 JSON、缺鍵一律回 undefined 而非拋例外", () => {
  const missing = mkdtempSync(join(tmpdir(), "hud-"));
  assert.equal(readAgentPackages(missing), undefined);

  const broken = mkdtempSync(join(tmpdir(), "hud-"));
  writeFileSync(join(broken, "settings.json"), "{ not json", "utf-8");
  assert.equal(readAgentPackages(broken), undefined);

  const bare = mkdtempSync(join(tmpdir(), "hud-"));
  writeFileSync(join(bare, "settings.json"), JSON.stringify({ theme: "dark" }), "utf-8");
  assert.equal(readAgentPackages(bare), undefined);

  const scalar = mkdtempSync(join(tmpdir(), "hud-"));
  writeFileSync(join(scalar, "settings.json"), "42", "utf-8");
  assert.equal(readAgentPackages(scalar), undefined);
});

test("saveConfig 把 sessionBar 也寫成 on / off", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-sessionbar-"));
  saveConfig(dir, { ...DEFAULT_CONFIG, sessionBar: false });
  const raw = JSON.parse(readFileSync(join(dir, "pi-statusline-hud.json"), "utf-8"));
  assert.equal(raw.sessionBar, "off");
  assert.equal(loadConfig(dir).sessionBar, false);
});
