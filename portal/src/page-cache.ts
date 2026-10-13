/**
 * Edge cache for server-rendered person and supplier pages (caches.default,
 * per colo). Such a page is a pure function of the deployed code, its static assets, the
 * Worker vars and the URL: nothing per-reader (no cookie, nonce, CSRF token or
 * experiment bucket) enters it. The key names every one of those inputs, so a
 * deploy, a data refresh (CACHE_EPOCH) can never
 * be answered from an older render. Browsers still revalidate every view
 * (max-age=0, must-revalidate) and get a 304 from the stored ETag.
 */
export const PAGE_CACHE_VERSION = 'page-v2'
/** Fresh for six hours; for one more hour a stored copy is served while a new render runs. */
export const PAGE_CACHE_TTL = 6 * 3600
export const PAGE_CACHE_STALE = 3600
const PAGE_CACHE_ORIGIN = 'https://cache.opax.internal'
const BROWSER_CACHE = 'x-opax-browser-cache-control'
const CACHED_AT = 'x-opax-cached-at'

export interface PageCacheInputs {
  /** env.CACHE_EPOCH: bumped with every corpus or data refresh. */
  epoch: string
  /** The deployed Worker version id (a new id for every deploy, assets included). */
  workerVersion: string
  /** The shell asset's ETag, which moves with every stamped asset. */
  assets: string
  url: URL
}

/** The query as the renderer reads it: every pair, in a stable order, without the cache bypass. */
export function pageCacheSearch(url: URL): string {
  const params = [...url.searchParams].filter(([key]) => key !== 'nocache')
  params.sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)
  return new URLSearchParams(params).toString()
}

export async function pageCacheKey(inputs: PageCacheInputs): Promise<Request> {
  const parts = [PAGE_CACHE_VERSION, inputs.epoch, inputs.workerVersion, inputs.assets, inputs.url.pathname, pageCacheSearch(inputs.url)]
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)))
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  return new Request(`${PAGE_CACHE_ORIGIN}/page/${hex}`)
}

/** The stored copy: the edge holds it for the TTL plus the stale window; the browser's own header rides along. */
export async function pageForStorage(response: Response, now = Date.now()): Promise<Response> {
  const safe = await Promise.resolve(response)
  const headers = new Headers(safe.headers)
  headers.set(BROWSER_CACHE, safe.headers.get('cache-control') ?? 'public, max-age=0, must-revalidate')
  headers.set('cache-control', `public, max-age=${PAGE_CACHE_TTL + PAGE_CACHE_STALE}`)
  headers.set(CACHED_AT, new Date(now).toISOString())
  headers.delete('server-timing'); headers.delete('x-opax-cache'); headers.delete('set-cookie')
  return new Response(safe.body, {status: safe.status, statusText: safe.statusText, headers})
}

/** A stored copy as a reader gets it, and whether it is past its fresh window. */
export async function pageFromStorage(hit: Response, now = Date.now()): Promise<{response: Response; stale: boolean}> {
  const safe = await Promise.resolve(hit)
  const headers = new Headers(safe.headers)
  const cachedAt = Date.parse(headers.get(CACHED_AT) ?? '')
  headers.set('cache-control', headers.get(BROWSER_CACHE) ?? 'public, max-age=0, must-revalidate')
  headers.delete(BROWSER_CACHE); headers.delete(CACHED_AT)
  headers.set('x-opax-cache', 'HIT')
  const stale = !(now - cachedAt < PAGE_CACHE_TTL * 1000)
  return {response: new Response(safe.body, {status: safe.status, statusText: safe.statusText, headers}), stale}
}
