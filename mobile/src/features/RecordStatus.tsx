import { catalogStateNote, partialNote } from './CatalogNotice';
import type { RecordResult } from '../api/client';
import { ApiError } from '../api/errors';
import {
  ContentUnavailable,
  LoadingState,
  OfflineLine,
  errorMessage,
} from '../design/states';
import { copy } from '../design/copy';
import { symbols } from '../design/symbols';
import { staleText } from '../design/format';

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

/**
 * The state of one whole-screen catalog read (useCatalogRecord): loading,
 * a first load that failed (offline or not), or a saved copy shown stale.
 * Renders nothing when a fresh record is on screen.
 */
export function RecordStatus({
  record,
  error,
  refreshing: _refreshing,
  refresh: _refresh,
  retry,
  label,
  testID,
}: {
  record: {
    stale: boolean;
    savedAt: number | null;
    partial?: boolean;
    staleReason?: RecordResult<unknown>['staleReason'];
  } | null;
  error: unknown;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
  /** What VoiceOver announces while loading: "Loading the leads". */
  label: string;
  testID: string;
}) {
  if (record)
    return record.stale && !record.staleReason ? (
      <OfflineLine savedAt={record.savedAt} testID={`${testID}-offline`} />
    ) : null;
  if (error instanceof ApiError && ['offline', 'timeout'].includes(error.code))
    return (
      <ContentUnavailable
        symbol={symbols.offline}
        title={copy.notSaved}
        body={copy.notSavedBody}
        action={{
          label: copy.tryAgain,
          onPress: retry,
          testID: `${testID}-retry`,
        }}
        testID={`${testID}-offline-uncached`}
      />
    );
  if (error)
    return (
      <ContentUnavailable
        symbol={symbols.error}
        title={errorMessage(error)}
        action={{ label: copy.tryAgain, onPress: retry }}
        testID={`${testID}-error`}
      />
    );
  return <LoadingState label={label} testID={`${testID}-loading`} />;
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
