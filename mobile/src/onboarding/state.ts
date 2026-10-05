import { useSyncExternalStore } from 'react';
import { Settings } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { isE2E } from '../design/environment';

/**
 * The welcome tour shows once on this device, after the first launch, and
 * again from Account › About OPAX › Replay welcome tour. "Seen" is a small
 * file in the app's documents, like the seat choice; skipping counts as seen.
 *
 * E2E journeys start with cleared state, so e2e builds treat the tour as seen
 * unless the launch argument `-OPAXWelcomeTour on` asks for the production
 * behaviour (Maestro: `launchApp: arguments: { OPAXWelcomeTour: on }`).
 * Production and development builds never read the argument.
 */
export const TOUR_VERSION = 1;
export const TOUR_LAUNCH_ARGUMENT = 'OPAXWelcomeTour';
const file = () => new File(Paths.document, 'opax-welcome-v1.json');

export async function tourSeen(): Promise<boolean> {
  const saved = file();
  if (!saved.exists) return false;
  try {
    const value: unknown = JSON.parse(await saved.text());
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { version?: unknown }).version === TOUR_VERSION
    );
  } catch {
    // An unreadable flag is treated as seen: the tour never traps anyone,
    // and it can be replayed from Account.
    return true;
  }
}

export async function markTourSeen(): Promise<void> {
  const temporary = new File(Paths.document, 'opax-welcome-v1.tmp');
  temporary.write(JSON.stringify({ version: TOUR_VERSION }));
  temporary.move(file(), { overwrite: true });
}

/** The e2e opt-in, read from the launch arguments (NSUserDefaults). */
export function e2eTourRequested(): boolean {
  try {
    return String(Settings.get(TOUR_LAUNCH_ARGUMENT) ?? '') === 'on';
  } catch {
    return false;
  }
}

/** Whether the first launch shows the tour. */
export function firstLaunchTour({
  e2e,
  requested,
  seen,
}: {
  e2e: boolean;
  requested: boolean;
  seen: boolean;
}): boolean {
  if (e2e && !requested) return false;
  return !seen;
}

// One store for the whole app: the root layout shows the tour above the tabs.
type TourState = 'checking' | 'hidden' | 'visible';
let state: TourState = 'checking';
const listeners = new Set<() => void>();
function set(next: TourState) {
  if (next === state) return;
  state = next;
  listeners.forEach((listener) => listener());
}
let checked: Promise<void> | null = null;

/** Reads the flag once per launch; the tour shows if it has not been seen. */
export function checkFirstLaunch(): Promise<void> {
  checked ??= tourSeen()
    .then((seen) =>
      firstLaunchTour({
        e2e: isE2E,
        requested: isE2E && e2eTourRequested(),
        seen,
      }),
    )
    .catch(() => false)
    .then((show) => {
      if (state === 'checking') set(show ? 'visible' : 'hidden');
    });
  return checked;
}

/** Replay from Account. */
export function showTour() {
  set('visible');
}

/** Skip or finish: remember it on this device, then hide the tour. */
export function leaveTour(): Promise<void> {
  return markTourSeen().catch(() => undefined);
}
export function hideTour() {
  set('hidden');
}

export function tourState(): TourState {
  return state;
}
export function subscribeTour(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useTourState(): TourState {
  return useSyncExternalStore(subscribeTour, tourState, tourState);
}

/** Tests only: forget this launch's check. */
export function resetTourForTests() {
  state = 'checking';
  checked = null;
  listeners.clear();
}
