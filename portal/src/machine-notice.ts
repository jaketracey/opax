/** The error notice on every machine-written answer (public/machine-notice.js holds the two fixed wordings).
 * The Worker sets it as one additive string field, `machine_notice`, and every client prints that string under
 * the answer and above its sources. A payload no model wrote any part of carries no such field. */
import { MACHINE_NOTICE, MACHINE_NOTICE_STORED, MACHINE_NOTICE_TRANSCRIPT, MACHINE_SUMMARY_WORDS, MACHINE_SUMMARY_PREFIX, machineNotice, modelWritten } from '../public/machine-notice.js'
import { transcriptNote } from '../public/transcript-note.js'
export { MACHINE_NOTICE, MACHINE_NOTICE_STORED, MACHINE_NOTICE_TRANSCRIPT, MACHINE_SUMMARY_WORDS, MACHINE_SUMMARY_PREFIX, machineNotice, modelWritten }

type Row = Record<string, unknown>
const row = (payload: unknown): Row | null => payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Row : null
/** The payload carrying exactly this notice: added or corrected when there is one, and a notice left on a payload
 * no model wrote (a stale key from an older copy) taken off. Unchanged payloads come back as the same object. */
function carrying<T>(payload: T, notice: string | null): T {
  const p = row(payload)
  if (!p) return payload
  if (notice === null) {
    if (!('machine_notice' in p)) return payload
    const { machine_notice: _stale, ...rest } = p
    return rest as T
  }
  return p.machine_notice === notice ? payload : { ...payload, machine_notice: notice }
}

/** The payload with its notice. The transcript wording goes by the test the evidence line uses: a cited source
 * row that is a hearing transcript. The answer itself is never read or changed. */
export function withMachineNotice<T>(payload: T): T {
  const p = row(payload)
  return p ? carrying(payload, machineNotice(p, transcriptNote(p.sources) !== null)) : payload
}

/** An answer written for this request (a search overview, a journey story): the answers wording. */
const noticed = <T>(payload: T, written: boolean): T => row(payload) ? carrying(payload, written ? MACHINE_NOTICE : null) : payload
/** Stored text a model wrote earlier (a brief, a bill summary, a bill text overview): the summaries wording. */
const stored = <T>(payload: T, written: boolean): T => row(payload) ? carrying(payload, written ? MACHINE_NOTICE_STORED : null) : payload
const words = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''

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

/* Stored machine-written text: text a model wrote earlier, which OPAX keeps and shows under the Machine-written
 * label. The same line goes under it, in the default wording. None of it is a summary of a hearing transcript:
 * briefs are written for the speeches, releases and documents /api/resource serves, and bill summaries for bills. */

/** A record (/api/resource/<slug>): its brief, `summary`, is written by a model from the record's own text. */
export function withRecordNotice<T>(payload: T): T {
  return stored(payload, words(row(payload)?.summary))
}

/** Briefs by resource id (/api/brief): every value is a brief a model wrote. No briefs, no notice. */
export function withBriefsNotice<T>(payload: T): T {
  const briefs = row(row(payload)?.briefs)
  return stored(payload, !!briefs && Object.values(briefs).some(words))
}

/** Search results (/api/search, /api/search-all): a row marked `machine` carries a bill's summary sentences in its
 * snippet (scripts/build_search_catalog.mjs). /api/suggest is left as it is: its rows are shown by title only. */
export function withResultsNotice<T>(payload: T): T {
  const results = row(payload)?.results
  return stored(payload, Array.isArray(results) && results.some(r => row(r)?.machine === true && words(row(r)?.snippet)))
}

/** A bill text version (/bill-texts/<key>/<version>.json): `enrichment.brief` is a model's overview of that
 * version, shown as "In this version". The index file and a version with no overview carry no notice. */
export function withBillTextNotice<T>(payload: T): T {
  return stored(payload, words(row(row(payload)?.enrichment)?.brief))
}

/** The map for a public API path that serves stored machine-written text, or null. */
export function storedNoticeMap(pathname: string): (<T>(payload: T) => T) | null {
  if (pathname === '/api/brief') return withBriefsNotice
  if (/^\/bill-texts\/[^/]+\/[^/]+\.json$/.test(pathname) && !pathname.endsWith('/index.json')) return withBillTextNotice
  if (/^\/api\/resource\/[^/]+$/.test(pathname)) return withRecordNotice
  if (pathname === '/api/search' || pathname === '/api/search-all') return withResultsNotice
  return null
}

/** A public reply with the notice for the stored machine-written text it carries. It is added as the reply leaves
 * for a reader, after every cache and after the display rules, so cached copies and the Worker's own reads of
 * these routes (Ask research, the MCP tools, voice) are as they were. */
export function storedNoticeResponse(response: Response, pathname: string): Promise<Response> {
  const map = storedNoticeMap(pathname)
  return map ? mapAnswerPayload(response, map) : Promise.resolve(response)
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
