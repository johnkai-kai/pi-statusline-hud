import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.ts";
import {
  type Palette,
  type PaletteName,
  PALETTES,
  paint,
  visibleLength,
  truncateAnsi,
  padBetween,
  resolvePalette,
  paletteFor,
  forLightBackground,
  PALETTE_NAMES,
} from "../src/palette.ts";

const ESC = "\u001b";
const RESET = `${ESC}[0m`;
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const strip = (s: string): string => s.replace(ANSI, "");
const ROLES = ["cyan", "orange", "blue", "green", "amber", "red", "fg", "dim", "track"] as const;

test("PALETTES 提供 tokyo-night 的九個角色", () => {
  const p = PALETTES["tokyo-night"];
  for (const role of ROLES) {
    assert.match(p[role] ?? "", /^#[0-9a-f]{6}$/, `${role} 應為 hex`);
  }
  assert.equal(p.cyan, "#7dcfff");
  assert.equal(p.orange, "#ff9e64");
  assert.equal(p.blue, "#7aa2f7");
  assert.equal(p.green, "#9ece6a");
  assert.equal(p.amber, "#e0af68");
  assert.equal(p.red, "#f7768e");
  assert.equal(p.fg, "#c0caf5");
  assert.equal(p.dim, "#366682");
  assert.equal(p.track, "#6c79b2");
});

test("mono 調色盤的每個角色都是 null", () => {
  const p = PALETTES.mono;
  for (const role of ROLES) {
    assert.equal(p[role], null, `${role} 應為 null`);
  }
});

test("paint 包上 truecolor 序列", () => {
  assert.equal(paint("#7dcfff", "hi"), `${ESC}[38;2;125;207;255mhi${RESET}`);
  assert.equal(paint("#000000", "x"), `${ESC}[38;2;0;0;0mx${RESET}`);
});

test("paint 對 null 與空字串原樣回傳", () => {
  assert.equal(paint(null, "hi"), "hi");
  assert.equal(paint("#7dcfff", ""), "");
  assert.equal(paint(null, ""), "");
});

test("paint 對無法解析的 hex 回傳原文", () => {
  assert.equal(paint("nope", "hi"), "hi");
  assert.equal(paint("#12345", "hi"), "hi");
});

test("visibleLength 忽略 ANSI 逸出序列", () => {
  assert.equal(visibleLength("abc"), 3);
  assert.equal(visibleLength(paint("#7dcfff", "abc")), 3);
  assert.equal(visibleLength(`${ESC}[38;2;1;2;3mab${RESET}${ESC}[1mcd${RESET}`), 4);
  assert.equal(visibleLength(`${ESC}[2Kabc`), 3);
  assert.equal(visibleLength(""), 0);
});

test("visibleLength 以終端欄寬計算寬字元", () => {
  assert.equal(visibleLength("\u2588\u2588"), 2);
  assert.equal(visibleLength("\u00b7"), 1);
  assert.equal(visibleLength("\u2502"), 1);
  assert.equal(visibleLength("\u23f1"), 1);
  // 中英混排:CJK 佔兩欄,ASCII 佔一欄。全換成 ASCII 就沒在測東西了。
  assert.equal(visibleLength("中文 mix"), 8);
  assert.equal(visibleLength(paint("#ff9e64", "中文字")), 6);
});

test("truncateAnsi 在放得下時原樣回傳", () => {
  assert.equal(truncateAnsi("abc", 3), "abc");
  assert.equal(truncateAnsi("abc", 10), "abc");
  const painted = paint("#7dcfff", "abc");
  assert.equal(truncateAnsi(painted, 5), painted);
});

test("truncateAnsi 不會把逸出序列切成兩半", () => {
  const input = `${ESC}[38;2;125;207;255mabcdef${RESET}`;
  const out = truncateAnsi(input, 3);
  assert.equal(visibleLength(out), 3);
  assert.ok(out.startsWith(`${ESC}[38;2;125;207;255m`), "開頭序列應完整保留");
  assert.ok(out.endsWith(RESET), "截斷後應補上重設碼");
  assert.equal(strip(out), "abc");
  assert.ok(!/\u001b\[[0-9;]*$/.test(out), "不得留下半截序列");
});

test("truncateAnsi 遇到跨越邊界的寬字元不會超寬", () => {
  const out = truncateAnsi("a愷b", 2);
  assert.equal(visibleLength(out), 1);
  assert.equal(strip(out), "a");
  assert.equal(visibleLength(truncateAnsi("愷加", 3)), 2);
  assert.equal(strip(truncateAnsi("愷加", 3)), "愷");
});

test("truncateAnsi 對零或負寬度回傳空字串", () => {
  assert.equal(truncateAnsi("abc", 0), "");
  assert.equal(truncateAnsi("abc", -5), "");
});

test("truncateAnsi 無顏色時不附加重設碼", () => {
  assert.equal(truncateAnsi("abcdef", 3), "abc");
  assert.equal(truncateAnsi("\u2588\u2588\u2588", 2), "\u2588\u2588");
});

test("visibleLength 控制字元不佔欄寬", () => {
  assert.equal(visibleLength("a\u0007b"), 2);
  assert.equal(visibleLength("a\u000db"), 2);
  assert.equal(visibleLength("a\u001bb"), 2);
});

test("visibleLength 與 truncateAnsi 正確處理代理對", () => {
  assert.equal(visibleLength("\ud83d\ude80"), 2);
  const out = truncateAnsi("a\ud83d\ude80b", 2);
  assert.equal(visibleLength(out), 1);
  assert.equal(strip(out), "a");
  assert.ok(!/[\ud800-\udfff]/.test(out), "不得留下孤立代理碼元");
});

test("padBetween 撐開到指定顯示寬度", () => {
  const out = padBetween("left", "right", 20);
  assert.equal(visibleLength(out), 20);
  assert.equal(out, "left" + " ".repeat(11) + "right");
});

test("padBetween 對含顏色的段落仍算對寬度", () => {
  const left = paint("#7dcfff", "model");
  const right = paint("#9ece6a", "master");
  const out = padBetween(left, right, 40);
  assert.equal(visibleLength(out), 40);
  assert.ok(out.startsWith(left));
  assert.ok(out.endsWith(right));
});

test("padBetween 空段落時不強塞多餘欄位", () => {
  assert.equal(padBetween("left", "", 10), "left      ");
  assert.equal(visibleLength(padBetween("", "right", 10)), 10);
  assert.equal(visibleLength(padBetween("", "", 10)), 10);
});

test("padBetween 寬度不足時優先截斷右段並保留一格空白", () => {
  const out = padBetween("leftside", "rightside", 12);
  assert.equal(visibleLength(out), 12);
  assert.equal(strip(out), "leftside rig");
});

test("padBetween 極窄寬度時丟掉右段並截斷左段", () => {
  const out = padBetween("leftside", "rightside", 5);
  assert.ok(visibleLength(out) <= 5);
  assert.equal(strip(out), "lefts");
  assert.equal(padBetween("leftside", "rightside", 0), "");
});

test("visibleLength 只把 Emoji_Presentation 的時鐘符號算兩欄", () => {
  assert.equal(visibleLength("\u23f0"), 2);
  assert.equal(visibleLength("\u23f3"), 2);
  assert.equal(visibleLength("\u23f1"), 1);
  assert.equal(visibleLength("\u23f2"), 1);
  assert.equal(visibleLength("\u23f1\ufe0f"), 2);
});

test("visibleLength 認得 BMP 區的 Emoji_Presentation 符號為兩欄", () => {
  assert.equal(visibleLength("\u2705"), 2);
  assert.equal(visibleLength("\u26a1"), 2);
  assert.equal(visibleLength("\u2b50"), 2);
  assert.equal(visibleLength("\u274c"), 2);
  assert.equal(visibleLength("\u26a0\ufe0f"), 2);
});

test("visibleLength 對文字呈現的排版符號維持一欄", () => {
  for (const ch of ["\u2588", "\u2502", "\u00b7", "\u221a", "\u25b6", "\u2717", "\u2026"]) {
    assert.equal(visibleLength(ch), 1, `${JSON.stringify(ch)} 應為一欄`);
  }
  assert.equal(visibleLength("\u25b6\u25b6"), 2);
});

test("visibleLength 以字素叢集計算組合字與 ZWJ 序列", () => {
  assert.equal(visibleLength("\u{1F468}\u200d\u{1F4BB}"), 2);
  assert.equal(visibleLength("\u{1F469}\u200d\u{1F469}\u200d\u{1F467}"), 2);
  assert.equal(visibleLength("a\u0951b"), 2);
  assert.equal(visibleLength("e\u0301"), 1);
});

test("truncateAnsi 不把字素叢集切成兩半", () => {
  const zwj = "a\u{1F468}\u200d\u{1F4BB}";
  const out = truncateAnsi(zwj, 2);
  assert.equal(out, "a");
  assert.ok(!out.includes("\u200d"), "不得留下懸空的 ZWJ");
  assert.equal(truncateAnsi(zwj, 3), zwj);
});

test("truncateAnsi 對兩欄 emoji 不會超出要求寬度", () => {
  const out = truncateAnsi("\u2705\u2705\u2705\u2705\u2705", 5);
  assert.equal(visibleLength(out), 4);
  assert.equal(out, "\u2705\u2705");
});

test("visibleLength C1 控制字元不佔欄寬", () => {
  assert.equal(visibleLength("a\u0085b"), 2);
  assert.equal(visibleLength("a\u009bb"), 2);
});

test("resolvePalette 依名稱取得調色盤", () => {
  assert.equal(resolvePalette("tokyo-night"), PALETTES["tokyo-night"]);
  assert.equal(resolvePalette("mono"), PALETTES.mono);
});

test("resolvePalette 對未知名稱回退 tokyo-night", () => {
  assert.equal(resolvePalette("nord"), PALETTES["tokyo-night"]);
  assert.equal(resolvePalette(""), PALETTES["tokyo-night"]);
  assert.equal(resolvePalette("MONO"), PALETTES["tokyo-night"]);
});

test("設定檔的 palettePreset 能一路接到 resolvePalette", () => {
  assert.equal(resolvePalette(parseConfig({ palettePreset: "mono" }).palettePreset), PALETTES.mono);
  assert.equal(
    resolvePalette(parseConfig({ palettePreset: "dracula" }).palettePreset),
    PALETTES["tokyo-night"],
  );
});

test("NO_COLOR 有值時強制 mono,否則照使用者選的配色", () => {
  assert.equal(paletteFor("triad", { NO_COLOR: "1" }), PALETTES.mono);
  assert.equal(paletteFor("triad", { NO_COLOR: "" }), PALETTES.triad);
  assert.equal(paletteFor("triad", {}), PALETTES.triad);
});

test("不再自行嗅探終端能力——沒有 COLORTERM 與 WT_SESSION 一樣上色", () => {
  assert.equal(paletteFor("tokyo-night", { TERM: "dumb" }), PALETTES["tokyo-night"]);
});

// 進度條空槽的可見度。
//
// 原本九套配色的 track 對深底只有 1.03–1.44,實測結果是 contra 配色下十格
// 全空的 Session 條整條隱形,畫面上只剩一段空白——看起來像壞掉,不像 0%。
//
// 門檻訂 3:1 是純色的值。實際用 ░ 畫,覆蓋率約四分之一,感知對比會低很多,
// 所以實際值調到 4:1 附近留餘裕。
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_BG = "#1e1e1e";

test("每套配色的 track 對深底至少 3:1——空槽看不見等於進度條不存在", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    if (palette.track === null) continue;
    const ratio = contrast(palette.track, DARK_BG);
    assert.ok(ratio >= 3, `${name} 的 track ${palette.track} 只有 ${ratio.toFixed(2)}:1`);
  }
});

test("track 仍要比 fg 暗——空槽不能亮得像填滿", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    if (palette.track === null || palette.fg === null) continue;
    assert.ok(
      relativeLuminance(palette.track) < relativeLuminance(palette.fg),
      `${name} 的 track 比 fg 還亮`,
    );
  }
});

// ---- 淺色終端 ----
//
// 九套彩色配色都是照深底調校的,對白底只有 1.17–2.48:標籤看得見、數值看不見。
// 而 pi 有 OSC 11 背景偵測與內建 light 主題,所以淺底是真的會發生的情境。
//
// 淺色版用推導而不是再手寫十套:每個角色保持色相往下壓亮度,壓到對白底
// 達標為止。手寫十套等於把維護債乘以二,而且色相遲早會漂。

const LIGHT_BG = "#ffffff";

test("每套配色都能推導出對白底可讀的淺色版", () => {
  for (const name of PALETTE_NAMES) {
    const light = forLightBackground(resolvePalette(name));
    for (const role of ["cyan", "orange", "blue", "green", "amber", "red", "fg"] as const) {
      const value = light[role];
      if (value === null) continue;
      const ratio = contrast(value, LIGHT_BG);
      assert.ok(ratio >= 4.5, `${name}.${role} = ${value} 對白底只有 ${ratio.toFixed(2)}:1`);
    }
    if (light.dim !== null) {
      assert.ok(contrast(light.dim, LIGHT_BG) >= 3, `${name}.dim 對白底不足 3:1`);
    }
    if (light.track !== null) {
      assert.ok(contrast(light.track, LIGHT_BG) >= 3, `${name}.track 對白底不足 3:1`);
    }
  }
});

test("mono 沒有顏色可壓,推導後仍然全 null", () => {
  assert.deepEqual(forLightBackground(PALETTES.mono), PALETTES.mono);
});

test("推導保持色相——不是把每個角色都壓成黑色", () => {
  const light = forLightBackground(PALETTES["tokyo-night"]);
  const hue = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    return Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
  };
  for (const role of ["cyan", "orange", "green", "red"] as const) {
    const before = PALETTES["tokyo-night"][role];
    const after = light[role];
    assert.ok(before !== null && after !== null);
    assert.ok(
      Math.abs(hue(before) - hue(after)) < 0.2,
      `${role} 的色相跑掉了:${before} -> ${after}`,
    );
  }
});

test("語意色在淺色版仍然彼此分得開", () => {
  const light = forLightBackground(PALETTES["tokyo-night"]);
  assert.notEqual(light.green, light.amber);
  assert.notEqual(light.amber, light.red);
});

// ---- dim 是配色的一部分,不是共用的灰 ----
//
// dim 一個角色佔畫面 31.8%(標籤、分隔符、次數全是它),比六個主題色加起來
// 還接近一半。原本九套的 dim 兩兩色差中位數只有 11.3、最接近的一對 2.7——
// 換配色時畫面最大的一塊幾乎沒變,主觀感受就是「主題不夠明顯」。
function labOf(hex: string): [number, number, number] {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a: string, b: string): number {
  const p = labOf(a);
  const q = labOf(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const COLOURED = PALETTE_NAMES.filter((name) => name !== "mono");

test("每套配色的 dim 都分得出來——這是換配色時最大的一塊", () => {
  for (let i = 0; i < COLOURED.length; i += 1) {
    for (let j = i + 1; j < COLOURED.length; j += 1) {
      const a = PALETTES[COLOURED[i]].dim;
      const b = PALETTES[COLOURED[j]].dim;
      assert.ok(a !== null && b !== null);
      const diff = deltaE(a, b);
      assert.ok(diff >= 6, `${COLOURED[i]} 與 ${COLOURED[j]} 的 dim 只差 ${diff.toFixed(1)}`);
    }
  }
});

test("dim 不能像任何一個語意色——它是背景資訊,不是訊號", () => {
  for (const name of COLOURED) {
    const palette = PALETTES[name];
    for (const role of ["cyan", "orange", "blue", "green", "amber", "red"] as const) {
      const accent = palette[role];
      assert.ok(palette.dim !== null && accent !== null);
      const diff = deltaE(palette.dim, accent);
      assert.ok(diff >= 20, `${name} 的 dim 跟 ${role} 只差 ${diff.toFixed(1)}`);
    }
  }
});

test("dim 仍要看得見——調色相不能連帶把亮度弄掉", () => {
  for (const name of COLOURED) {
    const dim = PALETTES[name].dim;
    assert.ok(dim !== null);
    assert.ok(contrast(dim, DARK_BG) >= 2, `${name} 的 dim 對深底只有 ${contrast(dim, DARK_BG).toFixed(2)}`);
  }
});

// ---- 主題之間必須真的不一樣 ----
//
// 這是這次改版的來由。舊的九套裡,佔畫面 70% 的三個角色(dim 31.8%、fg 21.0%、
// track 17.4%)兩兩色差極小——track 最接近的一對只差 0.009 OKLab,等於同一個
// 顏色。實際感受就是「換了配色跟沒換一樣」,因為真正在變的只有 18% 的畫面。
//
// 用加權距離而不是逐角色比:一個角色差很多但它只佔 2% 的畫面,人是看不出來的。
// 權重取自實測一份典型 HUD 的可見格數佔比。
const SCREEN_SHARE: Record<string, number> = {
  dim: 0.318, fg: 0.21, track: 0.174, cyan: 0.09,
  green: 0.065, blue: 0.05, orange: 0.043, amber: 0.03, red: 0.02,
};

function oklabOf(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function perceived(a: Palette, b: Palette): number {
  let total = 0;
  for (const [role, share] of Object.entries(SCREEN_SHARE)) {
    const x = a[role as keyof Palette];
    const y = b[role as keyof Palette];
    if (x === null || y === null) continue;
    const p = oklabOf(x);
    const q = oklabOf(y);
    total += share * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return total;
}

test("任兩套配色的加權感知距離都要超過舊版最接近的那一對", () => {
  // 0.0488 是舊版九套裡最像的一對(dusk ~ single)。訂在這裡的意思是:改版之後
  // 最像的一對,也要比改版前最像的那一對更不像。
  const FLOOR = 0.0488;
  for (let i = 0; i < COLOURED.length; i += 1) {
    for (let j = i + 1; j < COLOURED.length; j += 1) {
      const d = perceived(PALETTES[COLOURED[i]], PALETTES[COLOURED[j]]);
      assert.ok(d > FLOOR, `${COLOURED[i]} 與 ${COLOURED[j]} 只差 ${d.toFixed(4)}`);
    }
  }
});

test("語意色相不准漂——換配色不該讓人重學紅色代表什麼", () => {
  const hueOf = (hex: string): number => {
    const [, a, b] = oklabOf(hex);
    return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  };
  const chroma = (hex: string): number => {
    const [, a, b] = oklabOf(hex);
    return Math.hypot(a, b);
  };
  // 極簡那幾套刻意讓部分語意色退成灰(顏色不承載訊號),而灰的色相沒有意義。
  // 門檻取「該套三個語意色裡最濃的那個的六成」,不是一個拍出來的絕對值——
  // 絕對門檻會隨配方微調而誤判(實測 min-alert-dark 那個刻意退成灰的綠,
  // 彩度 0.0405 剛好越過 0.04 就被當成真的綠去比色相)。
  const meaningful = (name: PaletteName, role: "green" | "amber" | "red"): boolean => {
    const value = PALETTES[name][role];
    if (value === null) return false;
    const peak = Math.max(
      ...(["green", "amber", "red"] as const).map((r) => {
        const v = PALETTES[name][r];
        return v === null ? 0 : chroma(v);
      }),
    );
    return chroma(value) >= Math.max(0.045, peak * 0.6);
  };
  for (const role of ["green", "amber", "red"] as const) {
    const hues: Array<[PaletteName, number]> = [];
    for (const name of COLOURED) {
      const value = PALETTES[name][role];
      assert.ok(value !== null);
      if (!meaningful(name, role)) continue;
      hues.push([name, hueOf(value)]);
    }
    for (const [name, hue] of hues) {
      for (const [other, otherHue] of hues) {
        const gap = Math.abs(hue - otherHue);
        assert.ok(
          Math.min(gap, 360 - gap) < 45,
          `${role} 的色相在 ${name} 與 ${other} 之間差了 ${gap.toFixed(0)} 度`,
        );
      }
    }
  }
});
