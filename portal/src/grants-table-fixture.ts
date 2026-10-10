// Temporary read-only endpoint adapter. DT-api replaces this route after merge.
// It reads a bounded sample of published awards; no private fixture is served.
import {dataTableHTML, toCSV, type Page, type Query, type Row} from '../public/datatable.js'
import {grantsTableConfig, GRANTS_SEARCH_KEYS} from '../public/grants-table.js'
import {isOrganisationRecipient} from '../public/recipient-privacy.js'
import {MONEY_GRAPHS, withheldPhrases, namesWithheldPhrase, donorPrivacyIndex, foldDonorName} from '../public/donor-entity.js'

type Read = <T>(path: string) => Promise<T>
type Graph = {nodes: {label: string; kind: string; aliases?: string[] | null}[]}
type Recipient = {id: string; n: string; k?: string; sh?: number; aliases?: string[]; abr?: {name?: string; etype?: string; type?: string}; abnType?: string; abn_type?: string; kind?: string; entityKind?: string; entity_kind?: string}
type Award = Recipient & {rid: string; rn: string; v: number; s?: string; a?: string; el?: string}
type Program = {n: string; ag: string; grants: Award[]}
type Fixture = {rows: Row[]; withheld: (...values: unknown[]) => boolean}
const readers = new WeakMap<Fetcher, {fetch: Fetcher['fetch']; read: Read}>()
const fixtures = new WeakMap<Read, Promise<Fixture>>()
export function grantFixtureReader(assets: Fetcher): Read {
  let cached = readers.get(assets)
  if (!cached || cached.fetch !== assets.fetch) {
    const read: Read = async <T>(path: string) => {
      const response = await assets.fetch(new Request(`https://opax.com.au${path}`))
      if (!response.ok) throw new Error('Grant export unavailable')
      return response.json() as Promise<T>
    }
    cached = {fetch: assets.fetch, read}; readers.set(assets, cached)
  }
  return cached.read
}
const sources = ['go3141', 'go90', 'go6284']
const columns = grantsTableConfig().columns
const integer = (s: string | null, fallback: number, max: number) => s && /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0 ? Math.min(Number(s), max) : fallback

// Kept in the temporary fixture, rather than changing the frozen core stub.
export function grantFixtureQuery(params: URLSearchParams, urlKey = ''): Query {
  const prefix = urlKey ? `${urlKey}.` : '', filters: NonNullable<Query['filters']> = {}
  for (const column of columns) {
    const raw = params.get(`${prefix}f.${column.key}`)
    if (!raw) continue
    try {
      const value: unknown = JSON.parse(raw)
      if (column.key === 'value' && value && typeof value === 'object' && !Array.isArray(value)) {
        const bounds = value as Record<string, unknown>, range: {min?: number; max?: number} = {}
        for (const bound of ['min', 'max'] as const) if (typeof bounds[bound] === 'number' && Number.isFinite(bounds[bound])) range[bound] = bounds[bound]
        if (Object.keys(range).length) filters[column.key] = range
      } else if (Array.isArray(value) && ['recipient', 'program', 'agency', 'electorate'].includes(column.key)) {
        const values = [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 300))].slice(0, 50)
        if (values.length) filters[column.key] = values
      }
    } catch { /* Malformed filters are ignored. */ }
  }
  const sort = params.get(`${prefix}sort`)?.match(/^(recipient|value|date):(asc|desc)$/)
  return {
    q: params.get(`${prefix}q`)?.trim().slice(0, 300) || undefined,
    ...(Object.keys(filters).length ? {filters} : {}),
    ...(sort ? {sort: {key: sort[1], dir: sort[2] as 'asc' | 'desc'}} : {}),
    page: integer(params.get(`${prefix}page`) || (!urlKey ? null : params.get('page')), 1, 1_000_000),
    pageSize: integer(params.get(`${prefix}pageSize`), 50, 200),
  }
}

export function grantFixtureRows(read: Read): Promise<Fixture> {
  let pending = fixtures.get(read)
  if (!pending) {
    pending = buildGrantFixtureRows(read).catch(error => {fixtures.delete(read); throw error})
    fixtures.set(read, pending)
  }
  return pending
}

async function buildGrantFixtureRows(read: Read): Promise<Fixture> {
  const [programs, graphs, index] = await Promise.all([
    Promise.all(sources.map(key => read<Program>(`/grants/federal/programs/${key}.json`))),
    Promise.all(MONEY_GRAPHS.map(path => read<Graph>(path))),
    read<{recipients: Recipient[]}>('/graph/grants.federal.json'),
  ])
  // All recipients, including aliases outside the selected programs, participate
  // in rejection. Missing index/shard data fails closed at the route boundary.
  const shards = await Promise.all([...new Set(index.recipients.map(r => r.sh).filter((sh): sh is number => Number.isInteger(sh)))].map(sh => read<Record<string, Recipient>>(`/grants/federal/shard-${String(sh).padStart(2, '0')}.json`)))
  const details = new Map(shards.flatMap(shard => Object.values(shard).map(r => [r.id, r] as const)))
  const recipients = new Map(index.recipients.map(r => [r.id, r]))
  const candidates = [...index.recipients, ...details.values(), ...programs.flatMap(p => p.grants.map(g => ({...g, id: g.rid, n: g.rn})))]
  const identities = new Map<string, Recipient[]>()
  for (const recipient of candidates) identities.set(recipient.id, [...(identities.get(recipient.id) || []), recipient])
  const evidence = new Map([...identities].map(([id, records]) => [id, {
    id,
    recipientKinds: records.flatMap(r => [r.k, r.kind, r.entityKind, r.entity_kind]).filter((v): v is string => typeof v === 'string'),
    recipientABNTypes: records.flatMap(r => [r.abr?.etype, r.abr?.type, r.abnType, r.abn_type]).filter((v): v is string => typeof v === 'string'),
  }]))
  // Combine positive evidence without discarding any contradictory private type.
  const publicIdentities = new Set([...identities].filter(([id, records]) => records.some(r => isOrganisationRecipient({...evidence.get(id), n: r.n}))).map(([id]) => id))
  const phrase = (value: unknown) => foldDonorName(value).replace(/[^a-z0-9]+/g, ' ').trim()
  const rejected = new Set(candidates.filter(r => !publicIdentities.has(r.id)).flatMap(r => [r.n, ...(r.aliases || []), r.abr?.name].filter((name): name is string => typeof name === 'string')).flatMap(name => {
    const inverted = /^([^,]+),\s*([^,]+)$/.exec(name)
    return [name, ...(inverted ? [`${inverted[2]} ${inverted[1]}`] : [])].map(phrase).filter(Boolean)
  }))
  const privacy = donorPrivacyIndex(graphs), phrases = withheldPhrases(graphs, [])
  const withheld = (...values: unknown[]) => values.some(value => {
    const text = typeof value === 'object' && value != null ? JSON.stringify(value) : String(value ?? '')
    const normalised = ` ${phrase(text)} `
    return privacy.withheld.has(foldDonorName(text)) || namesWithheldPhrase(phrases, `donor receipts ${text}`)
      || [...rejected].some(name => normalised.includes(` ${name} `))
  })
  const hidden: {id: string; value: number}[] = []
  const rows: Row[] = programs.flatMap(program => program.grants.flatMap(g => {
    const summary = recipients.get(g.rid), detail = details.get(g.rid)
    const omit = () => {if (Number.isFinite(g.v)) hidden.push({id: g.rid, value: g.v}); return []}
    // Do not overwrite contradictory source types when joining metadata.
    if (!publicIdentities.has(g.rid)) return omit()
    const row = {
      id: g.id, recipient: g.rn, recipientId: g.rid, jurisdiction: 'federal',
      recipientKind: detail?.k || summary?.k || g.k || g.kind,
      recipientABNType: detail?.abr?.etype || detail?.abr?.type || g.abr?.etype || g.abr?.type || g.abnType || null,
      recipientKinds: evidence.get(g.rid)?.recipientKinds,
      recipientABNTypes: evidence.get(g.rid)?.recipientABNTypes,
      recipientAvailable: Boolean(summary && detail && !withheld(summary.n, detail.n)),
      program: program.n, agency: program.ag, value: g.v,
      date: g.s || g.a || null, electorate: g.el || 'Not recorded',
      donor: {label: g.rn, aliases: detail?.aliases || []},
    }
    return !isOrganisationRecipient(row) || withheld(row) ? omit() : [row]
  }))
  if (hidden.length) rows.push({aggregate: {kind: 'individual-donors', subject: 'recipients', count: new Set(hidden.map(r => r.id)).size}, value: hidden.reduce((sum, r) => sum + r.value, 0)})
  return {rows, withheld}
}

export function queryGrantFixture(rows: Row[], query: Query, withheld: (...values: unknown[]) => boolean = () => false): {page: Page; filtered: Row[]} {
  const pageSize = query.pageSize || 50
  const texts = [query.q, ...Object.values(query.filters || {}).flatMap(v => Array.isArray(v) ? v : [])].filter(Boolean)
  // A rejected query returns neither names nor facets and is never echoed.
  if (withheld(...texts)) return {page: {rows: [], total: 0, page: 1, pageSize, facets: {}}, filtered: []}
  const searched = rows.filter(row => (row.aggregate ? !query.q && !Object.keys(query.filters || {}).length : isOrganisationRecipient(row)) && !withheld(row))
    .filter(row => !query.q || GRANTS_SEARCH_KEYS.some(key => String(row[key] || '').toLowerCase().includes(query.q!.toLowerCase())))
  const matches = (row: Row, except = '') => Object.entries(query.filters || {}).every(([key, filter]) => key === except || (Array.isArray(filter) ? filter.includes(String(row[key] || ''))
    : (filter.min == null || Number(row[key]) >= filter.min) && (filter.max == null || Number(row[key]) <= filter.max)))
  const filtered = searched.filter(row => matches(row))
  const sort = query.sort || {key: 'value', dir: 'desc'}
  filtered.sort((a, b) => (sort.key === 'value' ? Number(a.value) - Number(b.value) : String(a[sort.key] || '').localeCompare(String(b[sort.key] || ''), 'en-AU')) * (sort.dir === 'asc' ? 1 : -1) || String(a.id).localeCompare(String(b.id)))
  const facets: NonNullable<Page['facets']> = {}
  for (const column of columns) if (column.facet) {
    const alternatives = searched.filter(row => matches(row, column.key))
    if (column.key === 'value') {
      const values = alternatives.map(row => Number(row.value)).filter(Number.isFinite)
      if (values.length) facets.value = {min: Math.min(...values), max: Math.max(...values)}
    } else {
      const counts = new Map<string, number>()
      for (const row of alternatives.filter(row => !row.aggregate)) {const value = String(row[column.key]); counts.set(value, (counts.get(value) || 0) + 1)}
      facets[column.key] = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({value, count}))
    }
  }
  const page = Math.min(query.page || 1, Math.max(1, Math.ceil(filtered.length / pageSize)))
  return {page: {rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, facets}, filtered}
}

export async function grantFixtureResponse(request: Request, url: URL, read: Read): Promise<Response> {
  const headers = {'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-opax-table-source': 'fixture'}
  if (request.method !== 'GET') return new Response('Method not allowed', {status: 405, headers: {...headers, allow: 'GET'}})
  try {
    const {rows, withheld} = await grantFixtureRows(read)
    const unavailable = url.searchParams.get('jur') === 'qld' || withheld(...url.searchParams.values())
    const {page, filtered} = queryGrantFixture(unavailable ? [] : rows, grantFixtureQuery(url.searchParams), withheld)
    return url.searchParams.get('format') === 'csv'
      ? new Response(toCSV(filtered.slice(0, 50_000), grantsTableConfig()), {headers: {...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="grants.csv"'}})
      : Response.json(page, {headers})
  } catch {return Response.json({error: 'Grant records are temporarily unavailable.'}, {status: 503, headers})}
}

// The core's privacyCheck hook uses the same recipient + donor index as rows.
// Only a boolean is returned; this endpoint never publishes the rejection set.
export async function grantFixturePrivacy(request: Request, read: Read): Promise<Response> {
  const headers = {'cache-control': 'no-store', 'x-robots-tag': 'noindex'}
  if (request.method !== 'POST') return Response.json({safe: false}, {status: 405, headers})
  try {
    const body = await request.text()
    if (body.length > 10_000_000) return Response.json({safe: false}, {status: 413, headers})
    const text: unknown = JSON.parse(body).text
    if (typeof text !== 'string') return Response.json({safe: false}, {status: 400, headers})
    const {withheld} = await grantFixtureRows(read)
    return Response.json({safe: !withheld(text)}, {headers})
  } catch {return Response.json({safe: false}, {status: 503, headers})}
}

export async function grantFixtureHTML(url: URL, read: Read): Promise<string> {
  const {rows, withheld} = await grantFixtureRows(read)
  const unavailable = url.searchParams.get('jur') === 'qld' || withheld(...url.searchParams.values())
  const {page} = queryGrantFixture(unavailable ? [] : rows, grantFixtureQuery(url.searchParams, 't'), withheld)
  const config = {...grantsTableConfig(url.searchParams), privacyCheck: (text: string) => !withheld(text)}
  return `<div data-grants-table>${dataTableHTML(config, page)}</div>`
}
