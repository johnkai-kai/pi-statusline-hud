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

// U+23F1 is two columns wide in a terminal; U+FE0F makes it an RGI emoji so the width
// calculation matches what is actually rendered.
const CLOCK = "\u23f1\ufe0f ";
// U+1F9E0 falls inside WIDE_BLOCKS, width 2, matching what is rendered.
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
  // The git breakdown is pinned to the far right, so widening it narrows the left. When the
  // left cannot even fit the model name, drop the breakdown first — "two untracked files"
  // is never as useful as "which model is running".
  const full = [...repo.core, ...repo.extra];
  const right = width - spansWidth(full) - 1 >= spansWidth(groups[0]) ? full : repo.core;
  return padBetween(fitLeft(width - spansWidth(right) - 1), paintSpans(right, data.elapsedMs), width);
}
