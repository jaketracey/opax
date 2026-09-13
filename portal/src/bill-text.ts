/** Read-only delivery of complete, published original bill texts. */
type Metadata = Record<string, unknown>
type Resource = {
  slug?: string
  title?: string
  usermetadata?: { classifications?: { labelset: string; label: string }[] }
  extra?: { metadata?: Metadata }
  data?: { texts?: Record<string, { value?: { body?: string } }> }
}
type Catalog = {
  resources?: Record<string, Resource>
  fulltext?: { total?: number; next_page?: boolean }
}
export interface BillTextDependencies {
  kbFetch(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<Response>
  cacheEpoch?: string
  waitUntil(promise: Promise<unknown>): void
  cache?: Cache
}
const ORDER: Record<string, number> = { aspassed: 60, 'third-senate': 50, 'third-reps': 40, 'first-senate': 30, 'first-reps': 20, first: 10 }
const COVERAGE = 'Complete source versions published so far. Other versions may still be awaiting collection; this is not a list of every version issued by Parliament.'
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
function sourceUrl(value: unknown): string | null {
  try { const url = new URL(string(value)); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null } catch { return null }
}
function versionMetadata(resource: Resource, key: string, requestedId?: string) {
  const meta = resource.extra?.metadata ?? {}
  const id = string(meta.version_id)
  const match = /^([rs]\d+)-([a-z0-9-]+)$/.exec(id)
  const labels = resource.usermetadata?.classifications ?? []
  if (!match || (/^au-federal-[rs]\d+$/.test(key) && key !== `au-federal-${match[1]}`) || meta.bill_key !== key || meta.complete !== true ||
      (requestedId && id !== requestedId) || meta.stage !== match[2] ||
      string(meta.source_version).replaceAll('_', '-') !== id ||
      resource.slug !== `bill-text-${key}-${match[2]}` ||
      !labels.some(label => label.labelset === 'kind' && label.label === 'bill_text')) return null
  const url = sourceUrl(meta.source_url)
  if (!url || !string(meta.title) || !/^[a-f0-9]{64}$/.test(string(meta.source_text_sha256))) return null
  return {
    id, source_version: string(meta.source_version), stage: match[2],
    stage_label: string(meta.stage_label) || match[2],
    date: /^\d{4}-\d{2}-\d{2}$/.test(string(meta.date)) ? string(meta.date) : null,
    source_url: url, format: /\.pdf(?:$|[?#])/i.test(url) ? 'pdf' : 'html',
    status: 'complete', text_url: `/bill-texts/${key}/${id}.json`,
    characters: count(meta.characters), pages: count(meta.pages), sections: count(meta.section_count),
    coverage_note: 'Original source text, with all collected sections preserved.', sha256: string(meta.source_text_sha256),
  }
}

async function manifest(key: string, deps: BillTextDependencies) {
  const resources = new Map<string, Resource>()
  // A bill has few versions. Bound upstream work, but never silently return a partial catalog.
  for (let page = 0; page < 10; page++) {
    const response = await deps.kbFetch('/catalog', { body: {
      filter_expression: { resource: { and: [
        { prop: 'label', labelset: 'kind', label: 'bill_text' },
        { prop: 'label', labelset: 'bill_key', label: key },
      ] } }, show: ['basic', 'extra'], page_size: 100, page_number: page,
    } })
    if (!response.ok) throw new Error('Bill text catalog unavailable')
    const result = await response.json() as Catalog
    if (!result.resources || typeof result.resources !== 'object') throw new Error('Invalid bill text catalog')
    for (const [id, resource] of Object.entries(result.resources)) resources.set(id, resource)
    const total = result.fulltext?.total
    const more = result.fulltext?.next_page === true || (typeof total === 'number' && resources.size < total)
    if (!more) break
    if (page === 9 || !Object.keys(result.resources).length) throw new Error('Incomplete bill text catalog')
  }
  const byVersion = new Map<string, { version: NonNullable<ReturnType<typeof versionMetadata>>; title: string }>()
  for (const resource of resources.values()) {
    const version = versionMetadata(resource, key)
    const matchesKey = resource.usermetadata?.classifications?.some(label => label.labelset === 'bill_key' && label.label === key)
    if (version && matchesKey) byVersion.set(version.id, { version, title: string(resource.extra?.metadata?.title) })
  }
  const rows = [...byVersion.values()].sort((a, b) => (ORDER[b.version.stage] ?? 0) - (ORDER[a.version.stage] ?? 0) ||
    (b.version.date ?? '').localeCompare(a.version.date ?? '') || b.version.id.localeCompare(a.version.id))
  if (!rows.length) return null
  return { bill_key: key, title: rows[0].title, generated_at: new Date().toISOString(),
    default_version_id: rows[0].version.id, versions: rows.map(row => row.version), coverage_note: COVERAGE }
}

async function fullVersion(key: string, id: string, deps: BillTextDependencies) {
  const match = /^([rs]\d+)-([a-z0-9-]+)$/.exec(id)
  if (!match || (/^au-federal-[rs]\d+$/.test(key) && key !== `au-federal-${match[1]}`)) return null
  const response = await deps.kbFetch(`/slug/bill-text-${key}-${match[2]}?show=basic&show=extra&show=values`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Bill text source unavailable')
  const resource = await response.json() as Resource
  const version = versionMetadata(resource, key, id)
  if (!version) return null
  const meta = resource.extra!.metadata!
  const fields = resource.data?.texts ?? {}
  // Match /api/resource: use one original source family, never a generated summary.
  const body = Object.keys(fields).filter(name => /^body(?:-\d+)?$/.test(name))
  const keys = body.length ? body : Object.keys(fields).filter(name => /^t-body(?:-\d+)?$/.test(name))
  const text = keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(name => fields[name]?.value?.body ?? '').join('')
  if (!text) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const sha = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  if (sha !== version.sha256 || (version.characters !== null && Array.from(text).length !== version.characters)) throw new Error('Bill text integrity check failed')
  let sections: { id: string; title: string; text: string; source_url: string }[] = []
  if (meta.section_offset_unit === 'utf16' && Array.isArray(meta.sections)) {
    sections = meta.sections.map((value: Metadata, index: number) => {
      const start = count(value.start), end = count(value.end)
      return { id: string(value.id) || `section-${index + 1}`, title: string(value.title) || `Section ${index + 1}`,
        text: start !== null && end !== null && end >= start && end <= text.length ? text.slice(start, end) : '',
        source_url: sourceUrl(value.source_url) ?? version.source_url }
    })
  }
  // Older records may lack offsets. Preserve the entire verified source as one section.
  if (!sections.length || sections.map(section => section.text).join('\n\n') !== text) {
    sections = [{ id: 'full-text', title: 'Bill text', text, source_url: version.source_url }]
  }
  return { bill_key: key, title: string(meta.title), version, text, sections, complete: true }
}

/** Null lets the caller try a pre-exported static asset. Failures are never cached. */
export async function handleBillText(request: Request, deps: BillTextDependencies): Promise<Response | null> {
  const url = new URL(request.url)
  const route = /^\/bill-texts\/(au-federal-[a-z0-9-]{1,140})\/(index|[rs]\d+-[a-z0-9-]+)\.json$/.exec(url.pathname)
  if (!route) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405)
  const [, key, id] = route
  const cache = deps.cache ?? caches.default
  const bypass = url.searchParams.get('nocache') === '1' || request.headers.get('x-opax-nocache') === '1'
  const cacheKey = new Request(`https://opax.com.au/__bill-text/${encodeURIComponent(deps.cacheEpoch ?? '1')}/${key}/${id}.json`)
  const ttl = id === 'index' ? 60 : 3600
  const respond = (response: Response, state: string) => {
    const out = new Response(request.method === 'HEAD' ? null : response.body, response)
    out.headers.set('x-opax-cache', state)
    return out
  }
  if (!bypass) {
    const hit = await cache.match(cacheKey)
    if (hit) return respond(hit, 'HIT')
  }
  try {
    const data = id === 'index' ? await manifest(key, deps) : await fullVersion(key, id, deps)
    if (!data) return null
    const response = json(data)
    response.headers.set('cache-control', bypass ? 'no-store' : `public, max-age=${ttl}`)
    if (!bypass) deps.waitUntil(cache.put(cacheKey, response.clone()))
    return respond(response, bypass ? 'BYPASS' : 'MISS')
  } catch {
    return json({ error: 'Bill text is temporarily unavailable. Please try again or open the original source.' }, 502)
  }
}
