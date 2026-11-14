import { useSyncExternalStore } from 'react';
import { decodeEntities } from '../../api/passage-text';
import type { Roster } from '../../api/catalog-decoders';
import type { RecordResult } from '../../api/client';
import type { SourceDetails } from '../../design/primitives';
import type { RecordsPage, SearchRecord } from './decoders';
import type { SearchSort } from './contracts';
import { countLabel, savedCopy } from './present';
import {
  eligibleRows,
  readFor,
  speechKey,
  speechRequest,
  useRead,
  type Read,
} from './requests';
import { filtersKey, type SpeechFilters } from './filters';

/** Speeches in the order the reader chose; Sort is a ⋯ submenu. */
export const speechSorts = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
] as const satisfies readonly { value: SearchSort; label: string }[];
export type SpeechSort = (typeof speechSorts)[number]['value'];

export const SPEECH_RULE =
  'Most relevant first; Newest and Oldest sort by the record’s date.';
export const SEARCH_NOTES = [
  'Not every speech is labelled with a topic yet.',
  'Some parliaments are not searchable yet: Tasmania, Western Australia and the Northern Territory.',
];

// How many pages a list shows, per query, filters and order, for the
// session: Back and a scope switch come back to the same length.
const shown = new Map<string, number>();
const listeners = new Set<() => void>();
const listKey = (q: string, f: SpeechFilters, sort: SearchSort) =>
  `${q.trim()}|${filtersKey(f)}|${sort}`;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface SpeechList {
  first: Read<RecordsPage> | null;
  rows: SearchRecord[] | null;
  total: number;
  more: boolean;
  /** Source records on the next page, before eligibility filtering. */
  nextCount: number;
  /** The last page's read while it loads or after it failed. */
  next: Read<RecordsPage> | null;
  pages: number;
  source: SourceDetails | null;
  count: string | null;
  /** Page 1: runs the read when it is not loaded (an explicit action). */
  load: () => void;
  /** "Show 20 more speeches": one request per tap, never on scroll. */
  loadMore: () => void;
  retry: () => void;
}

const noun = (f: SpeechFilters) =>
  f.kind !== 'speech'
    ? (['record', 'records'] as const)
    : (['speech', 'speeches'] as const);

/** Who holds the records on a page, each with its newest record's date. */
export function resultSources(rows: readonly SearchRecord[]) {
  const newest = new Map<string, string | null>();
  for (const r of rows) {
    const named = r.source && !/automated summary/i.test(r.source);
    const label = named
      ? r.source!
      : r.kind === 'speech'
        ? 'Hansard'
        : 'Parliament';
    const date = /^\d{4}-\d{2}-\d{2}/.test(r.date ?? '')
      ? r.date!.slice(0, 10)
      : null;
    const seen = newest.get(label);
    newest.set(
      label,
      seen && (!date || seen > date) ? seen : (date ?? seen ?? null),
    );
  }
  if (!newest.size) return [{ label: 'Hansard' }];
  return [...newest].map(([label, asOf]) => ({ label, asOf }));
}

export function speechSource(
  result: RecordResult<RecordsPage>,
  rows: readonly SearchRecord[],
  rule: string,
): SourceDetails {
  const saved = savedCopy(result.stale, result.staleReason);
  return {
    asOf: result.asOf,
    citation: resultSources(rows),
    savedAt: result.stale ? result.savedAt : null,
    state: result.partial ? 'partial' : saved.state,
    rule,
    originals: rows.flatMap((row) =>
      row.url
        ? [
            {
              label: row.source || 'Hansard',
              url: row.url,
              record: decodeEntities(row.title),
            },
          ]
        : [],
    ),
    notes: [
      ...SEARCH_NOTES,
      result.partial ? 'Some records could not be read.' : null,
      saved.note,
    ],
  };
}

function uniqueBySlug(rows: SearchRecord[]): SearchRecord[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.slug) && !!seen.add(row.slug));
}

export function useSpeechList(
  q: string,
  f: SpeechFilters,
  sort: SpeechSort,
  roster: Roster | null,
  rule: string,
): SpeechList {
  const key = listKey(q, f, sort);
  const pages = useSyncExternalStore(
    subscribe,
    () => shown.get(key) ?? 1,
    () => shown.get(key) ?? 1,
  );
  const first = useRead<RecordsPage>(speechKey(q, f, 1, sort));
  const last = useRead<RecordsPage>(speechKey(q, f, pages, sort));
  const reads: Read<RecordsPage>[] = [];
  for (let page = 1; page <= pages; page++) {
    const read = readFor<RecordsPage>(speechKey(q, f, page, sort));
    if (read?.status !== 'ready') break;
    reads.push(read);
  }
  const results = reads.flatMap((read) =>
    read.status === 'ready' ? [read.result] : [],
  );
  // Ranked pages can overlap when the index shifts between reads: a record
  // already shown on an earlier page is not drawn twice.
  const rows = results.length
    ? roster
      ? uniqueBySlug(
          results.flatMap((result) => eligibleRows(result.data, roster) ?? []),
        )
      : null
    : null;
  const lastResult = results.at(-1);
  const total = results[0]?.data.total ?? 0;
  const more =
    !!lastResult &&
    lastResult.data.page < lastResult.data.page_count &&
    pages === results.length;
  return {
    first,
    rows,
    total,
    more,
    nextCount: lastResult
      ? Math.max(
          0,
          Math.min(
            lastResult.data.per_page,
            lastResult.data.total -
              lastResult.data.page * lastResult.data.per_page,
          ),
        )
      : 0,
    pages,
    next: pages > 1 ? last : null,
    count: results[0]
      ? countLabel(total, noun(f), results[0].data.truncated)
      : null,
    source: results[0] && rows ? speechSource(results[0], rows, rule) : null,
    load: () => {
      if (q.trim()) void speechRequest(q, f, 1, sort);
    },
    loadMore: () => {
      if (!more) return;
      shown.set(key, pages + 1);
      listeners.forEach((listener) => listener());
      void speechRequest(q, f, pages + 1, sort);
    },
    retry: () => {
      void speechRequest(
        q,
        f,
        pages > 1 && last?.status === 'error' ? pages : 1,
        sort,
      );
    },
  };
}
/** Tests: forget how far each list was paged. */
export function resetShownPages() {
  shown.clear();
}
