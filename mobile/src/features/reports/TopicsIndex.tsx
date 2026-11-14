import { RouteOptions } from '../../navigation/preview';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { reports } from '../../api/runtime';
import { useRead } from '../../api/useRead';
import { copy } from '../../design/copy';
import { counted } from '../../design/format';
import {
  ContentUnavailable,
  Group,
  Heading,
  InsetGroup,
  LinkRow,
  Screen,
  SegmentedPicker,
  Skeleton,
  SourceLine,
  Text,
} from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import { rhythm } from '../../design/tokens';
import { headerItems } from '../../navigation/chrome';
import { coverageRoute, methodsRoute } from '../../navigation/routes/reference';
import { resultsRoute, topicRoute } from '../../navigation/routes/search';
import { shareHeaderItem } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { isOffline } from '../CatalogState';
import { allTopics, matchTopics } from '../search/ranking';
import { announce } from './parts';
import { TOPIC_CITATION, topicNotes } from './topic-copy';

type Order = 'name' | 'count';
type Row = { slug: string; title: string; description: string; count?: number };

/** Topics with their counts, A–Z or most discussed first. */
export function orderTopics(rows: readonly Row[], order: Order): Row[] {
  return [...rows].sort((a, b) =>
    order === 'count' && a.count !== undefined && b.count !== undefined
      ? b.count - a.count || a.title.localeCompare(b.title, 'en-AU')
      : a.title.localeCompare(b.title, 'en-AU'),
  );
}

export default function TopicsIndex() {
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(
    (signal?: AbortSignal) => reports.topics(refresh > 0, signal),
    [refresh],
  );
  const read = useRead(load);
  const [order, setOrder] = useState<Order>('name');
  const [query, setQuery] = useState('');
  const titleRef = useRef<View>(null);
  const title = useTitleOnScroll(titleRef, 'Topics');
  const search = useListSearchBar({
    placeholder: 'Topics and subjects',
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const data = read.record?.data ?? null;
  const counts = new Map(data?.topics.map((t) => [t.slug, t.count]) ?? []);
  const known = allTopics.map((t) => ({
    slug: t.slug,
    title: t.title,
    description: t.description,
    count: data ? (counts.get(t.slug) ?? 0) : undefined,
  }));
  const q = query.trim();
  const matched = q ? new Set(matchTopics(q).map((t) => t.slug)) : null;
  const shown = known.filter((t) => !matched || matched.has(t.slug));
  const labelled = orderTopics(
    shown.filter((t) => t.count === undefined || t.count > 0),
    order,
  );
  const unlabelled = orderTopics(
    shown.filter((t) => t.count === 0),
    'name',
  );
  const failed = !read.record && read.error;
  const loading = !read.record && !read.error;
  return (
    <>
      <RouteOptions
        options={{
          title: 'Topics',
          headerSearchBarOptions: { ...search, hideWhenScrolling: true },
          ...headerItems(() => [
            shareHeaderItem({ path: '/subject/topic', title: 'Topics' }),
          ]),
        }}
      />
      <Screen
        testID="topics-screen"
        onScroll={title.onScroll}
        offline={
          read.record?.stale && read.error && isOffline(read.error)
            ? { savedAt: read.record.savedAt }
            : null
        }
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => setRefresh((n) => n + 1)}
          />
        }
      >
        <View ref={titleRef} onLayout={title.onTitleLayout}>
          <Heading level={1} kind="page">
            Topics
          </Heading>
        </View>
        {!q ? (
          <SegmentedPicker
            accessibilityLabel="Order"
            value={order}
            options={[
              { value: 'name', label: 'A–Z' },
              { value: 'count', label: 'Most discussed' },
            ]}
            onChange={(value) => {
              setOrder(value);
              announce(
                value === 'name' ? 'Sorted A to Z' : 'Sorted by most discussed',
              );
            }}
            testID="topics-order"
          />
        ) : null}
        {failed && !q ? (
          isOffline(read.error) ? (
            <ContentUnavailable
              symbol="wifi.slash"
              title={copy.notSaved}
              body={copy.notSavedBody}
              testID="topics-offline"
            />
          ) : (
            <ContentUnavailable
              symbol="exclamationmark.triangle"
              title="Topics couldn’t be loaded"
              body="OPAX didn’t respond."
              action={{
                label: 'Try again',
                onPress: read.retry,
                testID: 'topics-retry',
              }}
              testID="topics-error"
            />
          )
        ) : loading && !q ? (
          <Skeleton count={8} label="Loading topics" testID="topics-loading" />
        ) : (
          <>
            {labelled.length ? (
              <InsetGroup testID="topics-list">
                {labelled.map((t) => (
                  <LinkRow
                    key={t.slug}
                    title={t.title}
                    value={
                      t.count === undefined
                        ? undefined
                        : `${counted(t.count, 'speech', 'speeches')}`
                    }
                    detail={t.description}
                    href={topicRoute(t.slug)}
                    testID={`topic-open-${t.slug}`}
                  />
                ))}
              </InsetGroup>
            ) : null}
            {unlabelled.length ? (
              <InsetGroup
                header="No labelled speeches yet"
                testID="topics-unlabelled"
              >
                {unlabelled.map((t) => (
                  <LinkRow
                    key={t.slug}
                    title={t.title}
                    detail={t.description}
                    href={topicRoute(t.slug)}
                    testID={`topic-unlabelled-${t.slug}`}
                  />
                ))}
              </InsetGroup>
            ) : null}
            {q && !labelled.length && !unlabelled.length ? (
              <Group gap={rhythm.tight} testID="topics-no-match">
                <Text wordSafe variant="secondary">
                  {`No topics match “${q}”.`}
                </Text>
                <InsetGroup>
                  <LinkRow
                    title={`Search speeches for “${q}”`}
                    symbol="magnifyingglass"
                    onPress={() => router.push(resultsRoute('speeches', { q }))}
                    testID="topics-search-speeches"
                  />
                </InsetGroup>
              </Group>
            ) : null}
          </>
        )}
        {read.record ? (
          <SourceLine
            asOf={read.record.asOf}
            citation={TOPIC_CITATION}
            savedAt={read.record.stale ? read.record.savedAt : null}
            title="About these topics"
            notes={[
              ...topicNotes(read.record.data.labelled),
              read.record.stale && !isOffline(read.error)
                ? 'The latest list could not be read.'
                : null,
            ]}
            testID="topics-as-at"
          />
        ) : null}
        <InsetGroup testID="topics-more">
          <LinkRow
            title="Coverage by parliament"
            href={coverageRoute}
            testID="topics-stats"
          />
          <LinkRow
            title="Methods"
            href={methodsRoute}
            testID="topics-methods"
          />
        </InsetGroup>
      </Screen>
    </>
  );
}
