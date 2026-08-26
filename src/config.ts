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
  // 輸入框上方那條帶 session 名的橫線。它不在 lines 裡——lines 是 footer 的七行,
  // 這是另一個表面(setWidget),混在一起會讓「關掉 header 為何上面那條還在」變成
  // 一個要解釋的問題。
  sessionBar: boolean;
  // 哪些元素套彩虹。與 palettePreset 正交:主題管其他所有東西,這份清單只把
  // 名單上的目標換掉取色方式。空陣列 = 完全關閉,連動畫節拍都不會裝。
  rainbow: RainbowTarget[];
}

export const DEFAULT_CONFIG: HudConfig = {
  lines: [...LINE_NAMES],
  motto: "",
  sessionBudget: 10_000_000,
  maxToolEntries: 7,
  icons: true,
  palettePreset: "contra",
  sessionBar: true,
  rainbow: [],
};

function isLineName(value: unknown): value is LineName {
  return typeof value === "string" && (LINE_NAMES as readonly string[]).includes(value);
}

function lineNames(value: unknown): LineName[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.lines];
  // 去重:同一行寫兩次會渲染出兩列一模一樣的內容。
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

// 開關在設定檔與 UI 上都寫成 "on" / "off"——那比 true / false 直觀。
// 仍接受舊的布林值,既有設定檔不該因為改了寫法就壞掉。
function parseSwitch(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "on") return true;
  if (value === "off") return false;
  return fallback;
}

export const SWITCH_ON = "on";
export const SWITCH_OFF = "off";

/** 布林轉成設定檔與 UI 用的字面值。 */
export function switchLabel(value: boolean): string {
  return value ? SWITCH_ON : SWITCH_OFF;
}

// 先取整再驗證。反過來的話 0 < v < 1 會通過驗證卻回傳 0——sessionBudget 為 0
// 讓 Session 條永遠全空,maxToolEntries 為 0 讓工具行永遠是佔位符。
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

// 寫檔用的形狀。開關寫成 "on" / "off",讀回來時 parseConfig 兩種都吃。
//
// 安裝時寫的預設檔與精靈存的檔必須走同一支——不然首裝寫出 "icons": true、
// 精靈寫出 "icons": "on",而文件宣稱兩邊都是 on/off。照文件字面判斷的 agent
// 就會讀錯。
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
// 任何名字帶 statusline / footer 的套件都可能搶走 setFooter,不只已知的那一個。
const FOOTER_HINTS = ["statusline", "footer"] as const;

// packages 條目可以是字串,也可以是 { source, autoload?, extensions?, ... } 物件。
/** packages 條目可以是字串,也可以是帶 source 的物件——兩種都要認得。 */
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

