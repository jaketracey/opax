import { SavedCopyNotice } from './CatalogNotice';
import { StyleSheet, View } from 'react-native';
import type { Block, EditionView } from '../api/catalogs';
import {
  ErrorState,
  LoadingState,
  OfflineBanner,
  StaleNotice,
  errorMessage,
} from '../design/primitives';
import { spacing } from '../design/tokens';
import { isOffline } from './CatalogState';
import { EditionHero } from './today/EditionHero';
import { Entrance, TodayCard, UpdatedCaption } from './today/parts';

/**
 * The newest published daily edition, frozen as it was posted, as Today's
 * hero. The text is the post's own, rendered as plain text, never markup; a
 * model's text carries its attribution before it. With no edition published
 * (404) the section is absent.
 */
export function EditionSection({
  block,
  onRetry,
  refreshing = false,
}: {
  block: Block<EditionView> | null;
  onRetry: () => void;
  refreshing?: boolean;
}) {
  if (block?.status === 'missing') return null;
  return (
    <View testID="today-edition" style={styles.section}>
      {!block ? (
        <TodayCard style={styles.placeholder}>
          <LoadingState
            shape="text"
            count={4}
            label="Loading the daily edition"
            testID="today-edition-loading"
          />
        </TodayCard>
      ) : block.status === 'error' || !block.data ? (
        <TodayCard style={styles.placeholder}>
          {isOffline(block.error) ? (
            <OfflineBanner cached={false} testID="today-edition-offline" />
          ) : null}
          <ErrorState
            message={errorMessage(block.error)}
            onRetry={onRetry}
            testID="today-edition-error"
          />
        </TodayCard>
      ) : (
        <Entrance>
          <EditionCard
            edition={block.data}
            stale={block.stale}
            staleReason={block.staleReason}
            savedAt={block.savedAt}
            refreshing={refreshing}
          />
        </Entrance>
      )}
    </View>
  );
}

export function EditionCard({
  edition,
  stale = false,
  savedAt = null,
  staleReason,
  refreshing = false,
}: {
  edition: EditionView;
  stale?: boolean;
  staleReason?: 'unreadable' | 'unavailable';
  savedAt?: number | null;
  refreshing?: boolean;
}) {
  return (
    <View style={styles.card}>
      {stale ? (
        <View style={styles.group}>
          <SavedCopyNotice
            reason={staleReason}
            testID={
              staleReason ? 'today-edition-saved-copy' : 'today-edition-offline'
            }
          />
          {savedAt !== null ? (
            <StaleNotice
              savedAt={savedAt}
              refreshing={refreshing}
              testID="today-edition-stale"
            />
          ) : null}
        </View>
      ) : null}
      <EditionHero edition={edition} />
      {stale && savedAt !== null ? (
        <UpdatedCaption
          asAt={edition.date}
          savedAt={savedAt}
          testID="today-edition-as-at"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.s3 },
  card: { gap: spacing.s3 },
  group: { gap: spacing.s1 },
  placeholder: { padding: spacing.s4, gap: spacing.s4 },
});
