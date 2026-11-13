import { useEffect, useState } from 'react';
import { apiClient } from '../../../api/runtime';
import {
  decodeMoneyGraph,
  moneyCatalogs,
  type MoneyGraph,
} from '../../money/data';
import { loadedMoneyGraph, rememberMoneyGraph } from '../../money/lookup';
import { isDonorQuestion } from '../quiz-links';
import type { Question } from '../quiz-model';

/**
 * The federal money graph a donor round's link is matched on. Only a donor
 * round's reveal loads it (from the saved copy when there is one); every
 * other round, and a load that fails, gets null and so no donor row.
 */
export function useQuizMoneyGraph(q: Question): MoneyGraph | null {
  const donor = isDonorQuestion(q);
  const [fetched, setFetched] = useState<MoneyGraph | null>(null);
  useEffect(() => {
    if (!donor || loadedMoneyGraph('federal')) return;
    let active = true;
    const controller = new AbortController();
    Promise.resolve()
      .then(() =>
        apiClient.get(moneyCatalogs.federal.path, decodeMoneyGraph, false, {
          signal: controller.signal,
        }),
      )
      .then(
        (record) => {
          if (!active || !record?.data) return;
          rememberMoneyGraph('federal', record.data);
          setFetched(record.data);
        },
        () => {
          /* No graph, no donor row: never a link that opens "not found". */
        },
      );
    return () => {
      active = false;
      controller.abort();
    };
  }, [donor]);
  return donor ? (loadedMoneyGraph('federal') ?? fetched) : null;
}
