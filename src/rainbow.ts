// The rainbow effect. Orthogonal to the palette: the theme owns everything else, the rainbow
// only swaps the colour function of the listed targets; the rest keep their semantic colour.
//
// Targets are named rather than "the nth span" — span order moves with the layout, names do not.

export const RAINBOW_TARGETS = [
  "model",
  "provider",
  "motto",
  "branch",
  "contextBar",
  "sessionBar",
  "cache",
  "tools",
  "speed",
  "cost",
] as const;

export type RainbowTarget = (typeof RAINBOW_TARGETS)[number];

export function isRainbowTarget(value: unknown): value is RainbowTarget {
  return typeof value === "string" && (RAINBOW_TARGETS as readonly string[]).includes(value);
}

/** How long one full hue rotation takes. Three seconds: visibly moving, not distracting. */
export const RAINBOW_PERIOD_MS = 3_000;

// Chroma and lightness are fixed and only the hue runs. Terminal backgrounds are mostly dark,
// where too much lightness smears and too little is unreadable; this pair works on both.
const SATURATION = 0.72;
const LIGHTNESS = 0.62;

function channel(hue: number, n: number): number {
  const k = (n + hue / 30) % 12;
  const a = SATURATION * Math.min(LIGHTNESS, 1 - LIGHTNESS);
  return LIGHTNESS - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
}

function byte(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, "0");
}

/**
 * Colour of character `index`, within an element of `length`, at time `phaseMs`.
 *
 * One element spans a full hue rotation (the positional term), and the whole thing shifts
 * with time (the temporal term). Added together they read as a band of light flowing over
 * the text — and it is a pure function, same input, same output, so it can be tested.
 */
export function rainbowHex(index: number, length: number, phaseMs: number): string {
  const span = Number.isFinite(length) && length > 0 ? length : 1;
  const position = Number.isFinite(index) ? index / span : 0;
  const drift = Number.isFinite(phaseMs) ? phaseMs / RAINBOW_PERIOD_MS : 0;
  const hue = (((position + drift) % 1) + 1) % 1 * 360;
  return `#${byte(channel(hue, 0))}${byte(channel(hue, 8))}${byte(channel(hue, 4))}`;
}

/** Colours per code point — indexing the string would cut an emoji's surrogate pair in half. */
export function paintRainbow(text: string, phaseMs: number): string {
  const chars = [...text];
  if (chars.length === 0) return "";
  let out = "";
  for (let i = 0; i < chars.length; i += 1) {
    const hex = rainbowHex(i, chars.length, phaseMs);
    out += `[38;2;${Number.parseInt(hex.slice(1, 3), 16)};${Number.parseInt(hex.slice(3, 5), 16)};${Number.parseInt(hex.slice(5, 7), 16)}m${chars[i]}`;
  }
  return `${out}[0m`;
}

/** Whether this target is selected. Everything outside the config layer asks through this. */
export function hasRainbow(config: { rainbow: readonly RainbowTarget[] }, target: RainbowTarget): boolean {
  return config.rainbow.includes(target);
}
