export type SearchMode = 'hybrid' | 'semantic' | 'keyword'
export interface SearchRetrieval {
  mode_used: SearchMode
  fallback?: `${'hybrid' | 'semantic'}_${'timeout' | 'error'}`
}

// Retrieval normally takes 4-6 s (docs/STREAMING.md). Hedge at 5 s without
// cutting off a healthy slower hybrid: all /find fetches and JSON reads share
// a 10 s cap. Rate limiting, cache/people/attribution lookups before retrieval,
// joinMixedSpeakers and paging afterwards, and client transport are outside it.
export const SEARCH_RETRIEVAL_MS = 10_000
export const KEYWORD_HEDGE_MS = 5_000
export const KEYWORD_SEARCH_MS = 6_000

/** Prefer hybrid/semantic through the cap while preparing a keyword answer. */
export async function searchFind<T>(
  // hedge is true for the keyword retry, so a caller counting queries can tell it from the main one.
  read: (body: Record<string, unknown>, signal: AbortSignal, hedge: boolean) => Promise<Response>,
  body: Record<string, unknown>,
  requestedMode: string,
  parent?: AbortSignal,
): Promise<({ found: T } & SearchRetrieval) | null> {
  parent?.throwIfAborted()
  const mode: SearchMode = requestedMode === 'keyword' || String(body.query).trim() === '*'
    ? 'keyword' : requestedMode === 'semantic' ? 'semantic' : 'hybrid'
  const started = Date.now()
  const budget = new AbortController()
  const budgetTimer = setTimeout(() => budget.abort(), mode === 'keyword' ? KEYWORD_SEARCH_MS : SEARCH_RETRIEVAL_MS)
  const attempt = async (used: SearchMode, fallback = false): Promise<{ found: T } | { failure: 'timeout' | 'error' }> => {
    parent?.throwIfAborted()
    if (budget.signal.aborted) return { failure: 'timeout' }
    const controller = new AbortController()
    const signal = AbortSignal.any([budget.signal, controller.signal, ...(parent ? [parent] : [])])
    const timer = setTimeout(() => controller.abort(), used === 'keyword' ? KEYWORD_SEARCH_MS : SEARCH_RETRIEVAL_MS)
    let onAbort: () => void = () => {}
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const found = await Promise.race([aborted, (async () => {
        const response = await read({
          ...body,
          features: used === 'hybrid' ? ['keyword', 'semantic'] : [used],
          // Keyword recovery must also survive an unavailable reranker.
          ...(fallback && used === 'keyword' ? { reranker: 'noop' } : {}),
        }, signal, fallback)
        if (!response.ok) throw new Error('Search upstream unavailable')
        const data = await response.json()
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid search response')
        return data as T
      })()])
      return { found }
    } catch {
      // A caller's shorter budget or disconnect must never start another call.
      parent?.throwIfAborted()
      return { failure: controller.signal.aborted || budget.signal.aborted ? 'timeout' : 'error' }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      controller.abort()
    }
  }

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined
  let keyword: ReturnType<typeof attempt> | undefined
  const startKeyword = () => {
    if (!keyword) {
      keyword = attempt('keyword', true)
      // Observe cancellation even while we are still waiting for the primary.
      void keyword.catch(() => {})
    }
    return keyword
  }
  try {
    const primary = attempt(mode)
    if (mode === 'keyword') {
      const result = await primary
      return 'found' in result ? { found: result.found, mode_used: mode } : null
    }
    const hedge = new Promise<'hedge'>(resolve => { hedgeTimer = setTimeout(() => resolve('hedge'), KEYWORD_HEDGE_MS) })
    const first = await Promise.race([primary, hedge])
    if (first === 'hedge') startKeyword()
    const preferred = first === 'hedge' ? await primary : first
    if ('found' in preferred) return { found: preferred.found, mode_used: mode }
    const recovery = await startKeyword()
    if (!('found' in recovery)) return null
    const fallback = `${mode}_${preferred.failure}` as const
    console.info(JSON.stringify({ event: 'search_fallback', requested_mode: mode, mode_used: 'keyword', reason: fallback, elapsed_ms: Math.max(0, Date.now() - started) }))
    return { found: recovery.found, mode_used: 'keyword', fallback }
  } finally {
    if (hedgeTimer !== undefined) clearTimeout(hedgeTimer)
    clearTimeout(budgetTimer)
    budget.abort()
  }
}
