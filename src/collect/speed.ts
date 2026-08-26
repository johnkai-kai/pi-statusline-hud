// Generation speed. Two numbers share one slot: an estimate mid-stream, replaced by an exact value once the message lands.
//
// Why the estimate cannot just read usage: measured on NVIDIA over a 117-second stream,
// partial.usage.output was 0 across all 885 samples and only jumped to 3938 on the final
// event. Mid-stream there is no token count available, only delta events.
//
// Why count delta events rather than characters: the same measurement gave 3709 deltas for
// 3938 tokens, near 1:1 (0.942), while characters came to 2.32 per token — and that ratio
// swings hugely by language (Chinese and English differ threefold), so estimating from
// characters makes the speed float with the language.
//
// The ratio is still a property of the tokenizer rather than a constant, so it is not
// hardcoded: every finished message knows its real token count and its delta count, which
// recalibrates the next one to this model's own ratio.
const DEFAULT_TOKENS_PER_DELTA = 1;

/** Sliding window. A cumulative average is dragged down by TTFT — measured, the first 11.6 seconds produced one delta. */
export const WINDOW_MS = 5_000;
/** The samples in the window must span at least this long before a speed is computed. */
export const MIN_SPAN_MS = 500;
/** The window needs at least this many samples. */
export const MIN_SAMPLES = 3;
/** Calibration smoothing. One message's ratio can jitter by ±25%; it must not overwrite. */
export const CALIBRATION_WEIGHT = 0.3;

export interface Speed {
  tokensPerSecond: number;
  /** true is the mid-stream estimate, false the exact value from a landed message. */
  live: boolean;
}

export class SpeedMeter {
  private readonly window: number[] = [];
  private streaming = false;
  private firstTick: number | null = null;
  private startedAt: number | null = null;
  private ttft: number | null = null;
  private deltas = 0;
  private tokensPerDelta = DEFAULT_TOKENS_PER_DELTA;
  private calibrated = false;
  private last: number | null = null;
  private readonly windowMs: number;

  // node's type-stripping mode does not support constructor parameter properties.
  constructor(windowMs: number = WINDOW_MS) {
    this.windowMs = windowMs;
  }

  begin(now: number): void {
    this.window.length = 0;
    this.streaming = true;
    this.firstTick = null;
    this.startedAt = now;
    this.ttft = null;
    this.deltas = 0;
  }

  tick(now: number): void {
    if (!this.streaming) return;
    if (this.firstTick === null) {
      this.firstTick = now;
      if (this.startedAt !== null && now >= this.startedAt) this.ttft = now - this.startedAt;
    }
    this.deltas += 1;
    this.window.push(now);
    this.trim(now);
  }

  /**
   * The message landed; returns its exact speed, or null when nothing could be measured.
   * The return value is not just convenience — the history uses it to tell "this one
   * measured something new" from "this one measured nothing and current() is still holding
   * the previous value", without which the same number is recorded twice.
   *
   * Timing starts at the first delta, excluding TTFT — that stretch is waiting, not
   * generating. Counting it makes short messages look inexplicably slow, and makes the
   * number drop a step the moment the message lands (the live value measures the generation
   * rate, which is what it should).
   */
  end(now: number, outputTokens: number): number | null {
    this.streaming = false;
    const started = this.firstTick;
    this.window.length = 0;
    if (started === null) return null;
    if (!this.measurable(now - started)) return null;
    if (!Number.isFinite(outputTokens) || outputTokens <= 0) return null;
    this.calibrate(outputTokens / this.deltas);
    this.last = (outputTokens / (now - started)) * 1000;
    return this.last;
  }

  /**
   * Delta arrival times are a timeline only when deltas really trickle out with generation.
   * Tool calls do not: measured, the model spent 5 seconds and then delivered all 42 toolcall
   * deltas within 5 milliseconds, and dividing 63 tokens by those 5 milliseconds gives
   * 12600 tok/s. The thresholds are shared with the live path: measure nothing, report
   * nothing, and let the previous number stand a little longer.
   */
  private measurable(spanMs: number): boolean {
    return this.deltas >= MIN_SAMPLES && spanMs >= MIN_SPAN_MS;
  }

  /** The first ratio is taken as is; later ones are smoothed so one jittery message cannot carry the live value away. */
  private calibrate(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    this.tokensPerDelta = this.calibrated
      ? this.tokensPerDelta * (1 - CALIBRATION_WEIGHT) + ratio * CALIBRATION_WEIGHT
      : ratio;
    this.calibrated = true;
  }

  current(now: number): Speed | null {
    if (this.streaming) {
      this.trim(now);
      const span = this.span();
      if (this.window.length >= MIN_SAMPLES && span >= MIN_SPAN_MS) {
        const perSecond = ((this.window.length - 1) / span) * 1000;
        return { tokensPerSecond: perSecond * this.tokensPerDelta, live: true };
      }
    }
    return this.last === null ? null : { tokensPerSecond: this.last, live: false };
  }

  /**
   * Time to first token: from request to the first delta. That stretch is waiting rather than
   * generating, so it stays out of the speed — but it is worth seeing on its own: on a local
   * backend, 19 of a measured 20-second delay were spent queueing for the GPU.
   *
   * Splitting "queue" from "prefill" is deliberately not attempted: that needs the provider's
   * own timings, which only local backends like llama.cpp report, and pi does not hand
   * provider events to extensions either. Measured on our own side, this number holds for
   * every provider.
   */
  latency(): number | null {
    return this.ttft;
  }

  reset(): void {
    this.window.length = 0;
    this.streaming = false;
    this.firstTick = null;
    this.startedAt = null;
    this.ttft = null;
    this.deltas = 0;
    this.tokensPerDelta = DEFAULT_TOKENS_PER_DELTA;
    this.calibrated = false;
    this.last = null;
  }

  private trim(now: number): void {
    const floor = now - this.windowMs;
    while (this.window.length > 0 && this.window[0] < floor) this.window.shift();
  }

  private span(): number {
    if (this.window.length < 2) return 0;
    return this.window[this.window.length - 1] - this.window[0];
  }
}
