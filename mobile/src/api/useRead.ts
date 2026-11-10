import { useEffect, useRef, useState } from 'react';
import type { RecordResult } from './client';
import { isAbortError } from './abort';

// Unlike the catalog hook, this never revalidates on AppState or a timer.
export function useRead<T>(
  load: (signal?: AbortSignal) => Promise<RecordResult<T>>,
) {
  const [outcome, setOutcome] = useState<{
    load: typeof load;
    revision: number;
    record: RecordResult<T> | null;
    error: unknown;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    const request = async () => load(controller.signal);
    void request()
      .then((record) => {
        if (generation.current === id && !controller.signal.aborted)
          setOutcome({ load, revision, record, error: null });
      })
      .catch((error) => {
        if (
          generation.current === id &&
          !controller.signal.aborted &&
          !isAbortError(error)
        )
          setOutcome((previous) => ({
            load,
            revision,
            record: previous?.load === load ? previous.record : null,
            error,
          }));
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [load, revision]);
  const current = outcome?.load === load ? outcome : null;
  return {
    record: current?.record ?? null,
    error: current?.revision === revision ? current.error : null,
    retry: () => setRevision((v) => v + 1),
  };
}
