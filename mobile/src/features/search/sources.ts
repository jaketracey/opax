import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { catalogs } from '../../api/runtime';
import type { Roster } from '../../api/catalog-decoders';
import { allTopics, type MatchSources } from './ranking';
import type { RowSources } from './rows';

type Loaded = Awaited<ReturnType<typeof catalogs.suggestionSources>>;
export type SearchSources = MatchSources &
  RowSources & {
    roster: Loaded['roster'];
    provenance: Loaded['provenance'];
  };

/**
 * The static files suggestions and All's on-device groups are matched
 * against (roster, electorates, bills, the people catalogue), read from the
 * app cache on focus. Typing never reads anything.
 */
export function useSearchSources() {
  const [sources, setSources] = useState<SearchSources | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const token = useRef(0);
  const load = useCallback((refresh = false) => {
    const mine = ++token.current;
    setFailed(false);
    setRefreshing(refresh);
    const read = refresh
      ? catalogs.suggestionSources(true)
      : catalogs.suggestionSourcesOnFocus();
    void read.then(
      (data) => {
        if (mine !== token.current) return;
        setRefreshing(false);
        setSources({
          roster: data.roster,
          electorates: data.electorates,
          bills: data.bills,
          people: data.people ?? null,
          topics: allTopics,
          provenance: data.provenance,
        });
      },
      () => {
        if (mine !== token.current) return;
        setRefreshing(false);
        setFailed(true);
      },
    );
  }, []);
  // Each focus asks again: the cache answers, and a session whose people
  // catalogue was missing gets its one identity recovery (catalogs.ts).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  return {
    sources,
    /** The roster as the record search's speaker filter reads it. */
    roster: (sources?.roster ?? null) as Roster | null,
    failed,
    /** A pull to refresh only; the first load draws no spinner. */
    refreshing,
    retry: () => load(true),
  };
}
