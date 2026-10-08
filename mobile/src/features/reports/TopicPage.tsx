import { headerItems } from '../../navigation/chrome';
import { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { reports } from '../../api/runtime';
import {
  Button,
  BigFigure,
  InfoButton,
  PartyChip,
  LinkRow,
  RowList,
  EmptyState,
  Group,
  KeyValueList,
  Screen,
  Section,
  SegmentedControl,
  Text,
} from '../../design/primitives';
import { formatMoney } from '../../design/format';
import { shareHeaderItem } from '../../navigation/share';
import { RecordRow } from '../RecordRow';
import { moneyRows, parliamentNames, topicNames, topicReport } from './model';
import {
  AEC_NOTE,
  ReadState,
  ShareBars,
  SourceRows,
  announce,
  useRead,
} from './parts';
import { openRecord, openTopicWindow } from './open';

const industries: Readonly<Record<string, string[]>> = {
  gambling: ['gambling'],
  'financial-services': ['finance'],
  'mining-energy': ['mining'],
  'property-construction': ['property'],
  'media-communications': ['media'],
  'hospitality-alcohol': ['alcohol'],
  agriculture: ['agriculture'],
  'unions-workplace': ['unions'],
};
function TopicMoney({ slug }: { slug: string }) {
  const read = useRead(reports.money);
  return (
    <ReadState
      read={read}
      citation="AEC returns · OPAX money graph"
      testID="topic-money"
    >
      {(money) => {
        const data = moneyRows(money, industries[slug] ?? []);
        if (!data.donors.length) return null;
        const label = industries[slug]!.map((i) => i.replace(/_/g, ' ')).join(
          ' and ',
        );
        return (
          <Section
            title="The money beside the words"
            accent="money"
            info={{
              title: 'About the disclosed money',
              notes: [AEC_NOTE, money.meta.coverage],
            }}
          >
            <Text>{`While parliament debated this, ${label} interests disclosed ${formatMoney(data.donors.reduce((n, d) => n + d.total, 0))} in donations to political parties.`}</Text>
            <KeyValueList
              items={data.rows
                .slice(0, 6)
                .map((d) => ({ label: d.party, value: formatMoney(d.money) }))}
            />
            <RecordRow
              title="Explore on the money map"
              onPress={() => openRecord('/money', 'Money map')}
            />
          </Section>
        );
      }}
    </ReadState>
  );
}
export default function TopicPage() {
  const { slug = '', ...filters } = useLocalSearchParams<{
    slug: string;
    party?: string;
    state?: string;
    from?: string;
    to?: string;
    debate?: string;
  }>();
  return (
    <TopicContent
      key={slug + JSON.stringify(filters)}
      slug={slug}
      filters={filters}
    />
  );
}
function TopicContent({
  slug,
  filters,
}: {
  slug: string;
  filters: {
    party?: string;
    state?: string;
    from?: string;
    to?: string;
    debate?: string;
  };
}) {
  const load = useCallback(() => reports.topic(slug), [slug]);
  const { party, state, from, to, debate } = filters;
  const arcLoad = useCallback(
    () => reports.speeches(slug, { party, state, from, to, debate }),
    [slug, party, state, from, to, debate],
  );
  const read = useRead(load),
    tide = useRead(reports.tide),
    arc = useRead(arcLoad),
    corpus = useRead(reports.corpus);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest'),
    [visible, setVisible] = useState(30);
  const title = topicNames[slug] ?? 'Topic';
  const shareFilters = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) shareFilters.set(key, value);
  return (
    <>
      <Stack.Screen
        options={{
          title,
          ...headerItems(() => [
            shareHeaderItem({
              path: `/subject/topic/${slug}${shareFilters.size ? '?' + shareFilters.toString() : ''}`,
              title,
            }),
          ]),
        }}
      />
      <Screen testID="topic-screen">
        {Object.keys(filters).length ? (
          <Section title="The debate's speeches">
            <Text variant="fine">
              Within the retrieved window of up to 200 speeches:{' '}
              {Object.values(filters).join(' · ')}.
            </Text>
            <ReadState
              read={arc}
              citation="OPAX labelled speech search"
              testID="topic-filtered"
            >
              {(data) => {
                const rows = data.results.filter(
                  (s) =>
                    (!filters.party || s.party === filters.party) &&
                    (!filters.state || s.state === filters.state) &&
                    (!filters.from || (s.date ?? '') >= filters.from) &&
                    (!filters.to || (s.date ?? '') <= filters.to) &&
                    (!filters.debate ||
                      s.title
                        .toLowerCase()
                        .includes(
                          filters.debate
                            .toLowerCase()
                            .replace(/\s*[-–—].*$/, ''),
                        )),
                );
                return rows.length ? (
                  <SourceRows
                    sources={rows.slice(0, visible).map((s) => ({
                      ...s,
                      passage: s.snippet,
                      source_title: undefined,
                      cited: undefined,
                      answer_ranges: undefined,
                    }))}
                    testID="topic-filtered-speech"
                  />
                ) : (
                  <EmptyState message="No speeches matching this selection are in the retrieved window." />
                );
              }}
            </ReadState>
            <RecordRow
              title="Read the full topic"
              onPress={() => openRecord(`/subject/topic/${slug}`, title)}
            />
          </Section>
        ) : null}
        <ReadState
          read={read}
          citation="OPAX labelled speech catalog"
          testID="topic"
        >
          {(data) => (
            <Group>
              <BigFigure
                value={data.count.toLocaleString()}
                label="speeches carry this label so far"
                accent="votes"
                testID="topic-count"
              />
              <InfoButton
                title="About the topic count"
                notes={[
                  `${data.count.toLocaleString()} speeches carry this label so far, of ${data.labelled.toLocaleString()} labelled to date. The labelling pass is still running.`,
                ]}
              />
              {topicReport[slug] ? (
                <RecordRow
                  title={`Read the ${title} report`}
                  onPress={() =>
                    openRecord(`/reports/${topicReport[slug]}`, title)
                  }
                  testID="topic-report"
                />
              ) : null}
              <Section
                title="Who speaks on it, by party"
                accent="people"
                info={{
                  title: 'About party counts',
                  notes: [
                    'Labelled so far. A party name opens its speeches on this topic. Some speeches carry no party label, so the bars can sum below the total.',
                  ],
                }}
              >
                <RowList>
                  {data.parties.slice(0, 8).map(([party, n]) => (
                    <LinkRow
                      key={party}
                      title={`${n.toLocaleString()} speeches`}
                      leading={<PartyChip status="unknown" party={party} />}
                      accessibilityLabel={`${party}, ${n.toLocaleString()} speeches`}
                      onPress={() => openTopicWindow(slug, { party }, title)}
                    />
                  ))}
                </RowList>
              </Section>
              <Section
                title="Which parliament argues it"
                accent="people"
                info={{
                  title: 'About parliament counts',
                  notes: [
                    'Share of that parliament’s labelled record, then the count.',
                    corpus.record
                      ? `Years held: ${corpus.record.data.sources
                          .filter((s) =>
                            /Federal Hansard:|NSW Parliament|Victorian Parliament|SA Parliament|QLD Parliament|ACT Legislative Assembly/.test(
                              s.name,
                            ),
                          )
                          .map((s) => `${s.name} ${s.coverage}`)
                          .join(' · ')}.`
                      : null,
                  ],
                }}
              >
                {data.states
                  .filter(([state]) => parliamentNames[state])
                  .map(([state, n, share]) => (
                    <RecordRow
                      key={state}
                      title={parliamentNames[state]!}
                      detail={`${(share * 100).toFixed(2)}% · ${n.toLocaleString()}`}
                      onPress={() => openTopicWindow(slug, { state }, title)}
                    />
                  ))}
              </Section>
            </Group>
          )}
        </ReadState>
        {industries[slug] ? <TopicMoney slug={slug} /> : null}
        <ReadState
          read={tide}
          citation="OPAX federal labelled speech tide"
          testID="topic-tide"
        >
          {(data) => {
            const points = data.topics[slug] ?? [];
            return points.length ? (
              <Section
                title="The share over time"
                accent="votes"
                info={{
                  title: 'About the decade bars',
                  notes: [
                    'Each bar is this topic’s share of federal speeches carrying any topic label in that decade; the small figure is the count. Federal is the longest comparable run. Labels are applied so far, and each decade opens the speeches behind it.',
                  ],
                  extra: (
                    <KeyValueList
                      items={data.decades.map((d) => ({
                        label: d.label,
                        value: `${(d.coverage * 100).toFixed(1)}% · ${d.labelled.toLocaleString()} of ${d.total.toLocaleString()}`,
                      }))}
                    />
                  ),
                }}
              >
                <ShareBars
                  label="Share of federal speeches by decade"
                  onSelect={(i) => {
                    const decade = data.decades.find(
                      (d) => d.slug === points[i]!.decade,
                    );
                    if (decade)
                      openTopicWindow(
                        slug,
                        {
                          state: 'federal',
                          from: `${decade.from}-01-01`,
                          to: `${decade.to}-12-31`,
                        },
                        title,
                      );
                  }}
                  points={points.map((p) => ({
                    ...p,
                    label:
                      data.decades.find((d) => d.slug === p.decade)?.label ??
                      p.decade,
                  }))}
                />
              </Section>
            ) : null;
          }}
        </ReadState>
        <Section
          title="The arc of this debate"
          accent="bills"
          testID="topic-arc"
          info={{
            title: 'About this speech window',
            notes: [
              'The chronological view covers the retrieved window of up to 200 speeches. Passages are from the record.',
            ],
          }}
        >
          <ReadState
            read={arc}
            citation="OPAX labelled speech search"
            testID="topic-arc-data"
          >
            {(data) => {
              const rows = [...data.results].sort((a, b) => {
                if (!a.date) return b.date ? 1 : 0;
                if (!b.date) return -1;
                const cmp = a.date.localeCompare(b.date);
                return order === 'oldest' ? cmp : -cmp;
              });
              return rows.length ? (
                <Group>
                  <SegmentedControl
                    value={order}
                    segments={[
                      { value: 'newest', label: 'Newest first' },
                      { value: 'oldest', label: 'Oldest first' },
                    ]}
                    onChange={(v) => {
                      setOrder(v);
                      announce(`Speeches ordered ${v} first`);
                    }}
                  />
                  <SourceRows
                    sources={rows.slice(0, visible).map((s) => ({
                      ...s,
                      passage: s.snippet,
                      source_title: undefined,
                      cited: undefined,
                      answer_ranges: undefined,
                    }))}
                    testID="topic-speech"
                  />
                  {visible < rows.length ? (
                    <Button
                      label="Show 30 more"
                      onPress={() => setVisible((v) => v + 30)}
                    />
                  ) : null}
                </Group>
              ) : (
                <EmptyState message="No dated, labelled speeches are in the search window yet." />
              );
            }}
          </ReadState>
        </Section>
        <RecordRow
          title="Topics A–Z"
          onPress={() => openRecord('/subject/topic', 'Topics A–Z')}
          testID="topic-all"
        />
        <RecordRow
          title="Sources & coverage"
          onPress={() => openRecord('/stats', 'Sources & coverage')}
          testID="topic-stats"
        />
      </Screen>
    </>
  );
}
