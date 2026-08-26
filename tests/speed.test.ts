import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_SAMPLES, MIN_SPAN_MS, SpeedMeter, WINDOW_MS } from "../src/collect/speed.ts";

/** Feeds delta events at a fixed interval and returns the time of the last one. */
function stream(meter: SpeedMeter, from: number, count: number, gapMs: number): number {
  let at = from;
  for (let i = 0; i < count; i += 1) {
    at += gapMs;
    meter.tick(at);
  }
  return at;
}

test("with no message yet there is no speed to report", () => {
  const meter = new SpeedMeter();
  assert.equal(meter.current(0), null);
});

test("too few samples report nothing — two deltas are not a speed", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  stream(meter, 0, MIN_SAMPLES - 1, 100);
  assert.equal(meter.current(1_000), null);
});

test("mid-stream it estimates from a sliding window, marked live", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  // One delta per 50ms = 20/s. Uncalibrated, one delta counts as one token.
  const last = stream(meter, 0, 40, 50);
  const rate = meter.current(last);
  assert.ok(rate !== null);
  assert.equal(rate.live, true);
  assert.ok(Math.abs(rate.tokensPerSecond - 20) < 1.5, `estimated ${rate.tokensPerSecond}`);
});

test("samples outside the window do not count — the speed must follow a slowdown", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const fast = stream(meter, 0, 100, 10); // 100/s
  const before = meter.current(fast);
  // The slow stretch must span the whole window before the fast batch ages out entirely.
  const slow = stream(meter, fast, 14, 600); // about 1.7/s over 8.4 seconds
  const after = meter.current(slow);
  assert.ok(before !== null && after !== null);
  assert.ok(after.tokensPerSecond < 3, `${before.tokensPerSecond} → ${after.tokensPerSecond}`);
});

test("the gap before the first token must not drag the speed down — timing starts at the first delta", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  // 12 seconds before the first token, then a steady 20 per second.
  const last = stream(meter, 12_000, 40, 50);
  const rate = meter.current(last);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 20) < 1.5, `estimated ${rate.tokensPerSecond}`);
});

test("once the message ends it reports the exact value, marked not live", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 1_000, 100, 10); // first delta at 1010ms, last at 2000ms
  meter.end(last, 99); // generation time = last delta - first delta
  const rate = meter.current(last + 5_000);
  assert.ok(rate !== null);
  assert.equal(rate.live, false);
  assert.ok(rate.tokensPerSecond > 90 && rate.tokensPerSecond < 110, `computed ${rate.tokensPerSecond}`);
});

test("ending calibrates from the real token count, correcting the next message's live value", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 10);
  // 100 deltas bought only 50 tokens — this tokenizer needs two deltas per token.
  meter.end(last, 50);
  meter.begin(last + 1_000);
  const next = stream(meter, last + 1_000, 40, 50); // 20 deltas/s
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.equal(rate.live, true);
  assert.ok(Math.abs(rate.tokensPerSecond - 10) < 1, `after calibration it should be about 10, got ${rate.tokensPerSecond}`);
});

test("a zero duration does not become infinity", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  meter.tick(1_000);
  meter.end(1_000, 500);
  assert.equal(meter.current(2_000), null);
});

test("a message with zero output is not used to calibrate — it would wash the ratio to zero", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 10);
  meter.end(last, 0);
  meter.begin(last + 1_000);
  const next = stream(meter, last + 1_000, 40, 50);
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 20) < 1.5, `calibration must not be washed out, got ${rate.tokensPerSecond}`);
});

test("reset clears everything", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 10);
  meter.end(last, 100);
  meter.reset();
  assert.equal(meter.current(last), null);
});

test("the window length and thresholds are exported constants, shared by test and implementation", () => {
  assert.ok(WINDOW_MS >= 1_000);
  assert.ok(MIN_SPAN_MS > 0 && MIN_SPAN_MS < WINDOW_MS);
  assert.ok(MIN_SAMPLES >= 3);
});

test("deltas delivered in one burst are not a measurement — a tool call dumps them in milliseconds", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  // Measured: the model spent 5 seconds, then all 42 toolcall deltas arrived within 5ms.
  // Dividing 63 tokens by those 5ms gives 12600 tok/s.
  const last = stream(meter, 5_000, 42, 0.12);
  meter.end(last, 63);
  assert.equal(meter.current(last), null, "without a trustworthy measurement, report nothing");
});

test("a burst is not used to calibrate either — it would poison the next message's live value", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const streamed = stream(meter, 0, 100, 20); // 50 deltas/s, a clean message
  meter.end(streamed, 100); // ratio 1.0
  meter.begin(streamed + 1_000);
  const burst = stream(meter, streamed + 5_000, 30, 0.3); // all at once
  meter.end(burst, 53); // ratio would be 1.77, and must not be adopted
  meter.begin(burst + 1_000);
  const next = stream(meter, burst + 1_000, 60, 20); // 50 deltas/s again
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 50) < 5, `the ratio was poisoned, got ${rate.tokensPerSecond}`);
});

test("one wild message does not carry the speed away — calibration is smoothed", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  let at = 0;
  for (let i = 0; i < 4; i += 1) {
    at = stream(meter, at + 1_000, 100, 20);
    meter.end(at, 100); // steady at ratio 1.0
    meter.begin(at + 1_000);
  }
  // One message at ratio 2.0 (a legal stream, but a very different tokenizer showing)
  at = stream(meter, at + 1_000, 100, 20);
  meter.end(at, 200);
  meter.begin(at + 1_000);
  const next = stream(meter, at + 1_000, 60, 20); // 50 deltas/s
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(rate.tokensPerSecond < 85, `one message must not double the live value, got ${rate.tokensPerSecond}`);
  assert.ok(rate.tokensPerSecond > 50, `but it must move towards the new ratio, got ${rate.tokensPerSecond}`);
});

test("the first calibration adopts the observed ratio directly instead of creeping towards it", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 0, 100, 20);
  meter.end(last, 200); // ratio 2.0
  meter.begin(last + 1_000);
  const next = stream(meter, last + 1_000, 60, 20); // 50 deltas/s
  const rate = meter.current(next);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate.tokensPerSecond - 100) < 5, `the first should land on 100, got ${rate.tokensPerSecond}`);
});

test("time to first token: from request to the first delta, queueing included", () => {
  const meter = new SpeedMeter();
  assert.equal(meter.latency(), null, "nothing sent yet, so no latency to report");
  meter.begin(1_000);
  assert.equal(meter.latency(), null, "nothing reported before the first token arrives");
  meter.tick(21_000); // measured on a local backend: 19s queueing + 0.7s prefill
  assert.equal(meter.latency(), 20_000);
});

test("time to first token is measured per message and never reuses the previous one", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  stream(meter, 5_000, 10, 20);
  assert.equal(meter.latency(), 5_020);
  meter.begin(100_000);
  meter.tick(100_500);
  assert.equal(meter.latency(), 500);
});

test("a burst-delivered tool call still has a time to first token — that wait was real", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 5_000, 42, 0.12);
  meter.end(last, 63);
  assert.equal(meter.current(last), null, "the speed cannot be measured");
  const ttft = meter.latency();
  assert.ok(ttft !== null && ttft > 4_900, "but the latency can");
});

test("reset clears the time to first token too", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  meter.tick(500);
  meter.reset();
  assert.equal(meter.latency(), null);
});

test("end returns this message's exact speed, or null when unmeasurable — the history needs to know", () => {
  const meter = new SpeedMeter();
  meter.begin(0);
  const last = stream(meter, 1_000, 100, 10);
  const precise = meter.end(last, 99);
  assert.ok(precise !== null && precise > 90 && precise < 110, `computed ${precise}`);
  // The burst message cannot be measured, so end must return null, or the previous number is recorded twice.
  meter.begin(last + 1_000);
  const burst = stream(meter, last + 5_000, 30, 0.3);
  assert.equal(meter.end(burst, 53), null);
});
