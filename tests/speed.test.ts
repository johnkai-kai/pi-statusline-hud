import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_SAMPLES, MIN_SPAN_MS, SpeedMeter, WINDOW_MS } from "../src/collect/speed.ts";

/** 以固定間隔灌入 delta 事件,回傳最後一筆的時間。 */
function stream(meter: SpeedMeter, from: number, count: number, gapMs: number): number {
  let at = from;
  for (let i = 0; i < count; i += 1) {
    at += gapMs;
    meter.tick(at);
  }
  return at;
}

test("還沒有任何訊息時沒有速度可報", () => {
  const meter = new SpeedMeter();
  assert.equal(meter.current(0), null);
});

test("樣本太少不報——兩個 delta 算不出速度", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  stream(meter, 0, MIN_SAMPLES - 1, 100);
  assert.equal(meter.current(1_000), null);
});

test("串流中用滑動視窗估算,標記為即時值", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  // 每 50ms 一個 delta = 20 個/秒。未校準時一個 delta 當一個 token。
  const last = stream(meter, 0, 40, 50);
  const rate = meter.current(last);
  assert.ok(rate !== null);
  assert.equal(rate.live, true);
  assert.ok(Math.abs(rate.tokensPerSecond - 20) < 1.5, `估到 ${rate.tokensPerSecond}`);
});

test("視窗外的樣本不算——速度掉下來要跟得上", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const fast = stream(meter, 0, 100, 10); // 100 個/秒
  const before = meter.current(fast);
  // 慢速段要跨過整個視窗,快速那批才會全部老化出去。
  const slow = stream(meter, fast, 14, 600); // 約 1.7 個/秒,共 8.4 秒
  const after = meter.current(slow);
  assert.ok(before !== null && after !== null);
  assert.ok(after.tokensPerSecond < 3, `${before.tokensPerSecond} → ${after.tokensPerSecond}`);
});

test("首 token 前的空窗不該拖低速度——從第一個 delta 起算", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  // 等 12 秒才吐第一個 token,然後以每秒 20 個穩定輸出。
  const last = stream(meter, 12_000, 40, 50);
  const rate = meter.current(last);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 20) < 1.5, `估到 ${rate.tokensPerSecond}`);
});

test("訊息結束後改報精確值,並標記為非即時", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 1_000, 100, 10); // 第一個 delta 在 1010ms,最後在 2000ms
  meter.end(last, 99); // 生成時長 = 最後一個 delta - 第一個 delta
  const rate = meter.current(last + 5_000);
  assert.ok(rate !== null);
  assert.equal(rate.live, false);
  assert.ok(rate.tokensPerSecond > 90 && rate.tokensPerSecond < 110, `算出 ${rate.tokensPerSecond}`);
});

test("結束時用真實 token 數自我校準,下一則的即時值跟著修正", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 10);
  // 100 個 delta 只換到 50 個 token —— 這個 tokenizer 一個 token 要兩個 delta。
  meter.end(last, 50);
  meter.begin(last + 1_000);
  const next = stream(meter, last + 1_000, 40, 50); // 20 個 delta/秒
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.equal(rate.live, true);
  assert.ok(Math.abs(rate.tokensPerSecond - 10) < 1, `校準後應該約 10,實得 ${rate.tokensPerSecond}`);
});

test("時長為零不會變成無限大", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  meter.tick(1_000);
  meter.end(1_000, 500);
  assert.equal(meter.current(2_000), null);
});

test("output 為零的訊息不拿來校準——那會把比例洗成零", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 10);
  meter.end(last, 0);
  meter.begin(last + 1_000);
  const next = stream(meter, last + 1_000, 40, 50);
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 20) < 1.5, `校準不該被洗掉,實得 ${rate.tokensPerSecond}`);
});

test("reset 清掉一切", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 10);
  meter.end(last, 100);
  meter.reset();
  assert.equal(meter.current(last), null);
});

test("視窗長度與門檻是公開常數,測試與實作看同一份", () => {
  assert.ok(WINDOW_MS >= 1_000);
  assert.ok(MIN_SPAN_MS > 0 && MIN_SPAN_MS < WINDOW_MS);
  assert.ok(MIN_SAMPLES >= 3);
});

test("整批灌進來的 delta 不算量測——工具呼叫會在幾毫秒內吐完一整串", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  // 實測:模型跑了 5 秒,42 個 toolcall delta 卻在 5ms 內全部到齊。
  // 拿那 5ms 去除 63 個 token 會得到 12600 tok/s。
  const last = stream(meter, 5_000, 42, 0.12);
  meter.end(last, 63);
  assert.equal(meter.current(last), null, "沒有可信的量測就不該報數字");
});

test("整批灌進來的 delta 也不拿來校準——那會污染下一則的即時值", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const streamed = stream(meter, 0, 100, 20); // 50 個 delta/秒,乾淨的一則
  meter.end(streamed, 100); // 比例 1.0
  meter.begin(streamed + 1_000);
  const burst = stream(meter, streamed + 5_000, 30, 0.3); // 整批
  meter.end(burst, 53); // 比例會是 1.77,不該被採用
  meter.begin(burst + 1_000);
  const next = stream(meter, burst + 1_000, 60, 20); // 一樣 50 個 delta/秒
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 50) < 5, `比例被污染了,實得 ${rate.tokensPerSecond}`);
});

test("突然爆掉的一則不會把速度整個帶走——校準是平滑的", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  let at = 0;
  for (let i = 0; i < 4; i += 1) {
    at = stream(meter, at + 1_000, 100, 20);
    meter.end(at, 100); // 穩定在比例 1.0
    meter.begin(at + 1_000);
  }
  // 一則比例 2.0 的訊息(合法串流,但 tokenizer 表現差很多)
  at = stream(meter, at + 1_000, 100, 20);
  meter.end(at, 200);
  meter.begin(at + 1_000);
  const next = stream(meter, at + 1_000, 60, 20); // 50 個 delta/秒
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(rate.tokensPerSecond < 85, `單一則不該讓即時值翻倍,實得 ${rate.tokensPerSecond}`);
  assert.ok(rate.tokensPerSecond > 50, `但也要往新比例移動,實得 ${rate.tokensPerSecond}`);
});

test("第一次校準直接採用觀察到的比例,不必等它慢慢爬", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 20);
  meter.end(last, 200); // 比例 2.0
  meter.begin(last + 1_000);
  const next = stream(meter, last + 1_000, 60, 20); // 50 個 delta/秒
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 100) < 5, `第一次應該直接到 100,實得 ${rate.tokensPerSecond}`);
});
