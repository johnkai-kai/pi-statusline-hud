import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, readAgentPackages } from "../src/settings-io.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

test("loadConfig returns the defaults for a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG);
});

test("loadConfig returns the defaults for broken JSON instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  writeFileSync(join(dir, "pi-statusline-hud.json"), "{ this is not json", "utf-8");
  assert.deepEqual(loadConfig(dir), DEFAULT_CONFIG);
});

test("what saveConfig writes can be read back by loadConfig", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-"));
  saveConfig(dir, { ...DEFAULT_CONFIG, motto: "keep going", maxToolEntries: 4 });
  const loaded = loadConfig(dir);
  assert.equal(loaded.motto, "keep going");
  assert.equal(loaded.maxToolEntries, 4);
  const raw = readFileSync(join(dir, "pi-statusline-hud.json"), "utf-8");
  assert.ok(raw.endsWith("\n"));
});

test("readAgentPackages reads the packages array out of settings.json", () => {
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

test("readAgentPackages returns undefined for a missing file, broken JSON or missing key", () => {
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

test("saveConfig writes sessionBar as on / off too", () => {
  const dir = mkdtempSync(join(tmpdir(), "hud-sessionbar-"));
  saveConfig(dir, { ...DEFAULT_CONFIG, sessionBar: false });
  const raw = JSON.parse(readFileSync(join(dir, "pi-statusline-hud.json"), "utf-8"));
  assert.equal(raw.sessionBar, "off");
  assert.equal(loadConfig(dir).sessionBar, false);
});
