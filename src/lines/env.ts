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

export function renderEnv(
  data: HudData,
  _config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const { agentsMd, mcps, extensions, skills } = data.env;
  const entries: Array<[number, string]> = [
    [agentsMd, "AGENTS.md"],
    [mcps, "MCPs"],
    [extensions, "exts"],
    [skills, "skills"],
  ];
  const items: Span[][] = entries.map(([count, name]) => [
    { text: `${count} ${name}`, color: palette.dim },
  ]);
  return renderSpans(
    [
      ...labelSpans("Env", palette.dim),
      ...fitGroups(items, { text: DOT, color: palette.dim }, width - LABEL_WIDTH),
    ],
    width,
  );
}
