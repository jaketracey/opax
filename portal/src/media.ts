/**
 * /media/<name>: larger media files (demo videos) live in R2, not in git or the static assets.
 * GET and HEAD only, a fixed name pattern, byte ranges for video players (206 with Content-Range,
 * 416 when the range cannot be served). Nothing here writes to the bucket.
 */
const MEDIA_NAME = /^[a-z0-9][a-z0-9-]{0,100}\.(mp4|webm)$/
const TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm' }

type Range = { offset?: number, length?: number, suffix?: number }

export async function serveMedia(request: Request, bucket: R2Bucket | undefined, path: string): Promise<Response> {
  const name = path.slice('/media/'.length), match = MEDIA_NAME.exec(name)
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
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
