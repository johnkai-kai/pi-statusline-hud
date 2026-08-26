import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import { hasRainbow } from "../rainbow.ts";
import {
  type HudData,
  type Span,
  DOT,
  LABEL_WIDTH,
  fitGroups,
  labelSpans,
  renderSpans,
} from "./types.ts";

const CHECK = "\u221a ";
const TIMES = "\u00d7";
const EMPTY = "—";
// Failure counts get no icon, just a fixed-width exclamation mark, so they survive the emoji
// switch — "this tool has broken N times" is not decoration, it is the one thing that
// should remain once decoration is off.
const BANG = "!";

export function renderTools(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const entries = data.tools.slice(0, config.maxToolEntries);
  // Keep a placeholder before any tool has been called, so the HUD's line count is stable.
  // Letting the line vanish makes the layout jump by a row on the first call.
  if (entries.length === 0) {
    return renderSpans([...labelSpans("Tools", palette.dim), { text: EMPTY, color: palette.dim }], width);
  }
  const items: Span[][] = entries.map((tool) => {
    const spans: Span[] = [];
    if (config.icons) spans.push({ text: CHECK, color: palette.green });
    spans.push(
      { text: tool.name, color: palette.fg, rainbow: hasRainbow(config, "tools") },
      { text: ` ${TIMES}${tool.count}`, color: palette.dim },
    );
    const errors = tool.errors ?? 0;
    if (errors > 0) spans.push({ text: ` ${BANG}${errors}`, color: palette.red });
    return spans;
  });
  return renderSpans(
    [
      ...labelSpans("Tools", palette.dim),
      ...fitGroups(items, { text: DOT, color: palette.dim }, width - LABEL_WIDTH),
    ],
    width,
    data.elapsedMs,
  );
}
