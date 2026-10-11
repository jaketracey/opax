import {
  Button,
  Group,
  RowList,
  Screen,
  Section,
  SegmentedControl,
  SourceLine,
  Text,
} from '../../design/primitives';
import { headerItems } from '../../navigation/chrome';
import { useState } from 'react';
import { Stack } from 'expo-router';
import { reports } from '../../api/runtime';
import { RecordRow } from '../RecordRow';
import { shareHeaderItem } from '../../navigation/share';
import { topicDescriptions, topicNames } from './model';
import { ReadState, ShareBars, announce, useRead } from './parts';
import { openRecord } from './open';

const NOTES = [
  'Counts are speeches labelled so far. The small bars are each topic’s share of federal speeches by decade, 1993 to 2026, scaled within the topic.',
  'A speech can carry more than one topic label, so the shares do not sum to one hundred. The decade bars use federal speeches only, the longest comparable run; each is that topic’s share of the decade’s labelled speeches, scaled to the topic’s own peak. The labelling pass is still running.',
];

type TopicCount = { slug: string; count: number };
/** The known topics that pass `keep`, A–Z or most discussed first. */
function listed(
  topics: readonly TopicCount[],
  order: 'name' | 'count',
  keep: (t: TopicCount) => boolean,
) {
  return topics
    .filter((t) => topicNames[t.slug] && keep(t))
    .sort((a, b) =>
      order === 'name'
        ? topicNames[a.slug]!.localeCompare(topicNames[b.slug]!)
        : b.count - a.count,
    );
}

export default function TopicsIndex() {
  const read = useRead(reports.topics),
    tide = useRead(reports.tide);
  const [order, setOrder] = useState<'name' | 'count'>('name');
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Topics A–Z',
          ...headerItems(() => [
            shareHeaderItem({ path: '/subject/topic', title: 'Topics A–Z' }),
          ]),
        }}
      />
      <Screen column="wide" testID="topics-screen">
        <Text>
          Every debate in the record, by subject. Each topic opens its own page:
          who speaks on it, the money beside the words, and the debate itself.
        </Text>
        <ReadState
          read={read}
          citation="OPAX labelled topic catalog"
          foot={false}
          testID="topics"
        >
          {(data, meta) => (
            <Group>
              <Text variant="metadata" testID="topics-count">
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
              <RowList grid>
                {listed(data.topics, order, (t) => t.count > 0).map((t) => {
                  const points = tide.record?.data.topics[t.slug] ?? [];
                  const decades = tide.record?.data.decades ?? [];
                  const pct =
                    data.labelled > 0 ? (t.count / data.labelled) * 100 : 0;
                  return (
                    <Group key={t.slug} gap={6}>
                      <RecordRow
                        path={`/subject/topic/${t.slug}`}
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
                      <Text wordSafe variant="metadata">
                        {topicDescriptions[t.slug]}
                      </Text>
                      {points.length ? (
                        <ShareBars
                          compact
                          label="Share of federal speeches by decade"
                          points={points.map((p) => ({
                            ...p,
                            label:
                              decades.find((d) => d.slug === p.decade)?.label ??
                              p.decade,
                          }))}
                        />
                      ) : null}
                    </Group>
                  );
                })}
              </RowList>
              <SourceLine
                {...meta}
                citation="OPAX labelled topic catalog"
                title="About these numbers"
                notes={NOTES}
                testID="topics-as-at"
              />
              {/* A topic no speech carries yet has no count or share to
                  give: it is named here, apart, until the pass reaches it. */}
              {data.topics.some((t) => topicNames[t.slug] && t.count === 0) ? (
                <Section title="Not yet labelled" testID="topics-unlabelled">
                  <RowList grid>
                    {listed(data.topics, 'name', (t) => t.count === 0).map(
                      (t) => (
                        <RecordRow
                          key={t.slug}
                          path={`/subject/topic/${t.slug}`}
                          title={topicNames[t.slug]!}
                          detail={topicDescriptions[t.slug]}
                          onPress={() =>
                            openRecord(
                              `/subject/topic/${t.slug}`,
                              topicNames[t.slug]!,
                            )
                          }
                          testID={`topic-open-${t.slug}`}
                        />
                      ),
                    )}
                  </RowList>
                </Section>
              ) : null}
            </Group>
          )}
        </ReadState>
        {tide.error ? (
          <Button label="Try decade bars again" onPress={tide.retry} />
        ) : null}
        <Section testID="topics-more">
          <RowList>
            <RecordRow
              path={'/stats'}
              title="Coverage by source"
              onPress={() => openRecord('/stats', 'Coverage by source')}
              testID="topics-stats"
            />
            <RecordRow
              path={'/methods'}
              title="Methods"
              onPress={() => openRecord('/methods', 'Methods')}
              testID="topics-methods"
            />
          </RowList>
        </Section>
      </Screen>
    </>
  );
}
