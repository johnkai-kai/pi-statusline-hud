import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import {
  type HudData,
  type Span,
  DOT,
  LABEL_WIDTH,
  fitGroups,
  labelSpans,
  renderSpans,
} from "./types.ts";

const LEAD = "\u25b6\u25b6";
const MONEY = "\ud83d\udcb8 ";
// U+26A1 加 U+FE0F 成為 RGI emoji,寬度計算才跟實際渲染一致。
const BOLT = "⚡️ ";

// 慢速時保留一位小數:本地模型常在個位數,四捨五入成整數就看不出差別了。
function formatSpeed(tokensPerSecond: number): string {
  return tokensPerSecond >= 10 ? String(Math.round(tokensPerSecond)) : tokensPerSecond.toFixed(1);
}

function speedSpans(data: HudData, config: HudConfig, palette: Palette): Span[] {
  const speed = data.speed;
  if (speed === null || !Number.isFinite(speed.tokensPerSecond)) return [];
  const text = `${speed.live ? "~" : ""}${formatSpeed(speed.tokensPerSecond)} tok/s`;
  const spans: Span[] = [];
  if (config.icons) spans.push({ text: BOLT, color: null });
  // 估計值用 dim、精確值用 fg:同一個位置上兩種可信度不同的數字,顏色是
  // 唯一不必多佔字元就能分辨的手段(波浪號是給關色的人看的)。
  spans.push({ text, color: speed.live ? palette.dim : palette.fg });
  return spans;
}

function costSpans(data: HudData, config: HudConfig, palette: Palette): Span[] {
  const billed = data.cost > 0;
  const spans: Span[] = [];
  if (billed && config.icons) spans.push({ text: MONEY, color: null });
  spans.push({
    text: `$${data.cost.toFixed(2)}`,
    color: billed ? palette.amber : palette.dim,
  });
  return spans;
}

export function renderStatus(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const label = config.icons
    ? labelSpans(LEAD, palette.orange)
    : labelSpans("Status", palette.dim);
  const items: Span[][] = [
    [{ text: `${data.agents} agents`, color: palette.fg }],
    [{ text: `${data.runningTools} running`, color: palette.fg }],
    speedSpans(data, config, palette),
    costSpans(data, config, palette),
  ];
  return renderSpans(
    [...label, ...fitGroups(items, { text: DOT, color: palette.dim }, width - LABEL_WIDTH)],
    width,
  );
}
