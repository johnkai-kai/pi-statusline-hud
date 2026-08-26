import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RAINBOW_PERIOD_MS,
  RAINBOW_TARGETS,
  isRainbowTarget,
  rainbowHex,
  paintRainbow,
} from "../src/rainbow.ts";

const HEX = /^#[0-9a-f]{6}$/;

test("what comes back is always a legal six-digit hex colour", () => {
  for (let i = 0; i < 12; i += 1) assert.match(rainbowHex(i, 12, 0), HEX);
});

test("neighbouring characters in one element differ in hue — that is what a gradient is", () => {
  const a = rainbowHex(0, 8, 0);
  const b = rainbowHex(1, 8, 0);
  assert.notEqual(a, b);
});

test("one element spans a full hue rotation: the ends wrap to the same colour", () => {
  assert.equal(rainbowHex(0, 6, 0), rainbowHex(6, 6, 0));
});

test("advancing time shifts the whole thing — that is the flow", () => {
  const still = rainbowHex(0, 8, 0);
  const later = rainbowHex(0, 8, RAINBOW_PERIOD_MS / 4);
  assert.notEqual(still, later);
});

test("a full period of time returns to the start", () => {
  assert.equal(rainbowHex(2, 8, 0), rainbowHex(2, 8, RAINBOW_PERIOD_MS));
});

test("zero or illegal lengths do not blow up; a single colour is returned", () => {
  assert.match(rainbowHex(0, 0, 0), HEX);
  assert.match(rainbowHex(3, Number.NaN, 0), HEX);
});

test("paintRainbow colours per character and the text is still readable", () => {
  const painted = paintRainbow("abc", 0);
  assert.equal(painted.replace(/\u001b\[[0-9;]*m/g, ""), "abc");
  const codes = painted.match(/\u001b\[38;2;\d+;\d+;\d+m/g) ?? [];
  assert.equal(codes.length, 3, "three characters, three colour codes");
  assert.equal(new Set(codes).size, 3, "the three colours must differ");
});

test("paintRainbow works per code point and never splits an emoji", () => {
  const painted = paintRainbow("a\u{1F600}b", 0);
  assert.equal(painted.replace(/\u001b\[[0-9;]*m/g, ""), "a\u{1F600}b");
  assert.equal((painted.match(/\u001b\[38;2;/g) ?? []).length, 3);
});

test("an empty string comes back empty, leaving no orphan escape", () => {
  assert.equal(paintRainbow("", 0), "");
});

test("the target list is named, and recognises its own", () => {
  assert.ok(RAINBOW_TARGETS.includes("model"));
  assert.ok(RAINBOW_TARGETS.includes("speed"));
  assert.ok(isRainbowTarget("motto"));
  assert.ok(!isRainbowTarget("dog"));
});

// --- Config layer ---
import { DEFAULT_CONFIG, parseConfig } from "../src/config.ts";

test("off by default — nothing should move on screen unasked", () => {
  assert.deepEqual(DEFAULT_CONFIG.rainbow, []);
});

test("loading the config keeps only recognised targets and drops the rest", () => {
  const config = parseConfig({ rainbow: ["model", "dog", "speed", "model"] });
  assert.deepEqual(config.rainbow, ["model", "speed"]);
});

test("a non-array rainbow falls back to the default instead of throwing", () => {
  assert.deepEqual(parseConfig({ rainbow: "all" }).rainbow, []);
});

// --- Render layer ---
import { paintSpans, renderSpans, type Span } from "../src/lines/types.ts";

test("a span without the rainbow flag takes the original path and emits identical bytes", () => {
  const spans: Span[] = [{ text: "abc", color: "#ff0000" }, { text: " x", color: null }];
  assert.equal(paintSpans(spans, 1234), paintSpans(spans, 0));
  assert.equal(paintSpans(spans, 999), paintSpans(spans));
});

test("a flagged span is coloured per character and changes over time", () => {
  const spans: Span[] = [{ text: "abcd", color: "#ff0000", rainbow: true }];
  const a = paintSpans(spans, 0);
  const b = paintSpans(spans, RAINBOW_PERIOD_MS / 3);
  assert.equal(a.replace(/\u001b\[[0-9;]*m/g, ""), "abcd");
  assert.notEqual(a, b, "advancing time must change the screen");
  assert.equal((a.match(/\u001b\[38;2;/g) ?? []).length, 4);
});

test("rainbow and ordinary spans can share one line", () => {
  const spans: Span[] = [
    { text: "模型 ", color: "#00ffff" },
    { text: "gpt", color: "#00ffff", rainbow: true },
  ];
  assert.equal(paintSpans(spans, 0).replace(/\u001b\[[0-9;]*m/g, ""), "模型 gpt");
});

test("still a rainbow after truncation — fitSpans must not lose the flag", () => {
  const spans: Span[] = [{ text: "abcdefgh", color: null, rainbow: true }];
  const out = renderSpans(spans, 4, 0);
  assert.equal(out.replace(/\u001b\[[0-9;]*m/g, ""), "abcd");
  assert.ok(out.includes("\u001b[38;2;"));
});

// --- Settings page ---
import {
  RAINBOW_ITEM_PREFIX,
  applySettingChange,
  buildSettingItems,
  rainbowItems,
} from "../src/settings-items.ts";

test("the main menu has a rainbow row showing how many are selected", () => {
  const spec = buildSettingItems({ ...DEFAULT_CONFIG, rainbow: ["model", "speed"] })
    .find((item) => item.id === "rainbow");
  assert.ok(spec !== undefined, "the main menu is missing the rainbow row");
  assert.equal(spec.kind, "rainbow");
  assert.match(spec.currentValue, /2\//);
});

test("the rainbow subpage has one row per target, showing off for the disabled ones", () => {
  const items = rainbowItems({ ...DEFAULT_CONFIG, rainbow: ["speed"] });
  assert.equal(items.length, RAINBOW_TARGETS.length);
  assert.equal(items.find((i) => i.id === `${RAINBOW_ITEM_PREFIX}speed`)?.currentValue, "on");
  assert.equal(items.find((i) => i.id === `${RAINBOW_ITEM_PREFIX}model`)?.currentValue, "off");
  for (const item of items) assert.ok(item.description.length > 0, `${item.id} has no description`);
});

test("enabling a target adds it to the list and disabling removes it", () => {
  const on = applySettingChange(DEFAULT_CONFIG, `${RAINBOW_ITEM_PREFIX}motto`, "on");
  assert.deepEqual(on.config.rainbow, ["motto"]);
  const off = applySettingChange(on.config, `${RAINBOW_ITEM_PREFIX}motto`, "off");
  assert.deepEqual(off.config.rainbow, []);
});

test("the list follows RAINBOW_TARGETS order, not the order of keystrokes", () => {
  let config = DEFAULT_CONFIG;
  for (const id of ["cost", "model", "speed"]) {
    config = applySettingChange(config, `${RAINBOW_ITEM_PREFIX}${id}`, "on").config;
  }
  assert.deepEqual(config.rainbow, ["model", "speed", "cost"]);
});

test("an unrecognised rainbow target is refused and the config is untouched", () => {
  const result = applySettingChange(DEFAULT_CONFIG, `${RAINBOW_ITEM_PREFIX}dog`, "on");
  assert.ok(result.rejected !== undefined);
  assert.deepEqual(result.config.rainbow, []);
});

test("enabling the same target twice does not create two entries", () => {
  const once = applySettingChange(DEFAULT_CONFIG, `${RAINBOW_ITEM_PREFIX}cache`, "on").config;
  const twice = applySettingChange(once, `${RAINBOW_ITEM_PREFIX}cache`, "on").config;
  assert.deepEqual(twice.rainbow, ["cache"]);
});

// --- Wizard ---
import { menuEntries, parseRainbowOption, rainbowOptions } from "../src/wizard.ts";

test("the wizard main menu has a rainbow item whose label carries the count", () => {
  const entry = menuEntries({ ...DEFAULT_CONFIG, rainbow: ["model"] })
    .find((e) => e.key === "rainbow");
  assert.ok(entry !== undefined, "the wizard menu is missing the rainbow");
  assert.match(entry.label, /1\/10/);
});

test("the wizard's rainbow options have one row per target with its state", () => {
  const options = rainbowOptions({ ...DEFAULT_CONFIG, rainbow: ["cost"] });
  assert.equal(options.length, RAINBOW_TARGETS.length);
  assert.ok(options.some((o) => o.startsWith("cost  [")));
  assert.equal(parseRainbowOption(options.find((o) => o.startsWith("cost")) ?? ""), "cost");
  assert.equal(parseRainbowOption("dog  [on]"), null);
});

// --- Animation tick ---
import { FRAME_MS, IDLE_STOP_MS, shouldAnimate } from "../src/collect/animation.ts";

test("with no target enabled there should be no animation at all", () => {
  assert.equal(shouldAnimate(0, 0), false);
  assert.equal(shouldAnimate(0, IDLE_STOP_MS * 10), false);
});

test("enabled and recently active, it runs", () => {
  assert.equal(shouldAnimate(1, 0), true);
  assert.equal(shouldAnimate(3, IDLE_STOP_MS - 1), true);
});

test("long enough idle and it stops — nothing should repaint while nobody watches", () => {
  assert.equal(shouldAnimate(1, IDLE_STOP_MS), false);
  assert.equal(shouldAnimate(1, IDLE_STOP_MS + 5_000), false);
});

test("the tick and the idle threshold are exported constants, and the tick is far below the threshold", () => {
  assert.ok(FRAME_MS >= 50 && FRAME_MS <= 200, `${FRAME_MS}`);
  assert.ok(IDLE_STOP_MS > FRAME_MS * 100);
});
