export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  /** 最後一則有 usage 的訊息的 cacheRead。 */
  lastCacheRead: number;
  /** 最後一則的實際 payload:input + cacheRead + cacheWrite。 */
  lastPrompt: number;
  /** 總處理量:四個欄位全加。 */
  total: number;
}

type UsageFields = Record<string, number | undefined> & { cost?: { total?: number } };

// usage 有兩種擺法:一般訊息掛在 message.usage,而 compaction 與 branch_summary
// 掛在 entry 自己身上(pi 的 getUsageCostBreakdown 也是這樣分支)。只看前者會漏掉
// 壓縮那筆 —— 而壓縮要讀進整段上下文,通常是全 session 最大的一筆。
function usageOf(entry: unknown): UsageFields | undefined {
  const withMessage = entry as { message?: { usage?: UsageFields } };
  const withSelf = entry as { usage?: UsageFields };
  return withMessage.message?.usage ?? withSelf.usage;
}

/**
 * 把 session 的 entries 收斂成 HUD 要的幾個數字。
 *
 * `lastPrompt` 是這裡唯一「非累計」的量,也是全份資料裡唯一誠實回答
 * 「上一輪實際送進模型多少」的東西——context 估計值不是(剪枝式的
 * extension 會讓兩者差很多)。
 */
export function summariseUsage(entries: Iterable<unknown>): UsageSummary {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let lastCacheRead = 0;
  let lastPrompt = 0;
  for (const entry of entries) {
    const u = usageOf(entry);
    if (!u) continue;
    const i = u.input ?? 0;
    const cr = u.cacheRead ?? 0;
    const cw = u.cacheWrite ?? 0;
    input += i;
    output += u.output ?? 0;
    cacheRead += cr;
    cacheWrite += cw;
    cost += u.cost?.total ?? 0;
    lastCacheRead = cr;
    lastPrompt = i + cr + cw;
  }
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cost,
    lastCacheRead,
    lastPrompt,
    total: input + output + cacheRead + cacheWrite,
  };
}
