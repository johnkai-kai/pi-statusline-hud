// 時間與 timer 從外面注入。
//
// 這兩個工廠的邏輯全都是「什麼時候該跑」,而那正是唯一會出錯的地方——
// 直接關進 statusline.ts 的閉包裡就只能靠真的睡幾秒來驗證,等於測不到。
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const REAL_CLOCK: Clock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    const handle = setTimeout(fn, ms);
    // 這條 timer 不該讓行程活著。HUD 的刷新排程配不上一個沒關掉的 pi。
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
 * 安靜 delayMs 之後才跑最後一次排程的函式。
 *
 * agent 一個回合常連跑十幾個工具,每個工具結束都直接 spawn 一次 git status
 * 是十幾個沒必要的行程。連續事件只有最後一個算數。
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
  /** 距上次放行超過 intervalMs 才回 true,並就地重新計時。 */
  ready(): boolean;
  reset(): void;
}

/**
 * 建構當下即視為「剛跑過」。
 *
 * env 掃描在 session_start 已經做過一次,冷卻若從 0 起算,第一個結束的工具
 * 就會馬上再掃一次——那次掃描保證掃出一模一樣的數字。
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
