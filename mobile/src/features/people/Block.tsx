import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Section, type SectionAction } from '../../design/layout';
import { InlineError, Skeleton } from '../../design/states';
import type { SourceDetails } from '../../design/source';

import { rhythm } from '../../design/tokens';
import { BlockSource, type SourceOverrides } from '../your-mp/Evidence';
import type { EvidenceBlock } from '../your-mp/model';

/** A source sheet's title and notes. */
type InfoNotes = { title?: string; notes?: SourceDetails['notes'] };

/**
 * One profile or party block on the detail template (people.md 1.1, 1.4):
 * its skeleton in its final shape while loading, its content, then one
 * `SourceLine` (`${id}-source`). An empty or unlinked block collapses, except
 * where absence is news (`keepWhenEmpty`). A failed block draws one
 * `InlineError` with its own Try again; the rest of the page stays.
 */
export function ProfileBlock<T>({
  title,
  id,
  block,
  retry,
  errorSubject,
  keepWhenEmpty,
  skeleton = 'rows',
  about,
  line,
  citation,
  licenceDataset,
  originals,
  sourced = true,
  action,
  gloss,
  children,
}: {
  title: string;
  /** A glossary term id: the heading's plain line ("Explain terms"). */
  gloss?: string;
  id: string;
  block: EvidenceBlock<T>;
  retry: () => void;
  /** "Votes", "Declared interests": "{subject} couldn't be loaded." */
  errorSubject?: string;
  /** What the block says when a successful read holds nothing, if news. */
  keepWhenEmpty?: ReactNode;
  skeleton?: 'rows' | 'figure' | 'text';
  about?: (data: T | null) => InfoNotes | null | undefined;
  line?: (data: T | null) => SourceOverrides | undefined;
  citation?: SourceDetails['citation'];
  licenceDataset?: string;
  originals?: SourceDetails['originals'];
  /** False for a block of navigation rows only (no figure, no source). */
  sourced?: boolean;
  /** The section header's action ("See all"), drawn in every state. */
  action?: SectionAction;
  children: (data: T) => ReactNode;
}) {
  if (block.status === 'unlinked') return null;
  if (block.status === 'loading' && block.data === null)
    return (
      <Section
        title={title}
        gloss={gloss}
        action={action}
        testID={id}
        headingTestID={`${id}-heading`}
      >
        <Skeleton
          shape={skeleton === 'figure' ? 'figure' : skeleton}
          count={skeleton === 'figure' ? 1 : 3}
          label={`Loading ${title.toLowerCase()}`}
          testID={`${id}-loading`}
        />
      </Section>
    );
  if (block.status === 'error')
    return (
      <Section
        title={title}
        gloss={gloss}
        action={action}
        testID={id}
        headingTestID={`${id}-heading`}
      >
        <InlineError
          subject={errorSubject ?? title}
          onRetry={retry}
          testID={`${id}-error`}
        />
      </Section>
    );
  // Absence is said only after a read that holds nothing; a file not held
  // collapses like any other empty block.
  const empty = block.data === null;
  if (empty && (!keepWhenEmpty || block.status !== 'ready')) return null;
  const notes = about?.(block.data);
  return (
    <Section
      title={title}
      gloss={gloss}
      action={action}
      testID={id}
      headingTestID={`${id}-heading`}
    >
      <View style={{ gap: rhythm.block }}>
        {block.data === null ? keepWhenEmpty : children(block.data)}
        {sourced ? (
          <BlockSource
            block={block}
            title={notes?.title}
            notes={notes?.notes}
            citation={citation}
            licenceDataset={licenceDataset}
            originals={originals}
            line={line?.(block.data)}
            testID={`${id}-source`}
          />
        ) : null}
      </View>
    </Section>
  );
}
