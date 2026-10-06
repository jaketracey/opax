import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Loads a catalog record and keeps it refreshable. `refresh` serves pull to
 * refresh and the Try again shown on a saved copy; returning to the app while
 * a saved copy is on screen tries again by itself. A refresh that fails keeps
 * the saved copy readable (the client returns it, marked stale); only a first
 * load with nothing saved ends in the error state. Filters and other screen
 * state are untouched. `load` must be memoised by the caller.
 *
 * `load` receives `true` for a refresh (pull to refresh, Try again on a saved
 * copy, returning to the app): loaders forward it to the client, so the read
 * revalidates instead of returning a copy still within its max-age. The first
 * load and Try again after an error pass `false`.
 */
export function useCatalogRecord<R extends { stale: boolean }>(
  load: (refresh: boolean) => Promise<R>,
) {
  const [record, setRecord] = useState<R | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Only the latest request may write, so a slow first load never replaces
  // a newer refresh.
  const latest = useRef(0);
  // Starts a request; only its promise callbacks write state.
  const start = useCallback(
    (refresh = false) => {
      const id = ++latest.current;
      load(refresh)
        .then((result) => {
          if (id !== latest.current) return;
          setRecord(result);
          setError(null);
        })
        .catch((e: unknown) => {
          if (id === latest.current) setError(e);
        })
        .finally(() => {
          if (id === latest.current) setRefreshing(false);
        });
    },
    [load],
  );
  useEffect(() => {
    start();
    return () => {
      latest.current += 1;
    };
  }, [start]);
  const refresh = useCallback(() => {
    setRefreshing(true);
    start(true);
  }, [start]);
  const stale = record?.stale ?? false;
  useEffect(() => {
    if (!stale) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [stale, refresh]);
  return {
    record,
    error,
    refreshing,
    refresh,
    retry: () => {
      setError(null);
      start();
    },
  };
}
