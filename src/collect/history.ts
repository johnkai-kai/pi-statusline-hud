// 最近幾則訊息的速度。單一個數字只講「現在」,一排數字才講得出「越跑越慢」
// 或「剛剛那次是不是排隊排爆了」。

/** 保留幾筆。八格是 sparkline 在 status 行擠得進去的寬度上限。 */
export const HISTORY_SIZE = 8;

export class History {
  private readonly values: number[] = [];
  private readonly capacity: number;

  constructor(capacity: number = HISTORY_SIZE) {
    this.capacity = capacity > 0 ? Math.floor(capacity) : HISTORY_SIZE;
  }

  /** 非數字與非正值一律不收——那不是速度,收進來只會把尺度洗掉。 */
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
