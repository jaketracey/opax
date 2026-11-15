import { isAbortError } from '../../api/abort';
import { useCallback, useEffect, useState } from 'react';
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

export {
  forgetScreenReader,
  useFirstScreenReader,
  useMoneyScreenReader,
} from './screen-reader';
