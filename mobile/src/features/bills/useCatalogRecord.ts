import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isAbortError } from '../../api/abort';

const dailyRefresh = 24 * 60 * 60 * 1000;

/**
 * Loads a catalog record and keeps it refreshable. `refresh` serves pull to
 * refresh and the Try again shown on a saved copy; returning to the app while
 * a saved copy is on screen tries again by itself. Fresh records revalidate
 * daily, including when returning after a day in the background. A refresh that fails keeps
 * the saved copy readable (the client returns it, marked stale); only a first
 * load with nothing saved ends in the error state. Filters and other screen
 * state are untouched. `load` must be memoised by the caller.
 *
 * `load` receives `true` for a refresh (pull to refresh, Try again on a saved
 * copy, returning to the app): loaders forward it to the client, so the read
 * revalidates instead of returning a copy still within its max-age. The first
 * load and Try again after an error pass `false`. The third argument is the
 * read's abort signal; loaders forward it through every nested request.
 */
export function useCatalogRecord<R extends { stale: boolean }>(
  load: (
    refresh: boolean,
    publish: (record: R) => void,
    signal?: AbortSignal,
  ) => Promise<R>,
) {
  const [outcome, setOutcome] = useState<{
    load: typeof load;
    record: R | null;
    error: unknown;
  } | null>(null);
  const [activity, setActivity] = useState<{
    load: typeof load;
    refreshing: boolean;
  } | null>(null);
  // Only the latest request may write, so a slow first load never replaces
  // a newer refresh.
  const latest = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const attemptedAt = useRef(0);
  // Starts a request; only its promise callbacks write state.
  const start = useCallback(
    (refresh = false) => {
      const id = ++latest.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      inFlight.current = true;
      attemptedAt.current = Date.now();
      const publish = (result: R) => {
        if (id !== latest.current || controller.signal.aborted) return;
        setOutcome({ load, record: result, error: null });
      };
      // The async boundary also catches a loader that throws before returning
      // its promise, keeping the screen's existing recovery controls usable.
      const request = async () => load(refresh, publish, controller.signal);
      void request()
        .then((result) => {
          if (id !== latest.current || controller.signal.aborted) return;
          setOutcome({ load, record: result, error: null });
        })
        .catch((e: unknown) => {
          if (
            id === latest.current &&
            !controller.signal.aborted &&
            !isAbortError(e)
          )
            setOutcome((previous) => ({
              load,
              record: previous?.load === load ? previous.record : null,
              error: e,
            }));
        })
        .finally(() => {
          if (id === latest.current) {
            inFlight.current = false;
            setActivity((previous) =>
              previous?.load === load && previous.refreshing
                ? { load, refreshing: false }
                : previous,
            );
          }
        });
    },
    [load],
  );
  useEffect(() => {
    start();
    return () => {
      latest.current += 1;
      requestController.current?.abort();
      requestController.current = null;
      inFlight.current = false;
    };
  }, [start]);
  const refresh = useCallback(() => {
    setActivity({ load, refreshing: true });
    start(true);
  }, [load, start]);
  const current = outcome?.load === load ? outcome : null;
  const record = current?.record ?? null;
  const error = current?.error ?? null;
  useEffect(() => {
    const due = () => {
      const age = Date.now() - attemptedAt.current;
      return age < 0 || age >= dailyRefresh;
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active' &&
        !inFlight.current &&
        (record?.stale || error || due())
      )
        refresh();
    });
    // One daily attempt, even after failure. Backgrounded screens wait for the
    // active event, so timers never initiate background network work.
    const timer = record
      ? setTimeout(
          () => {
            if (
              (AppState.currentState === 'active' ||
                AppState.currentState === null) &&
              !inFlight.current
            )
              refresh();
          },
          Math.min(
            dailyRefresh,
            Math.max(0, dailyRefresh - (Date.now() - attemptedAt.current)),
          ),
        )
      : undefined;
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, [outcome, record, error, refresh]);
  return {
    record,
    error,
    refreshing: activity?.load === load && activity.refreshing,
    refresh,
    retry: () => {
      setOutcome((previous) =>
        previous?.load === load ? { ...previous, error: null } : null,
      );
      start();
    },
  };
}
