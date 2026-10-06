import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Block } from '../../api/catalogs';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineBanner,
  StaleNotice,
  errorMessage,
} from '../../design/primitives';
import { spacing } from '../../design/tokens';
import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import { isOffline } from '../CatalogState';
import { TodayCard, UpdatedCaption } from './parts';

/**
 * A Today block in every state, as CatalogState draws it elsewhere, but
 * quiet: failures and empty blocks sit in a card, a saved copy says so above
 * its rows, and one caption says when the record was updated. Source names
 * and links live on the Sources and licences screen.
 */
export function TodayBlock<T>({
  block,
  empty,
  onRetry,
  testID,
  children,
  refreshing = false,
  placeholder = 'rows',
}: {
  block: Block<T> | null;
  empty: string;
  onRetry: () => void;
  testID: string;
  children: (data: T) => ReactNode;
  refreshing?: boolean;
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
      <TodayCard style={styles.inset}>
        {isOffline(block.error) ? <OfflineBanner cached={false} /> : null}
        <ErrorState
          message={errorMessage(block.error)}
          onRetry={onRetry}
          testID={`${testID}-error`}
        />
      </TodayCard>
    );
  const none =
    block.data === null ||
    (Array.isArray(block.data) && block.data.length === 0);
  return (
    <View style={styles.block}>
      {block.stale ? (
        <View style={styles.notices}>
          <SavedCopyNotice reason={block.staleReason} />
          {block.savedAt !== null ? (
            <StaleNotice
              savedAt={block.savedAt}
              refreshing={refreshing}
              testID={`${testID}-stale`}
            />
          ) : null}
        </View>
      ) : null}
      {block.partial ? <PartialNotice testID={`${testID}-partial`} /> : null}
      {none ? (
        <TodayCard style={styles.inset}>
          <EmptyState message={empty} testID={`${testID}-empty`} />
        </TodayCard>
      ) : (
        children(block.data as T)
      )}
      <UpdatedCaption
        asAt={block.asAt}
        savedAt={block.stale ? block.savedAt : null}
        testID={`${testID}-as-at`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.s3 },
  notices: { gap: spacing.s1 },
  inset: { padding: spacing.s4, gap: spacing.s4 },
});
