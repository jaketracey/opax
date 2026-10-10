import type {Column, Page, Query, Row} from '../public/datatable.js'
import {TABLE_DATASETS, tableText, tableTerms, tableBucket} from '../public/table-datasets.js'
import {MONEY_GRAPHS, isOrganisationDonor, withheldPhrases, namesWithheldPhrase, type WithheldPhrases} from '../public/donor-entity.js'
import {tablePrivacyCheck} from './table-privacy.mjs'

type Entry = {values: (number | number[] | null)[]; donors?: {label: string; aliases?: string[]}[]}
type RowShard = {strings: string[]; rows: Entry[]}
type TableIndex = {schema: number; count: number; shardSize: number; categories: Record<string, Record<string, number[]>>; ranges: Record<string, [number, number][]>; terms: string[]}
type TableSummary = Pick<TableIndex, 'schema' | 'count' | 'shardSize'> & {facets: NonNullable<Page['facets']>}
type Manifest = {schema: number; datasets: Record<string, {path: string; version: string; count: number}>}
type TableEnv = {ASSETS: Fetcher; CACHE_EPOCH?: string}
const MAX_CSV = 50_000
const MAX_PAGE_SIZE = 200
const CACHE_CONTROL = 'public, max-age=60, s-maxage=60'
const manifests = new WeakMap<Fetcher, Promise<Manifest>>()
const privacy = new WeakMap<Fetcher, Promise<WithheldPhrases>>()

async function asset<T>(assets: Fetcher, path: string): Promise<T> {
  const response = await assets.fetch(new Request('https://opax.com.au' + path))
  if (!response.ok) throw new Error('unavailable')
  // Decode an owned snapshot: asset adapters may reuse their JSON objects.
  // Request-local buffers can then be released without mutating those objects.
  return JSON.parse(await response.text()) as T
}
function manifest(assets: Fetcher) {
  let pending = manifests.get(assets)
  if (!pending) {
    pending = asset<Manifest>(assets, '/table-index/manifest.json').catch(error => { manifests.delete(assets); throw error })
    manifests.set(assets, pending)
  }
  return pending
}
function donorPhrases(assets: Fetcher) {
  let pending = privacy.get(assets)
  if (!pending) {
    pending = Promise.all(MONEY_GRAPHS.map(path => asset<{nodes: {label: string; kind: string; aliases?: string[]}[]}>(assets, path)))
      .then(graphs => withheldPhrases(graphs, []))
      .catch(error => { privacy.delete(assets); throw error })
    privacy.set(assets, pending)
  }
  return pending
}
const errorResponse = (status: number, error: string, headers = {}) => Response.json({error}, {status, headers: {'cache-control': 'no-store', ...headers}})

/** Canonical wire form: q, repeated f.<key>, f.<key>.min/max,
 * sort=<key>:<asc|desc>, page and pageSize. Accept the table's URL prefix too. */
export function parseTableQuery(params: URLSearchParams, columns: Column[], defaultSort: NonNullable<Query['sort']>): Query {
  const clean = new URLSearchParams()
  let prefix: string | undefined
  for (const [key, value] of params) {
    if (key === 'format') continue
    const match = /^(.+)\.(q|sort|page|pageSize|f\..+)$/.exec(key)
    const field = /^(?:q|sort|page|pageSize|f\..+)$/.test(key) ? key : match?.[2]
    if (!field) throw new Error('invalid_query')
    const current = field === key ? '' : match![1]
    if (prefix != null && prefix !== current) throw new Error('invalid_query')
    prefix = current
    clean.append(field, value)
  }
  for (const key of ['q', 'sort', 'page', 'pageSize']) if (clean.getAll(key).length > 1) throw new Error('invalid_query')
  const integer = (key: string, fallback: number, cap: number) => {
    const value = clean.get(key)
    if (value == null) return fallback
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error('invalid_query')
    return Math.min(Number(value), cap)
  }
  const q = tableText(clean.get('q') || '')
  if (q.length > 1000 || params.toString().length > 8192) throw new Error('invalid_query')
  const sort = clean.get('sort')?.split(':')
  if (sort && (sort.length !== 2 || !['asc', 'desc'].includes(sort[1]) || !columns.some(c => c.key === sort[0] && c.sortable !== false))) throw new Error('invalid_query')
  const filters: NonNullable<Query['filters']> = Object.create(null)
  for (const [field, value] of clean) {
    if (!field.startsWith('f.')) continue
    const match = /^f\.([^.]+)(?:\.(min|max))?$/.exec(field)
    const c = columns.find(c => c.key === match?.[1])
    if (!match || !c?.facet || value.length > 1000) throw new Error('invalid_query')
    if (c.facet === 'range') {
      if (!match[2] || clean.getAll(field).length > 1 || !value.trim() || !Number.isFinite(Number(value))) throw new Error('invalid_query')
      const range = filters[c.key] as {min?: number; max?: number} | undefined
      filters[c.key] = {...range, [match[2]]: Number(value)}
    } else {
      if (match[2]) throw new Error('invalid_query')
      const values = filters[c.key] as string[] | undefined
      // Facet values are opaque source values, including Unicode and spaces.
      filters[c.key] = [...new Set([...(values || []), value])].sort()
    }
  }
  for (const filter of Object.values(filters)) if (!Array.isArray(filter) && filter.min != null && filter.max != null && filter.min > filter.max) throw new Error('invalid_query')
  return {q, filters, sort: sort ? {key: sort[0], dir: sort[1] as 'asc' | 'desc'} : defaultSort, page: integer('page', 1, Number.MAX_SAFE_INTEGER), pageSize: integer('pageSize', 50, MAX_PAGE_SIZE)}
}
export function normalizedTableQuery(query: Query, csv = false): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  for (const key of Object.keys(query.filters || {}).sort()) {
    const filter = query.filters![key]
    if (Array.isArray(filter)) for (const value of filter) params.append('f.' + key, value)
    else for (const bound of ['min', 'max'] as const) if (filter[bound] != null) params.set(`f.${key}.${bound}`, String(filter[bound]))
  }
  if (query.sort) params.set('sort', `${query.sort.key}:${query.sort.dir}`)
  if (csv) params.set('format', 'csv')
  else { params.set('page', String(query.page)); params.set('pageSize', String(query.pageSize)) }
  return params.toString()
}

function intersect(a: Set<number> | undefined, b: Set<number>) {
  if (!a) return b
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  return new Set([...small].filter(id => large.has(id)))
}
function lowerBound(values: [number, number][], target: number, after = false) {
  let low = 0, high = values.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (values[mid][0] < target || after && values[mid][0] === target) low = mid + 1
    else high = mid
  }
  return low
}
async function select(assets: Fetcher, path: string, index: TableIndex, query: Query): Promise<Set<number> | undefined> {
  let selected: Set<number> | undefined
  for (const [key, filter] of Object.entries(query.filters || {})) {
    let matching: Set<number>
    if (Array.isArray(filter)) matching = new Set(filter.flatMap(value => Object.hasOwn(index.categories[key], value) ? index.categories[key][value] : []))
    else {
      const values = index.ranges[key]
      const from = filter.min == null ? 0 : lowerBound(values, filter.min)
      const to = filter.max == null ? values.length : lowerBound(values, filter.max, true)
      matching = new Set(values.slice(from, to).map(v => v[1]))
    }
    selected = intersect(selected, matching)
    if (!selected.size) return selected
  }
  const terms = [...new Set(tableTerms(query.q))]
  // A nonempty punctuation-only search has no matches.
  if (query.q && !terms.length) return new Set()
  const groups = terms.map(term => index.terms.filter(word => word.includes(term)))
  if (groups.some(group => !group.length)) return new Set()
  const buckets = [...new Set(groups.flat().map(tableBucket))]
  const postings = new Map<number, Record<string, number[]>>()
  // Stay under the Worker's six simultaneous subrequest connections.
  for (let start = 0; start < buckets.length; start += 4) await Promise.all(buckets.slice(start, start + 4).map(async bucket => {
    postings.set(bucket, await asset<Record<string, number[]>>(assets, `${path}/terms-${bucket}.json`))
  }))
  for (const group of groups) {
    selected = intersect(selected, new Set(group.flatMap(term => postings.get(tableBucket(term))![term] || [])))
    if (!selected.size) break
  }
  return selected
}
function facets(index: TableIndex, selected?: Set<number>): NonNullable<Page['facets']> {
  const out: NonNullable<Page['facets']> = {}
  for (const [key, values] of Object.entries(index.categories)) out[key] = Object.entries(values).map(([value, ids]) => ({value, count: selected ? ids.reduce((count, id) => count + Number(selected.has(id)), 0) : ids.length})).filter(v => v.count > 0).sort((a, b) => a.value.localeCompare(b.value, 'en'))
  for (const [key, values] of Object.entries(index.ranges)) {
    const min = selected ? values.find(v => selected.has(v[1]))?.[0] : values[0]?.[0]
    let max = values.at(-1)?.[0]
    if (selected) {
      max = undefined
      for (let i = values.length - 1; i >= 0; i--) if (selected.has(values[i][1])) { max = values[i][0]; break }
    }
    if (min != null && max != null) out[key] = {min, max}
  }
  return out
}
async function readValues(assets: Fetcher, path: string, index: TableIndex, ids: number[], columns: Column[], phrases?: WithheldPhrases, connections = false, csv = false) {
  const namesWithheld = phrases ? tablePrivacyCheck(phrases) : undefined
  const wanted = new Map(ids.map((id, position) => [id, position])), shards = [...new Set(ids.map(id => Math.floor(id / index.shardSize)))]
  const rows: (unknown[] | Uint8Array | undefined)[] = Array(ids.length).fill(undefined)
  const encoder = new TextEncoder()
  const strings = new Map<string, string>()
  const intern = (value: string) => { if (csv) return value; if (!strings.has(value)) strings.set(value, value); return strings.get(value)! }
  // Decode one shard at a time so exports stay bounded by the selected CSV
  // bytes plus one shard, even after a series of large table requests.
  for (const shard of shards) {
    const data = await asset<RowShard>(assets, `${path}/rows-${shard}.json`)
    const lines: {position: number; text: string}[] = []
    for (const [offset, entry] of data.rows.entries()) {
      const id = shard * index.shardSize + offset
      if (!wanted.has(id)) continue
      const values = columns.map((column, i) => {
        const value = entry.values[i]
        if (value == null || ['money', 'count', 'year'].includes(column.type)) return value
        return Array.isArray(value) ? value.map(v => intern(data.strings[v])) : intern(data.strings[value])
      })
      // Defence in depth: no donor evidence can pass merely because an index
      // names it. Corrupt/stale snapshots fail the request closed.
      if (entry.donors?.some(donor => !isOrganisationDonor(donor)) || namesWithheld?.('donor ' + values.flat().join(' '))) throw new Error('unavailable')
      if (connections) {
        const row = Object.fromEntries(columns.map((column, i) => [column.key, values[i]]))
        const type = row.type
        if (!['receipts', 'contracts', 'grants'].includes(String(type))) throw new Error('unavailable')
        const expected = type === 'receipts' ? row.from : type === 'grants' ? row.to : undefined
        if (expected != null && !entry.donors?.some(donor => donor.label === expected)) throw new Error('unavailable')
        if (entry.donors?.some(donor => donor.label !== row.from && donor.label !== row.to)) throw new Error('unavailable')
      }
      const position = wanted.get(id)!
      if (csv) lines.push({position, text: values.map(csvCell).join(',') + '\r\n'})
      else rows[position] = values
      wanted.delete(id)
    }
    if (csv) {
      // Share one backing buffer per shard instead of 50,000 small buffers.
      const bytes = encoder.encode(lines.map(line => line.text).join(''))
      let offset = 0
      for (const line of lines) {
        let length = 0
        for (const char of line.text) {
          const point = char.codePointAt(0)!
          length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
        }
        rows[line.position] = bytes.subarray(offset, offset + length)
        offset += length
      }
    }
    data.strings.length = 0
    data.rows.length = 0
  }
  if (wanted.size) throw new Error('unavailable')
  return rows as (unknown[] | Uint8Array)[]
}
function csvCell(value: unknown) {
  const exact = Array.isArray(value) ? value.join('; ') : String(value ?? '')
  return '"' + exact.replaceAll('"', '""') + '"'
}
export function tableCSV(rows: Row[], columns: Column[]): string {
  return [columns.map(c => csvCell(c.label)).join(','), ...rows.map(row => columns.map(c => csvCell(row[c.key])).join(','))].join('\r\n') + '\r\n'
}
function csvChunks(rows: Uint8Array[], columns: Column[]) {
  const encoder = new TextEncoder()
  const chunks: (Uint8Array | Uint8Array[])[] = [encoder.encode(columns.map(c => csvCell(c.label)).join(',') + '\r\n')]
  for (let start = 0; start < rows.length; start += 256) chunks.push(rows.slice(start, start + 256))
  rows.length = 0
  return chunks
}
function byteStream(chunks: (Uint8Array | Uint8Array[])[], write?: (chunk: Uint8Array, part: number) => Promise<void>, complete?: () => void) {
  let cursor = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cursor === chunks.length) { chunks.length = 0; controller.close(); complete?.(); return }
      const part = chunks[cursor]
      let bytes: Uint8Array
      if (Array.isArray(part)) {
        // Coalesce only the current part, never a second full export buffer.
        bytes = new Uint8Array(part.reduce((size, row) => size + row.byteLength, 0))
        let offset = 0
        for (const row of part) { bytes.set(row, offset); offset += row.byteLength }
        part.length = 0
      } else bytes = part
      if (write) await write(bytes, cursor)
      controller.enqueue(bytes)
      chunks[cursor++] = new Uint8Array()
    },
    cancel() { chunks.length = 0 },
  })
}
type CachedCSV = {headers: Record<string, string>; parts: number}
function csvPart(key: Request, part: number) {
  const url = new URL(key.url)
  url.searchParams.set('__csvPart', String(part))
  return new Request(url)
}
async function cachedCSV(cache: Cache, key: Request, metadata: CachedCSV): Promise<Response | undefined> {
  const chunks: Uint8Array[] = []
  for (let start = 0; start < metadata.parts; start += 4) {
    const parts = await Promise.all(Array.from({length: Math.min(4, metadata.parts - start)}, async (_, offset) => {
      const part = await cache.match(csvPart(key, start + offset))
      return part ? new Uint8Array(await part.arrayBuffer()) : undefined
    }))
    if (parts.some(part => !part)) return undefined
    chunks.push(...parts as Uint8Array[])
  }
  return new Response(byteStream(chunks), {headers: metadata.headers})
}
async function conditional(request: Request, response: Response) {
  const etag = response.headers.get('etag')
  return etag && request.headers.get('if-none-match')?.split(',').map(v => v.trim()).some(v => v === etag || v === '*') ? new Response(null, {status: 304, headers: response.headers}) : response
}

/** This handler only reads ASSETS and the edge response cache. */
export async function tableApi(request: Request, env: TableEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url), name = url.pathname.slice('/api/table/'.length)
  if (!Object.hasOwn(TABLE_DATASETS, name)) return errorResponse(404, 'not_found')
  if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', {allow: 'GET'})
  const config = TABLE_DATASETS[name]
  const format = url.searchParams.get('format')
  if (url.searchParams.getAll('format').length > 1 || format != null && format !== 'csv') return errorResponse(400, 'invalid_query')
  let query: Query
  try { query = parseTableQuery(url.searchParams, config.columns, config.defaultSort) }
  catch { return errorResponse(400, 'invalid_query') }
  try {
    const m = await manifest(env.ASSETS), dataset = m.datasets[name]
    if (m.schema !== 2 || !dataset) throw new Error('unavailable')
    const phrases = config.privacy ? await donorPhrases(env.ASSETS) : undefined
    const blocked = !!phrases && namesWithheldPhrase(phrases, 'donor ' + query.q, ...Object.values(query.filters || {}).flatMap(v => Array.isArray(v) ? v.map(s => 'donor ' + s) : []))
    // Neither responses nor normalized URL state retain a withheld name.
    if (blocked) query = {...query, q: '', filters: {}}
    const normalized = normalizedTableQuery(query, format === 'csv')
    const location = `/api/table/${name}?${normalized}`
    const cacheURL = new URL(location, 'https://opax.com.au')
    cacheURL.searchParams.set('__version', dataset.version + ':' + (env.CACHE_EPOCH || ''))
    if (blocked) cacheURL.searchParams.set('__privacy', 'withheld')
    const cacheKey = new Request(cacheURL)
    const cache = typeof caches === 'undefined' ? undefined : caches.default
    const hit = await cache?.match(cacheKey)
    if (hit) {
      if (hit.headers.get('x-table-cache') === 'csv-parts') {
        const stored = await cachedCSV(cache!, cacheKey, await hit.json<CachedCSV>())
        if (stored) return conditional(request, stored)
      } else return conditional(request, hit)
    }
    const unfilteredCSV = format === 'csv' && !query.q && !Object.keys(query.filters || {}).length
    const unfiltered = !query.q && !Object.keys(query.filters || {}).length
    const summary = !blocked && unfiltered && !unfilteredCSV ? await asset<TableSummary>(env.ASSETS, dataset.path + '/summary.json') : undefined
    const index: TableIndex = blocked || unfiltered ? {schema: 2, count: dataset.count, shardSize: summary?.shardSize || 1024, categories: {}, ranges: {}, terms: []} : {...await asset<TableIndex>(env.ASSETS, dataset.path + '/index.json')}
    if (index.schema !== 2 || index.count !== dataset.count) throw new Error('unavailable')
    if (summary && (summary.schema !== 2 || summary.count !== dataset.count)) throw new Error('unavailable')
    const selected = blocked ? new Set<number>() : await select(env.ASSETS, dataset.path, index, query)
    const total = selected?.size ?? index.count
    const pageSize = query.pageSize!, page = Math.min(query.page!, Math.max(1, Math.ceil(total / pageSize)))
    let ids: number[] = []
    if (total) {
      const order = await asset<number[]>(env.ASSETS, `${dataset.path}/sort-${query.sort!.key}.json`)
      const sorted = query.sort!.dir === 'desc' ? order.slice().reverse() : order
      const matching = selected ? sorted.filter(id => selected.has(id)) : sorted
      ids = format === 'csv' ? matching.slice(0, MAX_CSV) : matching.slice((page - 1) * pageSize, page * pageSize)
    }
    const counts = format === 'csv' ? undefined : summary?.facets || facets(index, selected)
    if (phrases && counts && Object.values(counts).some(value => Array.isArray(value) && value.some(f => tablePrivacyCheck(phrases)('donor ' + f.value)))) throw new Error('unavailable')
    // Release postings before decoding cells; unfiltered pages use a small
    // precomputed facet summary and never load the full query index.
    index.categories = {}; index.ranges = {}; index.terms = []
    const values = await readValues(env.ASSETS, dataset.path, index, ids, config.columns, phrases, name === 'money-connections' || name === 'party-money', format === 'csv')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheURL.toString()))
    const etag = '"' + [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') + '"'
    const headers: Record<string, string> = {'cache-control': CACHE_CONTROL, 'content-location': location, etag, 'x-content-type-options': 'nosniff'}
    let response: Response
    if (format === 'csv') {
      headers['content-type'] = 'text/csv; charset=utf-8'
      headers['content-disposition'] = `attachment; filename="${name}.csv"`
      headers['x-table-total'] = String(total)
      headers['x-table-exported'] = String(values.length)
      const chunks = csvChunks(values as Uint8Array[], config.columns)
      const metadata: CachedCSV = {headers, parts: chunks.length}
      let complete = true
      // Cache bounded byte chunks instead of teeing a large response body in
      // the isolate. Publish its normalized cache key only after every part.
      response = new Response(byteStream(chunks, cache ? async (chunk, part) => {
        try { await cache.put(csvPart(cacheKey, part), new Response(chunk, {headers: {'cache-control': 'public, max-age=120'}})) }
        catch { complete = false }
      } : undefined, cache ? () => {
        if (complete) ctx.waitUntil(cache.put(cacheKey, Response.json(metadata, {headers: {'cache-control': CACHE_CONTROL, 'x-table-cache': 'csv-parts'}})).catch(() => {}))
      } : undefined), {headers})
    } else {
      const rows = (values as unknown[][]).map(values => Object.fromEntries(config.columns.map((column, i) => [column.key, values[i]])))
      const result: Page = {rows, total, page, pageSize, facets: counts}
      response = Response.json(result, {headers})
    }
    if (cache && format !== 'csv') ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}))
    return conditional(request, response)
  } catch { return errorResponse(503, 'unavailable') }
}
