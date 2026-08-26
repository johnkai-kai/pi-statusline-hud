import type { HudConfig, LineName } from "../config.ts";
import { type Palette, visibleLength } from "../palette.ts";
import { renderHeader } from "./header.ts";
import { renderCache, renderMeters } from "./meters.ts";
import { renderEnv } from "./env.ts";
import { renderRepo } from "./repo.ts";
import { renderTools } from "./tools.ts";
import { renderStatus } from "./status.ts";
import { sanitizeText } from "../sanitize.ts";
import type { HudData } from "./types.ts";

export type { HudData } from "./types.ts";

type Renderer = (d: HudData, c: HudConfig, w: number, p: Palette) => string;

const RENDERERS: Record<LineName, Renderer> = {
  header: renderHeader,
  repo: renderRepo,
  meters: renderMeters,
  cache: renderCache,
  env: renderEnv,
  tools: renderTools,
  status: renderStatus,
};

const MERGED: Partial<Record<LineName, LineName>> = {
  repo: "header",
  cache: "meters",
};

// Fallback for when every enabled line renders empty: status depends on no optional data.
const FALLBACK_LINE: LineName = "status";

// Sanitising happens here, not inside each line's render function.
//
// This is the single entry point for external text into the pure-function layer, which buys
// two things: width calculations see already-sanitised strings (measuring first and
// sanitising after would misalign the line), and there is exactly one place to remember —
// adding a line cannot forget it.
//
// Scanning these twenty-odd short strings per frame is free; missing one field is not.
function clean(data: HudData, config: HudConfig): { data: HudData; config: HudConfig } {
  return {
    data: {
      ...data,
      model: sanitizeText(data.model),
      provider: sanitizeText(data.provider),
      cwdName: sanitizeText(data.cwdName),
      branch: data.branch === null ? null : sanitizeText(data.branch),
      tools: data.tools.map((tool) => ({ ...tool, name: sanitizeText(tool.name) })),
    },
    config: { ...config, motto: sanitizeText(config.motto) },
  };
}

export function renderLine(
  name: LineName,
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  const safe = clean(data, config);
  return RENDERERS[name](safe.data, safe.config, width, palette);
}

export function renderHud(
  rawData: HudData,
  rawConfig: HudConfig,
  width: number,
  palette: Palette,
): string[] {
  const { data, config } = clean(rawData, rawConfig);
  const enabled = new Set(config.lines);
  const lines: string[] = [];
  for (const name of config.lines) {
    const host = MERGED[name];
    if (host !== undefined && enabled.has(host)) continue;
    lines.push(renderLine(name, data, config, width, palette));
  }
  const rendered = lines.filter((line) => visibleLength(line) > 0);
  if (rendered.length > 0) return rendered;
  const fallback = renderLine(FALLBACK_LINE, data, config, width, palette);
  return visibleLength(fallback) > 0 ? [fallback] : [];
}
