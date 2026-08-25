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
    costSpans(data, config, palette),
  ];
  return renderSpans(
    [...label, ...fitGroups(items, { text: DOT, color: palette.dim }, width - LABEL_WIDTH)],
    width,
  );
}
