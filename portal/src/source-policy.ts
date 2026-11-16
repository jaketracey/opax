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
  // /catalog filters resources; the search endpoints filter fields, and a resource clause there excludes
  // every field of that resource.
  const key = target === '/catalog' ? 'resource' : 'field'
  const expression = object((body as Row).filter_expression), existing = expression[key]
  return { target, body: { ...body as Row, filter_expression: { ...expression, [key]: { and: [...(existing ? [existing] : []), ...clauses] } } } }
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
