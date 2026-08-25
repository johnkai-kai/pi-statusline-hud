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

// 啟用的行全部渲染成空時的保底行:status 不依賴任何可缺的資料。
const FALLBACK_LINE: LineName = "status";

// 消毒在這裡做,不在各行的渲染函式裡。
//
// 這是外部文字進入純函式層的唯一入口,擺在這裡有兩個好處:寬度計算看到的
// 已經是消毒後的字串(先算寬再消毒會讓行寬對不上),而且只有一個地方要記得,
// 新增一行不會忘。
//
// 每幀掃這二十來個短字串的成本可以忽略;漏掉一個欄位的成本不行。
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
