import type { ReactNode } from 'react';
import type { Block } from '../api/catalogs';
import { ApiError } from '../api/errors';
import {
  AsAtLine,
  EmptyState,
  ErrorState,
  Group,
  LoadingState,
  OfflineBanner,
  SourceLink,
  StaleNotice,
  errorMessage,
} from '../design/primitives';

export function CatalogState<T>({
  block,
  empty,
  onRetry,
  testID,
  children,
  links = true,
  refreshing = false,
}: {
  block: Block<T> | null;
  empty: string;
  onRetry: () => void;
  testID: string;
  children: (data: T) => ReactNode;
  links?: boolean;
  refreshing?: boolean;
}) {
  if (!block)
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
      {block.stale ? (
        <>
          <OfflineBanner />
          {block.savedAt !== null ? (
            <StaleNotice
              savedAt={block.savedAt}
              refreshing={refreshing}
              testID={`${testID}-stale`}
            />
          ) : null}
        </>
      ) : null}
      {block.data === null ||
      (Array.isArray(block.data) && block.data.length === 0) ? (
        <EmptyState message={empty} testID={`${testID}-empty`} />
      ) : (
        children(block.data)
      )}
      <AsAtLine
        asOf={block.asAt}
        citation={block.sources.map((s) => s.label)}
        savedAt={block.stale ? block.savedAt : null}
        testID={`${testID}-as-at`}
      />
      {links
        ? block.sources
            .filter((s) => s.url.startsWith('https://'))
            .map((s, i) => (
              <SourceLink
                key={s.url}
                citation={s.label}
                url={s.url}
                kind="register"
                testID={`${testID}-source-${i}`}
              />
            ))
        : null}
    </Group>
  );
}
export function isOffline(error: unknown) {
  return (
    error instanceof ApiError && ['offline', 'timeout'].includes(error.code)
  );
}
