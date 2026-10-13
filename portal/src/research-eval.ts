import type { ResearchStats } from './research-types'

export interface ResearchEvalState {
  started: number
  loop: { tokens: { input: number; output: number } | null; cost: number | null; cachedByTurn?: number[]; turns?: ResearchStats['turns'] }
  legacy: { calls: number; measured: number; tokens: { input: number; output: number }; cost: number }
}
export function researchEvalState(): ResearchEvalState {
  return { started: Date.now(), loop: { tokens: { input: 0, output: 0 }, cost: 0 }, legacy: { calls: 0, measured: 0, tokens: { input: 0, output: 0 }, cost: 0 } }
}
export function captureLoopUsage(state: ResearchEvalState, stats: ResearchStats): void {
  state.loop = { tokens: stats.usageUnknown ? null : { ...stats.tokens }, cost: stats.usageUnknown ? null : stats.costUsd ?? (stats.tokens.input + stats.tokens.output ? null : 0), cachedByTurn: stats.cachedByTurn ? [...stats.cachedByTurn] : undefined, turns: stats.turns ? stats.turns.map(t => ({ ...t })) : undefined }
}
export function researchEvalUsage(state: ResearchEvalState) {
  const tokens = state.loop.tokens, known = tokens !== null && state.legacy.calls === state.legacy.measured
  return { ms: Math.max(0, Date.now() - state.started),
    tokens: known ? { input: tokens.input + state.legacy.tokens.input, output: tokens.output + state.legacy.tokens.output } : null,
    cost_usd: known && state.loop.cost !== null ? state.loop.cost + state.legacy.cost : null,
    ...(state.loop.cachedByTurn ? { cached_input_by_turn: state.loop.cachedByTurn } : {}),
    ...(state.loop.turns ? { turns: state.loop.turns } : {}) }
}
export function researchPrices(input?: string, output?: string) {
  const price = (value: string | undefined, fallback: number) => value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback
  return { input: price(input, 1), output: price(output, 3) }
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Observe consumption without cloning, buffering an unbounded body, or
 * changing response bytes. The state belongs only to the authenticated eval. */
export function observeEvalModelResponse(response: Response, state: ResearchEvalState, prices: { input: number; output: number }, stream = false): Response {
  state.legacy.calls++
  if (!response.ok) { if (response.status === 402 || response.status === 429) state.legacy.measured++; return response }
  if (!response.body) return response
  let previous: { input: number; output: number; cost: number } | undefined
  const consume = (value: unknown) => {
    const raw = object(value), item = object(raw.item)
    const candidates = [object(raw.metadata), object(item.metadata), item.type === 'metadata' || item.type === 'consumption' ? item : {}, item.type === 'consumption' ? object(item.consumption) : {}]
    for (const candidate of candidates) {
      const tokens = object(candidate.tokens), input = tokens.input, output = tokens.output
      if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || typeof output !== 'number' || !Number.isSafeInteger(output) || output < 0) continue
      if (!previous) state.legacy.measured++
      const reported = candidate.cost_usd
      const cost = typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 ? reported : (input * prices.input + output * prices.output) / 1e6
      state.legacy.tokens.input += input - (previous?.input ?? 0); state.legacy.tokens.output += output - (previous?.output ?? 0)
      state.legacy.cost += cost - (previous?.cost ?? 0); previous = { input, output, cost }
    }
  }
  const decoder = new TextDecoder(), limit = 1_000_000
  const ndjson = stream || (response.headers.get('content-type') ?? '').includes('ndjson')
  let pending = '', discard = false
  const line = (value: string) => { try { consume(JSON.parse(value)) } catch { /* preserve provider bytes regardless */ } }
  return new Response(response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      const text = decoder.decode(chunk, { stream: true })
      if (!ndjson) { if (!discard && pending.length + text.length <= limit) pending += text; else { pending = ''; discard = true }; return }
      for (const piece of text.split('\n').entries()) {
        const [index, part] = piece
        if (index) { if (!discard && pending.trim()) line(pending); pending = ''; discard = false }
        if (!discard && pending.length + part.length <= limit) pending += part
        else { pending = ''; discard = true }
      }
    },
    flush() { pending += decoder.decode(); if (!discard && pending.trim()) line(pending) },
  })), response)
}
