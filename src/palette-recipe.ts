// 配色的配方。九個角色不再逐一手寫,而是從四個參數推導出來。
//
// 為什麼要推導:實測九套手寫配色,佔畫面 70% 的三個角色(dim 31.8%、fg 21.0%、
// track 17.4%)兩兩色差中位數只有 0.075 / 0.056 / 0.040(OKLab),最接近的一對
// track 是 0.009——換配色時畫面最大的那一塊幾乎沒變,難怪切了跟沒切一樣。
// 原因不是顏色挑得不好,是那三個角色每一套都是分別手寫的,寫著寫著就漂回
// 同一團灰。從色相推導它們,就漂不掉了。
//
// 為什麼用 OKLCH 而不是 HSL:OKLCH 的亮度是感知均勻的,同一個 L 在黃色與藍色
// 看起來一樣亮。可讀性下限靠亮度守,而 HSL 的亮度守不住——HSL 的 L=0.6 在黃色
// 刺眼、在藍色偏暗。

export type Scheme = "complement" | "analogous" | "split" | "triad" | "tetrad" | "monohue";

/** 哪些語意色保留色相。極簡風格靠這個決定「顏色什麼時候才出現」。 */
export type Alerts = "all" | "warn" | "none";

export interface Recipe {
  /** 主色相(cyan 角色的色相),0-360。 */
  hue: number;
  /** cyan 之外那兩個主題色擺在色輪的哪裡。 */
  scheme: Scheme;
  /** 彩度倍率。dusk 那種低彩 0.4,neon 那種高彩 1.6。 */
  chroma: number;
  /** 主題色的亮度基準。 */
  light: number;
  /** dim 與 track 的明暗位移。相鄰色相的兩套靠它錯開,不然會長得像。 */
  depth?: number;
  /**
   * 極簡模式:主題色壓成灰階,只留亮度分層。值代表語意色保留多少彩度。
   * 未設定就是一般模式(主題色照 scheme 各有各的色相)。
   */
  neutral?: number;
  /** all 三個語意色都有顏色;warn 只有 amber/red;none 全灰。 */
  alerts?: Alerts;
}

// 語意色相釘死。換配色不該讓人重新學一次「紅色代表什麼」——變的是彩度與
// 亮度(跟著該套的濃淡走),不是色相。
const SEMANTIC = { green: 148, amber: 85, red: 27 } as const;

const OFFSET: Record<Scheme, readonly [number, number, number]> = {
  complement: [0, 180, 20],
  analogous: [0, 40, -30],
  split: [0, 150, 25],
  triad: [0, 120, 240],
  tetrad: [0, 90, 180],
  monohue: [0, 14, -14],
};

// 可讀性下限。基準底色與既有的 track 測試同一個,不另立一把尺。
//
// track 4:1 不是憑感覺:純色 3:1 是門檻,但實際用 ░ 畫、覆蓋率約四分之一,
// 感知對比會低很多,所以留餘裕。留下來的五套手寫配色實測都落在 3.98-4.02,
// 這個值本來就是它們的既有水準,不是新加的限制。
const DARK_BG: readonly [number, number, number] = [0x1e, 0x1e, 0x1e];
const FLOOR: Record<string, number> = { track: 4.0, dim: 3.0, fg: 7.0 };
const DEFAULT_FLOOR = 4.5;

function toLinear(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function gamma(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function oklchToRgb(L: number, C: number, hue: number): [number, number, number] {
  const a = C * Math.cos((hue * Math.PI) / 180);
  const b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function toBytes(rgb: readonly [number, number, number]): [number, number, number] {
  return rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) as [number, number, number];
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** OKLCH 有一大塊落在 sRGB 之外。降彩度直到進得來——降彩度比降亮度好,亮度要守可讀性。 */
function clip(L: number, C: number, hue: number): [number, number, number] {
  let c = C;
  for (let i = 0; i < 220; i += 1) {
    const rgb = oklchToRgb(L, c, hue);
    if (rgb.every((v) => v >= -0.001 && v <= 1.001)) return toBytes(rgb);
    c *= 0.96;
  }
  return toBytes(oklchToRgb(L, 0, hue));
}

/**
 * 取一個色相與彩度下、對深底達得到門檻的顏色。
 *
 * 跟 forLightBackground 的 darkenUntilReadable 是對稱的一對:那邊對白底往下壓,
 * 這邊對深底往上提。有了這兩道,配方寫錯不會產出「好看但看不見」的配色——
 * 這正是手寫 hex 擋不住的那類錯誤。
 */
export function readable(role: string, L: number, C: number, hue: number): string {
  const target = FLOOR[role] ?? DEFAULT_FLOOR;
  for (let l = Math.max(0, L); l <= 1; l += 0.004) {
    const rgb = clip(l, C, hue);
    if (contrast(rgb, DARK_BG) >= target) return toHex(rgb);
  }
  return toHex(clip(1, C, hue));
}

export interface RolePalette {
  cyan: string;
  orange: string;
  blue: string;
  green: string;
  amber: string;
  red: string;
  fg: string;
  dim: string;
  track: string;
}

export function buildPalette(recipe: Recipe): RolePalette {
  const { hue, scheme, chroma, light, depth = 0, neutral, alerts = "all" } = recipe;
  const [ch, oh, bh] = OFFSET[scheme].map((d) => (((hue + d) % 360) + 360) % 360);
  const accent = (c: number) => 0.135 * chroma * c;
  // 底層三個角色永遠跟著主色相走。它們佔畫面 70%,是「換了配色」這件事看不看
  // 得出來的關鍵——手寫時代它們九套幾乎相同,正是主題像的原因。
  //
  // 極簡那幾套的 dim 彩度反而拉高:它們的主題色全在同一條灰階上,dim 又被
  // 3:1 的下限釘在同一個亮度,不給色相就本質分不開(實測四套兩兩只差 2.1)。
  // 而極簡的意思是「顏色不承載訊號」,不是「沒有顏色」——帶色調的灰標籤不
  // 傳達任何訊號,它只是底色,所以這不違反極簡。
  const base = {
    fg: readable("fg", 0.9 + depth * 0.35, accent(neutral === undefined ? 0.22 : 0.15), ch),
    dim: readable("dim", 0.53 + depth, accent(neutral === undefined ? 0.56 : 1.6), ch),
    track: readable("track", 0.47 + depth, accent(neutral === undefined ? 0.41 : 0.8), ch),
  };
  const grey = (l: number) => readable("cyan", l, accent(1), ch);
  const semantic = (role: string, l: number, k: number, h: number) => readable(role, l, 0.135 * k, h);
  const strength = neutral ?? 1;
  const themed =
    neutral === undefined
      ? {
          cyan: readable("cyan", light, accent(1), ch),
          orange: readable("orange", light, accent(1), oh),
          blue: readable("blue", light, accent(0.9), bh),
        }
      : { cyan: grey(light), orange: grey(light - 0.13), blue: grey(light - 0.065) };
  const coloured = {
    green: semantic("green", light, strength * 0.95, SEMANTIC.green),
    amber: semantic("amber", light + 0.02, strength * 0.95, SEMANTIC.amber),
    red: semantic("red", light - 0.02, strength * 1.05, SEMANTIC.red),
  };
  if (alerts === "all") return { ...base, ...themed, ...coloured };
  // 只有壞消息才上色:綠色代表「一切正常」,而正常不需要被看見。
  if (alerts === "warn") {
    return { ...base, ...themed, green: grey(light - 0.02), amber: coloured.amber, red: coloured.red };
  }
  return {
    ...base,
    ...themed,
    green: grey(light - 0.02),
    amber: grey(light + 0.03),
    red: grey(light - 0.2),
  };
}

/**
 * 十套配方。色相刻意鋪開,再用彩度與 depth 錯開相鄰的兩套——實測光靠色相
 * 平均分佈並不夠,相鄰色相的兩套會在每個角色上都相近,反而比手寫時代更像。
 */
export const RECIPES: Record<string, Recipe> = {
  "deep-sea": { hue: 190, scheme: "complement", chroma: 1.15, light: 0.82, depth: -0.06 },
  jade: { hue: 150, scheme: "split", chroma: 0.88, light: 0.79, depth: 0.055 },
  "amber-crt": { hue: 75, scheme: "monohue", chroma: 1.2, light: 0.82, depth: -0.02 },
  lava: { hue: 30, scheme: "analogous", chroma: 1.35, light: 0.8, depth: -0.03 },
  synthwave: { hue: 325, scheme: "complement", chroma: 1.45, light: 0.82, depth: -0.04 },
  // 色相 316 不是隨便挑的:ash 與手寫的 dusk 都是「安靜的灰」,近到加權感知
  // 距離只有 0.0354(門檻 0.0488)。彩度維持 0.26 不動——近無彩是它的性格,
  // 拉開靠色相就夠了。
  ash: { hue: 316, scheme: "monohue", chroma: 0.26, light: 0.76, depth: 0.04 },
  "min-paper": { hue: 283, scheme: "monohue", chroma: 0.1, light: 0.96, depth: 0.1, neutral: 0.35 },
  // 這十套的參數是十套一起解出來的,不是一套一套調的:約束彼此耦合,單獨調
  // 一套會把另一對推到門檻以下(實測改完 ash 就換 dusk 與 min-night 撞上)。
  // 極簡這四套的參數是搜出來的,不是手調的:它們的色相全擠在藍紫灰一帶,
  // dim 又被 3:1 的下限釘在同一個亮度,手調會沒完沒了地互相撞(實測 min-night
  // 與 min-alert-dark 的 dim 一度只差 2.1,門檻是 6)。色相帶是硬約束——
  // 「夜」不能被最佳化器換成暖褐灰,那就不是使用者挑的那一套了。
  "min-night": { hue: 236, scheme: "monohue", chroma: 0.47, light: 0.85, depth: -0.095, neutral: 0.45 },
  "min-zero": { hue: 303, scheme: "monohue", chroma: 0.17, light: 0.905, depth: 0, neutral: 0, alerts: "none" },
  "min-alert-dark": { hue: 196, scheme: "monohue", chroma: 0.3, light: 0.82, depth: -0.01, neutral: 0.9, alerts: "warn" },
};
