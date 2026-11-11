import {
  array,
  count,
  date,
  dict,
  invalid,
  matching,
  nonempty,
  nullable,
  number,
  object,
  optional,
  shape,
  text,
  url,
  type Decoder,
} from './validation';
import { isReportSlug } from './official-report-policy';

export const reportType = matching(
  /^(royal_commission|integrity_report|annual_report|agency_report)$/,
);
export const reportSlug: Decoder<string> = (value) =>
  isReportSlug(nonempty(value)) ? text(value) : invalid();
const positive: Decoder<number> = (value) =>
  count(value) > 0 ? count(value) : invalid();
export const decodeReportCitation = shape({
  url,
  document: nonempty,
  page: optional(positive),
  section: optional(nonempty),
});
export const reportSearchFields = shape({
  report_type: reportType,
  body: nonempty,
  jurisdiction: nonempty,
  date: nullable(date),
  year: nullable(nonempty),
  citation: decodeReportCitation,
  source_url: url,
});

// Open-ended published data is retained as JSON, never cast to React children.
// Every value is checked, including numbers and nested table cells.
export type PublishedValue =
  | string
  | number
  | boolean
  | null
  | PublishedValue[]
  | { [key: string]: PublishedValue };
const published: Decoder<PublishedValue> = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number') return number(value);
  if (Array.isArray(value)) return array(published)(value);
  return dict(published)(value);
};
const fields = dict(published);
const status = shape({
  as_published: nonempty,
  lead: optional(text),
  updated: optional(date),
  cite: decodeReportCitation,
});
const finding = shape({
  label: nonempty,
  kind: nonempty,
  text: nonempty,
  cite: decodeReportCitation,
  n: optional(positive),
});
const recommendation = shape({
  number: optional(text),
  label: optional(nonempty),
  kind: optional(nonempty),
  report: optional(nonempty),
  text: nonempty,
  cite: decodeReportCitation,
  status: optional(status),
});
const context = shape({
  text: nonempty,
  applies_to: optional(nonempty),
  cite: decodeReportCitation,
});
const document = shape({
  key: optional(nonempty),
  kind: optional(nonempty),
  title: optional(nonempty),
  date: optional(date),
  date_basis: optional(text),
  page_url: optional(url),
  url: optional(url),
  text: optional(text),
  cite: optional(decodeReportCitation),
  files: optional(array(shape({ url, name: optional(nonempty) }))),
});
const record = shape({
  findings: optional(array(finding)),
  recommendations: optional(array(recommendation)),
  findings_status: optional(nonempty),
  recommendations_status: optional(nonempty),
  responses_status: optional(nonempty),
  notes: optional(array(text)),
  gaps: optional(array(text)),
  court_context: optional(array(context)),
  reports: optional(array(document)),
  documents: optional(array(document)),
  responses: optional(array(document)),
  transcripts: optional(array(document)),
  pdf_url: optional(url),
  page_url: optional(url),
  source_url: optional(url),
  catalogue_url: optional(url),
  corrigendum_url: optional(url),
  reuse_terms_url: optional(url),
  edition_note: optional(text),
  rights_note: optional(text),
  attribution: optional(text),
  file_note: optional(text),
});
const fact = shape({
  id: nonempty,
  label: nonempty,
  quote: nonempty,
  unit: nonempty,
  value: nullable(number),
  value_as_published: nonempty,
  page: positive,
  source_url: url,
  column: optional(text),
  period: optional(text),
  name: optional(text),
  position: optional(text),
  band: optional(text),
  counterparty: optional(text),
  purpose: optional(text),
  note: optional(text),
});
const tableRow: Decoder<Record<string, PublishedValue>> = (value) => {
  const row = fields(value);
  nonempty(row.record_id);
  nonempty(row.table_id);
  matching(
    /^(kmp|kmp_total|kmp_other|senior_executive_band|highly_paid_band|consultancy|non_consultancy)$/,
  )(row.kind);
  if (row.source_row != null) count(row.source_row);
  if (row.order != null) count(row.order);
  if (row.source_column != null) count(row.source_column);
  for (const key of [
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
  ])
    if (Object.hasOwn(row, key)) nullable(number)(row[key]);
  if (Object.hasOwn(row, 'count')) count(row.count);
  if (Object.hasOwn(row, 'averages')) {
    for (const [key, value] of Object.entries(object(row.averages))) {
      if (key === 'as_published') dict(text)(value);
      else nullable(number)(value);
    }
  }
  if (Object.hasOwn(row, 'as_published')) dict(text)(row.as_published);
  if (Object.hasOwn(row, 'checks')) array(nonempty)(row.checks);
  for (const key of [
    'name',
    'position',
    'band',
    'organisation',
    'abn',
    'name_as_published',
    'organisation_as_published',
    'unit_as_published',
    'expenditure_as_published',
  ])
    if (Object.hasOwn(row, key)) nullable(text)(row[key]);
  return row;
};
const table = shape({
  title: nonempty,
  unit: nonempty,
  source_url: url,
  source_file: optional(nonempty),
  entity_as_published: optional(text),
  rows: array(tableRow),
});
const snapshot: Decoder<string> = (value) => {
  const input = nonempty(value);
  return /^\d{8}$/.test(input)
    ? date(`${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6)}`)
    : date(input);
};
const detail = shape({
  schema: (value: unknown) => (value === 1 ? (1 as const) : invalid()),
  kind: matching(/^report$/),
  report_type: reportType,
  slug: reportSlug,
  title: nonempty,
  body: nonempty,
  jurisdiction: nonempty,
  date: nullable(date),
  date_basis: nullable(nonempty),
  year: nullable(nonempty),
  snippet: text,
  citation: decodeReportCitation,
  snapshot_at: snapshot,
  caveats: array(text),
  publisher: shape({
    name: nonempty,
    jurisdiction_name: optional(text),
    gaps: optional(array(text)),
  }),
  record,
  facts: array(fact),
  tables: array(table),
  headline: nullable(fields),
});
export function decodeReport(value: unknown) {
  const result = detail(value);
  if (!result.slug.startsWith(result.report_type.replace(/_/g, '-') + '-'))
    invalid();
  const r = object(object(value).record);
  if (['royal_commission', 'integrity_report'].includes(result.report_type)) {
    array(recommendation)(r.recommendations);
    if (result.report_type === 'integrity_report') array(finding)(r.findings);
  }
  if (result.headline) {
    for (const [key, item] of Object.entries(result.headline)) {
      if (['record_id', 'body_id', 'year'].includes(key)) {
        nonempty(item);
        continue;
      }
      if (key === 'duplicate_tables') {
        array(nonempty)(item);
        continue;
      }
      if (item === null) continue;
      const row = object(item);
      nonempty(row.codename);
      for (const [field, value] of Object.entries(row)) {
        if (
          [
            'source_item_id',
            'codename',
            'source_last_modified',
            'unit',
            'unit_basis',
            'scale_check',
          ].includes(field)
        )
          nonempty(value);
        else nullable(number)(value);
      }
    }
  }
  return result;
}
export type OfficialReport = ReturnType<typeof decodeReport>;
