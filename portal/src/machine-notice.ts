/** The error notice on every machine-written answer (public/machine-notice.js holds the two fixed wordings).
 * The Worker sets it as one additive string field, `machine_notice`, and every client prints that string under
 * the answer and above its sources. A payload no model wrote any part of carries no such field. */
import { MACHINE_NOTICE, MACHINE_NOTICE_TRANSCRIPT, machineNotice, modelWritten } from '../public/machine-notice.js'
import { transcriptNote } from '../public/transcript-note.js'
export { MACHINE_NOTICE, MACHINE_NOTICE_TRANSCRIPT, machineNotice, modelWritten }

/** The payload with its notice. The transcript wording goes by the test the evidence line uses: a cited source
 * row that is a hearing transcript. The answer itself is never read or changed. */
export function withMachineNotice<T>(payload: T): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const notice = machineNotice(payload, transcriptNote((payload as { sources?: unknown }).sources) !== null)
  if (notice === null || (payload as { machine_notice?: unknown }).machine_notice === notice) return payload
  return { ...payload, machine_notice: notice }
}

type Row = Record<string, unknown>
const row = (payload: unknown): Row | null => payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Row : null
const noticed = <T>(payload: T, written: boolean): T => written && (payload as Row).machine_notice !== MACHINE_NOTICE ? { ...payload, machine_notice: MACHINE_NOTICE } : payload

/** A search overview ("Summarise these records", /api/search-summary): a model writes every point it holds. An
 * empty result set has no points and no notice. */
export function withSummaryNotice<T>(payload: T): T {
  const p = row(payload)
  return noticed(payload, !!p && p.status === 'ready' && Array.isArray(p.points) && p.points.length > 0)
}

/** A money map journey's written story (/api/journey-story): a model writes each step's title and body. */
export function withStoryNotice<T>(payload: T): T {
  const p = row(payload)
  return noticed(payload, !!p && p.generated === true && Array.isArray(p.steps) && p.steps.length > 0)
}

/** A JSON reply, or the `done` frame of a streamed one, with its payload passed through `map`. Every other frame
 * goes out as it arrives, and anything that cannot be read goes out as it came: nothing is blocked or emptied. */
export async function mapAnswerPayload(response: Response, map: (payload: unknown) => unknown): Promise<Response> {
  if (!response.ok || !response.body) return response
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    try {
      const payload: unknown = JSON.parse(await response.clone().text()), mapped = map(payload)
      if (mapped === payload) return response
      const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('etag')
      return new Response(JSON.stringify(mapped), { status: response.status, headers })
    } catch { return response }
  }
  if (!type.includes('text/event-stream')) return response
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let held = ''
  const frame = (value: string) => /^event: done\r?$/m.test(value) ? value.replace(/^data: (.+?)(\r?)$/m, (line, data: string, cr: string) => {
    try { const payload: unknown = JSON.parse(data), mapped = map(payload); return mapped === payload ? line : 'data: ' + JSON.stringify(mapped) + cr }
    catch { return line }
  }) : value
  const pass = (flush: boolean) => {
    let out = ''
    for (let m; (m = /\r?\n\r?\n/.exec(held));) { out += frame(held.slice(0, m.index)) + m[0]; held = held.slice(m.index + m[0].length) }
    if (flush) { out += frame(held); held = '' }
    return out
  }
  const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { held += decoder.decode(chunk, { stream: true }); const out = pass(false); if (out) controller.enqueue(encoder.encode(out)) },
    flush(controller) { held += decoder.decode(); const out = pass(true); if (out) controller.enqueue(encoder.encode(out)) },
  }))
  return new Response(stream, { status: response.status, headers: response.headers })
}

/** Every /api/ask reply carries the notice when a model wrote it: both engines, blocking and streamed, and an
 * answer cached before the field existed, which gains it as it is served. */
export function machineNoticeResponse(response: Response): Promise<Response> {
  return mapAnswerPayload(response, withMachineNotice)
}
