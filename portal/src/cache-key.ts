/**
 * Query parameters that never change a response: campaign tags, ad click ids and
 * cache-busters that links and scripts append. Left in an edge-cache key, each
 * variant is a separate MISS, and a search MISS is a rate-limited upstream call.
 * A deny list, not an allow list, so a new real filter is never dropped from a key.
 */
const TRACKING_PARAM = /^(?:utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|igshid|yclid|ttclid|twclid|li_fat_id|mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|ref_src|_)$/i

/** The query as a stable cache-key fragment: sorted, without `drop` or tracking parameters. */
export function cacheKeyParams(params: URLSearchParams, drop: readonly string[] = []): string {
  return new URLSearchParams(
    [...params.entries()]
      .filter(([k]) => !drop.includes(k) && !TRACKING_PARAM.test(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString()
}
