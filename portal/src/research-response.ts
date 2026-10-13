import type { ResearchPayload } from './research-types'

function plannerPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.research) return payload
  const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
  const research: ResearchPayload = { mode: 'planner', rounds: 0, trail: [], sources: sources.filter(s => s.cited === true).map(s => ({
    title: String(s.title ?? ''), url: String(s.href ?? s.url ?? ''), kind: String(s.kind ?? 'record'), ...(typeof s.date === 'string' ? { date: s.date } : {}),
  })) }
  return { ...payload, research }
}

/** Add metadata only at the boundary. Existing JSON and SSE fields survive. */
export async function withPlannerResearch(response: Response): Promise<Response> {
  if (!response.ok) return response
  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) return new Response(JSON.stringify(plannerPayload(await response.json() as Record<string, unknown>)), response)
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let pending = ''
  const frame = (value: string) => {
    if (!/^event: done$/m.test(value)) return value
    return value.replace(/^data: (.+)$/m, (_line, data: string) => 'data: ' + JSON.stringify(plannerPayload(JSON.parse(data))))
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
  })), response)
}
