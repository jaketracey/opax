import {tableIdentityIndex} from './table-identity-index.mjs'
import { AUDIT_ID, auditComplete, type AuditRow } from '../public/audit.js'
import { sourceLineHTML, tagHTML, statusLabelHTML } from '../public/labels.js'
import { catalogueReader } from './catalogue-reader.mjs'
import {auditTableConfig, registerTableHTML, registerTableQuery} from '../public/register-tables.js'

interface Manifest {
  count: number; listed: number; generated_at: string; index_url: string; lookup: Record<string, number>
  chunks: { path: string; count: number }[]; facets: { year: string[]; sector: string[]; entity: string[] }
  attribution: { source: string; source_url: string; licence_url: string; copyright_url: string; copyright_notice: string; changes: string; exceptions: string; endorsement: string }
}
interface Report extends AuditRow {
  pdf_url: string | null; entity_links: Record<string, string>
  recommendations: { number: number | null; text: string; html: string; addressed_to: string | null; source_text: string }[]
  licence: { status: string; body_skipped: boolean; exceptions: string[] }
}
type Read = <T>(path: string) => Promise<T>
type Block = (heading: string, sentence: string, links?: string) => string
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const auditReader = catalogueReader
const directory = '<p><a href="/audit">All audit reports</a></p>'
function source(m: Manifest, original: string, licence?: Report['licence']) {
  const a = m.attribution
  return sourceLineHTML({ source: a.source, originals: [{ href: original, label: 'Queensland Audit Office report' }],
    asAt: `Catalogue snapshot ${m.generated_at.slice(0, 10)}`,
    notes: [esc(a.copyright_notice), esc(a.changes), esc(a.exceptions), esc(a.endorsement),
      ...(licence?.body_skipped ? licence.exceptions.map(esc) : [])],
    licence: `<a href="${esc(a.licence_url)}">CC BY 4.0</a> · <a href="${esc(a.copyright_url)}">QAO copyright and exceptions</a>` })
}
function entities(r: Report) {
  return r.entities.length ? `<ul>${r.entities.map(name => {
    const href = r.entity_links?.[name]
    return `<li>${href && /^\/subject\/agency\/[^/?#]+$/.test(href) ? `<a href="${esc(href)}">${esc(name)}</a>` : esc(name)}</li>`
  }).join('')}</ul>` : '<p>Not identified in the published HTML audit scope.</p>'
}
function recommendationText(rec: Report['recommendations'][number]) {
  // Only text structure and a bounded set of source list markers are allowed.
  const marker = '(?: style="list-style-type:(?:disc|circle|square|none|decimal|decimal-leading-zero|lower-alpha|lower-latin|upper-alpha|upper-latin|lower-roman|upper-roman)")?'
  const safe = new RegExp('<\\/?(?:p|em|strong|br)>|<\\/(?:ol|ul|li)>|<ul' + marker + '>|'
    + '<ol(?: type="[1aAiI]")?(?: start="-?\\d+")?' + marker + '>|<li(?: value="-?\\d+")?' + marker + '>', 'g')
  const remainder = (rec.html || '').replace(safe, '')
  return /[<>]/.test(remainder) ? esc(rec.text) : rec.html || esc(rec.text)
}

export async function auditPage(id: string | null, url: URL, read: Read, block: Block, privacyCheck?: (text:string)=>boolean) {
  const missing = () => ({ title: 'Audit report not found · OPAX', description: 'No audit report is available for this id.', status: 404, prerender: block('Audit report not found', 'No audit report is available for this id.', directory) })
  if (id !== null && !AUDIT_ID.test(id)) return missing()
  try {
    const m = await read<Manifest>('/audit/manifest.json')
    if (!auditComplete(m)) return missing()
    if (id === null) {
      const index = await read<{ records: AuditRow[] }>(m.index_url)
      if (index.records.length !== m.count) return missing()
      const safe=privacyCheck ?? (await tableIdentityIndex(read)).safe
      const config = auditTableConfig(index.records,safe)
      config.rows=config.rows!.filter(row=>safe(JSON.stringify(row)))
      const description = `${m.count} Queensland Audit Office reports tabled in Parliament, with report metadata and recommendations published as HTML.`
      return { title: 'Queensland audit reports · OPAX', description, status: 200,noindex:Boolean(url.search),
        prerender: block('Queensland audit reports', description, '') + `<section class="wrap audit-content">${registerTableHTML(config,registerTableQuery(url.searchParams,config))}${source(m, m.attribution.source_url)}</section>` }
    }
    const chunk = m.lookup[id]
    if (!Number.isInteger(chunk) || !m.chunks[chunk]) return missing()
    const data = await read<{ records: Report[] }>(m.chunks[chunk].path)
    const r = data.records.find(row => row.id === id)
    if (!r || !r.canonical_url.startsWith('https://www.qao.qld.gov.au/reports-resources/')) return missing()
    const description = `${r.report_label}. Tabled date: ${r.tabled_date}. ${r.licence.body_skipped ? 'Recommendation text withheld under a copyright exception.' : `${r.recommendations.length} recommendations published as HTML.`}`
    const recommendations = r.licence.body_skipped ? `<p>Recommendation text withheld because this report page records a copyright exception. Read the authoritative report for its terms.</p>`
      : r.recommendations.length ? `<ol class="audit-recommendations">${r.recommendations.map(rec => `<li${rec.number === null ? ' class="audit-unnumbered"' : ` value="${rec.number}"`}><p>${tagHTML("QAO's text")}${rec.number === null ? ' <span>Number not published in the HTML</span>' : ''}${rec.addressed_to ? ` <span>Addressed to: ${esc(rec.addressed_to)}</span>` : ' <span>Addressee not identified in the HTML</span>'}</p><div>${recommendationText(rec)}</div></li>`).join('')}</ol>`
      : '<p>No numbered recommendation text was identified in this report’s published HTML. Recommendations in PDF bodies are outside this phase.</p>'
    return { title: `${r.title} · OPAX`, description, status: 200,
      prerender: block(r.title, description, directory) + `<section class="wrap audit-content"><p>${statusLabelHTML('Tabled', 'done')} ${esc(r.report_label)}</p><dl class="audit-facts"><dt>Tabled date</dt><dd>${esc(r.tabled_date)}</dd><dt>Report year</dt><dd>${esc(r.year)}</dd></dl><p class="audit-tags">${r.sectors.map(s => tagHTML(s)).join(' ')}</p><h2>Entities audited</h2>${entities(r)}<h2>Recommendations</h2>${recommendations}<p><a class="ui-button" href="${esc(r.canonical_url)}" rel="noopener">Authoritative report — Queensland Audit Office</a></p>${r.pdf_url ? `<p><a href="${esc(r.pdf_url)}" rel="noopener">Report PDF on QAO</a></p>` : ''}${source(m, r.canonical_url, r.licence)}</section>` }
  } catch { return missing() }
}
