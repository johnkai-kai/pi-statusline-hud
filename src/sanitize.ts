// 外部文字進畫面之前的消毒。
//
// footer 每回合都把一堆不是我們產生的字串寫進終端:model id 與 provider 來自
// 供應商設定、工具名與 MCP 伺服器名來自第三方套件、session 名由 agent 寫進
// session_info、git 分支名與目錄名來自檔案系統、motto 由使用者自己打。
//
// 這些字串沒消毒就送出去,等於把終端的控制通道交給它們——OSC 52 能寫剪貼簿、
// OSC 0 能改視窗標題、CSI 能移動游標與清畫面。而且我們自己的 visibleLength
// 會把 ANSI 序列當成零寬跳過,所以版面完全不會歪,肉眼看不出被塞了東西。
//
// 順序有意義:OSC 的終止符是 BEL,要在剝掉 C0 之前先處理,否則 OSC 會失去
// 終止符而匹配不到。

const OSC_TERMINATED = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const OSC_UNTERMINATED = /\u001b\][^\u0007\u001b]*/g;
const CSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const ESC_FE = /\u001b[@-Z\\-_]/g;
const LONE_ESC = /\u001b/g;
const C0_C1 = /[\u0000-\u001f\u007f-\u009f]/g;
// LRM/RLM、方向覆寫、隔離符——在寬度計算裡是零寬,卻能讓文字視覺上反向。
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u206a-\u206f]/g;

export function sanitizeText(input: string): string {
  if (typeof input !== "string" || input === "") return "";
  return input
    .replace(OSC_TERMINATED, "")
    .replace(OSC_UNTERMINATED, "")
    .replace(CSI, "")
    .replace(ESC_FE, "")
    .replace(LONE_ESC, "")
    .replace(C0_C1, "")
    .replace(BIDI, "");
}
