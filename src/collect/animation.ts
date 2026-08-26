// 彩虹的動畫節拍。
//
// 每一幀都是整條 footer 重畫,所以這裡的規則只有兩條:沒人要彩虹就完全不動,
// 沒人在看也不動。前者讓不用這個功能的人零成本,後者讓開著的人在離開鍵盤
// 之後不會有一個 CPU 迴圈整夜空轉——SSH 或低速連線上那還會一直閃。

/** 每幀間隔。10 幀/秒:看得出在流動,又不會把終端洗爆。 */
export const FRAME_MS = 100;
/** 多久沒動靜就停。下一次有事件時自然會再啟動。 */
export const IDLE_STOP_MS = 60_000;

export function shouldAnimate(rainbowCount: number, msSinceActivity: number): boolean {
  if (!(rainbowCount > 0)) return false;
  return Number.isFinite(msSinceActivity) && msSinceActivity < IDLE_STOP_MS;
}
