import { useSyncExternalStore } from 'react';

/**
 * Whether the reader can see the app this launch: the launch cover has
 * finished fading and, on a first launch, the welcome over Today has
 * closed. Motion that is meant to be seen arriving (the bill plate's
 * timeline) waits for it, so it never plays out under the cover
 * (sweep 3 captures: the rail was already complete in the first frame
 * visible through the launch fade). Once true it stays true: a warm return
 * mounts no cover.
 */
let settled = false;
const listeners = new Set<() => void>();

export function settleLaunch() {
  if (settled) return;
  settled = true;
  listeners.forEach((listener) => listener());
}
/**
 * The root's launch cover has finished fading. On a plain launch that is
 * the reader seeing Today. Under a first launch's welcome (`phase` from
 * splash.ts) Today is still out of sight: the welcome settles the launch
 * when it closes.
 */
export function launchCoverGone(phase: 'pending' | 'plain' | 'welcome') {
  if (phase !== 'welcome') settleLaunch();
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
  listeners.clear();
}
