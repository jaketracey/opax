import { FRL_ID, catalogueComplete, filterInstruments, unpack, type CatalogueRow } from '../public/instruments.js'
import { catalogueReader } from './catalogue-reader.mjs'

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
type Block = (heading: string, sentence: string, links?: string) => string
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const shown = (v: unknown) => v == null || v === '' ? 'Not supplied' : esc(v)
const date = (v: string | null) => v ? esc(v.slice(0, 10)) : 'Not supplied'
export const instrumentReader = catalogueReader
const directoryLink = '<p><a href="/instruments">All instruments</a></p>'

function attribution(a: Attribution) {
  return `<footer class="instrument-attribution"><p>Source: <a href="${esc(a.source_url)}">Federal Register of Legislation (legislation.gov.au)</a>, <a href="${esc(a.licence_url)}">CC BY 4.0</a></p><p>${esc(a.dated)}</p><p>${esc(a.changes)}</p><p>${esc(a.exceptions)} ${esc(a.endorsement)}</p></footer>`
}
function select(label: string, key: string, values: string[], url: URL, unknown = false) {
  return `<label>${label}<select name="${key}"><option value="">All</option>${[...values, ...(unknown && !values.includes('unknown') ? ['unknown'] : [])].map(v => `<option value="${esc(v)}"${url.searchParams.get(key) === v ? ' selected' : ''}>${v === 'unknown' ? 'Not supplied' : esc(v)}</option>`).join('')}</select></label>`
}

export async function instrumentPage(id: string | null, url: URL, read: Read, block: Block) {
  const missing = () => ({ title: 'Instrument not found · OPAX', description: 'No instrument metadata is available for this FRL id.', status: 404, prerender: block('Instrument not found', 'No instrument metadata is available for this FRL id.', directoryLink) })
  if (id === null && url.pathname.replace(/\/+$/, '') !== '/instruments') return missing()
  if (id !== null && !FRL_ID.test(id)) return missing()
  const unavailable = () => ({ title: 'Instrument catalogue not yet available · OPAX', description: 'Instrument metadata is not yet available.', status: 404, prerender: block('Instrument catalogue not yet available', 'Instrument metadata is not yet available.', '') })
  try {
    const manifest = await read<Manifest>('/instruments/manifest.json')
    if (!catalogueComplete(manifest)) return unavailable()
    if (id === null) {
      const index = await read<{ records: CatalogueRow[] }>(manifest.index_url)
      if (!Array.isArray(index.records) || index.records.length !== (manifest.exported ?? manifest.count)) return unavailable()
      const matches = filterInstruments(index.records, url.searchParams)
      const page = Math.max(1, Math.min(Math.ceil(matches.length / 50) || 1, Math.trunc(Number(url.searchParams.get('page')) || 1)))
      const rows = matches.slice((Math.trunc(page) - 1) * 50, Math.trunc(page) * 50)
      const description = `${(manifest.exported ?? manifest.count).toLocaleString('en-AU')} in-force federal legislative-instrument titles. Metadata only; authoritative text is on the Federal Register of Legislation.`
      const gapNote = manifest.unresolved_gap ? `<p class="fineprint">FRL listed ${manifest.count.toLocaleString('en-AU')}; ${manifest.unresolved_gap} could not be retrieved from its API</p>` : ''
      const facts = block('Federal legislative instruments', description, '')
      const form = `<form class="instrument-filters" action="/instruments" method="get"><label>Title text<input name="q" type="search" value="${esc(url.searchParams.get('q') || '')}"></label>${select('Portfolio', 'portfolio', manifest.facets.portfolio, url, true)}${select('Type', 'type', manifest.facets.type, url)}${select('Commencement year', 'year', manifest.facets.commencement_year, url)}${select('Status', 'status', manifest.facets.status, url)}<button type="submit" class="ui-button">Filter</button><a href="/instruments">Reset</a></form>`
      const href = (n: number) => { const target = new URL(url); target.searchParams.set('page', String(n)); return target.pathname + target.search }
      const pagination = `<nav aria-label="Catalogue pages">${page > 1 ? `<a href="${esc(href(page - 1))}" rel="prev">Previous</a>` : ''}<span>Page ${Math.trunc(page)} of ${Math.ceil(matches.length / 50) || 1}</span>${page * 50 < matches.length ? `<a href="${esc(href(page + 1))}" rel="next">Next</a>` : ''}</nav>`
      const list = `<p>${matches.length.toLocaleString('en-AU')} matching titles · snapshot ${esc(manifest.generated_at.slice(0, 10))}</p><ul class="instrument-list">${rows.map(r => `<li><h2><a href="/instrument/${r[0]}">${esc(r[1])}</a></h2><p>${esc(r[0])} · ${esc(r[3])} · ${esc(r[5])}</p><p>Portfolio: ${r[2].length ? esc(r[2].join('; ')) : 'Not supplied'} · Commenced: ${date(r[4])}</p></li>`).join('')}</ul>`
      return { title: 'Federal legislative instruments · OPAX', description, status: 200,
        prerender: facts + `<section class="wrap instrument-content">${gapNote}${form}<p class="fineprint">FRL's in-force listing includes instruments made but not yet commenced. Version start dates are separate from commencement; dates not supplied by the API stay unknown.</p>${list}${pagination}${attribution(manifest.attribution)}</section>` }
    }
    const chunk = manifest.lookup[id]
    if (!Number.isInteger(chunk) || !manifest.chunks[chunk]) return missing()
    const data = await read<{ records: unknown[] }>(manifest.chunks[chunk].path)
    const record = data.records.map(v => unpack(v, manifest.schemas, manifest.strings) as { source: Instrument; opax: { canonical_url: string } }).find(r => r.source.id === id)
    if (!record) return missing()
    const r = record.source
    const departments = r.administeringDepartments || []
    const sourceVersions = r.versions || []
    const portfolios = [...new Set(departments.map(d => d.portfolio).filter(Boolean))].join('; ')
    const kind = [r.subCollection, r.isPrincipal === true ? 'Principal' : r.isPrincipal === false ? 'Amending' : null].filter(Boolean).join(' · ') || 'Not supplied'
    const description = `${r.status}. Made: ${r.makingDate?.slice(0, 10) || 'Not supplied'}. Registered: ${r.asMadeRegisteredAt?.slice(0, 10) || 'Not supplied'}. Commenced: ${r.commencementDate?.slice(0, 10) || 'Not supplied'}. OPAX shows metadata only.`
    // FRL publishes /{id}/latest canonical links in its own terms page.
    // Never invent a title/version path from a returned registration id.
    const authoritative = record.opax.canonical_url
    const dates = `<dl class="instrument-facts"><dt>Made</dt><dd>${date(r.makingDate)}</dd><dt>Registered</dt><dd>${date(r.asMadeRegisteredAt)}</dd><dt>Commenced</dt><dd>${date(r.commencementDate)}</dd><dt>Status</dt><dd>${shown(r.status)}</dd><dt>Portfolio</dt><dd>${shown(portfolios)}</dd><dt>Type</dt><dd>${esc(kind)}</dd><dt>Administering department</dt><dd>${shown(departments.map(d => d.name).join('; '))}</dd><dt>FRL id</dt><dd>${esc(r.id)}</dd><dt>Series</dt><dd>${shown([r.seriesType, r.optionalSeriesNumber].filter(Boolean).join(' '))}</dd><dt>Source year / number</dt><dd>${shown(r.year)} / ${shown(r.number)}</dd></dl>`
    const versions = `<h2>Returned version metadata</h2><p>Acquisition is bounded to one API-returned version per title. It may be an earlier version. FRL's flags below identify whether it is current or latest; use the authoritative FRL link for the latest text. Full version history is outside this phase.</p>${sourceVersions.length ? sourceVersions.map(v => `<dl class="instrument-facts"><dt>Version registration id</dt><dd>${shown(v.registerId)}</dd><dt>Version start</dt><dd>${date(v.start)}</dd><dt>Version registered</dt><dd>${date(v.registeredAt)}</dd><dt>Compilation number</dt><dd>${shown(v.compilationNumber)}</dd><dt>Latest registered version</dt><dd>${v.isLatest ? 'Yes' : 'No'}</dd><dt>Current version</dt><dd>${v.isCurrent ? 'Yes' : 'No'}</dd></dl>`).join('') : `<p>Not supplied</p>`}`
    const relationships = [...(r.statusHistory || []), ...(r.statusPossibleFuture || [])]
    return { title: `${r.name} · OPAX`, description, status: 200,
      prerender: block(r.name, description, directoryLink) + `<section class="wrap instrument-content">${dates}<p><a href="${esc(authoritative)}" rel="noopener">Authoritative text — Federal Register of Legislation (latest registered version)</a></p><p class="fineprint">OPAX shows metadata only. The authoritative legal text is on FRL. Registered means the as-made registration date. A version start is not necessarily whole-instrument commencement. InForce can include an instrument made but not yet commenced.</p>${versions}${r.hasCommencedUnincorporatedAmendments ? '<p>FRL records commenced amendments that have not been incorporated.</p>' : ''}${r.publishComments ? `<h2>Publisher comments</h2><p>${esc(r.publishComments)}</p>` : ''}<details><summary>Source status and relationship metadata</summary><p>Supplied by FRL; no repeal, supersession or disallowance relationships are inferred.</p><pre>${esc(JSON.stringify(relationships, null, 2))}</pre></details><details><summary>All exported source metadata</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details><details><summary>OPAX-derived fields</summary><pre>${esc(JSON.stringify(record.opax, null, 2))}</pre></details>${attribution(manifest.attribution)}</section>` }
  } catch { return unavailable() }
}
