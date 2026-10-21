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

async function mapResearchResponse(response: Response, augment: (payload: Record<string, unknown>) => Record<string, unknown>, validateBeforeText = false): Promise<Response> {
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) return new Response(JSON.stringify(augment(await response.json() as Record<string, unknown>)), { status: response.status, statusText: response.statusText, headers })
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let pending = ''
  const frame = (value: string) => {
    // Fallback and cache replay deltas have not passed the period check yet.
    // The validated done payload is the only answer text released on this path.
    if (validateBeforeText && /^event: delta$/m.test(value)) return ''
    if (!/^event: done$/m.test(value)) return value
    return value.replace(/^data: (.+)$/m, (_line, data: string) => 'data: ' + JSON.stringify(augment(JSON.parse(data))))
  }
  return new Response(response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const next = frame(pending.slice(0, boundary.index))
        if (next) controller.enqueue(encoder.encode(next + boundary[0]))
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
    const coverage = payload.coverage as { matched?: boolean; since?: string; until?: string; requested_since?: string; requested_until?: string } | undefined
    const within = (since?: string, until?: string) => !!(since || until) &&
      (!period.since || !!since && since >= period.since) && (!period.until || !!until && until <= period.until) &&
      (!period.until || !since || since <= period.until) && (!period.since || !until || until >= period.since)
    if (coverage?.matched === true && within(coverage.requested_since ?? coverage.since, coverage.requested_until ?? coverage.until) && within(coverage.since, coverage.until)) return payload
    if (payload.pay_answer && coverage?.matched === false && within(coverage.requested_since, coverage.requested_until) && !/\$[\d,]+/.test(String(payload.answer))) return payload
    const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
    const cited = sources.filter(s => s.cited === true)
    const outside = cited.find(s => typeof s.date === 'string' && (period.since && s.date.slice(0, 10) < period.since || period.until && s.date.slice(0, 10) > period.until))
    if (!coverage && !outside && cited.length && cited.every(s => typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.date))) return payload
    const requested = `${period.since ?? 'the start of the record'} to ${period.until ?? 'the present'}`
    const text = `The returned records do not establish the requested answer for ${requested}. ${outside ? `A returned source is dated ${String(outside.date).slice(0, 10)}, outside that period.` : 'The returned evidence has no verified date coverage for that period.'} I have not substituted current figures. Please narrow the question or check the records linked here.`
    const url = String(outside?.href ?? outside?.url ?? cited[0]?.href ?? cited[0]?.url ?? 'https://opax.com.au/methods')
    // Do not retain calculated tables, openings or snippets from another period.
    return { answer: text, answer_status: 'coverage_only', citations: { 'period-coverage/t/body/0': [[0, Array.from(text).length]] },
      sources: [{ resource: 'period-coverage', slug: '', title: 'Coverage of the returned records', href: url, url, kind: 'record', snippet: text, cited: true }],
      coverage: { requested_since: period.since ?? null, requested_until: period.until ?? null, as_of: outside?.date ?? null, matched: false },
    }
  }, true)
}
