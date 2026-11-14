import {
  array,
  boolean,
  count,
  date,
  dict,
  matching,
  nonempty,
  number,
  object,
  optional,
  shape,
  text,
  url,
  invalid,
} from '../../api/validation';
import {
  decodeReportCitation,
  reportSearchFields,
  reportSlug,
  reportType,
} from '../../api/report-decoders';

const kind = matching(/^[a-z][a-z_]*$/);
const localHref = matching(/^\/(?!\/)[^\s\\]*$/);
/** Search links from OPAX exports may include the public origin. */
function recordHref(value: unknown) {
  const href = nonempty(value);
  if (href.startsWith('/')) return localHref(href);
  const absolute = new URL(url(href));
  if (
    absolute.protocol !== 'https:' ||
    !['opax.com.au', 'www.opax.com.au'].includes(absolute.host)
  )
    invalid();
  return localHref(absolute.pathname + absolute.search + absolute.hash);
}
const recordShape = shape({
  kind,
  title: nonempty,
  slug: nonempty,
  resource: text,
  snippet: text,
  href: optional(recordHref),
  source: optional(text),
  url: optional(url),
  date: optional(date),
  dateLabel: optional(text),
  speaker: optional(text),
  party: optional(text),
  state: optional(text),
  speaker_type: optional(text),
  report_type: optional(reportType),
  body: optional(nonempty),
  jurisdiction: optional(nonempty),
  year: optional(nonempty),
  citation: optional(decodeReportCitation),
  source_url: optional(url),
  // Words in the turn; absent or null (unknown) on servers before short-turn-v1.
  word_count: optional(number),
});
export function decodeRecord(value: unknown) {
  const row = recordShape(value);
  if (row.kind !== 'report') return row;
  const report = reportSearchFields(value);
  const slug = reportSlug(row.slug);
  if (
    row.href !== `/report/${slug}` ||
    row.resource !== '' ||
    !slug.startsWith(report.report_type.replace(/_/g, '-') + '-')
  )
    invalid();
  return { ...row, ...report };
}
export type SearchRecord = ReturnType<typeof decodeRecord>;
const pageShape = shape({
  query: text,
  kind,
  sort: matching(/^(relevance|newest|oldest|title_asc|title_desc|type)$/),
  page: count,
  per_page: count,
  page_count: count,
  total: count,
  count,
  truncated: boolean,
  results: array(decodeRecord),
  warnings: optional(array(text)),
  coverage: optional(text),
  years: dict(count),
});
export function decodeRecords(value: unknown) {
  const p = pageShape(value);
  if (
    p.page < 1 ||
    p.per_page < 1 ||
    p.per_page > 200 ||
    p.page_count < 1 ||
    p.page > p.page_count ||
    p.results.length !== p.count ||
    p.count > p.per_page ||
    p.total < p.count
  )
    invalid();
  // Unified bill search combines catalog bills and indexed bill text.
  if (
    p.results.some(
      (r) =>
        p.kind !== 'all' &&
        r.kind !== p.kind &&
        !(p.kind === 'bill' && r.kind === 'bill_text'),
    )
  )
    invalid();
  return { ...p, warnings: p.warnings ?? [] };
}
export type RecordsPage = ReturnType<typeof decodeRecords>;
export const decodeManifest = shape({
  version: nonempty,
  count,
  counts: dict(count),
  coverage: nonempty,
  recordShardSize: count,
});
export const decodeBriefs = shape({
  briefs: dict(nonempty, matching(/^[a-f0-9]{32}$/)),
});
const summarySource = shape({
  id: nonempty,
  title: nonempty,
  href: localHref,
  kind,
  snippet: text,
  speaker: optional(text),
  date: optional(date),
  evidence: array(nonempty),
});
const summaryPoint = shape({ text: nonempty, source_ids: array(nonempty) });
export function decodeSummary(value: unknown) {
  const v = object(value);
  if (v.status === 'empty')
    return {
      status: 'empty' as const,
      points: [],
      sources: [],
      reviewed_count: 0,
      partial: false,
    };
  if (v.status !== 'ready') invalid();
  const out = shape({
    points: array(summaryPoint),
    sources: array(summarySource),
    reviewed_count: count,
    partial: boolean,
  })(value);
  const ids = out.sources.map((s) => s.id);
  if (
    !out.points.length ||
    !out.sources.length ||
    new Set(ids).size !== ids.length ||
    out.points.some(
      (p) =>
        !p.source_ids.length || p.source_ids.some((id) => !ids.includes(id)),
    )
  )
    invalid();
  return { status: 'ready' as const, ...out };
}
export type SearchSummary = ReturnType<typeof decodeSummary>;

/** The web accepts JSON cache hits and SSE done/error events. No second call. */
export function summaryStreamBody(body: string): unknown {
  for (const event of body.replace(/\r\n/g, '\n').split('\n\n')) {
    const name = /^event:\s*(.+)$/m.exec(event)?.[1];
    const payload = event
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (name === 'error')
      invalid(
        'A cited summary is unavailable. Your matching records are still below.',
      );
    if (name === 'done') return JSON.parse(payload);
  }
  invalid('The cited summary did not finish.');
}
