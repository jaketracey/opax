import { counted } from '../../design/format';
import { Fragment, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useRead } from '../../api/useRead';
import {
  Button,
  ErrorState,
  Group,
  LoadingState,
  OfflineBanner,
  PadReading,
  SourceLine,
  Text,
  errorMessage,
  type SourceDetails,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { isOffline } from '../CatalogState';
import { RecordRow } from '../RecordRow';
import { citedParagraphs, type Source } from './model';
import { openRecord } from './open';

export const MODEL_NOTE =
  'Written by a model from the retrieved passages; not the record.';
/** A report's one machine label: what the model wrote, and what it did not. */
export const REPORT_MACHINE_NOTE =
  'A model wrote this report’s opening, its sections and the party positions from the retrieved passages, and chose its key figures from them; not the record. The speeches, counts and money beside them come from the record';
export const AEC_NOTE =
  'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.';
export const WORDS_NOTE =
  'What the industry disclosed to each party, beside that party’s share of the debate in the labelled record. Comparison, never causation; every number opens the disclosures or speeches behind it.';

export interface ReadMeta {
  asOf: string | null;
  savedAt: number | null;
}
/** What a block's source line says beyond its date: its sheet. */
export type ReadSource = Omit<SourceDetails, 'savedAt'> & { title?: string };

/**
 * A read's loading, error and saved-copy states, then its blocks. The blocks
 * end in one source line (date, source, saved state; notes and originals in
 * its sheet), unless `foot` is false because each block draws its own from
 * `meta`.
 */
export function ReadState<T>({
  read,
  citation,
  sheet,
  foot = true,
  children,
  testID,
}: {
  read: ReturnType<typeof useRead<T>>;
  citation: string | readonly string[];
  /** The source line's sheet: notes, originals, coverage, licence. */
  sheet?: ReadSource | ((data: T) => ReadSource);
  foot?: boolean;
  children: (data: T, meta: ReadMeta) => ReactNode;
  testID: string;
}) {
  if (!read.record)
    return read.error ? (
      <Group>
        {isOffline(read.error) ? <OfflineBanner cached={false} /> : null}
        <ErrorState
          message={errorMessage(read.error)}
          onRetry={read.retry}
          testID={`${testID}-error`}
        />
      </Group>
    ) : (
      <LoadingState
        label="Loading the public record"
        testID={`${testID}-loading`}
      />
    );
  const record = read.record;
  const meta: ReadMeta = {
    asOf: record.asOf,
    savedAt: record.stale ? record.savedAt : null,
  };
  const details =
    typeof sheet === 'function' ? sheet(record.data) : (sheet ?? {});
  return (
    <Group>
      {record.stale ? (
        <Group>
          <OfflineBanner cached />
          <Button label="Try again" onPress={read.retry} />
        </Group>
      ) : null}
      {children(record.data, meta)}
      {foot ? (
        <SourceLine
          asOf={meta.asOf}
          citation={citation}
          savedAt={meta.savedAt}
          {...details}
          testID={`${testID}-as-at`}
        />
      ) : null}
    </Group>
  );
}
export function Prose({
  value,
  sources,
  testID,
}: {
  value: string;
  sources: Source[];
  testID: string;
}) {
  return (
    <PadReading>
      <Group>
        <ProseBlocks
          paragraphs={citedParagraphs(value, sources)}
          sources={sources}
          testID={testID}
        />
      </Group>
    </PadReading>
  );
}
export function ShareBars({
  points,
  label,
  onSelect,
}: {
  points: { label: string; share: number; count?: number }[];
  label: string;
  onSelect?: (index: number) => void;
}) {
  const max = Math.max(...points.map((p) => p.share), Number.EPSILON);
  return (
    <View
      accessible={!onSelect}
      accessibilityLabel={`${label}: ${points.map((p) => `${p.label} ${(p.share * 100).toFixed(1)}%${p.count === undefined ? '' : `, ${counted(p.count, 'speech', 'speeches')}`}`).join('; ')}`}
      style={{ gap: rhythm.tight }}
    >
      <View
        style={{
          height: 48,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: rhythm.tight,
        }}
        aria-hidden
      >
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: colors.votesInk,
              height: Math.max(2, (p.share / max) * 48),
            }}
          />
        ))}
      </View>
      {points.map((p, i) =>
        onSelect ? (
          <RecordRow
            key={i}
            title={`${p.label}: ${(p.share * 100).toFixed(1)}%${p.count === undefined ? '' : ` · ${counted(p.count, 'speech', 'speeches')}`}`}
            onPress={() => onSelect(i)}
          />
        ) : (
          <Text key={i} wordSafe variant="secondary" accessible={false}>
            {p.label}: {(p.share * 100).toFixed(1)}%
            {p.count === undefined
              ? ''
              : ` · ${counted(p.count, 'speech', 'speeches')}`}
          </Text>
        ),
      )}
    </View>
  );
}
export const announce = (value: string) =>
  AccessibilityInfo.announceForAccessibility(value);

/**
 * Paragraphs with their citations inline, "[1]" in the link colour, as Ask
 * draws them; each opens its record. The block's records line gives every
 * citation a 44pt row too.
 */
function ProseBlocks({
  paragraphs,
  sources,
  testID,
}: {
  paragraphs: ReturnType<typeof citedParagraphs>;
  sources: Source[];
  testID: string;
}) {
  const cite = (n: number) => {
    const source = sources[n - 1];
    if (!source) return null;
    const title = source.title ?? `Citation ${n}`;
    return (
      <Text
        accessibilityRole="link"
        accessibilityLabel={`Citation ${n}: ${title}`}
        onPress={() => openRecord(`/doc/${source.slug}`, title)}
        tone="navy"
        testID={`${testID}-citation-${n}`}
      >
        {`[${n}]`}
      </Text>
    );
  };
  return (
    <Group>
      {paragraphs.map((p, i) => {
        // Markers the prose already carries stay where they are; the
        // remaining citations follow the paragraph.
        const inline = new Set(
          [...p.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
        );
        return (
          <Text key={i} wordSafe testID={`${testID}-paragraph-${i}`}>
            {p.text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((piece, j) => {
              const marker = /^\[(\d+)\]$/.exec(piece);
              if (marker && sources[Number(marker[1]) - 1])
                return <Fragment key={j}>{cite(Number(marker[1]))}</Fragment>;
              return piece.startsWith('**') ? (
                <Text key={j} variant="strong">
                  {piece.slice(2, -2)}
                </Text>
              ) : (
                piece
              );
            })}
            {p.citations
              .filter((n) => !inline.has(n))
              .map((n) => (
                <Fragment key={`c${n}`}> {cite(n)}</Fragment>
              ))}
          </Text>
        );
      })}
    </Group>
  );
}
