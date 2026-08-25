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
const BACK = "\u2190 返回";
// 精靈存檔之後 statusline 就地更新閉包裡的 config,而 render 每幀重讀——
// 七個鍵下一幀全部生效。舊的「重啟 pi 後生效」會把回報「改了沒生效」的人
// 導去重啟,錯過真正的原因(footer 被別的套件搶走)。
const RESTART_NOTE = "已即時套用。";

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

/** 逐項摘要,給 select 當選項列。單行太長會被終端截掉。 */
export function summaryLines(config: HudConfig): string[] {
  const motto = config.motto === "" ? "(空)" : config.motto;
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

// 單行版就是逐項版接起來——兩份各自維護的結果是其中一份漏了 sessionBar,
// 而且沒有測試會發現。
export function formatConfigSummary(config: HudConfig): string {
  return summaryLines(config).join(" \u00b7 ");
}

export function conflictMessage(specs: readonly string[]): string {
  const list = specs.join(", ");
  return (
    `偵測到可能搶 footer 的套件:${list}。` +
    "pi 的 footer 一次只能被一個套件佔用," +
    "兩邊都裝時只會看到其中一個。" +
    "要用本 HUD 請把上述項目從 " +
    "<agentDir>/settings.json 的 packages 陣列拿掉,再重啟 pi。"
  );
}

const MENU_LINES = "顯示哪幾行";
const MENU_MOTTO = "座右銘";
const MENU_BUDGET = "Session 預算";
const MENU_PALETTE = "配色";
const MENU_TOOLS = "工具行上限";
const MENU_ICONS = "emoji 開關";
const MENU_SESSION_BAR = "session 橫線";
const MENU_SHOW = "顯示目前設定";
const MENU_EXIT = "結束";

type MenuKey =
  | "lines"
  | "motto"
  | "budget"
  | "palette"
  | "tools"
  | "icons"
  | "sessionBar"
  | "show"
  | "exit";

export function menuEntries(config: HudConfig): Array<{ key: MenuKey; label: string }> {
  const motto = config.motto === "" ? "(空)" : config.motto;
  return [
    { key: "lines", label: `${MENU_LINES}  [${config.lines.length}/${LINE_NAMES.length}]` },
    { key: "motto", label: `${MENU_MOTTO}  [${motto}]` },
    { key: "budget", label: `${MENU_BUDGET}  [${config.sessionBudget}]` },
    { key: "palette", label: `${MENU_PALETTE}  [${config.palettePreset}]` },
    { key: "tools", label: `${MENU_TOOLS}  [${config.maxToolEntries}]` },
    { key: "icons", label: `${MENU_ICONS}  [${config.icons ? ON : OFF}]` },
    { key: "sessionBar", label: `${MENU_SESSION_BAR}  [${config.sessionBar ? ON : OFF}]` },
    { key: "show", label: MENU_SHOW },
    { key: "exit", label: MENU_EXIT },
  ];
}

async function checkConflicts(deps: WizardDeps): Promise<boolean> {
  const conflicts = detectFooterConflicts(deps.readPackages());
  if (conflicts.length === 0) {
    deps.ui.notify(
      "未偵測到會搶 footer 的其他套件。",
      "info",
    );
    return true;
  }
  deps.ui.notify(conflictMessage(conflicts), "warning");
  return await deps.ui.confirm(
    "footer 衝突",
    "仍要繼續設定 HUD 嗎?",
  );
}

async function editLines(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  let current = config;
  for (;;) {
    const choice = await deps.ui.select("顯示哪幾行", [
      ...lineOptions(current),
      BACK,
    ]);
    if (choice === undefined || choice === BACK) return current;
    const name = parseLineOption(choice);
    if (name === null) return current;
    const lines = toggleLine(current.lines, name);
    if (lines.length === 0) {
      deps.ui.notify(
        "至少要保留一行,未變更。",
        "warning",
      );
      continue;
    }
    current = { ...current, lines };
    deps.saveConfig(current);
    deps.ui.notify(`${name} 已切換。${RESTART_NOTE}`, "info");
  }
}

// pi 的輸入對話框收不到預填值——ExtensionInputComponent 把參數命名成
// _placeholder 之後完全不使用,pi-tui 的 Input 初始值恆為空字串。
//
// 所以使用者看到的永遠是空框,看不到目前的設定值。直接按 Enter 就送出空
// 字串,而這裡原本只擋 undefined(Esc),空字串會一路寫進檔案——Esc 保資料
// 而 Enter 毀資料,方向剛好相反,沒有確認也沒有復原。
//
// 兩個對策:標題自己把目前值帶出來,以及清空前先問一次。
function currentHint(value: string): string {
  return value === "" ? "空" : value;
}

async function editMotto(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const motto = await deps.ui.input(`${MENU_MOTTO}(目前:${currentHint(config.motto)})`);
  if (motto === undefined) return config;
  if (motto === "") {
    if (config.motto === "") {
      deps.ui.notify("座右銘原本就是空的,未變更。", "info");
      return config;
    }
    const clear = await deps.ui.confirm("清空座右銘?", `目前是「${config.motto}」,留空會把它清掉。`);
    if (!clear) {
      deps.ui.notify("未變更。", "info");
      return config;
    }
  }
  const next = { ...config, motto };
  deps.saveConfig(next);
  deps.ui.notify(`座右銘已更新。${RESTART_NOTE}`, "info");
  return next;
}

async function editPositive(
  deps: WizardDeps,
  config: HudConfig,
  title: string,
  key: "sessionBudget" | "maxToolEntries",
): Promise<HudConfig> {
  const raw = await deps.ui.input(`${title}(目前:${config[key]})`);
  if (raw === undefined) return config;
  const value = parsePositiveInt(raw);
  if (value === null) {
    deps.ui.notify(
      "請輸入正整數,已保留原值。",
      "warning",
    );
    return config;
  }
  const next = { ...config, [key]: value };
  deps.saveConfig(next);
  deps.ui.notify(`${title} 已設為 ${value}。${RESTART_NOTE}`, "info");
  return next;
}

async function editPalette(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const choice = await deps.ui.select(MENU_PALETTE, [...PALETTE_NAMES]);
  if (choice === undefined) return config;
  const next = { ...config, palettePreset: choice as PaletteName };
  deps.saveConfig(next);
  deps.ui.notify(`${MENU_PALETTE} 已設為 ${choice}。${RESTART_NOTE}`, "info");
  return next;
}

async function editIcons(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const choice = await deps.ui.select(MENU_ICONS, [ON, OFF]);
  if (choice === undefined) return config;
  const next = { ...config, icons: choice === ON };
  deps.saveConfig(next);
  deps.ui.notify(`${MENU_ICONS} 已設為 ${choice}。${RESTART_NOTE}`, "info");
  return next;
}

async function editSessionBar(deps: WizardDeps, config: HudConfig): Promise<HudConfig> {
  const choice = await deps.ui.select(MENU_SESSION_BAR, [ON, OFF]);
  if (choice === undefined) return config;
  const next = { ...config, sessionBar: choice === ON };
  deps.saveConfig(next);
  deps.ui.notify(`${MENU_SESSION_BAR} 已設為 ${choice}。${RESTART_NOTE}`, "info");
  return next;
}

export async function runWizard(deps: WizardDeps): Promise<void> {
  if (!(await checkConflicts(deps))) return;
  let config = deps.loadConfig();
  for (;;) {
    const entries = menuEntries(config);
    const choice = await deps.ui.select(
      "pi-statusline-hud 設定",
      entries.map((entry) => entry.label),
    );
    if (choice === undefined) return;
    const key = entries.find((entry) => entry.label === choice)?.key;
    if (key === undefined || key === "exit") return;
    if (key === "show") {
      // 這裡不能用 notify:通知畫完之後迴圈立刻重畫選單,下一幀就把它蓋掉了
      // ——看起來像「按了沒反應」。用 select 才會停在畫面上等使用者關掉。
      await deps.ui.select(MENU_SHOW, [...summaryLines(config), BACK]);
      continue;
    }
    if (key === "lines") config = await editLines(deps, config);
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
