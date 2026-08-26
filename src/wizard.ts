import {
  detectFooterConflicts,
  type HudConfig,
  type LineName,
  LINE_NAMES,
  SWITCH_OFF,
  SWITCH_ON,
  switchLabel,
} from "./config.ts";
import { PALETTE_NAMES, PALETTES, type PaletteName } from "./palette.ts";
import { RAINBOW_TARGETS, isRainbowTarget, type RainbowTarget } from "./rainbow.ts";
import { RAINBOW_ITEM_PREFIX, applySettingChange } from "./settings-items.ts";

export interface WizardUI {
  select(title: string, options: string[]): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface WizardDeps {
  ui: WizardUI;
  loadConfig(): HudConfig;
  saveConfig(config: HudConfig): void;
  readPackages(): unknown;
}

const ON = SWITCH_ON;
const OFF = SWITCH_OFF;
const BACK = "\u2190 Back";
// Once the wizard saves, statusline updates the config inside its closure in place and render
// re-reads it every frame — all seven keys take effect on the next frame. The old "takes effect
// after restarting pi" sent anyone reporting "changed it, nothing happened" off to restart,
// missing the real cause (another package had taken the footer).
const RESTART_NOTE = "Applied immediately.";

export { PALETTE_NAMES };

export function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function toggleLine(lines: readonly LineName[], name: LineName): LineName[] {
  if (lines.includes(name)) return lines.filter((line) => line !== name);
  const rank = (line: LineName): number => LINE_NAMES.indexOf(line);
  const next = [...lines];
  const at = next.findIndex((line) => rank(line) > rank(name));
  if (at === -1) next.push(name);
  else next.splice(at, 0, name);
  return next;
}

export function lineOptionLabel(name: LineName, enabled: boolean): string {
  return `${name}  [${enabled ? ON : OFF}]`;
}

export function parseLineOption(label: string): LineName | null {
  const head = label.split("  [")[0] ?? "";
  return (LINE_NAMES as readonly string[]).includes(head) ? (head as LineName) : null;
}

export function lineOptions(config: HudConfig): string[] {
  return LINE_NAMES.map((name) => lineOptionLabel(name, config.lines.includes(name)));
}

export function parseRainbowOption(label: string): RainbowTarget | null {
  const head = label.split("  [")[0] ?? "";
  return isRainbowTarget(head) ? head : null;
}

export function rainbowOptions(config: HudConfig): string[] {
  return RAINBOW_TARGETS.map(
    (target) => `${target}  [${config.rainbow.includes(target) ? ON : OFF}]`,
  );
}

/** One line per setting, for a select list. A single long line gets cut off by the terminal. */
export function summaryLines(config: HudConfig): string[] {
  const motto = config.motto === "" ? "(empty)" : config.motto;
  return [
    `lines: ${config.lines.join(", ")}`,
    `motto: ${motto}`,
    `sessionBudget: ${config.sessionBudget}`,
    `palettePreset: ${config.palettePreset}`,
    `maxToolEntries: ${config.maxToolEntries}`,
    `icons: ${switchLabel(config.icons)}`,
    `sessionBar: ${switchLabel(config.sessionBar)}`,
  ];
}

// The single-line version is the per-item version joined — maintaining two of them ended with
// one of them missing sessionBar, and no test would have caught it.
export function formatConfigSummary(config: HudConfig): string {
  return summaryLines(config).join(" \u00b7 ");
}

export function conflictMessage(specs: readonly string[]): string {
  const list = specs.join(", ");
  return (
    `Packages that may grab the footer: ${list}. ` +
    "pi's footer can only be held by one package, " +
    "so with both installed you will only see one of them. " +
    "To use this HUD, remove the entries above from the packages array in " +
    "<agentDir>/settings.json and restart pi."
  );
}

const MENU_LINES = "Lines";
const MENU_MOTTO = "Motto";
const MENU_BUDGET = "Session budget";
const MENU_PALETTE = "Palette";
const MENU_TOOLS = "Tool line limit";
const MENU_ICONS = "Emoji";
const MENU_SESSION_BAR = "Session rule";
const MENU_RAINBOW = "Rainbow";
const MENU_SHOW = "Show current settings";
const MENU_EXIT = "Exit";

type MenuKey =
  | "lines"
  | "motto"
  | "budget"
  | "palette"
  | "tools"
  | "icons"
  | "sessionBar"
  | "rainbow"
  | "show"
  | "exit";

export function menuEntries(config: HudConfig): Array<{ key: MenuKey; label: string }> {
  const motto = config.motto === "" ? "(empty)" : config.motto;
  return [
    { key: "lines", label: `${MENU_LINES}  [${config.lines.length}/${LINE_NAMES.length}]` },
    { key: "motto", label: `${MENU_MOTTO}  [${motto}]` },
    { key: "budget", label: `${MENU_BUDGET}  [${config.sessionBudget}]` },
    { key: "palette", label: `${MENU_PALETTE}  [${config.palettePreset}]` },
    { key: "tools", label: `${MENU_TOOLS}  [${config.maxToolEntries}]` },
    { key: "icons", label: `${MENU_ICONS}  [${config.icons ? ON : OFF}]` },
    { key: "sessionBar", label: `${MENU_SESSION_BAR}  [${config.sessionBar ? ON : OFF}]` },
    {
      key: "rainbow",
      label: `${MENU_RAINBOW}  [${config.rainbow.length}/${RAINBOW_TARGETS.length}]`,
    },
    { key: "show", label: MENU_SHOW },
    { key: "exit", label: MENU_EXIT },
  ];
}

async function checkConflicts(deps: WizardDeps): Promise<boolean> {
  const conflicts = detectFooterConflicts(deps.readPackages());
  if (conflicts.length === 0) {
    deps.ui.notify(
      "No other footer-grabbing package detected.",
      "info",
    );
    return true;
  }
  deps.ui.notify(conflictMessage(conflicts), "warning");
  return await deps.ui.confirm(
    "Footer conflict",
    "Configure the HUD anyway?",
  );
}

async function editRainbow(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  let current = config;
  for (;;) {
    const choice = await deps.ui.select("Which elements get a rainbow", [...rainbowOptions(current), BACK]);
    if (choice === undefined || choice === BACK) return current;
    const target = parseRainbowOption(choice);
    if (target === null) return current;
    const result = applySettingChange(current, `${RAINBOW_ITEM_PREFIX}${target}`, current.rainbow.includes(target) ? "off" : "on");
    if (result.rejected !== undefined) {
      deps.ui.notify(result.rejected, "warning");
      continue;
    }
    current = result.config;
    deps.saveConfig(current);
    deps.ui.notify(`${target} toggled. ${RESTART_NOTE}`, "info");
  }
}

async function editLines(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  let current = config;
  for (;;) {
    const choice = await deps.ui.select("Lines", [
      ...lineOptions(current),
      BACK,
    ]);
    if (choice === undefined || choice === BACK) return current;
    const name = parseLineOption(choice);
    if (name === null) return current;
    const lines = toggleLine(current.lines, name);
    if (lines.length === 0) {
      deps.ui.notify(
        "At least one line must stay; unchanged.",
        "warning",
      );
      continue;
    }
    current = { ...current, lines };
    deps.saveConfig(current);
    deps.ui.notify(`${name} toggled. ${RESTART_NOTE}`, "info");
  }
}

// pi's input dialog cannot receive a prefilled value — ExtensionInputComponent names the
// parameter _placeholder and then never uses it, and pi-tui's Input always starts empty.
//
// So the user always sees an empty box and cannot see the current setting. Pressing Enter
// straight away submits an empty string, and this used to guard only against undefined (Esc),
// so the empty string went into the file — Esc preserved data while Enter destroyed it, with
// no confirmation and no undo.
//
// Two answers: the title carries the current value, and clearing asks first.
function currentHint(value: string): string {
  return value === "" ? "empty" : value;
}

async function editMotto(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const motto = await deps.ui.input(`${MENU_MOTTO} (currently: ${currentHint(config.motto)})`);
  if (motto === undefined) return config;
  if (motto === "") {
    if (config.motto === "") {
      deps.ui.notify("The motto was already empty; unchanged.", "info");
      return config;
    }
    const clear = await deps.ui.confirm("Clear the motto?", `It is currently "${config.motto}"; leaving it empty clears it.`);
    if (!clear) {
      deps.ui.notify("Unchanged.", "info");
      return config;
    }
  }
  const next = { ...config, motto };
  deps.saveConfig(next);
  deps.ui.notify(`Motto updated. ${RESTART_NOTE}`, "info");
  return next;
}

async function editPositive(
  deps: WizardDeps,
  config: HudConfig,
  title: string,
  key: "sessionBudget" | "maxToolEntries",
): Promise<HudConfig> {
  const raw = await deps.ui.input(`${title} (currently: ${config[key]})`);
  if (raw === undefined) return config;
  const value = parsePositiveInt(raw);
  if (value === null) {
    deps.ui.notify(
      "Enter a positive integer; the previous value was kept.",
      "warning",
    );
    return config;
  }
  const next = { ...config, [key]: value };
  deps.saveConfig(next);
  deps.ui.notify(`${title} set to ${value}. ${RESTART_NOTE}`, "info");
  return next;
}

async function editPalette(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const choice = await deps.ui.select(MENU_PALETTE, [...PALETTE_NAMES]);
  if (choice === undefined) return config;
  const next = { ...config, palettePreset: choice as PaletteName };
  deps.saveConfig(next);
  deps.ui.notify(`${MENU_PALETTE} set to ${choice}. ${RESTART_NOTE}`, "info");
  return next;
}

async function editIcons(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const choice = await deps.ui.select(MENU_ICONS, [ON, OFF]);
  if (choice === undefined) return config;
  const next = { ...config, icons: choice === ON };
  deps.saveConfig(next);
  deps.ui.notify(`${MENU_ICONS} set to ${choice}. ${RESTART_NOTE}`, "info");
  return next;
}

async function editSessionBar(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const choice = await deps.ui.select(MENU_SESSION_BAR, [ON, OFF]);
  if (choice === undefined) return config;
  const next = { ...config, sessionBar: choice === ON };
  deps.saveConfig(next);
  deps.ui.notify(`${MENU_SESSION_BAR} set to ${choice}. ${RESTART_NOTE}`, "info");
  return next;
}

export async function runWizard(deps: WizardDeps): Promise<void> {
  if (!(await checkConflicts(deps))) return;
  let config = deps.loadConfig();
  for (;;) {
    const entries = menuEntries(config);
    const choice = await deps.ui.select(
      "pi-statusline-hud settings",
      entries.map((entry) => entry.label),
    );
    if (choice === undefined) return;
    const key = entries.find((entry) => entry.label === choice)?.key;
    if (key === undefined || key === "exit") return;
    if (key === "show") {
      // notify cannot be used here: the loop repaints the menu right after the notification is
      // drawn, covering it on the next frame — it looks like nothing happened. select stays on
      // screen until the user dismisses it.
      await deps.ui.select(MENU_SHOW, [...summaryLines(config), BACK]);
      continue;
    }
    if (key === "lines") config = await editLines(deps, config);
    else if (key === "rainbow") config = await editRainbow(deps, config);
    else if (key === "motto") config = await editMotto(deps, config);
    else if (key === "budget") {
      config = await editPositive(deps, config, MENU_BUDGET, "sessionBudget");
    } else if (key === "tools") {
      config = await editPositive(deps, config, MENU_TOOLS, "maxToolEntries");
    } else if (key === "palette") config = await editPalette(deps, config);
    else if (key === "icons") config = await editIcons(deps, config);
    else if (key === "sessionBar") config = await editSessionBar(deps, config);
  }
}
