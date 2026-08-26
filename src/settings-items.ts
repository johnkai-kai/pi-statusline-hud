import {
  DEFAULT_CONFIG,
  LINE_NAMES,
  type HudConfig,
  type LineName,
  switchLabel,
  SWITCH_ON,
  SWITCH_OFF,
} from "./config.ts";
import { PALETTE_NAMES, type PaletteName } from "./palette.ts";
import { RAINBOW_TARGETS, isRainbowTarget, type RainbowTarget } from "./rainbow.ts";
import { sanitizeText } from "./sanitize.ts";

// This layer only describes what a setting looks like and how it changes; it touches neither
// pi nor pi-tui. The wiring half is in settings-menu.ts, and the two meet through these shapes.
//
// The types are declared here rather than imported from pi-tui's SettingItem: once a pure
// layer imports something from the runtime, it can no longer be tested without pi.

export type SettingKind = "cycle" | "choice" | "text" | "number" | "lines" | "rainbow";

export interface SettingItemSpec {
  id: string;
  label: string;
  description: string;
  currentValue: string;
  /** Switch-like settings only: Enter / Space cycles in place instead of opening a submenu. */
  values?: string[];
  kind: SettingKind;
  /** Candidate values for a choice. */
  choices?: readonly string[];
}

export interface ChangeResult {
  config: HudConfig;
  /** Set when the change was rejected; the string is the reason, shown to the user. */
  rejected?: string;
}

export const LINE_ITEM_PREFIX = "line:";
export const RAINBOW_ITEM_PREFIX = "rainbow:";
const EMPTY_MOTTO = "(empty)";

const SWITCH_VALUES = [SWITCH_ON, SWITCH_OFF];

export function buildSettingItems(config: HudConfig): SettingItemSpec[] {
  return [
    {
      id: "lines",
      label: "Lines",
      description: "the seven footer rows, each switchable",
      currentValue: `${config.lines.length}/${LINE_NAMES.length}`,
      kind: "lines",
    },
    {
      id: "motto",
      label: "Motto",
      description: "custom text at the end of the first line; empty hides it",
      currentValue: config.motto === "" ? EMPTY_MOTTO : config.motto,
      kind: "text",
    },
    {
      id: "sessionBudget",
      label: "Session budget",
      description: "denominator of the Session bar, a purely visual ruler",
      currentValue: String(config.sessionBudget),
      kind: "number",
    },
    {
      id: "maxToolEntries",
      label: "Tool line limit",
      description: "how many entries the tools line lists",
      currentValue: String(config.maxToolEntries),
      kind: "number",
    },
    {
      id: "palettePreset",
      label: "Palette",
      description: "sixteen palettes; NO_COLOR in the terminal disables colour entirely",
      currentValue: config.palettePreset,
      kind: "choice",
      choices: PALETTE_NAMES,
    },
    {
      id: "icons",
      label: "Emoji and symbols",
      description: "off leaves the HUD as plain text",
      currentValue: switchLabel(config.icons),
      values: SWITCH_VALUES,
      kind: "cycle",
    },
    {
      id: "sessionBar",
      label: "Session rule",
      description: "the rule above the input box carrying the session name",
      currentValue: switchLabel(config.sessionBar),
      values: SWITCH_VALUES,
      kind: "cycle",
    },
    {
      id: "rainbow",
      label: "Rainbow",
      description: "pick elements to flow per character; the palette still owns everything else",
      currentValue: `${config.rainbow.length}/${RAINBOW_TARGETS.length}`,
      kind: "rainbow",
    },
  ];
}

const RAINBOW_HINTS: Record<RainbowTarget, string> = {
  model: "model name at the left of the header",
  provider: "provider in the header",
  motto: "motto at the right of the header",
  branch: "git branch name",
  contextBar: "the filled part of the Context bar",
  sessionBar: "the filled part of the Session bar",
  cache: "the filled part of the Cache bar",
  tools: "tool names on the tools line",
  speed: "generation speed, tok/s",
  cost: "accumulated cost",
};

export function rainbowItems(config: HudConfig): SettingItemSpec[] {
  return RAINBOW_TARGETS.map((target) => ({
    id: `${RAINBOW_ITEM_PREFIX}${target}`,
    label: target,
    description: RAINBOW_HINTS[target],
    currentValue: switchLabel(config.rainbow.includes(target)),
    values: SWITCH_VALUES,
    kind: "cycle" as const,
  }));
}

// Reinserted in RAINBOW_TARGETS order rather than appended — re-enabling a target should not
// make the order in the config file follow the order of keystrokes.
function toggleRainbow(config: HudConfig, target: RainbowTarget, on: boolean): ChangeResult {
  if (!on) {
    return { config: { ...config, rainbow: config.rainbow.filter((t) => t !== target) } };
  }
  if (config.rainbow.includes(target)) return { config };
  const rainbow = RAINBOW_TARGETS.filter((t) => t === target || config.rainbow.includes(t));
  return { config: { ...config, rainbow: [...rainbow] } };
}

export function lineItems(config: HudConfig): SettingItemSpec[] {
  return LINE_NAMES.map((name) => ({
    id: `${LINE_ITEM_PREFIX}${name}`,
    label: name,
    description: LINE_HINTS[name],
    currentValue: switchLabel(config.lines.includes(name)),
    values: SWITCH_VALUES,
    kind: "cycle" as const,
  }));
}

const LINE_HINTS: Record<LineName, string> = {
  header: "model, provider, elapsed time, motto",
  repo: "directory and git branch, pinned right of the header",
  meters: "Context and Session bars",
  cache: "cache hit rate, appended to the meters",
  env: "AGENTS.md / MCP / extension / skill counts",
  tools: "per-tool call counts for this session",
  status: "agents, running tools, accumulated cost",
};

function positiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function toggleLine(config: HudConfig, name: LineName, on: boolean): ChangeResult {
  if (!on) {
    const lines = config.lines.filter((line) => line !== name);
    if (lines.length === 0) {
      return { config, rejected: "At least one line must stay." };
    }
    return { config: { ...config, lines } };
  }
  if (config.lines.includes(name)) return { config };
  // Reinserted in LINE_NAMES order rather than appended — re-enabling a line should not change
  // the layout order too.
  const lines = LINE_NAMES.filter((line) => line === name || config.lines.includes(line));
  return { config: { ...config, lines: [...lines] } };
}

export function applySettingChange(
  config: HudConfig,
  id: string,
  newValue: string,
): ChangeResult {
  if (id.startsWith(LINE_ITEM_PREFIX)) {
    const name = id.slice(LINE_ITEM_PREFIX.length);
    if (!(LINE_NAMES as readonly string[]).includes(name)) {
      return { config, rejected: `Unknown line: ${name}` };
    }
    return toggleLine(config, name as LineName, newValue === SWITCH_ON);
  }

  if (id.startsWith(RAINBOW_ITEM_PREFIX)) {
    const target = id.slice(RAINBOW_ITEM_PREFIX.length);
    if (!isRainbowTarget(target)) return { config, rejected: `Unknown rainbow target: ${target}` };
    return toggleRainbow(config, target, newValue === SWITCH_ON);
  }

  switch (id) {
    case "motto":
      return { config: { ...config, motto: sanitizeText(newValue) } };

    case "sessionBudget":
    case "maxToolEntries": {
      const value = positiveInt(newValue);
      if (value === null) return { config, rejected: "Enter a positive integer." };
      return { config: { ...config, [id]: value } };
    }

    case "palettePreset": {
      if (!(PALETTE_NAMES as readonly string[]).includes(newValue)) {
        return { config, rejected: `Unknown palette: ${newValue}` };
      }
      return { config: { ...config, palettePreset: newValue as PaletteName } };
    }

    case "icons":
    case "sessionBar":
      return { config: { ...config, [id]: newValue === SWITCH_ON } };

    default:
      return { config, rejected: `Unknown setting: ${id}` };
  }
}

// pi-tui's SettingItem shape. Structurally typed rather than imported — this layer must not touch the runtime.
export interface SettingItemShape {
  id: string;
  label: string;
  description?: string;
  currentValue: string;
  values?: string[];
  submenu?: (currentValue: string, done: (selected?: string) => void) => unknown;
}

/**
 * Converts the setting descriptions into the shape SettingsList consumes.
 *
 * Only cycle keeps values (cycling in place); the rest get a submenu — pressing a key sixteen
 * times to reach a palette is not configuration, it is punishment.
 */
export function toSettingItems(
  specs: readonly SettingItemSpec[],
  makeSubmenu?: (spec: SettingItemSpec, currentValue: string, done: (selected?: string) => void) => unknown,
): SettingItemShape[] {
  return specs.map((spec) => {
    const item: SettingItemShape = {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      currentValue: spec.currentValue,
    };
    if (spec.values !== undefined) {
      item.values = [...spec.values];
    } else if (makeSubmenu !== undefined) {
      item.submenu = (currentValue, done) => makeSubmenu(spec, currentValue, done);
    }
    return item;
  });
}

export { DEFAULT_CONFIG, SWITCH_ON, SWITCH_OFF };
