import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { isE2E } from '../design/environment';
import { welcomeDismissed } from '../launch/settled';
import { TwoSlotStore } from '../storage/two-slot';
import { e2eTourRequested } from './launch-flag';

/**
 * The welcome shows once on this device, on the first launch, and again
 * from Account › Replay welcome. "Seen" is a small file in the app's
 * documents, like the seat choice. Continue (on the short welcome it closes;
 * on the full one it opens the electorate step), choosing a seat and
 * "Not now" all count as seen, so a launch never repeats a page the reader
 * has already passed. 1.0 readers who saw the five-page
 * tour keep their flag (same file, same version), so they never see the new
 * welcome unless they replay it.
 *
 * E2E journeys start with cleared state, so e2e builds treat the welcome as
 * seen unless their launch argument asks for the production behaviour
 * (launch-flag.e2e.ts). Release builds never contain the reader: Metro swaps
 * in launch-flag.production.ts, and development builds ignore it.
 */
export const TOUR_VERSION = 1;
const file = () => new File(Paths.document, 'opax-welcome-v1.json');

interface WelcomeFlag {
  version: number;
  /** Sydney date (YYYY-MM-DD) of the last welcome "Not now". */
  declinedAt?: string;
}
const store = new TwoSlotStore<WelcomeFlag>(
  ['opax-welcome-v1.json', 'opax-welcome-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, declinedAt } = raw as {
      version?: unknown;
      declinedAt?: unknown;
    };
    if (!(typeof version === 'number' && Number.isSafeInteger(version)))
      return null;
    return typeof declinedAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(declinedAt)
      ? { version, declinedAt }
      : { version };
  },
  (value) => value,
);
export async function tourSeen(): Promise<boolean> {
  const value = await store.read();
  if (value) return value.version === TOUR_VERSION;
  // Preserve the legacy unreadable-flag rule: never trap a reader in the
  // welcome, and replay remains available from Account.
  return (
    file().exists || new File(Paths.document, 'opax-welcome-v1.b.json').exists
  );
}
export const welcomeSeen = tourSeen;

/** Today's date in Sydney, as the invitation's day rules count it. */
export function sydneyDate(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {
    /* Fall through to UTC. */
  }
  return now.toISOString().slice(0, 10);
}

let declinedThisLaunch = false;
let liveDeclinedAt: string | null = null;
const declineListeners = new Set<() => void>();
/** The live welcome choice, before its asynchronous disk save completes. */
export function useWelcomeDeclinedAt(): string | null {
  return useSyncExternalStore(
    subscribeWelcomeDecline,
    liveDecline,
    liveDecline,
  );
}
const liveDecline = () => liveDeclinedAt;
function subscribeWelcomeDecline(listener: () => void) {
  declineListeners.add(listener);
  return () => {
    declineListeners.delete(listener);
  };
}
/**
 * Records the welcome as seen. `declined` is "Not now" (the bar button,
 * two-finger Z, Escape, Android back): it also records the day, so Today can
 * keep the invitation off its first screen that session (first-launch 4.4).
 * Choosing a seat and Continue decline nothing, and keep an earlier day.
 */
export async function markWelcomeSeen({
  declined = false,
}: { declined?: boolean } = {}): Promise<void> {
  if (declined) {
    declinedThisLaunch = true;
    liveDeclinedAt = sydneyDate();
    declineListeners.forEach((listener) => listener());
  }
  const previous = await store.read().catch(() => null);
  const declinedAt = liveDeclinedAt ?? previous?.declinedAt;
  await store.save({
    version: TOUR_VERSION,
    ...(declinedAt ? { declinedAt } : {}),
  });
}
export function markTourSeen(): Promise<void> {
  return markWelcomeSeen();
}
/** The day of the last welcome "Not now" on this device, if any. */
export async function welcomeDeclinedAt(): Promise<string | null> {
  const saved = await store.read().catch(() => null);
  return liveDeclinedAt ?? saved?.declinedAt ?? null;
}
/** "Not now" was chosen during this launch (Today's declined-session rule). */
export function welcomeDeclinedThisLaunch(): boolean {
  return declinedThisLaunch;
}

/** Whether the first launch shows the welcome. */
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

// One launch decision for the whole app: the root layout presents /welcome
// when it is 'visible' (due), and holds the splash while it is 'checking'.
type TourState = 'checking' | 'hidden' | 'visible';
let state: TourState = 'checking';
const listeners = new Set<() => void>();
function set(next: TourState) {
  if (next === state) return;
  state = next;
  listeners.forEach((listener) => listener());
}
let checked: Promise<void> | null = null;

/** Reads the flag once per launch; the welcome is due if it has not been seen. */
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
/** The root has presented the launch welcome; the decision is spent. */
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

/**
 * Closes the whole welcome modal from any screen of its stack: pops the
 * `welcome` route from the root stack (today.md 4.2). Not `dismissAll()`,
 * which returns to the welcome's own first screen.
 */
export function closeWelcome(navigation: {
  getParent: () => { goBack: () => void } | undefined;
}) {
  // The reader is about to see Today: motion held for the launch may start
  // once the modal has slid away.
  welcomeDismissed();
  const root = navigation.getParent();
  if (root) root.goBack();
  else router.back();
}

/**
 * Whether a launch URL opens content: a first launch from it shows the short
 * welcome over that page. Today itself and a development client's own URL
 * are plain launches.
 */
export function isContentLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (/expo-development-client/.test(url)) return false;
    const native = parsed.protocol === 'opax:';
    const path = (
      native ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
    ).replace(/\/+$/, '');
    return !['', '/', '/today'].includes(path);
  } catch {
    return false;
  }
}

/** Tests only: forget this launch's check. */
export function resetTourForTests() {
  state = 'checking';
  checked = null;
  declinedThisLaunch = false;
  liveDeclinedAt = null;
  declineListeners.clear();
  listeners.clear();
}
