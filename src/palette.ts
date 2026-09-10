import { RECIPES, buildPalette } from "./palette-recipe.ts";

// Accents identify information groups; green/amber/red retain their status meaning.
export type PaletteName =
  | "tokyo-night" | "ember" | "triad" | "dusk" | "deep-sea"
  | "jade" | "amber-crt" | "synthwave" | "min-alert-dark" | "mono";

export interface Palette {
  cyan: string | null;
  orange: string | null;
  blue: string | null;
  green: string | null;
  amber: string | null;
  red: string | null;
  fg: string | null;
  dim: string | null;
  track: string | null;
}

export const PALETTES: Record<PaletteName, Palette> = {
  "tokyo-night": {
    cyan: "#7dcfff", orange: "#ff9e64", blue: "#7aa2f7",
    green: "#9ece6a", amber: "#e0af68", red: "#f7768e",
    fg: "#c0caf5", dim: "#7887aa", track: "#6c79b2",
  },
  ember: buildPalette(RECIPES.ember),
  triad: buildPalette(RECIPES.triad),
  dusk: buildPalette(RECIPES.dusk),
  "deep-sea": buildPalette(RECIPES["deep-sea"]),
  jade: buildPalette(RECIPES.jade),
  "amber-crt": buildPalette(RECIPES["amber-crt"]),
  synthwave: buildPalette(RECIPES.synthwave),
  "min-alert-dark": buildPalette(RECIPES["min-alert-dark"]),
  mono: { cyan: null, orange: null, blue: null, green: null, amber: null, red: null, fg: null, dim: null, track: null },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

export const LEGACY_PALETTES: Record<string, PaletteName> = {
  neon: "synthwave", lava: "ember", ash: "dusk",
  "min-paper": "dusk", "min-night": "min-alert-dark", "min-zero": "mono",
};

export function normalisePaletteName(value: unknown): PaletteName {
  if (typeof value !== "string") return "tokyo-night";
  if (Object.hasOwn(PALETTES, value)) return value as PaletteName;
  return Object.hasOwn(LEGACY_PALETTES, value) ? LEGACY_PALETTES[value] : "tokyo-night";
}

const RESET = "\u001b[0m";
const SEQUENCE = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b][^\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/y;

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Layout premise: ambiguous-width characters are all treated as one column, and every column
// alignment in option 2 rests on that. Emoji width is decided at runtime by the \p{RGI_Emoji}
// property (which tracks Node's Unicode version); the table below keeps only the fixed CJK and
// fullwidth EastAsianWidth blocks, which do not grow with usage.
const WIDE_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
];

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });
const RGI_EMOJI = /^\p{RGI_Emoji}$/v;
const ZERO_WIDTH = /^[\p{Mark}\p{Default_Ignorable_Code_Point}]$/u;

function charWidth(codePoint: number): number {
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return 0;
  const char = String.fromCodePoint(codePoint);
  if (ZERO_WIDTH.test(char)) return 0;
  for (const [lo, hi] of WIDE_BLOCKS) {
    if (codePoint >= lo && codePoint <= hi) return 2;
  }
  return 1;
}

function clusterWidth(cluster: string): number {
  if (RGI_EMOJI.test(cluster)) return 2;
  return charWidth(cluster.codePointAt(0) as number);
}

type Token = { kind: "sequence" | "cluster"; text: string };

function* tokenize(text: string): Generator<Token> {
  let i = 0;
  while (i < text.length) {
    if (text.charCodeAt(i) === 0x1b) {
      const sequence = matchSequence(text, i);
      if (sequence) {
        yield { kind: "sequence", text: sequence };
        i += sequence.length;
        continue;
      }
      yield { kind: "cluster", text: "\u001b" };
      i += 1;
      continue;
    }
    let next = text.indexOf("\u001b", i);
    if (next === -1) next = text.length;
    for (const { segment } of GRAPHEMES.segment(text.slice(i, next))) {
      yield { kind: "cluster", text: segment };
    }
    i = next;
  }
}

function matchSequence(text: string, index: number): string | null {
  if (text.charCodeAt(index) !== 0x1b) return null;
  SEQUENCE.lastIndex = index;
  const match = SEQUENCE.exec(text);
  return match ? match[0] : null;
}

export function paint(hex: string | null, text: string): string {
  if (hex === null || text === "") return text;
  const rgb = parseHex(hex);
  if (!rgb) return text;
  return `\u001b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${RESET}`;
}

export function visibleLength(text: string): number {
  let width = 0;
  for (const token of tokenize(text)) {
    if (token.kind === "cluster") width += clusterWidth(token.text);
  }
  return width;
}

export function truncateAnsi(text: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  if (visibleLength(text) <= width) return text;
  let out = "";
  let used = 0;
  let styled = false;
  for (const token of tokenize(text)) {
    if (token.kind === "sequence") {
      out += token.text;
      styled = true;
      continue;
    }
    const cost = clusterWidth(token.text);
    if (used + cost > width) break;
    out += token.text;
    used += cost;
  }
  return styled ? out + RESET : out;
}

export function padBetween(left: string, right: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  let head = left;
  let headWidth = visibleLength(head);
  if (headWidth > width) {
    head = truncateAnsi(head, width);
    headWidth = visibleLength(head);
  }
  let tail = right;
  let tailWidth = visibleLength(tail);
  const gap = headWidth > 0 && tailWidth > 0 ? 1 : 0;
  const room = width - headWidth - gap;
  if (tailWidth > room) {
    tail = room > 0 ? truncateAnsi(tail, room) : "";
    tailWidth = visibleLength(tail);
  }
  const fill = Math.max(0, width - headWidth - tailWidth);
  return head + " ".repeat(fill) + tail;
}

export function resolvePalette(name: string): Palette {
  return PALETTES[normalisePaletteName(name)];
}

// The derived light-terminal variants.
//
// Derive light-background roles by reducing lightness while preserving hue.
const LIGHT_BG: [number, number, number] = [255, 255, 255];
const TEXT_TARGET = 4.5;
const SUBTLE_TARGET = 3;
const SUBTLE_ROLES = new Set(["track"]);

function channelLuminance(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

function contrastRatio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function darkenUntilReadable(hex: string, target: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  // Sweep bright to dark and take the first that clears — keeps the most chroma, never black.
  //
  // Rounding to 8 bits lowers contrast slightly, so the check uses the rounded value rather than
  // the floating-point intermediate — otherwise it returns a colour that clears on paper and
  // misses by 0.01 in the output.
  for (let step = 1000; step >= 0; step -= 1) {
    const scaled: [number, number, number] = [
      Math.round((rgb[0] * step) / 1000),
      Math.round((rgb[1] * step) / 1000),
      Math.round((rgb[2] * step) / 1000),
    ];
    if (contrastRatio(scaled, LIGHT_BG) >= target) return toHex(scaled);
  }
  return "#000000";
}

export function forLightBackground(palette: Palette): Palette {
  const out = {} as Record<keyof Palette, string | null>;
  for (const [role, value] of Object.entries(palette) as Array<[keyof Palette, string | null]>) {
    out[role] =
      value === null
        ? null
        : darkenUntilReadable(value, SUBTLE_ROLES.has(role) ? SUBTLE_TARGET : TEXT_TARGET);
  }
  return out as Palette;
}

/**
 * Decides from an ANSI foreground sequence whether the terminal has a light background.
 *
 * pi has OSC 11 background detection and switches between its built-in dark and light themes
 * accordingly, and a theme's text colour must be readable against its background — so a dark
 * text colour means the background is light.
 *
 * Judged by lightness rather than by theme name: users can install custom themes whose names
 * are not "light". A hardcoded list of theme names needs a code change per new theme.
 */
export function isLightBackground(fgAnsi: string): boolean {
  const truecolor = /38;2;(\d+);(\d+);(\d+)m/.exec(fgAnsi);
  if (truecolor) {
    const rgb: [number, number, number] = [
      Number(truecolor[1]),
      Number(truecolor[2]),
      Number(truecolor[3]),
    ];
    return luminance(rgb) < 0.5;
  }
  return false;
}

export function paletteFor(
  name: string,
  env: Record<string, string | undefined>,
): Palette {
  // No sniffing of terminal capability. The previous version read COLORTERM and WT_SESSION and
  // fell back to mono when neither was set — but those two are conventions, and unset does not
  // mean unsupported, so it swallowed the palette the user chose. pi itself (pi-tui
  // detectCapabilities) always assumes truecolor on win32, and there is no reason for an
  // extension to be more conservative than its host.
  //
  // The only case for turning colour off is the user saying so: NO_COLOR is the existing
  // cross-tool standard (no-color.org) — any value turns it off, contents ignored.
  if ((env.NO_COLOR ?? "") !== "") return PALETTES.mono;
  return resolvePalette(name);
}
