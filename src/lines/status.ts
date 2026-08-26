import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import { hasRainbow } from "../rainbow.ts";
import { sparkline } from "./sparkline.ts";
import {
  type HudData,
  type OptionalGroup,
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
const WATCH = "⏱️ ";

// 慢速時保留一位小數:本地模型常在個位數,四捨五入成整數就看不出差別了。
function formatSpeed(tokensPerSecond: number): string {
  return tokensPerSecond >= 10 ? String(Math.round(tokensPerSecond)) : tokensPerSecond.toFixed(1);
}

// 走勢放 extra:它是「有更好」的東西,窄終端時該第一個消失。放 core 會讓
// 八個方塊跟速度本身一起被丟掉,那就本末倒置了。
function trendSpans(data: HudData, palette: Palette): Span[] {
  const spark = sparkline(data.speedHistory);
  if (spark.length === 0) return [];
  return [
    { text: " ", color: null },
    { text: spark, color: palette.dim },
  ];
}

function speedSpans(data: HudData, config: HudConfig, palette: Palette): Span[] {
  const speed = data.speed;
  if (speed === null || !Number.isFinite(speed.tokensPerSecond)) return [];
  const text = `${speed.live ? "~" : ""}${formatSpeed(speed.tokensPerSecond)} tok/s`;
  const spans: Span[] = [];
  if (config.icons) spans.push({ text: BOLT, color: null });
  // 估計值用 dim、精確值用 fg:同一個位置上兩種可信度不同的數字,顏色是
  // 唯一不必多佔字元就能分辨的手段(波浪號是給關色的人看的)。
  spans.push({ text, color: speed.live ? palette.dim : palette.fg, rainbow: hasRainbow(config, "speed") });
  return spans;
}

// 秒以下看得到毫秒等級的差別,十秒以上小數只是雜訊。
function formatLatency(ms: number): string {
  if (ms < 1_000) return `${(ms / 1_000).toFixed(2)}s`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms / 1_000)}s`;
}

function latencySpans(data: HudData, config: HudConfig, palette: Palette): Span[] {
  const ms = data.ttftMs;
  if (ms === null || !Number.isFinite(ms) || ms < 0) return [];
  const spans: Span[] = [];
  if (config.icons) spans.push({ text: WATCH, color: null });
  spans.push({ text: formatLatency(ms), color: palette.fg });
  return spans;
}

function costSpans(data: HudData, config: HudConfig, palette: Palette): Span[] {
  const billed = data.cost > 0;
  const spans: Span[] = [];
  if (billed && config.icons) spans.push({ text: MONEY, color: null });
  spans.push({
    text: `$${data.cost.toFixed(2)}`,
    color: billed ? palette.amber : palette.dim,
    rainbow: hasRainbow(config, "cost"),
  });
  return spans;
}

// 零就整組不畫。「0 agents · 0 running」是這一行的常態,它佔著位置卻沒有
// 講任何事;真的有 agent 在跑時它自己會出現,那時候它才是資訊。
function countSpans(count: number, label: string, palette: Palette): Span[] {
  if (!(count > 0)) return [];
  return [{ text: `${count} ${label}`, color: palette.fg }];
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
  // priority 決定窄終端時誰先被丟。版面順序不動,但取捨順序不能等於版面順序
  // ——agents 與 running 常態是零,讓它們活得比花費和速度久沒有道理。
  const items: OptionalGroup[] = [
    { core: countSpans(data.agents, "agents", palette), extra: [], priority: 1 },
    { core: countSpans(data.runningTools, "running", palette), extra: [], priority: 1 },
    { core: speedSpans(data, config, palette), extra: trendSpans(data, palette), priority: 3 },
    { core: latencySpans(data, config, palette), extra: [], priority: 2 },
    { core: costSpans(data, config, palette), extra: [], priority: 4 },
  ];
  return renderSpans(
    [...label, ...fitGroups(items, { text: DOT, color: palette.dim }, width - LABEL_WIDTH)],
    width,
    data.elapsedMs,
  );
}
