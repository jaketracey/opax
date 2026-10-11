import {tableIdentityIndex} from './table-identity-index.mjs'
import { FRL_ID, catalogueComplete, unpack, instrumentTableRows, type CatalogueRow } from '../public/instruments.js'
import { catalogueReader } from './catalogue-reader.mjs'
import {applyQuery, dataTableHTML} from '../public/datatable.js'
import {instrumentTableConfig,registerTableQuery} from '../public/register-tables.js'
import { sourceLineHTML } from '../public/labels.js'
import { shortDate } from '../public/format.js'
import type { Crumb } from './seo-content'

interface Attribution { source: string; source_url: string; licence_url: string; dated: string; changes: string; exceptions: string; endorsement: string }
interface Manifest {
  count: number; exported?: number; unresolved_gap?: number; generated_at: string; index_url: string; schemas: string[][]; strings?: string[]
  attribution: Attribution; lookup: Record<string, number>
  chunks: { path: string; count: number }[]
  facets: { portfolio: string[]; type: string[]; status: string[]; commencement_year: string[] }
}
interface Version { registerId: string | null; isLatest: boolean; isCurrent: boolean; start: string; registeredAt: string | null; compilationNumber: string | null; hasUnincorporatedAmendments: boolean }
interface Instrument {
  id: string; name: string; makingDate: string | null; asMadeRegisteredAt: string | null
  commencementDate: string | null; status: string; subCollection: string | null; isPrincipal: boolean
  administeringDepartments?: { name: string; portfolio: string | null }[]
  versions?: Version[]; seriesType: string | null; optionalSeriesNumber: string | null
  year: number | null; number: number | null; publishComments: string | null
  statusHistory: unknown[]; statusPossibleFuture: unknown[]; nameHistory: unknown[]
  namePossibleFuture: unknown[]; hasCommencedUnincorporatedAmendments: boolean
}
type Read = <T>(path: string) => Promise<T>
type Block = (heading: string, sentence: string, links?: string, crumbs?: Crumb[]) => string
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
/** The Register's enum values in words: InForce → In force, CourtRules · Principal → Court rules · Principal. */
const WORDS: Record<string, string> = { InForce: 'In force', NotInForce: 'Not in force', ByLaws: 'By-laws', CourtRules: 'Court rules' }
export const words = (v: unknown) => clean(v).split(' · ').map(part => WORDS[part]
  ?? part.replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`)).join(' · ')
const date = (v: string | null) => v ? esc(shortDate(v)) : ''
export const instrumentReader = catalogueReader
const REGISTER = 'Federal Register of Legislation'
const INDEX_CRUMB: Crumb = { label: 'Instruments', href: '/instruments' }

/** One source line for the catalogue: the date of the export, the Register, and
 *  the attribution the CC BY licence asks for in its sheet. */
function sourceLine(m: Manifest, originals: { href: string; label: string }[], notes: string[] = []) {
  const a = m.attribution
  return sourceLineHTML({ updated: m.generated_at, source: REGISTER,
    originals: [...originals, { href: a.source_url, label: 'Federal Register of Legislation' }],
    notes: [...notes, esc(a.dated), esc(a.changes), `${esc(a.exceptions)} ${esc(a.endorsement)}`],
    licence: `<a href="${esc(a.licence_url)}">CC BY 4.0</a>` })
}
const facts = (rows: [string, string][]) => `<dl class="instrument-facts">${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`

export async function instrumentPage(id: string | null, url: URL, read: Read, block: Block, privacyCheck?: (text:string)=>boolean) {
  const missing = () => ({ title: 'Instrument not found · OPAX', description: 'No instrument metadata is available for this FRL id.', status: 404, prerender: block('Instrument not found', 'No instrument metadata is available for this FRL id.', '', [INDEX_CRUMB, {label:'Not found'}]) })
  if (id === null && url.pathname.replace(/\/+$/, '') !== '/instruments') return missing()
  if (id !== null && !FRL_ID.test(id)) return missing()
  const unavailable = () => ({ title: 'Instrument catalogue not yet available · OPAX', description: 'Instrument metadata is not yet available.', status: 404, prerender: block('Instrument catalogue not yet available', 'Instrument metadata is not yet available.', '', [{ label: 'Instruments' }]) })
  try {
    const manifest = await read<Manifest>('/instruments/manifest.json')
    if (!catalogueComplete(manifest)) return unavailable()
    if (id === null) {
      const index = await read<{ records: CatalogueRow[] }>(manifest.index_url)
      if (!Array.isArray(index.records) || index.records.length !== (manifest.exported ?? manifest.count)) return unavailable()
      const safe=privacyCheck ?? (await tableIdentityIndex(read)).safe
      const config = instrumentTableConfig(safe)
      const rows = (await instrumentTableRows(read,manifest,index.records)).filter(row=>safe(JSON.stringify(row)))
      const query=registerTableQuery(url.searchParams,config)
      const page = applyQuery(rows,config,query)
      const description = `${(manifest.exported ?? manifest.count).toLocaleString('en-AU')} in-force federal legislative-instrument titles. Metadata only; authoritative text is on the Federal Register of Legislation.`
      const notes = [
        ...(manifest.unresolved_gap ? [`The Register listed ${manifest.count.toLocaleString('en-AU')} titles; ${manifest.unresolved_gap} could not be retrieved from its API.`] : []),
        'Registered is the as-made registration date. The Register’s in-force listing includes instruments made but not yet commenced. Dates the Register does not supply stay unknown.',
      ]
      const facts = block('Federal legislative instruments', description, '')
      const table = `<div data-register-table="${config.id}">${dataTableHTML(config,page)}<script type="application/json" data-register-config>${JSON.stringify({config}).replace(/</g,'\\u003c')}</script></div>`
      return { title: 'Federal legislative instruments · OPAX', description, status: 200,noindex:Boolean(url.search),
        prerender: facts + `<section class="wrap instrument-content">${table}${sourceLine(manifest, [],notes)}</section>` }
    }
    const chunk = manifest.lookup[id]
    if (!Number.isInteger(chunk) || !manifest.chunks[chunk]) return missing()
    const data = await read<{ records: unknown[] }>(manifest.chunks[chunk].path)
    const record = data.records.map(v => unpack(v, manifest.schemas, manifest.strings) as { source: Instrument; opax: { canonical_url: string } }).find(r => r.source.id === id)
    if (!record) return missing()
    const r = record.source
    const departments = r.administeringDepartments || []
    const sourceVersions = r.versions || []
    const portfolios = [...new Set(departments.map(d => clean(d.portfolio)).filter(Boolean))].join('; ')
    const kind = words([r.subCollection, r.isPrincipal === true ? 'Principal' : r.isPrincipal === false ? 'Amending' : null].filter(Boolean).join(' · '))
    const status = words(r.status)
    // One meta line under the title: status, type and the making date (principle 3).
    const meta = [status, kind, r.makingDate ? `Made ${shortDate(r.makingDate)}` : ''].filter(Boolean).join(' · ')
    const description = `Federal legislative instrument${status ? `, ${status.toLowerCase()}` : ''}${r.makingDate ? `, made ${shortDate(r.makingDate)}` : ''}. Metadata from the Federal Register of Legislation, which holds the authoritative text.`
    // FRL publishes /{id}/latest canonical links in its own terms page.
    // Never invent a title/version path from a returned registration id.
    const authoritative = record.opax.canonical_url
    const dates = facts([['Registered', date(r.asMadeRegisteredAt)], ['Commenced', date(r.commencementDate) || 'Not recorded on the Register'],
      ['Portfolio', esc(portfolios)], ['Administering department', esc(departments.map(d => clean(d.name)).join('; '))],
      ['Series', esc([r.seriesType, r.optionalSeriesNumber].filter(Boolean).join(' '))],
      ['Year and number', r.year != null && r.number != null ? `${esc(r.year)} No. ${esc(r.number)}` : ''], ['Register id', esc(r.id)]])
    const versions = sourceVersions.length ? `<details class="instrument-disclosure"><summary>Version</summary><p>The version OPAX holds, which may not be the latest. The Register has the latest text.</p>${sourceVersions.map(v => facts([
      ['Registration id', esc(v.registerId)], ['Version starts', date(v.start)], ['Registered', date(v.registeredAt)], ['Compilation', esc(v.compilationNumber)],
      ['Latest registered version', v.isLatest ? 'Yes' : 'No'], ['Current version', v.isCurrent ? 'Yes' : 'No']])).join('')}</details>` : ''
    const notes = ['OPAX shows metadata only; the authoritative legal text is on the Register.',
      'Registered is the as-made registration date. A version’s start date is not necessarily when the whole instrument commenced. In force can include an instrument made but not yet commenced.',
      'No repeal, supersession or disallowance relationships are inferred.']
    return { title: `${r.name} · OPAX`, description, status: 200,
      prerender: block(r.name, meta, '', [INDEX_CRUMB, { label: r.name }]) + `<section class="wrap instrument-content">${dates}<p class="instrument-out"><a href="${esc(authoritative)}" rel="noopener">Authoritative text on the Federal Register of Legislation ↗</a></p>${r.hasCommencedUnincorporatedAmendments ? '<p>The Register records commenced amendments that are not yet incorporated in this text.</p>' : ''}${r.publishComments ? `<h2>Publisher comments</h2><p>${esc(r.publishComments)}</p>` : ''}${versions}<details class="instrument-disclosure"><summary>Source metadata</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details>${sourceLine(manifest, [], notes)}</section>` }
  } catch { return unavailable() }
}
