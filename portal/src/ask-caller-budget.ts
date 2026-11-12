/** A caller's remaining time for one /api/ask run (voice's ask_opax sends it).
 *
 * Without the header Ask keeps its own allowances: 60 s for the research loop, then a fresh 90 s for the routed
 * fallback. With it, both fit inside the caller's time, and when too little is left for the fallback to write an
 * answer, Ask returns the records research gathered instead of starting one it cannot finish. The header can only
 * shorten Ask's own allowance, never extend it. */
import type { ResearchPayload } from './research-types'

export const ASK_BUDGET_HEADER = 'x-opax-ask-budget-ms'
/** Ask's longest path today: the 60 s loop plus the 90 s routed fallback. */
export const ASK_BUDGET_MAX_MS = 150_000
/** Below this, the routed fallback (a retrieval and a written answer) is not started. */
export const ASK_FALLBACK_FLOOR_MS = 12_000

export function callerBudgetMs(value: string | null | undefined): number | undefined {
  if (value == null || !/^\d{1,9}$/.test(value.trim())) return undefined
  return Math.min(ASK_BUDGET_MAX_MS, Math.max(1_000, Number(value.trim())))
}

/** The fallback's allowance: its usual 90 s, cut to what the caller has left. */
export function fallbackAllowanceMs(callerEnd: number | undefined, now = Date.now(), usual = 90_000): number {
  return callerEnd === undefined ? usual : Math.max(0, Math.min(usual, callerEnd - now))
}

/** Research's sources as Ask source rows, without an answer: what was found when there was no time left to write. */
export function gatheredPayload(research: ResearchPayload | undefined): Record<string, unknown> | null {
  const found = (research?.sources ?? []).filter(s => s && typeof s.url === 'string' && typeof s.title === 'string')
  if (!found.length) return null
  return {
    answered: false, reason: 'partial', partial: true, answer: '', citations: {}, followups: [],
    sources: found.slice(0, 12).map((s, i) => ({ resource: `research-${i + 1}`, slug: '', kind: s.kind, title: s.title, href: s.url, url: s.url, snippet: '', cited: false, ...(s.date ? { date: s.date } : {}), ...(s.speaker ? { speaker: s.speaker } : {}) })),
    research,
  }
}
