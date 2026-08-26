import { posix } from "node:path";
import { PALETTES, type PaletteName } from "./palette.ts";
import { isRainbowTarget, type RainbowTarget } from "./rainbow.ts";

export const LINE_NAMES = ["header", "repo", "meters", "cache", "env", "tools", "status"] as const;
export type LineName = (typeof LINE_NAMES)[number];

export interface HudConfig {
  lines: LineName[];
  motto: string;
  sessionBudget: number;
  maxToolEntries: number;
  icons: boolean;
  palettePreset: PaletteName;
  // The rule above the input box carrying the session name. It is not in lines — lines are
  // the seven footer rows, this is a different surface (setWidget), and mixing them turns
  // "why is that rule still there with header off" into something that needs explaining.
  sessionBar: boolean;
  // Which elements get a rainbow. Orthogonal to palettePreset: the theme owns everything
  // else, this list only swaps how the named targets pick their colour. Empty array = fully
  // off, right down to never installing the animation tick.
  rainbow: RainbowTarget[];
}

export const DEFAULT_CONFIG: HudConfig = {
  lines: [...LINE_NAMES],
  motto: "",
  sessionBudget: 10_000_000,
  maxToolEntries: 7,
  icons: true,
  palettePreset: "tokyo-night",
  sessionBar: true,
  rainbow: [],
};

function isLineName(value: unknown): value is LineName {
  return typeof value === "string" && (LINE_NAMES as readonly string[]).includes(value);
}

function lineNames(value: unknown): LineName[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.lines];
  // Dedupe: naming a line twice renders two identical rows.
  const names = [...new Set(value.filter(isLineName))];
  return names.length > 0 ? names : [...DEFAULT_CONFIG.lines];
}

function rainbowTargets(value: unknown): RainbowTarget[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isRainbowTarget))];
}

function paletteName(value: unknown): PaletteName {
  return typeof value === "string" && Object.hasOwn(PALETTES, value)
    ? (value as PaletteName)
    : DEFAULT_CONFIG.palettePreset;
}

// The switches are written "on" / "off" in the config file and the UI — more obvious than
// true / false. Old booleans are still accepted; existing files must not break over spelling.
function parseSwitch(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "on") return true;
  if (value === "off") return false;
  return fallback;
}

export const SWITCH_ON = "on";
export const SWITCH_OFF = "off";

/** Boolean to the literal used in the config file and the UI. */
export function switchLabel(value: boolean): string {
  return value ? SWITCH_ON : SWITCH_OFF;
}

// Floor first, validate second. The other way round, 0 < v < 1 passes validation and returns
// 0 — a sessionBudget of 0 leaves the Session bar permanently empty, and a maxToolEntries of
// 0 leaves the tools line permanently a placeholder.
function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored > 0 ? floored : fallback;
}

export function parseConfig(raw: unknown): HudConfig {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CONFIG };
  const input = raw as Record<string, unknown>;
  return {
    lines: lineNames(input.lines),
    motto: typeof input.motto === "string" ? input.motto : DEFAULT_CONFIG.motto,
    sessionBudget: positiveInt(input.sessionBudget, DEFAULT_CONFIG.sessionBudget),
    maxToolEntries: positiveInt(input.maxToolEntries, DEFAULT_CONFIG.maxToolEntries),
    icons: parseSwitch(input.icons, DEFAULT_CONFIG.icons),
    palettePreset: paletteName(input.palettePreset),
    sessionBar: parseSwitch(input.sessionBar, DEFAULT_CONFIG.sessionBar),
    rainbow: rainbowTargets(input.rainbow),
  };
}

// The shape written to disk. Switches are written "on" / "off"; parseConfig reads both back.
//
// The defaults written at install time and the file saved by the wizard must go through the
// same function — otherwise a fresh install writes "icons": true while the wizard writes
// "icons": "on", and the docs claim both are on/off. An agent going by the docs reads it wrong.
export function serialisableConfig(config: HudConfig): Record<string, unknown> {
  return {
    ...config,
    icons: switchLabel(config.icons),
    sessionBar: switchLabel(config.sessionBar),
  };
}

export function configFilePath(agentDir: string): string {
  return posix.join(agentDir, "pi-statusline-hud.json");
}

export function agentSettingsPath(agentDir: string): string {
  return posix.join(agentDir, "settings.json");
}

const SELF_PACKAGE = "pi-statusline-hud";
// Any package whose name contains statusline / footer may grab setFooter, not just the known one.
const FOOTER_HINTS = ["statusline", "footer"] as const;

/** A packages entry can be a string or an object with a source — recognise both. */
export function packageSpec(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null) return null;
  const source = (entry as { source?: unknown }).source;
  return typeof source === "string" ? source : null;
}

export function detectFooterConflicts(packages: unknown): string[] {
  if (!Array.isArray(packages)) return [];
  const found: string[] = [];
  for (const entry of packages) {
    const spec = packageSpec(entry);
    if (spec === null) continue;
    const lower = spec.toLowerCase();
    if (lower.includes(SELF_PACKAGE)) continue;
    if (!FOOTER_HINTS.some((hint) => lower.includes(hint))) continue;
    if (!found.includes(spec)) found.push(spec);
  }
  return found;
}

