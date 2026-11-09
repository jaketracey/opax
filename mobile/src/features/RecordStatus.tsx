import type { RecordResult } from '../api/client';
import { staleText } from '../design/format';
import { catalogStateNote, partialNote } from './CatalogNotice';

/**
 * A saved copy said once (pass 5): why the latest export is not shown and
 * when the copy was saved, in one sentence rather than a notice and a
 * separate date line. Offline, the banner says why.
 */
export function savedSentence(
  reason: RecordResult<unknown>['staleReason'],
  savedAt: number | null,
  refreshing = false,
) {
  return [
    reason === 'unreadable'
      ? 'The latest records could not be read. Showing the saved copy.'
      : reason === 'unavailable'
        ? 'The latest records could not be loaded. Showing the saved copy.'
        : null,
    savedAt !== null ? staleText(savedAt) : null,
    refreshing ? 'Checking for a newer copy.' : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** SourceLine adapter for screen lanes; keeps the existing plain-language notes. */
export function recordSourceState(
  record: {
    stale: boolean;
    savedAt: number | null;
    partial?: boolean;
    staleReason?: RecordResult<unknown>['staleReason'];
  } | null,
) {
  return {
    state: record?.partial && !record.stale ? ('partial' as const) : null,
    savedAt: record?.stale ? record.savedAt : null,
    note:
      [
        catalogStateNote(record?.staleReason),
        record?.partial ? partialNote : null,
      ]
        .filter(Boolean)
        .join(' ') || null,
  };
}
