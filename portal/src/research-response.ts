import type { ResearchPayload } from './research-types'
import type { researchEvalUsage } from './research-eval'

function plannerPayload(payload: Record<string, unknown>, previous?: ResearchPayload): Record<string, unknown> {
  if (payload.research) return payload
  const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
  const research: ResearchPayload = { mode: 'planner', rounds: previous?.rounds ?? 0, trail: previous?.trail ?? [], sources: sources.filter(s => s.cited === true).map(s => ({
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
