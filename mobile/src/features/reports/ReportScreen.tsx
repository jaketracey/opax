import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { isReportSlug } from '../../api/official-report-policy';
import type { OfficialReport, PublishedValue } from '../../api/report-decoders';
import { useRead } from '../../api/useRead';
import {
  ContentUnavailable,
  Group,
  Heading,
  InsetGroup,
  LinkRow,
  Screen,
  SectionHeader,
  Skeleton,
  SourceLine,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { formatCount } from '../../design/format';
import { RecordLoadError } from '../records/RecordLoadError';
import { officialReports } from './official';
import { reportDate, reportTypeLabel } from './report-present';

type Citation = OfficialReport['citation'];
function CitationLink({ cite, testID }: { cite: Citation; testID?: string }) {
  const target =
    cite.page && /\.pdf(?:$|\?)/i.test(cite.url) && !cite.url.includes('#')
      ? `${cite.url}#page=${cite.page}`
      : cite.url;
  return (
    <LinkRow
      title={cite.document}
      detail={[cite.page ? `Page ${cite.page}` : null, cite.section]
        .filter(Boolean)
        .join(' · ')}
      external={{ url: target, label: cite.document }}
      testID={testID}
    />
  );
}
const technical = new Set([
  'record_id',
  'table_id',
  'order',
  'source_item_id',
  'codename',
  'source_last_modified',
  'source_row',
  'source_column',
]);
const words = (key: string) =>
  key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** A readable list of original table cells, including units and published values. */
function PublishedFields({ data }: { data: Record<string, PublishedValue> }) {
  return (
    <Group gap={rhythm.tight}>
      {Object.entries(data).flatMap(([key, value]) => {
        if (value === null || technical.has(key)) return [];
        return [
          <View key={key} style={{ gap: rhythm.line }}>
            <Text variant="secondary">{words(key)}</Text>
            {typeof value === 'object' && !Array.isArray(value) ? (
              <PublishedFields data={value} />
            ) : (
              <Text selectable>
                {Array.isArray(value)
                  ? value.map(String).join('; ')
                  : typeof value === 'number'
                    ? formatCount(value)
                    : String(value)}
              </Text>
            )}
          </View>,
        ];
      })}
    </Group>
  );
}

function OfficialDocuments({
  documents,
}: {
  documents: NonNullable<OfficialReport['record']['documents']>;
}) {
  return (
    <>
      {documents.map((doc, index) => (
        <Group key={index} gap={rhythm.tight}>
          {doc.title ? <Heading level={3}>{doc.title}</Heading> : null}
          {doc.kind === 'hearing_transcript' ? (
            <Text>Hearing transcript: evidence, not findings.</Text>
          ) : null}
          {doc.date ? (
            <Text variant="secondary">
              {reportDate(doc.date, doc.date_basis ?? null)}
            </Text>
          ) : null}
          {doc.text ? <Text selectable>{doc.text}</Text> : null}
          {doc.cite ? <CitationLink cite={doc.cite} /> : null}
          {doc.page_url || doc.url ? (
            <LinkRow
              title="Official document"
              external={{
                url: (doc.page_url || doc.url)!,
                label: doc.title || 'Official document',
              }}
            />
          ) : null}
          {doc.files?.map((file, i) => (
            <LinkRow
              key={i}
              title={file.name || 'Report PDF'}
              external={{ url: file.url, label: file.name || 'Report PDF' }}
            />
          ))}
        </Group>
      ))}
    </>
  );
}

function ReportItems({
  report,
  part,
}: {
  report: OfficialReport;
  part: 'findings' | 'recommendations';
}) {
  const items = report.record[part] ?? [];
  const status = report.record[`${part}_status`];
  return (
    <Group gap={rhythm.block} testID={`report-${part}`}>
      <SectionHeader
        title={
          part === 'findings'
            ? 'Findings, opinions and statements'
            : 'Recommendations'
        }
      />
      {status ? (
        <Text variant="secondary">
          {words(part)} status: {status.replace(/_/g, ' ')}
        </Text>
      ) : null}
      {items.length ? (
        items.map((item, index) => (
          <Group key={index} gap={rhythm.tight}>
            <Heading level={3}>
              {item.label ??
                (part === 'recommendations'
                  ? `Recommendation${'number' in item && item.number ? ` ${item.number}` : ''}`
                  : item.kind)}
            </Heading>
            {item.kind ? (
              <Text variant="secondary">{item.kind.replace(/_/g, ' ')}</Text>
            ) : null}
            {'report' in item && item.report ? (
              <Text variant="secondary">
                {report.record.reports?.find((r) => r.key === item.report)
                  ?.title || item.report}
              </Text>
            ) : null}
            <Text selectable testID={`report-${part}-${index}-text`}>
              {item.text}
            </Text>
            <CitationLink
              cite={item.cite}
              testID={`report-${part}-${index}-cite`}
            />
            {'status' in item && item.status ? (
              <Group gap={rhythm.tight}>
                <Heading level={3}>Government-published status</Heading>
                <Text selectable>{item.status.as_published}</Text>
                {item.status.lead ? <Text>{item.status.lead}</Text> : null}
                {item.status.updated ? (
                  <Text>Updated {item.status.updated}</Text>
                ) : null}
                <CitationLink cite={item.status.cite} />
              </Group>
            ) : null}
          </Group>
        ))
      ) : (
        <Text>
          {status === 'stated_none'
            ? `The report states that it makes no ${part}.`
            : `No ${part} are reproduced in this record. This does not establish that the report contains none.`}
        </Text>
      )}
    </Group>
  );
}

export function ReportContent({ report }: { report: OfficialReport }) {
  const r = report.record;
  const inquiry = ['royal_commission', 'integrity_report'].includes(
    report.report_type,
  );
  const documents = [
    ...(r.reports ?? []),
    ...(r.documents ?? []),
    ...(r.transcripts ?? []),
  ];
  const links = [
    r.pdf_url,
    r.page_url,
    r.source_url,
    r.catalogue_url,
    r.corrigendum_url,
    r.reuse_terms_url,
  ];
  return (
    <Group gap={rhythm.group}>
      <Group gap={rhythm.tight}>
        <Heading level={1} testID="report-title">
          {report.title}
        </Heading>
        <Text variant="secondary">{reportTypeLabel(report.report_type)}</Text>
        <Text>
          {report.body} ·{' '}
          {report.publisher.jurisdiction_name || report.jurisdiction}
        </Text>
        {report.year ? <Text>{report.year}</Text> : null}
        <Text variant="secondary" testID="report-date">
          {reportDate(report.date, report.date_basis)}
        </Text>
      </Group>
      <InsetGroup header="Official sources">
        <CitationLink cite={report.citation} testID="report-official-source" />
        {[
          ...new Set(
            links.filter((v): v is string => !!v && v !== report.citation.url),
          ),
        ].map((url) => (
          <LinkRow
            key={url}
            title="Official source"
            detail={url}
            external={{ url, label: report.title }}
          />
        ))}
      </InsetGroup>
      <Group gap={rhythm.tight}>
        <SectionHeader title="About this record" />
        {report.caveats.map((note, i) => (
          <Text key={i} selectable>
            {note}
          </Text>
        ))}
        {[r.edition_note, r.rights_note, r.attribution, r.file_note]
          .filter(Boolean)
          .map((note, i) => (
            <Text key={`note-${i}`}>{note}</Text>
          ))}
      </Group>
      {r.court_context?.length ? (
        <Group gap={rhythm.block}>
          <SectionHeader title="Court context" />
          {r.court_context.map((item, i) => (
            <Group key={i} gap={rhythm.tight}>
              {item.applies_to ? (
                <Text variant="secondary">{item.applies_to}</Text>
              ) : null}
              <Text selectable>{item.text}</Text>
              <CitationLink cite={item.cite} />
            </Group>
          ))}
        </Group>
      ) : null}
      {documents.length ? (
        <Group gap={rhythm.block}>
          <SectionHeader title="Official documents" />
          <OfficialDocuments documents={documents} />
        </Group>
      ) : null}
      {inquiry ? (
        <>
          <ReportItems report={report} part="findings" />
          <ReportItems report={report} part="recommendations" />
        </>
      ) : null}
      {r.responses?.length ? (
        <Group gap={rhythm.block}>
          <SectionHeader title="Published responses" />
          <OfficialDocuments documents={r.responses} />
        </Group>
      ) : null}
      {report.report_type === 'agency_report' ? (
        <Group gap={rhythm.block} testID="report-figures">
          <SectionHeader title="Figures as published" />
          {report.facts.length ? (
            report.facts.map((fact) => (
              <Group key={fact.id} gap={rhythm.tight}>
                <Heading level={3}>{fact.label}</Heading>
                <Text>{fact.value_as_published}</Text>
                <PublishedFields
                  data={Object.fromEntries(
                    Object.entries(fact).filter(
                      ([k, v]) =>
                        ![
                          'id',
                          'label',
                          'value',
                          'value_as_published',
                          'quote',
                          'source_url',
                          'page',
                        ].includes(k) && v != null,
                    ),
                  )}
                />
                <Text selectable>{fact.quote}</Text>
                <CitationLink
                  cite={{
                    url: fact.source_url,
                    document: report.title,
                    page: fact.page,
                  }}
                />
              </Group>
            ))
          ) : (
            <Text>
              No figures are reproduced in this record. This does not establish
              that the report contains none.
            </Text>
          )}
        </Group>
      ) : null}
      {report.report_type === 'annual_report' ? (
        <>
          {report.headline ? (
            <Group gap={rhythm.block} testID="report-headline">
              <SectionHeader title="Published headline figures" />
              {Object.entries(report.headline).flatMap(([key, value]) => {
                if (Array.isArray(value))
                  return [
                    <View key={key}>
                      <Text variant="secondary">{words(key)}</Text>
                      <Text>{value.join('; ')}</Text>
                    </View>,
                  ];
                if (!value || typeof value !== 'object' || Array.isArray(value))
                  return [];
                const codename = value.codename;
                return [
                  <Group key={key} gap={rhythm.tight}>
                    <Heading level={3}>{words(key)}</Heading>
                    <PublishedFields data={value} />
                    {typeof codename === 'string' ? (
                      <LinkRow
                        title="Official source table"
                        external={{
                          url: `https://previewapi.transparency.gov.au/delivery/items?${new URLSearchParams({ 'system.codename': codename, depth: '1' })}`,
                          label: 'Official source table',
                        }}
                      />
                    ) : null}
                  </Group>,
                ];
              })}
            </Group>
          ) : null}
          <Group gap={rhythm.block} testID="report-tables">
            <SectionHeader title="Published disclosure tables" />
            {report.tables.length ? (
              report.tables.map((table, i) => (
                <Group key={i} gap={rhythm.block}>
                  <Heading level={3}>{table.title}</Heading>
                  <Text>Unit: {table.unit}</Text>
                  <CitationLink
                    cite={{ url: table.source_url, document: table.title }}
                  />
                  {table.source_file ? (
                    <Text variant="secondary">{table.source_file}</Text>
                  ) : null}
                  {table.entity_as_published ? (
                    <Text>{table.entity_as_published}</Text>
                  ) : null}
                  {table.rows.map((row, j) => (
                    <Group key={j} gap={rhythm.tight}>
                      <PublishedFields data={row} />
                      <CitationLink
                        cite={{
                          url: table.source_url,
                          document: table.title,
                          section:
                            row.source_row != null
                              ? `Data file row ${row.source_row}${row.source_column != null ? `, column ${row.source_column}` : ''}`
                              : `Source record ${row.record_id}`,
                        }}
                      />
                    </Group>
                  ))}
                </Group>
              ))
            ) : (
              <Text>
                No disclosure tables are loaded for this body and year.
              </Text>
            )}
          </Group>
        </>
      ) : null}
      {[
        ['Record notes', r.notes],
        ['Coverage gaps', r.gaps],
        ['Publisher coverage', report.publisher.gaps],
      ].map(([title, notes]) =>
        Array.isArray(notes) && notes.length ? (
          <Group key={String(title)} gap={rhythm.tight}>
            <SectionHeader title={String(title)} />
            {notes.map((note, i) => (
              <Text key={i}>{note}</Text>
            ))}
          </Group>
        ) : null,
      )}
      <SourceLine
        dateRole="recorded"
        asOf={report.snapshot_at}
        citation={[report.body]}
        originals={[
          {
            label: report.body,
            url: report.citation.url,
            record: report.citation.document,
          },
        ]}
        notes={report.caveats}
        testID="report-provenance"
      />
    </Group>
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
  return (
    <Screen
      testID="report-screen"
      barTitle={embedded ? undefined : record?.data.title}
    >
      {!isReportSlug(slug) ? (
        <ContentUnavailable
          symbol="link"
          title="This link doesn't open a record"
        />
      ) : error ? (
        <RecordLoadError
          slug=""
          error={error}
          onRetry={retry}
          subject="This report"
          testID="report-error"
        />
      ) : record ? (
        <ReportContent report={record.data} />
      ) : (
        <Skeleton shape="rows" count={4} label="Loading report" />
      )}
    </Screen>
  );
}
