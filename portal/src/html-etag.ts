/**
 * Validators for HTML the Worker assembles (a page shell rewritten with that
 * page's head and server-rendered answer). The shell asset's own ETag names the
 * unrewritten file, so it is never passed on; this one is a digest of every
 * input the rewrite used, and a revisit whose copy still matches is a 304
 * instead of the whole page again. Cache-Control stays max-age=0,
 * must-revalidate: the page is checked on every view, just cheaply.
 */
export async function htmlValidator(parts: unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)))
  const hex = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `W/"h-${hex}"`
}

/** A 304 carrying `headers` when the request's If-None-Match names `etag` (weak comparison). */
export function notModified(request: Request, etag: string, headers: Headers): Response | null {
  const header = request.headers.get('if-none-match')
  if (!header) return null
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '')
  const want = opaque(etag)
  if (!header.split(',').some((tag) => opaque(tag) === want || tag.trim() === '*')) return null
  const out = new Headers(headers)
  for (const name of ['content-length', 'content-encoding', 'content-type']) out.delete(name)
  out.set('etag', etag)
  return new Response(null, { status: 304, headers: out })
}

