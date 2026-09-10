import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { PALETTES, PALETTE_NAMES, forLightBackground, visibleLength } from "../src/palette.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { renderHud } from "../src/lines/index.ts";

const descriptions = {
  "tokyo-night": ["東京之夜", "Tokyo Night", "冷暖對照", "保留青藍、藍紫與暖橙的辨識色；提高次要標籤亮度，適合一般深色終端。"],
  ember: ["餘燼", "Ember", "暖色相鄰", "銅紅、橙與琥珀形成連續暖色；以明度區分資訊角色，避免滿畫面高彩度。"],
  triad: ["三色平衡", "Triad", "三角色", "紫、橙、青綠以約 120° 色相間隔分組；適合快速分辨模型、供應者與工作目錄。"],
  dusk: ["暮霧", "Dusk", "低彩度", "淡紫灰降低裝飾色強度，以明度建立層級；警告仍保留色彩與文字符號。"],
  "deep-sea": ["深海", "Deep Sea", "互補色", "海藍與暖色形成互補焦點；大部分資訊保持冷色，暖色只占少量。"],
  jade: ["青玉", "Jade", "綠色相鄰", "青綠附近的相鄰色建立整體感；黃色警告與紅色錯誤保持獨立語意。"],
  "amber-crt": ["琥珀終端", "Amber CRT", "單色相", "裝飾資訊共用琥珀色相，靠明度形成復古終端層級；狀態色仍可辨識。"],
  synthwave: ["霓虹波", "Synthwave", "分裂互補", "洋紅搭配互補色兩側的青綠與黃綠；提高裝飾彩度，保留中性文字。"],
  "min-alert-dark": ["靜默警示", "Quiet Alerts", "無彩色＋警示", "一般資訊維持灰階，只有警告與錯誤著色；適合希望減少色彩訊號的工作方式。"],
  mono: ["原生單色", "Monochrome", "無彩色", "不輸出色彩控制碼，沿用終端前景色；進度以實心／空心字元，錯誤以符號區分。"],
};
const data = {
  model: "Example Model", contextWindow: 128000, provider: "Provider", thinkingLevel: "medium",
  elapsedMs: 4620000, contextPercent: 76, contextTokens: 97280, sessionTokens: 1300000,
  cacheHitRate: 71, cacheRead: 71000, promptTokens: 100000,
  compactions: 2, compactReason: "threshold", env: { agentsMd: 1, mcps: 2, packages: 5, extensions: 8, skills: 4 },
  tools: [{ name: "bash", count: 15, errors: 2 }, { name: "read", count: 3 }],
  agents: 1, runningTools: 1, cost: 0.42, speed: { tokensPerSecond: 33, live: false },
  speedHistory: [12, 19, 31, 24, 33], ttftMs: 950, cwdName: "workspace", branch: "main",
  git: { staged: 3, modified: 2, untracked: 1, conflicts: 0 },
};
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function ansiHtml(text) {
  const pattern = /\x1b\[([0-9;]*)m/g;
  let offset = 0, output = "", colour = null;
  const append = part => { output += colour ? `<span style="color:${colour}">${escape(part)}</span>` : escape(part); };
  for (const match of text.matchAll(pattern)) {
    append(text.slice(offset, match.index));
    const codes = match[1].split(";").map(Number);
    if (codes[0] === 38 && codes[1] === 2) colour = `rgb(${codes.slice(2, 5).join(",")})`;
    else if (codes.includes(0) || codes.includes(39)) colour = null;
    offset = match.index + match[0].length;
  }
  append(text.slice(offset));
  return output;
}
function luminance(hex) {
  const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
assert.equal(PALETTE_NAMES.length, 10);
const catalogue = PALETTE_NAMES.map(id => {
  const modes = {};
  for (const mode of ["dark", "light"]) {
    const palette = mode === "dark" ? PALETTES[id] : forLightBackground(PALETTES[id]);
    const background = mode === "dark" ? "#1e1e1e" : "#ffffff";
    const textColours = Object.entries(palette).filter(([role, value]) => role !== "track" && value !== null);
    const minimum = textColours.length ? Math.min(...textColours.map(([, value]) => contrast(value, background))) : null;
    if (minimum !== null) assert.ok(minimum >= 4.5, `${id} text contrast`);
    const previews = {};
    for (const width of [48, 80, 120, 160]) {
      const lines = renderHud(data, { ...DEFAULT_CONFIG, palettePreset: id, icons: false }, width, palette);
      for (const line of lines) assert.ok(visibleLength(line) <= width);
      previews[width] = lines.map(ansiHtml).join("\n");
    }
    modes[mode] = { palette, minimum, previews };
  }
  return { id, title: descriptions[id][0], english: descriptions[id][1], scheme: descriptions[id][2], description: descriptions[id][3], modes };
});
const payload = JSON.stringify(catalogue).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>狀態列的十種主題</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Microsoft JhengHei",sans-serif;background:#101119;color:#e6e9f4}*{box-sizing:border-box}body{margin:0}main{max-width:1320px;margin:auto;padding:56px 28px}header{max-width:880px;margin-bottom:32px}.eyebrow{font-size:12px;letter-spacing:.18em;color:#9eaad6}h1{font-size:clamp(30px,4vw,52px);font-weight:650;letter-spacing:-.04em;margin:14px 0 18px}p{line-height:1.8;color:#b8c0d9}h2{font-size:22px}h3{margin:0;font-size:19px}.toolbar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:18px;background:#1b1e2b;border:1px solid #373d54;border-radius:14px}select,button{font:inherit;padding:9px 13px;background:#272c40;color:#edf0fa;border:1px solid #576281;border-radius:8px;cursor:pointer}button:hover{border-color:#9baaf7}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #7dcfff;outline-offset:3px}label{display:flex;align-items:center;gap:10px;font-size:14px}.lead{border:1px solid #566184;border-radius:16px;overflow:hidden;margin:20px 0 40px}.lead-head{padding:22px 24px;background:#202438;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.lead-head p{margin:8px 0 0}.terminal{background:#1e1e1e;color:#e6e6e6;padding:22px;overflow:auto}.terminal.light{background:#fff;color:#222}.terminal pre{font:12px/1.9 Consolas,"Liberation Mono",monospace;margin:0;white-space:pre;width:max-content;min-width:100%;font-variant-ligatures:none}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.card{border:1px solid #343a50;background:#191c28;border-radius:14px;overflow:hidden}.card.active{border-color:#9baaf7;box-shadow:0 0 0 1px #9baaf7}.card-head{padding:20px}.card h3 small{display:block;font-size:12px;color:#aab5d5;font-weight:400;letter-spacing:.04em;margin:7px 0}.card p{font-size:14px;margin:12px 0;min-height:50px}.tag{font-size:12px;border:1px solid #53607d;border-radius:20px;padding:4px 9px;color:#cbd6ef;white-space:nowrap}.row{display:flex;justify-content:space-between;align-items:center;gap:12px}.card .terminal{padding:16px}.card .terminal pre{font-size:10px}.swatches{display:flex;gap:7px;margin:15px 0}.swatch{height:22px;flex:1;border-radius:4px;border:1px solid #75809c}.metric{font-size:12px;color:#c7d1e8}.notes{margin-top:44px;padding:26px;background:#191c28;border:1px solid #343a50;border-radius:14px}.notes p{font-size:14px}.notes a{color:#9dd7ff}code{font-family:Consolas,monospace;background:#252b40;border-radius:4px;padding:2px 6px;color:#d5def7}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:28px 0}.summary div{border-top:1px solid #4b5473;padding-top:16px}.summary strong{display:block;font-size:24px;color:#e6e9f4}.summary span{font-size:13px;color:#aeb9d4}@media(max-width:760px){main{padding:28px 16px}.grid{grid-template-columns:1fr}.summary{grid-template-columns:1fr}.lead-head{padding:18px}.toolbar{gap:12px}.card p{min-height:0}}
</style>
<main><header><div class="eyebrow">PI STATUSLINE HUD / PALETTE COLLECTION</div><h1>十種配色，一致的資訊層級。</h1><p>讓顏色協助閱讀：用色相分組、用明度安排主次，再用固定的警告與錯誤訊號提醒狀態。預覽直接來自外掛的實際渲染函式，數字使用示範資料。</p></header>
<div class="summary"><div><strong>10</strong><span>九個彩色主題＋一個原生單色模式</span></div><div><strong>4.5 : 1</strong><span>參考背景上的文字最低對比目標</span></div><div><strong>深色／淺色</strong><span>同一套角色，分別調整可讀性</span></div></div>
<div class="toolbar"><label>主題<select id="theme" aria-label="選擇主題"></select></label><label>參考背景<select id="mode"><option value="dark">深色 #1e1e1e</option><option value="light">淺色 #ffffff</option></select></label><label>終端寬度<select id="width"><option>48</option><option>80</option><option selected>120</option><option>160</option></select>欄</label><button id="copy">複製主題設定</button><span id="feedback" role="status"></span></div>
<section class="lead" aria-label="選取主題預覽"><div class="lead-head"><div><h2 id="title" style="margin:0"></h2><p id="description"></p></div><span id="metric" class="metric"></span></div><div id="hero" class="terminal"><pre></pre></div></section>
<h2>比較全部主題</h2><p>以下以 80 欄顯示。色票依序代表模型、供應者、工作目錄、正常、警告、錯誤、內文、次要標籤、空進度格。</p><div id="grid" class="grid"></div>
<section class="notes"><h2>設計依據與使用邊界</h2><p>配色由感知色彩空間(Oklab)的極座標表示 OKLCH 推導，以明度(Lightness, L)、彩度(Chroma, C)與色相(Hue, H)分別調整。三角色採 120° 間隔；分裂互補使用 150°／210°。超出顯示色域時降低彩度，優先保留文字可讀性。</p><p>依網頁內容無障礙指引(Web Content Accessibility Guidelines, WCAG)的文字對比原則，彩色模式每個文字角色在 #1e1e1e 與 #ffffff 的實際輸出色都至少 4.5:1；進度空格至少 3:1。這是參考背景測量，並非對所有終端、字型、透明度或使用者背景宣告全面符合規範。單色模式的對比取決於終端自身。</p><p>東京之夜(Tokyo Night)沿用公開配色的辨識色，次要標籤為了可讀性調亮。各主題只控制前景色，不會替你改終端背景。預覽刻意關閉圖示以方便比較；色彩也不是唯一訊號，進度與錯誤仍有字元或數字。</p><p>在 <code>/pi-statusline-hud</code> 選單中選取主題會立即生效。直接編輯設定檔後需要重啟或重新開啟選單。舊設定會自動對應：neon → synthwave、lava → ember、ash／min-paper → dusk、min-night → min-alert-dark、min-zero → mono。</p><p>技能的用途：<code>pi-statusline-hud</code> 協助用自然語言修改設定；<code>pi-statusline-hud-setup</code> 協助診斷安裝與顯示問題。實際繪圖由擴充功能負責，技能不是繪圖引擎。</p><p>來源：<a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html">W3C 文字對比規則</a> · <a href="https://www.w3.org/TR/css-color-4/#ok-lab">W3C Oklab 色彩空間</a> · <a href="https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua">Tokyo Night 原始配色</a></p></section></main>
<script id="catalogue" type="application/json">${payload}</script>
<script>
const themes=JSON.parse(document.getElementById('catalogue').textContent);
const select=document.getElementById('theme'), mode=document.getElementById('mode'), width=document.getElementById('width');
themes.forEach(t=>select.add(new Option(t.title+' · '+t.english,t.id)));
function metric(t){const n=t.modes[mode.value].minimum;return n===null?'原生前景色／對比由終端決定':'文字最低 '+(Math.floor(n*100)/100).toFixed(2)+' : 1';}
function draw(){
const theme=themes.find(t=>t.id===select.value), variant=theme.modes[mode.value];
document.getElementById('title').textContent=theme.title+' · '+theme.english;
document.getElementById('description').textContent=theme.description;
document.getElementById('metric').textContent=metric(theme);
const hero=document.getElementById('hero');hero.className='terminal '+mode.value;hero.querySelector('pre').innerHTML=variant.previews[width.value];
document.getElementById('grid').replaceChildren();
themes.forEach(t=>{
 const card=document.createElement('article');card.className='card'+(t.id===theme.id?' active':'');
 const v=t.modes[mode.value];
 card.innerHTML='<div class="card-head"><div class="row"><h3>'+t.title+'<small>'+t.english+'</small></h3><span class="tag">'+t.scheme+'</span></div><p>'+t.description+'</p><div class="swatches">'+Object.entries(v.palette).map(([role,c])=>'<span class="swatch" title="'+role+': '+(c||'terminal')+'" style="background:'+(c||(mode.value==='dark'?'#e6e6e6':'#222'))+'"></span>').join('')+'</div><div class="row"><span class="metric">'+metric(t)+'</span><button aria-pressed="'+(t.id===theme.id)+'">選取預覽</button></div></div><div class="terminal '+mode.value+'"><pre>'+v.previews[80]+'</pre></div>';
 card.querySelector('button').onclick=()=>{select.value=t.id;draw();document.querySelector('.toolbar').scrollIntoView({behavior:'smooth'});};document.getElementById('grid').append(card);
});}
[select,mode,width].forEach(el=>el.onchange=draw);
document.getElementById('copy').onclick=async()=>{const value=JSON.stringify({palettePreset:select.value},null,2);try{await navigator.clipboard.writeText(value);document.getElementById('feedback').textContent='已複製；請合併至原有設定。';}catch{document.getElementById('feedback').textContent=value;}};
draw();
</script></html>`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/themes.html"), html, "utf8");
console.log(`Generated docs/themes.html: ${catalogue.length} themes, 2 backgrounds, 4 widths; text contrast >= 4.5:1.`);
