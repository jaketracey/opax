import type { ResearchPayload } from './research-types'
import type { researchEvalUsage } from './research-eval'

function plannerPayload(payload: Record<string, unknown>, previous?: ResearchPayload): Record<string, unknown> {
  if (payload.research) return payload
  const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
  const research: ResearchPayload = { ...previous, mode: 'planner', rounds: previous?.rounds ?? 0, trail: previous?.trail ?? [], sources: sources.filter(s => s.cited === true).map(s => ({
    title: String(s.title ?? ''), url: String(s.href ?? s.url ?? ''), kind: String(s.kind ?? 'record'), ...(typeof s.date === 'string' ? { date: s.date } : {}), ...(typeof s.speaker === 'string' ? { speaker: s.speaker } : {}),
  })) }
  return { ...payload, research }
}

/** Add metadata only at the boundary. Existing JSON and SSE fields survive. */
export async function withPlannerResearch(response: Response, previous?: ResearchPayload): Promise<Response> {
  return mapResearchResponse(response, payload => plannerPayload(payload, previous))
}

export async function withResearchEval(response: Response, usage: () => ReturnType<typeof researchEvalUsage> & { model?: string }): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  headers.set('x-opax-cache', 'BYPASS')
  return mapResearchResponse(new Response(response.body, { status: response.status, statusText: response.statusText, headers }), payload => {
    const augmented = plannerPayload(payload)
    return { ...augmented, research: { ...augmented.research as ResearchPayload, ...usage() } }
  })
}

async function mapResearchResponse(response: Response, augment: (payload: Record<string, unknown>) => Record<string, unknown>): Promise<Response> {
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) return new Response(JSON.stringify(augment(await response.json() as Record<string, unknown>)), { status: response.status, statusText: response.statusText, headers })
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let pending = ''
  const frame = (value: string) => {
    if (!/^event: done$/m.test(value)) return value
    return value.replace(/^data: (.+)$/m, (_line, data: string) => 'data: ' + JSON.stringify(augment(JSON.parse(data))))
  }
  return new Response(response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        controller.enqueue(encoder.encode(frame(pending.slice(0, boundary.index)) + boundary[0]))
        pending = pending.slice(boundary.index + boundary[0].length)
      }
    },
    flush(controller) { pending += decoder.decode(); if (pending) controller.enqueue(encoder.encode(frame(pending))) },
  })), { status: response.status, statusText: response.statusText, headers })
}

/** A failed loop may use ordinary RAG, but it may not substitute undated/current evidence for a dated ask. */
export async function withFallbackPeriod(response: Response, period: import('./agentic-ask').Period): Promise<Response> {
  if (!response.ok || period.kind === 'all' || !period.since && !period.until) return response
  return mapResearchResponse(response, payload => {
    // The deterministic calculators already apply the requested window to their original records.
    const coverage = payload.coverage as { matched?: boolean } | undefined
    if (coverage?.matched === true || payload.money_ranking && payload.answer_status === 'calculated') return payload
    const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
    const cited = sources.filter(s => s.cited === true)
    const outside = cited.find(s => typeof s.date === 'string' && (period.since && s.date.slice(0, 10) < period.since || period.until && s.date.slice(0, 10) > period.until))
    if (!outside && cited.length && cited.every(s => typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.date))) return payload
    const requested = `${period.since ?? 'the start of the record'} to ${period.until ?? 'the present'}`
    const text = `The returned records do not establish the requested answer for ${requested}. ${outside ? `A returned source is dated ${String(outside.date).slice(0, 10)}, outside that period.` : 'The returned evidence has no verified date coverage for that period.'} I have not substituted current figures. Please narrow the question or check the records linked here.`
    const url = String(outside?.href ?? outside?.url ?? cited[0]?.href ?? cited[0]?.url ?? 'https://opax.com.au/methods')
    return { ...payload, answer: text, answer_status: 'coverage_only', citations: { 'period-coverage/t/body/0': [[0, Array.from(text).length]] },
      sources: [{ resource: 'period-coverage', slug: '', title: 'Coverage of the returned records', href: url, url, kind: 'record', snippet: text, cited: true }],
      coverage: { requested_since: period.since ?? null, requested_until: period.until ?? null, as_of: outside?.date ?? null, matched: false },
    }
  })
}
