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
import { sanitizeText } from "./sanitize.ts";

// 這一層只描述「設定長什麼樣、怎麼改」,不碰 pi 也不碰 pi-tui。
// 接線的那一半在 settings-menu.ts,兩邊靠這裡的形狀溝通。
//
// 型別自己宣告而不是 import pi-tui 的 SettingItem:純函式層一旦 import 了
// 執行期的東西,就再也不能在沒有 pi 的情況下測。

export type SettingKind = "cycle" | "choice" | "text" | "number" | "lines";

export interface SettingItemSpec {
  id: string;
  label: string;
  description: string;
  currentValue: string;
  /** 只有開關類才給:按 Enter / 空白鍵就地循環,不開子選單。 */
  values?: string[];
  kind: SettingKind;
  /** choice 類的候選值。 */
  choices?: readonly string[];
}

export interface ChangeResult {
  config: HudConfig;
  /** 有值代表這次修改被拒絕,字串是給使用者看的原因。 */
  rejected?: string;
}

export const LINE_ITEM_PREFIX = "line:";
const EMPTY_MOTTO = "(空)";

const SWITCH_VALUES = [SWITCH_ON, SWITCH_OFF];

export function buildSettingItems(config: HudConfig): SettingItemSpec[] {
  return [
    {
      id: "lines",
      label: "顯示哪幾行",
      description: "footer 的七行,可個別開關",
      currentValue: `${config.lines.length}/${LINE_NAMES.length}`,
      kind: "lines",
    },
    {
      id: "motto",
      label: "座右銘",
      description: "第一行結尾的自訂文字,留空即不顯示",
      currentValue: config.motto === "" ? EMPTY_MOTTO : config.motto,
      kind: "text",
    },
    {
      id: "sessionBudget",
      label: "Session 預算",
      description: "Session 進度條的分母,純粹是視覺尺規",
      currentValue: String(config.sessionBudget),
      kind: "number",
    },
    {
      id: "maxToolEntries",
      label: "工具行上限",
      description: "工具那行最多列幾項",
      currentValue: String(config.maxToolEntries),
      kind: "number",
    },
    {
      id: "palettePreset",
      label: "配色",
      description: "十種配色,終端設了 NO_COLOR 時一律不上色",
      currentValue: config.palettePreset,
      kind: "choice",
      choices: PALETTE_NAMES,
    },
    {
      id: "icons",
      label: "emoji 與符號",
      description: "關掉之後 HUD 只剩文字",
      currentValue: switchLabel(config.icons),
      values: SWITCH_VALUES,
      kind: "cycle",
    },
    {
      id: "sessionBar",
      label: "session 橫線",
      description: "輸入框上方那條帶 session 名的橫線",
      currentValue: switchLabel(config.sessionBar),
      values: SWITCH_VALUES,
      kind: "cycle",
    },
  ];
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
  header: "模型、provider、已耗時、座右銘",
  repo: "目錄名與 git 分支,併在 header 右側",
  meters: "Context 與 Session 計量條",
  cache: "快取命中率,併在 meters 尾端",
  env: "AGENTS.md / MCP / extension / skill 計數",
  tools: "本 session 各工具被呼叫幾次",
  status: "agent 數、執行中工具數、累計花費",
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
      return { config, rejected: "至少要保留一行。" };
    }
    return { config: { ...config, lines } };
  }
  if (config.lines.includes(name)) return { config };
  // 依 LINE_NAMES 的順序插回去,而不是接在最後面——重新打開一行不該把版面
  // 順序也改掉。
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
      return { config, rejected: `不認得的行:${name}` };
    }
    return toggleLine(config, name as LineName, newValue === SWITCH_ON);
  }

  switch (id) {
    case "motto":
      return { config: { ...config, motto: sanitizeText(newValue) } };

    case "sessionBudget":
    case "maxToolEntries": {
      const value = positiveInt(newValue);
      if (value === null) return { config, rejected: "請輸入正整數。" };
      return { config: { ...config, [id]: value } };
    }

    case "palettePreset": {
      if (!(PALETTE_NAMES as readonly string[]).includes(newValue)) {
        return { config, rejected: `不認得的配色:${newValue}` };
      }
      return { config: { ...config, palettePreset: newValue as PaletteName } };
    }

    case "icons":
    case "sessionBar":
      return { config: { ...config, [id]: newValue === SWITCH_ON } };

    default:
      return { config, rejected: `不認得的設定:${id}` };
  }
}

// pi-tui 的 SettingItem 形狀。用結構型別而不是 import——這一層不該碰執行期。
export interface SettingItemShape {
  id: string;
  label: string;
  description?: string;
  currentValue: string;
  values?: string[];
  submenu?: (currentValue: string, done: (selected?: string) => void) => unknown;
}

/**
 * 把設定描述轉成 SettingsList 吃的形狀。
 *
 * 只有 cycle 類保留 values(就地循環),其餘掛 submenu——十種配色循環按十次
 * 不是設定,是懲罰。
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
