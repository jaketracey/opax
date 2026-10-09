import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { votingMetaFor, type EvidenceBlock, type ProfileView } from './model';
import {
  EmptyState,
  ErrorState,
  Heading,
  Section,
  SourceLine,
  errorMessage,
  type InfoNotes,
  type SourceDetails,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { colors, hairline, rhythm, type Accent } from '../../design/tokens';

/** What a block's source line reads from: its date, sources and state. */
export type SourcedBlock = Pick<
  EvidenceBlock<unknown>,
  'asAt' | 'sources' | 'stale' | 'savedAt' | 'partial' | 'staleReason'
>;

/** What a block may say on its line in place of the block's own fields. */
export type SourceOverrides = Pick<
  SourceDetails,
  'asOf' | 'dateLabel' | 'coverage' | 'extra'
> & {
  /** The line's spoken words, where a journey reads a sentence. */
  accessibilityLabel?: string;
  /** The data says it is incomplete (a register with unread pages). */
  partial?: boolean;
};

/**
 * The voting record's line: "Updated 3 Oct 2026 · They Vote For You ·
 * Divisions to 25 Sep 2026", each jurisdiction's divisions named when a
 * member has several. Without `_meta` the date is said to be unpublished.
 */
export function votesSource(
  block: ProfileView['blocks']['votes'],
): SourceOverrides {
  const latest = votingMetaFor(block).latest_division_date_by_jurisdiction;
  const jurisdictions = block.data?.jurisdictions ?? [];
  const coverage = jurisdictions
    .map((j) => {
      const date = latest[j] ? formatDate(latest[j], 'short') : '';
      if (!date) return null;
      return jurisdictions.length > 1
        ? `${jurisdictionName(j) ?? 'Jurisdiction not recorded'} divisions to ${date}`
        : `Divisions to ${date}`;
    })
    .filter(Boolean)
    .join(' · ');
  return {
    coverage: coverage || null,
    ...(block.asAt ? {} : { dateLabel: 'Record date not published' }),
  };
}

const PARTIAL_NOTE = 'Some rows in this export could not be read.';
function staleNote(block: SourcedBlock): string {
  if (block.staleReason === 'unreadable')
    return 'The latest public export could not be read. Showing the saved copy.';
  if (block.staleReason === 'unavailable')
    return 'The latest public export could not be loaded. Showing the saved copy.';
  return 'This is a saved copy. It may be out of date.';
}

/**
 * Several blocks under one source line (a section's elections, the senators
 * of each jurisdiction): the newest date, every source once, and partial or
 * saved when any block is.
 */
export function combinedBlock(blocks: readonly SourcedBlock[]): SourcedBlock {
  const dates = blocks
    .map((b) => b.asAt)
    .filter((d): d is string => !!d)
    .sort();
  const saved = blocks
    .filter((b) => b.stale && b.savedAt !== null)
    .map((b) => b.savedAt!);
  return {
    asAt: dates.at(-1) ?? null,
    sources: blocks
      .flatMap((b) => b.sources)
      .filter(
        (s, i, all) =>
          all.findIndex((o) => o.url === s.url && o.label === s.label) === i,
      ),
    stale: blocks.some((b) => b.stale),
    savedAt: saved.length ? Math.min(...saved) : null,
    partial: blocks.some((b) => b.partial),
    staleReason: blocks.find((b) => b.staleReason)?.staleReason,
  };
}

/** A fetched record (topics, speeches, diaries) as a sourced block. */
export function recordBlock(
  record: Pick<
    RecordResult<unknown>,
    'asOf' | 'stale' | 'savedAt' | 'partial' | 'staleReason'
  >,
  sources: SourcedBlock['sources'] = [],
): SourcedBlock {
  return {
    asAt: record.asOf,
    sources,
    stale: record.stale,
    savedAt: record.savedAt,
    partial: record.partial,
    staleReason: record.staleReason,
  };
}

/**
 * The one source line at the foot of a record block: "Updated 4 Oct 2026 ·
 * OPAX electorate release", then "partial" or "Saved 3 Oct 2026" when the
 * block is. Tapping it opens the source sheet with the original records, the
 * as-at date, the notes and caveats in full (the methodology that sat behind
 * an ⓘ, the partial and saved-copy notices) and the licence. It replaces the
 * block's as-at line, "View original", ⓘ and notice paragraphs.
 */
export function BlockSource({
  block,
  testID,
  title = 'Sources and notes',
  citation,
  licence,
  notes = [],
  originals = [],
  line,
}: {
  block: SourcedBlock;
  testID?: string;
  /** The sheet's title: "About the voting record". */
  title?: string;
  /** Names the source where the block's own labels do not. */
  citation?: SourceDetails['citation'];
  /** The licence where the block's sources do not carry one. */
  licence?: string;
  notes?: InfoNotes['notes'];
  /** Original records beyond the block's own sources: one per division. */
  originals?: SourceDetails['originals'];
  /** What the line says in place of the block's own fields. */
  line?: SourceOverrides;
}) {
  const { accessibilityLabel, partial: incomplete, ...overrides } = line ?? {};
  const labels = [...new Set(block.sources.map((s) => s.label))];
  const licences = [
    ...new Set(block.sources.flatMap((s) => (s.licence ? [s.licence] : []))),
  ];
  const stale = block.stale;
  const partial = !!block.partial || !!incomplete;
  return (
    <SourceLine
      title={title}
      asOf={block.asAt}
      citation={citation ?? labels}
      licence={licences.join('; ') || licence || null}
      originals={[
        ...block.sources.map(({ label, url }) => ({ label, url })),
        ...originals,
      ]}
      notes={[
        ...notes,
        // An incomplete register says why in its own notes.
        block.partial ? PARTIAL_NOTE : null,
        stale ? staleNote(block) : null,
      ]}
      savedAt={stale ? block.savedAt : null}
      state={stale ? 'saved' : partial ? 'partial' : null}
      {...overrides}
      // A saved copy that is also partial says both.
      coverage={
        [overrides.coverage, stale && partial ? 'partial' : null]
          .filter(Boolean)
          .join(' · ') || null
      }
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}

/**
 * The foot of a record block: its one source line (`${id}-source`). Kept for
 * blocks drawn outside a RecordBlock (a seat's identity, a senators list).
 */
export function EvidenceFooter({
  block,
  id,
  about,
  line,
}: {
  block: SourcedBlock;
  id: string;
  /** The source sheet's title and notes: methodology and caveats. */
  about?: InfoNotes | null;
  line?: SourceOverrides;
}) {
  return (
    <BlockSource
      block={block}
      testID={`${id}-source`}
      title={about?.title}
      notes={about?.notes}
      line={line}
    />
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
  accent,
  about,
  line,
  sub,
  footer = true,
}: {
  /**
   * A block inside a section (one election, one Census year): a level 3
   * heading under a subtle rule ('ruled') or none for the first ('first');
   * 'bare' draws no heading, inside a section that already names it.
   */
  sub?: 'ruled' | 'first' | 'bare';
  title: string;
  id: string;
  block: EvidenceBlock<T>;
  missing: string;
  partialMissing?: string;
  unlinked?: string;
  retry: () => void;
  children: (data: T) => ReactNode;
  accent?: Accent;
  /** Methodology and caveats, given the data: the source sheet's notes. */
  about?: (data: T | null) => InfoNotes | null;
  /** What the source line says in place of the block's date. */
  line?: (data: T | null) => SourceOverrides | undefined;
  /** False where the section draws one line for several blocks. */
  footer?: boolean;
}) {
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
      {/* An unlinked block has nothing to date: the page links the record.
          Nor does an empty block without a date: its one plain sentence is
          the whole card, with no "Date not published" line under it. */}
      {footer &&
      block.status !== 'unlinked' &&
      !(block.data === null && !block.asAt) ? (
        <EvidenceFooter
          block={block}
          id={id}
          about={about?.(block.data)}
          line={line?.(block.data)}
        />
      ) : null}
    </>
  );
  if (sub === 'bare')
    return (
      <View testID={id} style={styles.sub}>
        {body}
      </View>
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
    >
      {body}
    </Section>
  );
}

const styles = StyleSheet.create({
  sub: { gap: rhythm.tight },
  subRuled: {
    marginTop: rhythm.tight,
    paddingTop: rhythm.block,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
  },
});
