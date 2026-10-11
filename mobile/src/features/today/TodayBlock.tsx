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
  type SourceDetails,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import { isOffline } from '../CatalogState';

/**
 * A Today feed in every state, as CatalogState draws it elsewhere, but
 * quiet and on the paper: no box around a failure or an empty feed. Once it
 * has loaded, its own source line closes it, with the feed's own date and
 * source ("Updated 17 Sep 2026 · ParlInfo bill records"); a saved copy says
 * so above its rows and in that line ("… · Saved 3 Oct 2026").
 */
export function TodayBlock<T>({
  block,
  empty,
  onRetry,
  testID,
  children,
  sources,
  sourceTitle,
  placeholder = 'rows',
}: {
  block: Block<T> | null;
  empty: string;
  onRetry: () => void;
  testID: string;
  children: (data: T) => ReactNode;
  /** The feed's source line: its date, sources, originals and note. */
  sources: (block: Block<T>) => SourceDetails;
  /** The source sheet's title: "About these bills". */
  sourceTitle: string;
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
      <SourceLine
        title={sourceTitle}
        {...sources(block)}
        testID={`${testID}-as-at`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.heading },
});
