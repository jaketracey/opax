/**
 * Refuses API and share-image requests from networks that run scraper fleets.
 *
 * Why: from 4 Sep 2026 a headless-Chrome fleet of ~650 Alibaba Cloud Singapore
 * addresses (AS45102) rendered the site around the clock, each address staying
 * under the per-IP rate limit, and made ~100x more paid /api/ask calls than
 * real readers. Blocking by ASN catches the whole fleet at once; static pages
 * stay open so the site is still indexable.
 *
 * The list lives in the BLOCKED_ASNS var (comma-separated) so it can change
 * without a code deploy. Cloudflare supplies request.cf.asn on every request.
 */

/** Paths that cost money or CPU: the knowledge-base proxy and share images. */
export const BLOCKED_PATHS = /^\/(?:api\/|og\/)/

export const DEFAULT_BLOCKED_ASNS = '45102,24429,37963' // Alibaba Cloud (intl, CN, Hangzhou)

export function blockedAsns(env: { BLOCKED_ASNS?: string }): Set<number> {
  const raw = env.BLOCKED_ASNS ?? DEFAULT_BLOCKED_ASNS
  return new Set(raw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0))
}

export function requestAsn(request: Request): number | null {
  const asn = (request as Request & { cf?: { asn?: unknown } }).cf?.asn
  return typeof asn === 'number' && Number.isInteger(asn) ? asn : null
}

/** A 403 for a blocked network on a blocked path, otherwise null. */
export function networkBlock(request: Request, env: { BLOCKED_ASNS?: string }, pathname: string): Response | null {
  if (!BLOCKED_PATHS.test(pathname)) return null
  const asn = requestAsn(request)
  if (asn === null || !blockedAsns(env).has(asn)) return null
  return new Response(JSON.stringify({ error: 'forbidden', reason: 'network' }), {
    status: 403,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
