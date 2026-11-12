export type SearchMode = 'hybrid' | 'semantic' | 'keyword'
export interface SearchRetrieval {
  mode_used: SearchMode
  fallback?: `${SearchMode}_${'timeout' | 'error'}`
}

// The reviewed normal hybrid request took 3.58 s. Allow about 1.7 times that
// before falling back, with 4 s for keyword retrieval: at most 10 s of upstream
// waiting, leaving 5 s for transport and local work under the app's 15 s limit.
export const SEMANTIC_SEARCH_MS = 6_000
export const KEYWORD_SEARCH_MS = 4_000

/** Bound fetch and JSON reads; a failed hybrid can recover through either mode. */
export async function searchFind<T>(
  read: (body: Record<string, unknown>, signal: AbortSignal) => Promise<Response>,
  body: Record<string, unknown>,
  requestedMode: string,
  parent?: AbortSignal,
): Promise<({ found: T } & SearchRetrieval) | null> {
  const mode: SearchMode = requestedMode === 'keyword' || requestedMode === 'semantic' ? requestedMode : 'hybrid'
  const budget = new AbortController()
  const budgetTimer = setTimeout(() => budget.abort(), SEMANTIC_SEARCH_MS + KEYWORD_SEARCH_MS)
  const attempt = async (used: SearchMode, fallback = false): Promise<{ found: T } | { failure: 'timeout' | 'error' }> => {
    parent?.throwIfAborted()
    if (budget.signal.aborted) return { failure: 'timeout' }
    const controller = new AbortController()
    const signal = AbortSignal.any([budget.signal, controller.signal, ...(parent ? [parent] : [])])
    const timer = setTimeout(() => controller.abort(), used === 'keyword' ? KEYWORD_SEARCH_MS : SEMANTIC_SEARCH_MS)
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
        }, signal)
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

  try {
    const primary = await attempt(mode)
    if ('found' in primary) return { found: primary.found, mode_used: mode }
    const alternatives: SearchMode[] = mode === 'hybrid' ? ['keyword', 'semantic'] : mode === 'keyword' ? ['semantic'] : ['keyword']
    for (const other of alternatives) {
      const recovery = await attempt(other, true)
      if ('found' in recovery) return { found: recovery.found, mode_used: other, fallback: `${mode}_${primary.failure}` }
    }
    return null
  } finally {
    clearTimeout(budgetTimer)
    budget.abort()
  }
}
