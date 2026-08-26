// The palette recipe. The nine roles are derived from four parameters instead of hand-written.
//
// Why derive: measured across the nine hand-written palettes, the three roles covering 70% of
// the screen (dim 31.8%, fg 21.0%, track 17.4%) had pairwise median OKLab distances of only
// 0.075 / 0.056 / 0.040, and the closest track pair was 0.009 — the biggest thing on screen
// barely moved between palettes, so switching looked like not switching. The cause was not
// bad colour choices: those three roles were hand-written separately in every palette, and
// hand-writing drifts back into the same grey. Derived from the hue, they cannot drift.
//
// Why OKLCH rather than HSL: OKLCH lightness is perceptually uniform, so the same L looks
// equally bright in yellow and in blue. The readability floor is held by lightness, and HSL
// lightness cannot hold it — HSL L=0.6 is glaring in yellow and dim in blue.

export type Scheme = "complement" | "analogous" | "split" | "triad" | "tetrad" | "monohue";

/** Which semantic colours keep their hue. The minimal styles use this to decide when colour appears at all. */
export type Alerts = "all" | "warn" | "none";

export interface Recipe {
  /** Base hue (the hue of the cyan role), 0-360. */
  hue: number;
  /** Where the two theme colours other than cyan sit on the wheel. */
  scheme: Scheme;
  /** Chroma multiplier. 0.4 for something as muted as dusk, 1.6 for something as loud as neon. */
  chroma: number;
  /** Lightness baseline for the theme colours. */
  light: number;
  /** Lightness offset for dim and track. Two palettes on adjacent hues use it to separate. */
  depth?: number;
  /**
   * Minimal mode: theme colours collapse to greyscale, layered only by lightness. The value is
   * how much chroma the semantic colours keep. Unset means normal mode (each theme colour gets
   * its own hue from the scheme).
   */
  neutral?: number;
  /** all: three semantic colours keep their colour; warn: only amber/red; none: all grey. */
  alerts?: Alerts;
}

// Semantic hues are pinned. Switching palettes must not make anyone relearn what red means —
// what varies is chroma and lightness (following the palette's own intensity), not the hue.
const SEMANTIC = { green: 148, amber: 85, red: 27 } as const;

const OFFSET: Record<Scheme, readonly [number, number, number]> = {
  complement: [0, 180, 20],
  analogous: [0, 40, -30],
  split: [0, 150, 25],
  triad: [0, 120, 240],
  tetrad: [0, 90, 180],
  monohue: [0, 14, -14],
};

// Readability floors, against the same base background as the existing track test — one ruler, not two.
//
// track 4:1 is not a guess: 3:1 is the threshold for a solid colour, but the bar is drawn with
// ░ at roughly a quarter coverage, where perceived contrast is much lower, so there is margin.
// The five hand-written palettes that survived all measure 3.98-4.02, so this is their existing
// standard rather than a new constraint.
const DARK_BG: readonly [number, number, number] = [0x1e, 0x1e, 0x1e];
const FLOOR: Record<string, number> = { track: 4.0, dim: 3.0, fg: 7.0 };
const DEFAULT_FLOOR = 4.5;

function toLinear(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function gamma(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function oklchToRgb(L: number, C: number, hue: number): [number, number, number] {
  const a = C * Math.cos((hue * Math.PI) / 180);
  const b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function toBytes(rgb: readonly [number, number, number]): [number, number, number] {
  return rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) as [number, number, number];
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A lot of OKLCH falls outside sRGB. Reduce chroma until it fits — better than reducing lightness, which holds readability. */
function clip(L: number, C: number, hue: number): [number, number, number] {
  let c = C;
  for (let i = 0; i < 220; i += 1) {
    const rgb = oklchToRgb(L, c, hue);
    if (rgb.every((v) => v >= -0.001 && v <= 1.001)) return toBytes(rgb);
    c *= 0.96;
  }
  return toBytes(oklchToRgb(L, 0, hue));
}

/**
 * A colour at a given hue and chroma that clears the threshold against a dark background.
 *
 * Symmetric with forLightBackground's darkenUntilReadable: that one darkens against white,
 * this one lightens against dark. With both in place, a wrong recipe cannot produce a palette
 * that is pretty but invisible — exactly the class of mistake hand-written hex cannot stop.
 */
export function readable(role: string, L: number, C: number, hue: number): string {
  const target = FLOOR[role] ?? DEFAULT_FLOOR;
  for (let l = Math.max(0, L); l <= 1; l += 0.004) {
    const rgb = clip(l, C, hue);
    if (contrast(rgb, DARK_BG) >= target) return toHex(rgb);
  }
  return toHex(clip(1, C, hue));
}

export interface RolePalette {
  cyan: string;
  orange: string;
  blue: string;
  green: string;
  amber: string;
  red: string;
  fg: string;
  dim: string;
  track: string;
}

export function buildPalette(recipe: Recipe): RolePalette {
  const { hue, scheme, chroma, light, depth = 0, neutral, alerts = "all" } = recipe;
  const [ch, oh, bh] = OFFSET[scheme].map((d) => (((hue + d) % 360) + 360) % 360);
  const accent = (c: number) => 0.135 * chroma * c;
  // The three base roles always follow the main hue. They cover 70% of the screen and are what
  // makes a palette switch visible at all — hand-written, they were nearly identical across
  // nine palettes, which is precisely why the themes looked alike.
  //
  // The minimal palettes raise dim's chroma instead: their theme colours all sit on one
  // greyscale, and dim is pinned to the same lightness by the 3:1 floor, so without a hue they
  // are intrinsically inseparable (measured, the four were 2.1 apart). And minimal means
  // "colour carries no signal", not "no colour" — a tinted grey label signals nothing, it is
  // just ground, so this does not break minimalism.
  const base = {
    fg: readable("fg", 0.9 + depth * 0.35, accent(neutral === undefined ? 0.22 : 0.15), ch),
    dim: readable("dim", 0.53 + depth, accent(neutral === undefined ? 0.56 : 1.6), ch),
    track: readable("track", 0.47 + depth, accent(neutral === undefined ? 0.41 : 0.8), ch),
  };
  const grey = (l: number) => readable("cyan", l, accent(1), ch);
  const semantic = (role: string, l: number, k: number, h: number) => readable(role, l, 0.135 * k, h);
  const strength = neutral ?? 1;
  const themed =
    neutral === undefined
      ? {
          cyan: readable("cyan", light, accent(1), ch),
          orange: readable("orange", light, accent(1), oh),
          blue: readable("blue", light, accent(0.9), bh),
        }
      : { cyan: grey(light), orange: grey(light - 0.13), blue: grey(light - 0.065) };
  const coloured = {
    green: semantic("green", light, strength * 0.95, SEMANTIC.green),
    amber: semantic("amber", light + 0.02, strength * 0.95, SEMANTIC.amber),
    red: semantic("red", light - 0.02, strength * 1.05, SEMANTIC.red),
  };
  if (alerts === "all") return { ...base, ...themed, ...coloured };
  // Colour only for bad news: green means "all fine", and fine does not need to be seen.
  if (alerts === "warn") {
    return { ...base, ...themed, green: grey(light - 0.02), amber: coloured.amber, red: coloured.red };
  }
  return {
    ...base,
    ...themed,
    green: grey(light - 0.02),
    amber: grey(light + 0.03),
    red: grey(light - 0.2),
  };
}

/**
 * Ten recipes. The hues are deliberately spread, then adjacent pairs separated further by
 * chroma and depth — measured, evenly distributing hue alone is not enough: two palettes on
 * adjacent hues come out close on every role, ending up more alike than the hand-written era.
 */
export const RECIPES: Record<string, Recipe> = {
  "deep-sea": { hue: 190, scheme: "complement", chroma: 1.15, light: 0.82, depth: -0.06 },
  jade: { hue: 150, scheme: "split", chroma: 0.88, light: 0.79, depth: 0.055 },
  "amber-crt": { hue: 75, scheme: "monohue", chroma: 1.2, light: 0.82, depth: -0.02 },
  lava: { hue: 30, scheme: "analogous", chroma: 1.35, light: 0.8, depth: -0.03 },
  synthwave: { hue: 325, scheme: "complement", chroma: 1.45, light: 0.82, depth: -0.04 },
  // Hue 316 is not arbitrary: ash and the hand-written dusk are both "quiet greys", close
  // enough that their weighted perceptual distance was 0.0354 (threshold 0.0488). Chroma stays
  // at 0.26 — near-neutral is its character, and hue alone is enough to separate them.
  ash: { hue: 316, scheme: "monohue", chroma: 0.26, light: 0.76, depth: 0.04 },
  "min-paper": { hue: 283, scheme: "monohue", chroma: 0.1, light: 0.96, depth: 0.1, neutral: 0.35 },
  // These ten were solved together rather than tuned one at a time: the constraints are
  // coupled, and tuning one pushes another pair below threshold (measured, fixing ash promptly
  // collided dusk with min-night). The four minimal ones were searched, not hand-tuned: their
  // hues all crowd into the blue-violet-grey band and dim is pinned to one lightness by the 3:1
  // floor, so hand-tuning collides endlessly (measured, min-night and min-alert-dark once had
  // dims 2.1 apart against a threshold of 6). The hue bands are hard constraints — "night"
  // cannot be optimised into a warm brown-grey, which is not the palette the user picked.
  "min-night": { hue: 236, scheme: "monohue", chroma: 0.47, light: 0.85, depth: -0.095, neutral: 0.45 },
  "min-zero": { hue: 303, scheme: "monohue", chroma: 0.17, light: 0.905, depth: 0, neutral: 0, alerts: "none" },
  "min-alert-dark": { hue: 196, scheme: "monohue", chroma: 0.3, light: 0.82, depth: -0.01, neutral: 0.9, alerts: "warn" },
};
