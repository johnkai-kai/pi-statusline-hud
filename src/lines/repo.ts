import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import { type HudData, type Span, renderSpans } from "./types.ts";

const DIRTY_MARK = "\u2717";

export function repoSpans(data: HudData, palette: Palette): Span[] {
  const spans: Span[] = [{ text: data.cwdName, color: palette.blue }];
  if (data.branch === null) return spans;
  spans.push(
    { text: " git:(", color: palette.dim },
    { text: data.branch, color: palette.green },
    { text: ")", color: palette.dim },
  );
  if (data.dirty) spans.push({ text: ` ${DIRTY_MARK}`, color: palette.red });
  return spans;
}

export function renderRepo(
  data: HudData,
  _config: HudConfig,
  width: number,
  palette: Palette,
): string {
  return renderSpans(repoSpans(data, palette), width);
}
