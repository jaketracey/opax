/**
 * /media/<name>: larger media files (demo videos) live in R2, not in git or the static assets.
 * GET and HEAD only, a fixed name pattern, byte ranges for video players (206 with Content-Range,
 * 416 when the range cannot be served). Nothing here writes to the bucket.
 *
 * /media/expenses/v1/<person_id>/<year>.json: IPEA's itemised expense lines for one person and
 * reporting year (scripts/export_expenses_itemised.py), as application/json with the object's ETag;
 * a matching If-None-Match is answered 304.
 */
const MEDIA_NAME = /^[a-z0-9][a-z0-9-]{0,100}\.(mp4|webm)$/
const TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm' }
const DATA_NAME = /^expenses\/v1\/[A-Za-z0-9_-]{1,80}\/\d{4}\.json$/
// The files change once a quarter; an hour in caches, then revalidated by ETag.
const DATA_CACHE = 'public, max-age=3600, stale-while-revalidate=86400'

async function serveData(request: Request, bucket: R2Bucket, name: string): Promise<Response> {
  let object: R2Object | R2ObjectBody | null
  try {
    object = request.method === 'HEAD' ? await bucket.head(name) : await bucket.get(name, { onlyIf: request.headers })
  } catch {
    return new Response('This data is unavailable just now.', { status: 503, headers: { 'retry-after': '60' } })
  }
  if (!object) return new Response('Not found', { status: 404 })
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', etag: object.httpEtag, 'cache-control': DATA_CACHE, 'x-content-type-options': 'nosniff' })
  if (request.method === 'HEAD') { headers.set('content-length', String(object.size)); return new Response(null, { headers }) }
  // R2 returns the object without a body when If-None-Match matched.
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  return new Response((object as R2ObjectBody).body, { headers })
}

type Range = { offset?: number, length?: number, suffix?: number }

export async function serveMedia(request: Request, bucket: R2Bucket | undefined, path: string): Promise<Response> {
  const name = path.slice('/media/'.length), match = MEDIA_NAME.exec(name)
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  if (bucket && DATA_NAME.test(name)) return serveData(request, bucket, name)
  if (!match || !bucket) return new Response('Not found', { status: 404 })
  const wanted = request.method === 'GET' ? request.headers.get('range') : null
  let object: R2Object | R2ObjectBody | null
  try {
    object = request.method === 'HEAD' ? await bucket.head(name) : await bucket.get(name, wanted ? { range: request.headers } : {})
  } catch {
    // R2 refuses a range it cannot satisfy; the size comes from a metadata read. Any other failure is the store's, not the request's.
    if (!wanted) return new Response('Media is unavailable just now.', { status: 503, headers: { 'retry-after': '60' } })
    const head = await bucket.head(name)
    return head ? new Response(null, { status: 416, headers: { 'content-range': `bytes */${head.size}` } }) : new Response('Not found', { status: 404 })
  }
  if (!object) return new Response('Not found', { status: 404 })
  const headers = new Headers({
    'content-type': TYPES[match[1]],
    'accept-ranges': 'bytes',
    etag: object.httpEtag,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  })
  if (!('body' in object)) { headers.set('content-length', String(object.size)); return new Response(null, { headers }) }
  const body = (object as R2ObjectBody).body, range = object.range as Range | undefined
  if (wanted && range) {
    const offset = range.suffix !== undefined ? Math.max(0, object.size - range.suffix) : range.offset ?? 0
    const length = range.suffix !== undefined ? object.size - offset : Math.min(range.length ?? object.size - offset, object.size - offset)
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set('content-length', String(length))
    return new Response(body, { status: 206, headers })
  }
  headers.set('content-length', String(object.size))
  return new Response(body, { headers })
}
