import { isAbortError } from '../../api/abort';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { apiClient } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import {
  decodeMoneyGraph,
  moneyCatalogs,
  type MoneyGraph,
  type MoneyJurisdiction,
} from './data';
import { rememberMoneyGraph } from './lookup';

/**
 * One jurisdiction's money graph. A refresh keeps the drawn copy until the
 * new one arrives; a retry after an error starts again.
 */
export function useMoneyRecord(jurisdiction: MoneyJurisdiction) {
  const [attempt, setAttempt] = useState({ n: 0, refresh: false });
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<{
    jurisdiction: MoneyJurisdiction;
    record: RecordResult<MoneyGraph> | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void apiClient
      .get(
        moneyCatalogs[jurisdiction].path,
        decodeMoneyGraph,
        attempt.refresh,
        { signal: controller.signal },
      )
      .then(
        (record) => {
          if (!active || controller.signal.aborted) return;
          rememberMoneyGraph(jurisdiction, record.data);
          if (active) setState({ jurisdiction, record, error: null });
        },
        (error) => {
          if (active && !controller.signal.aborted && !isAbortError(error))
            setState((previous) =>
              attempt.refresh &&
              previous?.jurisdiction === jurisdiction &&
              previous.record
                ? previous
                : { jurisdiction, record: null, error },
            );
        },
      )
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [jurisdiction, attempt]);
  const current = state?.jurisdiction === jurisdiction ? state : null;
  return {
    record: current?.record ?? null,
    error: current?.error ?? null,
    refreshing,
    refresh: useCallback(() => {
      setRefreshing(true);
      setAttempt((a) => ({ n: a.n + 1, refresh: true }));
    }, []),
    retry: useCallback(() => {
      setState(null);
      setAttempt((a) => ({ n: a.n + 1, refresh: true }));
    }, []),
  };
}

/**
 * VoiceOver, asked once when the first money screen subscribes and shared
 * by every screen after it, so a later map's first paint already knows
 * which view to draw (map 3.11).
 */
const reader = (() => {
  let known: boolean | null = null;
  const listeners = new Set<() => void>();
  const set = (value: boolean) => {
    if (known === value) return;
    known = value;
    listeners.forEach((listener) => listener());
  };
  let primed = false;
  let subscription: { remove: () => void } | null = null;
  const prime = () => {
    if (primed) return;
    primed = true;
    try {
      subscription = AccessibilityInfo.addEventListener(
        'screenReaderChanged',
        set,
      );
      void AccessibilityInfo.isScreenReaderEnabled().then(
        (value) => {
          if (known === null) set(value);
        },
        () => undefined,
      );
    } catch {
      // No accessibility bridge (a test or a headless run): unknown.
    }
  };
  return {
    prime,
    forget: () => {
      subscription?.remove();
      subscription = null;
      primed = false;
      known = null;
    },
    get: () => known,
    subscribe: (listener: () => void) => {
      prime();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();

/** Tests start each case with VoiceOver not yet known. */
export function forgetScreenReader() {
  reader.forget();
}
/** VoiceOver's state; null until known. */
export function useMoneyScreenReader() {
  return useSyncExternalStore(reader.subscribe, reader.get, reader.get);
}
/** The first known value, kept: the view never flips once it is known. */
export function useFirstScreenReader() {
  const value = useMoneyScreenReader();
  const [first, setFirst] = useState(value);
  // Unknown at first paint: take the first known value, then hold it.
  if (first === null && value !== null) setFirst(value);
  return first === null ? value : first;
}
