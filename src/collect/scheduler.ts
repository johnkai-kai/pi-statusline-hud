// Clock and timers are injected.
//
// Everything in these two factories is "when should this run", which is the only part
// that can go wrong — buried in a closure inside statusline.ts it could only be verified
// by really sleeping for a few seconds, i.e. not tested at all.
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const REAL_CLOCK: Clock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    const handle = setTimeout(fn, ms);
    // This timer must not keep the process alive. A HUD refresh does not deserve that.
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export interface Debouncer {
  schedule(fn: () => void): void;
  cancel(): void;
}

/**
 * Runs the last scheduled call after delayMs of quiet.
 *
 * An agent turn often runs a dozen tools back to back, and spawning git status at the end
 * of each one is a dozen pointless processes. Only the last of a burst counts.
 */
export function createDebouncer(delayMs: number, clock: Clock): Debouncer {
  let handle: unknown;
  const cancel = (): void => {
    if (handle === undefined) return;
    clock.clearTimeout(handle);
    handle = undefined;
  };
  return {
    schedule(fn) {
      cancel();
      handle = clock.setTimeout(() => {
        handle = undefined;
        fn();
      }, delayMs);
    },
    cancel,
  };
}

export interface Cooldown {
  /** True when more than intervalMs has passed since the last pass; restarts the clock. */
  ready(): boolean;
  reset(): void;
}

/**
 * Construction counts as "just ran".
 *
 * The env scan already happened at session_start; starting the cooldown at 0 would make the
 * first finished tool trigger another scan guaranteed to find identical numbers.
 */
export function createCooldown(intervalMs: number, clock: Clock): Cooldown {
  let last = clock.now();
  return {
    ready() {
      const now = clock.now();
      if (now - last < intervalMs) return false;
      last = now;
      return true;
    },
    reset() {
      last = clock.now();
    },
  };
}
