import { PartialNotice } from './CatalogNotice';
import type { RecordResult } from '../api/client';
import { ApiError } from '../api/errors';
import {
  Button,
  ErrorState,
  Group,
  LoadingState,
  OfflineBanner,
  Text,
  errorMessage,
} from '../design/primitives';
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
      ? 'The latest public export could not be read. Showing the saved copy.'
      : reason === 'unavailable'
        ? 'The latest public export could not be loaded. Showing the saved copy.'
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
  refreshing,
  refresh,
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
  if (record?.stale)
    return (
      <Group>
        {record.staleReason ? null : (
          <OfflineBanner testID={`${testID}-offline`} />
        )}
        {record.staleReason || record.savedAt !== null ? (
          <Text
            wordSafe
            variant="fine"
            testID={`${testID}-${record.staleReason ? 'saved-copy' : 'stale'}`}
          >
            {savedSentence(record.staleReason, record.savedAt, refreshing)}
          </Text>
        ) : null}
        {record.partial ? <PartialNotice testID={`${testID}-partial`} /> : null}
        <Button
          label="Try again"
          onPress={refresh}
          loading={refreshing}
          testID={`${testID}-refresh`}
        />
      </Group>
    );
  if (record)
    return record.partial ? (
      <PartialNotice testID={`${testID}-partial`} />
    ) : null;
  if (error instanceof ApiError && ['offline', 'timeout'].includes(error.code))
    return (
      <Group>
        <OfflineBanner cached={false} testID={`${testID}-offline-uncached`} />
        <Button label="Try again" onPress={retry} testID={`${testID}-retry`} />
      </Group>
    );
  if (error)
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={retry}
        testID={`${testID}-error`}
      />
    );
  return <LoadingState label={label} testID={`${testID}-loading`} />;
}
