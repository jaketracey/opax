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
import {
  followResultKey,
  followKey,
  loadFollowResult,
  saveFollowResult,
  markSeen,
  useFollows,
  type Follow,
  type StoredFollowResult,
} from './store';
import { changesFor, currentKeys } from './changes';

/**
 * Takes the first baseline only. Legacy FollowToggle calls this on mount;
 * subsequent visits must use useSeenOnView, never clear changes on mount.
 */
export async function markSeenNow(follow: Follow) {
  if (follow.seen && follow.seenKeys !== undefined) return;
  try {
    const state = followState(
      follow,
      await catalogs.followSources(needsFor([follow])),
    );
    if (state.status === 'ready')
      await markSeen(followKey(follow), state.current, state.keys);
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
export function useFollowStates(refresh = 0) {
  const follows = useFollows();
  const [sources, setSources] = useState<FollowSources | null>(null);
  const [saved, setSaved] = useState<StoredFollowResult | null>(null);
  const [resultLoading, setResultLoading] = useState(true);
  const [foreground, setForeground] = useState(0);
  const handledRefresh = useRef(refresh);
  const needs = needsFor(follows ?? []);
  const any = !!follows?.length;
  const needsKey = `${needs.people}|${needs.bills}|${needs.electorates}|${needs.parties}`;
  useEffect(() => {
    let active = true;
    void loadFollowResult().then((result) => {
      if (!active) return;
      setSaved(result);
      setResultLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
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
        if (active)
          setSources((previous) => {
            if (!previous) return next;
            const kept = Object.fromEntries(
              Object.entries(next)
                .filter(
                  ([key, value]) =>
                    value === null &&
                    previous[key as keyof FollowSources] &&
                    !['error', 'savedAt'].includes(key),
                )
                .map(([key]) => [key, previous[key as keyof FollowSources]]),
            );
            return {
              ...next,
              ...kept,
              stale: next.stale || Object.keys(kept).length > 0,
              savedAt: Object.keys(kept).length
                ? Math.min(
                    next.savedAt ?? Infinity,
                    previous.savedAt ?? Infinity,
                  )
                : next.savedAt,
            };
          });
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
        (follows ?? []).map((f) => {
          const key = followKey(f);
          const fresh = followState(f, sources);
          const previous = new Map(saved?.states).get(key);
          if (fresh.status === 'unavailable' && previous?.status === 'ready') {
            return [
              key,
              {
                ...previous,
                changes: changesFor(f, previous.current).map((c) => ({
                  ...c,
                  stale: true,
                  savedAt: previous.savedAt ?? saved?.checkedAt,
                })),
                stale: true,
              },
            ];
          }
          if (fresh.status === 'ready' && previous?.status === 'ready') {
            const current = { ...previous.current, ...fresh.current };
            const stale =
              fresh.stale ||
              Object.keys(current).length !== Object.keys(fresh.current).length;
            return [
              key,
              {
                ...fresh,
                current,
                keys: currentKeys(current),
                changes: changesFor(f, current).map((c) => ({
                  ...c,
                  stale,
                  savedAt: fresh.savedAt ?? saved?.checkedAt,
                })),
                stale,
              },
            ];
          }
          return [key, fresh];
        }),
      ),
    [follows, sources, saved],
  );
  const changeSetKey = followResultKey({ states: [...states] });
  useEffect(() => {
    if (!sources || follows === null || resultLoading) return;
    const result: StoredFollowResult = {
      version: 1,
      shape: changeSetKey === '[]' ? 'collapsed' : 'expanded',
      checkedAt: Date.now(),
      states: [...states],
      sourceDates: Object.fromEntries(
        [...states].flatMap(([key, state]) =>
          state.status === 'ready'
            ? Object.entries(state.current).map(([marker, reading]) => [
                `${key}:${marker}`,
                reading.asAt,
              ])
            : [],
        ),
      ),
    };
    void saveFollowResult(result).catch(() => undefined);
  }, [sources, follows, states, changeSetKey, resultLoading]);
  useEffect(() => {
    for (const f of follows ?? []) {
      const state = states.get(followKey(f));
      if ((!f.seen || f.seenKeys === undefined) && state?.status === 'ready')
        void markSeen(followKey(f), state.current, state.keys).catch(
          () => undefined,
        );
    }
  }, [follows, states]);
  return {
    follows,
    states,
    sources,
    savedResult: saved,
    resultLoading,
    changeSetKey,
  };
}

export { markAllSeen } from './store';
