import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_BASE,
  CONFIG_FILE,
  nextBackupName,
  planInstall,
  type PlanInput,
} from "../src/install.ts";
import { DEFAULT_CONFIG, serialisableConfig } from "../src/config.ts";

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    settingsRaw: JSON.stringify({ packages: [] }),
    configExists: false,
    existingBackups: [],
    autofix: false,
    ...overrides,
  };
}

const CONFLICTING = JSON.stringify({
  theme: "dark",
  packages: ["git:github.com/acme/pi-statusline", "git:github.com/acme/pi-todo"],
});

test("a conflict plans a backup, a removal, and a default config file", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.deepEqual(plan.conflicts, ["git:github.com/acme/pi-statusline"]);
  assert.equal(plan.backupName, BACKUP_BASE);
  assert.equal(plan.writeConfig, true);
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.deepEqual(next.packages, ["git:github.com/acme/pi-todo"]);
});

test("removing a conflict keeps the other top-level keys of settings.json", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.equal(next.theme, "dark");
});

test("this package is never treated as a conflict and removed", () => {
  const raw = JSON.stringify({ packages: ["git:github.com/acme/pi-statusline-hud"] });
  const plan = planInstall(input({ settingsRaw: raw }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
});

test("no conflict means no backup and no change to settings.json", () => {
  const raw = JSON.stringify({ packages: ["git:github.com/acme/pi-todo"] });
  const plan = planInstall(input({ settingsRaw: raw, autofix: true }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.writeConfig, true);
});

test("an existing config file is not overwritten, and the message says so", () => {
  const plan = planInstall(input({ configExists: true, autofix: true }));
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.configJson, null);
  assert.ok(plan.messages.some((line) => line.includes("keeping your settings")));
});

test("the config JSON written on opt-in uses the same serialisation as saveConfig", () => {
  const plan = planInstall(input({ autofix: true }));
  assert.deepEqual(JSON.parse(plan.configJson ?? "null"), serialisableConfig(DEFAULT_CONFIG));
  assert.ok((plan.configJson ?? "").endsWith("\n"));
  assert.ok(plan.messages.some((line) => line.includes(CONFIG_FILE)));
});

test("an unreadable settings.json changes nothing", () => {
  const plan = planInstall(input({ settingsRaw: undefined, autofix: true }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.writeConfig, true);
  assert.ok(plan.messages.some((line) => line.includes("not found")));
});

test("a broken settings.json is not written back, only reported as unparseable", () => {
  const plan = planInstall(input({ settingsRaw: "{ not json" }));
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.backupName, null);
  assert.ok(plan.messages.some((line) => line.includes("could not be parsed")));
});

test("an array settings.json counts as unparseable", () => {
  const plan = planInstall(input({ settingsRaw: "[1,2]" }));
  assert.equal(plan.nextSettingsJson, null);
  assert.ok(plan.messages.some((line) => line.includes("could not be parsed")));
});

// The user's config is left alone by default — an install script that edits home-directory
// config unasked is the standard supply-chain pattern, and it fires in unrelated CI and docker builds.
test("by default it only warns, and prints the manual steps", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: false }));
  assert.deepEqual(plan.conflicts, ["git:github.com/acme/pi-statusline"]);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
  assert.ok(plan.messages.some((line) => line.includes("does not edit your config by default")));
  assert.ok(plan.messages.some((line) => line.includes("PI_HUD_AUTOFIX=1")));
  assert.ok(plan.messages.some((line) => line.includes("Restart pi")));
});

test("without autofix not even the config file is written — loadConfig already defaults", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: false }));
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.configJson, null);
  assert.ok(plan.messages.some((line) => line.includes("writes no files at install time")));
});

test("an existing backup is not overwritten; the name gets a number", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, existingBackups: [BACKUP_BASE], autofix: true }));
  assert.equal(plan.backupName, `${BACKUP_BASE}-2`);
});

test("nextBackupName skips every taken number", () => {
  assert.equal(nextBackupName([]), BACKUP_BASE);
  assert.equal(nextBackupName([BACKUP_BASE]), `${BACKUP_BASE}-2`);
  assert.equal(nextBackupName([BACKUP_BASE, `${BACKUP_BASE}-2`]), `${BACKUP_BASE}-3`);
  assert.equal(nextBackupName([`${BACKUP_BASE}-2`]), BACKUP_BASE);
});

test("non-string entries in packages are kept verbatim", () => {
  const raw = JSON.stringify({ packages: ["git:github.com/acme/pi-footer", { local: "./x" }] });
  const plan = planInstall(input({ settingsRaw: raw, autofix: true }));
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.deepEqual(next.packages, [{ local: "./x" }]);
});

test("a missing packages key counts as no conflict", () => {
  const plan = planInstall(input({ settingsRaw: JSON.stringify({ theme: "dark" }) }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.nextSettingsJson, null);
});

test("messages always end with the restart note and carry no ANSI escapes", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.ok((plan.messages.at(-1) ?? "").includes("restarting pi"));
  assert.ok(plan.messages.every((line) => !line.includes("\u001b")));
});

test("messages equals settingsMessages followed by configMessages", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.deepEqual(plan.messages, [...plan.settingsMessages, ...plan.configMessages]);
  assert.ok(plan.settingsMessages.every((line) => !line.includes(CONFIG_FILE)));
});

test("config-stage messages are separate from the settings.json stage, printable before writing", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.ok(plan.settingsMessages.some((line) => line.includes(BACKUP_BASE)));
  assert.equal(plan.configMessages.length, 2);
});

test("an object-form conflicting package is really removed — not just reported", () => {
  const settings = {
    packages: [
      "pi-statusline-hud",
      { source: "npm:@narumitw/pi-statusline", autoload: true },
      { local: "./my-ext" },
    ],
  };
  const plan = planInstall(input({ settingsRaw: JSON.stringify(settings, null, 2), autofix: true }));
  assert.deepEqual(plan.conflicts, ["npm:@narumitw/pi-statusline"]);
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.deepEqual(next.packages, ["pi-statusline-hud", { local: "./my-ext" }]);
});

test("nothing actually changed means no backup and no overwrite", () => {
  const settings = { packages: ["pi-statusline-hud"] };
  const plan = planInstall(input({ settingsRaw: JSON.stringify(settings, null, 2), autofix: true }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.backupName, null);
});

test("by default the plan never contains any write to settings.json", () => {
  // This is the security floor: npm install must not touch the user's config unasked.
  for (const settingsRaw of [
    CONFLICTING,
    JSON.stringify({ packages: [{ source: "npm:@narumitw/pi-statusline" }] }),
    JSON.stringify({ packages: ["a", "b"] }),
    "{ broken json",
    undefined,
  ]) {
    const plan = planInstall(input({ settingsRaw }));
    assert.equal(plan.backupName, null, `settingsRaw=${String(settingsRaw).slice(0, 30)}`);
    assert.equal(plan.nextSettingsJson, null, `settingsRaw=${String(settingsRaw).slice(0, 30)}`);
  }
});
