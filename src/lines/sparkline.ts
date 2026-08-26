import { HISTORY_SIZE } from "../collect/history.ts";

/** Eight block levels. Character height carries magnitude; one cell per sample, no digits. */
export const SPARK_CHARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

/**
 * The scale is the window's own min-max, not an absolute one. Against a fixed ceiling
 * (200 tok/s, say) a local model's 3 to 5 would flatline along the bottom cell, showing
 * nothing — and "is it changing" is the only question these eight cells exist to answer.
 *
 * Fewer than two samples draws nothing: one point has no trend, and a lone block misleads.
 */
export function sparkline(values: readonly number[], cells: number = HISTORY_SIZE): string {
  const window = values.slice(-Math.max(0, Math.floor(cells)));
  if (window.length < 2) return "";
  const min = Math.min(...window);
  const max = Math.max(...window);
  const middle = SPARK_CHARS[Math.floor((SPARK_CHARS.length - 1) / 2)];
  // A perfectly flat run gets a flat line. The bottom cell would make "steady" look "dead".
  if (!(max > min)) return middle.repeat(window.length);
  const top = SPARK_CHARS.length - 1;
  let out = "";
  for (const value of window) out += SPARK_CHARS[Math.round(((value - min) / (max - min)) * top)];
  return out;
}
