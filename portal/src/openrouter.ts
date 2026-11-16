// The only place the Worker builds an OpenRouter model. Every request it sends
// carries two provider routing fields, whatever the operator configured:
//   data_collection: "deny"  no provider that collects prompts (the training exclusion)
//   zdr: true                only zero-data-retention endpoints (the retention exclusion)
// Field names and meaning: https://openrouter.ai/docs/features/provider-routing
// and https://openrouter.ai/docs/features/zdr (read 16 November 2026). The
// provider pin and allow_fallbacks come from RESEARCH_LOOP_PROVIDER as before;
// if no pinned provider satisfies both fields, OpenRouter refuses the request
// instead of routing it elsewhere, and Ask then fails closed with a retryable
// error: no other generation request is built (routingRefused in
// research-model.ts; test/research-route.test.mjs). test/openrouter-privacy.test.mjs reads the
// request bodies this module produces and fails if either field is missing,
// and fails if any other module imports the OpenRouter client.
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { researchModelId, researchProvider, researchReasoning, type ProviderPreferences } from './research-model'

export const OPENROUTER_PRIVACY = Object.freeze({ data_collection: 'deny', zdr: true } as const)

/** Configured provider preferences with the privacy fields set last, so no setting can turn them off. */
export function privateProvider(value: unknown): ProviderPreferences & typeof OPENROUTER_PRIVACY {
  return { ...(researchProvider(value) ?? {}), ...OPENROUTER_PRIVACY }
}

type OpenRouterEnv = { OPENROUTER_API_KEY?: string; RESEARCH_LOOP_MODEL_ID?: string; RESEARCH_LOOP_PROVIDER?: string; RESEARCH_LOOP_REASONING?: string }

/** The research model (loop, writer and claim repair share it), or undefined without a key. */
export function openRouterModel(env: OpenRouterEnv) {
  if (!env.OPENROUTER_API_KEY) return undefined
  const reasoning = researchReasoning(env.RESEARCH_LOOP_REASONING)
  return createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })(researchModelId(env.RESEARCH_LOOP_MODEL_ID), {
    usage: { include: true },
    provider: privateProvider(env.RESEARCH_LOOP_PROVIDER),
    ...(reasoning ? { extraBody: { reasoning } } : {}),
  })
}
