import { headerItems } from '../../navigation/chrome';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { reports } from '../../api/runtime';
import {
  Button,
  BigFigure,
  Disclosure,
  EmptyState,
  Group,
  Heading,
  KeyValueList,
  InfoButton,
  MachineWritten,
  PartyChip,
  Screen,
  Section,
  SegmentedControl,
  Text,
} from '../../design/primitives';
import { formatCount, formatDate, formatMoney } from '../../design/format';
import { colors } from '../../design/tokens';
import { shareHeaderItem, shareRecord } from '../../navigation/share';
import { RecordRow } from '../RecordRow';
import {
  allSources,
  decadeWindow,
  moneyPairings,
  moneyRows,
  numberedSections,
  topicReport,
  type Essay,
  type Report,
} from './model';
import {
  AEC_NOTE,
  MODEL_NOTE,
  Prose,
  ReadState,
  ShareBars,
  SourceRows,
  SourcesFold,
  WORDS_NOTE,
  announce,
  useRead,
} from './parts';
import { openRecord, openTopicWindow } from './open';

function EssayView({
  item,
  slug,
  number,
}: {
  item: Essay;
  slug: string;
  number: number;
}) {
  return (
    <Section
      title={item.question}
      accent="leads"
      testID={`report-section-${number}`}
    >
      {item.label ? <Text variant="metadata">{item.label}</Text> : null}
      <Prose
        value={item.answer}
        sources={item.sources}
        testID={`report-answer-${number}`}
      />
      <SourcesFold
        sources={item.sources}
        testID={`report-section-sources-${number}`}
      />
      <Button
        label="Share this section"
        onPress={() =>
          void shareRecord({
            path: `/reports/${slug}/s/${number}`,
            title: item.question,
          })
        }
        testID={`report-section-share-${number}`}
      />
    </Section>
  );
}
function Money({ slug }: { slug: string }) {
  const cfg = moneyPairings[slug];
  const read = useRead(reports.money);
  const matrix = useRead(reports.matrix);
  if (!cfg)
    return (
      <EmptyState message="No donor industry is paired with this report." />
    );
  return (
    <Section
      title="Follow the money"
      accent="money"
      testID="report-money"
      info={{
        title: 'About the disclosed money',
        notes: [AEC_NOTE, read.record?.data.meta.coverage],
      }}
    >
      <Text>{`Disclosed donations from ${cfg.label} donors to the parties.`}</Text>
      <ReadState
        read={read}
        citation="AEC returns · OPAX money graph"
        testID="report-money-data"
      >
        {(money) => {
          const flows = moneyRows(money, cfg.industries);
          return (
            <Group>
              <KeyValueList
                items={flows.rows.map((row) => ({
                  label: row.party,
                  value: formatMoney(row.money),
                }))}
              />
              <RecordRow
                title="Open the full money map"
                onPress={() => openRecord('/money', 'Money map')}
              />
              <Section
                title="Words per dollar"
                accent="money"
                info={{
                  title: 'About words per dollar',
                  notes: [
                    WORDS_NOTE,
                    'Shown together for comparison. OPAX does not claim one series causes the other. A machine pass is still labelling the corpus by subject, so speech counts are floors and shares will settle as it runs. Bars scale within their own panel and series: compare the numbers, not bar lengths, across panels.',
                  ],
                }}
              >
                <ReadState
                  read={matrix}
                  citation="OPAX labelled speech matrix"
                  testID="report-words"
                >
                  {(m) => {
                    const comparison = moneyRows(
                      money,
                      cfg.industries,
                      m,
                      cfg.topic,
                    );
                    return (
                      <Group>
                        {comparison.rows.map((row) => (
                          <Group key={row.party}>
                            <PartyChip status="unknown" party={row.party} />
                            <RecordRow
                              title={`${formatMoney(row.money)} disclosed`}
                              onPress={() =>
                                openRecord('/money', `${row.party} disclosures`)
                              }
                            />
                            <View
                              aria-hidden
                              style={{
                                height: 5,
                                backgroundColor: colors.moneyInk,
                                width: `${(row.money / Math.max(...comparison.rows.map((r) => r.money), 1)) * 100}%`,
                              }}
                            />
                            <RecordRow
                              title={
                                row.share === null
                                  ? 'Not separated'
                                  : `${(row.share * 100).toFixed(1)}% · ${formatCount(row.count ?? 0)} labelled speeches`
                              }
                              onPress={() =>
                                openTopicWindow(
                                  cfg.topic,
                                  { party: row.party },
                                  row.party,
                                )
                              }
                            />
                            <View
                              aria-hidden
                              style={{
                                height: 5,
                                backgroundColor: colors.ink,
                                width: `${((row.share ?? 0) / Math.max(...comparison.rows.map((r) => r.share ?? 0), Number.EPSILON)) * 100}%`,
                              }}
                            />
                          </Group>
                        ))}
                      </Group>
                    );
                  }}
                </ReadState>
              </Section>
            </Group>
          );
        }}
      </ReadState>
    </Section>
  );
}
function ReportContent({
  report,
  section,
}: {
  report: Report;
  section?: string;
}) {
  const [tab, setTab] = useState<'now' | 'over' | 'money'>('now');
  const [sourceCount, setSourceCount] = useState(0);
  const sections = numberedSections(report);
  const selected = section
    ? sections.find((s) => String(s.number) === section)
    : null;
  const sources = allSources(report);
  const since = report.now?.since
    ? new Date(`${report.now.since}T00:00:00Z`).toLocaleDateString('en-AU', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;
  if (section)
    return selected ? (
      <Group>
        <EssayView
          item={selected.item}
          slug={report.slug}
          number={selected.number}
        />
        <RecordRow
          title="Read the full report"
          onPress={() => openRecord(`/reports/${report.slug}`, report.title)}
          testID="report-full"
        />
      </Group>
    ) : (
      <EmptyState message="That section is not in this report." />
    );
  return (
    <Group>
      {since ? (
        <Text variant="metadata">{`The debate since ${since}, and how it has moved since ${(report.over_time?.eras[0]?.from ?? '1993').slice(0, 4)}.`}</Text>
      ) : null}
      {report.lede ? (
        <Group>
          <Prose
            value={report.lede.text}
            sources={report.lede.sources}
            testID="report-lede"
          />
          <SourcesFold
            sources={report.lede.sources}
            label="Records for this opening"
            testID="report-lede-sources"
          />
        </Group>
      ) : (
        <Text>{report.blurb}</Text>
      )}
      <SegmentedControl
        value={tab}
        segments={[
          { value: 'now', label: 'Now', testID: 'report-tab-now' },
          { value: 'over', label: 'Over time', testID: 'report-tab-over' },
          ...(moneyPairings[report.slug]
            ? [
                {
                  value: 'money' as const,
                  label: 'Money',
                  testID: 'report-tab-money',
                },
              ]
            : []),
        ]}
        onChange={(value) => {
          setTab(value);
          announce(
            value === 'over'
              ? 'How it has moved'
              : value === 'money'
                ? 'Follow the money'
                : 'The debate now',
          );
        }}
        testID="report-tabs"
      />
      {tab === 'now' ? (
        <Group>
          <Heading level={2}>The debate now</Heading>
          {report.now?.discovered.length ? (
            <Group>
              <Text>
                {since
                  ? `What the chamber has actually been arguing about since ${since}. Each opens its speeches.`
                  : 'What the chamber has actually been arguing about. Each opens its speeches.'}
              </Text>
              {report.now.discovered.map((d) => (
                <Group key={d.title}>
                  <RecordRow
                    title={d.title}
                    onPress={() =>
                      openTopicWindow(
                        Object.entries(topicReport).find(
                          ([, r]) => r === report.slug,
                        )?.[0] ?? report.slug,
                        {
                          debate:
                            new URLSearchParams(d.search?.split('?')[1]).get(
                              'q',
                            ) ?? d.title,
                          ...Object.fromEntries(
                            [
                              ...new URLSearchParams(d.search?.split('?')[1]),
                            ].filter(([k]) => ['from', 'to'].includes(k)),
                          ),
                        },
                        d.title,
                      )
                    }
                  />
                  <Text variant="metadata">
                    {formatCount(d.count)} speeches ·{' '}
                    {[d.first, d.last]
                      .filter((date): date is string => !!date)
                      .map((date) => formatDate(date))
                      .join(' to ')}
                  </Text>
                </Group>
              ))}
            </Group>
          ) : null}
          {sections
            .filter((s) => s.tab === 'now')
            .map((s) => (
              <EssayView
                key={s.number}
                item={s.item}
                slug={report.slug}
                number={s.number}
              />
            ))}
          {report.key_stats?.length ? (
            <Section title="The figures this turns on" accent="votes">
              {report.key_stats.map((s, i) => (
                <Group key={i}>
                  <BigFigure value={s.value} label={s.label} accent="votes" />
                  {s.detail ? (
                    <InfoButton title={s.label} notes={[s.detail]} />
                  ) : null}
                  <Text variant="fine">{s.as_of}</Text>
                  {s.slug ? (
                    <RecordRow
                      title="Read the supporting record"
                      onPress={() => openRecord(`/doc/${s.slug}`, s.label)}
                    />
                  ) : null}
                </Group>
              ))}
            </Section>
          ) : null}
          {report.positions?.length ? (
            <Section title="Where the parties stand">
              {report.positions.map((p, i) => (
                <Group key={i}>
                  <PartyChip status="unknown" party={p.party} />
                  <Text>{p.position}</Text>
                  <Text variant="fine">
                    {p.speaker} · {p.date ? formatDate(p.date) : ''}
                  </Text>
                  {p.slug ? (
                    <RecordRow
                      title={p.source_title ?? 'Read the speech'}
                      onPress={() => openRecord(`/doc/${p.slug}`, p.party)}
                    />
                  ) : null}
                </Group>
              ))}
              <MachineWritten explanation={MODEL_NOTE} />
            </Section>
          ) : null}
        </Group>
      ) : tab === 'over' ? (
        <Group>
          <Heading level={2}>How it has moved</Heading>
          {sections
            .filter((s) => s.tab === 'over')
            .map((s) => (
              <EssayView
                key={s.number}
                item={s.item}
                slug={report.slug}
                number={s.number}
              />
            ))}
          {report.over_time?.tide.length ? (
            <Section
              title="The share of the labelled record, decade by decade"
              accent="votes"
              info={{
                title: 'About the decade bars',
                notes: [
                  'Each bar is this subject’s share of the federal speeches carrying any topic label in that decade; the small figure is the count. Labelled so far, not the whole record: the labeller is still working through the corpus, so a bar is a floor. Each decade opens the speeches behind it.',
                ],
              }}
            >
              <ShareBars
                label="Share of federal speeches by decade"
                onSelect={(i) => {
                  const window = decadeWindow(
                    report.over_time!.tide[i]!.decade,
                  );
                  const topic = Object.entries(topicReport).find(
                    ([, reportSlug]) => reportSlug === report.slug,
                  )?.[0];
                  if (window && topic)
                    openTopicWindow(
                      topic,
                      { state: 'federal', ...window },
                      report.title,
                    );
                }}
                points={report.over_time.tide.map((p) => ({
                  ...p,
                  label: p.decade,
                }))}
              />
            </Section>
          ) : null}
          <Section title="Start reading: the speeches that moved it">
            <Text variant="fine">
              Chosen from the labelled record: substantive speeches on the
              subject, one per speaker, across the years.
            </Text>
            <SourceRows
              sources={report.over_time?.key_moments ?? []}
              testID="report-moment"
            />
          </Section>
          {report.voices ? (
            <Section title="Who does the talking">
              {(['now', 'all'] as const).map((window) => (
                <Group key={window}>
                  <Heading level={3}>
                    {window === 'now'
                      ? `Speaking since ${since ?? 'now'}`
                      : 'Across the whole record'}
                  </Heading>
                  <KeyValueList
                    items={report.voices![window].map((v) => ({
                      label: [v.speaker, v.party].filter(Boolean).join(' · '),
                      value: `${formatCount(v.count)} speeches`,
                    }))}
                  />
                </Group>
              ))}
            </Section>
          ) : null}
        </Group>
      ) : (
        <Money slug={report.slug} />
      )}
      <Section title="Sections" testID="report-sections-index">
        {sections.map((s) => (
          <RecordRow
            key={s.number}
            title={`${s.number}. ${s.item.question}`}
            onPress={() =>
              openRecord(
                `/reports/${report.slug}/s/${s.number}`,
                s.item.question,
              )
            }
            testID={`report-open-section-${s.number}`}
          />
        ))}
      </Section>
      <Section title={`Every record behind this report (${sources.length})`}>
        <Disclosure
          label="Show every record"
          open={sourceCount > 0}
          onToggle={(open) => setSourceCount(open ? 30 : 0)}
          testID="report-all-sources"
        >
          <>
            <SourceRows
              sources={sources.slice(0, sourceCount)}
              testID="report-all-source"
            />
            {sourceCount < sources.length ? (
              <Button
                label="Show 30 more"
                onPress={() => setSourceCount((v) => v + 30)}
              />
            ) : null}
          </>
        </Disclosure>
      </Section>
      {report.stats ? (
        <Section title="The parliamentary record">
          <KeyValueList
            items={[
              {
                label:
                  report.stats.speech_scope === 'topic-labelled-corpus'
                    ? 'labelled speeches on this topic'
                    : 'speeches on the record',
                value: formatCount(report.stats.speech_count),
              },
              {
                label: 'parliamentarians spoke',
                value: formatCount(report.stats.unique_speakers),
              },
            ]}
          />
        </Section>
      ) : null}
    </Group>
  );
}
export default function ReportPage() {
  const { slug = '', section } = useLocalSearchParams<{
    slug: string;
    section?: string;
  }>();
  const load = useCallback(() => reports.report(slug), [slug]);
  const read = useRead(load);
  const title = read.record?.data.title ?? 'Report';
  return (
    <>
      <Stack.Screen
        options={{
          title,
          ...headerItems(() => [
            shareHeaderItem({
              path: `/reports/${slug}${section ? `/s/${section}` : ''}`,
              title,
            }),
          ]),
        }}
      />
      <Screen testID="report-screen">
        <Heading level={1} testID="report-title">
          {title}
        </Heading>
        <ReadState read={read} citation="OPAX static report" testID="report">
          {(report) => (
            <ReportContentWrapper report={report} section={section} />
          )}
        </ReadState>
      </Screen>
    </>
  );
}
function ReportContentWrapper({
  report,
  section,
}: {
  report?: Report;
  section?: string;
}) {
  return report ? (
    <ReportContent
      key={`${report.slug}-${section ?? ''}`}
      report={report}
      section={section}
    />
  ) : null;
}
