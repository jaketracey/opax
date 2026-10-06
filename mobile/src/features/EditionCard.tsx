import { SavedCopyNotice } from './CatalogNotice';
import { StyleSheet, View } from 'react-native';
import type { Block, EditionKind, EditionView } from '../api/catalogs';
import { formatDate } from '../design/format';
import {
  AsAtLine,
  ErrorState,
  LoadingState,
  OfflineBanner,
  OpaxWebLink,
  Section,
  StaleNotice,
  Text,
  errorMessage,
} from '../design/primitives';
import { spacing } from '../design/tokens';
import { webPageUrl } from '../navigation/external';
import { isOffline } from './CatalogState';

// Where each kind's link goes (portal/src/daily-post.ts URL builders), in
// the words of docs/IOS-UX.md 4.1 ("Read the report on opax.com.au").
const linkLabels: Record<EditionKind, string> = {
  politician: "Read the parliamentarian's record",
  bill: 'Read the bill',
  grant: 'Read the grant record',
  program: 'Read the grant program',
  largest: "Read the month's largest grants",
  topic: 'Read the report',
};

/**
 * The newest published daily edition, frozen as it was posted. The text is
 * the post's own, rendered as plain text, never markup; a model's text carries
 * its attribution before it. The page opens on the web through the link
 * guard. With no edition published (404) the section is absent.
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
    <Section title="Daily edition" testID="today-edition">
      {!block ? (
        <LoadingState
          shape="text"
          label="Loading the daily edition"
          testID="today-edition-loading"
        />
      ) : block.status === 'error' || !block.data ? (
        <View style={styles.card}>
          {isOffline(block.error) ? (
            <OfflineBanner cached={false} testID="today-edition-offline" />
          ) : null}
          <ErrorState
            message={errorMessage(block.error)}
            onRetry={onRetry}
            testID="today-edition-error"
          />
        </View>
      ) : (
        <EditionCard
          edition={block.data}
          stale={block.stale}
          staleReason={block.staleReason}
          savedAt={block.savedAt}
          refreshing={refreshing}
        />
      )}
    </Section>
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
  const kicker = `${edition.kindLabel} · ${formatDate(edition.date)}`;
  const linkLabel = linkLabels[edition.kind];
  return (
    <View style={styles.card} testID="today-edition-card">
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
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`Daily edition, ${edition.kindLabel}, ${formatDate(edition.date)}: ${edition.title}`}
        style={styles.group}
        testID="today-edition-head"
      >
        <Text variant="kicker" testID="today-edition-kicker">
          {kicker}
        </Text>
        <Text variant="subheading" wordSafe testID="today-edition-title">
          {edition.title}
        </Text>
      </View>
      {edition.machineWritten ? (
        <View
          accessible
          accessibilityLabel={`Machine-written. ${edition.machineWritten.attribution}`}
          style={styles.group}
          testID="today-edition-machine"
        >
          <Text variant="kicker">Machine-written</Text>
          <Text variant="fine" tone="ink">
            {edition.machineWritten.attribution}
          </Text>
        </View>
      ) : null}
      {edition.paragraphs.length ? (
        <View
          accessible
          accessibilityLabel={edition.paragraphs.join('\n')}
          style={styles.text}
          testID="today-edition-text"
        >
          {edition.paragraphs.map((paragraph, index) => (
            <Text key={index} variant="body">
              {paragraph}
            </Text>
          ))}
        </View>
      ) : null}
      {edition.sourceRows.length ? (
        <View
          accessible
          accessibilityLabel={`Sources and notes: ${edition.sourceRows.join('. ')}`}
          style={styles.group}
          testID="today-edition-sources"
        >
          <Text variant="kicker">Sources and notes</Text>
          {edition.sourceRows.map((row, index) => (
            <Text key={index} variant="fine" tone="ink">
              {row}
            </Text>
          ))}
        </View>
      ) : null}
      {webPageUrl(edition.path) !== null ? (
        <OpaxWebLink
          label={linkLabel}
          accessibilityLabel={`${linkLabel}: ${edition.title}`}
          path={edition.path}
          testID="today-edition-link"
        />
      ) : null}
      <AsAtLine
        asOf={edition.date}
        citation="OPAX daily edition"
        savedAt={stale ? savedAt : null}
        testID="today-edition-as-at"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.s4 },
  group: { gap: spacing.s1 },
  text: { gap: spacing.s3 },
});
