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
// U+26A1 plus U+FE0F makes an RGI emoji so widths match what is rendered.
const BOLT = "⚡️ ";
const WATCH = "⏱️ ";

// Keep one decimal when slow: local models often sit in single digits, where rounding to an
// integer hides every difference.
function formatSpeed(tokensPerSecond: number): string {
  return tokensPerSecond >= 10 ? String(Math.round(tokensPerSecond)) : tokensPerSecond.toFixed(1);
}

// The trend goes in extra: it is a nice-to-have and should be the first thing to vanish on
// a narrow terminal. In core, the eight blocks would be dropped together with the speed
// itself, which is backwards.
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
  // Estimates are dim, exact values are fg: two numbers of different trustworthiness in the
  // same slot, and colour is the only way to tell them apart without spending characters
  // (the tilde is there for people with colour off).
  spans.push({ text, color: speed.live ? palette.dim : palette.fg, rainbow: hasRainbow(config, "speed") });
  return spans;
}

// Below a second, milliseconds are visible; above ten, the decimal is just noise.
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

// Zero draws nothing at all. "0 agents · 0 running" is this line's normal state: it holds
// space and says nothing. When agents really are running it reappears on its own, and that
// is when it is information.
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
  // priority decides who goes first on a narrow terminal. Layout order stays put, but the
  // discard order must not equal it — agents and running are normally zero, and there is no
  // reason for them to outlive cost and speed.
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
