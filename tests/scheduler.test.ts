import { test } from "node:test";
import assert from "node:assert/strict";
import { type Clock, createCooldown, createDebouncer } from "../src/collect/scheduler.ts";

// 假時鐘:時間與 timer 都由測試推動,不睡任何一毫秒。
function fakeClock(): Clock & { advance(ms: number): void; pending(): number } {
  let time = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    setTimeout(fn, ms) {
      const handle = ++seq;
      timers.set(handle, { at: time + ms, fn });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(ms) {
      time += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(handle);
          timer.fn();
        }
      }
    },
    pending: () => timers.size,
  };
}

test("debounce 連戳五下只執行一次", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  for (let i = 0; i < 5; i += 1) debouncer.schedule(() => (runs += 1));
  clock.advance(800);
  assert.equal(runs, 1);
});

test("debounce 延遲未到不執行", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  clock.advance(799);
  assert.equal(runs, 0);
  clock.advance(1);
  assert.equal(runs, 1);
});

test("debounce 每次排程都把倒數歸零", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  clock.advance(700);
  debouncer.schedule(() => (runs += 1));
  clock.advance(700);
  assert.equal(runs, 0, "第二次排程應該讓倒數重新開始");
  clock.advance(100);
  assert.equal(runs, 1);
});

test("debounce 執行的是最後一次排程的函式", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  const calls: string[] = [];
  debouncer.schedule(() => calls.push("舊"));
  debouncer.schedule(() => calls.push("新"));
  clock.advance(800);
  assert.deepEqual(calls, ["新"]);
});

test("debounce cancel 之後不再觸發,也不留 timer", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  debouncer.cancel();
  assert.equal(clock.pending(), 0);
  clock.advance(5_000);
  assert.equal(runs, 0);
});

test("debounce 沒有排程時 cancel 不會炸", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  assert.doesNotThrow(() => debouncer.cancel());
});

test("debounce 執行完還能再排下一次", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  clock.advance(800);
  debouncer.schedule(() => (runs += 1));
  clock.advance(800);
  assert.equal(runs, 2);
});

test("cooldown 建構當下就算剛跑過", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  assert.equal(cooldown.ready(), false, "session_start 已經掃過一次,不該立刻再掃");
});

test("cooldown 時間到才放行", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  clock.advance(29_999);
  assert.equal(cooldown.ready(), false);
  clock.advance(1);
  assert.equal(cooldown.ready(), true);
});

test("cooldown 放行後計時重設", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  clock.advance(30_000);
  assert.equal(cooldown.ready(), true);
  assert.equal(cooldown.ready(), false, "同一刻連問兩次只該放行一次");
  clock.advance(30_000);
  assert.equal(cooldown.ready(), true);
});

test("cooldown 可以手動重設", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  clock.advance(29_000);
  cooldown.reset();
  clock.advance(29_999);
  assert.equal(cooldown.ready(), false, "reset 之後要從頭數 30 秒");
  clock.advance(1);
  assert.equal(cooldown.ready(), true);
});
