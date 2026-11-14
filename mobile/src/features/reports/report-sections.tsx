import { View } from 'react-native';
import type { OfficialReport, PublishedValue } from '../../api/report-decoders';
import { formatCount, formatDate } from '../../design/format';
import { Group } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { reportDate } from './report-present';
import {
  CitationLink,
  Disclosure,
  Heading,
  Link,
  Prose,
  RuleGroup,
  Text,
  useDisclosure,
  useReportColors,
} from './report-ui';
import {
  asObject,
  citationLabel,
  dollars,
  factPrinted,
  factReadable,
  recommendationIndex,
  rightsText,
  same,
  statusCounts,
  words,
  type Fact,
  type InfoRow,
  type ReportDocument,
} from './report-model';

export function InfoRows({ rows, main }: { rows: InfoRow[]; main: string }) {
  return (
    <Group>
      {rows.map((row, i) => (
        <Group key={i} gap={rhythm.line}>
          <Text variant="secondary">{row.label}</Text>
          <Text selectable>{row.value}</Text>
          {row.cite ? (
            <CitationLink cite={row.cite} mainDocument={main} />
          ) : null}
        </Group>
      ))}
    </Group>
  );
}
export function Documents({
  documents,
  report,
}: {
  documents: ReportDocument[];
  report: OfficialReport;
}) {
  return (
    <Group gap={rhythm.group}>
      {documents.map((doc, index) => {
        const title =
          doc.title || words(doc.key || doc.kind || doc.role || 'Document');
        const url = doc.page_url || doc.url;
        const detail = [
          words(doc.document_kind || doc.kind || doc.role || ''),
          doc.date ? reportDate(doc.date, doc.date_basis || null) : '',
          doc.pages ? `${formatCount(doc.pages)} pages` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const rows = [
          {
            label: 'Recommendations',
            value:
              doc.recommendations == null
                ? ''
                : formatCount(doc.recommendations),
          },
          {
            label: 'Recommendations status',
            value: doc.recommendations_status
              ? words(doc.recommendations_status)
              : '',
          },
          {
            label: 'Date as printed',
            value: doc.date_quote || '',
            cite: doc.date_cite,
          },
          {
            label: 'Status',
            value:
              doc.status && doc.status !== 'ready' ? words(doc.status) : '',
          },
          { label: 'Publisher', value: doc.publisher || '' },
          { label: 'Tabled in', value: doc.tabled_in || '' },
          { label: 'Recommendation', value: doc.recommendation || '' },
          {
            label: 'Status as published',
            value: doc.status_as_published || '',
          },
          { label: 'How OPAX got it', value: doc.acquisition || '' },
          { label: 'Rights', value: rightsText(doc.rights) },
          { label: 'Note', value: doc.note || '' },
        ].filter((row) => row.value);
        return (
          <RuleGroup key={index} gap={rhythm.tight}>
            <Heading level={3}>{title}</Heading>
            {detail ? <Text variant="secondary">{detail}</Text> : null}
            {doc.kind === 'hearing_transcript' ? (
              <Text>Hearing transcript: evidence, not findings.</Text>
            ) : null}
            {url ? <Link title={title} url={url} /> : null}
            {doc.files?.map((file, i) => (
              <Link
                key={i}
                title={`PDF: ${file.name || title}`}
                detail={[
                  file.pages ? `${formatCount(file.pages)} pages` : '',
                  file.bytes ? `${(file.bytes / 1048576).toFixed(1)} MB` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                url={file.url}
              />
            ))}
            {doc.text ? <Text selectable>{doc.text}</Text> : null}
            {doc.cite && doc.cite.url !== url ? (
              <CitationLink
                cite={doc.cite}
                mainDocument={report.citation.document}
              />
            ) : null}
            {rows.length ? (
              <Disclosure
                id={`document-${index}-${title}`}
                title={`Document details: ${title}`}
              >
                <InfoRows rows={rows} main={report.citation.document} />
              </Disclosure>
            ) : null}
          </RuleGroup>
        );
      })}
    </Group>
  );
}
function RecommendationNumbers({
  report,
  jump,
}: {
  report: OfficialReport;
  jump: (id: string) => void;
}) {
  const index = recommendationIndex(report);
  const picker = useDisclosure('report-recommendation-picker');
  if (!index.items.length) return null;
  const links = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.tight }}>
      {index.items.map((item, i) => (
        <View key={i} style={{ minWidth: 48 }}>
          <Link
            title={item.number!}
            accessibilityLabel={`Go to recommendation ${item.number}`}
            testID={`report-number-${i}`}
            onPress={() => {
              picker.close();
              requestAnimationFrame(() =>
                requestAnimationFrame(() => jump(`recommendation-${i}`)),
              );
            }}
          />
        </View>
      ))}
    </View>
  );
  return index.folded ? (
    <Disclosure
      id="report-recommendation-picker"
      title={`Go to a recommendation (${index.items[0]!.number} to ${index.items[index.items.length - 1]!.number})`}
    >
      {links}
    </Disclosure>
  ) : (
    <Group testID="report-recommendation-numbers">
      <Text variant="secondary">Go to a recommendation</Text>
      {links}
    </Group>
  );
}
export function Items({
  report,
  part,
  anchor,
  jump,
}: {
  report: OfficialReport;
  part: 'findings' | 'recommendations';
  anchor: (id: string, node: View | null) => void;
  jump: (id: string) => void;
}) {
  const items = report.record[part] || [],
    status = report.record[`${part}_status`];
  const caveat =
    part === 'findings'
      ? report.caveats.find((x) => /^Allegations are not findings/.test(x))
      : report.report_type === 'royal_commission' && items.length
        ? report.caveats.find((x) =>
            /not findings of criminal or civil liability/.test(x),
          )
        : undefined;
  const counts = part === 'recommendations' ? statusCounts(report) : [];
  const total = counts.reduce((n, x) => n + x.count, 0);
  const palette = useReportColors();
  return (
    <Group gap={rhythm.group} testID={`report-${part}`}>
      {caveat ? (
        <Text selectable testID={`report-${part}-caveat`} variant="secondary">
          {caveat}
        </Text>
      ) : null}
      {status === 'partial' ? (
        <Text variant="secondary">{`Only some of the ${part} are reproduced here, from the official copies OPAX could read.`}</Text>
      ) : null}
      {total ? (
        <Group gap={rhythm.tight}>
          <Text variant="secondary">{`${total} ${total === 1 ? 'recommendation has' : 'recommendations have'} a status published by government, shown in the government’s own words.`}</Text>
          {counts.map(({ label, count }) => (
            <Text
              key={label}
              testID="report-status-count"
              accessibilityLabel={`${count} ${label}`}
            >{`${label} ${formatCount(count)}`}</Text>
          ))}
        </Group>
      ) : null}
      {part === 'recommendations' ? (
        <RecommendationNumbers report={report} jump={jump} />
      ) : null}
      {items.length ? (
        items.map((item, index) => {
          const label =
            item.label ??
            (part === 'recommendations'
              ? `Recommendation${'number' in item && item.number ? ` ${item.number}` : ''}`
              : words(item.kind || ''));
          const from =
            'report' in item &&
            report.record.reports &&
            report.record.reports.length > 1
              ? report.record.reports.find(
                  (d) =>
                    d.key === item.report &&
                    !same(d.title || '', item.cite.document),
                )
              : undefined;
          return (
            <View
              key={index}
              ref={(node) =>
                anchor(
                  `${part === 'recommendations' ? 'recommendation' : 'finding'}-${index}`,
                  node,
                )
              }
              collapsable={false}
            >
              <RuleGroup gap={rhythm.tight}>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    gap: rhythm.tight,
                  }}
                >
                  <Heading level={3} style={{ flexShrink: 1 }}>
                    {label}
                  </Heading>
                  {part === 'findings' && item.kind ? (
                    <View
                      style={{
                        borderRadius: 4,
                        borderCurve: 'continuous',
                        paddingHorizontal: rhythm.tight,
                        backgroundColor: palette.sunken,
                      }}
                    >
                      <Text variant="secondary">{words(item.kind)}</Text>
                    </View>
                  ) : null}
                </View>
                {from?.title ? (
                  <Text variant="secondary">{from.title}</Text>
                ) : null}
                <Prose
                  text={item.text}
                  testID={`report-${part}-${index}-text`}
                />
                <CitationLink
                  cite={item.cite}
                  mainDocument={report.citation.document}
                  testID={`report-${part}-${index}-cite`}
                />
                {'status' in item && item.status ? (
                  <Group gap={rhythm.line}>
                    <Text variant="secondary" testID={`report-status-${index}`}>
                      {[
                        'Government-published status: ' +
                          item.status.as_published,
                        item.status.lead ? `Lead: ${item.status.lead}` : '',
                        item.status.updated
                          ? `Updated ${formatDate(item.status.updated)}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <CitationLink cite={item.status.cite} />
                  </Group>
                ) : null}
              </RuleGroup>
            </View>
          );
        })
      ) : (
        <Text>
          {status === 'stated_none'
            ? `The report states that it makes no ${part}.`
            : status === 'no_report'
              ? 'No report is held for this inquiry, so no recommendations are reproduced.'
              : `No ${part} are reproduced in this record. This does not establish that the report contains none.`}
        </Text>
      )}
    </Group>
  );
}
export function Facts({
  facts,
  report,
}: {
  facts: Fact[];
  report: OfficialReport;
}) {
  return (
    <Group>
      {facts.length ? (
        facts.map((fact) => (
          <RuleGroup key={fact.id} gap={rhythm.tight}>
            <Heading level={3}>
              {fact.counterparty || fact.name || fact.label}
            </Heading>
            <Text variant="tileFigure" tabular>
              {factReadable(fact)}
            </Text>
            <Text variant="secondary">{`Printed as ${factPrinted(fact)} · ${citationLabel({ url: fact.source_url, document: report.citation.document, page: fact.page }, report.citation.document)}`}</Text>
            {fact.counterparty || fact.name ? (
              <Text variant="secondary">{fact.label}</Text>
            ) : null}
            {[
              fact.position,
              fact.purpose,
              fact.column && fact.column !== fact.period
                ? `Column: ${fact.column}`
                : '',
              fact.period,
              fact.band && fact.band !== fact.label ? `Band: ${fact.band}` : '',
              fact.note,
            ]
              .filter(Boolean)
              .map((value, i) => (
                <Text key={i} variant="secondary">
                  {value}
                </Text>
              ))}
            <Text selectable>{fact.quote}</Text>
            <CitationLink
              cite={{
                url: fact.source_url,
                document: report.citation.document,
                page: fact.page,
              }}
              mainDocument={report.citation.document}
            />
          </RuleGroup>
        ))
      ) : (
        <Text>{`${report.record.status === 'not_read_no_text' ? 'The file is a scan without a text layer, so OPAX has not read figures from it. ' : ''}No figures are reproduced in this record. This does not establish that the report contains none.`}</Text>
      )}
    </Group>
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
  'kind',
]);
/** Stack source cells at any text size; original values take precedence over numbers. */
export function PublishedFields({
  data,
  unit,
  headline = false,
}: {
  data: Record<string, PublishedValue>;
  unit?: string;
  headline?: boolean;
}) {
  const printed = asObject(data.as_published);
  return (
    <Group gap={rhythm.block}>
      {Object.entries(data).flatMap(([key, value]) => {
        if (
          value == null ||
          technical.has(key) ||
          key === 'as_published' ||
          key === 'unit' ||
          key === 'duplicate_tables'
        )
          return [];
        const cell = printed[key] ?? value;
        if (typeof value === 'object' && !Array.isArray(value))
          return [
            <Group key={key} gap={rhythm.tight}>
              <Text variant="secondary">{words(key)}</Text>
              <PublishedFields data={value} unit={unit} />
            </Group>,
          ];
        const money =
          typeof value === 'number' &&
          (headline
            ? unit === "$'000" &&
              ![
                'contracts',
                'new_contracts',
                'ongoing_contracts',
                'headcount',
              ].includes(key)
            : [
                'base_salary',
                'bonuses',
                'other_benefits',
                'superannuation',
                'long_service_leave',
                'other_long_term',
                'termination',
                'total',
                'expenditure_thousands',
                'expenditure_dollars',
              ].includes(key));
        const readable = money
          ? dollars(
              (value as number) *
                (headline || key === 'expenditure_thousands' ? 1000 : 1),
            )
          : typeof cell === 'number'
            ? formatCount(cell)
            : Array.isArray(cell)
              ? cell.map(String).join('; ')
              : String(cell);
        return [
          <Group key={key} gap={rhythm.line}>
            <Text variant="secondary">{words(key)}</Text>
            <Text selectable>{readable}</Text>
            {money ? (
              <Text variant="secondary">{`Printed as ${typeof cell === 'number' ? formatCount(cell) : String(cell)}${unit ? ` in ${unit}` : ''}`}</Text>
            ) : null}
          </Group>,
        ];
      })}
    </Group>
  );
}
export function AnnualFigures({ report }: { report: OfficialReport }) {
  const order = [
    'income_statement',
    'ongoing_staff',
    'non_ongoing_staff',
    'consultancy',
    'non_consultancy',
  ];
  const headline = report.headline || {};
  const keys = [
    ...order,
    ...Object.keys(headline).filter((key) => !order.includes(key)),
  ];
  return (
    <Group testID="report-headline">
      {keys.flatMap((key) => {
        const data = asObject(headline[key]);
        if (!Object.keys(data).length) return [];
        const label =
          {
            income_statement: 'Income statement extract',
            ongoing_staff: 'Ongoing staff',
            non_ongoing_staff: 'Non-ongoing staff',
            consultancy: 'Consultancy contracts',
            non_consultancy: 'Non-consultancy contracts',
          }[key] || words(key);
        const unit =
          typeof data.unit === 'string'
            ? data.unit
            : ['consultancy', 'non_consultancy'].includes(key)
              ? "$'000"
              : undefined;
        return [
          <RuleGroup key={key}>
            <Heading level={3}>{label}</Heading>
            <PublishedFields data={data} unit={unit} headline />
            {unit ? (
              <Text variant="secondary">{`Unit: ${typeof data.unit_basis === 'string' ? data.unit_basis : unit}`}</Text>
            ) : null}
            {typeof data.codename === 'string' ? (
              <Link
                title={`${label} table on the Transparency Portal (JSON)`}
                url={`https://previewapi.transparency.gov.au/delivery/items?${new URLSearchParams({ 'system.codename': data.codename, depth: '1' })}`}
              />
            ) : null}
          </RuleGroup>,
        ];
      })}
    </Group>
  );
}
export function AnnualTables({ report }: { report: OfficialReport }) {
  return (
    <Group testID="report-tables">
      {report.tables.length ? (
        report.tables.map((table, index) => (
          <Disclosure
            key={index}
            id={`report-table-${index}`}
            title={table.title}
            initiallyOpen={table.rows.length <= 8}
            detail={`${formatCount(table.rows.length)} rows · Unit: ${table.unit}`}
          >
            <Link
              title={
                table.source_file
                  ? `Data file: ${table.source_file}`
                  : `${table.title}: source table on the Transparency Portal`
              }
              url={table.source_url}
            />
            {table.licence ? (
              <Text variant="secondary">{`Licence ${{ 'cc-by-4.0': 'CC BY 4.0', 'cc-by-3.0-au': 'CC BY 3.0 AU' }[table.licence] || table.licence}`}</Text>
            ) : null}
            {table.entity_as_published &&
            table.entity_as_published !== report.body ? (
              <Text>{table.entity_as_published}</Text>
            ) : null}
            {table.source_page ? (
              <Link
                title={`Data file page: ${table.title}`}
                url={table.source_page}
              />
            ) : null}
            {table.rows.map((row, i) => (
              <RuleGroup key={i}>
                <Heading level={3}>
                  {String(
                    row.name ||
                      row.organisation ||
                      row.band ||
                      words(String(row.kind)),
                  )}
                </Heading>
                <PublishedFields data={row} unit={table.unit} />
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
              </RuleGroup>
            ))}
          </Disclosure>
        ))
      ) : (
        <Text>No disclosure tables are loaded for this body and year.</Text>
      )}
    </Group>
  );
}
