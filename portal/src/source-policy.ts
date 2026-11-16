/** The source policy at the knowledge base boundary (parli/ingest/source_policy.json, one loader in
 * parli/ingest/source_policy.mjs). kbFetch is the only way this Worker reaches the knowledge base, so Ask
 * retrieval, search, the resource API, MCP read_record and every tool's lookup pass through these two steps:
 * a query never asks for a withheld source or document, and a response never carries the text of a resource
 * that is withheld or whose source is not quotable. */
import { POLICY, kbRefusal, type SourcePolicy, type WithheldEntry } from '../../parli/ingest/source_policy.mjs'

export { POLICY, kbRefusal }
export type { SourcePolicy, WithheldEntry }
type Row = Record<string, unknown>
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const QUERY_PATHS = new Set(['/find', '/ask', '/search', '/catalog'])
const READ = /^\/(?:slug|resource)\/([^/?]+)(\?.*)?$/

/** The request to send: a query excludes withheld sources and documents; a read of a withheld document asks
 * for its listing fields only, never its text. */
export function guardKbRequest(target: string, body: unknown, policy: SourcePolicy = POLICY): { target: string, body: unknown } {
  const read = READ.exec(target)
  if (read && target.startsWith('/slug/') && policy.withheld({ documents: [decodeURIComponent(read[1])] })) return { target: `/slug/${read[1]}?show=basic&show=origin&show=extra`, body }
  if (!QUERY_PATHS.has(target) || !body || typeof body !== 'object' || Array.isArray(body)) return { target, body }
  const clauses: Row[] = [
    ...policy.withheldSources.flatMap(id => [{ not: { prop: 'label', labelset: 'source', label: id } }, { not: { prop: 'origin_source', id } }]),
    ...policy.withheldDocuments.filter(id => !id.includes('/')).map(slug => ({ not: { prop: 'resource', slug } })),
  ]
  if (!clauses.length) return { target, body }
  return { target, body: withFilter(target, body as Row, clauses) }
}

/** /catalog filters resources; the search endpoints filter fields, and a resource clause there excludes every
 * field of that resource. */
function withFilter(target: string, body: Row, clauses: Row[]): Row {
  const key = target === '/catalog' ? 'resource' : 'field'
  const expression = object(body.filter_expression), all = [...(expression[key] ? [expression[key] as Row] : []), ...clauses]
  return { ...body, filter_expression: { ...expression, [key]: all.length === 1 ? all[0] : { and: all } } }
}

// ---- paths where the knowledge base itself generates text
// The older Ask engine and planner, follow-up rewriting and suggestions, search summaries, position recovery,
// journey stories and the money overview all ask the knowledge base to generate, and it reaches a model through
// a preset this code cannot flag. A source reaches those paths only at the full tier with kb_generation: allowed,
// and the sources in KB_GENERATION_NEVER never do. It is kept out twice: the retrieval the knowledge base runs
// for the request is filtered, and nothing of the source is put in the request where it is assembled.

/** True for a request that makes the knowledge base generate text. */
export const isKbGeneration = (target: string, body: unknown): boolean =>
  target === '/predict/chat' || target === '/ask' && object(body).generate_answer !== false

/** The records, facts, passages or turns that may go into a knowledge base generation request. */
export const openForKbGeneration = <T>(items: readonly T[], policy: SourcePolicy = POLICY): T[] => items.filter(item => !policy.kbGenerationExcluded(item))

/** The last step before a generation request leaves: the knowledge base's own retrieval is filtered, and any
 * supplied context entry or earlier answer that names an excluded source is taken out. The reader's own words
 * (the question, their earlier turns) are theirs and stay. */
export function guardKbGeneration(target: string, body: unknown, policy: SourcePolicy = POLICY): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !(target === '/ask' || target === '/predict/chat')) return body
  // /ask retrieves even when it does not generate, and what it retrieves is then sent to /predict/chat: the
  // retrieval filter goes on every /ask.
  const filtered = target === '/ask' && policy.kbGenerationClosed.length ? withFilter(target, body as Row, policy.kbGenerationClosed.map(id => ({ not: { prop: 'label', labelset: 'source', label: id } }))) : body as Row
  if (!isKbGeneration(target, body)) return filtered
  const out = { ...filtered }
  const open = (value: unknown) => !policy.kbGenerationExcluded(value)
  if (Array.isArray(out.extra_context)) out.extra_context = out.extra_context.filter(open)
  if (Array.isArray(out.query_context)) out.query_context = out.query_context.filter(open)
  else if (out.query_context && typeof out.query_context === 'object') out.query_context = Object.fromEntries(Object.entries(out.query_context as Row).filter(([id, text]) => open([id, text])))
  if (Array.isArray(out.chat_history)) out.chat_history = out.chat_history.filter(turn => object(turn).author !== 'NUCLIA' || open(turn))
  return out
}

/** What a closed resource shows: its title, date and publisher link with the label, and no text, summary,
 * speaker or computed labels. */
export function listedKbResource(resource: Row, refusal: WithheldEntry | { label: string }): Row {
  const origin = object(resource.origin), metadata = object(object(resource.extra).metadata)
  const kept = Object.fromEntries(['date', 'source_url'].filter(k => typeof metadata[k] === 'string').map(k => [k, metadata[k]]))
  const kind = (Array.isArray(object(resource.usermetadata).classifications) ? object(resource.usermetadata).classifications as Row[] : []).filter(c => c.labelset === 'kind' || c.labelset === 'source')
  return { id: resource.id, slug: resource.slug, title: resource.title, origin: { ...(origin.url ? { url: origin.url } : {}), ...(origin.source_id ? { source_id: origin.source_id } : {}) },
    usermetadata: { classifications: kind }, extra: { metadata: kept }, withheld: refusal }
}

function scrubMap(holder: Row, key: string, policy: SourcePolicy): string[] {
  const map = object(holder[key]), gone: string[] = []
  for (const [rid, resource] of Object.entries(map)) if (kbRefusal(resource, policy)) gone.push(rid)
  if (gone.length) holder[key] = Object.fromEntries(Object.entries(map).filter(([rid]) => !gone.includes(rid)))
  return gone
}

/** A parsed knowledge base response with closed resources taken out. A single read becomes a listing row; a
 * result set loses the resource and its matches; a generated answer that drew on one is not passed on. */
export function scrubKbPayload(target: string, data: unknown, policy: SourcePolicy = POLICY): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const out = { ...data as Row }
  if (READ.test(target)) {
    const refusal = kbRefusal(out, policy)
    return refusal ? listedKbResource(out, refusal) : out
  }
  const gone = scrubMap(out, 'resources', policy)
  if (out.retrieval_results && typeof out.retrieval_results === 'object') {
    const results = { ...object(out.retrieval_results) }
    const removed = scrubMap(results, 'resources', policy)
    if (removed.length) {
      if (Array.isArray(results.best_matches)) results.best_matches = results.best_matches.filter(id => !removed.some(rid => String(typeof id === 'string' ? id : object(id).id ?? '').startsWith(rid + '/')))
      out.retrieval_results = results
      // The model saw the passage: its answer and citations are not passed on.
      if (typeof out.answer === 'string') out.answer = ''
      if ('citations' in out) out.citations = {}
      gone.push(...removed)
    }
  }
  if (gone.length && Array.isArray(out.best_matches)) out.best_matches = out.best_matches.filter(id => !gone.some(rid => String(typeof id === 'string' ? id : object(id).id ?? '').startsWith(rid + '/')))
  return out
}

/** The response to hand on. JSON responses are checked as their body is read, so the caller still gets the
 * response as soon as its headers arrive and its own deadlines and cancellation apply to the body unchanged. A
 * streamed answer is not checked; it relies on the request filter and on withheld resources having been deleted
 * from the knowledge base. */
export function guardKbResponse(target: string, response: Response, policy: SourcePolicy = POLICY): Response {
  if (!policy.active || !response.ok || !response.body || !(READ.test(target) || QUERY_PATHS.has(target)) || !(response.headers.get('content-type') ?? '').includes('application/json')) return response
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
        const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
        let at = 0
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
        const text = new TextDecoder().decode(bytes)
        // Untouched bytes pass through unless the body names a closed source or document.
        if (!policy.closedIds.some(id => text.includes(id.includes('/') ? id.split('/')[0] : id))) controller.enqueue(bytes)
        else {
          let out = text
          try { out = JSON.stringify(scrubKbPayload(target, JSON.parse(text), policy)) } catch { /* not JSON after all: nothing to check */ }
          controller.enqueue(new TextEncoder().encode(out))
        }
        controller.close()
      } catch (error) { controller.error(error) }
    },
    cancel(reason) { return reader.cancel(reason) },
  })
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

/** The last step before a tool's result reaches Ask's citations or an MCP client: a row or citation that names a
 * withheld record by its slug is reduced to its title and label, whatever the tool read. */
export function guardToolResult<T extends { rows?: unknown[], items?: unknown[], citations?: { url: string, text: string }[] }>(result: T, policy: SourcePolicy = POLICY): T {
  if (!policy.withheldDocuments.length) return result
  const entry = (slug: unknown) => typeof slug === 'string' ? policy.withheld({ documents: [slug] }) : null
  const listed = (row: unknown) => {
    const r = object(row), held = entry(r.slug) ?? entry(r.record_id)
    return held ? { ...(r.slug ? { slug: r.slug } : {}), ...(r.record_id ? { record_id: r.record_id } : {}), ...(r.title ? { title: r.title } : {}), withheld: held.label } : row
  }
  const slugOf = (url: unknown) => { try { return decodeURIComponent(/\/doc\/([^/?#]+)/.exec(String(url ?? ''))?.[1] ?? '') } catch { return '' } }
  return { ...result, ...(Array.isArray(result.rows) ? { rows: result.rows.map(listed) } : {}), ...(Array.isArray(result.items) ? { items: result.items.map(listed) } : {}),
    ...(Array.isArray(result.citations) ? { citations: result.citations.filter(c => !entry(slugOf(c?.url))) } : {}) }
}
