import { type Palette, paint, truncateAnsi, visibleLength } from "../palette.ts";
import { sanitizeText } from "../sanitize.ts";

const RULE = "─";
const ELLIPSIS = "…";
const REVERSE_ON = "\u001b[7m";
const RESET = "\u001b[0m";

// 尾端固定留三格橫線,標籤才不會貼在畫面最右緣。
const TAIL_RULE = 3;
// 前段橫線少於這個長度就不是一條線了,整條寧可不畫。
const MIN_HEAD_RULE = 4;
// 標籤兩側各一格空白,反白色塊才不會咬住文字。
const PADDING = 2;
const ID_CHARS = 6;

/** session 名優先;沒有名字時退回 id 前六碼,兩者皆缺回傳空字串。 */
export function sessionLabel(name: string | undefined, id: string | undefined): string {
  // session 名是 agent 寫得進去的(session_info 條目),是這批字串裡最不可信的一個。
  const trimmed = sanitizeText(name ?? "").trim();
  if (trimmed !== "") return trimmed;
  // 先消毒再切:切在半個逸出序列中間會留下殘骸。
  const shortId = sanitizeText(id ?? "").trim().slice(0, ID_CHARS);
  return shortId === "" ? "" : `#${shortId}`;
}

/**
 * 釘在輸入框上方的一行:一條橫線,右段嵌著反白的 session 標籤。
 *
 * 標籤用反白而不是背景色——反白是 ANSI 屬性,不吃 truecolor,mono 配色下
 * 一樣看得見。顏色只負責讓它更好認,不負責讓它存在。
 */
export function renderSessionBar(label: string, width: number, palette: Palette): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  // 這個函式是匯出的,不保證呼叫端已經消毒過。
  const text = sanitizeText(label).trim();
  if (text === "") return "";

  const chrome = MIN_HEAD_RULE + TAIL_RULE + PADDING;
  if (width < chrome + 1) return "";

  let shown = text;
  const room = width - chrome;
  if (visibleLength(shown) > room) {
    shown = truncateAnsi(shown, room - visibleLength(ELLIPSIS)) + ELLIPSIS;
  }

  const head = width - TAIL_RULE - PADDING - visibleLength(shown);
  return (
    paint(palette.dim, RULE.repeat(head)) +
    REVERSE_ON +
    paint(palette.cyan, ` ${shown} `) +
    RESET +
    paint(palette.dim, RULE.repeat(TAIL_RULE))
  );
}
