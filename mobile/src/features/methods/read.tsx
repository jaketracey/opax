import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import type { RecordResult } from '../../api/client';
import { ApiError } from '../../api/errors';
import { isAbortError } from '../../api/abort';
import { closeSheetItem, headerItems } from '../../navigation/chrome';
import { canShare, shareHeaderItem } from '../../navigation/share';
import { useSafeSetOptions } from '../../navigation/preview';

/**
 * One read for a block: its record, its failure and two ways to read again.
 * `retry` is the block's Try again; `refresh` is a pull to refresh, which
 * asks the loader for a fresh copy and keeps what is drawn until it lands.
 * A failed refresh keeps the record it had (a saved copy is never replaced
 * by an error).
 */
export function useRead<T>(
  load: (refresh: boolean, signal?: AbortSignal) => Promise<RecordResult<T>>,
) {
  const [state, setState] = useState<{
    record: RecordResult<T> | null;
    error: unknown;
  }>({ record: null, error: null });
  const [request, setRequest] = useState({ n: 0, refresh: false });
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    const read = async () => load(request.refresh, controller.signal);
    void read()
      .then((record) => {
        if (generation.current === id && !controller.signal.aborted)
          setState({ record, error: null });
      })
      .catch((error: unknown) => {
        if (
          generation.current === id &&
          !controller.signal.aborted &&
          !isAbortError(error)
        )
          setState((previous) => ({ record: previous.record, error }));
      })
      .finally(() => {
        if (generation.current === id) setRefreshing(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [load, request]);
  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
    setRequest((previous) => ({ n: previous.n + 1, refresh: true }));
  }, []);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setRequest((previous) => ({ n: previous.n + 1, refresh: true }));
  }, []);
  return {
    record: state.record,
    error: state.error,
    loading: !state.record && !state.error,
    refreshing,
    retry,
    refresh,
  };
}
export type Read<T> = ReturnType<typeof useRead<T>>;

/** A read that failed because the device is offline or timed out. */
export function isOffline(error: unknown): boolean {
  return (
    error instanceof ApiError && ['offline', 'timeout'].includes(error.code)
  );
}

/**
 * True when the screen is the first in its own stack: the sheet's root,
 * opened from content (records.md 8.6). Not `canGoBack()`, which is true
 * whenever the modal itself can be dismissed.
 */
export function useSheetRoot(): boolean {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const state = navigation?.getState();
  if (!state || !route) return false;
  return state.routes[0]?.key === route.key;
}

/**
 * Share for Methods and Coverage (records.md 6.2): leading, with Done
 * trailing, when the page is the sheet's root; trailing after Back when it
 * was pushed. The stack module supplies Done on the root.
 */
export function useShareItem(target: { path: string; title: string }) {
  const setOptions = useSafeSetOptions();
  const root = useSheetRoot();
  const { path, title } = target;
  useEffect(() => {
    const share = () => [shareHeaderItem({ path, title })];
    if (Platform.OS === 'android')
      setOptions(
        headerItems(() => (root ? [...share(), closeSheetItem()] : share())),
      );
    else if (root)
      setOptions({
        unstable_headerLeftItems: () => (canShare ? share() : []),
      });
    else setOptions(headerItems(share));
  }, [setOptions, root, path, title]);
}
