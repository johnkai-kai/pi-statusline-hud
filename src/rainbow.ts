// 彩虹特效。與配色主題正交:主題管其他所有東西,彩虹只把清單裡那幾個目標的
// 取色函式換掉,沒被選中的照原本的語意角色上色。
//
// 目標是具名的,不是「第幾個 span」——span 的排列會隨版面改,名字不會。

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

/** 色相走完一圈要多久。三秒:看得出在動,又不會晃到讓人分心。 */
export const RAINBOW_PERIOD_MS = 3_000;

// 彩度與亮度固定,只讓色相跑。終端背景多半是深色,亮度太高會糊、太低會看不清;
// 這一組在深色與淺色背景上都還讀得動。
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
 * 第 index 個字元、在長度 length 的元素裡、在 phaseMs 這一刻的顏色。
 *
 * 一個元素橫跨完整一圈色相(位置項),整體再隨時間位移(時間項)。兩項相加
 * 就是「光帶在字上流過」的觀感,而它是純函式——同樣的輸入永遠同樣的輸出,
 * 所以測得起來。
 */
export function rainbowHex(index: number, length: number, phaseMs: number): string {
  const span = Number.isFinite(length) && length > 0 ? length : 1;
  const position = Number.isFinite(index) ? index / span : 0;
  const drift = Number.isFinite(phaseMs) ? phaseMs / RAINBOW_PERIOD_MS : 0;
  const hue = (((position + drift) % 1) + 1) % 1 * 360;
  return `#${byte(channel(hue, 0))}${byte(channel(hue, 8))}${byte(channel(hue, 4))}`;
}

/** 以碼點為單位逐字上色——用字串索引會把 emoji 的代理對從中間切開。 */
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

/** 這個目標有沒有被選中。設定層以外的地方只透過它問,不直接翻陣列。 */
export function hasRainbow(config: { rainbow: readonly RainbowTarget[] }, target: RainbowTarget): boolean {
  return config.rainbow.includes(target);
}
