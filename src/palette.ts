import { RECIPES, buildPalette } from "./palette-recipe.ts";

// 十五套配色 + 一套不上色。分成兩批,來源不同是刻意的:
//
//   手寫五套  tokyo-night / ember / triad / dusk / neon —— 使用者挑過留下的,
//             原樣不動。手工微調過的東西沒有理由丟掉重算。
//   配方十套  其餘的從 palette-recipe.ts 的四個參數推導。推導的理由見那個檔:
//             佔畫面 70% 的 dim / fg / track 手寫時會漂回同一團灰,推導才漂不掉。
//
// 九個角色的語意(不隨風格改變):
//   cyan   模型名與窗口大小、Cache
//   orange provider、座右銘、狀態行前綴
//   blue   repo 目錄名、Session
//   green  git 分支、工具記號、Context 低於 70%
//   amber  Context 70-90%、雲端計費
//   red    Context 高於 90%、git 髒污
//   fg     數值與工具名
//   dim    標籤、分隔符、次數
//   track  進度條未填滿的部分
//
// green / amber / red 在每一套裡都維持同一個色相家族——換配色不應該讓使用者
// 重新學一次「紅色代表什麼」。極簡那幾套動的是「顏色什麼時候才出現」,不是
// 顏色的意思:min-alert-dark 讓綠色退成灰(正常不需要被看見),min-zero 連
// 語意色都退成灰(語意改由位置承擔)。

export type PaletteName =
  | "tokyo-night"
  | "ember"
  | "triad"
  | "dusk"
  | "neon"
  | "deep-sea"
  | "jade"
  | "amber-crt"
  | "lava"
  | "synthwave"
  | "ash"
  | "min-paper"
  | "min-night"
  | "min-zero"
  | "min-alert-dark"
  | "mono";

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

const HAND_TUNED = {
  // 冷色類比:青藍紫相鄰色相,provider 用暖橙跳出來。
  "tokyo-night": {
    cyan: "#7dcfff", orange: "#ff9e64", blue: "#7aa2f7",
    green: "#9ece6a", amber: "#e0af68", red: "#f7768e",
    fg: "#c0caf5", dim: "#366682", track: "#6c79b2",
  },
  // 暖色類比:琥珀橙紅褐。
  ember: {
    cyan: "#fabd2f", orange: "#fe8019", blue: "#d3869b",
    green: "#b8bb26", amber: "#d79921", red: "#fb4934",
    fg: "#ebdbb2", dim: "#886d3e", track: "#837b76",
  },
  // 三等分:色輪 120 度三點,分區最清楚。
  triad: {
    cyan: "#c792ea", orange: "#89ddff", blue: "#b388ff",
    green: "#a5e075", amber: "#f0c674", red: "#ff5370",
    fg: "#d8dee9", dim: "#7c658b", track: "#7579a8",
  },
  // 低彩度:全部降飽和,只靠明度分層。代價是紅色的警示力較弱。
  dusk: {
    cyan: "#a3c9d9", orange: "#dcb6a4", blue: "#b4bfd9",
    green: "#a8c8a0", amber: "#d9c48f", red: "#cf9a9a",
    fg: "#ccd0d9", dim: "#576b74", track: "#757b9a",
  },
  // 高彩度:遠遠就看得到狀態改變。代價是久看眼睛會累。
  neon: {
    cyan: "#00e5ff", orange: "#ff2bd6", blue: "#7c4dff",
    green: "#39ff88", amber: "#ffe600", red: "#ff2d55",
    fg: "#e8ecff", dim: "#005d6f", track: "#6977c4",
  },
} as const satisfies Record<string, Palette>;

const MONO: Palette = {
  cyan: null, orange: null, blue: null, green: null,
  amber: null, red: null, fg: null, dim: null, track: null,
};

function fromRecipes(): Record<string, Palette> {
  const out: Record<string, Palette> = {};
  for (const [name, recipe] of Object.entries(RECIPES)) out[name] = buildPalette(recipe);
  return out;
}

export const PALETTES: Record<PaletteName, Palette> = {
  ...HAND_TUNED,
  ...fromRecipes(),
  // 完全不輸出顏色碼。給不支援 truecolor 的終端,也是 NO_COLOR 的落點。
  mono: MONO,
} as Record<PaletteName, Palette>;

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

const DEFAULT_PALETTE: PaletteName = "tokyo-night";
const RESET = "\u001b[0m";
const SEQUENCE = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b][^\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/y;

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// 版面前提:ambiguous 寬度的字元一律視為一欄,選項 2 的所有欄位對齊都建立在這之上。
// emoji 寬度改由執行期的 \p{RGI_Emoji} 屬性判定(隨 Node 的 Unicode 版本更新),
// 下表只留與使用量無關的固定 CJK / 全形 EastAsianWidth 區塊。
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
  return Object.hasOwn(PALETTES, name)
    ? PALETTES[name as PaletteName]
    : PALETTES[DEFAULT_PALETTE];
}

/**
 * 終端支援 24 位元色嗎?
 *
 * 不支援時輸出 truecolor 逸出碼會變成一堆亂碼,所以偵測不到就退回 mono。
 * 判定依 COLORTERM 慣例(truecolor / 24bit),這是各家終端共通的宣告方式,
 * 不需要維護終端清單。無法判定時保守假設不支援。
 */


/** 依終端能力挑調色盤:不支援 truecolor 時強制 mono。 */
// 淺色終端的推導版本。
//
// 九套配色都是照深底調校的,對白底只有 1.17–2.48——標籤(dim)看得見、數值
// 看不見。而 pi 有 OSC 11 背景偵測與內建的 light 主題,淺底是真的會發生。
//
// 用推導而不是再手寫十套淺色配色:每個角色保持色相往下壓亮度,壓到對白底
// 達標為止。手寫等於把維護債乘以二,而且十套 × 九個角色的色相遲早會漂。
const LIGHT_BG: [number, number, number] = [255, 255, 255];
const TEXT_TARGET = 4.5;
const SUBTLE_TARGET = 3;
const SUBTLE_ROLES = new Set(["dim", "track"]);

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
  // 由亮到暗掃一遍,取第一個達標的——保留最多彩度,不會整個壓成黑色。
  //
  // 取整到 8 bit 之後對比會些微下降,所以拿四捨五入後的值判斷,不是拿浮點
  // 中間值——否則會回傳一個「算起來達標、實際輸出差 0.01」的顏色。
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
 * 從一段 ANSI 前景色序列判斷終端是不是淺底。
 *
 * pi 有 OSC 11 背景偵測,會據此在內建的 dark / light 主題之間切換,而主題的
 * 文字色必然要對背景可讀——所以文字色偏暗就代表背景是亮的。
 *
 * 判斷用亮度而不是比對主題名稱:使用者可以裝自訂主題,名字不會是 "light"。
 * 硬編一張主題名清單等於每出一個新主題就要改一次程式碼。
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
  // 不自行嗅探終端能力。上一版看 COLORTERM 與 WT_SESSION,兩者都沒設就整份退回
  // mono——但那兩個變數只是慣例,不設不代表不支援,結果是把使用者選的配色整個吃掉。
  // pi 自己的判斷(pi-tui detectCapabilities)在 win32 一律當作支援 truecolor,
  // 我們沒有理由比宿主更保守。
  //
  // 唯一該關色的情境是使用者明講:NO_COLOR 是跨工具的既有標準(no-color.org),
  // 只要有值就關,不看內容。
  if ((env.NO_COLOR ?? "") !== "") return PALETTES.mono;
  return resolvePalette(name);
}
