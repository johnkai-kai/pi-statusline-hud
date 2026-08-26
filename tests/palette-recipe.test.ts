import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPES, buildPalette, readable } from "../src/palette-recipe.ts";

const ROLES = ["cyan", "orange", "blue", "green", "amber", "red", "fg", "dim", "track"] as const;
const DARK_BG = "#1e1e1e";

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("每個配方都產出九個合法 hex", () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const palette = buildPalette(recipe);
    for (const role of ROLES) {
      assert.match(palette[role], /^#[0-9a-f]{6}$/, `${name}.${role} = ${palette[role]}`);
    }
  }
});

test("可讀性下限是生成時就守住的,不是事後檢查", () => {
  const floors: Record<string, number> = { track: 4, dim: 3, fg: 7 };
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const palette = buildPalette(recipe);
    for (const role of ROLES) {
      const need = floors[role] ?? 4.5;
      const got = contrast(palette[role], DARK_BG);
      assert.ok(got >= need - 0.01, `${name}.${role} 只有 ${got.toFixed(2)}:1,需要 ${need}`);
    }
  }
});

test("配方寫得再暗也提得上來——下限擋得住人為失誤", () => {
  // 亮度給 0.05 這種一定看不見的值,readable 要把它提到達標為止。
  const hex = readable("track", 0.05, 0.05, 200);
  assert.ok(contrast(hex, DARK_BG) >= 4, `提亮後只有 ${contrast(hex, DARK_BG).toFixed(2)}:1`);
});

test("track 永遠比 fg 暗——空槽不能亮得像填滿", () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const p = buildPalette(recipe);
    assert.ok(luminance(p.track) < luminance(p.fg), `${name} 的 track 比 fg 亮`);
  }
});

// 極簡是「帶色調的灰」不是純灰,所以斷言相對關係而不是絕對色差:主題色彼此
// 一樣安靜,語意色要明顯跳出來。訂絕對門檻會把 min-alert-dark 那種帶藍的灰
// 誤判成有顏色。
const chroma = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b);
};

test("極簡配方的主題色一樣安靜,語意色才跳出來", () => {
  const p = buildPalette(RECIPES["min-paper"]);
  const grey = chroma(p.cyan);
  for (const role of ["orange", "blue", "green"] as const) {
    assert.ok(chroma(p[role]) < grey * 2 + 12, `${role} 不該比主題灰吵`);
  }
  assert.ok(chroma(p.red) > grey * 2, `紅色要跳出來,主題灰 ${grey} 對紅 ${chroma(p.red)}`);
});

test("alerts:none 連語意色都跟主題灰一樣安靜——顏色一點都不出現", () => {
  const p = buildPalette(RECIPES["min-zero"]);
  const grey = chroma(p.cyan);
  for (const role of ROLES) {
    assert.ok(chroma(p[role]) <= grey + 12, `${role} 色差 ${chroma(p[role])} 高於主題灰 ${grey}`);
  }
});

test("alerts:warn 只有壞消息上色——綠色跟主題灰同級,紅與琥珀明顯跳出來", () => {
  const p = buildPalette(RECIPES["min-alert-dark"]);
  const grey = chroma(p.cyan);
  assert.ok(chroma(p.green) <= grey + 12, `綠色 ${chroma(p.green)} 該跟主題灰 ${grey} 同級`);
  assert.ok(chroma(p.red) > grey * 2, `紅色要跳出來,實得 ${chroma(p.red)} 對灰 ${grey}`);
  assert.ok(chroma(p.amber) > grey * 2, `琥珀要跳出來,實得 ${chroma(p.amber)} 對灰 ${grey}`);
});

test("同一個配方兩次呼叫結果一致——純函式,測得起來", () => {
  assert.deepEqual(buildPalette(RECIPES.jade), buildPalette(RECIPES.jade));
});
