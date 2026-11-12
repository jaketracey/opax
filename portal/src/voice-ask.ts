/** ask_opax asks the way this environment serves its own /api/ask.
 *
 * Production answers /api/ask in this Worker (apiAskRouted). Staging has no knowledge-base credentials, research
 * settings or rate limits of its own: its /api/ask forwards the reader's request to the production Worker through the
 * STAGING_API service binding, so voice on staging forwards the same request the same way. */
import { ASK_BUDGET_HEADER } from './ask-caller-budget'
import type { VoiceAsk } from './voice-tools'

type AskEnv = { COMMUNITY_ORIGIN: string; STAGING_API?: { fetch(request: Request): Promise<Response> } }

/** The JSON (not streamed) /api/ask request; Ask's per-key quota is counted per voice session. */
export function voiceAskRequest(origin: string, input: { question: string }, sessionId: string, signal: AbortSignal, budgetMs: number): Request {
  return new Request(new URL('/api/ask', origin), {
    method: 'POST', signal, body: JSON.stringify(input),
    headers: { 'content-type': 'application/json', accept: 'application/json', 'cf-connecting-ip': 'voice-ask:' + sessionId, [ASK_BUDGET_HEADER]: String(Math.max(1_000, Math.floor(budgetMs))) },
  })
}

export function voiceAsk(env: AskEnv, local: (request: Request) => Promise<Response>): VoiceAsk {
  return (input, sessionId, signal, budgetMs) => {
    const request = voiceAskRequest(env.COMMUNITY_ORIGIN, input, sessionId, signal, budgetMs)
    return env.STAGING_API ? env.STAGING_API.fetch(request) : local(request)
  }
}
