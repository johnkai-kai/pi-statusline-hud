import type { EnvCounts } from "../collect/env.ts";
import type { GitStatus } from "../collect/git.ts";
import type { Speed } from "../collect/speed.ts";
import { paint, truncateAnsi, visibleLength } from "../palette.ts";
import { paintRainbow } from "../rainbow.ts";

export type CompactReason = "manual" | "threshold" | "overflow" | "prune";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface HudData {
  model: string;
  // pi's thinking effort. Absent means this pi version has no such concept, "off" means it
  // is off — neither deserves space in the header.
  thinkingLevel?: ThinkingLevel;
  contextWindow: number;
  provider: string;
  elapsedMs: number;
  contextPercent: number | null;
  contextTokens: number;
  sessionTokens: number;
  cacheHitRate: number | null;
  // How many times this session was compacted, and why the last one happened. overflow means
  // "forced by hitting the window", which is nothing like a hand-typed /compact, so the
  // reason is kept.
  compactions: number;
  compactReason: CompactReason | null;
  cacheRead: number;
  promptTokens: number;
  env: EnvCounts;
  tools: Array<{ name: string; count: number; errors?: number }>;
  agents: number;
  runningTools: number;
  cost: number;
  // Generation speed. A sliding-window estimate mid-stream (live), the exact value once the
  // message lands; null until any message has landed.
  speed: Speed | null;
  // Exact speeds of the last few messages, oldest first. Fewer than two has no trend to draw.
  speedHistory: number[];
  // Time to first token, in ms. Waiting is not generating, so it is separate from speed.
  ttftMs: number | null;
  cwdName: string;
  branch: string | null;
  git: GitStatus;
}

export interface Span {
  text: string;
  color: string | null;
  // Marked, colour is picked per character and color is ignored. Unmarked takes the original
  // path and emits byte-identical output — nobody with rainbows off should see any difference.
  rainbow?: boolean;
}

// claude-hud contains no padEnd anywhere — labels sit inline in the segment rather than in a
// column. Alignment looks tidy but costs a label column on every row, dear when narrow.
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
  // Discard order when space runs short; higher goes last. Does not affect output order —
  // layout order is for the eye, importance is for the trade-off, and there is no reason for
  // them to be the same thing. Default 0, so unmarked groups keep the old tail-first behaviour.
  priority?: number;
}

export type SpanGroup = Span[] | OptionalGroup;

function toOptional(group: SpanGroup): OptionalGroup {
  return Array.isArray(group) ? { core: group, extra: [] } : group;
}

export function fitGroups(groups: SpanGroup[], separator: Span, width: number): Span[] {
  const filled = groups.map(toOptional).filter((group) => spansWidth(group.core) > 0);
  const gap = visibleLength(separator.text);
  // Descending priority, ties by original order, decides who gets space first. node's sort is
  // stable, but ties still compare indices explicitly — stability should not be a premise here.
  const order = filled
    .map((group, index) => index)
    .sort((a, b) => (filled[b].priority ?? 0) - (filled[a].priority ?? 0) || a - b);
  const keep = new Set<number>();
  let used = 0;
  for (const index of order) {
    const need = spansWidth(filled[index].core) + (keep.size > 0 ? gap : 0);
    if (used + need > width) break;
    keep.add(index);
    used += need;
  }
  const kept = filled.filter((_, index) => keep.has(index));
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
  // At least one cell: with LABEL_WIDTH 0 (no alignment) the label would touch the content.
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
