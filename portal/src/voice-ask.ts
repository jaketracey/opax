/** ask_opax asks the way this environment serves its own /api/ask.
 *
 * Production answers /api/ask in this Worker (apiAskRouted), and the voice tool passes its deadline as an argument.
 * Staging has no knowledge-base credentials, research settings or rate limits of its own: its /api/ask forwards the
 * reader's request to the production Worker through the STAGING_API service binding, so voice on staging forwards the
 * same request the same way. That hop states the voice tool's remaining time in a header, which production honours
 * only with ASK_INTERNAL_SECRET (ask-caller-budget.ts); without the secret, production runs Ask's usual allowances and
 * the voice tool's own wait still bounds the call. */
import { ASK_BUDGET_HEADER, ASK_INTERNAL_HEADER, askCaller, type AskCaller } from './ask-caller-budget'
import type { VoiceAsk } from './voice-tools'

type AskEnv = { COMMUNITY_ORIGIN: string; ASK_INTERNAL_SECRET?: string; STAGING_API?: { fetch(request: Request): Promise<Response> } }

/** The JSON (not streamed) /api/ask request; Ask's per-key quota is counted per voice session. */
export function voiceAskRequest(origin: string, input: { question: string }, sessionId: string, signal: AbortSignal, extra: Record<string, string> = {}): Request {
  return new Request(new URL('/api/ask', origin), {
    method: 'POST', signal, body: JSON.stringify(input),
    headers: { 'content-type': 'application/json', accept: 'application/json', 'cf-connecting-ip': 'voice-ask:' + sessionId, ...extra },
  })
}

export function voiceAsk(env: AskEnv, local: (request: Request, caller: AskCaller) => Promise<Response>): VoiceAsk {
  return (input, sessionId, signal, budgetMs) => {
    const ms = Math.max(1_000, Math.floor(budgetMs))
    if (!env.STAGING_API) return local(voiceAskRequest(env.COMMUNITY_ORIGIN, input, sessionId, signal), askCaller(ms))
    const secret = env.ASK_INTERNAL_SECRET && env.ASK_INTERNAL_SECRET.length >= 32 ? env.ASK_INTERNAL_SECRET : undefined
    return env.STAGING_API.fetch(voiceAskRequest(env.COMMUNITY_ORIGIN, input, sessionId, signal, secret ? { [ASK_BUDGET_HEADER]: String(ms), [ASK_INTERNAL_HEADER]: secret } : {}))
  }
}
