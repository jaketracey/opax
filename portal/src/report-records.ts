import type { RecordRow } from './tools/published-records'

const object = (value: unknown): RecordRow => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordRow : {}
const records = (value: unknown): RecordRow[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) : []

export type ReportType = 'royal_commission' | 'integrity_report' | 'annual_report' | 'agency_report'
export interface ReportCitation { url: string; document: string; page?: number; section?: string }
/** GET /api/report/:slug, schema 1. Null date means no published/tabled day is
 * held, never the snapshot date. `record` is the original commission, integrity
 * report, body-year report metadata, or agency document, selected by report_type.
 * Findings/recommendations keep their labels, numbers, kinds and cite objects in
 * record. Annual tables keep original rows and units; agency facts keep quotes,
 * pages and source_url. Page and API consume this same offline projection. */
export interface ReportDetail {
  schema: 1; kind: 'report'; report_type: ReportType; slug: string; title: string; body: string; jurisdiction: string
  date: string | null; date_basis: string | null; year: string | null; snippet: string; citation: ReportCitation
  snapshot_at: string; caveats: string[]; publisher: RecordRow; record: RecordRow
  facts: RecordRow[]; tables: RecordRow[]; headline: RecordRow | null
}
export const REPORT_SLUG = /^(?:royal-commission|integrity-report|annual-report|agency-report)-[a-z0-9]+(?:-[a-z0-9]+)*$/
export async function readReport(assets: Fetcher, slug: string): Promise<ReportDetail | null> {
  if (slug.length > 260 || !REPORT_SLUG.test(slug)) return null
  const response = await assets.fetch(new Request(`https://opax.com.au/report-records/${slug}.json`))
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Report record unavailable')
  const data = await response.json<ReportDetail>()
  if (data.schema !== 1 || data.kind !== 'report' || data.slug !== slug) throw new Error('Invalid report record')
  return data
}
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const url = (value: unknown) => typeof value === 'string' && /^https:\/\//.test(value) ? value : null
const text = (value: unknown) => `<p class="report-record-text">${esc(value)}</p>`
const section = (title: string, body: string) => `<section class="ui-section"><h2 class="ui-section-title">${esc(title)}</h2>${body}</section>`
const list = (values: unknown) => Array.isArray(values) ? values.map(text).join('') : ''
const link = (href: unknown, label: unknown) => url(href) ? `<a href="${esc(href)}" rel="noopener">${esc(label || href)}</a>` : ''
const DATE_BASIS: Record<string, string> = { tabled: 'Tabled', tabled_vic: 'Tabled in the Parliament of Victoria', published: 'Published', stated: 'Dated', dated: 'Dated', updated: 'Page updated', released: 'Released' }
function citation(raw: unknown) {
  const c = object(raw), href = url(c.url)
  if (!href) return ''
  const page = c.page == null ? '' : `, page ${c.page}`
  const target = c.page != null && /\.pdf(?:$|\?)/i.test(href) && !href.includes('#') ? `${href}#page=${c.page}` : href
  return `<p class="ui-meta report-record-source">${link(target, c.document || 'Official source')}${esc(page)}${c.section ? `, ${esc(c.section)}` : ''}</p>`
}
function fields(row: RecordRow, keys: string[]): string {
  const entries = keys.filter(k => row[k] !== undefined && row[k] !== null)
  return entries.length ? `<dl class="report-record-fields">${entries.map(k => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${typeof row[k] === 'object' && !Array.isArray(row[k]) ? fields(object(row[k]), Object.keys(object(row[k]))) : esc(Array.isArray(row[k]) ? row[k].join('; ') : row[k])}</dd>`).join('')}</dl>` : ''
}
function sourceDocument(d: RecordRow) {
  const date = d.date ? `<p>${esc(DATE_BASIS[String(d.date_basis)] || 'Dated')} ${esc(d.date)}</p>` : ''
  return `<article class="ui-section"><h3>${esc(d.title || d.key || d.kind)}</h3>${d.kind === 'hearing_transcript' ? text('Hearing transcript: evidence, not findings.') : ''}${date}${link(d.page_url || d.url, 'Official document')}${records(d.files).map(f => `<p>${link(f.url, f.name || 'Report PDF')}${f.pages ? ` (${esc(f.pages)} pages)` : ''}</p>`).join('')}${citation(d.cite)}${d.date_quote ? text(d.date_quote) + citation(d.date_cite) : ''}${fields(d, ['recommendations_status', 'recommendations', 'status', 'role', 'pages', 'acquisition', 'rights', 'note'])}</article>`
}
function items(part: 'findings' | 'recommendations', r: RecordRow) {
  const held = records(r[part])
  const state = r[part + '_status']
  // An unextracted list is unknown, not a report that made no findings.
  const empty = state === 'stated_none' ? `The report states that it makes no ${part}.` : `No ${part} are reproduced in this record. This does not establish that the report contains none.`
  return section(part === 'findings' ? 'Findings, opinions and statements' : 'Recommendations',
    (state ? fields(r, [part + '_status']) : '') + (held.length ? `<ol class="report-record-items" role="list">${held.map(item => {
      const label = item.label ?? (part === 'recommendations' ? `Recommendation${item.number == null ? '' : ' ' + item.number}` : item.kind)
      const status = item.status ? object(item.status) : null
      const report = records(r.reports).find(d => d.key === item.report)
      return `<li><h3>${esc(label)}</h3>${item.kind ? `<p>${esc(item.kind)}</p>` : ''}${report ? text(report.title) : ''}${text(item.text)}${citation(item.cite)}${status ? `<h4>Government-published status</h4>${text(status.as_published)}${fields(status, ['lead', 'updated'])}${citation(status.cite)}` : ''}</li>`
    }).join('')}</ol>` : text(empty)))
}
function annual(r: ReportDetail) {
  const technical = new Set(['record_id', 'table_id', 'order', 'source_item_id', 'codename', 'source_last_modified'])
  const clean = (row: RecordRow) => Object.fromEntries(Object.entries(row).filter(([key]) => !technical.has(key)))
  const headline = r.headline ? section('Published headline figures', Object.entries(r.headline).filter(([, v]) => v && typeof v === 'object').map(([key, raw]) => {
    const v = object(raw), source = v.codename ? `https://previewapi.transparency.gov.au/delivery/items?system.codename=${v.codename}&depth=1` : null
    return `<article><h3>${esc(key.replace(/_/g, ' '))}</h3>${fields(clean(v), Object.keys(clean(v)))}${link(source, 'Official source table')}</article>`
  }).join('')) : ''
  return headline + section('Published disclosure tables', r.tables.length ? r.tables.map(t => `<details class="ui-disclosure"><summary>${esc(t.title)}</summary><div class="ui-disclosure-body">${link(t.source_url, 'Official source table or data file')}${fields(t, ['unit', 'source_file', 'source_page', 'entity_as_published', 'licence'])}${records(t.rows).map(row => `<article class="ui-section">${fields(clean(row), Object.keys(clean(row)))}${citation({ url: t.source_url, document: t.title, section: row.source_row == null ? undefined : `Data file row ${row.source_row}${row.source_column ? ', column ' + row.source_column : ''}` })}</article>`).join('')}</div></details>`).join('') : text('No disclosure tables are loaded for this body and year.'))
}
function agency(r: ReportDetail) {
  return fields(r.record, ['edition', 'edition_note', 'status', 'pages', 'rights_note', 'attribution', 'file_note', 'not_found']) +
    section('Figures as published', r.facts.length ? r.facts.map(f => `<article class="ui-section"><h3>${esc(f.label)}</h3>${fields(f, ['column', 'value_as_published', 'unit', 'period', 'name', 'position', 'band', 'counterparty', 'purpose', 'note'])}${text(f.quote)}${citation({ url: f.source_url, document: r.title, page: f.page })}</article>`).join('') : text('No figures are reproduced in this record. This does not establish that the report contains none.'))
}
export function renderReport(r: ReportDetail) {
  const c = r.record
  const docs = r.report_type === 'royal_commission' ? [...records(c.reports), ...records(c.responses), ...records(c.transcripts)] : records(c.documents)
  const court = records(c.court_context)
  const body = `<p>${esc(r.body)} · ${esc(r.publisher.jurisdiction_name || r.jurisdiction)}</p>${r.year ? text(r.year) : ''}${r.date ? `<p>${esc(DATE_BASIS[r.date_basis || ''] || 'Dated')} ${esc(r.date)}</p>` : text('No published or tabled day is recorded.')}` +
    citation(r.citation) + [c.pdf_url, c.page_url, c.source_url, c.catalogue_url, c.corrigendum_url, c.reuse_terms_url].filter(Boolean).map(u => `<p>${link(u, u)}</p>`).join('') +
    section('About this record', list(r.caveats)) +
    (r.report_type === 'royal_commission' ? fields(c, ['inquiry_type', 'interim_report_date', 'final_report_date', 'recommendations_status', 'status_as_published']) +
      (c.established ? section('Establishment', text(object(c.established).quote) + fields(object(c.established), ['date', 'instrument']) + citation(object(c.established).cite)) : '') +
      (records(c.commissioners).length ? section('Commissioners', records(c.commissioners).map(p => text(p.quote || `${p.name} (${p.role})`) + citation(p.cite)).join('')) : '') : '') +
    (court.length ? section('Court context', court.map(x => text(x.text) + citation(x.cite)).join('')) : '') +
    (docs.length ? section('Official documents', docs.map(sourceDocument).join('')) : '') +
    (r.report_type === 'integrity_report' ? fields(c, ['type_as_published', 'date_basis', 'period', 'findings_status', 'recommendations_status', 'responses_status']) + items('findings', c) : '') +
    (r.report_type === 'royal_commission' || r.report_type === 'integrity_report' ? items('recommendations', c) : '') +
    (r.report_type === 'integrity_report' && records(c.responses).length ? section('Published responses', records(c.responses).map(x => sourceDocument(x) + (x.text ? text(x.text) : '') + fields(x, ['publisher', 'tabled_in', 'recommendation', 'status_as_published'])).join('')) : '') +
    (r.report_type === 'annual_report' ? annual(r) : r.report_type === 'agency_report' ? agency(r) : '') +
    (Array.isArray(c.notes) && c.notes.length ? section('Record notes', list(c.notes)) : '') +
    (Array.isArray(c.gaps) && c.gaps.length ? section('Coverage gaps', list(c.gaps)) : '') +
    (Array.isArray(r.publisher.gaps) && r.publisher.gaps.length ? section('Publisher coverage', list(r.publisher.gaps)) : '') +
    (records(c.reference_pages).length ? section('Official reference pages', records(c.reference_pages).map(x => `<p>${link(x.url, x.title)}</p>`).join('')) : '') +
    `<p class="ui-meta">Record snapshot: ${esc(r.snapshot_at)}</p><p><a href="/api/report/${esc(r.slug)}">This record as JSON</a></p>`
  return `<div class="wrap report-record">${body}</div>`
}
