// Temporary read-only endpoint adapter. DT-api replaces this route after merge.
// It reads a bounded sample of published awards; no private fixture is served.
import {dataTableHTML, toCSV, type Page, type Query, type Row} from '../public/datatable.js'
import {grantsTableConfig, GRANTS_SEARCH_KEYS} from '../public/grants-table.js'
import {MONEY_GRAPHS, isOrganisationDonor, withheldPhrases, namesWithheldPhrase, donorPrivacyIndex, foldDonorName} from '../public/donor-entity.js'

type Read = <T>(path: string) => Promise<T>
type Graph = {nodes: {label: string; kind: string; aliases?: string[] | null}[]}
type Program = {n: string; ag: string; grants: {id: string; rid: string; rn: string; k?: string; v: number; s?: string; a?: string; el?: string}[]}
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

export async function grantFixtureRows(read: Read): Promise<{rows: Row[]; withheld: (...values: unknown[]) => boolean}> {
  const [programs, graphs] = await Promise.all([
    Promise.all(sources.map(key => read<Program>(`/grants/federal/programs/${key}.json`))),
    Promise.all(MONEY_GRAPHS.map(path => read<Graph>(path))),
  ])
  const privacy = donorPrivacyIndex(graphs), phrases = withheldPhrases(graphs, [])
  const withheld = (...values: unknown[]) => values.some(value => privacy.withheld.has(foldDonorName(value))) || namesWithheldPhrase(phrases, ...values)
  const rows = programs.flatMap(program => program.grants.filter(g => g.k !== 'individual' && !g.rid.startsWith('person:') && isOrganisationDonor({label: g.rn}) && !withheld(g.rn, g.rid, g.id, program.n, program.ag, g.el)).map(g => ({
    id: g.id, recipient: g.rn, recipientId: g.rid, jurisdiction: 'federal',
    program: program.n, agency: program.ag, value: g.v,
    date: g.s || g.a || null, electorate: g.el || 'Not recorded',
    donor: {label: g.rn},
  })))
  return {rows, withheld}
}

export function queryGrantFixture(rows: Row[], query: Query, withheld: (...values: unknown[]) => boolean = () => false): {page: Page; filtered: Row[]} {
  const pageSize = query.pageSize || 50
  const texts = [query.q, ...Object.values(query.filters || {}).flatMap(v => Array.isArray(v) ? v : [])].filter(Boolean)
  // A rejected query returns neither names nor facets and is never echoed.
  if (withheld(...texts)) return {page: {rows: [], total: 0, page: 1, pageSize, facets: {}}, filtered: []}
  const filtered = rows.filter(row => isOrganisationDonor({label: row.recipient as string}) && !withheld(...columns.map(c => row[c.key])))
    .filter(row => !query.q || GRANTS_SEARCH_KEYS.some(key => String(row[key] || '').toLowerCase().includes(query.q!.toLowerCase())))
    .filter(row => Object.entries(query.filters || {}).every(([key, filter]) => Array.isArray(filter) ? filter.includes(String(row[key] || ''))
      : (filter.min == null || Number(row[key]) >= filter.min) && (filter.max == null || Number(row[key]) <= filter.max)))
  const sort = query.sort || {key: 'value', dir: 'desc'}
  filtered.sort((a, b) => (sort.key === 'value' ? Number(a.value) - Number(b.value) : String(a[sort.key] || '').localeCompare(String(b[sort.key] || ''), 'en-AU')) * (sort.dir === 'asc' ? 1 : -1) || String(a.id).localeCompare(String(b.id)))
  const facets: NonNullable<Page['facets']> = {}
  for (const column of columns) if (column.facet) {
    if (column.key === 'value') {
      const values = filtered.map(row => Number(row.value)).filter(Number.isFinite)
      if (values.length) facets.value = {min: Math.min(...values), max: Math.max(...values)}
    } else {
      const counts = new Map<string, number>()
      for (const row of filtered) {const value = String(row[column.key]); counts.set(value, (counts.get(value) || 0) + 1)}
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

export async function grantFixtureHTML(url: URL, read: Read): Promise<string> {
  const {rows, withheld} = await grantFixtureRows(read)
  const unavailable = url.searchParams.get('jur') === 'qld' || withheld(...url.searchParams.values())
  const {page} = queryGrantFixture(unavailable ? [] : rows, grantFixtureQuery(url.searchParams, 't'), withheld)
  return `<div data-grants-table>${dataTableHTML(grantsTableConfig(url.searchParams), page)}</div>`
}
