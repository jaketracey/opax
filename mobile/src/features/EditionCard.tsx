import { SavedCopyNotice } from './CatalogNotice';
import { StyleSheet, View } from 'react-native';
import type { Block, EditionView } from '../api/catalogs';
import {
  ErrorState,
  LoadingState,
  OfflineBanner,
  SourceLine,
  errorMessage,
} from '../design/primitives';
import { rhythm } from '../design/tokens';
import { isOffline } from './CatalogState';
import { EditionHero } from './today/EditionHero';
import { Entrance } from './today/parts';

/**
 * The newest published daily edition, frozen as it was posted, as Today's
 * hero. The text is the post's own, rendered as plain text, never markup; a
 * model's text carries its label before it. With no edition published (404)
 * the section is absent. Loading and failure sit on the paper, not in a box.
 */
export function EditionSection({
  block,
  onRetry,
}: {
  block: Block<EditionView> | null;
  onRetry: () => void;
}) {
  if (block?.status === 'missing') return null;
  return (
    <View testID="today-edition" style={styles.section}>
      {!block ? (
        <LoadingState
          shape="text"
          count={4}
          label="Loading the daily edition"
          testID="today-edition-loading"
        />
      ) : block.status === 'error' || !block.data ? (
        <>
          {isOffline(block.error) ? (
            <OfflineBanner cached={false} testID="today-edition-offline" />
          ) : null}
          <ErrorState
            message={errorMessage(block.error)}
            onRetry={onRetry}
            testID="today-edition-error"
          />
        </>
      ) : (
        <Entrance>
          <EditionCard
            edition={block.data}
            stale={block.stale}
            staleReason={block.staleReason}
            savedAt={block.savedAt}
          />
        </Entrance>
      )}
    </View>
  );
}

/**
 * The edition, and when it is a saved copy, what was saved and when: the
 * notice above the card and the edition's own source line below it, in its
 * saved state. Otherwise the edition's sources are in Today's source line.
 */
export function EditionCard({
  edition,
  stale = false,
  savedAt = null,
  staleReason,
}: {
  edition: EditionView;
  stale?: boolean;
  staleReason?: 'unreadable' | 'unavailable';
  savedAt?: number | null;
}) {
  return (
    <View style={styles.card}>
      {stale ? (
        <SavedCopyNotice
          reason={staleReason}
          testID={
            staleReason ? 'today-edition-saved-copy' : 'today-edition-offline'
          }
        />
      ) : null}
      <EditionHero edition={edition} />
      {stale && savedAt !== null ? (
        <SourceLine
          title="About the daily edition"
          asOf={edition.date}
          citation="OPAX daily edition"
          savedAt={savedAt}
          originals={[
            {
              label: 'OPAX daily edition',
              url: edition.path,
              record: edition.title,
            },
          ]}
          notes={edition.sourceRows}
          testID="today-edition-as-at"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: rhythm.heading },
  card: { gap: rhythm.heading },
});
