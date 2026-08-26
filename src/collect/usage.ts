export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  /** cacheRead of the last message that carried usage. */
  lastCacheRead: number;
  /** The last message's real payload: input + cacheRead + cacheWrite. */
  lastPrompt: number;
  /** Total throughput: all four fields added up. */
  total: number;
}

type UsageFields = Record<string, number | undefined> & { cost?: { total?: number } };

// usage sits in two places: ordinary messages carry message.usage, while compaction and
// branch_summary carry it on the entry itself (pi's getUsageCostBreakdown branches the same
// way). Reading only the former misses compaction — which reads the whole context in and is
// usually the largest single entry of the session.
function usageOf(entry: unknown): UsageFields | undefined {
  const withMessage = entry as { message?: { usage?: UsageFields } };
  const withSelf = entry as { usage?: UsageFields };
  return withMessage.message?.usage ?? withSelf.usage;
}

/**
 * Reduces a session's entries to the handful of numbers the HUD needs.
 *
 * `lastPrompt` is the only non-cumulative quantity here, and the only thing in the whole
 * dataset that honestly answers "how much actually went into the model last turn" — the
 * context estimate does not (a pruning extension makes the two diverge a lot).
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
