import {tablePrivacyCheckFrom} from './table-privacy.ts'
import { AUDIT_ID, auditComplete, type AuditRow } from '../public/audit.js'
import { sourceLineHTML, tagHTML, statusLabelHTML } from '../public/labels.js'
import { shortDate } from '../public/format.js'
import type { Crumb } from './seo-content'
import { trail } from './nav-model.mjs'
import { catalogueReader } from './catalogue-reader.mjs'
import {auditTableConfig, registerTableHTML, registerTableQuery} from '../public/register-tables.js'
import {guardTableURL} from '../public/datatable.js'

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
  pdf?: { status: string; sha256: string | null; page_count: number; document_licence?: string }
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
      ...(licence?.body_skipped ? ['This report page has an uncleared copyright exception.'] : [])],
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
function pdfHoldNote(r: Report) {
  switch (r.pdf?.document_licence) {
    case 'CC BY-NC-ND 4.0': return "PDF body held: QAO's terms for this PDF (CC BY-NC-ND 4.0) don't allow us to reproduce it here."
    case 'Prior written permission required': return "PDF body held: QAO's terms for this PDF require QAO's written permission."
    default: return "PDF body held: we couldn't confirm QAO's terms for this PDF."
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

export async function auditPage(id: string | null, url: URL, read: Read, block: Block, privacyCheck?: (text:string)=>boolean, privacyRowCheck?: (text:string)=>boolean) {
  const missing = () => ({ title: 'Audit report not found · OPAX', description: 'No audit report is available for this id.', status: 404, prerender: block('Audit report not found', 'No audit report is available for this id.', '', trail('/audit', 'Not found')) })
  if (id !== null && !AUDIT_ID.test(id)) return missing()
  try {
    const m = await read<Manifest>('/audit/manifest.json')
    if (!auditComplete(m)) return missing()
    if (id === null) {
      const index = await read<{ records: AuditRow[] }>(m.index_url)
      if (index.records.length !== m.count) return missing()
      const safe=privacyCheck ?? await tablePrivacyCheckFrom(read)
      const safeRows=privacyRowCheck ?? privacyCheck ?? await tablePrivacyCheckFrom(read,'row')
      const config = auditTableConfig(index.records,safe,safeRows)
      const requestURL=new URL(url)
      const guarded=guardTableURL(config,url)
      const description = `${m.count} Queensland Audit Office reports tabled in Parliament.${typeof m.html_recommendations === 'number' ? ` ${m.html_recommendations} recommendations from report pages.` : ''}${typeof m.bodies === 'number' ? ` ${m.bodies} cleared PDF bodies, ${m.count - m.bodies} held PDF bodies and ${m.responses || 0} entity responses.` : ' With source recommendations.'}`
      return { title: 'Queensland audit reports · OPAX', description, status: 200,noindex:guarded.rejected || Boolean(url.search),
        prerender: block('Queensland audit reports', description, '', trail('/audit')) + `<section class="wrap audit-content">${registerTableHTML(config,registerTableQuery(url.searchParams,config),requestURL)}${source(m, [{href:m.attribution.source_url,label:'Reports to Parliament'}])}</section>` }
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
      : r.recommendations.length ? `<p class="audit-meta">In the Queensland Audit Office’s words.</p><ol class="audit-recommendations">${r.recommendations.map(rec => `<li${rec.number === null ? ' class="audit-unnumbered"' : ` value="${rec.number}"`}>${recommendationText(rec)}<p class="audit-meta">Source: ${esc(rec.provenance || 'html')}${rec.privacy_filtered ? ' · Names withheld; QAO has the original text.' : ''}</p></li>`).join('')}</ol>`
      : '<p>No recommendations are reproduced for this report.</p>'
    let responses: EntityResponse[] = []
    if (!r.licence.body_skipped && r.pdf?.status === 'ready' && r.responses_path === `/audit/responses-${id}.json`) {
      const data = await read<{ report_id: string; records: EntityResponse[] }>(r.responses_path)
      if (data.report_id !== id || data.records.length !== r.response_count) return missing()
      responses = data.records
    }
    const hold = (r.title_privacy_filtered ? '<p class="audit-meta">Names withheld from the title; QAO has the original title.</p>' : '')
      + (r.pdf?.status === 'held' ? `<p class="audit-meta">${esc(pdfHoldNote(r))}</p>` : '')
    const responseSection = `<h2>Entity responses</h2>${responses.length ? responses.map(response => `<details class="audit-response"><summary>${esc(response.body)} · PDF ${response.page_start === response.page_end ? `p.${response.page_start}` : `pp.${response.page_start}–${response.page_end}`}</summary>${response.recommendation_numbers.length ? `<p class="audit-meta">Names recommendation${response.recommendation_numbers.length > 1 ? 's' : ''} ${response.recommendation_numbers.map(esc).join(', ')}</p>` : ''}<div class="audit-response-text">${esc(response.text)}</div></details>`).join('') : `<p>${r.pdf?.status === 'held' || r.licence.body_skipped ? 'Responses are held with the PDF body.' : 'No separately attributed responses are available.'}</p>`}`
    const originals = [{ href: r.canonical_url, label: 'Report on qao.qld.gov.au' }, ...(r.pdf_url ? [{ href: r.pdf_url, label: `Full report (PDF): ${pdfTerms(r)}` }] : [])]
    const pdfLink = r.pdf_url ? `<p class="audit-meta"><a href="${esc(r.pdf_url)}" rel="noopener">Full report (PDF)</a>: ${esc(pdfTerms(r))}</p>` : ''
    return { title: `${r.title} · OPAX`, description, status: 200,
      prerender: block(r.title, meta, '', trail('/audit', r.title)) + `<section class="wrap audit-content">${r.sectors.length ? `<p class="audit-tags">${r.sectors.map(s => tagHTML(s)).join(' ')}</p>` : ''}<p class="audit-out"><a href="${esc(r.canonical_url)}" rel="noopener">Read the report on qao.qld.gov.au ↗</a></p>${pdfLink}${hold}<h2>Entities audited</h2>${entities(r)}<h2>Recommendations</h2>${recommendations}${responseSection}${source(m, originals, r.licence)}</section>` }
  } catch { return missing() }
}
