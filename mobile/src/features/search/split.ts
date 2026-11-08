import { createContext, useContext } from 'react';
import { encodeEntry, entryForRoute, type RecordEntry } from '../split/entry';

/**
 * iPad regular width: Search is a split, and a result row that is a record
 * the pane draws (a person, party, electorate, bill or record) opens there
 * instead of pushing. Null on iPhone and in a compact window.
 */
export interface SearchSplit {
  select: (entry: RecordEntry) => void;
  selectedKey: string | null;
}
export const SearchSplitContext = createContext<SearchSplit | null>(null);

type Route = { pathname: string; params?: Record<string, unknown> };

/** A row's `select` and `selected` in the split; empty elsewhere. */
export function useSplitRow(route: Route | null | undefined, title?: string) {
  const split = useContext(SearchSplitContext);
  const entry = split && route ? entryForRoute(route, title) : null;
  if (!split || !entry) return {};
  return {
    select: () => split.select(entry),
    selected: split.selectedKey === encodeEntry(entry),
  };
}
