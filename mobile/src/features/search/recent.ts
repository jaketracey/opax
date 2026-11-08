import { useSyncExternalStore } from 'react';
import { TwoSlotStore } from '../../storage/two-slot';
import { fold } from './ranking';
import { isScope, type Scope } from './scopes';

/**
 * Recent searches (journeys/search.md 3.2): submitted queries, newest
 * first, kept on this device only, never sent and never synced. Queries
 * that arrived by link never enter. A storage failure simply hides the
 * group (`failed`), and the search itself keeps working.
 */
export interface RecentSearch {
  q: string;
  scope: Scope;
  at: number;
}
export const RECENT_SHOWN = 8;
const RECENT_KEPT = 10;
type State = { ready: boolean; failed: boolean; items: RecentSearch[] };

function decode(raw: unknown): RecentSearch[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  return items
    .filter(
      (item): item is RecentSearch =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as RecentSearch).q === 'string' &&
        !!(item as RecentSearch).q.trim() &&
        isScope((item as RecentSearch).scope) &&
        typeof (item as RecentSearch).at === 'number',
    )
    .slice(0, RECENT_KEPT);
}

export function createRecentStore(
  disk: Pick<TwoSlotStore<RecentSearch[]>, 'read' | 'save'> = new TwoSlotStore(
    ['search-recent-v1-a.json', 'search-recent-v1-b.json'],
    decode,
    (items) => ({ version: 1, items }),
  ),
  now = () => Date.now(),
) {
  let state: State = { ready: false, failed: false, items: [] };
  const listeners = new Set<() => void>();
  let loading: Promise<void> | null = null;
  const emit = (next: State) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const load = () =>
    (loading ??= disk
      .read()
      .then((items) =>
        emit({
          ready: true,
          failed: false,
          // Anything added before the read finished stays on top.
          items: merge(state.items, items ?? []),
        }),
      )
      .catch(() => emit({ ready: true, failed: true, items: state.items })));
  const merge = (first: RecentSearch[], rest: RecentSearch[]) => {
    const seen = new Set<string>();
    return [...first, ...rest]
      .filter((item) => {
        const key = fold(item.q);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, RECENT_KEPT);
  };
  const write = (items: RecentSearch[]) => {
    emit({ ...state, items });
    void load().then(() =>
      disk.save(state.items).catch(() => emit({ ...state, failed: true })),
    );
  };
  return {
    load,
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** A submitted query moves to the top; a link query never arrives here. */
    add(q: string, scope: Scope) {
      const text = q.trim();
      if (!text) return;
      write(merge([{ q: text, scope, at: now() }], state.items));
    },
    /** Changing scope while a query's results show updates its entry. */
    setScope(q: string, scope: Scope) {
      const key = fold(q);
      if (!state.items.some((item) => fold(item.q) === key)) return;
      write(
        state.items.map((item) =>
          fold(item.q) === key ? { ...item, scope } : item,
        ),
      );
    },
    remove(q: string) {
      const key = fold(q);
      write(state.items.filter((item) => fold(item.q) !== key));
    },
    clear() {
      write([]);
    },
  };
}
export type RecentStore = ReturnType<typeof createRecentStore>;
export const recentSearches = createRecentStore();

export function useRecentSearches(store: RecentStore = recentSearches) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  if (!state.ready && !state.failed) void store.load();
  return {
    items: state.failed ? [] : state.items.slice(0, RECENT_SHOWN),
    failed: state.failed,
  };
}
