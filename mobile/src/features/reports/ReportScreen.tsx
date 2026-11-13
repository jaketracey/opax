import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { isReportSlug } from '../../api/official-report-policy';
import type { OfficialReport } from '../../api/report-decoders';
import { useRead } from '../../api/useRead';
import { Group, Screen, Skeleton } from '../../design/primitives';
import { formatCount } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { MissingRecord, RecordLoadError } from '../records/RecordLoadError';
import { ReportProvenance } from './report-provenance';
import { HearingTranscripts, transcriptTitle } from './report-transcripts';
import { officialReports } from './official';
import {
  figures,
  metaLine,
  sections,
  source,
  type Section,
} from './report-model';
import {
  AnnualFigures,
  AnnualTables,
  Documents,
  Facts,
  InfoRows,
  Items,
} from './report-sections';
import {
  CitationLink,
  Disclosure,
  DisclosureProvider,
  Heading,
  Link,
  RuleGroup,
  Text,
  styles,
  useReportColors,
} from './report-ui';

function SectionBody({
  section,
  report,
  anchor,
  jump,
}: {
  section: Section;
  report: OfficialReport;
  anchor: (id: string, node: View | null) => void;
  jump: (id: string) => void;
}) {
  const c = report.record;
  if (section.id === 'recommendations' || section.id === 'findings')
    return (
      <Items report={report} part={section.id} anchor={anchor} jump={jump} />
    );
  if (section.id === 'unextracted')
    return (
      <Group>
        {report.caveats
          .filter((x) => /^Allegations are not findings/.test(x))
          .map((note, i) => (
            <Text selectable key={i} variant="secondary">
              {note}
            </Text>
          ))}
        <Text>
          No findings or recommendations are reproduced in this record. This
          does not establish that the report contains none.
        </Text>
        <Link
          title={`Read the report${source(report).pages ? ` (PDF, ${formatCount(source(report).pages!)} pages)` : ''}`}
          url={report.citation.url}
        />
      </Group>
    );
  if (section.rows)
    return <InfoRows rows={section.rows} main={report.citation.document} />;
  if (section.documents?.length)
    return <Documents documents={section.documents} report={report} />;
  if (section.id === 'responses')
    return (
      <Text>
        {c.responses_status === 'none_found'
          ? 'No published response was found.'
          : 'Responses to this report have not been checked.'}
      </Text>
    );
  if (section.facts) return <Facts facts={section.facts} report={report} />;
  if (section.id === 'figures') return <AnnualFigures report={report} />;
  if (section.id === 'tables') return <AnnualTables report={report} />;
  if (section.id === 'status-source' && c.status_source)
    return (
      <Link
        title={c.status_source.name || 'Government status pages'}
        detail={
          c.status_source.pages
            ? `${formatCount(c.status_source.pages)} pages`
            : undefined
        }
        url={c.status_source.url}
      />
    );
  if (section.id === 'notes')
    return (
      <Group>
        {c.notes?.map((note, i) => (
          <Text key={i} selectable>
            {note}
          </Text>
        ))}
      </Group>
    );
  if (section.id === 'coverage')
    return (
      <Group>
        {c.gaps?.length ? (
          <Group>
            <Heading level={3}>This record</Heading>
            {c.gaps.map((note, i) => (
              <Text key={i} selectable>
                {note}
              </Text>
            ))}
          </Group>
        ) : null}
        {report.publisher.gaps?.length ? (
          <Group>
            <Heading level={3}>This publisher</Heading>
            {report.publisher.gaps.map((note, i) => (
              <Text key={i} selectable>
                {note}
              </Text>
            ))}
          </Group>
        ) : null}
        {c.reference_pages?.length ? (
          <Group>
            <Heading level={3}>Official reference pages</Heading>
            {c.reference_pages.map((ref, i) => (
              <Link key={i} title={ref.title} url={ref.url} />
            ))}
          </Group>
        ) : null}
      </Group>
    );
  return null;
}
export function ReportContent({
  report,
  scrollRef,
  scrollOffset,
}: {
  report: OfficialReport;
  scrollRef?: RefObject<ScrollView | null>;
  scrollOffset?: RefObject<number>;
}) {
  const anchors = useRef(new Map<string, View>());
  const headerBottom = useHeaderBottom();
  const anchor = useCallback((id: string, node: View | null) => {
    if (node) anchors.current.set(id, node);
    else anchors.current.delete(id);
  }, []);
  // Window coordinates plus the current scroll offset stay correct after any
  // disclosure reflows. Account for both automatic insets and the native header.
  const jump = (id: string) => {
    const target = anchors.current.get(id),
      scroll = scrollRef?.current;
    if (!target || !scroll) return;
    target.measureInWindow((_x, y) =>
      scroll.getNativeScrollRef()?.measureInWindow((_sx, sy) => {
        scroll.scrollTo({
          y:
            (scrollOffset?.current || 0) +
            y -
            Math.max(sy, headerBottom) -
            rhythm.block,
          animated: true,
        });
      }),
    );
  };
  const palette = useReportColors();
  const { fontScale } = useWindowDimensions();
  const [transcriptsMissing, setTranscriptsMissing] = useState(false);
  const parts = useMemo(
    () =>
      sections(report)
        .filter((part) => part.id !== 'transcripts' || !transcriptsMissing)
        .map((part) =>
          part.id === 'transcripts'
            ? { ...part, title: report.transcripts?.label || transcriptTitle }
            : part,
        ),
    [report, transcriptsMissing],
  );
  const stats = useMemo(() => figures(report), [report]);
  const original = source(report);
  return (
    <DisclosureProvider>
      <View
        style={{
          gap: rhythm.section,
          minWidth: 0,
          backgroundColor: palette.paper,
        }}
      >
        {report.record.court_context?.length ? (
          <View
            testID="report-court-notice"
            style={[
              styles.panel,
              {
                borderWidth: 1,
                borderColor: palette.dividerSubtle,
                backgroundColor: palette.sunken,
              },
            ]}
          >
            <Heading level={2}>
              A court has ruled on parts of this report
            </Heading>
            {report.record.court_context.map((item, i) => (
              <Group key={i} gap={rhythm.tight}>
                {item.applies_to ? (
                  <Text variant="secondary">{item.applies_to}</Text>
                ) : null}
                <Text selectable>{item.text}</Text>
                <CitationLink cite={item.cite} />
              </Group>
            ))}
          </View>
        ) : null}
        <Group gap={rhythm.tight}>
          <Heading level={1} testID="report-title">
            {report.title}
          </Heading>
          <Text variant="secondary" testID="report-date">
            {metaLine(report)}
          </Text>
        </Group>
        {stats.length ? (
          <View
            testID="report-glance"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: rhythm.block,
            }}
          >
            {stats.map((stat, i) => (
              <View
                key={i}
                style={{
                  flexGrow: 1,
                  flexBasis: fontScale >= 1.5 ? '100%' : 150,
                  minWidth: 0,
                  gap: rhythm.line,
                }}
              >
                <View
                  accessible
                  accessibilityLabel={stat.spoken}
                  testID={`report-figure-${i}`}
                >
                  <Text variant="figure">{stat.value}</Text>
                  <Text variant="secondary">{stat.label}</Text>
                </View>
                {stat.note ? (
                  <Text variant="secondary">{stat.note}</Text>
                ) : null}
                {stat.cite ? (
                  <CitationLink
                    cite={stat.cite}
                    mainDocument={report.citation.document}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        <View
          style={[
            styles.panel,
            {
              backgroundColor: palette.raised,
              borderWidth: 1,
              borderColor: palette.dividerSubtle,
            },
          ]}
        >
          <Heading level={2}>Official source</Heading>
          <Link
            title={original.label}
            detail={original.meta}
            url={original.url}
            testID="report-official-source"
          />
          {original.more.map((link) => (
            <RuleGroup key={link.url} gap={0}>
              <Link title={link.label} url={link.url} />
            </RuleGroup>
          ))}
        </View>
        {report.caveats.length ? (
          <Disclosure
            id="report-caveats"
            title="How to read this record"
            detail={`${formatCount(report.caveats.length)} notes`}
          >
            {report.caveats.map((note, i) => (
              <Text key={i} selectable>
                {note}
              </Text>
            ))}
          </Disclosure>
        ) : null}
        {parts.length ? (
          <Group gap={rhythm.tight} testID="report-contents">
            <Heading level={2}>On this page</Heading>
            {parts.map((part) => (
              <Link
                key={part.id}
                title={`${part.title}${part.count == null ? '' : ` ${formatCount(part.count)}`}`}
                onPress={() => jump(part.id)}
                testID={`report-jump-${part.id}`}
              />
            ))}
          </Group>
        ) : null}
        {parts.map((part) => (
          <View
            key={part.id}
            ref={(node) => anchor(part.id, node)}
            collapsable={false}
            testID={`report-section-${part.id}`}
          >
            <RuleGroup gap={rhythm.block}>
              <Heading
                level={2}
              >{`${part.title}${part.count == null ? '' : ` ${formatCount(part.count)}`}`}</Heading>
              {part.id === 'transcripts' && report.transcripts ? (
                <HearingTranscripts
                  slug={report.slug}
                  summary={report.transcripts}
                  onMissing={() => setTranscriptsMissing(true)}
                />
              ) : (
                <SectionBody
                  section={part}
                  report={report}
                  anchor={anchor}
                  jump={jump}
                />
              )}
            </RuleGroup>
          </View>
        ))}
        <ReportProvenance report={report} />
      </View>
    </DisclosureProvider>
  );
}
export default function ReportScreen({
  recordSlug,
  embedded = false,
}: {
  recordSlug?: string;
  embedded?: boolean;
}) {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug =
    recordSlug ?? (typeof params.slug === 'string' ? params.slug : '');
  const load = useCallback(
    (signal?: AbortSignal) => officialReports.read(slug, signal),
    [slug],
  );
  const { record, error, retry } = useRead(load);
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  return (
    <Screen
      testID="report-screen"
      centred={!isReportSlug(slug)}
      scrollRef={scrollRef}
      onScroll={(y) => {
        offset.current = y;
      }}
      barTitle={embedded ? undefined : record?.data.title}
    >
      {!isReportSlug(slug) ? (
        <MissingRecord testID="report-missing" />
      ) : error ? (
        <RecordLoadError
          slug=""
          error={error}
          onRetry={retry}
          subject="This report"
          testID="report-error"
        />
      ) : record ? (
        <ReportContent
          key={record.data.slug}
          report={record.data}
          scrollRef={scrollRef}
          scrollOffset={offset}
        />
      ) : (
        <Skeleton shape="rows" count={4} label="Loading report" />
      )}
    </Screen>
  );
}
