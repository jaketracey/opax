import {
  PadGrid,
  Button,
  BigFigure,
  Disclosure,
  EmptyState,
  Group,
  Heading,
  KeyValueList,
  MachineLabel,
  RowList,
  Screen,
  Section,
  SegmentedControl,
  SourceLine,
  Text,
  PartyLabel,
} from '../../design/primitives';
import { headerItems } from '../../navigation/chrome';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { reports } from '../../api/runtime';
import { formatCount, formatDate, formatMoney } from '../../design/format';
import { colors } from '../../design/tokens';
import { shareHeaderItem } from '../../navigation/share';
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
  type Source,
} from './model';
import {
  AEC_NOTE,
  Prose,
  REPORT_MACHINE_NOTE,
  ReportLede,
  ReadState,
  RecordsLine,
  ShareBars,
  SourceRows,
  WORDS_NOTE,
  announce,
  useRead,
  type ReadMeta,
} from './parts';
import { openRecord, openTopicWindow } from './open';

const LABELLED = 'OPAX labelled speeches';
const DECADE_NOTE =
  'Each bar is this subject’s share of the federal speeches carrying any topic label in that decade; the small figure is the count. Labelled so far, not the whole record: the labeller is still working through the corpus, so a bar is a floor. Each decade opens the speeches behind it.';
const COMPARISON_NOTE =
  'Shown together for comparison. OPAX does not claim one series causes the other. A machine pass is still labelling the corpus by subject, so speech counts are floors and shares will settle as it runs. Bars scale within their own panel and series: compare the numbers, not bar lengths, across panels.';

/** A report's blocks are dated by the report; a saved copy says so. */
type Line = { asOf: string; savedAt: number | null };

/** "Helen Haines — Questions without Notice — 2025-11-26" as its parts. */
function recordTitleParts(title?: string) {
  const parts = (title ?? '').split(' — ');
  const last = parts.at(-1) ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : undefined;
  return {
    speaker: parts.length > 1 ? parts[0] : undefined,
    date,
  };
}
function recordSource(slug: string, title?: string): Source {
  return { slug, title, ...recordTitleParts(title) };
}
/** A key figure is dated by its own as-at, else by when it was said. */
function figureDetail(s: NonNullable<Report['key_stats']>[number]) {
  if (s.as_of?.trim()) return `As at ${s.as_of.trim()}`;
  const { speaker, date } = recordTitleParts(s.source_title);
  return (
    [speaker, date ? formatDate(date, 'short') : null]
      .filter(Boolean)
      .join(', ') || undefined
  );
}

function EssayView({
  item,
  number,
  line,
}: {
  item: Essay;
  number: number;
  line: Line;
}) {
  return (
    <Section title={item.question} testID={`report-section-${number}`}>
      {item.label ? <Text variant="metadata">{item.label}</Text> : null}
      <Prose
        value={item.answer}
        sources={item.sources}
        testID={`report-answer-${number}`}
      />
      {item.sources.length ? (
        <RecordsLine
          sources={item.sources}
          {...line}
          title="Records for this section"
          testID={`report-section-sources-${number}`}
        />
      ) : (
        <SourceLine
          {...line}
          citation="Hansard"
          testID={`report-section-sources-${number}`}
        />
      )}
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
  const money = read.record?.data;
  return (
    <Group>
      <Section title="Follow the money" accent="money" testID="report-money">
        <Text>{`Disclosed donations from ${cfg.label} donors to the parties.`}</Text>
        <ReadState
          read={read}
          citation="AEC annual returns"
          sheet={(data) => ({
            title: 'About the disclosed money',
            coverage: 'OPAX money graph',
            notes: [AEC_NOTE, data.meta.coverage],
          })}
          testID="report-money-data"
        >
          {(data) => (
            <Group>
              <KeyValueList
                items={moneyRows(data, cfg.industries).rows.map((row) => ({
                  label: row.party,
                  value: formatMoney(row.money),
                }))}
              />
              <RecordRow
                path={'/money'}
                title="Open the full money map"
                onPress={() => openRecord('/money', 'Money map')}
              />
            </Group>
          )}
        </ReadState>
      </Section>
      {money ? (
        <Section title="Words per dollar" testID="report-words-section">
          <ReadState
            read={matrix}
            citation={['AEC annual returns', LABELLED]}
            sheet={{
              title: 'About words per dollar',
              notes: [WORDS_NOTE, COMPARISON_NOTE],
            }}
            testID="report-words"
          >
            {(m) => {
              const comparison = moneyRows(money, cfg.industries, m, cfg.topic);
              const maxMoney = Math.max(
                ...comparison.rows.map((r) => r.money),
                1,
              );
              const maxShare = Math.max(
                ...comparison.rows.map((r) => r.share ?? 0),
                Number.EPSILON,
              );
              return (
                <PadGrid>
                  {comparison.rows.map((row) => (
                    <Group key={row.party}>
                      <PartyLabel
                        status="unknown"
                        party={row.party}
                        dense
                        linked={false}
                      />
                      <RecordRow
                        path={'/money'}
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
                          width: `${(row.money / maxMoney) * 100}%`,
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
                          width: `${((row.share ?? 0) / maxShare) * 100}%`,
                        }}
                      />
                    </Group>
                  ))}
                </PadGrid>
              );
            }}
          </ReadState>
        </Section>
      ) : null}
    </Group>
  );
}
function ReportContent({
  report,
  section,
  meta,
}: {
  report: Report;
  section?: string;
  meta: ReadMeta;
}) {
  const [tab, setTab] = useState<'now' | 'over' | 'money'>('now');
  const [sourceCount, setSourceCount] = useState(0);
  const sections = numberedSections(report);
  const selected = section
    ? sections.find((s) => String(s.number) === section)
    : null;
  const sources = allSources(report);
  // Every block is dated by the report it belongs to.
  const line: Line = { asOf: report.generated_at, savedAt: meta.savedAt };
  const since = report.now?.since
    ? new Date(`${report.now.since}T00:00:00Z`).toLocaleDateString('en-AU', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;
  const topic =
    Object.entries(topicReport).find(([, r]) => r === report.slug)?.[0] ?? null;
  // The title once, one meta line, and one machine label for the report:
  // the opening, the sections and the party positions are a model's.
  const head = (
    <Group>
      <Heading level={1} testID="report-title">
        {report.title}
      </Heading>
      {since && !section ? (
        <Text variant="metadata" testID="report-meta">
          {`The debate since ${since}, and how it has moved since ${(report.over_time?.eras[0]?.from ?? '1993').slice(0, 4)}.`}
        </Text>
      ) : null}
      <MachineLabel explanation={REPORT_MACHINE_NOTE} testID="report-machine" />
    </Group>
  );
  if (section)
    return (
      <Group>
        {head}
        {selected ? (
          <Group>
            <EssayView
              item={selected.item}
              number={selected.number}
              line={line}
            />
            <RecordRow
              path={`/reports/${report.slug}`}
              title="Read the full report"
              onPress={() =>
                openRecord(`/reports/${report.slug}`, report.title)
              }
              testID="report-full"
            />
          </Group>
        ) : (
          <EmptyState message="That section is not in this report." />
        )}
      </Group>
    );
  const essays = (view: 'now' | 'over') => (
    <PadGrid>
      {sections
        .filter((s) => s.tab === view)
        .map((s) => (
          <EssayView
            key={s.number}
            item={s.item}
            number={s.number}
            line={line}
          />
        ))}
    </PadGrid>
  );
  const figures = report.key_stats ?? [];
  const figureRecords = figures.flatMap((s) =>
    s.slug ? [recordSource(s.slug, s.source_title)] : [],
  );
  return (
    <Group>
      {head}
      {report.lede ? (
        <Group>
          <ReportLede
            key={report.slug}
            value={report.lede.text}
            sources={report.lede.sources}
            testID="report-lede"
          />
          <RecordsLine
            sources={report.lede.sources}
            {...line}
            title="Records for the opening"
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
          {report.now?.discovered.length ? (
            <Section title="The debate now" testID="report-discovered">
              <Text>
                {since
                  ? `What the chamber has actually been arguing about since ${since}. Each opens its speeches.`
                  : 'What the chamber has actually been arguing about. Each opens its speeches.'}
              </Text>
              <RowList grid>
                {report.now.discovered.map((d) => (
                  <RecordRow
                    key={d.title}
                    title={d.title}
                    detail={[
                      `${formatCount(d.count)} speeches`,
                      [d.first, d.last]
                        .filter((date): date is string => !!date)
                        .map((date) => formatDate(date))
                        .join(' to '),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() =>
                      openTopicWindow(
                        topic ?? report.slug,
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
                ))}
              </RowList>
              <SourceLine
                {...line}
                citation={LABELLED}
                testID="report-discovered-source"
              />
            </Section>
          ) : null}
          {essays('now')}
          {figures.length ? (
            <Section title="The figures this turns on" testID="report-figures">
              <PadGrid>
                {figures.map((s, i) => (
                  <BigFigure
                    key={i}
                    value={s.value}
                    label={s.label}
                    detail={figureDetail(s)}
                    accent="votes"
                  />
                ))}
              </PadGrid>
              {figureRecords.length ? (
                <RecordsLine
                  sources={figureRecords}
                  {...line}
                  title="Records for these figures"
                  notes={figures.map((s) =>
                    s.detail ? `${s.label}: ${s.detail}` : null,
                  )}
                  testID="report-figures-sources"
                />
              ) : (
                <SourceLine {...line} citation="Hansard" />
              )}
            </Section>
          ) : null}
          {report.positions?.length ? (
            <Section title="Where the parties stand" testID="report-positions">
              <PadGrid>
                {report.positions.map((p, i) => (
                  <Group key={i}>
                    <PartyLabel
                      status="unknown"
                      party={p.party}
                      dense
                      linked={false}
                    />
                    <Text wordSafe>{p.position}</Text>
                    {p.slug ? (
                      <SourceRows
                        sources={[
                          {
                            ...recordSource(p.slug, p.source_title),
                            speaker: p.speaker,
                            date: p.date,
                          },
                        ]}
                        testID={`report-position-${i}`}
                      />
                    ) : p.speaker || p.date ? (
                      <Text variant="metadata">
                        {[p.speaker, p.date ? formatDate(p.date) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                  </Group>
                ))}
              </PadGrid>
              <SourceLine
                {...line}
                citation="Hansard"
                testID="report-positions-source"
              />
            </Section>
          ) : null}
        </Group>
      ) : tab === 'over' ? (
        <Group>
          {essays('over')}
          {report.over_time?.tide.length ? (
            <Section
              title="The share of the labelled record, decade by decade"
              testID="report-tide"
            >
              <ShareBars
                label="Share of federal speeches by decade"
                onSelect={(i) => {
                  const window = decadeWindow(
                    report.over_time!.tide[i]!.decade,
                  );
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
              <SourceLine
                {...line}
                citation={LABELLED}
                title="About the decade bars"
                notes={[DECADE_NOTE]}
                testID="report-tide-source"
              />
            </Section>
          ) : null}
          <Section
            title="Start reading: the speeches that moved it"
            testID="report-moments"
          >
            <SourceRows
              sources={report.over_time?.key_moments ?? []}
              testID="report-moment"
            />
            <SourceLine
              {...line}
              citation="Hansard"
              notes={[
                'Chosen from the labelled record: substantive speeches on the subject, one per speaker, across the years.',
              ]}
              testID="report-moments-source"
            />
          </Section>
          {report.voices ? (
            <Section title="Who does the talking" testID="report-voices">
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
              <SourceLine
                {...line}
                citation={LABELLED}
                testID="report-voices-source"
              />
            </Section>
          ) : null}
        </Group>
      ) : (
        <Money slug={report.slug} />
      )}
      <Section title="Sections" testID="report-sections-index">
        <RowList grid>
          {sections.map((s) => (
            <RecordRow
              path={`/reports/${report.slug}/s/${s.number}`}
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
        </RowList>
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
        <Section title="The parliamentary record" testID="report-stats">
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
          <SourceLine
            {...line}
            citation={LABELLED}
            testID="report-stats-source"
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
          // The title is the page's level 1 heading; `title` still names the
          // screen for the back stack.
          title,
          headerTitle: '',
          ...headerItems(() => [
            shareHeaderItem({
              path: `/reports/${slug}${section ? `/s/${section}` : ''}`,
              title,
            }),
          ]),
        }}
      />
      <Screen column="wide" testID="report-screen">
        <ReadState
          read={read}
          citation="OPAX reports"
          foot={false}
          testID="report"
        >
          {(report, meta) => (
            <ReportContent
              key={`${report.slug}-${section ?? ''}`}
              report={report}
              section={section}
              meta={meta}
            />
          )}
        </ReadState>
      </Screen>
    </>
  );
}
