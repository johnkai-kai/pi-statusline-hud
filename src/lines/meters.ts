import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import { hasRainbow } from "../rainbow.ts";
import { formatCount, meterFill } from "../meters.ts";
import {
  type CompactReason,
  type HudData,
  type OptionalGroup,
  type Span,
  GROUP_GAP,
  VALUE_GAP,
  inlineLabel,
  fitGroups,
  labelSpans,
  renderSpans,
} from "./types.ts";

const BLOCK = "\u2588";
// The unfilled part uses a different character rather than the same block in another colour
// — with colour off (mono, NO_COLOR) the whole bar would be solid and the ratio unreadable.
const TRACK = "\u2591";
// Bar width adapts to terminal width: the bar yields to text, not the other way round.
// Thresholds follow claude-hud's utils/terminal.ts: 10 cells at 100 columns and up, 6 at 60
// and up, 4 below that.
export function adaptiveCells(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 10;
  if (width >= 100) return 10;
  if (width >= 60) return 6;
  return 4;
}
// The shrink marker. Context is a level, and compaction drops it in one step — without
// this marker that drop just looks like the number going down on its own.
const COMPACT = "↓";
const AMBER_FLOOR = 70;
const RED_FLOOR = 90;

function contextColor(percent: number | null, palette: Palette): string | null {
  if (percent === null) return palette.dim;
  if (percent < AMBER_FLOOR) return palette.green;
  return percent <= RED_FLOOR ? palette.amber : palette.red;
}

function bar(
  ratio: number,
  cells: number,
  color: string | null,
  palette: Palette,
  rainbow = false,
): Span[] {
  const filled = meterFill(ratio, cells);
  return [
    // The rainbow only takes the filled part: the unfilled part is what is left, and
    // colouring it too erases the bar's boundary, taking the ratio with it.
    { text: BLOCK.repeat(filled), color, rainbow },
    { text: TRACK.repeat(cells - filled), color: palette.track },
  ];
}

function percentText(value: number | null): string {
  return value === null ? "--%" : `${value.toFixed(0)}%`;
}

function ratioSpans(
  used: number,
  total: number,
  color: string | null,
  visible: boolean,
  lead: string,
): Span[] {
  if (!visible || !(total > 0)) return [];
  return [
    { text: lead, color: null },
    { text: `${formatCount(used)}/${formatCount(total)}`, color },
  ];
}

function group(label: Span[], meter: Span[], value: Span[], extra: Span[]): OptionalGroup {
  return { core: [...label, ...meter, { text: VALUE_GAP, color: null }, ...value], extra };
}

function compactSpans(count: number, reason: CompactReason | null, palette: Palette): Span[] {
  if (!(count > 0)) return [];
  return [
    { text: VALUE_GAP, color: null },
    { text: `${COMPACT}${count}`, color: reason === "overflow" ? palette.red : palette.amber },
  ];
}

function contextGroup(
  data: HudData,
  config: HudConfig,
  palette: Palette,
  width: number,
): OptionalGroup {
  const percent = data.contextPercent;
  const color = contextColor(percent, palette);
  return group(
    labelSpans("Context", palette.dim),
    bar((percent ?? 0) / 100, adaptiveCells(width), color, palette, hasRainbow(config, "contextBar")),
    [
      { text: percentText(percent), color },
      ...compactSpans(data.compactions, data.compactReason, palette),
    ],
    ratioSpans(data.contextTokens, data.contextWindow, color, percent !== null, VALUE_GAP),
  );
}

function sessionGroup(
  data: HudData,
  config: HudConfig,
  palette: Palette,
  width: number,
): OptionalGroup {
  const budget = config.sessionBudget;
  return group(
    inlineLabel("Session", palette.dim),
    bar(
      data.sessionTokens / budget,
      adaptiveCells(width),
      palette.blue,
      palette,
      hasRainbow(config, "sessionBar"),
    ),
    [{ text: formatCount(data.sessionTokens), color: palette.blue }],
    budget > 0 ? [{ text: `/${formatCount(budget)}`, color: palette.blue }] : [],
  );
}

function cacheGroup(
  data: HudData,
  config: HudConfig,
  palette: Palette,
  label: Span[],
  width: number,
): OptionalGroup {
  const rate = data.cacheHitRate;
  return group(
    label,
    bar((rate ?? 0) / 100, adaptiveCells(width), palette.cyan, palette, hasRainbow(config, "cache")),
    [{ text: percentText(rate), color: palette.cyan }],
    ratioSpans(data.cacheRead, data.promptTokens, palette.cyan, rate !== null, VALUE_GAP),
  );
}

export function renderMeters(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const groups = [
    contextGroup(data, config, palette, width),
    sessionGroup(data, config, palette, width),
  ];
  if (config.lines.includes("cache")) {
    groups.push(cacheGroup(data, config, palette, inlineLabel("Cache", palette.dim), width));
  }
  return renderSpans(fitGroups(groups, { text: GROUP_GAP, color: null }, width), width, data.elapsedMs);
}

export function renderCache(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const group = cacheGroup(data, config, palette, labelSpans("Cache", palette.dim), width);
  return renderSpans(fitGroups([group], { text: GROUP_GAP, color: null }, width), width, data.elapsedMs);
}
