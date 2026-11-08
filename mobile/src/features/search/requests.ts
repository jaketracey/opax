import { useCallback, useSyncExternalStore } from 'react';
import { catalogs, recordSearch } from '../../api/runtime';
import type { RecordResult } from '../../api/client';
import type { Roster } from '../../api/catalog-decoders';
import type { CatalogKind } from '../../api/policy';
import type { RecordsPage, SearchSummary } from './decoders';
import { defaultFilters, type SearchSort } from './contracts';
import { eligibleRecord, eligibleSummary } from './eligibility';
import { filtersKey, requestFilters, type SpeechFilters } from './filters';
import { groups, type CatalogGroup } from './scopes';

/**
 * Every paid search read goes through here (journeys/search.md 3.4, cost
 * guard 10): zero requests while typing; one request per explicit action
 * (a submit, choosing a scope not yet loaded, "Show 20 more", Try again,
 * Summarise, a tap-to-run group); never one on scroll. Reads are keyed by
 * query, filters, order and page. A key already loaded or in flight is
 * reused, so a scope switch, Back or a second view never spends twice, and
 * a response is drawn only by the view that still asks for its key.
 */
export type Read<T> =
  | { status: 'loading' }
  | { status: 'ready'; result: RecordResult<T> }
  | { status: 'error'; error: unknown };

type Entry = { read: Read<unknown>; promise: Promise<unknown> };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const MAX_ENTRIES = 96;

/** Runs `run` for `key` unless that key is loaded or already in flight. */
export function request<T>(
  key: string,
  run: () => Promise<RecordResult<T>>,
): Promise<unknown> {
  const existing = entries.get(key);
  if (existing && existing.read.status !== 'error') return existing.promise;
  const promise = run().then(
    (result) => {
      if (entries.get(key)?.promise === promise) {
        entries.set(key, { promise, read: { status: 'ready', result } });
        emit();
      }
    },
    (error: unknown) => {
      if (entries.get(key)?.promise === promise) {
        entries.set(key, { promise, read: { status: 'error', error } });
        emit();
      }
    },
  );
  entries.set(key, { promise, read: { status: 'loading' } });
  while (entries.size > MAX_ENTRIES)
    entries.delete(entries.keys().next().value!);
  emit();
  return promise;
}
export function readFor<T>(key: string | null): Read<T> | null {
  return key ? ((entries.get(key)?.read as Read<T> | undefined) ?? null) : null;
}
/** A read's state for `key`, re-rendered when it settles. */
export function useRead<T>(key: string | null): Read<T> | null {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const snapshot = () => readFor<T>(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Tests: forget every session read. */
export function resetSearchSession() {
  entries.clear();
  emit();
}

// Keys --------------------------------------------------------------------

export const speechKey = (
  q: string,
  f: SpeechFilters,
  page = 1,
  sort: SearchSort = 'relevance',
) => `speech|${q.trim()}|${filtersKey(f)}|${sort}|${page}`;
export const summaryKey = (q: string, f: SpeechFilters) =>
  `summary|${q.trim()}|${filtersKey(f)}`;
export const groupKey = (group: CatalogGroup, q: string, page = 1) =>
  `group|${group}|${q.trim()}|${page}`;

// Reads -------------------------------------------------------------------

/** One page of speeches (or every record type with Type "All records"). */
export function speechRequest(
  q: string,
  f: SpeechFilters,
  page = 1,
  sort: SearchSort = 'relevance',
) {
  return request(speechKey(q, f, page, sort), () =>
    recordSearch.search(q.trim(), requestFilters(f), page, sort),
  );
}

/**
 * The one function behind All's submit (decision 3 in journeys/search.md 9,
 * Option C): one ARAG request, the Speeches group's page 1. Declared
 * interests, Pay, Expenses and Money are tap-to-run rows, each one read when
 * chosen. Option A (`/api/search-all?kind=all&per=200`, once api/policy.ts
 * admits it) replaces only this function and the rows it feeds.
 */
export function allRequest(q: string, f: SpeechFilters) {
  return speechRequest(q, f, 1, 'relevance');
}
export const allRequestKeys = (q: string, f: SpeechFilters) => [
  speechKey(q, f, 1, 'relevance'),
];

type CatalogResult = Awaited<ReturnType<typeof catalogs.search>>;
export type GroupRow = {
  slug: string;
  kind: string;
  title: string;
  snippet: string;
  href: string;
  source?: string | null;
  url?: string | null;
  date?: string | null;
  personSlug?: string;
};
export type GroupPage = {
  results: GroupRow[];
  total: number;
  page: number;
  per_page: number;
  query: string;
  warnings: string[];
  coverage?: string | null;
};
/** One read of one list: a register through the catalogues, money direct. */
export function groupRequest(group: CatalogGroup, q: string, page = 1) {
  const kind = groups[group].catalog;
  return request<GroupPage>(groupKey(group, q, page), async () => {
    if (kind === 'interest' || kind === 'pay' || kind === 'expense') {
      const result: CatalogResult = await catalogs.search(
        q.trim(),
        kind as CatalogKind,
        page,
      );
      return result as unknown as RecordResult<GroupPage>;
    }
    const result = await recordSearch.search(
      q.trim(),
      { ...defaultFilters, kind, mode: 'keyword' },
      page,
    );
    return result as unknown as RecordResult<GroupPage>;
  });
}

/** Summarise these speeches: page 1 of the current filters, on its tap only. */
export function summaryRequest(
  q: string,
  f: SpeechFilters,
  roster: Roster | null,
) {
  return request<SearchSummary>(summaryKey(q, f), async () => {
    const result = await recordSearch.summary(q.trim(), requestFilters(f));
    if (roster && result.data.status === 'ready')
      eligibleSummary(result.data, roster);
    return result;
  });
}

/** Speech rows the app may show: roster speakers only (eligibility.ts). */
export function eligibleRows(page: RecordsPage, roster: Roster | null) {
  return roster
    ? page.results.filter((row) => eligibleRecord(row, roster))
    : null;
}
