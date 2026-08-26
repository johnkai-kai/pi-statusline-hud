// 生成速度。兩個數字疊在同一個位置:串流中是估計值,訊息落地後換成精確值。
//
// 為什麼估計值不能直接用 usage:實測 NVIDIA 一段 117 秒的串流,885 次取樣裡
// partial.usage.output 全程是 0,最後一個事件才跳成 3938。串流途中沒有 token
// 數可用,只有 delta 事件。
//
// 為什麼數 delta 事件而不是字元:同一段實測 3709 個 delta 對 3938 個 token,
// 幾乎 1:1(0.942);字元則是 2.32 個/token,而那個比例會隨語言大幅改變——
// 中文與英文差三倍以上,拿字元估等於讓速度跟著語言浮動。
//
// 比例仍然是 tokenizer 的性質,不是常數,所以不寫死:每則訊息結束時都知道
// 真實 token 數與 delta 數,拿它回頭校準,下一則就用這個模型自己的比例。
const DEFAULT_TOKENS_PER_DELTA = 1;

/** 滑動視窗長度。累計平均會被首 token 延遲拖住——實測前 11.6 秒只有 1 個 delta。 */
export const WINDOW_MS = 5_000;
/** 視窗內的樣本至少要跨這麼久才算得出速度。 */
export const MIN_SPAN_MS = 500;
/** 視窗內至少要有這麼多個樣本。 */
export const MIN_SAMPLES = 3;
/** 校準的平滑係數。單一則訊息的比例抖動可達 ±25%,不該讓它直接蓋掉。 */
export const CALIBRATION_WEIGHT = 0.3;

export interface Speed {
  tokensPerSecond: number;
  /** true 代表串流中的估計值,false 代表訊息落地後的精確值。 */
  live: boolean;
}

export class SpeedMeter {
  private readonly window: number[] = [];
  private streaming = false;
  private firstTick: number | null = null;
  private deltas = 0;
  private tokensPerDelta = DEFAULT_TOKENS_PER_DELTA;
  private calibrated = false;
  private last: number | null = null;
  private readonly windowMs: number;

  // node 的型別剝除模式不支援 constructor 參數屬性,所以老實寫。
  constructor(windowMs: number = WINDOW_MS) {
    this.windowMs = windowMs;
  }

  begin(_now: number): void {
    this.window.length = 0;
    this.streaming = true;
    this.firstTick = null;
    this.deltas = 0;
  }

  tick(now: number): void {
    if (!this.streaming) return;
    if (this.firstTick === null) this.firstTick = now;
    this.deltas += 1;
    this.window.push(now);
    this.trim(now);
  }

  /**
   * 訊息落地。時長從第一個 delta 起算,不含首 token 延遲——那段是等待,
   * 不是生成,算進去會讓短訊息的速度看起來莫名其妙地慢,也會讓落地的瞬間
   * 數字往下跳一階(即時值量的本來就是生成中的速率)。
   */
  end(now: number, outputTokens: number): void {
    this.streaming = false;
    const started = this.firstTick;
    this.window.length = 0;
    if (started === null) return;
    if (!this.measurable(now - started)) return;
    if (!Number.isFinite(outputTokens) || outputTokens <= 0) return;
    this.calibrate(outputTokens / this.deltas);
    this.last = (outputTokens / (now - started)) * 1000;
  }

  /**
   * delta 的到達時間只有在它真的隨生成滴下來時才是時間軸。工具呼叫不是——
   * 實測模型跑了 5 秒,42 個 toolcall delta 卻在 5 毫秒內整批到齊,拿那 5 毫秒
   * 去除 63 個 token 會算出 12600 tok/s。門檻與即時值那條路徑用同一組:量不到
   * 就不報,寧可讓上一則的數字多留一會兒。
   */
  private measurable(spanMs: number): boolean {
    return this.deltas >= MIN_SAMPLES && spanMs >= MIN_SPAN_MS;
  }

  /** 第一次沒有先驗就直接採用;之後平滑,免得單一則的抖動整個帶走即時值。 */
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

  reset(): void {
    this.window.length = 0;
    this.streaming = false;
    this.firstTick = null;
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
