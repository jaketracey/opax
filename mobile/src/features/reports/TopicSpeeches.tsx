import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { RecordResult } from '../../api/client';
import { passageText, serverPassage } from '../../api/passage-text';
import { PopUpButton } from '../../design/controls';
import { InsetGroup, Section } from '../../design/layout';
import { LinkRow, RecordRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Text, useAccessibilitySize } from '../../design/primitives';
import { copy } from '../../design/copy';
import { counted, formatCount } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { docRoute } from '../../navigation/routes/records';
import { resultsRoute } from '../../navigation/routes/search';
import { useSpeechSpeakers } from '../records/speaker';
import { FiltersLine } from '../search/FiltersLine';
import { PASSAGE_MAX, isWorkerSnippet, oneEllipsis } from '../search/Excerpt';
import { resultMeta, resultTitle } from '../search/present';
import { isOffline } from '../CatalogState';
import {
  partyName,
  topicFiltersLine,
  type DecadeBucket,
  type SpeechFilters,
  type decodeSpeeches,
} from './model';
import { announce } from './parts';
import { SPEECHES_CITATION } from './topic-copy';

type Speeches = ReturnType<typeof decodeSpeeches>;

type Order = 'newest' | 'oldest';
/** The arc read's window: the newest 200 speeches. */
export const SPEECH_WINDOW = 200;
/** Rows drawn at first, and appended each time the reader nears the end. */
export const SPEECH_PAGE = 30;
const PAGE = SPEECH_PAGE;

/** Newest or oldest first, undated speeches last. */
export function orderSpeeches(
  rows: Speeches['results'],
  order: Order,
): Speeches['results'] {
  return [...rows].sort((a, b) => {
    if (!a.date) return b.date ? 1 : 0;
    if (!b.date) return -1;
    const cmp = a.date.localeCompare(b.date);
    return order === 'oldest' ? cmp : -cmp;
  });
}

const excerpt = (
  snippet: string | null | undefined,
  resource?: string | null,
) => {
  if (!snippet) return null;
  const text = oneEllipsis(
    isWorkerSnippet(resource)
      ? serverPassage(snippet, { max: PASSAGE_MAX })
      : passageText(snippet, { max: PASSAGE_MAX }),
  );
  return text ? { text } : null;
};

/** VoiceOver or TalkBack on: null until known. */
function useScreenReader() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (value) => {
        if (active) setOn(value);
      },
    );
    void AccessibilityInfo.isScreenReaderEnabled().then(
      (value) => {
        if (active) setOn((known) => known ?? value);
      },
      () => undefined,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return on;
}

/**
 * "Speeches" (specs/search.md 5.2): the newest 200 labelled speeches the
 * page's filters choose, 30 drawn at first and the next 30 appended as the
 * reader nears the end (no pill: the rows are loaded), then "All speeches
 * on {topic}" in Search results with the same filters. With a screen
 * reader on every row is drawn, so swiping reaches them all. Filters are
 * the page's state; this section never pushes a route for them.
 */
export function TopicSpeeches({
  slug,
  title,
  phrase,
  read,
  filters,
  decades,
  onClear,
  visible,
  onVisible,
  onRowsEnd,
}: {
  slug: string;
  /** The topic's name, the results' query. */
  title: string;
  /** The topic in running text: "gambling". */
  phrase: string;
  read: {
    record: RecordResult<Speeches> | null;
    error: unknown;
    retry: () => void;
  };
  filters: SpeechFilters;
  decades: readonly DecadeBucket[];
  onClear: () => void;
  /**
   * How many rows are drawn: the page appends 30 as the reader nears the
   * end (the rows are loaded, so there is no pill).
   */
  visible: number;
  onVisible: (count: number) => void;
  /** Where the drawn rows end, from the top of this section. */
  onRowsEnd?: (bottom: number) => void;
}) {
  const speakerFor = useSpeechSpeakers();
  const [order, setOrder] = useState<Order>('newest');
  const stacked = useAccessibilitySize();
  const line = topicFiltersLine(filters, decades);
  const results = read.record?.data.results ?? [];
  const rows = orderSpeeches(results, order);
  const full = results.length >= SPEECH_WINDOW;
  const screenReader = useScreenReader();
  const drawn = screenReader ? rows.length : Math.min(visible, rows.length);
  return (
    <Section title="Speeches" testID="topic-speeches">
      {read.record ? (
        <View style={[styles.head, stacked ? styles.stacked : null]}>
          <Text wordSafe variant="strong" tabular testID="topic-speeches-count">
            {`${formatCount(results.length)}${full ? '+' : ''} ${results.length === 1 && !full ? 'speech' : 'speeches'}`}
          </Text>
          {rows.length > 1 ? (
            <PopUpButton
              label="Order"
              value={order}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
              ]}
              onChange={(value) => {
                setOrder(value);
                onVisible(PAGE);
                announce(value === 'newest' ? 'Newest first' : 'Oldest first');
              }}
              testID="topic-speeches-order"
            />
          ) : null}
        </View>
      ) : null}
      <FiltersLine
        text={line}
        onClear={onClear}
        testID="topic-filters-line"
        clearTestID="topic-filters-clear"
      />
      {!read.record ? (
        read.error ? (
          isOffline(read.error) ? (
            <ContentUnavailable
              symbol="wifi.slash"
              title={copy.notSaved}
              body={copy.notSavedBody}
              testID="topic-speeches-offline"
            />
          ) : (
            <ContentUnavailable
              symbol="exclamationmark.triangle"
              title="Speeches couldn’t be loaded"
              body="OPAX didn’t respond."
              action={{
                label: 'Try again',
                onPress: read.retry,
                testID: 'topic-speeches-retry',
              }}
              testID="topic-speeches-error"
            />
          )
        ) : (
          <Skeleton
            count={4}
            label="Loading speeches"
            testID="topic-speeches-loading"
          />
        )
      ) : rows.length ? (
        <>
          <View
            onLayout={(e) =>
              onRowsEnd?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
            }
          >
            <InsetGroup testID="topic-speeches-list">
              {rows.slice(0, drawn).map((s, i) => (
                <RecordRow
                  key={`${s.slug}-${i}`}
                  compact
                  meta={resultMeta({
                    kind: 'speech',
                    date: s.date,
                    state: s.state,
                  })}
                  title={resultTitle({ ...s, kind: 'speech' })}
                  excerpt={excerpt(s.snippet, s.resource)}
                  speaker={speakerFor({
                    ...s,
                    party: s.party ? partyName(s.party) : null,
                  })}
                  href={docRoute(s.slug)}
                  testID={`topic-speech-${i}`}
                />
              ))}
            </InsetGroup>
          </View>
          {full ? (
            <Text wordSafe variant="secondary" testID="topic-speeches-window">
              {`Showing the newest ${counted(SPEECH_WINDOW, 'speech', 'speeches')}.`}
            </Text>
          ) : null}
        </>
      ) : (
        <Text wordSafe variant="secondary" testID="topic-speeches-empty">
          {line
            ? 'No labelled speeches match these filters.'
            : `No speeches are labelled ${phrase} yet.`}
        </Text>
      )}
      {read.record ? (
        <SourceLine
          asOf={read.record.asOf}
          savedAt={read.record.stale ? read.record.savedAt : null}
          citation={SPEECHES_CITATION}
          title="About these speeches"
          notes={[
            `The newest ${formatCount(SPEECH_WINDOW)} labelled speeches the filters choose; Oldest first reorders those ${formatCount(SPEECH_WINDOW)}. Passages are from the record.`,
          ]}
          testID="topic-speeches-source"
        />
      ) : null}
      <InsetGroup>
        <LinkRow
          title={`All speeches on ${phrase}`}
          symbol="magnifyingglass"
          onPress={() =>
            router.push(
              resultsRoute('speeches', {
                topic: slug,
                q: title,
                from: filters.from,
                to: filters.to,
                state: filters.state,
                party: filters.party,
              }),
            )
          }
          testID="topic-speeches-more"
        />
      </InsetGroup>
    </Section>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
});
