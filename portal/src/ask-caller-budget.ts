/** A caller's remaining time for one /api/ask run (voice's ask_opax).
 *
 * Without a caller Ask keeps its own allowances: 60 s for the research loop, then a fresh 90 s for the routed
 * fallback. With one, both fit inside the caller's deadline, and when too little is left for the fallback to write an
 * answer, Ask returns the records research gathered instead of starting one it cannot finish. A caller can only
 * shorten Ask's allowance, and a shortened run is never stored in the shared answer cache.
 *
 * Only internal callers are honoured. In production the voice tool calls Ask in-process and passes its deadline as an
 * argument. Staging forwards to the production Worker through STAGING_API, and that hop carries the budget header
 * with ASK_INTERNAL_SECRET (the same value installed in both environments). A public request's budget header is
 * ignored: Cloudflare does not document that client-supplied cf-* headers are replaced, so no header a reader can
 * send is trusted. */
import type { ResearchPayload } from './research-types'

export const ASK_BUDGET_HEADER = 'x-opax-ask-budget-ms'
/** Carries ASK_INTERNAL_SECRET on the staging-to-production hop; without a match the budget header is ignored. */
export const ASK_INTERNAL_HEADER = 'x-opax-ask-internal'
/** When the caller's time runs out (an absolute Date.now() time) and how long it was given. */
export interface AskCaller { deadline: number; ms: number }
/** Ask's longest path today: the 60 s loop plus the 90 s routed fallback. */
export const ASK_BUDGET_MAX_MS = 150_000
/** Below this, the routed fallback (a retrieval and a written answer) is not started. */
export const ASK_FALLBACK_FLOOR_MS = 12_000

export function callerBudgetMs(value: string | null | undefined): number | undefined {
  if (value == null || !/^\d{1,9}$/.test(value.trim())) return undefined
  return Math.min(ASK_BUDGET_MAX_MS, Math.max(1_000, Number(value.trim())))
}

export const askCaller = (ms: number, now = Date.now()): AskCaller => ({ deadline: now + ms, ms })
/** Below Ask's own longest allowance: the answer may be thinner than a full run's, so it is not shared. */
export const shortenedCaller = (caller: AskCaller | undefined): boolean => caller !== undefined && caller.ms < ASK_BUDGET_MAX_MS

/** The budget header, honoured only with the internal secret; counted from when the request arrived. */
export async function trustedCaller(request: Request, secret: string | undefined, arrived = Date.now()): Promise<AskCaller | undefined> {
  const ms = callerBudgetMs(request.headers.get(ASK_BUDGET_HEADER))
  const presented = request.headers.get(ASK_INTERNAL_HEADER)
  if (ms === undefined || !presented || !secret || secret.length < 32) return undefined
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(presented)), crypto.subtle.digest('SHA-256', encoder.encode(secret))])
  return crypto.subtle.timingSafeEqual(new Uint8Array(a), new Uint8Array(b)) ? askCaller(ms, arrived) : undefined
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
