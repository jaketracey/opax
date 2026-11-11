import { isE2E } from '../design/environment';
import { TwoSlotStore } from '../storage/two-slot';
import type { SplashSequence } from './timing';

/**
 * Which launch sequence a cold launch plays (timing.ts). The full unfold is
 * a brand moment, not a loading screen, so by default it plays once per
 * device per splash version: the first cold launch after install or after
 * this version first ships, including for readers who already saw the
 * welcome. Every later cold launch gets the short handoff. Flip the policy
 * to 'always' to unfold the name on every cold launch.
 *
 * "Played" is a small file in the app's documents, like the welcome flag.
 * E2E journeys start from cleared state and run many launches, so e2e
 * builds always take the short sequence.
 */
export const fullSplashPolicy: 'once' | 'always' = 'once';
export const SPLASH_VERSION = 1;

interface Played {
  version: number;
}
const store = new TwoSlotStore<Played>(
  ['opax-launch-splash-v1.json', 'opax-launch-splash-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version } = raw as { version?: unknown };
    return typeof version === 'number' && Number.isSafeInteger(version)
      ? { version }
      : null;
  },
  (value) => value,
);

/** Whether this device has played the current full sequence. */
export async function fullSplashPlayed(): Promise<boolean> {
  const value = await store.read().catch(() => null);
  return value?.version === SPLASH_VERSION;
}

/** Records the full sequence as played (finished or skipped). */
export function markFullSplashPlayed(): Promise<void> {
  return store.save({ version: SPLASH_VERSION }).catch(() => undefined);
}

/** The sequence a plain cold launch plays, by policy and the flag. */
export async function chooseLaunchSequence(): Promise<SplashSequence> {
  if (isE2E) return 'short';
  if (fullSplashPolicy === 'always') return 'full';
  return (await fullSplashPlayed()) ? 'short' : 'full';
}
