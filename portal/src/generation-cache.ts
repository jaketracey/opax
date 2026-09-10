// Successful public generations get an edge cache plus a shared, expiring KV
// copy. Callers own eligibility and include corpus/prompt versions in the key.
// Private conversations and account responses must never use this cache.
type CacheEnv = Pick<Env, 'GENERATION_CACHE'>
type StoredGeneration = { version: 1; body: string; cachedAt: string; expiresAt: number }
const MAX_BYTES = 1_000_000
const MAX_TTL = 7 * 24 * 3600
const encoder = new TextEncoder()

function storageKey(key: Request): string | null {
  const url = new URL(key.url)
  return url.origin === 'https://cache.opax.internal' && /^\/(ask|search-summary|journey-story)\/[a-f0-9]{64}$/.test(url.pathname)
    ? 'v1' + url.pathname : null
}

function metric(key: Request, result: string): void {
  console.log(JSON.stringify({event: 'generation_cache', route: new URL(key.url).pathname.split('/')[1], result}))
}

async function persist(env: CacheEnv, key: string, response: Response, expiresAt: number): Promise<boolean> {
  const remaining = Math.floor((expiresAt - Date.now()) / 1000)
  if (!env.GENERATION_CACHE || remaining < 60 || remaining > MAX_TTL) return false
  // These responses are bounded, validated generation payloads, not upstream streams.
  const body = await response.text()
  if (encoder.encode(body).byteLength > MAX_BYTES) return false
  JSON.parse(body)
  const entry: StoredGeneration = {version: 1, body, cachedAt: response.headers.get('x-opax-cached-at')!, expiresAt}
  await env.GENERATION_CACHE.put(key, JSON.stringify(entry), {expirationTtl: remaining})
  return true
}

export async function readGenerationCache(env: CacheEnv, ctx: ExecutionContext, key: Request): Promise<Response | undefined> {
  const id = storageKey(key)
  if (!id) return undefined
  try {
    const hit = await caches.default.match(key)
    if (hit) {
      metric(key, 'edge_hit')
      const out = new Response(hit.body, hit)
      out.headers.set('x-opax-cache-tier', 'edge')
      // Adopt still-fresh answers cached before the shared layer was deployed.
      // Preserve their original expiry; never restart the freshness clock.
      if (!hit.headers.has('x-opax-shared-cache')) {
        const age = Number(/max-age=(\d+)/.exec(hit.headers.get('cache-control') || '')?.[1])
        const saved = Date.parse(hit.headers.get('x-opax-cached-at') || '')
        if (Number.isFinite(saved) && age > 0 && age <= MAX_TTL) {
          const copy = out.clone()
          const marked = out.clone()
          ctx.waitUntil(persist(env, id, copy, saved + age * 1000).then(async stored => {
            if (!stored) return
            marked.headers.set('x-opax-shared-cache', '1')
            marked.headers.set('cache-control', `public, max-age=${Math.max(0, Math.floor((saved + age * 1000 - Date.now()) / 1000))}`)
            await caches.default.put(key, marked)
          }).catch(() => metric(key, 'write_error')))
        }
      }
      return out
    }
  } catch { metric(key, 'edge_read_error') }
  if (env.GENERATION_CACHE) {
    try {
      const entry = await env.GENERATION_CACHE.get<StoredGeneration>(id, {type: 'json'})
      const remaining = entry && Math.floor((entry.expiresAt - Date.now()) / 1000)
      if (entry?.version === 1 && typeof entry.body === 'string' && encoder.encode(entry.body).byteLength <= MAX_BYTES &&
          typeof remaining === 'number' && remaining > 0 && remaining <= MAX_TTL && Number.isFinite(Date.parse(entry.cachedAt))) {
        JSON.parse(entry.body)
        const out = new Response(entry.body, {headers: {
          'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${remaining}`,
          'x-opax-cached-at': entry.cachedAt, 'x-opax-shared-cache': '1', 'x-opax-cache-tier': 'shared',
        }})
        ctx.waitUntil(caches.default.put(key, out.clone()).catch(() => metric(key, 'edge_write_error')))
        metric(key, 'shared_hit')
        return out
      }
    } catch { metric(key, 'shared_read_error') }
  }
  metric(key, 'miss')
  return undefined
}

export function storeGenerationCache(env: CacheEnv, ctx: ExecutionContext, key: Request, response: Response, ttl: number): void {
  const id = storageKey(key)
  if (!id || response.status !== 200 || response.headers.has('set-cookie') || ttl < 60 || ttl > MAX_TTL) return
  const saved = Date.now()
  response.headers.set('cache-control', `public, max-age=${ttl}`)
  response.headers.set('x-opax-cached-at', new Date(saved).toISOString())
  ctx.waitUntil(caches.default.put(key, response.clone()).catch(() => metric(key, 'edge_write_error')))
  const marked = response.clone()
  ctx.waitUntil(persist(env, id, response.clone(), saved + ttl * 1000).then(async stored => {
    if (!stored) return
    marked.headers.set('x-opax-shared-cache', '1')
    marked.headers.set('cache-control', `public, max-age=${Math.max(0, Math.floor((saved + ttl * 1000 - Date.now()) / 1000))}`)
    await caches.default.put(key, marked)
  }).catch(() => metric(key, 'write_error')))
}
