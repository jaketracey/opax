import { PartialNotice, SavedCopyNotice } from './CatalogNotice';
import type { ReactNode } from 'react';
import type { Block } from '../api/catalogs';
import { ApiError } from '../api/errors';
import {
  EmptyState,
  ErrorState,
  Group,
  LoadingState,
  OfflineBanner,
  SourceLine,
  errorMessage,
} from '../design/primitives';

export function CatalogState<T>({
  block,
  empty,
  onRetry,
  testID,
  children,
  refreshing = false,
}: {
  block: Block<T> | null;
  empty: string;
  onRetry: () => void;
  testID: string;
  children: (data: T) => ReactNode;
  /**
   * No longer draws anything: dataset links and licences moved to Sources
   * and licences (About). Kept so existing callers need no change.
   */
  links?: boolean;
  refreshing?: boolean;
}) {
  if (!block || block.status === 'loading')
    return (
      <LoadingState
        label="Loading the public record"
        testID={`${testID}-loading`}
      />
    );
  if (block.status === 'error')
    return (
      <Group>
        {block.error?.code === 'offline' || block.error?.code === 'timeout' ? (
          <OfflineBanner cached={false} />
        ) : null}
        <ErrorState
          message={errorMessage(block.error)}
          onRetry={onRetry}
          testID={`${testID}-error`}
        />
      </Group>
    );
  return (
    <Group>
      {/* Why the copy is saved stays drawn; its date is the source line's
          saved state (pass 5). */}
      {block.stale ? <SavedCopyNotice reason={block.staleReason} /> : null}
      {block.partial ? <PartialNotice testID={`${testID}-partial`} /> : null}
      {block.data === null ||
      (Array.isArray(block.data) && block.data.length === 0) ? (
        <EmptyState message={empty} testID={`${testID}-empty`} />
      ) : (
        children(block.data)
      )}
      <SourceLine
        asOf={block.asAt}
        citation={[...new Set(block.sources.map((s) => s.label))]}
        savedAt={block.stale ? block.savedAt : null}
        state={block.partial && !block.stale ? 'partial' : null}
        notes={[
          refreshing ? 'Checking for a newer copy.' : null,
          block.partial ? 'Some rows in this export could not be read.' : null,
        ]}
        testID={`${testID}-as-at`}
      />
    </Group>
  );
}
export function isOffline(error: unknown) {
  return (
    error instanceof ApiError && ['offline', 'timeout'].includes(error.code)
  );
}
