import { useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { TwoSlotStore } from '../storage/two-slot';
import { isE2E } from '../design/environment';
import { e2eTourRequested } from './launch-flag';

/**
 * The welcome tour shows once on this device, after the first launch, and
 * again from Account › About OPAX › Replay welcome tour. "Seen" is a small
 * file in the app's documents, like the seat choice; skipping counts as seen.
 *
 * E2E journeys start with cleared state, so e2e builds treat the tour as seen
 * unless their launch argument asks for the production behaviour
 * (launch-flag.e2e.ts). Release builds never contain the reader: Metro swaps
 * in launch-flag.production.ts, and development builds ignore it.
 */
export const TOUR_VERSION = 1;
const file = () => new File(Paths.document, 'opax-welcome-v1.json');

const store = new TwoSlotStore<{ version: number }>(
  ['opax-welcome-v1.json', 'opax-welcome-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const version = (raw as { version?: unknown }).version;
    return typeof version === 'number' && Number.isSafeInteger(version)
      ? { version }
      : null;
  },
  (value) => value,
);
export async function tourSeen(): Promise<boolean> {
  const value = await store.read();
  if (value) return value.version === TOUR_VERSION;
  // Preserve the legacy unreadable-flag rule: never trap a reader in the
  // tour, and replay remains available from Account.
  return (
    file().exists || new File(Paths.document, 'opax-welcome-v1.b.json').exists
  );
}
export function markTourSeen(): Promise<void> {
  return store.save({ version: TOUR_VERSION });
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
