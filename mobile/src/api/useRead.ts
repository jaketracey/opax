import { useEffect, useRef, useState } from 'react';
import type { RecordResult } from './client';

// Unlike the catalog hook, this never revalidates on AppState or a timer.
export function useRead<T>(load: () => Promise<RecordResult<T>>) {
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
    void load()
      .then((record) => {
        if (generation.current === id)
          setOutcome({ load, revision, record, error: null });
      })
      .catch((error) => {
        if (generation.current === id)
          setOutcome((previous) => ({
            load,
            revision,
            record: previous?.load === load ? previous.record : null,
            error,
          }));
      });
    return () => {
      generation.current += 1;
    };
  }, [load, revision]);
  const current = outcome?.load === load ? outcome : null;
  return {
    record: current?.record ?? null,
    error: current?.revision === revision ? current.error : null,
    retry: () => setRevision((v) => v + 1),
  };
}
