import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNow } from '../today/Masthead';
import {
  vicElectionFixtureNow,
  subscribeElectionClock,
  electionClockSnapshot,
} from '../today/launch-fixture';
/** Also tick at published instants so an open page changes at polling close. */
export function useElectionNow(instants: readonly string[] = []): Date {
  useSyncExternalStore(subscribeElectionClock, electionClockSnapshot);
  const now = useNow();
  const [tick, setTick] = useState(() => new Date());
  const pinned = vicElectionFixtureNow();
  const current = pinned ?? (tick > now ? tick : now);
  const next = instants
    .map(Date.parse)
    .filter((t) => t > current.getTime())
    .sort((a, b) => a - b)[0];
  useEffect(() => {
    if (pinned || next === undefined) return;
    const timer = setTimeout(
      () => setTick(new Date()),
      Math.min(2147483647, Math.max(1, next - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [next, pinned]);
  return current;
}
