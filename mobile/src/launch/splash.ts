import * as SplashScreen from 'expo-splash-screen';
import { handoff } from './timing';

// Keep the native splash until the handoff has drawn the same image on top of
// it (src/launch/LaunchHandoff.tsx), so the swap has no seam. Imported once by
// the root layout, before anything renders.
let hidden = false;
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export function hideNativeSplash() {
  if (hidden) return;
  hidden = true;
  SplashScreen.hide();
}

/**
 * When the launch cover may fade (shell.md 3, today.md 2.3). The root
 * decides once per launch whether the welcome is due; until then nothing
 * releases, so the reader never sees a frame of Today before the welcome.
 *
 * - `holdSplashForWelcome()`: the welcome is due. Only the welcome's first
 *   layout (`releaseSplash('welcome')`) or the failsafe release the cover.
 * - `decideSplashPlain()`: no welcome. Today's cached reads
 *   (`releaseSplash('today')`) release it, or the handoff's own
 *   `latestFade`, whichever comes first.
 */
export type SplashReason = 'today' | 'welcome' | 'failsafe';
type Phase = 'pending' | 'plain' | 'welcome';
let phase: Phase = 'pending';
const signals: Record<SplashReason, boolean> = {
  today: false,
  welcome: false,
  failsafe: false,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function holdSplashForWelcome() {
  if (phase === 'welcome') return;
  phase = 'welcome';
  emit();
}
export function decideSplashPlain() {
  if (phase !== 'pending') return;
  phase = 'plain';
  emit();
}
export function releaseSplash(reason: SplashReason) {
  if (signals[reason]) return;
  signals[reason] = true;
  emit();
}
export function splashPhase(): Phase {
  return phase;
}
/** The cover may fade now. */
export function splashReleased(): boolean {
  return (
    signals.failsafe ||
    (phase === 'plain' && signals.today) ||
    (phase === 'welcome' && signals.welcome)
  );
}
export function subscribeSplash(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Tests only. */
export function resetSplashForTests() {
  phase = 'pending';
  signals.today = signals.welcome = signals.failsafe = false;
  listeners.clear();
}

// If the handoff never draws (fonts or the image fail), never leave anyone
// on the splash.
setTimeout(() => {
  hideNativeSplash();
  releaseSplash('failsafe');
}, handoff.splashFailsafe);
