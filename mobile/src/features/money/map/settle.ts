import type { ForceLayout } from './layout';

/** Ticks between looks at the clock while the layout settles. */
export const SETTLE_TICKS = 8;
/**
 * How much of a frame the settling layout may take, in ms. The rest is left
 * to touches and to whatever else is arriving, so the page stays live.
 */
export const SETTLE_BUDGET_MS = 6;

/**
 * Settles a force layout out of sight, a slice of each frame at a time, and
 * says once when it has. Nothing is drawn while it runs.
 *
 * Before, the map drew every step: ten ticks a frame for about twenty
 * frames, each one a new React render that re-recorded the map's five
 * pictures, rebuilt every label and the hit grid, and re-aimed the camera,
 * all on the JS thread. On a phone that was a stutter as Money opened, not
 * the glide it was meant to be. The map now arrives once, settled
 * (MoneyMap fades it in; with Reduce Motion it is simply there).
 *
 * With Reduce Motion, or `budget` 0, it settles in one go.
 */
export function settleLayout(
  layout: Pick<ForceLayout, 'tick' | 'settled'>,
  onSettled: () => void,
  {
    reduced = false,
    budget = SETTLE_BUDGET_MS,
    now = () => performance.now(),
    frame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
  }: {
    reduced?: boolean;
    budget?: number;
    now?: () => number;
    frame?: (run: () => void) => number;
    cancelFrame?: (id: number) => void;
  } = {},
): () => void {
  let pending: number | null = null;
  let cancelled = false;
  const run = () => {
    pending = null;
    if (cancelled) return;
    const started = now();
    let done = layout.settled;
    while (!done) {
      done = layout.tick(reduced || budget <= 0 ? 400 : SETTLE_TICKS);
      if (!reduced && budget > 0 && now() - started >= budget) break;
    }
    if (done) onSettled();
    else pending = frame(run);
  };
  pending = frame(run);
  return () => {
    cancelled = true;
    if (pending !== null) cancelFrame(pending);
  };
}
