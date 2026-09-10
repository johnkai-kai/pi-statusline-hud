export interface Speed {
  tokensPerSecond: number;
  live: boolean;
}

// Average output throughput across a complete turn, including preparation and waiting.
export class SpeedMeter {
  private startedAt: number | null = null;
  private ttft: number | null = null;
  private last: number | null = null;

  begin(now: number): void {
    this.startedAt = Number.isFinite(now) ? now : null;
    this.ttft = null;
    this.last = null;
  }

  tick(now: number): void {
    if (this.startedAt !== null && this.ttft === null && Number.isFinite(now) && now >= this.startedAt) {
      this.ttft = now - this.startedAt;
    }
  }

  end(now: number, outputTokens: number, successful = true): number | null {
    const started = this.startedAt;
    this.startedAt = null;
    this.last = null;
    if (!successful || started === null || !Number.isFinite(now) || now <= started) return null;
    if (!Number.isFinite(outputTokens) || outputTokens <= 0) return null;
    const rate = outputTokens / ((now - started) / 1000);
    if (!Number.isFinite(rate)) return null;
    this.last = rate;
    return rate;
  }

  current(_now: number): Speed | null {
    return this.last === null ? null : { tokensPerSecond: this.last, live: false };
  }

  latency(): number | null {
    return this.ttft;
  }

  reset(): void {
    this.startedAt = null;
    this.ttft = null;
    this.last = null;
  }
}
