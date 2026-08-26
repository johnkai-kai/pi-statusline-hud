import type { HudConfig } from "../config.ts";
import { hasRainbow } from "../rainbow.ts";
import type { Palette } from "../palette.ts";
import { padBetween } from "../palette.ts";
import { formatCount } from "../meters.ts";
import { formatElapsed } from "../collect/timing.ts";
import { repoGroup } from "./repo.ts";
import {
  type HudData,
  type Span,
  SEP,
  fitGroups,
  paintSpans,
  renderSpans,
  spansWidth,
} from "./types.ts";

// U+23F1 在終端佔兩欄,加上 U+FE0F 讓它成為 RGI emoji,寬度計算才跟實際渲染一致。
const CLOCK = "\u23f1\ufe0f ";
// U+1F9E0 落在 WIDE_BLOCKS 內,寬度算 2,與實際渲染一致。
const BRAIN = "\ud83e\udde0 ";
const THINK_LABEL = "think ";

function leftGroups(data: HudData, config: HudConfig, palette: Palette): Span[][] {
  const model: Span[] = [
    { text: "[", color: palette.dim },
    { text: data.model, color: palette.cyan, rainbow: hasRainbow(config, "model") },
    { text: " \u00b7 ", color: palette.dim },
    { text: formatCount(data.contextWindow), color: palette.cyan },
    { text: "]", color: palette.dim },
  ];
  const thinking: Span[] = [];
  if (data.thinkingLevel !== undefined && data.thinkingLevel !== "off") {
    thinking.push({ text: config.icons ? BRAIN : THINK_LABEL, color: palette.dim });
    thinking.push({ text: data.thinkingLevel, color: palette.fg });
  }
  const provider: Span[] = [
    { text: data.provider, color: palette.orange, rainbow: hasRainbow(config, "provider") },
  ];
  const elapsed: Span[] = [];
  if (config.icons) elapsed.push({ text: CLOCK, color: palette.dim });
  elapsed.push({ text: formatElapsed(data.elapsedMs), color: palette.fg });
  const motto: Span[] = [
    { text: config.motto, color: palette.orange, rainbow: hasRainbow(config, "motto") },
  ];
  return [model, thinking, provider, elapsed, motto];
}

export function renderHeader(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const groups = leftGroups(data, config, palette);
  const separator: Span = { text: SEP, color: palette.dim };
  const fitLeft = (room: number): string =>
    renderSpans(fitGroups(groups, separator, room), room, data.elapsedMs);
  if (!config.lines.includes("repo")) return fitLeft(width);
  const repo = repoGroup(data, config, palette);
  const coreWidth = spansWidth(repo.core);
  if (coreWidth === 0 || width - coreWidth - 1 < 1) return fitLeft(width);
  // git 改動明細釘在最右邊,它變寬就是左邊變窄。左邊連模型名稱都放不下時
  // 先收掉明細——「未追蹤兩個檔」再有用,也沒有「現在跑的是哪個模型」有用。
  const full = [...repo.core, ...repo.extra];
  const right = width - spansWidth(full) - 1 >= spansWidth(groups[0]) ? full : repo.core;
  return padBetween(fitLeft(width - spansWidth(right) - 1), paintSpans(right, data.elapsedMs), width);
}
