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
// 失敗數不用圖示,用一個寬度確定的驚嘆號:emoji 開關關掉時它還在——
// 「這個工具掛過幾次」不是裝飾,是關掉裝飾後最該留下的那一項。
const BANG = "!";

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
  );
}
