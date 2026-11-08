import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { RefreshControl, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { reports } from '../../api/runtime';
import { copy } from '../../design/copy';
import { formatCount } from '../../design/format';
import { Screen } from '../../design/layout';
import { FigureBlock } from '../../design/record';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { symbols } from '../../design/symbols';
import { rhythm } from '../../design/tokens';
import type { RowMenuAction } from '../../design/row-link';
import { headerItems, pageItems } from '../../navigation/chrome';
import { openOnWeb } from '../../navigation/external';
import { copyRecordLink, shareRecord } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOpenAsk } from '../ask/open';
import { topicLabel } from '../search/ranking';
import { isOffline } from '../CatalogState';
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
import { useRead, type ReadMeta } from './parts';
import { LABEL_NOTE, TOPIC_CITATION } from './topic-copy';
import { TopicMoney, hasTopicMoney } from './TopicMoney';
import { TopicSpeeches } from './TopicSpeeches';
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

function UnknownTopic() {
  return (
    <>
      <Stack.Screen options={{ title: 'Topic' }} />
      <Screen testID="topic-screen">
        <ContentUnavailable
          symbol={symbols.topic}
          title="Topic not found"
          body="This topic isn't in OPAX."
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
    source: {
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

function TopicContent({ slug, params }: { slug: string; params: Params }) {
  const title = topicLabel(topicNames[slug]!);
  const phrase = topicPhrase(slug);
  const [filters, setFilters] = useState<SpeechFilters>(() =>
    normaliseTopicFilters(params),
  );
  const [fresh, setFresh] = useState(0);
  const topic = useRead(
    useCallback(() => reports.topic(slug, fresh > 0), [slug, fresh]),
  );
  const tide = useRead(useCallback(() => reports.tide(fresh > 0), [fresh]));
  const { party, state, from, to, debate } = filters;
  const speeches = useRead(
    useCallback(
      () =>
        reports.speeches(slug, { party, state, from, to, debate }, fresh > 0),
      [slug, party, state, from, to, debate, fresh],
    ),
  );
  const money = useRead(
    useCallback(
      () =>
        hasTopicMoney(slug)
          ? reports.money()
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
    router.setParams(
      Object.fromEntries(filterKeys.map((key) => [key, clean[key]])),
    );
  };
  const change = (patch: Partial<SpeechFilters>) =>
    apply({ ...filters, ...patch });

  const openAsk = useOpenAsk();
  const menu: RowMenuAction[] = [
    {
      title: `Ask about ${phrase}`,
      symbol: 'text.bubble',
      onPress: () => openAsk({ question: topicQuestion(slug), topic: slug }),
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
  const count = topic.record?.data;
  return (
    <>
      <Stack.Screen
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
        onScroll={bar.onScroll}
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
              change({
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
            onFilter={change}
          />
        ) : null}
        {money.record ? (
          <TopicMoney
            slug={slug}
            money={money.record.data}
            meta={metaOf(money.record)}
          />
        ) : null}
        <TopicSpeeches
          slug={slug}
          title={title}
          phrase={phrase}
          read={speeches}
          filters={filters}
          decades={decades}
          onClear={() => apply({})}
        />
      </Screen>
    </>
  );
}
