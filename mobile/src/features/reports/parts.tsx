import {
  PadReading,
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LinkRow,
  LoadingState,
  OfflineBanner,
  RowList,
  SourceLine,
  Text,
  errorMessage,
  type SourceDetails,
} from '../../design/primitives';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import type { RecordResult } from '../../api/client';
import { passageText } from '../../api/passage-text';
import { useReduceMotion } from '../../design/accessibility';
import { useKeyCommand } from '../../design/keyboard';
import {
  SheetBody,
  SourceAffordance,
  sourceLineParts,
} from '../../design/source';
import { colors, rhythm } from '../../design/tokens';
import { formatDate, savedText, type DateInput } from '../../design/format';
import { isOffline } from '../CatalogState';
import { RecordRow } from '../RecordRow';
import {
  citedParagraphs,
  ledeParagraphs,
  parliamentNames,
  type Source,
} from './model';
import { openRecord } from './open';
import { titleSubject } from '../records/citations';

export const MODEL_NOTE =
  'Written by a model from the retrieved passages; not the record.';
/** A report's one machine label: what the model wrote, and what it did not. */
export const REPORT_MACHINE_NOTE =
  'A model wrote this report’s opening, its sections and the party positions from the retrieved passages, and chose its key figures from them; not the record. The speeches, counts and money beside them come from the record';
export const AEC_NOTE =
  'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.';
export const WORDS_NOTE =
  "What the industry disclosed to each party, beside that party's share of the debate in the labelled record. Comparison, never causation; every number opens the disclosures or speeches behind it.";

// Unlike the catalog hook, this never revalidates on AppState or a timer.
export function useRead<T>(load: () => Promise<RecordResult<T>>) {
  const [outcome, setOutcome] = useState<{
    load: typeof load;
    revision: number;
    record: RecordResult<T> | null;
    error: unknown;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current;
    void load()
      .then((record) => {
        if (generation.current === id)
          setOutcome({ load, revision, record, error: null });
      })
      .catch((error) => {
        if (generation.current === id)
          setOutcome((previous) => ({
            load,
            revision,
            record: previous?.load === load ? previous.record : null,
            error,
          }));
      });
    return () => {
      generation.current += 1;
    };
  }, [load, revision]);
  const current = outcome?.load === load ? outcome : null;
  return {
    record: current?.record ?? null,
    error: current?.revision === revision ? current.error : null,
    retry: () => setRevision((v) => v + 1),
  };
}

/** A read's date and saved state, for the source lines of the blocks it feeds. */
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
export function SourceRows({
  sources,
  numbers,
  onOpen = openRecord,
  testID = 'report-source',
}: {
  sources: Source[];
  /** Citation numbers, as the prose cites them: "[3] Peter Costello". */
  numbers?: readonly number[];
  onOpen?: (path: string, title: string) => void;
  testID?: string;
}) {
  return (
    <Group>
      {sources.length ? (
        sources.map((s, i) => {
          const title = s.title ?? s.source_title ?? s.slug;
          // "Speaker — 1999-02-09" titles repeat the detail line: keep the
          // subject if there is one, else the speaker, and the date once below.
          const subject = titleSubject({
            title,
            speaker: s.speaker,
            date: s.date,
          });
          const bySpeaker = !subject && !!s.speaker;
          return (
            <Group key={`${s.slug}-${i}`} gap={6}>
              <RecordRow
                title={`${numbers?.[i] ? `[${numbers[i]}] ` : ''}${subject || s.speaker || title}`}
                path={`/doc/${s.slug}`}
                detail={[
                  bySpeaker ? null : s.speaker,
                  s.party,
                  s.state ? parliamentNames[s.state] : null,
                  s.date ? formatDate(s.date) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => onOpen(`/doc/${s.slug}`, title)}
                testID={`${testID}-${i}`}
              />
              {s.passage ? (
                <Text wordSafe variant="metadata">
                  {passageText(s.passage)}
                </Text>
              ) : null}
            </Group>
          );
        })
      ) : (
        <EmptyState message="No source records are available in this snapshot." />
      )}
    </Group>
  );
}
const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`;

/**
 * A block's one source line when its sources are records: "Updated 9 Sep
 * 2026 · Hansard · 4 records cited". It opens the records sheet: the cited
 * records numbered as the prose cites them, each with its passage, then what
 * was retrieved but not cited, the date and the notes. Records open in the
 * app's reader once the sheet has gone.
 */
export function RecordsLine({
  sources,
  asOf,
  savedAt,
  citation = 'Hansard',
  notes,
  title = 'Records',
  testID,
}: {
  sources: Source[];
  asOf?: DateInput | null;
  savedAt?: number | null;
  citation?: string;
  notes?: readonly (string | null | undefined | false)[];
  /** The sheet's title. */
  title?: string;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const flagged = sources.some((s) => s.cited === true);
  const cited = flagged
    ? sources.filter((s) => s.cited === true).length
    : sources.length;
  const coverage = flagged
    ? `${plural(cited, 'record')} cited${cited < sources.length ? `, ${sources.length - cited} more retrieved` : ''}`
    : plural(sources.length, 'record');
  const parts = sourceLineParts({ asOf, citation, coverage, savedAt });
  return (
    <>
      <SourceAffordance
        glyph="doc.text"
        date={parts.date}
        name={parts.name}
        rest={parts.rest}
        accessibilityLabel={[parts.date, parts.name, ...parts.rest]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Opens the records, notes and licence"
        onPress={() => setOpen(true)}
        testID={testID}
      />
      {open ? (
        <RecordsSheet
          title={title}
          sources={sources}
          asOf={asOf}
          savedAt={savedAt}
          citation={citation}
          notes={notes}
          onClose={() => setOpen(false)}
          testID={testID}
        />
      ) : null}
    </>
  );
}

function RecordsSheet({
  title,
  sources,
  asOf,
  savedAt,
  citation,
  notes,
  onClose,
  testID,
}: {
  title: string;
  sources: Source[];
  asOf?: DateInput | null;
  savedAt?: number | null;
  citation: string;
  notes?: readonly (string | null | undefined | false)[];
  onClose: () => void;
  testID: string;
}) {
  const reduced = useReduceMotion();
  // A record opens once the sheet has gone, so the reader never lands
  // behind it.
  const pending = useRef<(() => void) | null>(null);
  const after = (action: () => void) => {
    if (Platform.OS === 'ios') pending.current = action;
    onClose();
    if (Platform.OS !== 'ios') action();
  };
  const open = (path: string, name: string) =>
    after(() => openRecord(path, name));
  useKeyCommand('list-escape', onClose, true);
  const flagged = sources.some((s) => s.cited === true);
  const numbered = sources.map((s, i) => ({ s, n: i + 1 }));
  const cited = flagged ? numbered.filter((x) => x.s.cited === true) : numbered;
  const rest = flagged ? numbered.filter((x) => x.s.cited !== true) : [];
  const shownNotes = (notes ?? []).filter((n): n is string => !!n);
  const date = asOf == null ? '' : formatDate(asOf);
  return (
    <Modal
      visible
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
    >
      <SheetBody title={title} onClose={onClose} testID={`${testID}-sheet`}>
        <View style={styles.group}>
          <Heading level={3}>{flagged ? 'Cited' : 'Records'}</Heading>
          <SourceRows
            sources={cited.map((x) => x.s)}
            numbers={flagged ? cited.map((x) => x.n) : undefined}
            onOpen={open}
            testID={`${testID}-cited`}
          />
        </View>
        {rest.length ? (
          <View style={styles.group}>
            <Heading level={3}>
              {`Also retrieved, not cited (${rest.length})`}
            </Heading>
            <SourceRows
              sources={rest.map((x) => x.s)}
              onOpen={open}
              testID={`${testID}-retrieved`}
            />
          </View>
        ) : null}
        <View style={styles.group}>
          <Heading level={3}>As at</Heading>
          <Text wordSafe>{date ? `As at ${date}` : 'Date not published'}</Text>
          {savedAt != null ? (
            <Text wordSafe variant="metadata">
              {savedText(savedAt)}
            </Text>
          ) : null}
          <Text wordSafe variant="metadata">
            {citation}
          </Text>
        </View>
        {shownNotes.length ? (
          <View style={styles.notes}>
            <Heading level={3}>Notes</Heading>
            {shownNotes.map((note, i) => (
              <Text key={i} wordSafe>
                {note}
              </Text>
            ))}
          </View>
        ) : null}
        <RowList>
          <LinkRow
            title="Sources and licences"
            onPress={() => after(() => router.push('/account/sources'))}
            testID={`${testID}-licences`}
          />
        </RowList>
      </SheetBody>
    </Modal>
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
export function ReportLede({
  value,
  sources,
  testID,
}: {
  value: string;
  sources: Source[];
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  const paragraphs = ledeParagraphs(value, sources);
  return (
    <PadReading>
      <Group>
        <ProseBlocks
          paragraphs={paragraphs.slice(0, 2)}
          sources={sources}
          testID={testID}
        />
        {paragraphs.length > 2 ? (
          <Disclosure
            label={open ? 'Read less' : 'Read more'}
            open={open}
            onToggle={setOpen}
            testID={`${testID}-toggle`}
          >
            <ProseBlocks
              paragraphs={paragraphs.slice(2)}
              sources={sources}
              testID={`${testID}-more`}
            />
          </Disclosure>
        ) : null}
      </Group>
    </PadReading>
  );
}
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
        tone="bronzeInk"
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
export function ShareBars({
  points,
  label,
  onSelect,
  compact = false,
}: {
  points: { label: string; share: number; count?: number }[];
  label: string;
  onSelect?: (index: number) => void;
  compact?: boolean;
}) {
  const max = Math.max(...points.map((p) => p.share), Number.EPSILON);
  return (
    <View
      accessible={!onSelect}
      accessibilityLabel={`${label}: ${points.map((p) => `${p.label} ${(p.share * 100).toFixed(1)}%${p.count === undefined ? '' : `, ${p.count.toLocaleString()} speeches`}`).join('; ')}`}
      style={{ gap: rhythm.tight }}
    >
      <View
        style={{
          height: compact ? 24 : 48,
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
              height: Math.max(2, (p.share / max) * (compact ? 24 : 48)),
            }}
          />
        ))}
      </View>
      {compact
        ? null
        : points.map((p, i) =>
            onSelect ? (
              <RecordRow
                key={i}
                title={`${p.label}: ${(p.share * 100).toFixed(1)}%${p.count === undefined ? '' : ` · ${p.count.toLocaleString()} speeches`}`}
                onPress={() => onSelect(i)}
              />
            ) : (
              <Text key={i} wordSafe variant="metadata" accessible={false}>
                {p.label}: {(p.share * 100).toFixed(1)}%
                {p.count === undefined
                  ? ''
                  : ` · ${p.count.toLocaleString()} speeches`}
              </Text>
            ),
          )}
    </View>
  );
}
export const announce = (value: string) =>
  AccessibilityInfo.announceForAccessibility(value);

const styles = StyleSheet.create({
  group: { gap: rhythm.tight },
  notes: { gap: rhythm.block },
});
