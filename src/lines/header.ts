import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import { padBetween } from "../palette.ts";
import { formatCount } from "../meters.ts";
import { formatElapsed } from "../collect/timing.ts";
import { repoSpans } from "./repo.ts";
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

function leftGroups(data: HudData, config: HudConfig, palette: Palette): Span[][] {
  const model: Span[] = [
    { text: "[", color: palette.dim },
    { text: data.model, color: palette.cyan },
    { text: " \u00b7 ", color: palette.dim },
    { text: formatCount(data.contextWindow), color: palette.cyan },
    { text: "]", color: palette.dim },
  ];
  const provider: Span[] = [{ text: data.provider, color: palette.orange }];
  const elapsed: Span[] = [];
  if (config.icons) elapsed.push({ text: CLOCK, color: palette.dim });
  elapsed.push({ text: formatElapsed(data.elapsedMs), color: palette.fg });
  const motto: Span[] = [{ text: config.motto, color: palette.orange }];
  return [model, provider, elapsed, motto];
}

export function renderHeader(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const groups = leftGroups(data, config, palette);
  const separator: Span = { text: SEP, color: palette.dim };
  const fitLeft = (room: number): string => renderSpans(fitGroups(groups, separator, room), room);
  if (!config.lines.includes("repo")) return fitLeft(width);
  const right = repoSpans(data, palette);
  const rightWidth = spansWidth(right);
  const room = width - rightWidth - 1;
  if (rightWidth === 0 || room < 1) return fitLeft(width);
  return padBetween(fitLeft(room), paintSpans(right), width);
}
