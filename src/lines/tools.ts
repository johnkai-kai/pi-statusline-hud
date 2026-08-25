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

const CHECK = "\u221a ";
const TIMES = "\u00d7";
const EMPTY = "—";

export function renderTools(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const entries = data.tools.slice(0, config.maxToolEntries);
  // 還沒呼叫任何工具時保留佔位符,讓 HUD 行數固定。整行消失會讓版面在
  // 第一次工具呼叫時忽然多一行,跳動很擾人。
  if (entries.length === 0) {
    return renderSpans([...labelSpans("Tools", palette.dim), { text: EMPTY, color: palette.dim }], width);
  }
  const items: Span[][] = entries.map((tool) => {
    const spans: Span[] = [];
    if (config.icons) spans.push({ text: CHECK, color: palette.green });
    spans.push(
      { text: tool.name, color: palette.fg },
      { text: ` ${TIMES}${tool.count}`, color: palette.dim },
    );
    return spans;
  });
  return renderSpans(
    [
      ...labelSpans("Tools", palette.dim),
      ...fitGroups(items, { text: DOT, color: palette.dim }, width - LABEL_WIDTH),
    ],
    width,
  );
}
