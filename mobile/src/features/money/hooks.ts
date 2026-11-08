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
    void apiClient
      .get(moneyCatalogs[jurisdiction].path, decodeMoneyGraph, attempt.refresh)
      .then(
        (record) => {
          rememberMoneyGraph(jurisdiction, record.data);
          if (active) setState({ jurisdiction, record, error: null });
        },
        (error) => {
          if (active)
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
 * VoiceOver, primed when the money module first loads, so the map's first
 * paint already knows which view to draw and never flips (map 3.11).
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
  const prime = () => {
    if (primed) return;
    primed = true;
    try {
      AccessibilityInfo.addEventListener('screenReaderChanged', set);
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
reader.prime();

/** VoiceOver's state; null until known. */
export function useMoneyScreenReader() {
  return useSyncExternalStore(reader.subscribe, reader.get, reader.get);
}
/** The value at first render, kept: the view never flips after first paint. */
export function useFirstScreenReader() {
  const value = useMoneyScreenReader();
  const [first] = useState(value);
  return first;
}
