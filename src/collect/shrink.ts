// "How many times has the context been shrunk" must not depend on the mechanism.
//
// pi's built-in compaction fires session_compact, and listening for that would be enough —
// but it only covers one approach. A pruning extension (one that replaces old messages with
// a summary before sending) can cancel the built-in compaction outright, so the event never
// fires; and pi's reported context estimate keeps climbing in that case, so watching that
// catches nothing either.
//
// The only honest measure is the payload actually sent last turn: input + cacheRead +
// cacheWrite. Whoever shrank the context and however they did it, that number steps down.
// So this watches that, and knows the name of no extension, event or tool.
//
// Two thresholds must both pass: the ratio filters normal drift in a big session, the
// absolute amount filters jitter in a small one.
export const MIN_SHRINK_RATIO = 0.1;
export const MIN_SHRINK_TOKENS = 1_000;

export class ShrinkTracker {
  private baseline: number | null = null;

  /** Reports this turn's payload; true means a real shrink. */
  observe(prompt: number): boolean {
    if (!Number.isFinite(prompt) || prompt <= 0) return false;
    const previous = this.baseline;
    this.baseline = prompt;
    if (previous === null || prompt >= previous) return false;
    const drop = previous - prompt;
    return drop >= MIN_SHRINK_TOKENS && drop >= previous * MIN_SHRINK_RATIO;
  }

  /** Updates the baseline without counting. The compaction event already counted it. */
  sync(prompt: number): void {
    if (!Number.isFinite(prompt) || prompt <= 0) return;
    this.baseline = prompt;
  }

  reset(): void {
    this.baseline = null;
  }
}
