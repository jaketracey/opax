import { useSyncExternalStore } from 'react';

/**
 * Whether the reader can see the app this launch: the launch cover has
 * finished fading and, on a first launch, the welcome over Today has
 * closed. Motion that is meant to be seen arriving (the bill plate's
 * timeline) waits for it, so it never plays out under the cover
 * (sweep 3 captures: the rail was already complete in the first frame
 * visible through the launch fade). Once true it stays true: a warm return
 * mounts no cover.
 *
 * - A plain launch settles when the cover has gone (`launchCoverGone`).
 * - Under a first launch's welcome, or while that decision is still pending
 *   (the failsafe removed the cover first), the cover going is not enough:
 *   the welcome's dismissal settles it (`welcomeDismissed`), or the decision
 *   landing plain.
 * - Nothing waits for ever: `SETTLE_LIMIT_MS` after the cover has gone, a
 *   launch with no welcome on screen settles anyway.
 */
let settled = false;
let welcomes = 0;
let limit: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
// Node tests may finish while a timer is still armed.
const quiet = (timer: ReturnType<typeof setTimeout>) => {
  (timer as { unref?: () => void }).unref?.();
  return timer;
};

/** The longest a launch with no welcome up stays unsettled once the cover has gone. */
export const SETTLE_LIMIT_MS = 5000;
/** About how long the welcome's modal takes to slide away, in ms. */
export const WELCOME_DISMISS_MS = 450;

export function settleLaunch() {
  if (settled) return;
  settled = true;
  if (limit) clearTimeout(limit);
  limit = null;
  listeners.forEach((listener) => listener());
}

/**
 * The root's launch cover has finished fading, or the launch decision has
 * changed since it did (`phase` from splash.ts). The root calls it for both.
 */
export function launchCoverGone(phase: 'pending' | 'plain' | 'welcome') {
  if (settled) return;
  if (phase === 'plain') {
    settleLaunch();
    return;
  }
  // A welcome is up, or may be about to be. If none is on screen when the
  // limit passes (it never mounted, the decision never came), Today is what
  // the reader sees: settle.
  limit ??= quiet(
    setTimeout(() => {
      limit = null;
      if (!welcomes) settleLaunch();
    }, SETTLE_LIMIT_MS),
  );
}

/**
 * A welcome page is on screen; call the result when it unmounts. An unmount
 * that is not followed at once by a mount (a remount while it is up) counts
 * as a dismissal, so a close this module was not told about still settles.
 */
export function welcomeMounted(): () => void {
  welcomes += 1;
  return () => {
    welcomes -= 1;
    quiet(
      setTimeout(() => {
        if (!welcomes) welcomeDismissed();
      }, 0),
    );
  };
}

/**
 * The welcome is closing (onboarding/state closeWelcome): the reader sees
 * Today once its modal has slid away.
 */
export function welcomeDismissed() {
  if (settled) return;
  quiet(setTimeout(settleLaunch, WELCOME_DISMISS_MS));
}

export function launchSettled(): boolean {
  return settled;
}
export function subscribeLaunchSettled(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLaunchSettled(): boolean {
  return useSyncExternalStore(
    subscribeLaunchSettled,
    launchSettled,
    launchSettled,
  );
}

/** Tests only: a cold launch, the cover still up. */
export function resetLaunchSettledForTests() {
  settled = false;
  welcomes = 0;
  if (limit) clearTimeout(limit);
  limit = null;
  listeners.clear();
}
