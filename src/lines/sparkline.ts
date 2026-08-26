import { HISTORY_SIZE } from "../collect/history.ts";

/** 八階方塊。用字元高度表示大小,一格換一筆,不必寫任何數字。 */
export const SPARK_CHARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

/**
 * 尺度取視窗內的 min-max,不是絕對值。拿固定的滿格(比如 200 tok/s)去量,
 * 本地模型的 3→5 會整條貼在最低格,看不出任何起伏——而「有沒有起伏」正是
 * 這八格唯一要回答的問題。
 *
 * 少於兩筆不畫:一個點沒有趨勢可言,畫出來只是一個會誤導人的方塊。
 */
export function sparkline(values: readonly number[], cells: number = HISTORY_SIZE): string {
  const window = values.slice(-Math.max(0, Math.floor(cells)));
  if (window.length < 2) return "";
  const min = Math.min(...window);
  const max = Math.max(...window);
  const middle = SPARK_CHARS[Math.floor((SPARK_CHARS.length - 1) / 2)];
  // 完全持平時給一條平線。用最低格會讓「穩定」看起來像「掛了」。
  if (!(max > min)) return middle.repeat(window.length);
  const top = SPARK_CHARS.length - 1;
  let out = "";
  for (const value of window) out += SPARK_CHARS[Math.round(((value - min) / (max - min)) * top)];
  return out;
}
