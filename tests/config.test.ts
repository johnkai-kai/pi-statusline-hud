import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  parseConfig,
  configFilePath,
  agentSettingsPath,
  detectFooterConflicts,
} from "../src/config.ts";

test("parseConfig returns the defaults for undefined", () => {
  assert.deepEqual(parseConfig(undefined), DEFAULT_CONFIG);
});

test("parseConfig returns the defaults for broken input instead of throwing", () => {
  assert.deepEqual(parseConfig("not an object"), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig(42), DEFAULT_CONFIG);
});

test("parseConfig keeps known line names and ignores unknown ones", () => {
  const result = parseConfig({ lines: ["header", "bogus", "tools"] });
  assert.deepEqual(result.lines, ["header", "tools"]);
});

test("parseConfig keeps legal fields and defaults the rest", () => {
  const result = parseConfig({ motto: "keep going", maxToolEntries: 3 });
  assert.equal(result.motto, "keep going");
  assert.equal(result.maxToolEntries, 3);
  assert.equal(result.sessionBudget, DEFAULT_CONFIG.sessionBudget);
});

test("parseConfig rejects a non-positive sessionBudget", () => {
  assert.equal(parseConfig({ sessionBudget: -1 }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
  assert.equal(parseConfig({ sessionBudget: 0 }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
  assert.equal(parseConfig({ sessionBudget: "big" }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
});

test("the default motto is an empty string, carrying no personal information", () => {
  assert.equal(DEFAULT_CONFIG.motto, "");
});

test("configFilePath is built from agentDir, never a hardcoded path", () => {
  assert.equal(configFilePath("/tmp/agent"), "/tmp/agent/pi-statusline-hud.json");
});

test("parseConfig falls back to the seven default lines when the filter leaves none", () => {
  assert.deepEqual(parseConfig({ lines: ["heder"] }).lines, DEFAULT_CONFIG.lines);
  assert.deepEqual(parseConfig({ lines: [] }).lines, DEFAULT_CONFIG.lines);
});

test("the default palettePreset is tokyo-night", () => {
  assert.equal(DEFAULT_CONFIG.palettePreset, "tokyo-night");
});

test("parseConfig accepts mono as a legal palettePreset", () => {
  assert.equal(parseConfig({ palettePreset: "mono" }).palettePreset, "mono");
  assert.equal(parseConfig({ palettePreset: "tokyo-night" }).palettePreset, "tokyo-night");
});

test("parseConfig falls back to tokyo-night for an unknown palettePreset", () => {
  assert.equal(parseConfig({ palettePreset: "dracula" }).palettePreset, "tokyo-night");
  assert.equal(parseConfig({ palettePreset: 7 }).palettePreset, "tokyo-night");
  assert.equal(parseConfig({}).palettePreset, "tokyo-night");
});

test("detectFooterConflicts catches the known footer-grabbing package", () => {
  assert.deepEqual(detectFooterConflicts(["npm:@narumitw/pi-statusline"]), [
    "npm:@narumitw/pi-statusline",
  ]);
});

test("detectFooterConflicts matches on a marker rather than a whitelist, catching unseen packages", () => {
  assert.deepEqual(detectFooterConflicts(["npm:some-other-statusline"]), [
    "npm:some-other-statusline",
  ]);
  assert.deepEqual(detectFooterConflicts(["git:example/fancy-footer"]), [
    "git:example/fancy-footer",
  ]);
  assert.deepEqual(detectFooterConflicts(["npm:PI-StatusLine-Pro"]), ["npm:PI-StatusLine-Pro"]);
});

test("detectFooterConflicts never counts this package as a conflict", () => {
  assert.deepEqual(detectFooterConflicts(["npm:pi-statusline-hud"]), []);
  assert.deepEqual(detectFooterConflicts(["git:example/pi-statusline-hud"]), []);
});

test("detectFooterConflicts ignores packages unrelated to the footer", () => {
  assert.deepEqual(detectFooterConflicts(["npm:pi-notes", "git:example/pi-lint"]), []);
});

test("detectFooterConflicts returns an empty array for a non-array", () => {
  assert.deepEqual(detectFooterConflicts(undefined), []);
  assert.deepEqual(detectFooterConflicts(null), []);
  assert.deepEqual(detectFooterConflicts("npm:@narumitw/pi-statusline"), []);
  assert.deepEqual(detectFooterConflicts({ packages: [] }), []);
});

test("detectFooterConflicts does not throw on non-string elements", () => {
  assert.deepEqual(detectFooterConflicts([1, null, { name: "statusline" }, "npm:x-statusline"]), [
    "npm:x-statusline",
  ]);
});

test("detectFooterConflicts reports a duplicated spec once", () => {
  assert.deepEqual(detectFooterConflicts(["npm:a-statusline", "npm:a-statusline"]), [
    "npm:a-statusline",
  ]);
});

test("agentSettingsPath is built from agentDir", () => {
  assert.equal(agentSettingsPath("/base/agent"), "/base/agent/settings.json");
});

test("detectFooterConflicts recognises the object form of a packages entry", () => {
  assert.deepEqual(
    detectFooterConflicts([{ source: "npm:@narumitw/pi-statusline", extensions: ["./x.ts"] }]),
    ["npm:@narumitw/pi-statusline"],
  );
  assert.deepEqual(detectFooterConflicts([{ source: "npm:@narumitw/pi-statusline" }]), [
    "npm:@narumitw/pi-statusline",
  ]);
});

test("detectFooterConflicts reports both forms in order when strings and objects are mixed", () => {
  assert.deepEqual(
    detectFooterConflicts([
      "npm:pi-notes",
      { source: "npm:@narumitw/pi-statusline" },
      "npm:other-statusline",
    ]),
    ["npm:@narumitw/pi-statusline", "npm:other-statusline"],
  );
});

test("detectFooterConflicts does not count this package in object form as a conflict", () => {
  assert.deepEqual(detectFooterConflicts([{ source: "npm:pi-statusline-hud" }]), []);
  assert.deepEqual(detectFooterConflicts([{ source: "git:example/pi-statusline-hud" }]), []);
});

test("detectFooterConflicts skips objects with a missing or non-string source", () => {
  assert.deepEqual(
    detectFooterConflicts([{ name: "statusline" }, { source: 1 }, { source: null }]),
    [],
  );
});

test("detectFooterConflicts reports once when an object and a string name the same spec", () => {
  assert.deepEqual(
    detectFooterConflicts(["npm:a-statusline", { source: "npm:a-statusline" }]),
    ["npm:a-statusline"],
  );
});


test("sessionBar defaults to on and accepts on/off as well as the old booleans", () => {
  assert.equal(parseConfig({}).sessionBar, true);
  assert.equal(parseConfig({ sessionBar: "off" }).sessionBar, false);
  assert.equal(parseConfig({ sessionBar: "on" }).sessionBar, true);
  assert.equal(parseConfig({ sessionBar: false }).sessionBar, false);
  assert.equal(parseConfig({ sessionBar: "nonsense" }).sessionBar, true);
});

test("positiveInt floors before validating — a fraction between 0 and 1 must not pass", () => {
  assert.equal(parseConfig({ sessionBudget: 0.5 }).sessionBudget, DEFAULT_CONFIG.sessionBudget);
  assert.equal(parseConfig({ maxToolEntries: 0.9 }).maxToolEntries, DEFAULT_CONFIG.maxToolEntries);
  assert.equal(parseConfig({ maxToolEntries: 3.7 }).maxToolEntries, 3);
});

test("lines are deduped — the same line twice must not render two rows", () => {
  assert.deepEqual(parseConfig({ lines: ["header", "header", "status"] }).lines, [
    "header",
    "status",
  ]);
});
