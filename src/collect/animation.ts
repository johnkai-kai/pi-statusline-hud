// The rainbow's animation tick.
//
// Every frame repaints the whole footer, so there are only two rules: do nothing at all
// when nobody asked for a rainbow, and do nothing when nobody is watching. The first
// makes the feature free for people who don't use it; the second stops a CPU loop
// spinning all night after you walk away — on SSH or a slow link it would keep
// flickering too.

/** Frame interval. 10 fps: visibly flowing, without flooding the terminal. */
export const FRAME_MS = 100;
/** Idle timeout. The next event starts it up again on its own. */
export const IDLE_STOP_MS = 60_000;

export function shouldAnimate(rainbowCount: number, msSinceActivity: number): boolean {
  if (!(rainbowCount > 0)) return false;
  return Number.isFinite(msSinceActivity) && msSinceActivity < IDLE_STOP_MS;
}
