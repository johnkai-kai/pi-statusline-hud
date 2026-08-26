import type { EnvCounts } from "../collect/env.ts";
import type { Speed } from "../collect/speed.ts";
import { paint, truncateAnsi, visibleLength } from "../palette.ts";
import { paintRainbow } from "../rainbow.ts";

export type CompactReason = "manual" | "threshold" | "overflow" | "prune";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface HudData {
  model: string;
  // pi 的思考檔位。缺席代表這個 pi 版本沒有這個概念,"off" 代表關著——
  // 兩種都不該佔 header 的位置。
  thinkingLevel?: ThinkingLevel;
  contextWindow: number;
  provider: string;
  elapsedMs: number;
  contextPercent: number | null;
  contextTokens: number;
  sessionTokens: number;
  cacheHitRate: number | null;
  // 這場 session 壓縮過幾次,以及最後一次是為什麼。overflow 代表「撞到窗口
  // 才被迫壓」,跟使用者自己打的 /compact 意義完全不同,所以留著理由。
  compactions: number;
  compactReason: CompactReason | null;
  cacheRead: number;
  promptTokens: number;
  env: EnvCounts;
  tools: Array<{ name: string; count: number; errors?: number }>;
  agents: number;
  runningTools: number;
  cost: number;
  // 生成速度。串流中是滑動視窗的估計值(live),訊息落地後換成精確值;
  // 還沒有任何訊息落地過就是 null。
  speed: Speed | null;
  // 首 token 延遲(毫秒)。等待不是生成,所以它跟 speed 是兩個數字。
  ttftMs: number | null;
  cwdName: string;
  branch: string | null;
  dirty: boolean;
}

export interface Span {
  text: string;
  color: string | null;
  // 標了就改成逐字元取色,忽略 color。沒標的走原本那條路,輸出一個位元組都不變
  // ——彩虹全關的人不該因為這個功能存在而看到任何差異。
  rainbow?: boolean;
}

// claude-hud 全庫沒有任何 padEnd——標籤內嵌在段落裡,不切齊成一欄。
// 對齊看起來整齊,但每行固定吃掉一個標籤欄的寬度,窄終端時代價很高。
export const LABEL_WIDTH = 0;
export const SEP = " \u2502 ";
export const DOT = " \u00b7 ";
export const GROUP_GAP = " \u2502 ";
export const VALUE_GAP = " ";

const ELLIPSIS = "\u2026";

export function displayWidth(text: string): number {
  return visibleLength(text);
}

export function truncate(text: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  if (visibleLength(text) <= width) return text;
  const budget = width - visibleLength(ELLIPSIS);
  if (budget <= 0) return "";
  return truncateAnsi(text, budget) + ELLIPSIS;
}

export function spansWidth(spans: Span[]): number {
  let total = 0;
  for (const span of spans) total += visibleLength(span.text);
  return total;
}

export function fitSpans(spans: Span[], width: number): Span[] {
  if (!Number.isFinite(width) || width <= 0) return [];
  const out: Span[] = [];
  let used = 0;
  for (const span of spans) {
    const room = width - used;
    if (room <= 0) break;
    const w = visibleLength(span.text);
    if (w <= room) {
      out.push(span);
      used += w;
      continue;
    }
    const clipped = truncateAnsi(span.text, room);
    if (clipped.length > 0) out.push({ ...span, text: clipped });
    break;
  }
  return out;
}

export function paintSpans(spans: Span[], phaseMs = 0): string {
  let out = "";
  for (const span of spans) {
    out += span.rainbow === true ? paintRainbow(span.text, phaseMs) : paint(span.color, span.text);
  }
  return out;
}

export function renderSpans(spans: Span[], width: number, phaseMs = 0): string {
  return paintSpans(fitSpans(spans, width), phaseMs);
}

export function joinSpans(groups: Span[][], separator: Span): Span[] {
  const out: Span[] = [];
  for (const group of groups) {
    if (spansWidth(group) === 0) continue;
    if (out.length > 0) out.push(separator);
    out.push(...group);
  }
  return out;
}

export interface OptionalGroup {
  core: Span[];
  extra: Span[];
}

export type SpanGroup = Span[] | OptionalGroup;

function toOptional(group: SpanGroup): OptionalGroup {
  return Array.isArray(group) ? { core: group, extra: [] } : group;
}

export function fitGroups(groups: SpanGroup[], separator: Span, width: number): Span[] {
  const filled = groups.map(toOptional).filter((group) => spansWidth(group.core) > 0);
  const gap = visibleLength(separator.text);
  const kept: OptionalGroup[] = [];
  let used = 0;
  for (const group of filled) {
    const need = spansWidth(group.core) + (kept.length > 0 ? gap : 0);
    if (used + need > width) break;
    kept.push(group);
    used += need;
  }
  if (kept.length === 0) return fitSpans(filled[0]?.core ?? [], width);
  const grown = kept.map(() => false);
  if (kept.length === filled.length) {
    for (let index = 0; index < kept.length; index += 1) {
      const need = spansWidth(kept[index].extra);
      if (used + need > width) break;
      grown[index] = true;
      used += need;
    }
  }
  return joinSpans(
    kept.map((group, index) => (grown[index] ? [...group.core, ...group.extra] : group.core)),
    separator,
  );
}

export function labelSpans(text: string, color: string | null): Span[] {
  // 至少一格:LABEL_WIDTH 為 0(不切齊)時,沒有這個下限標籤會跟內容黏在一起。
  const pad = Math.max(1, LABEL_WIDTH - visibleLength(text));
  return [
    { text, color },
    { text: " ".repeat(pad), color: null },
  ];
}

export function inlineLabel(text: string, color: string | null): Span[] {
  return [
    { text, color },
    { text: " ", color: null },
  ];
}
