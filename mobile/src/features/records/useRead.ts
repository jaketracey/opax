import { useCallback, useEffect, useState } from 'react';
import { isAbortError, throwIfAborted } from '../../api/abort';

/** Only for a route the user opened. No focus/background revalidation. */
export function useRead<T>(load: (signal?: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    load: typeof load;
    attempt: number;
    value: T | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        throwIfAborted(controller.signal);
        return load(controller.signal);
      })
      .then((value) => {
        if (active && !controller.signal.aborted)
          setSettled({ load, attempt, value, error: null });
      })
      .catch((error) => {
        if (active && !controller.signal.aborted && !isAbortError(error))
          setSettled({ load, attempt, value: null, error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [load, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current =
    settled?.load === load && settled.attempt === attempt ? settled : null;
  return {
    value: current?.value ?? null,
    error: current?.error ?? null,
    retry,
  };
}
