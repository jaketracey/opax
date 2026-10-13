export const RESEARCH_CREDIT_COOLDOWN_MS = 15 * 60_000
export interface ResearchCreditCooldown { blocked: () => boolean; exhaust: () => void }
export function createResearchCreditCooldown(now: () => number = Date.now): ResearchCreditCooldown {
  let until = 0
  return { blocked: () => now() < until, exhaust: () => { until = now() + RESEARCH_CREDIT_COOLDOWN_MS } }
}
// Aggregate provider circuit breaker only; no request, key or user data.
export const researchCreditCooldown = createResearchCreditCooldown(() => Date.now())
const creditMessage = /insufficient[\s_-]+(?:credits?|balance|funds)|(?:credit|spending)[\s_-]+limit|(?:credits?|balance).{0,30}(?:exhausted|depleted|too low|insufficient)|out of credits|not enough credits|requires more credits|no credits|negative balance|payment required/i

/** SDK errors can wrap a provider response or a retry error's cause/errors. */
export function isResearchCreditError(error: unknown, depth = 0): boolean {
  if (depth > 5 || !error) return false
  if (typeof error === 'string') return creditMessage.test(error)
  if (typeof error !== 'object') return false
  const value = error as { statusCode?: number; status?: number; code?: number; message?: unknown; responseBody?: unknown; cause?: unknown; errors?: unknown[]; data?: unknown; error?: unknown }
  if (value.statusCode === 402 || value.status === 402 || value.code === 402) return true
  if ([value.message, value.responseBody].some(text => typeof text === 'string' && creditMessage.test(text))) return true
  if (typeof value.responseBody === 'string') {
    try { if (isResearchCreditError(JSON.parse(value.responseBody), depth + 1)) return true } catch { /* not JSON */ }
  }
  return isResearchCreditError(value.cause, depth + 1) || isResearchCreditError(value.error, depth + 1) || isResearchCreditError(value.data, depth + 1) ||
    (Array.isArray(value.errors) && value.errors.some(inner => isResearchCreditError(inner, depth + 1)))
}
