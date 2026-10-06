import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import type { ReactNode } from 'react';
import type { EvidenceBlock } from './model';
import {
  AsAtLine,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  OpaxWebLink,
  Section,
  SourceLink,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
export function EvidenceFooter({
  block,
  id,
  date = true,
}: {
  block: EvidenceBlock<unknown>;
  id: string;
  date?: boolean;
}) {
  return (
    <Group gap={8}>
      {date && block.asAt && /^\d{4}$/.test(block.asAt) ? (
        <Text wordSafe variant="fine" testID={`${id}-as-at`}>
          As at {block.asAt} · Source:{' '}
          {block.sources
            .map((s) => [s.label, s.licence].filter(Boolean).join(', '))
            .join('; ')}
        </Text>
      ) : date ? (
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
      ) : null}
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
      {block.sources.length ? (
        block.sources.map((s, i) =>
          s.url.startsWith('/') ? (
            <OpaxWebLink
              key={`${s.url}-${i}`}
              label={s.label}
              path={s.url}
              testID={i === 0 ? `${id}-source` : undefined}
            />
          ) : (
            <SourceLink
              key={`${s.url}-${i}`}
              citation={s.label}
              url={s.url}
              kind="record"
              testID={i === 0 ? `${id}-source` : undefined}
            />
          ),
        )
      ) : (
        <Text wordSafe variant="fine">
          No source link is held for this block.
        </Text>
      )}
    </Group>
  );
}
export function RecordBlock<T>({
  title,
  id,
  block,
  missing,
  unlinked,
  retry,
  children,
  date = true,
}: {
  title: string;
  id: string;
  block: EvidenceBlock<T>;
  missing: string;
  unlinked?: string;
  retry: () => void;
  children: (data: T) => ReactNode;
  date?: boolean;
}) {
  return (
    <Section testID={id}>
      <Heading level={2} testID={`${id}-heading`}>
        {title}
      </Heading>
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
          message={
            block.partial
              ? 'This record could not be read in the latest public export.'
              : missing
          }
          testID={`${id}-missing`}
        />
      ) : (
        children(block.data)
      )}
      <EvidenceFooter block={block} id={id} date={date} />
    </Section>
  );
}
