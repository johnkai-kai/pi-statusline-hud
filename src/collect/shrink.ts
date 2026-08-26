// 「上下文被縮過幾次」要與機制無關。
//
// pi 內建的壓縮會發 session_compact,聽那個事件就夠了——但那只涵蓋一種做法。
// 剪枝式的 extension(例如把舊訊息換成摘要後再送出的那類)可以直接取消內建
// 壓縮,事件永遠不會發;而 pi 回報的 context 估計值在那種情況下照樣往上爬,
// 盯它也抓不到。
//
// 唯一誠實的量是「上一輪實際送進模型的 payload」:input + cacheRead + cacheWrite。
// 不管誰、用什麼方式把上下文變小,那個數字一定會踩下去一階。所以這裡盯它,
// 不去認得任何一個 extension 的名字、事件或工具。
//
// 兩道門檻要同時過:比例擋大 session 的正常波動,絕對量擋小 session 的抖動。
export const MIN_SHRINK_RATIO = 0.1;
export const MIN_SHRINK_TOKENS = 1_000;

export class ShrinkTracker {
  private baseline: number | null = null;

  /** 回報這一輪的 payload;回傳 true 代表這是一次真的縮水。 */
  observe(prompt: number): boolean {
    if (!Number.isFinite(prompt) || prompt <= 0) return false;
    const previous = this.baseline;
    this.baseline = prompt;
    if (previous === null || prompt >= previous) return false;
    const drop = previous - prompt;
    return drop >= MIN_SHRINK_TOKENS && drop >= previous * MIN_SHRINK_RATIO;
  }

  /** 更新基準但不計數。壓縮事件已經自己記過那一次,別再數第二次。 */
  sync(prompt: number): void {
    if (!Number.isFinite(prompt) || prompt <= 0) return;
    this.baseline = prompt;
  }

  reset(): void {
    this.baseline = null;
  }
}
