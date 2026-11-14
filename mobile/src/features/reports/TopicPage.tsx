import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  Platform,
  RefreshControl,
  View,
  useWindowDimensions,
  type ScrollView,
} from 'react-native';
import { reports } from '../../api/runtime';
import { useRead } from '../../api/useRead';
import { useReduceMotion } from '../../design/accessibility';
import { copy } from '../../design/copy';
import { formatCount } from '../../design/format';
import { Screen } from '../../design/layout';
import { FigureBlock } from '../../design/record';
import type { RowMenuAction } from '../../design/row-link';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { headerItems, pageItems } from '../../navigation/chrome';
import { openOnWeb } from '../../navigation/external';
import { topicsRoute } from '../../navigation/routes';
import { copyRecordLink, shareRecord } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOpenAsk } from '../ask/open';
import { isOffline } from '../CatalogState';
import { topicLabel } from '../search/ranking';
import {
  chosenDecade,
  defaultDecades,
  normaliseTopicFilters,
  topicDescriptions,
  topicNames,
  topicPhrase,
  type DecadeBucket,
  type SpeechFilters,
} from './model';
import { type ReadMeta } from './parts';
import { LABEL_NOTE, TOPIC_CITATION } from './topic-copy';
import { TopicMoney, hasTopicMoney } from './TopicMoney';
import { SPEECH_PAGE, TopicSpeeches } from './TopicSpeeches';
import { TopicTide } from './TopicTide';
import { TopicWho } from './TopicWho';

type Params = {
  slug?: string;
  party?: string;
  state?: string;
  from?: string;
  to?: string;
  debate?: string;
};
const filterKeys = ['party', 'state', 'from', 'to', 'debate'] as const;

/** The question the ⋯ menu drafts in Ask; it is never submitted on arrival. */
export const topicQuestion = (slug: string) =>
  `What has parliament said about ${topicPhrase(slug)} this year?`;

/** The public page, with the filters a shared link keeps. */
export function topicWebPath(slug: string, filters: SpeechFilters = {}) {
  const params = new URLSearchParams();
  for (const key of filterKeys) if (filters[key]) params.set(key, filters[key]);
  return `/subject/topic/${slug}${params.size ? `?${params}` : ''}`;
}

/**
 * `/topic/[slug]` (specs/search.md 5): the count, the decades, who speaks,
 * donations beside the debate where an industry pairs with it, and the
 * speeches. Keyed on the slug only: filters are page state, kept in the
 * route's params with setParams so a filter never pushes a screen.
 */
export default function TopicPage() {
  const params = useLocalSearchParams<Params>();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  if (!topicNames[slug]) return <UnknownTopic />;
  return <TopicContent key={slug} slug={slug} params={params} />;
}

/** The shared not-found pattern (sweep 2, item 2), with Browse topics. */
function UnknownTopic() {
  return (
    <>
      <RouteOptions stableItems options={{ title: '' }} />
      <Screen testID="topic-screen" centred>
        <ContentUnavailable
          symbol={symbols.topic}
          title="This topic isn’t in OPAX"
          body="Topics come from the labels on speeches."
          action={{
            label: 'Browse topics',
            onPress: () => router.navigate(topicsRoute),
            testID: 'topic-unknown-browse',
          }}
          testID="topic-unknown"
        />
      </Screen>
    </>
  );
}

const metaOf = (record: {
  asOf: string | null;
  stale: boolean;
  savedAt: number | null;
}): ReadMeta => ({
  asOf: record.asOf,
  savedAt: record.stale ? record.savedAt : null,
});

/**
 * The topic's count: a figure, dated and sourced (specs/search.md 5.2
 * item 2). Labelling is incomplete, so the count is a floor and says so.
 */
function countFigure(
  slug: string,
  data: { count: number; labelled: number },
  record: { asOf: string | null; stale: boolean; savedAt: number | null },
): ComponentProps<typeof FigureBlock> {
  return {
    value: formatCount(data.count),
    label: `speeches about ${topicPhrase(slug)}`,
    caveat: 'Not every speech is labelled yet, so this is a floor.',
    citation: {
      asOf: record.asOf,
      savedAt: metaOf(record).savedAt,
      citation: TOPIC_CITATION,
      notes: [
        `${formatCount(data.count)} of the ${formatCount(data.labelled)} labelled speeches are about ${topicPhrase(slug)}.`,
        LABEL_NOTE,
      ],
      testID: 'topic-count-source',
    },
    testID: 'topic-count',
  };
}

/** About two drawn speech rows: the next 30 append this far from the end. */
const NEAR_END = 2 * 96;

function TopicContent({ slug, params }: { slug: string; params: Params }) {
  const title = topicLabel(topicNames[slug]!);
  const phrase = topicPhrase(slug);
  const [filters, setFilters] = useState<SpeechFilters>(() =>
    normaliseTopicFilters(params),
  );
  const scrollRef = useRef<ScrollView>(null);
  const headerBottom = useHeaderBottom();
  const reduceMotion = useReduceMotion();
  const viewport = useWindowDimensions().height;
  // Where Speeches starts in the page, and where its drawn rows end.
  const speechesY = useRef<number | null>(null);
  const rowsEnd = useRef<number | null>(null);
  const [drawn, setDrawn] = useState(SPEECH_PAGE);
  const appendedAt = useRef<number | null>(null);
  // A filtered arrival (a Tide decade, a party, a parliament or a debate)
  // opens scrolled to Speeches (specs/search.md 5.2.1); an unfiltered one
  // stays at the top.
  const arrival = useRef(Object.keys(filters).length > 0);
  const showSpeeches = () => {
    const y = speechesY.current;
    if (y === null) return false;
    // The scroll view runs under the native header on iOS.
    const top = Platform.OS === 'ios' ? headerBottom : 0;
    scrollRef.current?.scrollTo({
      y: Math.max(0, y - top - rhythm.heading),
      animated: !reduceMotion,
    });
    return true;
  };
  const [fresh, setFresh] = useState(0);
  const topic = useRead(
    useCallback(
      (signal?: AbortSignal) => reports.topic(slug, fresh > 0, signal),
      [slug, fresh],
    ),
  );
  const tide = useRead(
    useCallback(
      (signal?: AbortSignal) => reports.tide(fresh > 0, signal),
      [fresh],
    ),
  );
  const { party, state, from, to, debate } = filters;
  const speeches = useRead(
    useCallback(
      (signal?: AbortSignal) =>
        reports.speeches(
          slug,
          { party, state, from, to, debate },
          fresh > 0,
          signal,
        ),
      [slug, party, state, from, to, debate, fresh],
    ),
  );
  const money = useRead(
    useCallback(
      (signal?: AbortSignal) =>
        hasTopicMoney(slug)
          ? reports.money(signal)
          : Promise.reject(new Error('No paired industry')),
      [slug],
    ),
  );
  const decades: readonly DecadeBucket[] =
    tide.record?.data.decades ?? defaultDecades;

  const apply = (next: SpeechFilters) => {
    const clean = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== undefined && v !== ''),
    ) as SpeechFilters;
    setFilters(clean);
    setDrawn(SPEECH_PAGE);
    router.setParams(
      Object.fromEntries(filterKeys.map((key) => [key, clean[key]])),
    );
  };
  const change = (patch: Partial<SpeechFilters>) =>
    apply({ ...filters, ...patch });
  // A Who row, a decade bar or a table row filters Speeches and shows it:
  // the change happens below, so the page goes there.
  const filterAndShow = (patch: Partial<SpeechFilters>) => {
    change(patch);
    if (Object.values(patch).some(Boolean)) showSpeeches();
  };
  // The sections above Speeches settle at different times and push it
  // down; the arrival scroll follows each move until they have all settled.
  const settled = [topic, tide, money, speeches].every(
    (read) => read.record || read.error,
  );
  useEffect(() => {
    if (!settled || !arrival.current) return;
    const frame = requestAnimationFrame(() => {
      if (arrival.current && showSpeeches()) arrival.current = false;
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  const onSpeechesLayout = (y: number) => {
    speechesY.current = y;
    if (!arrival.current) return;
    showSpeeches();
    if (settled) arrival.current = false;
  };

  const openAsk = useOpenAsk();
  const menu: RowMenuAction[] = [
    {
      title: `Ask about ${phrase}`,
      symbol: 'text.bubble',
      onPress: () =>
        openAsk({ question: topicQuestion(slug), topic: slug }, title),
    },
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => void copyRecordLink(topicWebPath(slug, filters)),
    },
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right',
      onPress: () => void openOnWeb(topicWebPath(slug, filters), title),
    },
  ];

  const titleRef = useRef<View>(null);
  const bar = useTitleOnScroll(titleRef, title);
  const onScroll = (y: number) => {
    bar.onScroll(y);
    const start = speechesY.current;
    const end = rowsEnd.current;
    if (start === null || end === null) return;
    const bottom = start + end;
    // One append per new end of the rows: once the last 30 are drawn the
    // end stops moving and nothing more is asked.
    if (y + viewport >= bottom - NEAR_END && appendedAt.current !== bottom) {
      appendedAt.current = bottom;
      const loaded = speeches.record?.data.results.length ?? 0;
      setDrawn((n) => Math.min(n + SPEECH_PAGE, Math.max(loaded, n)));
    }
  };
  const count = topic.record?.data;
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title,
          ...headerItems(
            pageItems({
              name: title,
              share: () =>
                void shareRecord({ path: topicWebPath(slug, filters), title }),
              menu,
            }),
          ),
        }}
      />
      <Screen
        testID="topic-screen"
        scrollRef={scrollRef}
        onScroll={onScroll}
        offline={
          topic.record?.stale && topic.error && isOffline(topic.error)
            ? { savedAt: topic.record.savedAt }
            : null
        }
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => setFresh((n) => n + 1)}
          />
        }
      >
        <View
          ref={titleRef}
          onLayout={bar.onTitleLayout}
          style={{ gap: rhythm.line }}
        >
          <Heading level={1} kind="page">
            {title}
          </Heading>
          {topicDescriptions[slug] ? (
            <Text wordSafe variant="secondary">
              {topicDescriptions[slug]}
            </Text>
          ) : null}
        </View>
        {count && topic.record ? (
          <FigureBlock {...countFigure(slug, count, topic.record)} />
        ) : topic.error ? (
          isOffline(topic.error) ? (
            <ContentUnavailable
              symbol="wifi.slash"
              title={copy.notSaved}
              body={copy.notSavedBody}
              testID="topic-offline"
            />
          ) : (
            <ContentUnavailable
              symbol="exclamationmark.triangle"
              title="This topic couldn't be loaded"
              body="OPAX didn't respond."
              action={{
                label: 'Try again',
                onPress: topic.retry,
                testID: 'topic-retry',
              }}
              testID="topic-error"
            />
          )
        ) : (
          <Skeleton
            count={2}
            label="Loading the topic"
            testID="topic-loading"
          />
        )}
        {tide.record ? (
          <TopicTide
            tide={tide.record.data}
            meta={metaOf(tide.record)}
            slug={slug}
            chosen={chosenDecade(filters, decades)}
            onChoose={(decade) =>
              filterAndShow({
                from: decade ? String(decade.from) : undefined,
                to: decade ? String(decade.to) : undefined,
              })
            }
          />
        ) : null}
        {count && topic.record ? (
          <TopicWho
            topic={count}
            meta={metaOf(topic.record)}
            filters={filters}
            onFilter={filterAndShow}
          />
        ) : null}
        {money.record ? (
          <TopicMoney
            slug={slug}
            money={money.record.data}
            meta={metaOf(money.record)}
          />
        ) : null}
        <View
          onLayout={(e) => onSpeechesLayout(e.nativeEvent.layout.y)}
          testID="topic-speeches-anchor"
        >
          <TopicSpeeches
            slug={slug}
            title={title}
            phrase={phrase}
            read={speeches}
            filters={filters}
            decades={decades}
            onClear={() => apply({})}
            visible={drawn}
            onVisible={setDrawn}
            onRowsEnd={(end) => {
              rowsEnd.current = end;
            }}
          />
        </View>
      </Screen>
    </>
  );
}
