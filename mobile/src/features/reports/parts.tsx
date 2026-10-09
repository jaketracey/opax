import {
  PadReading,
  AsAtLine,
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  MachineWritten,
  OfflineBanner,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import type { RecordResult } from '../../api/client';
import { passageText } from '../../api/passage-text';
import { colors, rhythm } from '../../design/tokens';
import { formatDate } from '../../design/format';
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

export function ReadState<T>({
  read,
  citation,
  children,
  testID,
}: {
  read: ReturnType<typeof useRead<T>>;
  citation: string;
  children: (data: T) => ReactNode;
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
  return (
    <Group>
      {read.record.stale ? (
        <Group>
          <OfflineBanner cached />
          <StaleNotice savedAt={read.record.savedAt} />
          <Button label="Try again" onPress={read.retry} />
        </Group>
      ) : null}
      {children(read.record.data)}
      <AsAtLine
        asOf={read.record.asOf}
        citation={citation}
        savedAt={read.record.stale ? read.record.savedAt : null}
        testID={`${testID}-as-at`}
      />
    </Group>
  );
}
export function SourceRows({
  sources,
  testID = 'report-source',
}: {
  sources: Source[];
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
                title={subject || s.speaker || title}
                path={`/doc/${s.slug}`}
                detail={[
                  bySpeaker ? null : s.speaker,
                  s.party,
                  s.state ? parliamentNames[s.state] : null,
                  s.date ? formatDate(s.date) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => openRecord(`/doc/${s.slug}`, title)}
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
export function SourcesFold({
  sources,
  label = 'Records',
  testID,
}: {
  sources: Source[];
  label?: string;
  testID: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const flagged = sources.some((s) => s.cited === true);
  const cited = flagged ? sources.filter((s) => s.cited === true) : sources;
  const rest = flagged ? sources.filter((s) => s.cited !== true) : [];
  const title = flagged
    ? `${label}: ${cited.length} cited, ${rest.length} more retrieved`
    : `${label} (${sources.length})`;
  return (
    <Group>
      <Disclosure
        label={title}
        open={expanded}
        onToggle={setExpanded}
        testID={testID}
      >
        <Group>
          <SourceRows sources={cited} testID={`${testID}-cited`} />
          {rest.length ? (
            <>
              <Heading
                level={3}
              >{`Also retrieved for this question, not cited in the answer (${rest.length})`}</Heading>
              <SourceRows sources={rest} testID={`${testID}-retrieved`} />
            </>
          ) : null}
        </Group>
      </Disclosure>
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
        <MachineWritten explanation={MODEL_NOTE} testID={`${testID}-machine`} />
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
        <MachineWritten explanation={MODEL_NOTE} testID={`${testID}-machine`} />
      </Group>
    </PadReading>
  );
}
function ProseBlocks({
  paragraphs,
  sources,
  testID,
}: {
  paragraphs: ReturnType<typeof citedParagraphs>;
  sources: Source[];
  testID: string;
}) {
  return (
    <Group>
      {paragraphs.map((p, i) => (
        <Group key={i} gap={6}>
          <Text wordSafe testID={`${testID}-paragraph-${i}`}>
            {p.text.split(/(\*\*[^*]+\*\*)/g).map((piece, j) =>
              piece.startsWith('**') ? (
                <Text key={j} variant="strong">
                  {piece.slice(2, -2)}
                </Text>
              ) : (
                piece
              ),
            )}
          </Text>
          {p.citations.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {p.citations.map((n) => (
                <Button
                  key={n}
                  label={`Citation ${n}`}
                  size="compact"
                  onPress={() =>
                    openRecord(
                      `/doc/${sources[n - 1]!.slug}`,
                      sources[n - 1]!.title ?? `Citation ${n}`,
                    )
                  }
                  testID={`${testID}-citation-${n}`}
                />
              ))}
            </View>
          ) : null}
        </Group>
      ))}
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
