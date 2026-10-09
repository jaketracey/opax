import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Block } from '../../api/catalogs';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineBanner,
  SourceLine,
  errorMessage,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import { isOffline } from '../CatalogState';

/**
 * A Today feed in every state, as CatalogState draws it elsewhere, but
 * quiet and on the paper: no box around a failure or an empty feed. Its
 * date and source are in Today's one source line at the foot. A saved copy
 * says so above its rows and carries its own source line in the saved state
 * ("Updated 4 Oct · ParlInfo bill records · Saved 3 Oct").
 */
export function TodayBlock<T>({
  block,
  empty,
  onRetry,
  testID,
  children,
  placeholder = 'rows',
}: {
  block: Block<T> | null;
  empty: string;
  onRetry: () => void;
  testID: string;
  children: (data: T) => ReactNode;
  placeholder?: 'rows' | 'people';
}) {
  if (!block || block.status === 'loading')
    return (
      <LoadingState
        shape={placeholder}
        label="Loading the public record"
        testID={`${testID}-loading`}
      />
    );
  if (block.status === 'error')
    return (
      <View style={styles.block}>
        {isOffline(block.error) ? <OfflineBanner cached={false} /> : null}
        <ErrorState
          message={errorMessage(block.error)}
          onRetry={onRetry}
          testID={`${testID}-error`}
        />
      </View>
    );
  const none =
    block.data === null ||
    (Array.isArray(block.data) && block.data.length === 0);
  return (
    <View style={styles.block}>
      {block.stale ? <SavedCopyNotice reason={block.staleReason} /> : null}
      {block.partial ? <PartialNotice testID={`${testID}-partial`} /> : null}
      {none ? (
        <EmptyState message={empty} testID={`${testID}-empty`} />
      ) : (
        children(block.data as T)
      )}
      {block.stale && block.savedAt !== null ? (
        <SourceLine
          asOf={block.asAt}
          citation={[...new Set(block.sources.map((source) => source.label))]}
          savedAt={block.savedAt}
          originals={block.sources}
          testID={`${testID}-as-at`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.heading },
});
