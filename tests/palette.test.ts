import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.ts";
import {
  type Palette,
  type PaletteName,
  PALETTES,
  paint,
  visibleLength,
  truncateAnsi,
  padBetween,
  resolvePalette,
  paletteFor,
  forLightBackground,
  PALETTE_NAMES,
} from "../src/palette.ts";

const ESC = "\u001b";
const RESET = `${ESC}[0m`;
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");
const ROLES = ["cyan", "orange", "blue", "green", "amber", "red", "fg", "dim", "track"] as const;

test("PALETTES provides the nine roles of tokyo-night", () => {
  const p = PALETTES["tokyo-night"];
  for (const role of ROLES) {
    assert.match(p[role] ?? "", /^#[0-9a-f]{6}$/, `${role} should be hex`);
  }
  assert.equal(p.cyan, "#7dcfff");
  assert.equal(p.orange, "#ff9e64");
  assert.equal(p.blue, "#7aa2f7");
  assert.equal(p.green, "#9ece6a");
  assert.equal(p.amber, "#e0af68");
  assert.equal(p.red, "#f7768e");
  assert.equal(p.fg, "#c0caf5");
  assert.equal(p.dim, "#366682");
  assert.equal(p.track, "#6c79b2");
});

test("every role of the mono palette is null", () => {
  const p = PALETTES.mono;
  for (const role of ROLES) {
    assert.equal(p[role], null, `${role} should be null`);
  }
});

test("paint wraps in a truecolor sequence", () => {
  assert.equal(paint("#7dcfff", "hi"), `${ESC}[38;2;125;207;255mhi${RESET}`);
  assert.equal(paint("#000000", "x"), `${ESC}[38;2;0;0;0mx${RESET}`);
});

test("paint returns null and empty strings untouched", () => {
  assert.equal(paint(null, "hi"), "hi");
  assert.equal(paint("#7dcfff", ""), "");
  assert.equal(paint(null, ""), "");
});

test("paint returns the text as is for an unparseable hex", () => {
  assert.equal(paint("nope", "hi"), "hi");
  assert.equal(paint("#12345", "hi"), "hi");
});

test("visibleLength ignores ANSI escape sequences", () => {
  assert.equal(visibleLength("abc"), 3);
  assert.equal(visibleLength(paint("#7dcfff", "abc")), 3);
  assert.equal(visibleLength(`${ESC}[38;2;1;2;3mab${RESET}${ESC}[1mcd${RESET}`), 4);
  assert.equal(visibleLength(`${ESC}[2Kabc`), 3);
  assert.equal(visibleLength(""), 0);
});

test("visibleLength counts wide characters in terminal columns", () => {
  assert.equal(visibleLength("\u2588\u2588"), 2);
  assert.equal(visibleLength("\u00b7"), 1);
  assert.equal(visibleLength("\u2502"), 1);
  assert.equal(visibleLength("\u23f1"), 1);
  // Mixed script: CJK takes two columns, ASCII one. All-ASCII would test nothing.
  assert.equal(visibleLength("中文 mix"), 8);
  assert.equal(visibleLength(paint("#ff9e64", "中文字")), 6);
});

test("truncateAnsi returns the text as is when it fits", () => {
  assert.equal(truncateAnsi("abc", 3), "abc");
  assert.equal(truncateAnsi("abc", 10), "abc");
  const painted = paint("#7dcfff", "abc");
  assert.equal(truncateAnsi(painted, 5), painted);
});

test("truncateAnsi never cuts an escape sequence in half", () => {
  const input = `${ESC}[38;2;125;207;255mabcdef${RESET}`;
  const out = truncateAnsi(input, 3);
  assert.equal(visibleLength(out), 3);
  assert.ok(out.startsWith(`${ESC}[38;2;125;207;255m`), "the opening sequence should survive intact");
  assert.ok(out.endsWith(RESET), "a reset should be appended after truncation");
  assert.equal(strip(out), "abc");
  assert.ok(!/\u001b\[[0-9;]*$/.test(out), "no half sequence may be left behind");
});

test("truncateAnsi does not overflow on a wide character straddling the boundary", () => {
  const out = truncateAnsi("a愷b", 2);
  assert.equal(visibleLength(out), 1);
  assert.equal(strip(out), "a");
  assert.equal(visibleLength(truncateAnsi("愷加", 3)), 2);
  assert.equal(strip(truncateAnsi("愷加", 3)), "愷");
});

test("truncateAnsi returns an empty string for zero or negative width", () => {
  assert.equal(truncateAnsi("abc", 0), "");
  assert.equal(truncateAnsi("abc", -5), "");
});

test("truncateAnsi appends no reset when there is no colour", () => {
  assert.equal(truncateAnsi("abcdef", 3), "abc");
  assert.equal(truncateAnsi("\u2588\u2588\u2588", 2), "\u2588\u2588");
});

test("control characters take no columns in visibleLength", () => {
  assert.equal(visibleLength("a\u0007b"), 2);
  assert.equal(visibleLength("a\u000db"), 2);
  assert.equal(visibleLength("a\u001bb"), 2);
});

test("visibleLength and truncateAnsi handle surrogate pairs correctly", () => {
  assert.equal(visibleLength("\ud83d\ude80"), 2);
  const out = truncateAnsi("a\ud83d\ude80b", 2);
  assert.equal(visibleLength(out), 1);
  assert.equal(strip(out), "a");
  assert.ok(!/[\ud800-\udfff]/.test(out), "no lone surrogate may be left behind");
});

test("padBetween pads out to the given display width", () => {
  const out = padBetween("left", "right", 20);
  assert.equal(visibleLength(out), 20);
  assert.equal(out, "left" + " ".repeat(11) + "right");
});

test("padBetween gets the width right for coloured segments", () => {
  const left = paint("#7dcfff", "model");
  const right = paint("#9ece6a", "master");
  const out = padBetween(left, right, 40);
  assert.equal(visibleLength(out), 40);
  assert.ok(out.startsWith(left));
  assert.ok(out.endsWith(right));
});

test("padBetween does not force extra columns when a segment is empty", () => {
  assert.equal(padBetween("left", "", 10), "left      ");
  assert.equal(visibleLength(padBetween("", "right", 10)), 10);
  assert.equal(visibleLength(padBetween("", "", 10)), 10);
});

test("padBetween truncates the right segment first and keeps one space when width is short", () => {
  const out = padBetween("leftside", "rightside", 12);
  assert.equal(visibleLength(out), 12);
  assert.equal(strip(out), "leftside rig");
});

test("padBetween drops the right segment and truncates the left at extreme narrowness", () => {
  const out = padBetween("leftside", "rightside", 5);
  assert.ok(visibleLength(out) <= 5);
  assert.equal(strip(out), "lefts");
  assert.equal(padBetween("leftside", "rightside", 0), "");
});

test("visibleLength counts only the Emoji_Presentation clock symbols as two columns", () => {
  assert.equal(visibleLength("\u23f0"), 2);
  assert.equal(visibleLength("\u23f3"), 2);
  assert.equal(visibleLength("\u23f1"), 1);
  assert.equal(visibleLength("\u23f2"), 1);
  assert.equal(visibleLength("\u23f1\ufe0f"), 2);
});

test("visibleLength recognises BMP Emoji_Presentation symbols as two columns", () => {
  assert.equal(visibleLength("\u2705"), 2);
  assert.equal(visibleLength("\u26a1"), 2);
  assert.equal(visibleLength("\u2b50"), 2);
  assert.equal(visibleLength("\u274c"), 2);
  assert.equal(visibleLength("\u26a0\ufe0f"), 2);
});

test("visibleLength keeps text-presentation typographic symbols at one column", () => {
  for (const ch of ["\u2588", "\u2502", "\u00b7", "\u221a", "\u25b6", "\u2717", "\u2026"]) {
    assert.equal(visibleLength(ch), 1, `${JSON.stringify(ch)} should be one column`);
  }
  assert.equal(visibleLength("\u25b6\u25b6"), 2);
});

test("visibleLength counts combining marks and ZWJ sequences by grapheme cluster", () => {
  assert.equal(visibleLength("\u{1F468}\u200d\u{1F4BB}"), 2);
  assert.equal(visibleLength("\u{1F469}\u200d\u{1F469}\u200d\u{1F467}"), 2);
  assert.equal(visibleLength("a\u0951b"), 2);
  assert.equal(visibleLength("e\u0301"), 1);
});

test("truncateAnsi does not split a grapheme cluster", () => {
  const zwj = "a\u{1F468}\u200d\u{1F4BB}";
  const out = truncateAnsi(zwj, 2);
  assert.equal(out, "a");
  assert.ok(!out.includes("\u200d"), "no dangling ZWJ may be left behind");
  assert.equal(truncateAnsi(zwj, 3), zwj);
});

test("truncateAnsi does not exceed the requested width for a two-column emoji", () => {
  const out = truncateAnsi("\u2705\u2705\u2705\u2705\u2705", 5);
  assert.equal(visibleLength(out), 4);
  assert.equal(out, "\u2705\u2705");
});

test("C1 control characters take no columns in visibleLength", () => {
  assert.equal(visibleLength("a\u0085b"), 2);
  assert.equal(visibleLength("a\u009bb"), 2);
});

test("resolvePalette looks a palette up by name", () => {
  assert.equal(resolvePalette("tokyo-night"), PALETTES["tokyo-night"]);
  assert.equal(resolvePalette("mono"), PALETTES.mono);
});

test("resolvePalette falls back to tokyo-night for an unknown name", () => {
  assert.equal(resolvePalette("nord"), PALETTES["tokyo-night"]);
  assert.equal(resolvePalette(""), PALETTES["tokyo-night"]);
  assert.equal(resolvePalette("MONO"), PALETTES["tokyo-night"]);
});

test("palettePreset from the config reaches resolvePalette", () => {
  assert.equal(resolvePalette(parseConfig({ palettePreset: "mono" }).palettePreset), PALETTES.mono);
  assert.equal(
    resolvePalette(parseConfig({ palettePreset: "dracula" }).palettePreset),
    PALETTES["tokyo-night"],
  );
});

test("any value in NO_COLOR forces mono; otherwise the chosen palette applies", () => {
  assert.equal(paletteFor("triad", { NO_COLOR: "1" }), PALETTES.mono);
  assert.equal(paletteFor("triad", { NO_COLOR: "" }), PALETTES.triad);
  assert.equal(paletteFor("triad", {}), PALETTES.triad);
});

test("terminal capability is no longer sniffed — colour still applies without COLORTERM or WT_SESSION", () => {
  assert.equal(paletteFor("tokyo-night", { TERM: "dumb" }), PALETTES["tokyo-night"]);
});

// Visibility of the empty slot in a bar.
//
// The nine original palettes had track at only 1.03-1.44 against a dark background, and the
// measured result was that under contra a ten-cell empty Session bar was entirely invisible,
// leaving a blank stretch on screen — it read as broken, not as 0%.
//
// The 3:1 threshold is the figure for a solid colour. Drawn with ░ at roughly a quarter
// coverage, perceived contrast is much lower, so the real value is set near 4:1 for margin.
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_BG = "#1e1e1e";

test("every palette's track is at least 3:1 against dark — an invisible slot is no bar at all", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    if (palette.track === null) continue;
    const ratio = contrast(palette.track, DARK_BG);
    assert.ok(ratio >= 3, `${name}'s track ${palette.track} is only ${ratio.toFixed(2)}:1`);
  }
});

test("track must still be darker than fg — an empty slot cannot look as bright as a full one", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    if (palette.track === null || palette.fg === null) continue;
    assert.ok(
      relativeLuminance(palette.track) < relativeLuminance(palette.fg),
      `${name}'s track is brighter than its fg`,
    );
  }
});

// ---- Light terminals ----
//
// Every colour palette is tuned for dark and hits only 1.17-2.48 against white: labels survive,
// values do not. pi has OSC 11 background detection and a built-in light theme, so it happens.
//
// The light variants are derived rather than a second hand-written set: each role keeps its hue
// and is darkened until it clears against white. Hand-writing doubles the debt, and hues drift.

const LIGHT_BG = "#ffffff";

test("every palette derives a light variant readable against white", () => {
  for (const name of PALETTE_NAMES) {
    const light = forLightBackground(resolvePalette(name));
    for (const role of ["cyan", "orange", "blue", "green", "amber", "red", "fg"] as const) {
      const value = light[role];
      if (value === null) continue;
      const ratio = contrast(value, LIGHT_BG);
      assert.ok(ratio >= 4.5, `${name}.${role} = ${value} is only ${ratio.toFixed(2)}:1 against white`);
    }
    if (light.dim !== null) {
      assert.ok(contrast(light.dim, LIGHT_BG) >= 3, `${name}.dim is under 3:1 against white`);
    }
    if (light.track !== null) {
      assert.ok(contrast(light.track, LIGHT_BG) >= 3, `${name}.track is under 3:1 against white`);
    }
  }
});

test("mono has no colour to darken and stays all null after derivation", () => {
  assert.deepEqual(forLightBackground(PALETTES.mono), PALETTES.mono);
});

test("derivation preserves the hue — it does not push every role to black", () => {
  const light = forLightBackground(PALETTES["tokyo-night"]);
  const hue = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    return Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
  };
  for (const role of ["cyan", "orange", "green", "red"] as const) {
    const before = PALETTES["tokyo-night"][role];
    const after = light[role];
    assert.ok(before !== null && after !== null);
    assert.ok(
      Math.abs(hue(before) - hue(after)) < 0.2,
      `${role}'s hue drifted: ${before} -> ${after}`,
    );
  }
});

test("the semantic colours stay distinguishable in the light variant", () => {
  const light = forLightBackground(PALETTES["tokyo-night"]);
  assert.notEqual(light.green, light.amber);
  assert.notEqual(light.amber, light.red);
});

// ---- dim is part of the palette, not a shared grey ----
//
// dim alone covers 31.8% of the screen (labels, separators and counts are all dim), closer to
// half than the six theme colours combined. Across the nine original palettes the pairwise
// median dim distance was 11.3 and the closest pair 2.7 — the biggest thing on screen barely
// moved between palettes, and it felt like "the theme is not distinct enough".
function labOf(hex: string): [number, number, number] {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a: string, b: string): number {
  const p = labOf(a);
  const q = labOf(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const COLOURED = PALETTE_NAMES.filter((name) => name !== "mono");

test("every palette's dim is distinguishable — the biggest single thing a palette switch changes", () => {
  for (let i = 0; i < COLOURED.length; i += 1) {
    for (let j = i + 1; j < COLOURED.length; j += 1) {
      const a = PALETTES[COLOURED[i]].dim;
      const b = PALETTES[COLOURED[j]].dim;
      assert.ok(a !== null && b !== null);
      const diff = deltaE(a, b);
      assert.ok(diff >= 6, `${COLOURED[i]} and ${COLOURED[j]} have dims only ${diff.toFixed(1)} apart`);
    }
  }
});

test("dim must not resemble any semantic colour — it is background information, not a signal", () => {
  for (const name of COLOURED) {
    const palette = PALETTES[name];
    for (const role of ["cyan", "orange", "blue", "green", "amber", "red"] as const) {
      const accent = palette[role];
      assert.ok(palette.dim !== null && accent !== null);
      const diff = deltaE(palette.dim, accent);
      assert.ok(diff >= 20, `${name}'s dim is only ${diff.toFixed(1)} from ${role}`);
    }
  }
});

test("dim must still be visible — tuning the hue must not cost the lightness", () => {
  for (const name of COLOURED) {
    const dim = PALETTES[name].dim;
    assert.ok(dim !== null);
    assert.ok(contrast(dim, DARK_BG) >= 2, `${name}'s dim is only ${contrast(dim, DARK_BG).toFixed(2)} against dark`);
  }
});

// ---- Palettes must genuinely differ ----
//
// This is where the rework came from. Across the old nine, the three roles covering 70% of the
// screen (dim 31.8%, fg 21.0%, track 17.4%) were pairwise almost identical — the closest track
// pair differed by 0.009 OKLab, which is the same colour. It felt like "switching changed
// nothing", because only 18% of the screen was really changing.
//
// Weighted distance rather than role by role: a role that differs a lot but covers 2% of the
// screen is invisible. The weights come from the measured visible-cell share of a typical HUD.
const SCREEN_SHARE: Record<string, number> = {
  dim: 0.318, fg: 0.21, track: 0.174, cyan: 0.09,
  green: 0.065, blue: 0.05, orange: 0.043, amber: 0.03, red: 0.02,
};

function oklabOf(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function perceived(a: Palette, b: Palette): number {
  let total = 0;
  for (const [role, share] of Object.entries(SCREEN_SHARE)) {
    const x = a[role as keyof Palette];
    const y = b[role as keyof Palette];
    if (x === null || y === null) continue;
    const p = oklabOf(x);
    const q = oklabOf(y);
    total += share * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return total;
}

test("every pair of palettes must exceed the closest pair of the old version", () => {
  // 0.0488 is the most alike pair among the old nine (dusk ~ single). The point of putting it
  // here: after the rework, even the closest pair must be less alike than the closest pair before.
  const FLOOR = 0.0488;
  for (let i = 0; i < COLOURED.length; i += 1) {
    for (let j = i + 1; j < COLOURED.length; j += 1) {
      const d = perceived(PALETTES[COLOURED[i]], PALETTES[COLOURED[j]]);
      assert.ok(d > FLOOR, `${COLOURED[i]} and ${COLOURED[j]} are only ${d.toFixed(4)} apart`);
    }
  }
});

test("semantic hues must not drift — switching palettes must not make anyone relearn red", () => {
  const hueOf = (hex: string): number => {
    const [, a, b] = oklabOf(hex);
    return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  };
  const chroma = (hex: string): number => {
    const [, a, b] = oklabOf(hex);
    return Math.hypot(a, b);
  };
  // The minimal palettes deliberately fade some semantic colours to grey (colour carries no
  // signal), and a grey has no meaningful hue. The threshold is six tenths of the most saturated
  // of that palette's three semantic colours, not a figure picked out of the air — an absolute
  // threshold misfires as recipes are tuned (measured, min-alert-dark's deliberately greyed green
  // has chroma 0.0405, which just clears 0.04 and gets compared as a real green).
  const meaningful = (name: PaletteName, role: "green" | "amber" | "red"): boolean => {
    const value = PALETTES[name][role];
    if (value === null) return false;
    const peak = Math.max(
      ...(["green", "amber", "red"] as const).map((r) => {
        const v = PALETTES[name][r];
        return v === null ? 0 : chroma(v);
      }),
    );
    return chroma(value) >= Math.max(0.045, peak * 0.6);
  };
  for (const role of ["green", "amber", "red"] as const) {
    const hues: Array<[PaletteName, number]> = [];
    for (const name of COLOURED) {
      const value = PALETTES[name][role];
      assert.ok(value !== null);
      if (!meaningful(name, role)) continue;
      hues.push([name, hueOf(value)]);
    }
    for (const [name, hue] of hues) {
      for (const [other, otherHue] of hues) {
        const gap = Math.abs(hue - otherHue);
        assert.ok(
          Math.min(gap, 360 - gap) < 45,
          `${role}'s hue differs by ${gap.toFixed(0)} degrees between ${name} and ${other}`,
        );
      }
    }
  }
});
