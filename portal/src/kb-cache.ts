/** A short-lived edge cache for the read-only KB lookups Ask repeats: passage searches (/find) and the count
 * queries behind speech rankings and trends (/catalog, /search totals). Keyed by path, request body and
 * CACHE_EPOCH, so the nightly index refresh starts a fresh cache. Only successful JSON is stored. */
export const KB_CACHE_TTL = 3600
const CACHED_PATHS = new Set(['/find', '/catalog', '/search'])

export async function cachedKbLookup(path: string, body: unknown, epoch: string | undefined, fetcher: () => Promise<Record<string, unknown>>,
  waitUntil?: (work: Promise<unknown>) => void, cache: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default): Promise<Record<string, unknown>> {
  if (!CACHED_PATHS.has(path) || body === undefined || !cache || !epoch) return fetcher()
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ path, body, epoch }))))].map(b => b.toString(16).padStart(2, '0')).join('')
  const key = new Request(`https://cache.opax.internal/kb${path}/${digest}`)
  try {
    const hit = await cache.match(key)
    if (hit?.ok) return await hit.json() as Record<string, unknown>
  } catch { /* A cache miss or unreadable entry reads the KB. */ }
  const data = await fetcher()
  const put = cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${KB_CACHE_TTL}` } })).catch(() => {})
  if (waitUntil) waitUntil(put)
  else await put
  return data
}
