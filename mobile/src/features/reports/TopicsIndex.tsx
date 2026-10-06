import { useState } from 'react';
import { Stack } from 'expo-router';
import { reports } from '../../api/runtime';
import {
  Button,
  Group,
  Screen,
  Section,
  SegmentedControl,
  Text,
} from '../../design/primitives';
import { RecordRow } from '../RecordRow';
import { shareHeaderItem } from '../../navigation/share';
import { topicDescriptions, topicNames } from './model';
import { ReadState, ShareBars, announce, useRead } from './parts';
import { openRecord } from './open';
export default function TopicsIndex() {
  const read = useRead(reports.topics),
    tide = useRead(reports.tide);
  const [order, setOrder] = useState<'name' | 'count'>('name');
  const [coverage, setCoverage] = useState(false);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Topics A–Z',
          unstable_headerRightItems: () => [
            shareHeaderItem({ path: '/subject/topic', title: 'Topics A–Z' }),
          ],
        }}
      />
      <Screen testID="topics-screen">
        <Text>
          Every debate in the record, by subject. Each topic opens its own page:
          who speaks on it, the money beside the words, and the debate itself.
        </Text>
        <ReadState
          read={read}
          citation="OPAX labelled topic catalog"
          testID="topics"
        >
          {(data) => (
            <Group>
              <Text testID="topics-count">
                {data.labelled.toLocaleString()} speeches labelled so far ·{' '}
                {data.topics.filter((t) => topicNames[t.slug]).length} topics
              </Text>
              <SegmentedControl
                value={order}
                segments={[
                  { value: 'name', label: 'A–Z' },
                  { value: 'count', label: 'Most discussed' },
                ]}
                onChange={(value) => {
                  setOrder(value);
                  announce(
                    value === 'name'
                      ? 'Topics A–Z'
                      : 'Topics ordered by most discussed',
                  );
                }}
              />
              <Text variant="fine">
                Counts are speeches labelled so far. The small bars are each
                topic’s share of federal speeches by decade, 1993 to 2026,
                scaled within the topic.
              </Text>
              {[...data.topics]
                .filter((t) => topicNames[t.slug])
                .sort((a, b) =>
                  order === 'name'
                    ? topicNames[a.slug]!.localeCompare(topicNames[b.slug]!)
                    : b.count - a.count,
                )
                .map((t) => {
                  const points = tide.record?.data.topics[t.slug] ?? [];
                  const decades = tide.record?.data.decades ?? [];
                  const pct =
                    data.labelled > 0 ? (t.count / data.labelled) * 100 : 0;
                  return (
                    <Section key={t.slug}>
                      <RecordRow
                        title={topicNames[t.slug]!}
                        detail={`${t.count.toLocaleString()} speeches labelled so far · ${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}% of the labelled record`}
                        onPress={() =>
                          openRecord(
                            `/subject/topic/${t.slug}`,
                            topicNames[t.slug]!,
                          )
                        }
                        testID={`topic-open-${t.slug}`}
                      />
                      <Text variant="metadata">
                        {topicDescriptions[t.slug]}
                      </Text>
                      {points.length ? (
                        <ShareBars
                          label="Share of federal speeches by decade"
                          points={points.map((p) => ({
                            ...p,
                            label:
                              decades.find((d) => d.slug === p.decade)?.label ??
                              p.decade,
                          }))}
                        />
                      ) : null}
                    </Section>
                  );
                })}
              <Button
                label="About these numbers"
                expanded={coverage}
                onPress={() => setCoverage((v) => !v)}
              />
              {coverage ? (
                <Text variant="fine">
                  A speech can carry more than one topic label, so the shares do
                  not sum to one hundred. The decade bars use federal speeches
                  only, the longest comparable run; each is that topic’s share
                  of the decade’s labelled speeches, scaled to the topic’s own
                  peak. The labelling pass is still running.
                </Text>
              ) : null}
            </Group>
          )}
        </ReadState>
        {tide.error ? (
          <Button label="Try decade bars again" onPress={tide.retry} />
        ) : null}
        <RecordRow
          title="Sources & coverage"
          onPress={() => openRecord('/stats', 'Sources & coverage')}
          testID="topics-stats"
        />
        <RecordRow
          title="Methods"
          onPress={() => openRecord('/methods', 'Methods')}
          testID="topics-methods"
        />
      </Screen>
    </>
  );
}
