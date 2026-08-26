import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPES, buildPalette, readable } from "../src/palette-recipe.ts";

const ROLES = ["cyan", "orange", "blue", "green", "amber", "red", "fg", "dim", "track"] as const;
const DARK_BG = "#1e1e1e";

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("every recipe produces nine legal hex colours", () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const palette = buildPalette(recipe);
    for (const role of ROLES) {
      assert.match(palette[role], /^#[0-9a-f]{6}$/, `${name}.${role} = ${palette[role]}`);
    }
  }
});

test("the readability floor is held at generation time, not checked afterwards", () => {
  const floors: Record<string, number> = { track: 4, dim: 3, fg: 7 };
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const palette = buildPalette(recipe);
    for (const role of ROLES) {
      const need = floors[role] ?? 4.5;
      const got = contrast(palette[role], DARK_BG);
      assert.ok(got >= need - 0.01, `${name}.${role} is only ${got.toFixed(2)}:1, needs ${need}`);
    }
  }
});

test("however dark a recipe is written, it gets lifted — the floor stops human error", () => {
  // Lightness 0.05 is guaranteed invisible; readable must lift it until it clears.
  const hex = readable("track", 0.05, 0.05, 200);
  assert.ok(contrast(hex, DARK_BG) >= 4, `after lifting it is only ${contrast(hex, DARK_BG).toFixed(2)}:1`);
});

test("track is always darker than fg — an empty slot must not look as bright as a full one", () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const p = buildPalette(recipe);
    assert.ok(luminance(p.track) < luminance(p.fg), `${name}'s track is brighter than its fg`);
  }
});

// Minimal means "tinted grey", not pure grey, so these assert relations rather than absolute
// distances: the theme colours are equally quiet, the semantic ones clearly stand out. An
// absolute threshold would read min-alert-dark's blue-tinted grey as coloured.
const chroma = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b);
};

test("a minimal recipe's theme colours are equally quiet; only the semantic ones stand out", () => {
  const p = buildPalette(RECIPES["min-paper"]);
  const grey = chroma(p.cyan);
  for (const role of ["orange", "blue", "green"] as const) {
    assert.ok(chroma(p[role]) < grey * 2 + 12, `${role} should not be louder than the theme grey`);
  }
  assert.ok(chroma(p.red) > grey * 2, `red must stand out; theme grey ${grey} against red ${chroma(p.red)}`);
});

test("alerts:none keeps even the semantic colours as quiet as the theme grey — colour never appears", () => {
  const p = buildPalette(RECIPES["min-zero"]);
  const grey = chroma(p.cyan);
  for (const role of ROLES) {
    assert.ok(chroma(p[role]) <= grey + 12, `${role} distance ${chroma(p[role])} exceeds the theme grey ${grey}`);
  }
});

test("alerts:warn colours bad news only — green matches the theme grey, red and amber stand out", () => {
  const p = buildPalette(RECIPES["min-alert-dark"]);
  const grey = chroma(p.cyan);
  assert.ok(chroma(p.green) <= grey + 12, `green ${chroma(p.green)} should match the theme grey ${grey}`);
  assert.ok(chroma(p.red) > grey * 2, `red must stand out; got ${chroma(p.red)} against grey ${grey}`);
  assert.ok(chroma(p.amber) > grey * 2, `amber must stand out; got ${chroma(p.amber)} against grey ${grey}`);
});

test("the same recipe twice gives the same result — a pure function, so it can be tested", () => {
  assert.deepEqual(buildPalette(RECIPES.jade), buildPalette(RECIPES.jade));
});
