/** The source policy in the Worker (one loader, parli/ingest/source_policy.mjs). The tiers are public and
 * bundled. The withheld list is private: it arrives in the OPAX_WITHHELD_JSON secret and is never in the
 * repository, a log line, an error or a response. kbFetch is the only way this Worker reaches the knowledge
 * base, so Ask retrieval, search, the resource API, MCP read_record and every tool's lookup pass through two
 * steps here: a query never asks for a withheld source or document, and a response never carries the text of a
 * resource that is withheld or whose tier keeps it out of the knowledge base. A reader sees one neutral notice
 * for a withheld item, or nothing at all in hide mode; never a reason. */
import { POLICY, NOTICE, kbRefusal, loadWithheld, withheldDigest, type SourcePolicy, type WithheldEntry } from '../../parli/ingest/source_policy.mjs'

export { POLICY, NOTICE, kbRefusal, withheldDigest }
export type { SourcePolicy, WithheldEntry }

/** Load the private store for this request. False when the secret is set and cannot be read: the caller then
 * refuses the routes that depend on the list rather than serve them from an older or empty one. No secret is
 * "nothing withheld". */
export function withheldReady(raw: string | undefined): boolean {
  try { loadWithheld(raw); return true } catch { return false }
}
/** Routes that read records, search or answer: with an unreadable store they are refused, not served. */
export const dependsOnWithheld = (pathname: string): boolean => /^\/(?:api|mcp|doc|report|official-reports)(?:\/|$)/.test(pathname)
/** What a reader gets from those routes while the store cannot be read. It says nothing about the list. */
export function withheldUnavailable(pathname: string): Response {
  const headers = { 'retry-after': '300', 'cache-control': 'no-store' }
  return pathname.startsWith('/api/') || pathname.startsWith('/mcp')
    ? new Response(JSON.stringify({ error: 'OPAX is temporarily unavailable. Please try again shortly.' }), { status: 503, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } })
    : new Response('OPAX is temporarily unavailable. Please try again shortly.', { status: 503, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } })
}
/** A hidden document read by its slug is answered as a record that does not exist, without asking for it. */
export function hiddenKbRead(target: string, policy: SourcePolicy = POLICY): Response | null {
  const read = READ.exec(target)
  if (!read || !target.startsWith('/slug/')) return null
  let slug = read[1]
  try { slug = decodeURIComponent(slug) } catch { /* matched as sent */ }
  return policy.withheld({ documents: [slug] })?.mode === 'hide' ? new Response(JSON.stringify({ detail: 'Resource does not exist' }), { status: 404, headers: { 'content-type': 'application/json' } }) : null
}
type Row = Record<string, unknown>
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const QUERY_PATHS = new Set(['/find', '/ask', '/search', '/catalog'])
const READ = /^\/(?:slug|resource)\/([^/?]+)(\?.*)?$/

/** The request to send: a query excludes withheld sources and documents; a read of a withheld document asks
 * for its listing fields only, never its text. */
export function guardKbRequest(target: string, body: unknown, policy: SourcePolicy = POLICY): { target: string, body: unknown } {
  const read = READ.exec(target)
  if (read && target.startsWith('/slug/') && policy.withheld({ documents: [decodeURIComponent(read[1])] })) return { target: `/slug/${read[1]}?show=basic&show=origin&show=extra`, body }
  if (!QUERY_PATHS.has(pathOf(target)) || !body || typeof body !== 'object' || Array.isArray(body)) return { target, body }
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

/** What a closed resource shows: its title, date and publisher link with the neutral notice, and no text, summary,
 * speaker or computed labels. */
export function listedKbResource(resource: Row): Row {
  const origin = object(resource.origin), metadata = object(object(resource.extra).metadata)
  const kept = Object.fromEntries(['date', 'source_url'].filter(k => typeof metadata[k] === 'string').map(k => [k, metadata[k]]))
  const kind = (Array.isArray(object(resource.usermetadata).classifications) ? object(resource.usermetadata).classifications as Row[] : []).filter(c => c.labelset === 'kind' || c.labelset === 'source')
  return { id: resource.id, slug: resource.slug, title: resource.title, origin: { ...(origin.url ? { url: origin.url } : {}), ...(origin.source_id ? { source_id: origin.source_id } : {}) },
    usermetadata: { classifications: kind }, extra: { metadata: kept }, unavailable: NOTICE }
}

function scrubMap(holder: Row, key: string, policy: SourcePolicy): string[] {
  const map = object(holder[key]), gone: string[] = []
  for (const [rid, resource] of Object.entries(map)) if (kbRefusal(resource, policy)) gone.push(rid)
  if (gone.length) holder[key] = Object.fromEntries(Object.entries(map).filter(([rid]) => !gone.includes(rid)))
  return gone
}
const matchRid = (entry: unknown) => { const e = object(entry); return String(typeof entry === 'string' ? entry : e.id ?? e.rid ?? '') }
const without = (list: unknown, gone: string[]) => Array.isArray(list) ? list.filter(entry => !gone.some(rid => matchRid(entry) === rid || matchRid(entry).startsWith(rid + '/'))) : list
/** One result set (a /find, /search or /catalog answer, the retrieval of an /ask, or one prequery): closed
 * resources leave its map, its best matches and its paragraph, full-text and sentence lists. Returns their rids. */
function scrubResults(set: Row, policy: SourcePolicy): string[] {
  const gone = scrubMap(set, 'resources', policy)
  if (!gone.length) return gone
  set.best_matches = without(set.best_matches, gone)
  for (const key of ['paragraphs', 'fulltext', 'sentences', 'relations']) {
    const part = object(set[key])
    if (Array.isArray(part.results)) set[key] = { ...part, results: without(part.results, gone) }
  }
  return gone
}

/** The path of a request without its query string: GET /catalog?… and /search?… are checked like the POST forms. */
const pathOf = (target: string) => target.split('?')[0]

/** A parsed knowledge base response with closed resources taken out. A single read becomes a listing row; a
 * result set loses the resource and its matches; a generated answer that drew on one, in its retrieval or in a
 * prequery, is not passed on. */
export function scrubKbPayload(target: string, data: unknown, policy: SourcePolicy = POLICY): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const out = { ...data as Row }
  if (READ.test(target)) {
    const refusal = kbRefusal(out, policy)
    // Hidden: nothing of the resource, not even that it is there. The resource API answers it as not found.
    return !refusal ? out : refusal.mode === 'hide' ? { hidden: true } : listedKbResource(out)
  }
  scrubResults(out, policy)
  let used = false
  if (out.retrieval_results && typeof out.retrieval_results === 'object') {
    const results = { ...object(out.retrieval_results) }
    if (scrubResults(results, policy).length) { out.retrieval_results = results; used = true }
  }
  if (out.prequeries && typeof out.prequeries === 'object' && !Array.isArray(out.prequeries)) {
    const prequeries = Object.fromEntries(Object.entries(out.prequeries as Row).map(([id, value]) => {
      const set = { ...object(value) }
      if (scrubResults(set, policy).length) used = true
      return [id, set]
    }))
    out.prequeries = prequeries
  }
  // The model saw the passage: its answer and citations are not passed on.
  if (used) { if (typeof out.answer === 'string') out.answer = ''; if ('citations' in out) out.citations = {}; if ('answer_json' in out) out.answer_json = null }
  return out
}

const names = (text: string, policy: SourcePolicy) => policy.closedIds.some(id => text.includes(id.includes('/') ? id.split('/')[0] : id))
const STREAMED_ANSWER = new Set(['answer', 'answer_json', 'citations', 'footnote_citations', 'text', 'json'])

/** A streamed /ask (NDJSON), checked line by line as it passes. The retrieval item loses any closed resource; if
 * it held one, the model saw it, so no answer text or citation that follows is passed on. Answer lines that
 * arrive before the retrieval item are held until it comes. A line that names nothing closed passes unchanged;
 * one that cannot be parsed and names a closed id is dropped. */
function guardNdjson(response: Response, policy: SourcePolicy): Response {
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let rest = '', seenRetrieval = false, used = false
  const held: string[] = []
  const line = (raw: string, emit: (text: string) => void) => {
    if (!raw.trim()) return emit(raw)
    let parsed: Row
    try { parsed = object(JSON.parse(raw)) } catch { if (!names(raw, policy)) emit(raw); return }
    const item = object(parsed.item ?? parsed.chunk ?? parsed), type = String(item.type ?? '')
    const results = item.results && typeof item.results === 'object' ? { ...object(item.results) } : null
    if (type === 'retrieval' || results?.resources) {
      const gone = results ? scrubResults(results, policy) : []
      seenRetrieval = true
      if (gone.length) used = true
      emit(gone.length ? JSON.stringify({ ...parsed, item: { ...item, results } }) : raw)
      for (const waiting of held.splice(0)) if (!used) emit(waiting)
      return
    }
    if (type === 'prequeries' && item.results && typeof item.results === 'object') {
      const sets = Object.fromEntries(Object.entries(object(item.results)).map(([id, value]) => { const set = { ...object(value) }; if (scrubResults(set, policy).length) used = true; return [id, set] }))
      return emit(JSON.stringify({ ...parsed, item: { ...item, results: sets } }))
    }
    if (STREAMED_ANSWER.has(type)) {
      if (used) return
      if (!seenRetrieval) { held.push(raw); return }
    }
    if (names(raw, policy)) return
    emit(raw)
  }
  const body = response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      rest += decoder.decode(chunk, { stream: true })
      const lines = rest.split('\n')
      rest = lines.pop() ?? ''
      for (const raw of lines) line(raw, text => controller.enqueue(encoder.encode(text + '\n')))
    },
    flush(controller) {
      const emit = (text: string) => controller.enqueue(encoder.encode(text + '\n'))
      if (rest) line(rest, emit)
      // No retrieval item ever came: nothing was retrieved, so what was held is the whole answer.
      for (const waiting of held.splice(0)) if (!used) emit(waiting)
    },
  }))
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

/** The response to hand on. A JSON response is checked as its body is read, so the caller still gets the
 * response as soon as its headers arrive and its own deadlines and cancellation apply to the body unchanged;
 * one that cannot be parsed and names a closed id is an error, never passed through. A streamed answer is
 * checked line by line. */
export function guardKbResponse(target: string, response: Response, policy: SourcePolicy = POLICY): Response {
  if (!policy.active || !response.ok || !response.body) return response
  const path = pathOf(target), type = response.headers.get('content-type') ?? ''
  if (type.includes('ndjson')) return path === '/ask' ? guardNdjson(response, policy) : response
  if (!(READ.test(target) || QUERY_PATHS.has(path)) || !type.includes('application/json')) return response
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
        if (!names(text, policy)) controller.enqueue(bytes)
        else {
          let parsed: unknown
          try { parsed = JSON.parse(text) } catch { throw new Error('record lookup unavailable') }
          controller.enqueue(new TextEncoder().encode(JSON.stringify(scrubKbPayload(path === '/ask' || READ.test(target) ? target : path, parsed, policy))))
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

/** The rid of a request for one field of a resource (/resource/<rid>/text/<field>): the path names no slug or
 * source, so the caller checks the resource itself first. */
export const fieldReadRid = (target: string): string | null => /^\/resource\/([0-9a-f]{32})\/[a-z]+\/[^/?]+/i.exec(target)?.[1] ?? null
/** True when a guarded read of a resource came back closed (a listing row or hidden). */
export const closedRead = (resource: unknown): boolean => { const r = object(resource); return r.hidden === true || typeof r.unavailable === 'string' }

type Ref = { slug?: unknown; resource?: unknown }
const ridOf = (value: unknown) => /^[0-9a-f]{32}/i.exec(String(value ?? ''))?.[0]?.toLowerCase()
/** Which of the records a client names (by slug, or by knowledge base id) are withheld. Slugs are checked
 * against the list; ids are read through `read`, a guarded basic read, at most 16 of them. */
export async function closedRefs(refs: Ref[], read: (rid: string) => Promise<unknown>, policy: SourcePolicy = POLICY): Promise<(ref: Ref) => boolean> {
  if (!policy.withheldCount) return () => false
  const rids = [...new Set(refs.map(r => ridOf(r.resource)).filter((r): r is string => !!r))].slice(0, 16), closed = new Set<string>()
  await Promise.all(rids.map(async rid => { try { if (closedRead(await read(rid))) closed.add(rid) } catch { closed.add(rid) } }))
  const known = new Set(rids)
  return ref => (typeof ref.slug === 'string' && !!policy.withheld({ documents: [ref.slug] })) || (() => { const rid = ridOf(ref.resource); return !!rid && (closed.has(rid) || !known.has(rid)) })()
}

/** What a client sends back from earlier turns, before any request is built from it: an answer turn that cited
 * a withheld record is dropped with its sources, and a withheld record is taken out of prior_resources. The
 * reader's own turns stay. */
export async function withoutWithheldHistory<T extends Row>(input: T, read: (rid: string) => Promise<unknown>, policy: SourcePolicy = POLICY): Promise<T> {
  if (!policy.withheldCount) return input
  const turns = Array.isArray(input.context) ? input.context as Row[] : [], prior = Array.isArray(input.prior_resources) ? input.prior_resources as unknown[] : []
  const sources = turns.flatMap(t => Array.isArray(object(t).sources) ? object(t).sources as Ref[] : [])
  const closed = await closedRefs([...sources, ...prior.map(resource => ({ resource }))], read, policy)
  return { ...input,
    ...(Array.isArray(input.context) ? { context: turns.filter(t => object(t).author !== 'answer' || !(Array.isArray(object(t).sources) ? object(t).sources as Ref[] : []).some(closed)) } : {}),
    ...(Array.isArray(input.prior_resources) ? { prior_resources: prior.filter(resource => !closed({ resource })) } : {}) }
}

const slugPart = (value: unknown) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** The document ids a tool row may be withheld under: its slug or record id, or its id as a report slug. */
const rowDocuments = (r: Row): string[] => [r.slug, r.record_id, r.id, ...(typeof r.id === 'string' ? ['integrity-report', 'agency-report', 'annual-report', 'royal-commission'].map(type => `${type}-${slugPart(r.id)}`) : [])]
  .filter((v): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9._-]{0,199}$/.test(v))

/** Search rows as they leave the Worker, whatever the built catalogue holds: a withheld record (a slug, or a
 * report by the slug in its link) is left out, or keeps its title and link with the one neutral notice. */
export function guardSearchRows<T>(rows: readonly T[], policy: SourcePolicy = POLICY): T[] {
  if (!policy.withheldCount) return rows as T[]
  return rows.flatMap(row => {
    const r = object(row), report = /^\/report\/([a-z0-9-]+)/.exec(String(r.href ?? ''))?.[1]
    const held = policy.withheld({ documents: [...rowDocuments(r), ...(report ? [report] : [])], sources: report?.startsWith('royal-commission-') ? [report.replace('royal-commission-', '')] : [] })
    if (!held) return [row]
    return held.mode === 'hide' ? [] : [{ kind: r.kind, title: r.title, href: r.href, slug: r.slug, snippet: NOTICE, resource: '', unavailable: NOTICE } as T]
  })
}

/** The last step before a tool's result reaches Ask's citations or an MCP client: a row or citation that names a
 * withheld record (a knowledge base slug, or a report by its slug) is left out, or reduced to its title and the
 * neutral notice, whatever the tool read. */
export function guardToolResult<T extends { rows?: unknown[], items?: unknown[], citations?: { url: string, text: string }[] }>(result: T, policy: SourcePolicy = POLICY): T {
  if (!policy.withheldCount) return result
  const listed = (row: unknown): unknown[] => {
    const r = object(row), held = policy.withheld({ documents: rowDocuments(r) })
    if (!held) return [row]
    return held.mode === 'hide' ? [] : [{ ...(r.slug ? { slug: r.slug } : {}), ...(r.record_id ? { record_id: r.record_id } : {}), ...(r.id ? { id: r.id } : {}), ...(r.title ? { title: r.title } : {}), unavailable: NOTICE }]
  }
  const slugOf = (url: unknown) => { try { return decodeURIComponent(/\/(?:doc|report)\/([^/?#]+)/.exec(String(url ?? ''))?.[1] ?? '') } catch { return '' } }
  return { ...result, ...(Array.isArray(result.rows) ? { rows: result.rows.flatMap(listed) } : {}), ...(Array.isArray(result.items) ? { items: result.items.flatMap(listed) } : {}),
    ...(Array.isArray(result.citations) ? { citations: result.citations.filter(c => !policy.withheld({ documents: [slugOf(c?.url)].filter(Boolean) })) } : {}) }
}
