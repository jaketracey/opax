import { useCallback, useEffect, useState } from 'react';

/** Only for a route the user opened. No focus/background revalidation. */
export function useRead<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    load: typeof load;
    attempt: number;
    value: T | null;
    error: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) setSettled({ load, attempt, value, error: null });
      })
      .catch((error) => {
        if (active) setSettled({ load, attempt, value: null, error });
      });
    return () => {
      active = false;
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
