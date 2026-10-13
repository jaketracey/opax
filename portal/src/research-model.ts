// Which OpenRouter model the research loop calls, and how OpenRouter routes it.
// RESEARCH_LOOP_MODEL_ID takes a preset (`@preset/opax-pro`, which pins DeepSeek's
// own provider) or any model slug. RESEARCH_LOOP_PROVIDER takes OpenRouter
// provider preferences as JSON, e.g. {"sort":"throughput"} or
// {"order":["fireworks","together"],"allow_fallbacks":true}. Operator-authorised
// eval requests may pick another model from RESEARCH_LOOP_MODEL_ALLOW per request.

export const DEFAULT_RESEARCH_MODEL = '@preset/opax-pro'
const SORTS = new Set(['throughput', 'latency', 'price'])
const SLUG = /^(@preset\/[a-z0-9._-]+|[a-z0-9._-]+\/[a-z0-9._:-]+)$/i

export type ProviderPreferences = {
  sort?: 'throughput' | 'latency' | 'price'
  order?: string[]; only?: string[]; ignore?: string[]
  allow_fallbacks?: boolean; require_parameters?: boolean
}

export function researchModelId(value: unknown): string {
  const slug = typeof value === 'string' ? value.trim() : ''
  return SLUG.test(slug) ? slug : DEFAULT_RESEARCH_MODEL
}

/** Parses provider preferences, keeping only known keys with valid values; anything else is dropped. */
export function researchProvider(value: unknown): ProviderPreferences | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  let raw: unknown
  try { raw = JSON.parse(value) } catch { return undefined }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>, out: ProviderPreferences = {}
  if (typeof r.sort === 'string' && SORTS.has(r.sort)) out.sort = r.sort as ProviderPreferences['sort']
  for (const key of ['order', 'only', 'ignore'] as const) {
    const list = r[key]
    if (Array.isArray(list) && list.length && list.length <= 8 && list.every(p => typeof p === 'string' && /^[a-z0-9._-]{1,40}$/i.test(p))) out[key] = list as string[]
  }
  for (const key of ['allow_fallbacks', 'require_parameters'] as const) if (typeof r[key] === 'boolean') out[key] = r[key] as boolean
  return Object.keys(out).length ? out : undefined
}

/** Operator eval override: a model from the allowlist and an optional sort, else nothing. */
export function researchModelOverride(model: string | null, sort: string | null, allow: unknown): { RESEARCH_LOOP_MODEL_ID?: string; RESEARCH_LOOP_PROVIDER?: string } {
  const allowed = new Set(String(allow ?? '').split(',').map(s => s.trim()).filter(Boolean))
  const out: { RESEARCH_LOOP_MODEL_ID?: string; RESEARCH_LOOP_PROVIDER?: string } = {}
  const slug = model?.trim() ?? ''
  if (slug && allowed.has(slug) && SLUG.test(slug)) out.RESEARCH_LOOP_MODEL_ID = slug
  if (sort && SORTS.has(sort.trim())) out.RESEARCH_LOOP_PROVIDER = JSON.stringify({ sort: sort.trim() })
  return out
}

/** Part of the loop cache version: answers from different models never share a cache entry. */
export function researchModelKey(model: unknown, provider: unknown): string {
  const p = researchProvider(provider)
  return researchModelId(model) + (p ? '+' + JSON.stringify(p) : '')
}
