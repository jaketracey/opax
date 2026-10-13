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

export type ReasoningPreferences = { enabled?: boolean; effort?: string; exclude?: boolean; max_tokens?: number }
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high'])

/** OpenRouter `reasoning` request field as JSON, e.g. {"enabled":false}; known keys only. */
export function researchReasoning(value: unknown): ReasoningPreferences | undefined {
  let raw: unknown = value
  if (typeof value === 'string') { if (!value.trim()) return undefined; try { raw = JSON.parse(value) } catch { return undefined } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>, out: ReasoningPreferences = {}
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled
  if (typeof r.exclude === 'boolean') out.exclude = r.exclude
  if (typeof r.effort === 'string' && EFFORTS.has(r.effort)) out.effort = r.effort
  if (Number.isInteger(r.max_tokens) && (r.max_tokens as number) > 0 && (r.max_tokens as number) <= 32_000) out.max_tokens = r.max_tokens as number
  return Object.keys(out).length ? out : undefined
}

/** RESEARCH_LOOP_MODEL_ALLOW: a JSON map {slug: {provider?, reasoning?}} or a comma list of slugs. */
export function researchModelAllow(value: unknown): Map<string, { provider?: ProviderPreferences; reasoning?: ReasoningPreferences }> {
  const out = new Map<string, { provider?: ProviderPreferences; reasoning?: ReasoningPreferences }>()
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return out
  if (text.startsWith('{')) {
    let map: unknown
    try { map = JSON.parse(text) } catch { return out }
    if (!map || typeof map !== 'object' || Array.isArray(map)) return out
    for (const [slug, cfg] of Object.entries(map as Record<string, unknown>)) {
      if (!SLUG.test(slug)) continue
      const c = cfg && typeof cfg === 'object' ? cfg as Record<string, unknown> : {}
      out.set(slug, { provider: researchProvider(JSON.stringify(c.provider ?? null)), reasoning: researchReasoning(c.reasoning) })
    }
    return out
  }
  for (const slug of text.split(',').map(s => s.trim())) if (SLUG.test(slug)) out.set(slug, {})
  return out
}

type ModelEnv = { RESEARCH_LOOP_MODEL_ID?: string; RESEARCH_LOOP_PROVIDER?: string; RESEARCH_LOOP_REASONING?: string }
/** Operator eval override: an allowlisted model with its routing and reasoning settings, or a sort; else nothing. */
export function researchModelOverride(model: string | null, sort: string | null, allow: unknown): ModelEnv {
  const out: ModelEnv = {}
  const slug = model?.trim() ?? ''
  const entry = slug ? researchModelAllow(allow).get(slug) : undefined
  if (entry) {
    out.RESEARCH_LOOP_MODEL_ID = slug
    if (entry.provider) out.RESEARCH_LOOP_PROVIDER = JSON.stringify(entry.provider)
    if (entry.reasoning) out.RESEARCH_LOOP_REASONING = JSON.stringify(entry.reasoning)
  }
  if (sort && SORTS.has(sort.trim())) out.RESEARCH_LOOP_PROVIDER = JSON.stringify({ ...(entry?.provider ?? {}), sort: sort.trim() })
  return out
}

/** Part of the loop cache version: answers from different models never share a cache entry. */
export function researchModelKey(model: unknown, provider: unknown, reasoning?: unknown): string {
  const p = researchProvider(provider), r = researchReasoning(reasoning)
  return researchModelId(model) + (p ? '+' + JSON.stringify(p) : '') + (r ? '~' + JSON.stringify(r) : '')
}
