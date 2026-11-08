import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import {
  followState,
  needsFor,
  type FollowSources,
  type FollowState,
} from './markers';
import { followKey, markSeen, useFollows, type Follow } from './store';

/**
 * Marks a follow seen with the record as published now: when it is followed,
 * and whenever its page is opened. A failed read leaves it for the next look.
 */
export async function markSeenNow(follow: Follow) {
  try {
    const state = followState(
      follow,
      await catalogs.followSources(needsFor([follow])),
    );
    if (state.status === 'ready')
      await markSeen(followKey(follow), state.current);
  } catch {
    // Not saved: Today takes the first reading it can make instead.
  }
}

/**
 * Every follow against the published record. Reads the shared catalogs when
 * the screen opens, when the app returns to the foreground and when `refresh`
 * changes (a pull to refresh, which revalidates them). A follow never read
 * before takes its first reading as what was seen.
 */
export function useFollowStates(refresh: number) {
  const follows = useFollows();
  const [sources, setSources] = useState<FollowSources | null>(null);
  const [foreground, setForeground] = useState(0);
  const handledRefresh = useRef(refresh);
  const needs = needsFor(follows ?? []);
  const any = !!follows?.length;
  const needsKey = `${needs.people}|${needs.bills}|${needs.electorates}|${needs.parties}`;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForeground((v) => v + 1);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!any) return;
    let active = true;
    const force = refresh !== handledRefresh.current;
    handledRefresh.current = refresh;
    catalogs
      .followSources(needs, force)
      .then((next) => {
        if (active) setSources(next);
      })
      .catch((error: unknown) => {
        if (active)
          setSources((saved) => ({
            manifest: null,
            roster: null,
            slugs: null,
            people: null,
            electorates: null,
            bills: null,
            votes: null,
            interestIndex: null,
            pay: null,
            expenses: null,
            money: null,
            stale: false,
            savedAt: null,
            ...saved,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(
                    'http',
                    'Followed records could not be loaded. Try again.',
                  ),
          }));
      });
    return () => {
      active = false;
    };
    // `needs` is summarised by needsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [any, needsKey, refresh, foreground]);
  const states = useMemo(
    () =>
      new Map<string, FollowState>(
        (follows ?? []).map((f) => [followKey(f), followState(f, sources)]),
      ),
    [follows, sources],
  );
  useEffect(() => {
    for (const f of follows ?? []) {
      const state = states.get(followKey(f));
      if (!f.seen && state?.status === 'ready')
        void markSeen(followKey(f), state.current).catch(() => undefined);
    }
  }, [follows, states]);
  return { follows, states, sources };
}
