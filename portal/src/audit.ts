import { AUDIT_ID, auditComplete, filterAudit, type AuditRow } from '../public/audit.js'
import { sourceLineHTML, tagHTML } from '../public/labels.js'
import { shortDate } from '../public/format.js'
import type { Crumb } from './seo-content'
import { catalogueReader } from './catalogue-reader.mjs'

interface Manifest {
  count: number; listed: number; generated_at: string; index_url: string; lookup: Record<string, number>
  bodies?: number; responses?: number; html_recommendations?: number
  chunks: { path: string; count: number }[]; facets: { year: string[]; sector: string[]; entity: string[] }
  attribution: { source: string; source_url: string; licence_url: string; copyright_url: string; copyright_notice: string; changes: string; exceptions: string; endorsement: string }
}
interface Report extends AuditRow {
  pdf_url: string | null; entity_links: Record<string, string>
  recommendations: { number: number | null; text: string; html: string; addressed_to: string | null; source_text: string; provenance?: string; page?: number; privacy_filtered?: boolean }[]
  licence: { status: string; body_skipped: boolean; exceptions: string[] }
  pdf?: { status: string; reasons: string[]; sha256: string | null; page_count: number; document_licence?: string }
  responses_path?: string; response_count?: number
  title_privacy_filtered?: boolean
}
interface EntityResponse { id: string; body: string; text: string; page_start: number; page_end: number; recommendation_numbers: number[] }
type Read = <T>(path: string) => Promise<T>
type Block = (heading: string, sentence: string, links?: string, crumbs?: Crumb[]) => string
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const auditReader = catalogueReader
const SOURCE = 'Queensland Audit Office'
const REPORT_PAGE_SOURCE = 'Source: Queensland Audit Office report page, CC BY 4.0'
const HOLD_REASONS: Record<string, string> = { pdf_restrictive_licence: 'The PDF has restrictive reuse terms',
  phase1_rights_hold: 'A previously recorded copyright exception remains uncleared',
  uncleared_rights_exception: 'A copyright or third-party notice needs clearance',
  no_text_layer: 'At least one page has no usable text layer', published_redaction_hold: 'A published redaction needs review',
  individual_donor_text_hold: 'Source text is held under the donor privacy rule',
  document_grant_not_verified: 'The document’s reuse grant could not be verified',
  no_pdf: 'No full report PDF is linked', not_full_report_pdf: 'The linked PDF is a summary product',
  imprint_not_verified: 'The document imprint could not be verified' }
const holdReason = (reason: string) => HOLD_REASONS[reason] || 'The PDF needs further review'
const INDEX_CRUMB: Crumb = { label: 'Audit reports', href: '/audit' }
/** "Report 16: 2025–26" as one meta-line phrase, with the financial year's en dash. */
const reportYear = (label: string) => label.replace(/:\s*/, ', ').replace(/(\d{4})-(\d{2})\b/, '$1–$2')
/** The meta line under a report's title: report number and year, then the tabled date. */
const metaLine = (r: AuditRow) => [reportYear(r.report_label), r.tabled_date ? `Tabled ${shortDate(r.tabled_date)}` : ''].filter(Boolean).join(' · ')
/** One dated source line per page; the attribution the licence asks for, and any
 *  copyright exception, sit in its sheet. */
function source(m: Manifest, originals: { href: string; label: string }[], licence?: Report['licence']) {
  const a = m.attribution
  return sourceLineHTML({ updated: m.generated_at, source: licence ? REPORT_PAGE_SOURCE : SOURCE, originals,
    notes: [esc(a.changes), esc(a.exceptions), esc(a.endorsement), esc(a.copyright_notice),
      ...(licence?.body_skipped ? licence.exceptions.map(reason => esc(HOLD_REASONS[reason] || reason)) : [])],
    licence: `<a href="${esc(a.licence_url)}">CC BY 4.0</a> · <a href="${esc(a.copyright_url)}">QAO copyright and exceptions</a>` })
}
function pdfTerms(r: Report) {
  switch (r.pdf?.document_licence) {
    case 'CC BY-NC-ND 4.0': return 'CC BY-NC-ND 4.0'
    case 'Prior written permission required': return "reuse needs QAO's written permission"
    case 'CC BY 4.0': return 'CC BY 4.0'
    default: return r.pdf ? 'reuse grant unverified' : "see QAO's reuse terms"
  }
}
function select(label: string, key: string, values: string[], url: URL) {
  return `<label>${label}<select name="${key}"><option value="">All</option>${values.map(v => `<option value="${esc(v)}"${url.searchParams.get(key) === v ? ' selected' : ''}>${esc(key === 'year' ? v.replace('-', '–') : v)}</option>`).join('')}</select></label>`
}
function entities(r: Report) {
  return r.entities.length ? `<ul>${r.entities.map(name => {
    const href = r.entity_links?.[name]
    return `<li>${href && /^\/subject\/agency\/[^/?#]+$/.test(href) ? `<a href="${esc(href)}">${esc(name)}</a>` : esc(name)}</li>`
  }).join('')}</ul>` : '<p>Not named on the report’s web page.</p>'
}
function recommendationText(rec: Report['recommendations'][number]) {
  // Only text structure and a bounded set of source list markers are allowed.
  const marker = '(?: style="list-style-type:(?:disc|circle|square|none|decimal|decimal-leading-zero|lower-alpha|lower-latin|upper-alpha|upper-latin|lower-roman|upper-roman)")?'
  const safe = new RegExp('<\\/?(?:p|em|strong|br)>|<\\/(?:ol|ul|li)>|<ul' + marker + '>|'
    + '<ol(?: type="[1aAiI]")?(?: start="-?\\d+")?' + marker + '>|<li(?: value="-?\\d+")?' + marker + '>', 'g')
  const remainder = (rec.html || '').replace(safe, '')
  return /[<>]/.test(remainder) ? esc(rec.text) : rec.html || esc(rec.text)
}

export async function auditPage(id: string | null, url: URL, read: Read, block: Block) {
  const missing = () => ({ title: 'Audit report not found · OPAX', description: 'No audit report is available for this id.', status: 404, prerender: block('Audit report not found', 'No audit report is available for this id.', '', [INDEX_CRUMB, { label: 'Not found' }]) })
  if (id !== null && !AUDIT_ID.test(id)) return missing()
  try {
    const m = await read<Manifest>('/audit/manifest.json')
    if (!auditComplete(m)) return missing()
    if (id === null) {
      const index = await read<{ records: AuditRow[] }>(m.index_url)
      if (index.records.length !== m.count) return missing()
      const matches = filterAudit(index.records, url.searchParams)
      const pages = Math.ceil(matches.length / 50) || 1
      const page = Math.max(1, Math.min(pages, Math.trunc(Number(url.searchParams.get('page')) || 1)))
      const rows = matches.slice((page - 1) * 50, page * 50)
      const description = `${m.count} Queensland Audit Office reports tabled in Parliament.${typeof m.html_recommendations === 'number' ? ` ${m.html_recommendations} recommendations from report pages.` : ''}${typeof m.bodies === 'number' ? ` ${m.bodies} cleared PDF bodies, ${m.count - m.bodies} held PDF bodies and ${m.responses || 0} entity responses.` : ' With source recommendations.'}`
      const href = (n: number) => { const next = new URL(url); next.searchParams.set('page', String(n)); return next.pathname + next.search }
      const form = `<form class="audit-filters" action="/audit" method="get"><label>Title text<input type="search" name="q" value="${esc(url.searchParams.get('q') || '')}"></label>${select('Report year', 'year', m.facets.year, url)}${select('Sector', 'sector', m.facets.sector, url)}${select('Entity audited', 'entity', m.facets.entity, url)}<label>Has entity responses<select name="responses"><option value="">All</option><option value="yes"${url.searchParams.get('responses') === 'yes' ? ' selected' : ''}>Yes</option></select></label><div class="audit-filter-actions"><button type="submit" class="ui-button">Filter</button><a href="/audit">Reset</a></div></form>`
      const filtered = ['q', 'year', 'sector', 'entity', 'responses'].some(k => url.searchParams.get(k))
      const counted = filtered ? `${matches.length} of ${m.count} reports match` : `${m.count} reports`
      const list = `<p class="audit-count">${counted}</p><ul class="audit-list">${rows.map(r => `<li><h2><a href="/audit/${r.id}">${esc(r.title)}</a></h2><p class="audit-meta">${esc(metaLine(r))}</p>${r.sectors.length ? `<p class="audit-tags">${r.sectors.map(s => tagHTML(s)).join(' ')}</p>` : ''}${r.entities.length ? `<p class="audit-meta">Audited: ${esc(r.entities.join('; '))}</p>` : ''}</li>`).join('')}</ul>`
      const navigation = `<nav aria-label="Audit catalogue pages">${page > 1 ? `<a rel="prev" href="${esc(href(page - 1))}">Previous</a>` : ''}<span>Page ${page} of ${pages}</span>${page < pages ? `<a rel="next" href="${esc(href(page + 1))}">Next</a>` : ''}</nav>`
      return { title: 'Queensland audit reports · OPAX', description, status: 200,
        prerender: block('Queensland audit reports', description, '', [{ label: 'Audit reports' }]) + `<section class="wrap audit-content">${form}${list}${navigation}${source(m, [{ href: m.attribution.source_url, label: 'Reports to Parliament' }])}</section>` }
    }
    const chunk = m.lookup[id]
    if (!Number.isInteger(chunk) || !m.chunks[chunk]) return missing()
    const data = await read<{ records: Report[] }>(m.chunks[chunk].path)
    const r = data.records.find(row => row.id === id)
    if (!r || !r.canonical_url.startsWith('https://www.qao.qld.gov.au/reports-resources/')) return missing()
    const meta = metaLine(r)
    const description = `Queensland Audit Office ${reportYear(r.report_label).replace(/^Report/, 'report')}${r.tabled_date ? `, tabled ${shortDate(r.tabled_date)}` : ''}. ${r.licence.body_skipped ? 'Report page text held after its source review.' : `${r.recommendations.length} source recommendations. ${r.response_count || 0} entity responses.`}${r.pdf?.status === 'held' ? ' PDF body held.' : ''}`
    // The recommendation's own words name who it is addressed to; the parsed
    // addressee is not drawn (the export's addressed_to is not reliable).
    const recommendations = r.licence.body_skipped ? `<p>This report page has an uncleared copyright exception, so its recommendations are not reproduced here. Read QAO’s report for the original text.</p>`
      : r.recommendations.length ? `<p class="audit-meta">In the Queensland Audit Office’s words.</p><ol class="audit-recommendations">${r.recommendations.map(rec => `<li${rec.number === null ? ' class="audit-unnumbered"' : ` value="${rec.number}"`}>${recommendationText(rec)}<p class="audit-meta">Source: ${esc(rec.provenance || 'html')}${rec.privacy_filtered ? ' · Donor identities filtered under OPAX’s privacy rules.' : ''}</p></li>`).join('')}</ol>`
      : '<p>No recommendations are reproduced for this report.</p>'
    let responses: EntityResponse[] = []
    if (!r.licence.body_skipped && r.pdf?.status === 'ready' && r.responses_path === `/audit/responses-${id}.json`) {
      const data = await read<{ report_id: string; records: EntityResponse[] }>(r.responses_path)
      if (data.report_id !== id || data.records.length !== r.response_count) return missing()
      responses = data.records
    }
    const hold = (r.title_privacy_filtered ? '<p class="audit-meta">The title has been filtered under OPAX’s donor privacy rules. QAO has the original title.</p>' : '')
      + (r.pdf?.status === 'held' ? `<p class="audit-meta">PDF body held; its full text is not reproduced here. ${esc(pdfTerms(r))}. ${r.pdf.reasons.map(reason => esc(holdReason(reason))).join('. ')}.</p>` : '')
    const responseSection = `<h2>Entity responses</h2>${responses.length ? responses.map(response => `<details class="audit-response"><summary>${esc(response.body)} · PDF ${response.page_start === response.page_end ? `p.${response.page_start}` : `pp.${response.page_start}–${response.page_end}`}</summary>${response.recommendation_numbers.length ? `<p class="audit-meta">Names recommendation${response.recommendation_numbers.length > 1 ? 's' : ''} ${response.recommendation_numbers.map(esc).join(', ')}</p>` : ''}<div class="audit-response-text">${esc(response.text)}</div></details>`).join('') : `<p>${r.pdf?.status === 'held' || r.licence.body_skipped ? 'Responses are held with the PDF body.' : 'No separately attributed responses are available.'}</p>`}`
    const originals = [{ href: r.canonical_url, label: 'Report on qao.qld.gov.au' }, ...(r.pdf_url ? [{ href: r.pdf_url, label: `Full report (PDF): ${pdfTerms(r)}` }] : [])]
    const pdfLink = r.pdf_url ? `<p class="audit-meta"><a href="${esc(r.pdf_url)}" rel="noopener">Full report (PDF)</a>: ${esc(pdfTerms(r))}</p>` : ''
    return { title: `${r.title} · OPAX`, description, status: 200,
      prerender: block(r.title, meta, '', [INDEX_CRUMB, { label: r.title }]) + `<section class="wrap audit-content">${r.sectors.length ? `<p class="audit-tags">${r.sectors.map(s => tagHTML(s)).join(' ')}</p>` : ''}<p class="audit-out"><a href="${esc(r.canonical_url)}" rel="noopener">Read the report on qao.qld.gov.au ↗</a></p>${pdfLink}${hold}<h2>Entities audited</h2>${entities(r)}<h2>Recommendations</h2>${recommendations}${responseSection}${source(m, originals, r.licence)}</section>` }
  } catch { return missing() }
}
