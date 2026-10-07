import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { apiClient } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import {
  decodeMoneyGraph,
  moneyCatalogs,
  type MoneyGraph,
  type MoneyJurisdiction,
} from './data';

export function useMoneyRecord(jurisdiction: MoneyJurisdiction) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    jurisdiction: MoneyJurisdiction;
    record: RecordResult<MoneyGraph> | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void apiClient
      .get(moneyCatalogs[jurisdiction].path, decodeMoneyGraph, attempt > 0)
      .then(
        (record) => {
          if (active) setState({ jurisdiction, record, error: null });
        },
        (error) => {
          if (active) setState({ jurisdiction, record: null, error });
        },
      );
    return () => {
      active = false;
    };
  }, [jurisdiction, attempt]);
  return {
    record: state?.jurisdiction === jurisdiction ? state.record : null,
    error: state?.jurisdiction === jurisdiction ? state.error : null,
    retry: () => {
      setState(null);
      setAttempt((n) => n + 1);
    },
  };
}
/** Unknown starts in the list, so GL never starts ahead of the VoiceOver read. */
export function useMoneyScreenReader() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true,
      changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (value) => {
        changed = true;
        if (active) setEnabled(value);
      },
    );
    void AccessibilityInfo.isScreenReaderEnabled().then(
      (value) => {
        if (active && !changed) setEnabled(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
