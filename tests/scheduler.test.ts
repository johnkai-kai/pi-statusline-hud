import { test } from "node:test";
import assert from "node:assert/strict";
import { type Clock, createCooldown, createDebouncer } from "../src/collect/scheduler.ts";

// Fake clock: time and timers are driven by the test, sleeping not a millisecond.
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

test("debounce poked five times runs once", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  for (let i = 0; i < 5; i += 1) debouncer.schedule(() => (runs += 1));
  clock.advance(800);
  assert.equal(runs, 1);
});

test("debounce does not run before the delay", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  clock.advance(799);
  assert.equal(runs, 0);
  clock.advance(1);
  assert.equal(runs, 1);
});

test("every debounce schedule restarts the countdown", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  clock.advance(700);
  debouncer.schedule(() => (runs += 1));
  clock.advance(700);
  assert.equal(runs, 0, "the second schedule should restart the countdown");
  clock.advance(100);
  assert.equal(runs, 1);
});

test("debounce runs the last function scheduled", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  const calls: string[] = [];
  debouncer.schedule(() => calls.push("old"));
  debouncer.schedule(() => calls.push("new"));
  clock.advance(800);
  assert.deepEqual(calls, ["new"]);
});

test("after debounce cancel nothing fires and no timer is left", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  debouncer.cancel();
  assert.equal(clock.pending(), 0);
  clock.advance(5_000);
  assert.equal(runs, 0);
});

test("debounce cancel with nothing scheduled does not blow up", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  assert.doesNotThrow(() => debouncer.cancel());
});

test("debounce can schedule again after running", () => {
  const clock = fakeClock();
  const debouncer = createDebouncer(800, clock);
  let runs = 0;
  debouncer.schedule(() => (runs += 1));
  clock.advance(800);
  debouncer.schedule(() => (runs += 1));
  clock.advance(800);
  assert.equal(runs, 2);
});

test("cooldown counts construction as having just run", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  assert.equal(cooldown.ready(), false, "session_start already scanned; it must not scan again at once");
});

test("cooldown only passes once the time is up", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  clock.advance(29_999);
  assert.equal(cooldown.ready(), false);
  clock.advance(1);
  assert.equal(cooldown.ready(), true);
});

test("cooldown restarts its clock after passing", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  clock.advance(30_000);
  assert.equal(cooldown.ready(), true);
  assert.equal(cooldown.ready(), false, "asked twice at the same instant, it should pass once");
  clock.advance(30_000);
  assert.equal(cooldown.ready(), true);
});

test("cooldown can be reset by hand", () => {
  const clock = fakeClock();
  const cooldown = createCooldown(30_000, clock);
  clock.advance(29_000);
  cooldown.reset();
  clock.advance(29_999);
  assert.equal(cooldown.ready(), false, "after reset it counts 30 seconds from scratch");
  clock.advance(1);
  assert.equal(cooldown.ready(), true);
});
