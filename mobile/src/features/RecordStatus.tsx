import { PartialNotice, SavedCopyNotice } from './CatalogNotice';
import type { RecordResult } from '../api/client';
import { ApiError } from '../api/errors';
import {
  Button,
  ErrorState,
  Group,
  LoadingState,
  OfflineBanner,
  StaleNotice,
  errorMessage,
} from '../design/primitives';

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
        <SavedCopyNotice
          reason={record.staleReason}
          testID={`${testID}-${record.staleReason ? 'saved-copy' : 'offline'}`}
        />
        {record.partial ? <PartialNotice testID={`${testID}-partial`} /> : null}
        {record.savedAt !== null ? (
          <StaleNotice
            savedAt={record.savedAt}
            refreshing={refreshing}
            testID={`${testID}-stale`}
          />
        ) : null}
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
