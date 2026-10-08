import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { EvidenceBlock } from './model';
import {
  AsAtLine,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  Section,
  StaleNotice,
  Text,
  ViewOriginal,
  errorMessage,
  useAccessibilitySize,
  type InfoNotes,
} from '../../design/primitives';
import { colors, hairline, rhythm, type Accent } from '../../design/tokens';

/**
 * The foot of a record block: one quiet "Updated 4 Oct 2026" caption and a
 * small "View original" for the block's own records (one opens directly;
 * several open a menu). Saved-copy and partial notices follow. Dataset
 * names and licences are on Sources and licences, in About.
 */
export function EvidenceFooter({
  block,
  id,
  date = true,
  caption,
}: {
  block: EvidenceBlock<unknown>;
  id: string;
  date?: boolean;
  /** The block's own caption in place of its as-at line (the votes record). */
  caption?: ReactNode;
}) {
  // At accessibility sizes the caption and View original take a line each.
  const stacked = useAccessibilitySize();
  return (
    <Group gap={rhythm.line}>
      <View style={[styles.foot, stacked ? styles.footStacked : null]}>
        {caption ? (
          <View style={styles.caption}>{caption}</View>
        ) : date ? (
          <View style={styles.caption}>
            <AsAtLine
              asOf={block.asAt}
              citation={[...new Set(block.sources.map((s) => s.label))]}
              licence={[
                ...new Set(
                  block.sources.flatMap((s) => (s.licence ? [s.licence] : [])),
                ),
              ].join('; ')}
              savedAt={block.stale ? block.savedAt : null}
              testID={`${id}-as-at`}
            />
          </View>
        ) : (
          <View style={styles.caption} />
        )}
        <ViewOriginal sources={block.sources} testID={`${id}-source`} />
      </View>
      {block.partial ? <PartialNotice testID={`${id}-partial`} /> : null}
      {block.stale ? (
        <>
          {block.staleReason ? (
            <SavedCopyNotice reason={block.staleReason} />
          ) : null}
          {block.savedAt !== null ? (
            <StaleNotice savedAt={block.savedAt} />
          ) : (
            <Text wordSafe variant="fine">
              This is a saved copy. It may be out of date.
            </Text>
          )}
        </>
      ) : null}
    </Group>
  );
}
export function RecordBlock<T>({
  title,
  id,
  block,
  missing,
  partialMissing,
  unlinked,
  retry,
  children,
  date = true,
  accent,
  info,
  sub,
  caption,
}: {
  /** Replaces the footer's as-at line, beside View original. */
  caption?: ReactNode;
  /**
   * A block inside a section (one election, one Census year): a level 3
   * heading under a subtle rule ('ruled') or none for the first ('first').
   */
  sub?: 'ruled' | 'first';
  title: string;
  id: string;
  block: EvidenceBlock<T>;
  missing: string;
  partialMissing?: string;
  unlinked?: string;
  retry: () => void;
  children: (data: T) => ReactNode;
  date?: boolean;
  accent?: Accent;
  /** Methodology and caveats behind the heading's ⓘ, given the data. */
  info?: (data: T | null) => InfoNotes | null;
}) {
  const notes = info?.(block.data);
  const body = (
    <>
      {block.status === 'unlinked' ? (
        <EmptyState
          message={
            unlinked ??
            `This release does not link this person's ${title.toLowerCase()}. See the record on opax.com.au.`
          }
          testID={`${id}-unlinked`}
        />
      ) : block.status === 'error' ? (
        <ErrorState
          message={errorMessage(block.error)}
          onRetry={retry}
          testID={`${id}-error`}
        />
      ) : block.data === null ? (
        <EmptyState
          message={block.partial ? (partialMissing ?? missing) : missing}
          testID={`${id}-missing`}
        />
      ) : (
        children(block.data)
      )}
      <EvidenceFooter block={block} id={id} date={date} caption={caption} />
    </>
  );
  if (sub)
    return (
      <View
        testID={id}
        style={[styles.sub, sub === 'ruled' ? styles.subRuled : null]}
      >
        <Heading level={3} testID={`${id}-heading`}>
          {title}
        </Heading>
        {body}
      </View>
    );
  return (
    <Section
      testID={id}
      title={title}
      headingTestID={`${id}-heading`}
      accent={accent}
      info={notes ? { ...notes, testID: `${id}-info` } : undefined}
    >
      {body}
    </Section>
  );
}

const styles = StyleSheet.create({
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.block,
    rowGap: rhythm.line,
  },
  caption: { flexGrow: 1, flexShrink: 1 },
  footStacked: { flexDirection: 'column', alignItems: 'stretch' },
  sub: { gap: rhythm.tight },
  subRuled: {
    marginTop: rhythm.tight,
    paddingTop: rhythm.block,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
});
