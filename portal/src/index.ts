/**
 * OPAX portal Worker — thin proxy over the Progress Agentic RAG knowledge box.
 *
 * The KB service-account token never reaches the browser: every platform call
 * is made here. Static assets (the whole frontend) are served by the ASSETS
 * binding; only /api/* runs this code (run_worker_first).
 *
 * Platform gotchas honoured here (from corpuskit's ARAG field notes):
 *  - never send citations:true together with answer_json_schema (backend 500s)
 *  - /find and /ask key filters as {field: ...} (legacy `filters` array is a no-op)
 *  - reranker pinned to 'predict' so a platform default change can't un-rerank us
 *  - /find scores mix scales (semantic 0-1, BM25 unbounded) — calibrate before display
 *  - exclude da-* fields from citations (enrichment output must not cite itself)
 */

interface FindParagraph {
  score: number
  score_type: string
  text: string
}

interface FindResource {
  title?: string
  slug?: string
  origin?: { collaborators?: string[]; url?: string }
  usermetadata?: { classifications?: { labelset: string; label: string }[] }
  extra?: { metadata?: Record<string, unknown> }
  fields?: Record<string, { paragraphs?: Record<string, FindParagraph> }>
}

const SLUG_RE = /^(speech|legal|news)-(\d+)$/
// Division records (parli.ingest.votes_ingest) carry composite ids:
// division-nsw-la-2025-12-22-3, division-federal-senate-10113. Public too.
const DIVISION_SLUG_RE = /^division-[a-z0-9-]+$/
const isPublicSlug = (slug: string): boolean => SLUG_RE.test(slug) || DIVISION_SLUG_RE.test(slug)

/**
 * Build a /find//ask filter_expression from the portal's filter vocabulary.
 * Grammar verified against the live KB (2026-09-01):
 *   speaker → {prop:'origin_collaborator', collaborator} (names normalised at sync)
 *   party/state/kind → {prop:'label', labelset, label}
 *   from/to (years) → {prop:'created', since/until} — origin.created is the speech date
 * Multiple clauses AND together under `field`.
 */
/**
 * The collaborator filter is an EXACT match against names normalised at sync
 * ("John Howard"), so a lazily-typed "john howard" finds nothing. Meet the
 * typing halfway: collapse whitespace, and when the input carries no case
 * signal at all (all lower / all upper) title-case each name part across
 * space, hyphen and apostrophe boundaries. Mixed-case input ("McEwen",
 * "D'Ambrosio") is trusted verbatim - re-casing it would break the match.
 */
function canonicalSpeaker(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name
  return name.toLowerCase().replace(
    /(^|[\s\-'])(\p{L})/gu,
    (_, boundary: string, letter: string) => boundary + letter.toUpperCase(),
  )
}

// The 21-topic taxonomy applied by the enrichment pass (scripts/arag_enrich.py
// TOPICS is canonical). Unknown values are ignored, not rejected.
const TOPIC_SLUGS = new Set([
  'gambling', 'financial-services', 'mining-energy', 'climate-environment',
  'property-construction', 'housing', 'health', 'media-communications',
  'hospitality-alcohol', 'defence-security', 'agriculture', 'unions-workplace',
  'immigration', 'indigenous-affairs', 'tax-budget', 'education',
  'welfare-social', 'integrity-democracy', 'infrastructure-transport',
  'justice-law', 'foreign-affairs',
])

function filterExpression(f: {
  kind?: string | null
  speaker?: string | null
  party?: string | null
  state?: string | null
  topic?: string | null
  from?: string | null
  to?: string | null
}): Record<string, unknown> | null {
  const clauses: Record<string, unknown>[] = []
  if (f.kind && f.kind !== 'all') {
    clauses.push({ prop: 'label', labelset: 'kind', label: f.kind })
  }
  if (f.party) clauses.push({ prop: 'label', labelset: 'party', label: f.party })
  if (f.state) clauses.push({ prop: 'label', labelset: 'state', label: f.state })
  if (f.topic && TOPIC_SLUGS.has(f.topic)) {
    clauses.push({ prop: 'label', labelset: 'topic', label: f.topic })
  }
  if (f.speaker) {
    clauses.push({ prop: 'origin_collaborator', collaborator: canonicalSpeaker(f.speaker) })
  }
  const yr = (s: string | null | undefined) => (s && /^\d{4}$/.test(s) ? s : null)
  const from = yr(f.from)
  const to = yr(f.to)
  if (from || to) {
    clauses.push({
      prop: 'created',
      ...(from ? { since: `${from}-01-01T00:00:00Z` } : {}),
      ...(to ? { until: `${to}-12-31T23:59:59Z` } : {}),
    })
  }
  // Title ("generic") fields hold only "Name — date". A paragraph match there
  // is retrieval noise: under a tight speaker filter the whole context can end
  // up as score-zero titles, which the model rightly answers with "not enough
  // data" while the UI shows 20 hollow "sources". Restrict matching to real
  // field text everywhere. (Verified live: the legacy `fields` param cannot
  // mix with filter_expression; this not-clause is the supported form.)
  clauses.push({ not: { prop: 'field', type: 'generic' } })
  return { field: clauses.length === 1 ? clauses[0] : { and: clauses } }
}

const ragBase = (env: Env) =>
  `https://${env.ARAG_ZONE}.rag.progress.cloud/api/v1/kb/${env.ARAG_KB_ID}`

async function kbFetch(
  env: Env,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> {
  return fetch(`${ragBase(env)}${path}`, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      'x-nuclia-serviceaccount': `Bearer ${env.ARAG_KB_TOKEN}`,
      ...init?.headers,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

/** Snap a snippet window start back to the nearest preceding space. */
function lower_bound(text: string, at: number): number {
  const sp = text.lastIndexOf(' ', at)
  return sp > 0 ? sp + 1 : at
}

/** Squash mixed-scale /find scores into 0..1 for the UI's relevance bar. */
function calibrate(score: number, scoreType: string): number {
  if (scoreType === 'VECTOR' || scoreType === 'BOTH' || score <= 1) {
    return Math.min(Math.max(score, 0), 1)
  }
  return 1 / (1 + Math.exp(-(score - 8) / 4))
}

function label(resource: FindResource, labelset: string): string | null {
  for (const c of resource.usermetadata?.classifications ?? []) {
    if (c.labelset === labelset) return c.label
  }
  return null
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function apiSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim()
  if (!q) return json({ error: 'q is required' }, 400)
  const topK = Math.min(Number(url.searchParams.get('top_k') ?? 20) || 20, 50)
  const mode = url.searchParams.get('mode') ?? 'hybrid'
  const kind = url.searchParams.get('kind') ?? 'speech'
  const phrases = [...q.matchAll(/"([^"]{2,})"/g)].map((m) => m[1].toLowerCase().trim())
  const queryTerms = phrases.length
    ? phrases
    : q.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3)

  const body: Record<string, unknown> = {
    query: q,
    top_k: topK,
    reranker: 'predict',
    // origin + extra aren't serialized by default; the UI needs them for
    // speaker and date.
    show: ['basic', 'origin', 'extra'],
    features:
      mode === 'semantic' ? ['semantic'] : mode === 'keyword' ? ['keyword'] : ['keyword', 'semantic'],
  }
  const filters = filterExpression({
    kind,
    speaker: url.searchParams.get('speaker'),
    party: url.searchParams.get('party'),
    state: url.searchParams.get('state'),
    topic: url.searchParams.get('topic'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  })
  if (filters) body.filter_expression = filters

  const res = await kbFetch(env, '/find', { body })
  if (!res.ok) return json({ error: `find failed (${res.status})` }, 502)
  const found = (await res.json()) as { resources?: Record<string, FindResource> }

  const results = Object.entries(found.resources ?? {})
    .filter(([, r]) => !(r.slug ?? '').startsWith('da-')) // enrichment output never surfaces as a result
    .map(([rid, resource]) => {
    const slug = resource.slug ?? ''
    const m = SLUG_RE.exec(slug)
    const meta = resource.extra?.metadata ?? {}
    // Compare paragraphs on the CALIBRATED scale — raw BM25 (unbounded) would
    // always beat raw semantic (0-1), hijacking snippet choice and ranking.
    // The snippet, though, should be the passage that actually says what the
    // reader searched for: a quoted phrase, else the most query words. Among
    // hits, the higher calibrated score wins; with no hit, the best paragraph.
    let bestText = ''
    let bestScore = 0
    let bestHits = -1
    let hitAt = -1
    for (const field of Object.values(resource.fields ?? {})) {
      for (const para of Object.values(field.paragraphs ?? {})) {
        const cal = calibrate(para.score, para.score_type)
        const lower = para.text.toLowerCase()
        let hits = 0
        let at = -1
        for (const t of queryTerms) {
          const i = lower.indexOf(t)
          if (i >= 0) { hits++; if (at < 0 || i < at) at = i }
        }
        if (hits > bestHits || (hits === bestHits && cal >= bestScore)) {
          bestHits = hits
          bestScore = cal
          bestText = para.text
          hitAt = at
        }
      }
    }
    // Window the snippet around the first hit so the relevant sentence shows.
    const start = hitAt > 220 ? Math.max(0, lower_bound(bestText, hitAt - 200)) : 0
    const windowed = (start > 0 ? '…' : '') + bestText.slice(start, start + 600)
    const division = DIVISION_SLUG_RE.test(slug)
    return {
      kind: m?.[1] ?? (division ? 'division' : 'unknown'),
      id: m ? Number(m[2]) : null,
      slug,
      resource: rid,
      title: resource.title ?? slug,
      // A division's collaborators are its voters, not a speaker.
      speaker: division ? null : (resource.origin?.collaborators?.[0] ?? null),
      party: label(resource, 'party'),
      state: label(resource, 'state'),
      // Divisions carry their date on origin.created rather than in metadata.
      date: (meta.date as string) ?? (resource.origin as { created?: string } | undefined)?.created?.slice(0, 10) ?? null,
      url: resource.origin?.url || null, // official record, for exports/citations
      snippet: windowed,
      score: Math.round(bestScore * 1000) / 1000, // already calibrated above
    }
  })
  results.sort((a, b) => b.score - a.score)
  return json({ query: q, mode, kind, count: results.length, results })
}

interface AskInput {
  question?: string
  kind?: string
  speaker?: string
  party?: string
  state?: string
  topic?: string
  from?: string
  to?: string
  context?: { author?: string; text?: string }[]
}

type AskAnswer = {
  answer?: string
  citations?: Record<string, unknown>
  retrieval_results?: { resources?: Record<string, FindResource> }
}

// The platform's canned refusal and our custom prompt's. Shared by the
// synchronous retry check and the streaming gate that holds such text back.
const REFUSAL_PREFIXES = [
  'not enough data',
  'the record retrieved for this question does not discuss',
]

const isRefusal = (a: AskAnswer): boolean => {
  const t = (a.answer ?? '').trim().toLowerCase()
  return !t || REFUSAL_PREFIXES.some((p) => t.startsWith(p))
}

// A refusal or empty answer over a healthy retrieval (5+ resources) is a
// generation stumble, not a corpus verdict: worth one silent retry.
const healthyRetrieval = (a: AskAnswer): boolean =>
  Object.keys(a.retrieval_results?.resources ?? {}).length >= 5

/** The platform /ask body for a portal question: filters, context turns, prompt. */
function buildAskBody(input: AskInput): Record<string, unknown> {
  const { question, kind, speaker, party, state, topic, from, to, context } = input
  const body: Record<string, unknown> = {
    query: question,
    citations: true, // NEVER combine with answer_json_schema — platform bug
    top_k: 20,
    reranker: 'predict',
    show: ['basic', 'origin', 'extra'],
  }
  // Prior conversation turns from the chat view. The platform's /ask context
  // author enum is NUCLIA | USER (422 otherwise) — prior answers go in as
  // NUCLIA. The platform validates at 24 turns; clip text defensively too.
  const turns: { author: string; text: string }[] = []
  // Hansard passages are first-person with no in-text attribution, so a
  // speaker-filtered ask ("What did X say about…") reads to the model as
  // unattributed text and it refuses. One provenance turn fixes that
  // (verified live: Wilkie/gambling went from refusal to a cited answer).
  // Filtered retrieval returns a narrow, often mixed context (a speaker's
  // gambling remarks beside their unrelated speeches); the model tends to
  // refuse the whole set. Tell it to answer from the passages that do apply.
  // Measured on Howard/gambling (8/20 passages on-topic): the softer wording
  // still refused 2 of 3 runs; this wording answered 3/3 with 5-6 citations.
  const filtered = [speaker, party, state, topic, from, to].some((v) => v?.trim())
  const noteParts: string[] = []
  if (speaker?.trim()) {
    noteParts.push(
      `Note: every passage in the context is from a speech delivered by ${speaker.trim()} in an Australian parliament; first-person passages are their own words.`,
    )
  }
  if (filtered) {
    noteParts.push(
      'Some passages may be off-topic. Answer from the passages that do address the question, even if only a few do or they address it only in part; quote or closely paraphrase them and cite them. Say the record is thin only if no passage touches the subject at all. Passages that mention the subject DO count as data: if even one passage mentions it, you must not reply that there is not enough data; summarise what that passage says instead.',
    )
  }
  if (noteParts.length) turns.push({ author: 'USER', text: noteParts.join(' ') })
  if (Array.isArray(context) && context.length > 0) {
    turns.push(
      ...context
        .filter((t) => typeof t?.text === 'string' && t.text.trim().length > 0)
        .slice(-(24 - turns.length))
        .map((t) => ({
          author: t.author === 'answer' ? 'NUCLIA' : 'USER',
          text: String(t.text).slice(0, 6000),
        })),
    )
  }
  if (turns.length > 0) body.context = turns
  const filters = filterExpression({ kind: kind ?? 'speech', speaker, party, state, topic, from, to })
  if (filters) body.filter_expression = filters

  // Filtered asks own their prompt. The platform default's fallback line
  // ("Not enough data to answer this.") fires on any mixed context even after
  // guidance turns (measured: 2 in 3 refusals on 8/20 on-topic passages, still
  // 1 in 5 with stronger guidance). A custom template states the retrieval
  // contract plainly and reserves the refusal for a truly empty record.
  if (filtered) {
    body.prompt = {
      system:
        'You are OPAX, a research assistant over the Australian parliamentary record. You answer strictly from the passages provided, citing them. You never invent facts.',
      user:
        'Passages from the record (each is a speech by the named speaker; first-person text is their own words):\n{context}\n\n' +
        'Question: {question}\n\n' +
        'Instructions: Answer from whichever passages address the question, quoting or closely paraphrasing them. ' +
        'Ignore passages that are off-topic. If some passages mention the subject only briefly, report what they say and note that the record is limited. ' +
        'Only if NO passage mentions the subject at all, reply exactly: The record retrieved for this question does not discuss it.',
    }
  }
  return body
}

/** The portal's answer payload: the same shape from the sync and streamed paths. */
function askPayload(answer: AskAnswer): { answer: string; citations: Record<string, unknown>; sources: unknown[] } {
  // Citation keys are ARAG paragraph ids ("<rid>/f/<field>/..."); the leading
  // segment is the resource id. Platform-format knowledge stays HERE — the
  // frontend just reads the `cited` flag.
  const citedIds = new Set(
    Object.keys(answer.citations ?? {}).map((k) => k.split('/')[0]),
  )
  const citedParas = new Set(Object.keys(answer.citations ?? {}))
  const sources = Object.entries(answer.retrieval_results?.resources ?? {})
    .filter(([, r]) => !(r.slug ?? '').startsWith('da-'))
    .map(([rid, r]) => {
      const meta = r.extra?.metadata ?? {}
      // The passage to quote beside the answer: prefer the paragraph the
      // platform actually CITED for this resource; otherwise the best
      // retrieved one (compared on the calibrated scale, as in apiSearch).
      let bestText = ''
      let bestScore = -1
      let citedText = ''
      let citedScore = -1
      for (const field of Object.values(r.fields ?? {})) {
        for (const [pid, para] of Object.entries(field.paragraphs ?? {})) {
          const cal = calibrate(para.score, para.score_type)
          if (cal > bestScore) {
            bestScore = cal
            bestText = para.text
          }
          if (citedParas.has(pid) && cal > citedScore) {
            citedScore = cal
            citedText = para.text
          }
        }
      }
      return {
        resource: rid,
        slug: r.slug ?? '',
        title: r.title ?? r.slug ?? rid,
        speaker: r.origin?.collaborators?.[0] ?? null,
        party: label(r, 'party'),
        state: label(r, 'state'),
        date: (meta.date as string) ?? null,
        url: r.origin?.url || null, // official record, for exports/citations
        snippet: (citedText || bestText).slice(0, 600),
        cited: citedIds.has(rid),
      }
    })

  return {
    answer: answer.answer ?? '',
    citations: answer.citations ?? {},
    sources,
  }
}

async function apiAsk(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const input = ((await request.json().catch(() => ({}))) ?? {}) as AskInput
  if (!input.question?.trim()) return json({ error: 'question is required' }, 400)
  const body = buildAskBody(input)

  const url = new URL(request.url)
  const wantStream =
    url.searchParams.get('stream') === '1' ||
    (request.headers.get('accept') ?? '').includes('text/event-stream')
  if (wantStream) return apiAskStream(body, env, ctx)

  const askOnce = async (): Promise<AskAnswer | Response> => {
    const res = await kbFetch(env, '/ask', { body, headers: { 'x-synchronous': 'true' } })
    if (!res.ok) return json({ error: `ask failed (${res.status})` }, 502)
    return (await res.json()) as AskAnswer
  }
  let answer = await askOnce()
  if (answer instanceof Response) return answer
  if (isRefusal(answer) && healthyRetrieval(answer)) {
    const again = await askOnce()
    if (!(again instanceof Response) && !isRefusal(again)) answer = again
  }
  return json(askPayload(answer))
}

// --- streamed asks -----------------------------------------------------------
// Without x-synchronous the platform answers as NDJSON, one {"item": {...}}
// per line (probed live 2026-09-02, see docs/STREAMING.md): `reasoning`
// tokens interleaved with EMPTY `answer` placeholders while the model thinks,
// then `answer` text chunks (~6 chars each), and only after the last word a
// single `retrieval` item carrying the full results, then `status`,
// `augmented_context`, `citations`, `metadata`, `consumption`. Nothing at
// all arrives until retrieval + rerank are done (~3-4s); visible text starts
// once reasoning ends (4-12s in); the tail lands ~1.5s after the last word.
//
// We re-emit that as Server-Sent Events the browser can render progressively:
//   event: status  {phase:'reading', words}      the model is still thinking
//   event: delta   {text}                        answer text to append
//   event: retry   {reason:'refusal'|'empty'}    attempt one stumbled; text resets
//   event: done    {answer, citations, sources}  the synchronous payload, verbatim
//   event: error   {error}
// Refusal-looking text is held back until it can't be a refusal, so a retry
// never shows the reader a refusal that is about to be withdrawn.

class RefusalGate {
  private held = ''
  private open = false
  /** Returns the text safe to show now ('' while it could still be a refusal). */
  push(text: string): string {
    if (this.open) return text
    this.held += text
    const probe = this.held.trimStart().toLowerCase()
    if (REFUSAL_PREFIXES.some((p) => p.startsWith(probe) || probe.startsWith(p))) return ''
    this.open = true
    const out = this.held
    this.held = ''
    return out
  }
}

type SseSend = (event: string, data: unknown) => Promise<void>

/** One streamed platform call; deltas go out as they arrive. */
async function streamAskOnce(
  env: Env,
  body: Record<string, unknown>,
  send: SseSend,
  signal: AbortSignal,
): Promise<AskAnswer> {
  const res = await fetch(`${ragBase(env)}/ask`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/x-ndjson',
      'x-nuclia-serviceaccount': `Bearer ${env.ARAG_KB_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`ask failed (${res.status})`)

  let answer = ''
  let citations: Record<string, unknown> = {}
  let resources: Record<string, FindResource> | undefined
  let failure: string | null = null
  let words = 0
  let lastStatusAt = 0
  const gate = new RefusalGate()

  const handle = async (line: string): Promise<void> => {
    let item: Record<string, unknown> | undefined
    try {
      item = (JSON.parse(line) as { item?: Record<string, unknown> }).item
    } catch {
      return // a torn line is the platform's problem, not a reason to drop the answer
    }
    if (!item) return
    switch (item.type) {
      case 'answer': {
        const text = typeof item.text === 'string' ? item.text : ''
        if (!text) return // reasoning-phase placeholder
        answer += text
        const out = gate.push(text)
        if (out) await send('delta', { text: out })
        return
      }
      case 'reasoning': {
        const text = typeof item.text === 'string' ? item.text : ''
        if (/^\s/.test(text)) words++
        // A quiet phase that can run ten seconds: a heartbeat every 2s
        // (throttled so a role=status label isn't chattering at readers).
        const now = Date.now()
        if (now - lastStatusAt >= 2000) {
          lastStatusAt = now
          await send('status', { phase: 'reading', words })
        }
        return
      }
      case 'retrieval':
        resources = (item.results as { resources?: Record<string, FindResource> } | undefined)?.resources
        return
      case 'citations':
        citations = (item.citations as Record<string, unknown> | undefined) ?? {}
        return
      case 'status':
        // "0" success; "-1" error; "-2"/"-3" no context / no retrieval data
        // (the latter two still carry the platform's own refusal text).
        if (String(item.code) === '-1') failure = String(item.status ?? 'error')
        return
      case 'error':
        failure = String(item.error ?? 'error')
        return
      default:
        return
    }
  }

  // Line-split as bytes arrive: the retrieval item alone is ~80KB and can
  // straddle chunks; nothing else needs holding.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) await handle(line)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) await handle(buffer.trim())

  if (failure && !answer.trim()) throw new Error(`ask failed (${failure})`)
  return { answer, citations, retrieval_results: { resources } }
}

function apiAskStream(body: Record<string, unknown>, env: Env, ctx: ExecutionContext): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const upstream = new AbortController()
  let clientGone = false
  const send: SseSend = async (event, data) => {
    if (clientGone) return
    try {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    } catch {
      // The reader left (a newer question aborted this one): stop paying
      // the platform for words nobody will see.
      clientGone = true
      upstream.abort()
    }
  }

  ctx.waitUntil(
    (async () => {
      try {
        let result = await streamAskOnce(env, body, send, upstream.signal)
        // An empty answer is a reasoning burn whatever the retrieval; a
        // refusal is only retried over a healthy one (the sync rule).
        if (isRefusal(result) && (healthyRetrieval(result) || !(result.answer ?? '').trim())) {
          await send('retry', { reason: (result.answer ?? '').trim() ? 'refusal' : 'empty' })
          const again = await streamAskOnce(env, body, send, upstream.signal)
          if (!isRefusal(again)) result = again
        }
        await send('done', askPayload(result))
      } catch (err) {
        if (!clientGone) await send('error', { error: err instanceof Error ? err.message : String(err) })
      } finally {
        try {
          await writer.close()
        } catch {
          /* already gone */
        }
      }
    })(),
  )

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

// --- follow-up questions (the chat's "Ask next" chips) ----------------------
// Ported from corpuskit's follow-up generator. The grounding idea: a follow-up
// is by definition not answered by the answer above it, so the answer cannot
// be its evidence — but the passages retrieved FOR that answer can be. A
// candidate is shipped only when the model copies out the sentence from those
// passages that answers it, which makes the question demonstrably answerable
// from the corpus and phrased around specifics the next retrieval will find.
// Candidates that echo the question already asked, ask about documents as
// objects, or can't be grounded are dropped; offering nothing beats offering
// a question the record would refuse.

const FOLLOWUP_WANT = 3 // shown; we ask for twice this because some fail the tests
const FOLLOWUP_PASSAGE_BUDGET = 6000
const FOLLOWUP_ANSWER_BUDGET = 2500
const FOLLOWUP_MIN_CONTEXT = 200

/** Collapse whitespace and cut on a word boundary, never mid-word. */
function clipText(raw: string, limit: number): string {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  const stop = text.lastIndexOf(' ', limit)
  return text.slice(0, stop > limit / 2 ? stop : limit).trim()
}

/**
 * The retrieved passages as one block of corpus text. Every passage gets an
 * equal share of the budget rather than the first taking it all: the top hit
 * is usually what the answer already used, so the unspent material — where a
 * good follow-up comes from — sits further down the list.
 */
function passageContext(passages: { title: string; text: string }[]): string {
  const usable = passages.filter((p) => p.text.trim().length > 0)
  if (usable.length === 0) return ''
  const share = Math.max(300, Math.floor(FOLLOWUP_PASSAGE_BUDGET / usable.length))
  return usable.map((p) => `${clipText(p.title, 160)}: ${clipText(p.text, share)}`).join('\n\n')
}

/** Normalise quotes/dashes/whitespace so grounding survives model tidying. */
function flattenText(value: string): string {
  return value
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Six words in a row is not something a model invents about a passage it is
 * looking at — demanding character-perfect reproduction would test copyist
 * skill, not groundedness.
 */
function evidenceIsGrounded(evidence: string, excerpt: string): boolean {
  const haystack = flattenText(excerpt)
  const needle = flattenText(evidence)
  if (!haystack) return true
  if (haystack.includes(needle)) return true
  const words = needle.split(' ').filter(Boolean)
  if (words.length < 6) return false
  for (let i = 0; i + 6 <= words.length; i++) {
    if (haystack.includes(words.slice(i, i + 6).join(' '))) return true
  }
  return false
}

const SCAFFOLDING = new Set(
  ('what which when where whose whom does done this that these those they them their there here ' +
    'been being have from with about into than then were was are the and for any how why who ' +
    'much many more most said says tell show give given make made take taken')
    .split(' '),
)

function stemWord(word: string): string {
  let out = word
  if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`
  else if (out.endsWith('s') && !out.endsWith('ss') && out.length > 3) out = out.slice(0, -1)
  if (out.endsWith('ing') && out.length > 5) out = out.slice(0, -3)
  else if (out.endsWith('ed') && out.length > 4) out = out.slice(0, -2)
  return out
}

function topicWords(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((word) => word.length > 3 && !SCAFFOLDING.has(word))
      .map(stemWord),
  )
}

/**
 * Measured against the candidate's own topic words, not the union: a follow-up
 * that adds a new subject scores low even when it repeats the original one.
 */
function isEchoOfQuestion(candidate: string, asked: string): boolean {
  const mine = topicWords(candidate)
  if (mine.size === 0) return true
  const theirs = topicWords(asked)
  let shared = 0
  for (const word of mine) if (theirs.has(word)) shared++
  return shared / mine.size >= 0.7
}

const ABOUT_THE_OBJECT =
  /^(who (wrote|authored|published|funded|commissioned|produced|prepared)|when (was|is) (it|this)|what (year|type|kind) of|who (is|was) (it|this) (for|written for)|what is this (document|report|resource))/i

/**
 * A kept follow-up carries its proof: the evidence sentence and the title of
 * the passage that grounds it. The chip's question was proven against the
 * PREVIOUS answer's retrieval — re-asking it fresh can miss that passage
 * (retrieval-vocabulary mismatch) and force an honest "not enough data"
 * refusal of a question we guaranteed was answerable. The client sends the
 * evidence back as a context turn when the chip is clicked, so the grounding
 * survives the seam between generation and send.
 */
function selectFollowUps(
  candidates: { question?: string; evidence?: string }[],
  asked: string,
  passages: { title: string; text: string }[],
  context: string,
): { question: string; evidence: string; source: string }[] {
  if (!context.trim()) return [] // nothing to prove a follow-up against
  const kept: { question: string; evidence: string; source: string }[] = []
  for (const candidate of candidates) {
    if (kept.length >= FOLLOWUP_WANT) break
    const question = (candidate.question ?? '').trim()
    const evidence = (candidate.evidence ?? '').trim()
    if (!question.endsWith('?')) continue
    const words = question.split(/\s+/).length
    if (words < 4 || words > 16) continue
    if (flattenText(evidence).length < 25) continue
    if (ABOUT_THE_OBJECT.test(question)) continue
    if (isEchoOfQuestion(question, asked)) continue
    if (!evidenceIsGrounded(evidence, context)) continue
    if (kept.some((k) => k.question.toLowerCase() === question.toLowerCase())) continue
    // Three follow-ups that are each other's rewording waste all three slots.
    if (kept.some((k) => isEchoOfQuestion(question, k.question))) continue
    const source = passages.find((p) => evidenceIsGrounded(evidence, p.text))?.title ?? ''
    kept.push({ question, evidence, source })
  }
  return kept
}

/**
 * Candidates come back as plain text lines ("Q: … || EV: …") rather than
 * answer_json_schema: the KB's generation is BYOK OpenRouter → DeepSeek, and
 * the provider 412s the platform's structured-output request ("Unknown LLM
 * exception … 400 Provider returned error"). A line format survives any
 * provider, and the accept filter downstream doesn't care how candidates
 * arrived — ungrounded ones are dropped the same way.
 */
function parseFollowUpLines(answerText: string): { question: string; evidence: string }[] {
  const out: { question: string; evidence: string }[] = []
  for (const line of answerText.split('\n')) {
    const m = line.match(/^\s*(?:[-*\d.)\s]{0,4})Q:\s*(.+?)\s*\|\|\s*EV:\s*(.+?)\s*$/i)
    if (m) out.push({ question: m[1], evidence: m[2] })
  }
  return out
}

async function apiFollowups(request: Request, env: Env): Promise<Response> {
  const { question, answer, passages } = ((await request.json().catch(() => ({}))) ?? {}) as {
    question?: string
    answer?: string
    passages?: { title?: string; text?: string }[]
  }
  // Always 200 with a possibly-empty list: follow-ups are an extra, never an error.
  if (!question?.trim() || !answer?.trim()) return json({ questions: [] })
  const clean = (Array.isArray(passages) ? passages : [])
    .map((p) => ({
      title: String(p?.title ?? '').slice(0, 300),
      text: String(p?.text ?? '').slice(0, 4000),
    }))
    .filter((p) => p.text.trim().length > 0)
    .slice(0, 12)
  const context = passageContext(clean)
  if (context.length < FOLLOWUP_MIN_CONTEXT) return json({ questions: [] })

  const asked = FOLLOWUP_WANT * 2
  const prompt = [
    `Write ${asked} follow-up questions for a reader who has just been given the answer below.`,
    'Use only the retrieved passages; do not draw on outside knowledge.',
    '',
    `QUESTION ALREADY ASKED: ${clipText(question, 500)}`,
    '',
    'ANSWER ALREADY GIVEN (do not ask for anything it already states):',
    clipText(answer, FOLLOWUP_ANSWER_BUDGET),
    '',
    '--- RETRIEVED PASSAGES (the only source a follow-up may draw on) ---',
    context,
    '--- END RETRIEVED PASSAGES ---',
    '',
    'Rules for each question: under 12 words, phrased the way a person would type it, ' +
      'ending in a question mark. It must NOT be the question already asked or a ' +
      'rewording of it, and must not ask for something the answer above already ' +
      'states - go to what the answer left open: a detail it skated over, a figure or ' +
      'term it used without explaining, a related finding in the passages it never ' +
      'reached. Name the specific members, bills, programs, figures or inquiries the ' +
      'passages discuss. Never ask about the documents as objects (who wrote or ' +
      'published them, when, what kind of document they are). Australian English.',
    '',
    'With each question, copy out the sentence from the RETRIEVED PASSAGES that ' +
      'answers it, EXACTLY, character for character. If you cannot copy out a sentence ' +
      'that answers a question, do not write that question: if the passages mention a ' +
      'topic but never state the answer, the question cannot be asked.',
    '',
    `Reply with exactly ${asked} lines and nothing else, each formatted as:`,
    'Q: <the question> || EV: <the copied sentence>',
  ].join('\n')

  try {
    // Synchronous /ask, like the production answers, but on the box's fast
    // non-reasoning model rather than its default. The BYOK default
    // (deepseek-v4-flash) is a reasoning model: on this task it spends the
    // box's whole 1600-token output budget thinking and returns an empty
    // answer (verified live — `reasoning` full, `answer` empty, per-request
    // max_tokens does not lift the box cap). flash-lite is the box's proven
    // rollback model; NOTE it generates platform-side, not via the OpenRouter
    // key, so these calls can show up in ARAG platform token burn.
    // The platform still retrieves against the prompt; that context is
    // incidental and the grounding filter below only trusts OUR passages.
    const res = await kbFetch(env, '/ask', {
      body: { query: prompt, top_k: 5, max_tokens: 4096, generative_model: 'gemini-2.5-flash-lite' },
      headers: { 'x-synchronous': 'true' },
    })
    if (!res.ok) return json({ questions: [] })
    const data = (await res.json()) as { answer?: string }
    const candidates = parseFollowUpLines(data.answer ?? '')
    return json({ questions: selectFollowUps(candidates, question, clean, context) })
  } catch {
    return json({ questions: [] })
  }
}

async function apiResource(slug: string, env: Env): Promise<Response> {
  if (!isPublicSlug(slug)) return json({ error: 'bad slug' }, 400)
  const res = await kbFetch(
    env,
    `/slug/${slug}?show=basic&show=origin&show=extra&show=values&show=extracted&extracted=text`,
  )
  if (res.status === 404) return json({ error: 'not found' }, 404)
  if (!res.ok) return json({ error: `resource fetch failed (${res.status})` }, 502)
  const r = (await res.json()) as {
    title?: string
    origin?: { collaborators?: string[]; url?: string }
    usermetadata?: { classifications?: { labelset: string; label: string }[] }
    computedmetadata?: {
      field_classifications?: { classifications?: { labelset: string; label: string }[] }[]
    }
    extra?: { metadata?: Record<string, unknown> }
    data?: { texts?: Record<string, { value?: { body?: string } }> }
  }
  // Reassemble split bodies (body, body-1, body-2...) in order.
  const texts = r.data?.texts ?? {}
  const bodyText = Object.keys(texts)
    .filter((k) => k === 'body' || k.startsWith('body-'))
    .sort((a, b) => (a === 'body' ? -1 : b === 'body' ? 1 : a.localeCompare(b, undefined, { numeric: true })))
    .map((k) => texts[k]?.value?.body ?? '')
    .join('')
  const labels: Record<string, string> = {}
  for (const c of r.usermetadata?.classifications ?? []) labels[c.labelset] = c.label
  // Topic labels are written by the enrichment task at the FIELD level
  // (computedmetadata.field_classifications — the level the /find topic
  // filter matches), never resource usermetadata, and a speech can carry
  // several. Kept out of `labels` (single-value by shape) on purpose.
  const topics: string[] = []
  for (const fc of r.computedmetadata?.field_classifications ?? []) {
    for (const c of fc.classifications ?? []) {
      if (c.labelset === 'topic' && !topics.includes(c.label)) topics.push(c.label)
    }
  }
  // Machine summary written by the enrichment pass (ask-task, destination
  // "summary"): lands as the text field "da-summary-t-body". Optional.
  const brief = texts['da-summary-t-body']?.value?.body?.trim() || null
  return json({
    slug,
    title: r.title ?? slug,
    speaker: DIVISION_SLUG_RE.test(slug) ? null : (r.origin?.collaborators?.[0] ?? null), // voters are not a speaker
    url: r.origin?.url ?? null,
    labels, // kind / source / party / state / chamber — for chips + provenance caveats
    topics, // machine topic labels (multi-label; empty until the pass reaches this doc)
    metadata: r.extra?.metadata ?? {},
    summary: brief,
    text: bodyText,
  })
}

async function apiStats(env: Env): Promise<Response> {
  const res = await kbFetch(env, '/counters')
  if (!res.ok) return json({ error: `counters failed (${res.status})` }, 502)
  return json(await res.json())
}

/**
 * News rail: two Australian-politics RSS feeds fetched server-side (the KB
 * pattern — the browser never talks to the outlets directly), parsed with a
 * tolerant regex scan because Workers have no DOMParser, and cached in
 * caches.default for 15 minutes so homepage traffic can't hammer the feeds.
 * Every failure mode degrades to {items: []} with 200 — the rail fails silent.
 * Each item carries a `topic`: a cleaned keyword seed for /ask and /search
 * (kickers like "Live:", quoted exclamations, outlet suffixes and filler words
 * stripped; the load-bearing nouns kept, in order).
 */
async function apiNews(): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request('https://opax.com.au/api/news')
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  // Order matters: CDATA first, numeric refs, then named — so a literal
  // "&amp;#39;" decodes to "&#39;" and no further.
  const decode = (s: string): string =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(
        /&(amp|lt|gt|quot|apos|nbsp);/g,
        (_, e: string) =>
          (({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }) as Record<string, string>)[e] ?? '',
      )

  const topicFrom = (title: string): string => {
    // Everything after " | " is outlet furniture (ABC News, Analysis, author).
    let t = title.split(/\s+\|\s+/)[0]
    t = t.replace(/\s*[–—-]\s*(ABC News|The Guardian|Guardian Australia)\s*$/i, '')
    const kicker =
      /^\s*(live|live updates?|analysis|opinion|exclusive|explainer|explained|breaking|watch|video|updated|in full|as it happened|australian politics live|politics live)\s*[:|–—-]\s*/i
    while (kicker.test(t)) t = t.replace(kicker, '')
    // "'It's a disgrace': Minister rejects..." — the quote is rhetoric, the
    // substance follows the colon.
    t = t.replace(/^\s*[‘'"“][^’'"”]{2,80}[’'"”]\s*[:,;–—-]\s*/, '')
    t = t.split(/\s+[–—-]\s+/)[0] // dashed subtitles ("– as it happened", "- podcast")
    t = t.replace(/([A-Za-z])[’']s\b/g, '$1') // possessives
    t = t.replace(/[‘’“”"']/g, '')
    const stop = new Set(
      (
        'a an the to of in on for and or but with at by from as is are was were be been being ' +
        'he she they them him his her hers their theirs we us our you your i me my ' +
        'it its this that these those will would could should can may might must have has had do does did not ' +
        'says say said tells told reveals revealed announces announced warns warned claims claimed denies denied ' +
        'calls called urges urged vows vowed after amid over into against due what why how when who whats live update updates news'
      ).split(' '),
    )
    const words = t
      .split(/\s+/)
      .map((w) => w.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}$%]+$/gu, ''))
      .filter(Boolean)
    const kept = words.filter((w) => !stop.has(w.toLowerCase()))
    // A stoplist that ate the whole headline means the headline WAS the topic.
    return (kept.length >= 2 ? kept : words).slice(0, 8).join(' ')
  }

  const feeds = [
    // 104217372 is ABC's Politics topic feed (51120 is "Just In" — all news).
    { source: 'ABC News', url: 'https://www.abc.net.au/news/feed/104217372/rss.xml' },
    { source: 'The Guardian', url: 'https://www.theguardian.com/australia-news/australian-politics/rss' },
  ]
  type NewsItem = { title: string; url: string; source: string; published: string | null; topic: string }
  const perFeed = await Promise.all(
    feeds.map(async (feed): Promise<NewsItem[]> => {
      try {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 8000)
        const res = await fetch(feed.url, {
          signal: ac.signal,
          headers: {
            accept: 'application/rss+xml, application/xml, text/xml, */*',
            'user-agent': 'OPAX-portal/1.0 (+https://opax.com.au)',
          },
        })
        clearTimeout(timer)
        if (!res.ok) return []
        const xml = await res.text()
        const out: NewsItem[] = []
        for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
          const block = m[1]
          const tag = (name: string): string => {
            const hit = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
            return hit ? decode(hit[1]).trim() : ''
          }
          const title = tag('title')
          const link = tag('link') || tag('guid')
          if (!title || !/^https?:\/\//.test(link)) continue
          const pub = Date.parse(tag('pubDate') || tag('dc:date'))
          out.push({
            title,
            url: link,
            source: feed.source,
            published: Number.isNaN(pub) ? null : new Date(pub).toISOString(),
            topic: topicFrom(title),
          })
        }
        return out
      } catch {
        return [] // one dead feed must not take the rail down
      }
    }),
  )

  const seen = new Set<string>()
  const items = perFeed
    .flat()
    .sort(
      (a, b) =>
        (b.published ? Date.parse(b.published) : 0) - (a.published ? Date.parse(a.published) : 0),
    )
    .filter((it) => {
      // Near-identical titles (syndication, "updated" reposts) collapse on a
      // normalised prefix.
      const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 72)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)

  const res = json({ fetched_at: new Date().toISOString(), items })
  if (items.length) {
    res.headers.set('cache-control', 'public, max-age=900')
    await cache.put(cacheKey, res.clone())
  }
  return res
}


/**
 * The newest documents to enter the index, straight from the KB catalog
 * (sort by platform `created` — the moment the resource was indexed, which
 * is exactly what "just added to the record" means while the bulk load runs
 * and after it, when parliaments publish). Cached for 5 minutes.
 */
async function apiRecent(env: Env): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request('https://opax.com.au/api/recent')
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  const res = await kbFetch(
    env,
    '/catalog?page_number=0&page_size=14&sort_field=created&sort_order=desc',
  )
  if (!res.ok) return json({ items: [], upstream: res.status, body: (await res.text()).slice(0, 200) })
  const data = (await res.json()) as {
    resources?: Record<string, { slug?: string; title?: string; created?: string }>
  }
  const items = Object.values(data.resources ?? {})
    .filter((r) => SLUG_RE.test(r.slug ?? ''))
    .map((r) => ({ slug: r.slug, title: r.title ?? r.slug, indexed: r.created ?? null }))
    .slice(0, 12)
  const out = json({ items })
  out.headers.set('cache-control', 'public, max-age=300')
  await cache.put(cacheKey, out.clone())
  return out
}

// --- topic pages ------------------------------------------------------------
// Live label counts from the enrichment pass. The labeller is MULTI-label and
// still running, so per-topic facet counts must never be summed into "speeches
// labelled" (a speech carrying three labels would count three times) and no
// number here is a corpus total — the client phrases everything as "so far".
// Verified live 2026-09-01: a faceted catalog call combined with `filters`
// returns the facet AND the filtered total in one request, and the BARE
// labelset path filters on "carries any label in this set".

const TOPIC_FILTER_PREFIX = '/classification.labels/topic'
const PARTY_FACET = '/classification.labels/party'

interface CatalogRow extends FindResource {
  created?: string
}

interface CatalogPage {
  resources?: Record<string, CatalogRow>
  fulltext?: { total?: number; facets?: Record<string, Record<string, number>> }
}

async function cachedJson(
  cachePath: string,
  build: () => Promise<Response>,
  maxAge = 600,
): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request(`https://opax.com.au${cachePath}`)
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  const out = await build()
  if (out.ok) {
    out.headers.set('cache-control', `public, max-age=${maxAge}`)
    await cache.put(cacheKey, out.clone())
  }
  return out
}

/** All 21 topics with live counts, plus how many speeches carry any topic label. */
async function apiTopics(env: Env): Promise<Response> {
  return cachedJson('/api/topics', async () => {
    const [facetedRes, anyRes] = await Promise.all([
      kbFetch(env, `/catalog?faceted=${TOPIC_FILTER_PREFIX}&page_size=0`),
      kbFetch(env, `/catalog?filters=${TOPIC_FILTER_PREFIX}&page_size=0`),
    ])
    if (!facetedRes.ok || !anyRes.ok) return json({ error: 'catalog failed' }, 502)
    const faceted = (await facetedRes.json()) as CatalogPage
    const any = (await anyRes.json()) as CatalogPage
    const facet = faceted.fulltext?.facets?.[TOPIC_FILTER_PREFIX] ?? {}
    const counts = new Map<string, number>()
    for (const [path, n] of Object.entries(facet)) {
      counts.set(path.slice(`${TOPIC_FILTER_PREFIX}/`.length), n)
    }
    // Every topic renders even before the pass reaches it — zero is honest.
    const topics = [...TOPIC_SLUGS].map((slug) => ({ slug, count: counts.get(slug) ?? 0 }))
    return json({ labelled: any.fulltext?.total ?? 0, topics })
  })
}

/**
 * One topic: total labelled so far (the filtered call's own total), per-party
 * split (facet within the topic filter — one request covers both, cheaper than
 * a faceted call per party), and the newest labelled speeches to enter the
 * index (apiRecent's pattern; catalog rows carry no machine summary, so none
 * is served — the client must not fetch per-doc to fill the gap).
 */
async function apiTopic(slug: string, env: Env): Promise<Response> {
  if (!TOPIC_SLUGS.has(slug)) return json({ error: 'unknown topic' }, 404)
  return cachedJson(`/api/topic/${slug}`, async () => {
    const filter = `filters=${TOPIC_FILTER_PREFIX}/${slug}`
    const [partyRes, newestRes, anyRes] = await Promise.all([
      kbFetch(env, `/catalog?faceted=${PARTY_FACET}&${filter}&page_size=0`),
      kbFetch(
        env,
        `/catalog?${filter}&sort_field=created&sort_order=desc&page_size=12&show=basic&show=origin&show=extra`,
      ),
      kbFetch(env, `/catalog?filters=${TOPIC_FILTER_PREFIX}&page_size=0`),
    ])
    if (!partyRes.ok || !newestRes.ok || !anyRes.ok) return json({ error: 'catalog failed' }, 502)
    const byParty = (await partyRes.json()) as CatalogPage
    const newest = (await newestRes.json()) as CatalogPage
    const any = (await anyRes.json()) as CatalogPage
    const partyFacet = byParty.fulltext?.facets?.[PARTY_FACET] ?? {}
    const parties = Object.entries(partyFacet)
      .map(([path, n]): [string, number] => [path.slice(`${PARTY_FACET}/`.length), n])
      .sort((a, b) => b[1] - a[1])
    const recent = Object.values(newest.resources ?? {})
      .filter((r) => SLUG_RE.test(r.slug ?? ''))
      .map((r) => ({
        slug: r.slug,
        title: r.title ?? r.slug,
        speaker: r.origin?.collaborators?.[0] ?? null,
        party: label(r, 'party'),
        state: label(r, 'state'),
        date: (r.extra?.metadata?.date as string) ?? null,
        indexed: r.created ?? null,
      }))
      .slice(0, 8)
    return json({
      slug,
      count: byParty.fulltext?.total ?? 0,
      labelled: any.fulltext?.total ?? 0,
      parties,
      recent,
    })
  })
}

/**
 * Party × topic matrix ("who owns which debate"): one faceted-party call per
 * topic — the verified faceted+filters shape returns the party split AND the
 * topic's filtered total together — plus the bare labelset total as the
 * honest denominator. 22 parallel requests, cached 15 minutes. Columns are
 * capped at the biggest parties; the long tail folds into "Other" (per-row
 * sums stay honest: a speech carries at most one party label). `totals` are
 * filtered totals, never facet sums, so multi-label speeches count once.
 */
const MATRIX_PARTY_CAP = 7

async function apiMatrix(env: Env): Promise<Response> {
  return cachedJson('/api/matrix', async () => {
    const slugs = [...TOPIC_SLUGS]
    // Workers cap simultaneous open connections at 6, and a response body
    // left unread counts as open — 22 parallel fetches died in production
    // with "Response closed due to connection limit" (local dev does not
    // enforce it). Fetch AND parse in batches of five.
    const parseCatalog = async (path: string): Promise<CatalogPage> => {
      const r = await kbFetch(env, path)
      if (!r.ok) throw new Error(`catalog ${r.status}`)
      return (await r.json()) as CatalogPage
    }
    const paths = [
      `/catalog?filters=${TOPIC_FILTER_PREFIX}&page_size=0`,
      ...slugs.map(
        (slug) => `/catalog?faceted=${PARTY_FACET}&filters=${TOPIC_FILTER_PREFIX}/${slug}&page_size=0`,
      ),
    ]
    const pagesAll: CatalogPage[] = []
    try {
      for (let i = 0; i < paths.length; i += 5) {
        pagesAll.push(...(await Promise.all(paths.slice(i, i + 5).map(parseCatalog))))
      }
    } catch {
      return json({ error: 'catalog failed' }, 502)
    }
    const [any, ...pages] = pagesAll

    const totals: Record<string, number> = {}
    const raw = new Map<string, Map<string, number>>()
    const partyTotals = new Map<string, number>()
    slugs.forEach((slug, i) => {
      totals[slug] = pages[i].fulltext?.total ?? 0
      const row = new Map<string, number>()
      for (const [path, n] of Object.entries(pages[i].fulltext?.facets?.[PARTY_FACET] ?? {})) {
        const party = path.slice(`${PARTY_FACET}/`.length)
        row.set(party, n)
        // Column ordering only — never surfaced as a count (a speech with
        // three topic labels lands in three rows of this sum).
        partyTotals.set(party, (partyTotals.get(party) ?? 0) + n)
      }
      raw.set(slug, row)
    })

    const ranked = [...partyTotals.entries()].sort((a, b) => b[1] - a[1])
    const major = ranked.slice(0, MATRIX_PARTY_CAP).map(([name]) => name)
    const folded = ranked.length > major.length
    const cells: Record<string, Record<string, number>> = {}
    for (const slug of slugs) {
      const row: Record<string, number> = {}
      let other = 0
      for (const [party, n] of raw.get(slug) ?? []) {
        if (major.includes(party)) row[party] = n
        else other += n
      }
      if (folded && other > 0) row.Other = other
      cells[slug] = row
    }
    return json({
      labelled: any.fulltext?.total ?? 0,
      parties: folded ? [...major, 'Other'] : major,
      cells,
      totals,
    })
  }, 900)
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/search' && request.method === 'GET') {
        return await apiSearch(url, env)
      }
      if (url.pathname === '/api/ask' && request.method === 'POST') {
        return await apiAsk(request, env, ctx)
      }
      if (url.pathname === '/api/followups' && request.method === 'POST') {
        return await apiFollowups(request, env)
      }
      // Speech/legal/news ids and composite division ids; apiResource validates the shape.
      const resourceMatch = url.pathname.match(/^\/api\/resource\/([a-z][a-z0-9-]*)$/)
      if (resourceMatch && request.method === 'GET') {
        return await apiResource(resourceMatch[1], env)
      }
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await apiStats(env)
      }
      if (url.pathname === '/api/recent' && request.method === 'GET') {
        return await apiRecent(env)
      }
      if (url.pathname === '/api/topics' && request.method === 'GET') {
        return await apiTopics(env)
      }
      const topicMatch = url.pathname.match(/^\/api\/topic\/([a-z][a-z-]*)$/)
      if (topicMatch && request.method === 'GET') {
        return await apiTopic(topicMatch[1], env)
      }
      if (url.pathname === '/api/matrix' && request.method === 'GET') {
        return await apiMatrix(env)
      }
      if (url.pathname === '/api/news' && request.method === 'GET') {
        return await apiNews()
      }
      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'not found' }, 404)
      }
      return await env.ASSETS.fetch(request)
    } catch (err) {
      console.log(JSON.stringify({ level: 'error', path: url.pathname, message: String(err) }))
      return json({ error: 'internal error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
