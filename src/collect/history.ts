// Speeds of the last few messages. A single number only says "now"; a row of them can
// say "getting slower" or "that one sat in a queue".

/** How many to keep. Eight cells is what a sparkline can fit on the status line. */
export const HISTORY_SIZE = 8;

export class History {
  private readonly values: number[] = [];
  private readonly capacity: number;

  constructor(capacity: number = HISTORY_SIZE) {
    this.capacity = capacity > 0 ? Math.floor(capacity) : HISTORY_SIZE;
  }

  /** Non-numbers and non-positive values are rejected — those are not speeds, and they
   *  would only wreck the scale. */
  push(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.values.push(value);
    while (this.values.length > this.capacity) this.values.shift();
  }

  recent(): number[] {
    return [...this.values];
  }

  reset(): void {
    this.values.length = 0;
  }
}
