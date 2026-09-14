/**
 * Refuses API and share-image requests from networks that run scraper fleets,
 * and refuses only the model-backed routes from networks that render pages in
 * bulk but must keep fetching share images.
 *
 * Why: from 4 Sep 2026 a headless-Chrome fleet of ~650 Alibaba Cloud Singapore
 * addresses (AS45102) rendered the site around the clock, each address staying
 * under the per-IP rate limit, and made ~100x more paid /api/ask calls than
 * real readers. Blocking by ASN catches the whole fleet at once; static pages
 * stay open so the site is still indexable.
 *
 * From 11 Sep 2026 Meta's own network (AS32934, a plain Chrome user agent, not
 * facebookexternalhit) rendered the search page ~400 times a day and fired the
 * search summary on each render: ~350 model generations a day against ~7 from
 * readers. Meta's crawler also fetches the /og share images for link previews,
 * so it is refused only on the routes that call a model.
 *
 * Both lists live in vars (comma-separated) so they can change without a code
 * deploy. Cloudflare supplies request.cf.asn on every request.
 */

/** Paths that cost money or CPU: the knowledge-base proxy and share images. */
export const BLOCKED_PATHS = /^\/(?:api\/|og\/|bill-texts\/)/

/** Routes that call a generative model: the paid subset of BLOCKED_PATHS. */
export const GENERATION_PATHS = /^\/api\/(?:ask|search-summary|followups|journey-story)(?:\/|$)/

export const DEFAULT_BLOCKED_ASNS = '45102,24429,37963' // Alibaba Cloud (intl, CN, Hangzhou)
export const DEFAULT_GENERATION_BLOCKED_ASNS = '32934' // Meta (Facebook) crawler network

export type NetworkBlockEnv = { BLOCKED_ASNS?: string; GENERATION_BLOCKED_ASNS?: string }

function parseAsns(raw: string): Set<number> {
  return new Set(raw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0))
}

export function blockedAsns(env: NetworkBlockEnv): Set<number> {
  return parseAsns(env.BLOCKED_ASNS ?? DEFAULT_BLOCKED_ASNS)
}

export function generationBlockedAsns(env: NetworkBlockEnv): Set<number> {
  return parseAsns(env.GENERATION_BLOCKED_ASNS ?? DEFAULT_GENERATION_BLOCKED_ASNS)
}

export function requestAsn(request: Request): number | null {
  const asn = (request as Request & { cf?: { asn?: unknown } }).cf?.asn
  return typeof asn === 'number' && Number.isInteger(asn) ? asn : null
}

/** A 403 for a blocked network on a blocked path, otherwise null. */
export function networkBlock(request: Request, env: NetworkBlockEnv, pathname: string): Response | null {
  if (!BLOCKED_PATHS.test(pathname)) return null
  const asn = requestAsn(request)
  if (asn === null) return null
  const refused = blockedAsns(env).has(asn) || (GENERATION_PATHS.test(pathname) && generationBlockedAsns(env).has(asn))
  if (!refused) return null
  return new Response(JSON.stringify({ error: 'forbidden', reason: 'network' }), {
    status: 403,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
