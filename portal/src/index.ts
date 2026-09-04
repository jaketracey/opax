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
  init?: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
): Promise<Response> {
  return fetch(`${ragBase(env)}${path}`, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      'x-nuclia-serviceaccount': `Bearer ${env.ARAG_KB_TOKEN}`,
      ...init?.headers,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init?.signal,
  })
}

// --- slow-platform guard -------------------------------------------------------
// The platform's retrieval step normally lands in 4-6 s but has stalled past
// Cloudflare's 100 s origin limit (a 524 on 2026-09-04 while a labelling task
// was loading the index). Waiting that out is the worst outcome: the reader
// sees "still digging" for two minutes and then an error. So an ask that has
// produced nothing at all within ASK_STALL_MS is abandoned and asked once more
// with lighter retrieval (no reranker, fewer passages) — a slightly plainer
// answer beats no answer. The refusal retry is bounded the same way: a
// second full ask is only worth it when the first one was quick.
const ASK_STALL_MS = 25_000
const ASK_SYNC_TIMEOUT_MS = 40_000
const ASK_RETRY_BUDGET_MS = 20_000
const lighterAsk = (body: Record<string, unknown>): Record<string, unknown> => ({ ...body, reranker: 'noop', top_k: 12 })

/** Snap a snippet window start back to the nearest preceding space. */
function lower_bound(text: string, at: number): number {
  const sp = text.lastIndexOf(' ', at)
  return sp > 0 ? sp + 1 : at
}

/** Squash mixed-scale /find scores into 0..1 so result ranking is comparable. */
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
// Response cache and rate limits (docs/STREAMING.md "Caching")
// ---------------------------------------------------------------------------
// Every /api/ask MISS is a paid generative call (15-40 s); the same questions
// come back all day (home chips, topic-page asks, the harness, the reports).
// Finished answers therefore live in caches.default under a synthetic URL
// keyed by a SHA-256 of the canonical ask input plus CACHE_EPOCH (wrangler
// vars; bumped whenever the corpus changes, so a stale record is never
// replayed). caches.default is PER COLO: a question warmed in Sydney is a
// MISS in Frankfurt. That is accepted — the traffic is Australian — and the
// warm script (scripts/warm_cache.py) runs from Australia.
//
// Only answers worth keeping are stored: not a refusal, non-empty, at least
// one cited source. Chat turns (`context`) are never cached — the answer
// depends on the conversation. `?nocache=1` or `x-opax-nocache: 1` skips the
// read (the harness measures the live model) but still writes.

const CACHE_ORIGIN = 'https://cache.opax.internal'
const ASK_CACHE_TTL = 7 * 24 * 3600
const SEARCH_CACHE_TTL = 600
/**
 * The retrieved window outlives the page responses built from it. A reader
 * working through nine pages would otherwise hit a fresh multi-second /find
 * the moment the ten minutes ran out, mid-paging. Correctness is not at stake:
 * the key carries CACHE_EPOCH, so a corpus change retires the window anyway.
 */
const SEARCH_WINDOW_CACHE_TTL = 3600
const RESOURCE_CACHE_TTL = 3600
// Follow-ups belong to the answer they were written from, and they are derived
// from it deterministically: the same question, answer and passages ask for the
// same follow-ups, and CACHE_EPOCH invalidates both together when the corpus
// moves. Held for a day against the answer's seven, a cached ask replayed on
// day two paid for a fresh model call every time. They expire together now.
const FOLLOWUPS_CACHE_TTL = ASK_CACHE_TTL
const STATS_CACHE_TTL = 300
const RECENT_CACHE_TTL = 300

type CacheStatus = 'HIT' | 'MISS' | 'BYPASS'

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A cache key that can never collide with a real route. */
const cacheRequest = (kind: string, id: string): Request => new Request(`${CACHE_ORIGIN}/${kind}/${id}`)

/** The caller wants the live upstream answer (reads skipped, writes kept). */
function cacheBypass(request: Request, url: URL): boolean {
  return url.searchParams.get('nocache') === '1' || request.headers.get('x-opax-nocache') === '1'
}

/**
 * Stamp the cache verdict on a response. A cache.match() result carries
 * immutable headers, so the body is re-wrapped; `browserCache: false` strips
 * the storage max-age for POST answers, which no browser should hold.
 */
function withCacheStatus(res: Response, status: CacheStatus, browserCache = true): Response {
  const out = new Response(res.body, res)
  out.headers.set('x-opax-cache', status)
  if (!browserCache) out.headers.delete('cache-control')
  return out
}

/** Store `res` for `maxAge` seconds off the request path (the clone is taken first). */
function cacheStore(ctx: ExecutionContext, key: Request, res: Response, maxAge: number): void {
  res.headers.set('cache-control', `public, max-age=${maxAge}`)
  res.headers.set('x-opax-cached-at', new Date().toISOString())
  ctx.waitUntil(caches.default.put(key, res.clone()))
}

/**
 * The Rate Limiting binding, keyed on the client IP. HITs never reach here,
 * so a hot question replayed from cache costs no quota. Fail OPEN: a limiter
 * outage (or a build without the binding) must not take the site down.
 */
async function rateLimited(limiter: RateLimit | undefined, request: Request): Promise<Response | null> {
  if (!limiter) return null
  try {
    const key = request.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success } = await limiter.limit({ key })
    if (success) return null
  } catch (err) {
    console.log(JSON.stringify({ level: 'warn', message: `rate limiter failed open: ${String(err)}` }))
    return null
  }
  const res = json({ error: 'Too many requests. Try again in a moment.' }, 429)
  res.headers.set('retry-after', '60')
  return res
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Paging, and why it looks like this. Probed against the live knowledge box
 * (2026-09-02) before it was designed:
 *
 *  - `top_k` is hard-capped at 200: 500 comes back 422 "Input should be less
 *    than or equal to 200". That is the deepest single retrieval available.
 *  - The request's `page_number` is a no-op. Sending 0, 1 and 2 returned the
 *    same 17 resources and the response echoed `page_number: 0` every time.
 *  - `search_after` IS a working forward cursor, but the batch it returns comes
 *    back with score_type BM25, not RERANKER: the reranker only runs over the
 *    first batch. Ordering and scores past the cursor are on a different scale
 *    from page one's, so paging into them would show the reader a relevance
 *    ranking that is not one. We do not chain it.
 *  - The response's `total` is the keyword index's paragraph OR-match count,
 *    not a result count: 38,845 for "Uluru Statement", 57,022 for a nonsense
 *    query, and 0 in semantic mode. It is never shown.
 *
 * So: one retrieval of the platform's maximum depth per query, deduped to
 * documents (200 paragraphs → typically 150-200 distinct documents), cached
 * whole, then sliced into pages here. `total` in our response is the size of
 * that window, and `truncated` says the window was full so the record holds
 * more. Both are true statements, which the platform's own `total` is not.
 */
const SEARCH_TOPK_MAX = 200 // /find rejects anything above this with a 422
const SEARCH_WINDOW_TOPK = 200 // retrieval depth once a caller pages
const SEARCH_PER_DEFAULT = 20
const SEARCH_PER_MAX = 200 // one request can still take the whole window (export)

interface SearchWindow {
  total: number
  truncated: boolean
  results: SearchResult[]
}

interface SearchResult {
  kind: string
  id: number | null
  slug: string
  resource: string
  title: string
  speaker: string | null
  party: string | null
  state: string | null
  date: string | null
  url: string | null
  snippet: string
  score: number
}

async function apiSearch(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const q = url.searchParams.get('q')?.trim()
  if (!q) return json({ error: 'q is required' }, 400)
  const paging = url.searchParams.has('page') || url.searchParams.has('per')
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page') ?? 1)) || 1)
  const per = Math.min(
    Math.max(1, Math.floor(Number(url.searchParams.get('per') ?? SEARCH_PER_DEFAULT)) || SEARCH_PER_DEFAULT),
    SEARCH_PER_MAX,
  )
  const sort = url.searchParams.get('sort') === 'newest' ? 'newest' : 'relevance'
  // Legacy callers (the person page, the time machine) pin their own depth and
  // never page; a pager asks for the full window so the count it prints is real.
  const topK = Math.min(
    Number(url.searchParams.get('top_k') ?? (paging ? SEARCH_WINDOW_TOPK : 20)) ||
      (paging ? SEARCH_WINDOW_TOPK : 20),
    SEARCH_TOPK_MAX,
  )
  // Two keys. The page key carries page/per/sort so page 2 can never be served
  // from page 1's entry; the window key drops them so paging and re-sorting
  // inside one result set costs no upstream call and no rate-limit quota.
  const keyParams = (drop: string[]) =>
    new URLSearchParams(
      [...url.searchParams.entries()]
        .filter(([k]) => !drop.includes(k))
        .sort(([a], [b]) => a.localeCompare(b)),
    ).toString()
  // The response schema includes a histogram of the whole cached retrieval
  // window. Version the page key so pre-histogram pages cannot hide it for a
  // cache lifetime after this change ships; the expensive window is reused.
  const pageKey = cacheRequest('search', await sha256Hex(`${env.CACHE_EPOCH}\nyears-v1\n${keyParams(['nocache'])}`))
  const windowKey = cacheRequest(
    'search-window',
    await sha256Hex(`${env.CACHE_EPOCH}\n${topK}\n${keyParams(['nocache', 'page', 'per', 'sort', 'top_k'])}`),
  )
  const bypass = cacheBypass(request, url)
  if (!bypass) {
    const hit = await caches.default.match(pageKey)
    if (hit) return withCacheStatus(hit, 'HIT')
  }

  const mode = url.searchParams.get('mode') ?? 'hybrid'
  const kind = url.searchParams.get('kind') ?? 'speech'

  let win: SearchWindow | null = null
  if (!bypass) {
    const cached = await caches.default.match(windowKey)
    if (cached) win = (await cached.json()) as SearchWindow
  }
  if (!win) {
    const limited = await rateLimited(env.SEARCH_LIMITER, request)
    if (limited) return limited
    win = await searchWindow(env, { q, mode, kind, topK, url })
    if (!win) return json({ error: 'find failed' }, 502)
    cacheStore(ctx, windowKey, json(win), SEARCH_WINDOW_CACHE_TTL)
  }

  const ordered =
    sort === 'newest'
      ? [...win.results].sort(
          (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.score - a.score,
        )
      : win.results
  const pageCount = Math.max(1, Math.ceil(ordered.length / per))
  const clamped = Math.min(page, pageCount)
  const rows = ordered.slice((clamped - 1) * per, clamped * per)
  const years: Record<string, number> = {}
  for (const row of win.results) {
    const year = row.date?.match(/^(\d{4})/)?.[1]
    if (year && Number(year) >= 1993 && Number(year) <= 2026) years[year] = (years[year] ?? 0) + 1
  }
  const out = json({
    query: q,
    mode,
    kind,
    sort,
    page: clamped,
    per_page: per,
    page_count: pageCount,
    // `total` is what retrieval reached, not what the record holds. When
    // `truncated` is true the record holds more; the UI must say so.
    total: ordered.length,
    truncated: win.truncated,
    years,
    count: rows.length,
    results: rows,
  })
  cacheStore(ctx, pageKey, out, SEARCH_CACHE_TTL)
  return withCacheStatus(out, bypass ? 'BYPASS' : 'MISS')
}

/** One /find at `topK` depth, deduped to documents and ranked by score. */
async function searchWindow(
  env: Env,
  opts: { q: string; mode: string; kind: string; topK: number; url: URL },
): Promise<SearchWindow | null> {
  const { q, mode, kind, topK, url } = opts
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
  if (!res.ok) return null
  const found = (await res.json()) as {
    resources?: Record<string, FindResource>
    best_matches?: unknown[]
  }

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
  // A full batch means retrieval hit its ceiling, not that the record is spent.
  return { total: results.length, truncated: (found.best_matches?.length ?? 0) >= topK, results }
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
        'Begin with the answer itself: do not explain how the passages are numbered, ordered or provided. ' +
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

type AskPayload = ReturnType<typeof askPayload>

/**
 * The canonical form of an ask, or null when it must not be cached (chat
 * history present). Mirrors what buildAskBody/filterExpression actually act
 * on: the question case-folded and whitespace-collapsed, kind as the filter
 * sees it ('all' and empty both mean no kind clause), the speaker as
 * canonicalSpeaker() sends it, topic only when the filter honours it, years
 * only when they are years. Anything else the client sends is noise here.
 */
function askCacheInput(input: AskInput, epoch: string): string | null {
  if (Array.isArray(input.context) && input.context.length > 0) return null
  const str = (s: string | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ')
  const yr = (s: string | undefined): string => (/^\d{4}$/.test(str(s)) ? str(s) : '')
  const kind = input.kind ?? 'speech'
  const topic = str(input.topic)
  return JSON.stringify({
    epoch,
    question: str(input.question).toLowerCase(),
    kind: kind && kind !== 'all' ? kind : 'all',
    speaker: str(input.speaker) ? canonicalSpeaker(input.speaker as string) : '',
    party: str(input.party),
    state: str(input.state),
    topic: TOPIC_SLUGS.has(topic) ? topic : '',
    from: yr(input.from),
    to: yr(input.to),
    // buildAskBody swaps in the custom prompt and the guidance turn on ANY
    // non-empty filter value, including ones filterExpression then discards
    // (an unknown topic, a "from" that is not a year). Two asks that differ
    // only there get different prompts, so the flag has to be in the key.
    filtered: [input.speaker, input.party, input.state, input.topic, input.from, input.to].some(
      (v) => (v ?? '').trim().length > 0,
    ),
  })
}

/** Worth keeping for a week: a real answer with at least one cited source. */
const cacheableAnswer = (p: AskPayload): boolean =>
  !isRefusal({ answer: p.answer }) && p.sources.some((s) => (s as { cited?: boolean }).cited === true)

/** Cut on word boundaries into pieces of about `size` characters; pieces concatenate to the input exactly. */
function chunkText(text: string, size: number): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(text.length, i + size)
    if (end < text.length) {
      const sp = text.lastIndexOf(' ', end)
      if (sp > i + size / 2) end = sp + 1
    }
    out.push(text.slice(i, end))
    i = end
  }
  return out
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
}

/**
 * Replay a cached answer as the stream contract the client already speaks
 * (docs/STREAMING.md): one `status`, the answer in a few `delta` pieces with
 * tiny pauses so the progressive renderer paints, then the stored payload
 * verbatim as `done`. The whole replay lands in well under a second.
 */
function replayCachedAsk(hit: Response, ctx: ExecutionContext): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const cachedAt = hit.headers.get('x-opax-cached-at')
  ctx.waitUntil(
    (async () => {
      const send = (event: string, data: unknown): Promise<void> =>
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      try {
        const payload = (await hit.json()) as AskPayload
        await send('status', { phase: 'cached', cached_at: cachedAt })
        for (const piece of chunkText(payload.answer, 300)) {
          await send('delta', { text: piece })
          await new Promise((r) => setTimeout(r, 30))
        }
        await send('done', payload)
      } catch {
        // The reader left mid-replay; nothing upstream to stop.
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
    headers: { ...SSE_HEADERS, 'x-opax-cache': 'HIT', ...(cachedAt ? { 'x-opax-cached-at': cachedAt } : {}) },
  })
}

async function apiAsk(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const input = ((await request.json().catch(() => ({}))) ?? {}) as AskInput
  if (!input.question?.trim()) return json({ error: 'question is required' }, 400)

  const url = new URL(request.url)
  const wantStream =
    url.searchParams.get('stream') === '1' ||
    (request.headers.get('accept') ?? '').includes('text/event-stream')

  // Cache first: a HIT costs neither a model call nor rate-limit quota.
  const keyText = askCacheInput(input, env.CACHE_EPOCH)
  const cacheKey = keyText ? cacheRequest('ask', await sha256Hex(keyText)) : null
  const bypass = cacheBypass(request, url)
  if (cacheKey && !bypass) {
    const hit = await caches.default.match(cacheKey)
    if (hit) return wantStream ? replayCachedAsk(hit, ctx) : withCacheStatus(hit, 'HIT', false)
  }
  const status: CacheStatus = bypass ? 'BYPASS' : 'MISS'
  const limited = await rateLimited(env.ASK_LIMITER, request)
  if (limited) return limited

  const body = buildAskBody(input)
  const store = (payload: AskPayload): void => {
    if (cacheKey && cacheableAnswer(payload)) cacheStore(ctx, cacheKey, json(payload), ASK_CACHE_TTL)
  }
  if (wantStream) return apiAskStream(body, env, ctx, { onDone: store, cacheStatus: status })

  const askOnce = async (b: Record<string, unknown>, timeoutMs: number): Promise<AskAnswer | Response> => {
    try {
      const res = await kbFetch(env, '/ask', { body: b, headers: { 'x-synchronous': 'true' }, signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) return json({ error: `ask failed (${res.status})` }, 502)
      return (await res.json()) as AskAnswer
    } catch (err) {
      return json({ error: `ask failed (${err instanceof Error ? err.name : 'error'})` }, 504)
    }
  }
  const t0 = Date.now()
  let answer = await askOnce(body, ASK_SYNC_TIMEOUT_MS)
  // A stall or an upstream error gets one lighter attempt before the reader hears about it.
  if (answer instanceof Response) answer = await askOnce(lighterAsk(body), ASK_SYNC_TIMEOUT_MS)
  if (answer instanceof Response) return answer
  if (isRefusal(answer) && healthyRetrieval(answer) && Date.now() - t0 < ASK_RETRY_BUDGET_MS) {
    const again = await askOnce(body, ASK_SYNC_TIMEOUT_MS)
    if (!(again instanceof Response) && !isRefusal(again)) answer = again
  }
  const payload = askPayload(answer)
  store(payload)
  return withCacheStatus(json(payload), status, false)
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
  onProgress?: () => void,
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
    onProgress?.()
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

/** streamAskOnce under a stall timer: no item at all within stallMs aborts the attempt. */
async function streamAskGuarded(
  env: Env,
  body: Record<string, unknown>,
  send: SseSend,
  parent: AbortSignal,
  stallMs: number,
): Promise<AskAnswer> {
  const ac = new AbortController()
  const onParentAbort = (): void => ac.abort()
  parent.addEventListener('abort', onParentAbort)
  let progressed = false
  const timer = setTimeout(() => {
    if (!progressed) ac.abort()
  }, stallMs)
  try {
    return await streamAskOnce(env, body, send, ac.signal, () => {
      progressed = true
      clearTimeout(timer)
    })
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', onParentAbort)
  }
}

function apiAskStream(
  body: Record<string, unknown>,
  env: Env,
  ctx: ExecutionContext,
  opts: { onDone?: (payload: AskPayload) => void; cacheStatus: CacheStatus },
): Response {
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
        const t0 = Date.now()
        let result: AskAnswer
        try {
          result = await streamAskGuarded(env, body, send, upstream.signal, ASK_STALL_MS)
        } catch (err) {
          // The reader left: nothing to recover. Otherwise the platform stalled
          // or answered with an error status — one lighter attempt.
          if (clientGone || upstream.signal.aborted) throw err
          await send('retry', { reason: 'slow' })
          result = await streamAskGuarded(env, lighterAsk(body), send, upstream.signal, ASK_STALL_MS * 2)
        }
        // An empty answer is a reasoning burn whatever the retrieval; a
        // refusal is only retried over a healthy one (the sync rule) — and
        // only when the first attempt was quick enough that a second is
        // not what tips the reader into a two-minute wait.
        const quick = Date.now() - t0 < ASK_RETRY_BUDGET_MS
        if (isRefusal(result) && (quick || !(result.answer ?? '').trim()) && (healthyRetrieval(result) || !(result.answer ?? '').trim())) {
          await send('retry', { reason: (result.answer ?? '').trim() ? 'refusal' : 'empty' })
          const again = await streamAskOnce(env, body, send, upstream.signal)
          if (!isRefusal(again)) result = again
        }
        const payload = askPayload(result)
        await send('done', payload)
        // Cached from the `done` payload — the same bytes the reader got —
        // even when the reader left early (the answer was paid for).
        opts.onDone?.(payload)
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

  return new Response(readable, { headers: { ...SSE_HEADERS, 'x-opax-cache': opts.cacheStatus } })
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

async function apiFollowups(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

  // The input is the whole story (question, answer, passages): the same
  // answer asks for the same follow-ups. Cached a day; an ask HIT replays
  // the same answer, so its follow-ups are a HIT here too.
  const url = new URL(request.url)
  const cacheKey = cacheRequest(
    'followups',
    await sha256Hex(
      JSON.stringify({ epoch: env.CACHE_EPOCH, question: question.trim().toLowerCase(), answer: answer.trim(), passages: clean }),
    ),
  )
  const bypass = cacheBypass(request, url)
  if (!bypass) {
    const hit = await caches.default.match(cacheKey)
    if (hit) return withCacheStatus(hit, 'HIT', false)
  }
  const limited = await rateLimited(env.FOLLOWUPS_LIMITER, request)
  if (limited) return limited
  const cacheStatus: CacheStatus = bypass ? 'BYPASS' : 'MISS'

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
    if (!res.ok) return withCacheStatus(json({ questions: [] }), cacheStatus, false)
    const data = (await res.json()) as { answer?: string }
    const candidates = parseFollowUpLines(data.answer ?? '')
    const questions = selectFollowUps(candidates, question, clean, context)
    const out = json({ questions })
    // An empty list may be a model stumble — never pin that for a day.
    if (questions.length > 0) cacheStore(ctx, cacheKey, out, FOLLOWUPS_CACHE_TTL)
    return withCacheStatus(out, cacheStatus, false)
  } catch {
    return withCacheStatus(json({ questions: [] }), cacheStatus, false)
  }
}

/**
 * One document, cached an hour: summaries and topic labels arrive over time
 * from the enrichment passes, and an hour is the balance between a page
 * that costs a KB call and a page that lags the pass. 404s are not cached
 * (the doc may land in the next sync).
 */
async function apiResource(request: Request, url: URL, slug: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!isPublicSlug(slug)) return json({ error: 'bad slug' }, 400)
  const cacheKey = cacheRequest('resource', `${encodeURIComponent(env.CACHE_EPOCH)}/${slug}`)
  const bypass = cacheBypass(request, url)
  if (!bypass) {
    const hit = await caches.default.match(cacheKey)
    if (hit) return withCacheStatus(hit, 'HIT')
  }
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
  const out = json({
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
  cacheStore(ctx, cacheKey, out, RESOURCE_CACHE_TTL)
  return withCacheStatus(out, bypass ? 'BYPASS' : 'MISS')
}

/** KB counters for the front-page meter, cached 5 minutes. */
async function apiStats(env: Env): Promise<Response> {
  return cachedJson('/api/stats', async () => {
    const res = await kbFetch(env, '/counters')
    if (!res.ok) return json({ error: `counters failed (${res.status})` }, 502)
    return json(await res.json())
  }, STATS_CACHE_TTL)
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
  if (cached) return withCacheStatus(cached, 'HIT')

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
  return withCacheStatus(res, 'MISS')
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
  if (cached) return withCacheStatus(cached, 'HIT')
  const res = await kbFetch(
    env,
    '/catalog?page_number=0&page_size=14&sort_field=created&sort_order=desc',
  )
  if (!res.ok) {
    // The upstream body echoed the failing request back to the client. Log it,
    // serve an empty rail: a knowledge-box error is not the browser's business.
    // Not cached either: a stumble must not pin an empty rail for five minutes.
    console.error(
      JSON.stringify({
        level: 'error',
        path: '/api/recent',
        upstream: res.status,
        detail: (await res.text()).slice(0, 500),
      }),
    )
    return withCacheStatus(json({ items: [] }), 'MISS')
  }
  const data = (await res.json()) as {
    resources?: Record<string, { slug?: string; title?: string; created?: string }>
  }
  const items = Object.values(data.resources ?? {})
    .filter((r) => SLUG_RE.test(r.slug ?? ''))
    .map((r) => ({ slug: r.slug, title: r.title ?? r.slug, indexed: r.created ?? null }))
    .slice(0, 12)
  const out = json({ items })
  out.headers.set('cache-control', `public, max-age=${RECENT_CACHE_TTL}`)
  await cache.put(cacheKey, out.clone())
  return withCacheStatus(out, 'MISS')
}

/**
 * Machine summaries for a handful of resources at once, for list cards that
 * come from /find (which returns paragraphs, never the summary text field).
 * One small per-field KB call per rid — GET /resource/{rid}/text/da-summary-t-body
 * is ~500 bytes — never the whole resource. Rids without a summary (the pass
 * has not reached them) are simply absent from the answer. Up to 24 rids;
 * cached an hour on the sorted rid set.
 */
const BRIEF_MAX = 24
const RID_RE = /^[0-9a-f]{32}$/
async function apiBrief(url: URL, env: Env): Promise<Response> {
  const rids = [...new Set((url.searchParams.get('rids') ?? '').split(',').map((r) => r.trim()).filter((r) => RID_RE.test(r)))]
    .sort()
    .slice(0, BRIEF_MAX)
  if (!rids.length) return json({ briefs: {} })
  const cache = caches.default
  const cacheKey = new Request(`https://opax.com.au/api/brief?rids=${rids.join(',')}`)
  const cached = await cache.match(cacheKey)
  if (cached) return withCacheStatus(cached, 'HIT')
  const briefs: Record<string, string> = {}
  await Promise.all(
    rids.map(async (rid) => {
      try {
        const res = await kbFetch(env, `/resource/${rid}/text/da-summary-t-body`)
        if (!res.ok) return
        const data = (await res.json()) as { value?: { body?: string } }
        const body = data.value?.body?.trim()
        if (body) briefs[rid] = body
      } catch {
        /* a missing brief is not an error */
      }
    }),
  )
  const out = json({ briefs })
  out.headers.set('cache-control', 'public, max-age=3600')
  await cache.put(cacheKey, out.clone())
  return withCacheStatus(out, 'MISS')
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
const STATE_FACET = '/classification.labels/state'
const DECADE_FILTER_PREFIX = '/classification.labels/decade'
const SPEECH_FILTER = '/classification.labels/kind/speech'

interface CatalogRow extends FindResource {
  created?: string
}

interface CatalogPage {
  resources?: Record<string, CatalogRow>
  fulltext?: { total?: number; facets?: Record<string, Record<string, number>> }
}

/** Whole-route cache for the GET aggregates (no per-request input). X-OPAX-Cache says HIT or MISS. */
async function cachedJson(
  cachePath: string,
  build: () => Promise<Response>,
  maxAge = 600,
): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request(`https://opax.com.au${cachePath}`)
  const cached = await cache.match(cacheKey)
  if (cached) return withCacheStatus(cached, 'HIT')
  const out = await build()
  if (out.ok) {
    out.headers.set('cache-control', `public, max-age=${maxAge}`)
    await cache.put(cacheKey, out.clone())
  }
  return withCacheStatus(out, 'MISS')
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
 * Every party label in the record with its speech count, for the Parties
 * index. A speech carries at most one party label, so the facet counts are
 * whole speeches and `labelled` (the bare labelset filter's total) is their
 * honest denominator. Cached 10 minutes like /api/topics.
 */
async function apiParties(env: Env): Promise<Response> {
  return cachedJson('/api/parties', async () => {
    const [facetedRes, anyRes] = await Promise.all([
      kbFetch(env, `/catalog?faceted=${PARTY_FACET}&page_size=0`),
      kbFetch(env, `/catalog?filters=${PARTY_FACET}&page_size=0`),
    ])
    if (!facetedRes.ok || !anyRes.ok) return json({ error: 'catalog failed' }, 502)
    const faceted = (await facetedRes.json()) as CatalogPage
    const any = (await anyRes.json()) as CatalogPage
    const facet = faceted.fulltext?.facets?.[PARTY_FACET] ?? {}
    const parties = Object.entries(facet)
      .map(([path, count]) => ({ label: path.slice(`${PARTY_FACET}/`.length), count }))
      .filter((p) => p.label && p.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    return json({ labelled: any.fulltext?.total ?? 0, parties })
  })
}

/**
 * One topic: total labelled so far (the filtered call's own total), per-party
 * split (facet within the topic filter — one request covers both, cheaper than
 * a faceted call per party), the topic's share of each parliament's labelled
 * record. Speech chronology comes from /find, whose metadata date is the
 * speech date; catalog `created` is only index time and is never used here.
 */
async function apiTopic(slug: string, env: Env): Promise<Response> {
  if (!TOPIC_SLUGS.has(slug)) return json({ error: 'unknown topic' }, 404)
  return cachedJson(`/api/topic/${slug}`, async () => {
    const filter = `filters=${TOPIC_FILTER_PREFIX}/${slug}`
    const [partyRes, anyRes, stateRes, stateTotalsRes] = await Promise.all([
      kbFetch(env, `/catalog?faceted=${PARTY_FACET}&${filter}&page_size=0`),
      kbFetch(env, `/catalog?filters=${TOPIC_FILTER_PREFIX}&page_size=0`),
      kbFetch(env, `/catalog?faceted=${STATE_FACET}&${filter}&page_size=0`),
      kbFetch(env, `/catalog?faceted=${STATE_FACET}&filters=${TOPIC_FILTER_PREFIX}&page_size=0`),
    ])
    if (!partyRes.ok || !anyRes.ok || !stateRes.ok || !stateTotalsRes.ok) {
      return json({ error: 'catalog failed' }, 502)
    }
    const byParty = (await partyRes.json()) as CatalogPage
    const any = (await anyRes.json()) as CatalogPage
    const byState = (await stateRes.json()) as CatalogPage
    const stateTotals = (await stateTotalsRes.json()) as CatalogPage
    const partyFacet = byParty.fulltext?.facets?.[PARTY_FACET] ?? {}
    const parties = Object.entries(partyFacet)
      .map(([path, n]): [string, number] => [path.slice(`${PARTY_FACET}/`.length), n])
      .sort((a, b) => b[1] - a[1])
    const labelledByState = stateTotals.fulltext?.facets?.[STATE_FACET] ?? {}
    const states = Object.entries(byState.fulltext?.facets?.[STATE_FACET] ?? {})
      .map(([path, count]): [string, number, number] => {
        const state = path.slice(`${STATE_FACET}/`.length)
        const labelled = labelledByState[`${STATE_FACET}/${state}`] ?? 0
        return [state, count, labelled > 0 ? count / labelled : 0]
      })
      .filter(([state, count]) => Boolean(state) && count > 0)
      .sort((a, b) => b[2] - a[2] || b[1] - a[1] || a[0].localeCompare(b[0]))
    return json({
      slug,
      count: byParty.fulltext?.total ?? 0,
      labelled: any.fulltext?.total ?? 0,
      parties,
      states,
    })
  })
}

const TIDE_DECADES = [
  { slug: '1990s', label: '1993–99', from: 1993, to: 1999 },
  { slug: '2000s', label: '2000s', from: 2000, to: 2009 },
  { slug: '2010s', label: '2010s', from: 2010, to: 2019 },
  { slug: '2020s', label: '2020–26', from: 2020, to: 2026 },
] as const

/**
 * Topic share and topic-label coverage by decade. Catalog `created` is index
 * time, so this endpoint only uses the decade labels written from speech dates
 * at ingest. Federal is the default comparable run; `scope=all` includes all
 * five parliaments and keeps its unequal source windows visible in coverage.
 */
async function apiTide(url: URL, env: Env): Promise<Response> {
  const scope = url.searchParams.get('scope') ?? 'federal'
  if (scope !== 'federal' && scope !== 'all') return json({ error: 'bad scope' }, 400)
  return cachedJson(`/api/tide?scope=${scope}`, async () => {
    const state = scope === 'federal' ? `&filters=${STATE_FACET}/federal` : ''
    const paths = TIDE_DECADES.flatMap((decade) => {
      const shared = `filters=${DECADE_FILTER_PREFIX}/${decade.slug}&filters=${SPEECH_FILTER}${state}&page_size=0`
      return [
        `/catalog?faceted=${TOPIC_FILTER_PREFIX}&${shared}`,
        `/catalog?filters=${TOPIC_FILTER_PREFIX}&${shared}`,
      ]
    })
    const parseCatalog = async (path: string): Promise<CatalogPage> => {
      const response = await kbFetch(env, path)
      if (!response.ok) throw new Error(`catalog ${response.status}`)
      return (await response.json()) as CatalogPage
    }
    const pages: CatalogPage[] = []
    try {
      // Fetch and consume in fives: an unread response holds one of the
      // Worker's six upstream connection slots open.
      for (let i = 0; i < paths.length; i += 5) {
        pages.push(...(await Promise.all(paths.slice(i, i + 5).map(parseCatalog))))
      }
    } catch {
      return json({ error: 'catalog failed' }, 502)
    }
    const decades = TIDE_DECADES.map((decade, i) => {
      const total = pages[i * 2].fulltext?.total ?? 0
      const labelled = pages[i * 2 + 1].fulltext?.total ?? 0
      return { ...decade, total, labelled, coverage: total > 0 ? labelled / total : 0 }
    })
    const topics: Record<string, Array<{ decade: string; count: number; share: number }>> = {}
    for (const slug of TOPIC_SLUGS) {
      topics[slug] = TIDE_DECADES.map((decade, i) => {
        const path = `${TOPIC_FILTER_PREFIX}/${slug}`
        const count = pages[i * 2].fulltext?.facets?.[TOPIC_FILTER_PREFIX]?.[path] ?? 0
        const labelled = decades[i].labelled
        return { decade: decade.slug, count, share: labelled > 0 ? count / labelled : 0 }
      })
    }
    return json({ scope, decades, topics })
  })
}

/** A person's topic mix overall and in the two comparable recent decades. */
async function apiPersonTopics(url: URL, env: Env): Promise<Response> {
  const raw = url.searchParams.get('name')?.trim() ?? ''
  if (!raw || raw.length > MAX_SPEAKER_CHARS || !NAME_RE.test(raw)) {
    return json({ error: 'bad name' }, 400)
  }
  const name = canonicalSpeaker(raw)
  return cachedJson(`/api/person-topics?name=${encodeURIComponent(name)}`, async () => {
    const collaborator = { prop: 'origin_collaborator', collaborator: name }
    const topic = { prop: 'label', labelset: 'topic' }
    const catalog = (clauses: Record<string, unknown>[], faceted = true) => kbFetch(env, '/catalog', {
      body: {
        filter_expression: { resource: clauses.length === 1 ? clauses[0] : { and: clauses } },
        ...(faceted ? { faceted: [TOPIC_FILTER_PREFIX] } : {}),
        page_size: 0,
      },
    })
    const [indexedRes, allRes, thenRes, nowRes] = await Promise.all([
      catalog([collaborator], false),
      catalog([collaborator, topic]),
      catalog([collaborator, topic, { prop: 'label', labelset: 'decade', label: '2010s' }]),
      catalog([collaborator, topic, { prop: 'label', labelset: 'decade', label: '2020s' }]),
    ])
    if (![indexedRes, allRes, thenRes, nowRes].every((response) => response.ok)) {
      return json({ error: 'catalog failed' }, 502)
    }
    const [indexed, all, then, now] = await Promise.all(
      [indexedRes, allRes, thenRes, nowRes].map(async (response) => (await response.json()) as CatalogPage),
    )
    const profile = (page: CatalogPage, label: string, from: number, to: number) => {
      const labelled = page.fulltext?.total ?? 0
      const facets = page.fulltext?.facets?.[TOPIC_FILTER_PREFIX] ?? {}
      const topics = [...TOPIC_SLUGS]
        .map((slug) => {
          const count = facets[`${TOPIC_FILTER_PREFIX}/${slug}`] ?? 0
          return { slug, count, share: labelled > 0 ? count / labelled : 0 }
        })
        .filter((row) => row.count > 0)
        .sort((a, b) => b.share - a.share || b.count - a.count || a.slug.localeCompare(b.slug))
      return { label, from, to, labelled, topics }
    }
    return json({
      name,
      indexed: indexed.fulltext?.total ?? 0,
      profiles: {
        all: profile(all, 'All years', 1993, 2026),
        then: profile(then, '2010s', 2010, 2019),
        now: profile(now, '2020–26', 2020, 2026),
      },
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
// SEO: real paths for the hash-routed app
//
// The frontend routes on the hash (#/subject/person/Name), which crawlers and
// link previews treat as one page. For GET requests on a known route PATH the
// Worker serves index.html with the head rewritten per route (title,
// description, canonical, Open Graph, Twitter card, JSON-LD) and, for entry
// pages, a small static block in <main> that app.js hides once it boots.
// app.js folds the path back into a hash before its first route(). Titles and
// descriptions come from the static data files the app itself reads
// (parliamentarians.json, graph/money*.json, reports/index.json) via the
// ASSETS binding; /doc/<slug> asks the KB with a hard time cap. Unknown paths
// still fall through to the assets layer. Home (/) is an asset hit that never
// reaches the Worker, so index.html carries the home page's tags statically.
// ---------------------------------------------------------------------------

const SITE_ORIGIN = 'https://opax.com.au'
const OG_IMAGE = `${SITE_ORIGIN}/og-default.png`
const SITE_TITLE = 'OPAX: ask what Australian politicians actually said'
const SITE_DESCRIPTION =
  'Ask questions of half a million Australian parliamentary speeches and see who funds the people doing the talking. Every answer cited to the official record.'

// Mirror of app.js TOPICS (scripts/arag_enrich.py is canonical for both).
const TOPIC_NAMES: Record<string, string> = {
  'gambling': 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'climate-environment': 'Climate & environment',
  'property-construction': 'Property & construction',
  'housing': 'Housing',
  'health': 'Health',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'defence-security': 'Defence & security',
  'agriculture': 'Agriculture',
  'unions-workplace': 'Unions & workplace',
  'immigration': 'Immigration',
  'indigenous-affairs': 'Indigenous affairs',
  'tax-budget': 'Tax & budget',
  'education': 'Education',
  'welfare-social': 'Welfare & social services',
  'integrity-democracy': 'Integrity & democracy',
  'infrastructure-transport': 'Infrastructure & transport',
  'justice-law': 'Justice & law',
  'foreign-affairs': 'Foreign affairs',
}

const STATE_NAMES: Record<string, string> = {
  federal: 'federal parliament', nsw: 'NSW parliament', vic: 'Victorian parliament',
  qld: 'Queensland parliament', sa: 'South Australian parliament',
}
const CHAMBER_NAMES: Record<string, string> = {
  representatives: 'House of Representatives', senate: 'Senate',
  assembly: 'Legislative Assembly', council: 'Legislative Council',
}
// The /subject/<dir> directories. app.js keeps its own copy for the client-side
// router and the crumb labels; the two lists have to name the same four kinds.
const DIRECTORY_KINDS: Record<string, string> = {
  person: 'Parliamentarians',
  party: 'Parties',
  donor: 'Donors',
  campaigner: 'Campaigners & third parties',
}
type DirectoryKind = 'person' | 'party' | 'donor' | 'campaigner'
const isDirectoryKind = (s: string): s is DirectoryKind => s in DIRECTORY_KINDS

// Static pages: title as app.js TITLES sets it, blurb from the masthead menus.
const STATIC_PAGES: Record<string, { title: string; description: string; query?: boolean }> = {
  ask: { title: SITE_TITLE, description: SITE_DESCRIPTION, query: true },
  search: {
    title: 'Search the record · OPAX',
    description: 'Search half a million Australian parliamentary speeches by keyword, speaker, party, state, topic and year. Every result links to the official record.',
    query: true,
  },
  money: {
    title: 'Money map · OPAX',
    description: 'Disclosed political donations as territory you can spin: 250 donors, 11 parties and 28 years of AEC returns, with Queensland and Victorian registers.',
    query: true,
  },
  reports: {
    title: 'Reports · OPAX',
    description: 'Standing investigations pairing the money with the words: climate, gambling, housing, immigration, First Nations and media ownership, every claim cited.',
  },
  explore: {
    title: 'Explore · OPAX',
    description: 'Play with the parliamentary record: the time machine, the record quiz, the donations ledger and the money map.',
  },
  chat: {
    title: 'Keep asking · OPAX',
    description: 'Follow-up questions on an answer from the Australian parliamentary record, each reply cited to the speeches it draws on.',
  },
  about: {
    title: 'About · OPAX',
    description: 'What OPAX is, what you can do here, and how answers are produced from the Australian parliamentary record and disclosed donations.',
  },
  methods: {
    title: 'Methods · OPAX',
    description: 'How the OPAX corpus is built from Hansard and electoral disclosures, its known limits, and how to cite an answer or a speech.',
  },
  stats: {
    title: 'Corpus stats · OPAX',
    description: 'Live counts for every collection in the OPAX index: speeches, divisions, legislation and news, by parliament and year.',
  },
  declared: {
    title: 'Just declared · OPAX',
    description: "The newest additions and deletions on parliamentarians' registers of interests, grouped by week, each entry linked to its register source.",
    query: true,
  },
  expenses: {
    title: 'What the expense categories mean · OPAX',
    description: 'Plain definitions of every parliamentary work expense category the Independent Parliamentary Expenses Authority publishes, from COMCAR and travel allowance to the private-plated vehicle.',
  },
}

type SeoRoute =
  | { kind: 'static'; page: keyof typeof STATIC_PAGES }
  | { kind: 'report'; slug: string }
  | { kind: 'index'; dir: DirectoryKind }
  | { kind: 'topics' }
  | { kind: 'topic'; slug: string }
  | { kind: 'subject'; dir: DirectoryKind; name: string }
  | { kind: 'doc'; slug: string }

interface PageMeta {
  title: string
  description: string
  canonical: string
  ogType: 'website' | 'article' | 'profile'
  status: number
  jsonLd: Record<string, unknown> | null
  prerender: string | null
}

// How long a /subject/<dir>/<name> segment may be. A person, a party or a donor
// is named in a few words; an AEC entity is named in its own registered legal
// title, and the longest on the register runs to 127 characters ("Transport
// Workers Union of Australia NSW QLD Interim Governance Branch formerly ...").
// The bound is still a bound, and sitemapXml applies the same one so it can
// never list a page this function would refuse.
const SUBJECT_NAME_MAX = 120
const CAMPAIGNER_NAME_MAX = 200

/** Route table for real paths. Trailing slashes tolerated, never canonical. */
function matchSeoRoute(url: URL): SeoRoute | null {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return null // an asset hit; index.html carries the home tags
  const segs = path.slice(1).split('/')
  let dec: string[]
  try {
    dec = segs.map((s) => decodeURIComponent(s))
  } catch {
    return null
  }
  if (segs.length === 1 && dec[0] in STATIC_PAGES) return { kind: 'static', page: dec[0] }
  if (dec[0] === 'reports' && /^[a-z][a-z0-9-]*$/.test(dec[1] ?? '')) {
    // /reports/<slug> and its section deep links /reports/<slug>/s/<n>
    if (segs.length === 2 || (segs.length === 4 && dec[2] === 's' && /^\d+$/.test(dec[3]))) {
      return { kind: 'report', slug: dec[1] }
    }
    return null
  }
  if (dec[0] === 'subject') {
    if (dec[1] === 'topic') {
      if (segs.length === 2) return { kind: 'topics' }
      if (segs.length === 3 && /^[a-z][a-z-]*$/.test(dec[2])) return { kind: 'topic', slug: dec[2] }
      return null
    }
    const dir = dec[1]
    if (isDirectoryKind(dir)) {
      if (segs.length === 2) return { kind: 'index', dir }
      const max = dir === 'campaigner' ? CAMPAIGNER_NAME_MAX : SUBJECT_NAME_MAX
      if (segs.length === 3 && dec[2].trim() && dec[2].length <= max) {
        return { kind: 'subject', dir, name: dec[2].trim() }
      }
    }
    return null
  }
  if (dec[0] === 'doc' && segs.length === 2 && /^[a-z][a-z0-9-]*$/.test(dec[1])) {
    return { kind: 'doc', slug: dec[1] }
  }
  return null
}

// --- static data via the ASSETS binding (memoised per isolate; a deploy
// replaces both the files and the isolates, so nothing here goes stale) -----

interface Person {
  name: string
  speeches: number
  party: string | null
  states: string[]
  chambers: string[]
  first: number | null
  last: number | null
  pid?: string
}
interface PeopleData { generated: string; people: Person[]; byName: Map<string, Person>; byFold: Map<string, Person> }

interface MoneyNode {
  id: string
  label: string
  kind: 'donor' | 'party'
  industry: string
  group: string
  total: number
  count: number
  firstYear: number
  lastYear: number
}
interface MoneyEntry extends MoneyNode { sourceShort: string; generated: string }
interface MoneyData { generated: string; donors: Map<string, MoneyEntry>; parties: Map<string, MoneyEntry> }

interface ReportEntry { slug: string; title: string; blurb: string; updated?: string }
interface ReportsData { reports: ReportEntry[]; bySlug: Map<string, ReportEntry> }

/** Reader-facing names for the four AEC registration classes. */
const CAMPAIGNER_LABELS: Record<string, string> = {
  associated_entity: 'Associated entity',
  third_party: 'Third party',
  significant_third_party: 'Significant third party',
  political_campaigner: 'Political campaigner',
}

/** One row of `entities.years`, in the column order the asset's meta declares. */
type CampaignerYear = [
  year: string,
  receipts: number | null,
  payments: number | null,
  debts: number | null,
  electoralExpenditure: number | null,
  giftsReceived: number | null,
]

interface CampaignerRaw {
  name: string
  kind: string
  associated_parties?: string[] | null
  abn?: string | null
  years?: CampaignerYear[] | null
  latest_year?: string | null
}

/** An amount and the year it was filed for. */
interface CampaignerFigure { amount: number; year: string }

/**
 * What a meta description and a sitemap row need, reduced at parse time. The
 * year tables are most of the 510 KB file and only the front end reads them,
 * so holding 701 of them for the life of the isolate would buy nothing.
 */
interface Campaigner {
  name: string
  kindLabel: string
  parties: string[]
  abn: string | null
  filings: number
  firstYear: string
  lastYear: string
  receipts: CampaignerFigure | null
  spent: CampaignerFigure | null
}
interface CampaignersData { generated: string; entities: Campaigner[]; byFold: Map<string, Campaigner> }

/** Names as typed vs as stored: curly apostrophes, doubled spaces, case. */
const foldName = (s: string): string =>
  s.normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

async function assetJson<T>(env: Env, path: string): Promise<T> {
  const res = await env.ASSETS.fetch(new Request(`${SITE_ORIGIN}${path}`))
  if (!res.ok) throw new Error(`asset ${path} ${res.status}`)
  return (await res.json()) as T
}

let peopleMemo: Promise<PeopleData> | null = null
function loadPeople(env: Env): Promise<PeopleData> {
  peopleMemo ??= assetJson<{ meta?: { generated?: string }; people: Person[] }>(env, '/parliamentarians.json')
    .then((raw) => {
      const byName = new Map<string, Person>()
      const byFold = new Map<string, Person>()
      for (const p of raw.people) {
        byName.set(p.name, p)
        const f = foldName(p.name)
        const prev = byFold.get(f)
        if (!prev || p.speeches > prev.speeches) byFold.set(f, p) // curly/straight twins: keep the fuller entry
      }
      return { generated: raw.meta?.generated ?? '', people: raw.people, byName, byFold }
    })
    .catch((err) => {
      peopleMemo = null
      throw err
    })
  return peopleMemo
}

let moneyMemo: Promise<MoneyData> | null = null
function loadMoney(env: Env): Promise<MoneyData> {
  moneyMemo ??= Promise.all(
    ['/graph/money.json', '/graph/money.qld.json', '/graph/money.vic.json'].map((p) =>
      assetJson<{ meta?: { generated?: string; sourceShort?: string }; nodes: MoneyNode[] }>(env, p),
    ),
  )
    .then((files) => {
      const donors = new Map<string, MoneyEntry>()
      const parties = new Map<string, MoneyEntry>()
      let generated = ''
      files.forEach((f, i) => {
        const sourceShort = f.meta?.sourceShort ?? 'AEC returns'
        const gen = f.meta?.generated ?? ''
        if (gen > generated) generated = gen
        for (const n of f.nodes) {
          const map = n.kind === 'party' ? parties : n.kind === 'donor' ? donors : null
          if (!map) continue
          const key = foldName(n.label)
          const prev = map.get(key)
          // Federal (first file) wins; a state-only node stands in otherwise.
          // Jurisdictions are never summed (see money.qld.json meta.not_summed).
          if (!prev || (i === 0 && prev.sourceShort !== 'AEC returns')) {
            map.set(key, { ...n, sourceShort, generated: gen })
          }
        }
      })
      return { generated, donors, parties }
    })
    .catch((err) => {
      moneyMemo = null
      throw err
    })
  return moneyMemo
}

/** A fixed column read defensively: a short row yields null, never undefined. */
function cell(row: readonly unknown[], i: number): number | null {
  const v = row[i]
  return typeof v === 'number' ? v : null
}

/**
 * The most recent year in which a column carries a figure. Entities on the way
 * off the register file a year of zeroes first, so the latest row is often a
 * nil return: reporting it as "$0 in 2019-20" says nothing about an entity that
 * spent real money the year before.
 */
function latestFigure(rows: CampaignerYear[], col: number): CampaignerFigure | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const amount = cell(rows[i], col)
    if (amount !== null && amount > 0) return { amount, year: rows[i][0] }
  }
  return null
}

let campaignersMemo: Promise<CampaignersData> | null = null
function loadCampaigners(env: Env): Promise<CampaignersData> {
  campaignersMemo ??= assetJson<{ meta?: { generated?: string }; entities?: CampaignerRaw[] }>(env, '/graph/campaigners.json')
    .then((raw) => {
      const entities: Campaigner[] = []
      const byFold = new Map<string, Campaigner>()
      for (const e of raw.entities ?? []) {
        if (!e?.name) continue
        // Sorted rather than assumed sorted: both the span and the latest
        // figure are read off the ends of this array and quoted to readers.
        const rows = (e.years ?? [])
          .filter((r) => Array.isArray(r) && typeof r[0] === 'string')
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        const entry: Campaigner = {
          name: e.name,
          // An unrecognised class still gets a page; it just gets a plain noun.
          kindLabel: CAMPAIGNER_LABELS[e.kind] ?? 'Registered political actor',
          parties: e.associated_parties ?? [],
          abn: e.abn ?? null,
          filings: rows.length,
          firstYear: rows[0]?.[0] ?? '',
          lastYear: e.latest_year ?? rows[rows.length - 1]?.[0] ?? '',
          receipts: latestFigure(rows, 1),
          spent: latestFigure(rows, 4),
        }
        entities.push(entry)
        const f = foldName(entry.name)
        const prev = byFold.get(f)
        if (!prev || entry.filings > prev.filings) byFold.set(f, entry) // twin spellings: keep the fuller entry
      }
      return { generated: raw.meta?.generated ?? '', entities, byFold }
    })
    .catch((err) => {
      campaignersMemo = null
      throw err
    })
  return campaignersMemo
}

let reportsMemo: Promise<ReportsData> | null = null
function loadReports(env: Env): Promise<ReportsData> {
  reportsMemo ??= assetJson<{ reports: ReportEntry[] }>(env, '/reports/index.json')
    .then((raw) => ({ reports: raw.reports, bySlug: new Map(raw.reports.map((r) => [r.slug, r])) }))
    .catch((err) => {
      reportsMemo = null
      throw err
    })
  return reportsMemo
}

// --- text helpers ------------------------------------------------------------

const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const escXml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string)

/** Meta descriptions: one line, no em dashes, at most `max` chars on a word boundary. */
function clip(s: string, max = 158): string {
  const one = s.replace(/\s+/g, ' ').replace(/—/g, ',').trim()
  if (one.length <= max) return one
  const cut = one.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,;:]$/, '')}…`
}

/**
 * A description ending on a full stop rather than an ellipsis: the facts first,
 * the invitation only when it fits. Names and totals vary in length, so the
 * tail is what gives way (Google shows about 155 characters).
 */
function withTail(facts: string, tail: string, max = 158): string {
  const one = clip(facts, max)
  return tail && one.length + 1 + tail.length <= max ? `${one} ${tail}` : one
}

const num = (n: number): string => n.toLocaleString('en-AU')
function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}
const years = (a: number | null | undefined, b: number | null | undefined): string =>
  a && b && a !== b ? `${a} to ${b}` : String(a || b || '')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function longDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return iso ?? ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}
const industryLabel = (ind: string): string => ind.replace(/_/g, ' ')
/** "Labor", then "Labor and LNP", then "Labor, LNP and the Greens". */
const andList = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
/** "2024-25" on its own when an entity filed only once. */
const yearSpan = (a: string, b: string): string => (a && b && a !== b ? `${a} to ${b}` : b || a)

const indexLinks = (): string =>
  `<p><a href="/subject/person">Parliamentarians</a> · <a href="/subject/party">Parties</a> · ` +
  `<a href="/subject/donor">Donors</a> · <a href="/subject/campaigner">Campaigners</a> · ` +
  `<a href="/subject/topic">Topics</a></p>`

function prerenderBlock(heading: string, sentence: string, kicker: string): string {
  return `<section id="prerender" class="wrap"><p class="kicker">${escHtml(kicker)}</p>` +
    `<h1>${escHtml(heading)}</h1><p>${escHtml(sentence)}</p>${indexLinks()}</section>`
}

/** Canonical for a route: the clean path, plus the query only where it names the page. */
function canonicalFor(url: URL, keepQuery: boolean): string {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  return `${SITE_ORIGIN}${path}${keepQuery && url.search ? url.search : ''}`
}

const publisher = { '@type': 'Organization', name: 'OPAX', url: SITE_ORIGIN, logo: `${SITE_ORIGIN}/favicon.svg` }

// --- per-route metadata -------------------------------------------------------

async function buildMeta(route: SeoRoute, url: URL, request: Request, env: Env, ctx: ExecutionContext): Promise<PageMeta> {
  const base = (over: Partial<PageMeta>): PageMeta => ({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    canonical: canonicalFor(url, false),
    ogType: 'website',
    status: 200,
    jsonLd: null,
    prerender: null,
    ...over,
  })

  switch (route.kind) {
    case 'static': {
      const page = STATIC_PAGES[route.page]
      const q = url.searchParams.get('q')?.trim()
      const canonical = canonicalFor(url, Boolean(page.query))
      if (route.page === 'ask' && q) {
        return base({
          title: clip(`${q} · OPAX`, 90),
          description: clip(`"${q}": an answer from the Australian parliamentary record, cited to the speeches it draws on, with the money behind the speakers.`),
          canonical,
        })
      }
      if (route.page === 'search' && q) {
        return base({
          title: clip(`Search: ${q} · OPAX`, 90),
          description: clip(`Speeches matching "${q}" in the Australian parliamentary record, with speaker, party, date and a link to the official source for each.`),
          canonical,
        })
      }
      return base({
        title: page.title,
        description: page.description,
        canonical,
        jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'OPAX', url: SITE_ORIGIN } },
      })
    }

    case 'report': {
      const reports = await loadReports(env)
      const r = reports.bySlug.get(route.slug)
      const canonical = `${SITE_ORIGIN}/reports/${route.slug}`
      if (!r) return base({ title: 'Report not found · OPAX', description: STATIC_PAGES.reports.description, canonical, status: 404 })
      const description = withTail(`${r.title}: ${r.blurb}`, 'A standing OPAX investigation, every claim cited.')
      return base({
        title: `${r.title} · Reports · OPAX`,
        description,
        canonical,
        ogType: 'article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: r.title,
          description: r.blurb,
          url: canonical,
          mainEntityOfPage: canonical,
          image: OG_IMAGE,
          ...(r.updated ? { dateModified: r.updated } : {}),
          author: publisher,
          publisher,
        },
        prerender: prerenderBlock(r.title, `${r.blurb} A standing OPAX investigation pairing disclosed donations with what was said in parliament, every claim cited to the record.`, 'Report'),
      })
    }

    case 'index': {
      const label = DIRECTORY_KINDS[route.dir]
      const canonical = canonicalFor(url, true)
      let description: string
      if (route.dir === 'person') {
        const people = await loadPeople(env).catch(() => null)
        description = clip(`Every parliamentarian in the OPAX record${people ? `: ${num(people.people.length)} speakers` : ''} since 1993, searchable by name, party and parliament, each with their speeches.`)
      } else if (route.dir === 'party') {
        description = 'Australian political parties in the record: speeches, members and disclosed receipts, party by party, from Hansard and electoral commission returns.'
      } else if (route.dir === 'campaigner') {
        const camp = await loadCampaigners(env).catch(() => null)
        // Sized to survive the 158-character clip with the count in place.
        description = clip(
          `The organisations that spend on Australian politics without donating: ${camp ? `${num(camp.entities.length)} ` : ''}associated entities, third parties and political campaigners on the AEC register.`,
        )
      } else {
        description = 'The largest disclosed political donors in Australia, by industry and by the parties they fund, from AEC, ECQ and VEC returns.'
      }
      return base({
        title: `${label} · OPAX`,
        description,
        canonical,
        jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${label} · OPAX`, description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'OPAX', url: SITE_ORIGIN } },
      })
    }

    case 'topics': {
      const description = 'Every debate in the Australian parliamentary record by subject: 21 topics with live speech counts, from gambling and housing to defence and tax.'
      return base({
        title: 'Topics A-Z · OPAX',
        description,
        jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Topics A-Z · OPAX', description, url: canonicalFor(url, false), isPartOf: { '@type': 'WebSite', name: 'OPAX', url: SITE_ORIGIN } },
      })
    }

    case 'topic': {
      const name = TOPIC_NAMES[route.slug]
      if (!name) return base({ title: 'Topic not found · OPAX', description: STATIC_PAGES.search.description, status: 404 })
      const lower = name.toLowerCase()
      const description = withTail(
        `Parliament on ${lower}: every speech labelled ${lower} in the Australian parliamentary record, split by party and by year.`,
        'Newest first, each with its source.',
      )
      const canonical = canonicalFor(url, false)
      return base({
        title: `${name} · Topics · OPAX`,
        description,
        canonical,
        jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${name} in the parliamentary record`, about: name, description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'OPAX', url: SITE_ORIGIN } },
        prerender: prerenderBlock(name, `Speeches on ${lower} in the Australian parliamentary record, by party and by year, with the newest labelled speeches and a link to the official source for each.`, 'Topic'),
      })
    }

    case 'subject':
      if (route.dir === 'person') return personMeta(route.name, url, env)
      if (route.dir === 'campaigner') return campaignerMeta(route.name, url, env)
      return moneySubjectMeta(route.dir, route.name, url, env)

    case 'doc':
      return docMeta(route.slug, url, request, env, ctx)
  }
}

async function personMeta(name: string, url: URL, env: Env): Promise<PageMeta> {
  const people = await loadPeople(env).catch(() => null)
  const p = people?.byName.get(name) ?? people?.byFold.get(foldName(name)) ?? null
  const display = p?.name ?? name
  const canonical = `${SITE_ORIGIN}/subject/person/${encodeURIComponent(display)}`
  const title = `${display} · OPAX`
  if (!p) {
    // Below the 5-speech floor of parliamentarians.json, or a name the record
    // spells differently. The app still tries the live index, so no 404 here.
    const description = clip(`${display} in the OPAX record of Australian parliamentary speeches and disclosed political donations.`)
    return { title, description, canonical, ogType: 'profile', status: 200, jsonLd: null, prerender: prerenderBlock(display, description, 'Parliamentarian') }
  }
  const where = p.chambers.length === 1 && CHAMBER_NAMES[p.chambers[0]]
    ? `${p.states.length === 1 && p.states[0] !== 'federal' ? `${STATE_NAMES[p.states[0]]?.replace(' parliament', '') ?? p.states[0]} ` : ''}${CHAMBER_NAMES[p.chambers[0]]}`
    : p.states.map((s) => STATE_NAMES[s] ?? s).join(' and ')
  const who = [p.party, where].filter(Boolean).join(', ')
  const facts = `${display}${who ? ` (${who})` : ''}: ${num(p.speeches)} speeches in the Australian parliamentary record, ${years(p.first, p.last)}.`
  const tail = 'What they said, and who funds them.'
  const federal = p.states.includes('federal')
  return {
    title,
    description: withTail(facts, tail),
    canonical,
    ogType: 'profile',
    status: 200,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: display,
      url: canonical,
      jobTitle: 'Parliamentarian',
      ...(p.party ? { memberOf: { '@type': 'Organization', name: p.party } } : {}),
      // app.js links the same APH search for federal people (no stable profile URL in the data).
      ...(federal ? { sameAs: [`https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=${encodeURIComponent(display)}`] } : {}),
    },
    prerender: prerenderBlock(display, `${facts} ${tail}`, 'Parliamentarian'),
  }
}

async function moneySubjectMeta(dir: 'party' | 'donor', name: string, url: URL, env: Env): Promise<PageMeta> {
  const [moneyData, people] = await Promise.all([loadMoney(env).catch(() => null), loadPeople(env).catch(() => null)])
  const node = (dir === 'party' ? moneyData?.parties : moneyData?.donors)?.get(foldName(name)) ?? null
  const display = node?.label ?? name
  const canonical = `${SITE_ORIGIN}/subject/${dir}/${encodeURIComponent(display)}`
  const title = `${display} · OPAX`
  let facts: string
  let tail = ''
  let ldType = 'Organization'
  if (dir === 'party') {
    const members = people?.people.filter((p) => p.party && foldName(p.party) === foldName(display)) ?? []
    const speeches = members.reduce((s, p) => s + p.speeches, 0)
    const parts: string[] = []
    if (members.length) parts.push(`${num(members.length)} parliamentarians and ${num(speeches)} speeches in the record`)
    if (node) parts.push(`${money(node.total)} in disclosed receipts, ${years(node.firstYear, node.lastYear)} (${node.sourceShort})`)
    if (parts.length) {
      facts = `${display}: ${parts.join('; ')}.`
      tail = 'What its members said, and who paid.'
    } else {
      facts = `${display} in the OPAX record of Australian parliamentary speeches and disclosed political donations.`
    }
  } else if (node) {
    ldType = node.industry === 'individual' ? 'Person' : 'Organization'
    const what = node.industry === 'individual' ? 'individual donor' : `${industryLabel(node.industry)} donor`
    facts = `${display}: disclosed political ${what}, ${money(node.total)} across ${num(node.count)} receipts, ${years(node.firstYear, node.lastYear)} (${node.sourceShort}).`
    tail = 'Which parties it funded.'
  } else {
    facts = `${display}: not among the top disclosed donors in the OPAX money data. Search the parliamentary record for mentions.`
  }
  const sentence = tail ? `${facts} ${tail}` : facts
  const description = withTail(facts, tail)
  return {
    title,
    description,
    canonical,
    ogType: 'profile',
    status: 200,
    jsonLd: { '@context': 'https://schema.org', '@type': ldType, name: display, url: canonical, description },
    prerender: prerenderBlock(display, sentence, dir === 'party' ? 'Political party' : 'Donor'),
  }
}

/**
 * /subject/campaigner/<name>. A donor page stays 200 for a name it cannot find
 * because money.json is a top-N cut and the app can still say something useful
 * about the rest. This roster is not a cut: it is the AEC register itself, so a
 * name absent from it names nothing and 404s. A roster that failed to LOAD is a
 * different case, and stays 200 rather than telling a crawler an entity that
 * exists does not.
 */
async function campaignerMeta(name: string, url: URL, env: Env): Promise<PageMeta> {
  const data = await loadCampaigners(env).catch(() => null)
  const c = data?.byFold.get(foldName(name)) ?? null
  const display = c?.name ?? name
  const canonical = `${SITE_ORIGIN}/subject/campaigner/${encodeURIComponent(display)}`
  // Registered legal names run to 127 characters. The h1, the canonical and the
  // JSON-LD carry the whole name; the title is the one place it has to give way,
  // and it gives way before the masthead does.
  const title = `${clip(display, 90)} · OPAX`
  if (!c) {
    if (!data) {
      const description = clip(`${display} in the OPAX record of AEC registered campaigners, third parties and associated entities.`)
      return { title, description, canonical, ogType: 'profile', status: 200, jsonLd: null, prerender: prerenderBlock(display, description, 'Campaigners & third parties') }
    }
    return {
      title: 'Campaigner not found · OPAX',
      description: clip(`${display} is not on the AEC register of associated entities, third parties, significant third parties and political campaigners.`),
      canonical,
      ogType: 'website',
      status: 404,
      jsonLd: null,
      prerender: null,
    }
  }
  const linked = c.parties.length ? ` linked to ${andList(c.parties.slice(0, 3))}` : ''
  const parts: string[] = []
  if (c.filings) parts.push(`${num(c.filings)} annual return${c.filings === 1 ? '' : 's'}, ${yearSpan(c.firstYear, c.lastYear)}`)
  // Third parties and campaigners are registered for what they spend; an
  // associated entity's return is about what it took in. Lead with whichever
  // number this one actually filed.
  const figure = c.spent ?? c.receipts
  if (figure) parts.push(`${money(figure.amount)} ${figure === c.spent ? 'in electoral expenditure' : 'received'} in ${figure.year}`)
  const facts = `${display}: ${c.kindLabel.toLowerCase()}${linked} on the AEC register${parts.length ? `; ${parts.join('; ')}` : ''}.`
  // True of all four classes: an associated entity reports what it took in,
  // a campaigner what it spent, and both file a return every year.
  const tail = 'Every return it filed, year by year.'
  const description = withTail(facts, tail)
  return {
    title,
    description,
    canonical,
    ogType: 'profile',
    status: 200,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: display,
      url: canonical,
      description,
      // The ABN is the one identifier that survives a rename or a rebrand.
      ...(c.abn ? { identifier: { '@type': 'PropertyValue', propertyID: 'ABN', value: c.abn } } : {}),
    },
    prerender: prerenderBlock(display, `${facts} ${tail}`, c.kindLabel),
  }
}

/** /doc/<slug>: the existing /api/resource logic under a hard time cap. */
async function docMeta(slug: string, url: URL, request: Request, env: Env, ctx: ExecutionContext): Promise<PageMeta> {
  const canonical = `${SITE_ORIGIN}/doc/${slug}`
  const generic: PageMeta = {
    title: 'From the record · OPAX',
    description: 'A document from the Australian parliamentary record on OPAX, with its speaker, date and a link to the official source.',
    canonical,
    ogType: 'article',
    status: 200,
    jsonLd: null,
    prerender: null,
  }
  if (!isPublicSlug(slug)) return { ...generic, title: 'Document not found · OPAX', status: 404 }
  let res: Response | null
  try {
    res = await Promise.race([
      apiResource(request, url, slug, env, ctx),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ])
  } catch {
    res = null
  }
  if (!res) return generic // KB slow or down: the app will fetch it itself
  if (res.status === 404) return { ...generic, title: 'Document not found · OPAX', status: 404 }
  if (!res.ok) return generic
  const r = (await res.json()) as {
    title: string
    speaker: string | null
    labels: Record<string, string>
    metadata: Record<string, unknown>
    summary: string | null
  }
  const date = typeof r.metadata.date === 'string' ? r.metadata.date : null
  const chamber = CHAMBER_NAMES[r.labels.chamber] ?? r.labels.chamber
  if (r.labels.kind === 'division' || DIVISION_SLUG_RE.test(slug)) {
    const ayes = r.metadata.ayes_count, noes = r.metadata.noes_count
    const bill = typeof r.metadata.bill_ref === 'string' ? r.metadata.bill_ref : ''
    const outcome = r.labels.result === 'affirmative' ? 'Passed' : r.labels.result === 'negative' ? 'Defeated' : ''
    const description = clip(
      `${chamber ?? 'Parliamentary'} division${date ? `, ${longDate(date)}` : ''}${bill ? `: ${bill}` : ''}. ` +
      `${outcome}${typeof ayes === 'number' && typeof noes === 'number' ? ` ${ayes} votes to ${noes}` : ''}. Who voted which way, on OPAX.`,
    )
    return {
      ...generic,
      // Division titles run long; trim the motion, never the masthead.
      title: `${clip(r.title, 90)} · OPAX`,
      description,
      jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: r.title, description, url: canonical, ...(date ? { datePublished: date } : {}), publisher },
    }
  }
  const speaker = r.speaker ?? 'Unknown speaker'
  const who = [r.labels.party, chamber].filter(Boolean).join(', ')
  const words = typeof r.metadata.word_count === 'number' ? `${num(r.metadata.word_count)} words` : 'a speech'
  const description = clip(
    r.summary?.trim() ||
      `Speech by ${speaker}${who ? ` (${who})` : ''}${date ? `, ${longDate(date)}` : ''}: ${words} from the official ${r.labels.state === 'federal' ? 'federal' : (r.labels.state ?? '').toUpperCase()} parliamentary record, on OPAX.`,
  )
  return {
    ...generic,
    title: `${speaker}${date ? `, ${longDate(date)}` : ''} · From the record · OPAX`,
    description,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: r.title,
      description,
      url: canonical,
      ...(date ? { datePublished: date } : {}),
      ...(r.speaker ? { author: { '@type': 'Person', name: r.speaker, url: `${SITE_ORIGIN}/subject/person/${encodeURIComponent(r.speaker)}` } } : {}),
      publisher,
    },
  }
}

// --- serving ------------------------------------------------------------------

class SetAttr {
  constructor(private attr: string, private value: string) {}
  element(el: Element) { el.setAttribute(this.attr, this.value) }
}
class SetText {
  constructor(private value: string) {}
  element(el: Element) { el.setInnerContent(this.value) }
}

async function serveSeoPage(route: SeoRoute, url: URL, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const [shell, meta] = await Promise.all([
    env.ASSETS.fetch(new Request(`${SITE_ORIGIN}/`)),
    buildMeta(route, url, request, env, ctx),
  ])
  if (!shell.ok) return shell
  // JSON-LD sits in a <script>: keep "</script>" from ever appearing in it.
  const ld = meta.jsonLd ? JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c') : null
  const rewriter = new HTMLRewriter()
    .on('title', new SetText(meta.title))
    .on('meta[name="description"]', new SetAttr('content', meta.description))
    .on('link[rel="canonical"]', new SetAttr('href', meta.canonical))
    .on('meta[property="og:title"]', new SetAttr('content', meta.title))
    .on('meta[property="og:description"]', new SetAttr('content', meta.description))
    .on('meta[property="og:url"]', new SetAttr('content', meta.canonical))
    .on('meta[property="og:type"]', new SetAttr('content', meta.ogType))
    .on('meta[name="twitter:title"]', new SetAttr('content', meta.title))
    .on('meta[name="twitter:description"]', new SetAttr('content', meta.description))
    .on('script#ld-page', {
      element(el) {
        if (ld) el.setInnerContent(ld, { html: true })
        else el.remove() // the WebSite block belongs to the home page only
      },
    })
    .on('head', {
      element(el) {
        if (meta.status === 404) el.append('<meta name="robots" content="noindex">', { html: true })
      },
    })
  if (meta.prerender) {
    rewriter.on('main', { element(el) { el.prepend(meta.prerender as string, { html: true }) } })
  }
  const out = rewriter.transform(shell)
  const headers = new Headers(out.headers)
  headers.delete('etag') // the asset's tag describes the unrewritten file
  headers.delete('content-length')
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('x-robots-tag', meta.status === 404 ? 'noindex' : 'all')
  return new Response(request.method === 'HEAD' ? null : out.body, { status: meta.status, headers })
}

function robotsTxt(): Response {
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /api/', '', `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ''].join('\n')
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
}

/** Every indexable page, rebuilt from the data files and cached a day. */
async function sitemapXml(env: Env): Promise<Response> {
  return cachedJson('/sitemap.xml', async () => {
    const [people, moneyData, reports, campaigners] = await Promise.all([
      loadPeople(env),
      loadMoney(env),
      loadReports(env),
      // The only optional one. A campaigners.json the exporter has not written
      // yet must cost the sitemap its campaigner rows, not the whole sitemap.
      loadCampaigners(env).catch(() => null),
    ])
    const rows: string[] = []
    const add = (path: string, lastmod?: string) => {
      const mod = lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''
      rows.push(`<url><loc>${escXml(`${SITE_ORIGIN}${path}`)}</loc>${mod}</url>`)
    }
    add('/')
    for (const page of ['search', 'money', 'reports', 'explore', 'about', 'methods', 'stats', 'expenses']) add(`/${page}`)
    for (const r of reports.reports) add(`/reports/${r.slug}`, r.updated)
    add('/subject/topic')
    for (const slug of Object.keys(TOPIC_NAMES)) add(`/subject/topic/${slug}`)
    for (const dir of ['person', 'party', 'donor', 'campaigner']) add(`/subject/${dir}`)
    // Parties: every label the money data or the people data knows.
    const partyLabels = new Map<string, string>()
    for (const n of moneyData.parties.values()) partyLabels.set(foldName(n.label), n.label)
    for (const p of people.people) if (p.party) partyLabels.set(foldName(p.party), partyLabels.get(foldName(p.party)) ?? p.party)
    for (const label of [...partyLabels.values()].sort()) add(`/subject/party/${encodeURIComponent(label)}`, moneyData.generated || people.generated)
    for (const p of people.people) add(`/subject/person/${encodeURIComponent(p.name)}`, people.generated)
    for (const n of moneyData.donors.values()) add(`/subject/donor/${encodeURIComponent(n.label)}`, n.generated || moneyData.generated)
    // byFold, not the raw list: two spellings of one name resolve to one page,
    // and the length bound is the one matchSeoRoute enforces, so nothing listed
    // here can 404 on the way the route was parsed.
    if (campaigners) {
      for (const c of campaigners.byFold.values()) {
        if (c.name.length > CAMPAIGNER_NAME_MAX) continue
        add(`/subject/campaigner/${encodeURIComponent(c.name)}`, campaigners.generated)
      }
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
  }, 86400)
}


// Router-level hardening
//
// Everything below is a wrapper around the route table: response headers, and
// the shape checks that keep untrusted input out of the upstream KB call. The
// handlers themselves are untouched, so this stays mergeable alongside the
// per-route caching and SEO work.
// ---------------------------------------------------------------------------

/**
 * Sent on every response this Worker produces. public/_headers carries the
 * same set for responses the asset server produces on its own — which, while
 * run_worker_first is scoped to /api/*, is every non-API request. The two
 * lists must stay in step; docs/HARDENING.md explains each line.
 */
const BASE_SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
}

// Derived from what the app actually loads (see docs/HARDENING.md for the
// inventory). No 'unsafe-inline' and no 'unsafe-eval' for scripts: index.html
// carries only <script src> tags, and nothing in the bundle eval()s. Styles
// need 'unsafe-inline' because every module injects its own <style> element
// and app.js sets style="" attributes on chart and bar dimensions — neither is a
// script-execution vector. Fonts are self-hosted, so no third-party origin.
//
// The googletagmanager/google-analytics origins are for Tag Manager container
// GTM-PNDM87LW, loaded by the same-origin /gtm.js. They are enumerated, not
// wildcarded to "anything Google": a tag added later through the Tag Manager
// UI that reaches a host not listed here WILL be silently blocked, and the fix
// is to add that host — never to loosen script-src. docs/HARDENING.md explains
// why that trade is the right way round.
const GTM = 'https://www.googletagmanager.com'
const GA = 'https://*.google-analytics.com https://*.analytics.google.com'
const CSP_PAGE = [
  "default-src 'self'",
  `script-src 'self' ${GTM}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' ${GTM} ${GA}`,
  "font-src 'self'",
  `connect-src 'self' ${GTM} ${GA}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  `frame-src ${GTM}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// A JSON or SSE body is never a document, so it needs to load nothing at all.
const CSP_API = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// Statuses whose Response must be constructed with a null body.
const NULL_BODY_STATUS = new Set([101, 204, 205, 304])

// Routes with nothing cacheable in them: an answer to one question, or one
// query's result set. Every other /api route is the caching work's to own, so
// its Cache-Control is left exactly as the handler returned it — and even here
// a handler that sets its own (the SSE stream does) wins.
const NO_STORE_PATHS = new Set(['/api/ask', '/api/followups', '/api/search'])

function withSecurityHeaders(res: Response, url: URL): Response {
  const isApi = url.pathname.startsWith('/api/')
  // Responses from the ASSETS binding are immutable; re-wrap to edit headers.
  // res.body is passed through unread, so SSE keeps streaming.
  const out = new Response(NULL_BODY_STATUS.has(res.status) ? null : res.body, res)
  for (const [k, v] of Object.entries(BASE_SECURITY_HEADERS)) out.headers.set(k, v)
  out.headers.set('content-security-policy', isApi ? CSP_API : CSP_PAGE)
  if (NO_STORE_PATHS.has(url.pathname) && !out.headers.has('cache-control')) {
    out.headers.set('cache-control', 'no-store')
  }
  return out
}

// --- request validation ------------------------------------------------------

const MAX_BODY_BYTES = 16 * 1024
const MAX_QUESTION_CHARS = 2000
const MAX_SPEAKER_CHARS = 120
const MAX_PARTY_CHARS = 64
// A sanity window, deliberately wider than the corpus (1993-) so extending it
// backwards never needs a Worker change. filterExpression still requires \d{4}.
const MIN_YEAR = 1900
const MAX_YEAR = 2100

const KINDS = new Set(['speech', 'legal', 'news', 'division', 'all'])
const STATES = new Set(['federal', 'nsw', 'vic', 'sa', 'qld'])
const MODES = new Set(['hybrid', 'semantic', 'keyword'])
// Party labels are the KB's own facet values (served by /api/parties) and grow
// with the corpus, so this is a shape check rather than a value enum: it keeps
// anything that is not a plausible party name out of the filter expression
// without breaking the encyclopedia the day a new party is indexed.
const NAME_RE = /^[\p{L}\p{N} .,'’&()\/-]+$/u

const FILTER_KEYS = ['kind', 'speaker', 'party', 'state', 'topic', 'from', 'to'] as const

/** Allow-list every filter value. Returns a client-safe message, or null. */
function validateFilters(get: (key: string) => unknown): string | null {
  for (const key of FILTER_KEYS) {
    const raw = get(key)
    if (raw === undefined || raw === null) continue
    if (typeof raw !== 'string') return `${key} must be a string`
    const v = raw.trim()
    if (!v) continue
    switch (key) {
      case 'kind':
        if (!KINDS.has(v)) return 'unknown kind'
        break
      case 'state':
        if (!STATES.has(v)) return 'unknown state'
        break
      case 'topic':
        if (!TOPIC_SLUGS.has(v)) return 'unknown topic'
        break
      case 'party':
        if (v.length > MAX_PARTY_CHARS || !NAME_RE.test(v)) return 'bad party'
        break
      case 'speaker':
        if (v.length > MAX_SPEAKER_CHARS || !NAME_RE.test(v)) return 'bad speaker'
        break
      case 'from':
      case 'to': {
        if (!/^\d{4}$/.test(v)) return `${key} must be a four-digit year`
        const year = Number(v)
        if (year < MIN_YEAR || year > MAX_YEAR) return `${key} is out of range`
        break
      }
    }
  }
  return null
}

function validateSearchQuery(url: URL): Response | null {
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (!q) return json({ error: 'q is required' }, 400)
  if (q.length > MAX_QUESTION_CHARS) {
    return json({ error: `q must be ${MAX_QUESTION_CHARS} characters or fewer` }, 400)
  }
  const mode = url.searchParams.get('mode')
  if (mode && !MODES.has(mode)) return json({ error: 'unknown mode' }, 400)
  // Paging: whole positive numbers only. `page` is clamped to the last page
  // rather than rejected, so a stale &page=9 link still lands somewhere real.
  for (const k of ['page', 'per', 'top_k']) {
    const raw = url.searchParams.get(k)
    if (raw === null) continue
    if (!/^\d{1,4}$/.test(raw) || Number(raw) < 1) return json({ error: `${k} must be a whole number` }, 400)
  }
  const sort = url.searchParams.get('sort')
  if (sort && sort !== 'relevance' && sort !== 'newest') return json({ error: 'unknown sort' }, 400)
  const err = validateFilters((k) => url.searchParams.get(k))
  return err ? json({ error: err }, 400) : null
}

/**
 * Read a POST body under a hard cap, insist it is JSON, and hand back both the
 * parsed object (for validation here) and the raw text (to rebuild the request
 * the handler will re-parse). Buffering is the point: it is what bounds the
 * body, and 16 KB is an order of magnitude more than the biggest legitimate
 * ask — a 2,000-char question plus 24 turns of clipped context.
 */
async function readJsonBody(
  request: Request,
): Promise<{ text: string; value: Record<string, unknown> } | Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') {
    return json({ error: 'expected content-type: application/json' }, 415)
  }
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: 'request body too large' }, 413)
  }
  const raw = await request.arrayBuffer()
  if (raw.byteLength > MAX_BODY_BYTES) return json({ error: 'request body too large' }, 413)
  const text = new TextDecoder().decode(raw)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return json({ error: 'body is not valid JSON' }, 400)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return json({ error: 'body must be a JSON object' }, 400)
  }
  return { text, value: value as Record<string, unknown> }
}

/** Rebuild a consumed POST so the handler can call request.json() as before. */
const replayPost = (request: Request, body: string) =>
  new Request(request.url, { method: 'POST', headers: request.headers, body })

// ---------------------------------------------------------------------------

async function route(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // The route table keeps the indentation it had inside the old fetch handler,
  // held by this block, so the caching and SEO work landing on these same lines
  // merges line-by-line instead of conflicting on the whole hunk.
  {
      if (url.pathname === '/api/search' && request.method === 'GET') {
        return validateSearchQuery(url) ?? (await apiSearch(request, url, env, ctx))
      }
      if (url.pathname === '/api/ask' && request.method === 'POST') {
        const body = await readJsonBody(request)
        if (body instanceof Response) return body
        const question = body.value.question
        if (typeof question !== 'string' || !question.trim()) {
          return json({ error: 'question is required' }, 400)
        }
        if (question.length > MAX_QUESTION_CHARS) {
          return json({ error: `question must be ${MAX_QUESTION_CHARS} characters or fewer` }, 400)
        }
        const bad = validateFilters((k) => body.value[k])
        if (bad) return json({ error: bad }, 400)
        return await apiAsk(replayPost(request, body.text), env, ctx)
      }
      if (url.pathname === '/api/followups' && request.method === 'POST') {
        const body = await readJsonBody(request)
        if (body instanceof Response) return body
        return await apiFollowups(replayPost(request, body.text), env, ctx)
      }
      // Speech/legal/news ids and composite division ids; apiResource validates the shape.
      const resourceMatch = url.pathname.match(/^\/api\/resource\/([a-z][a-z0-9-]*)$/)
      if (resourceMatch && request.method === 'GET') {
        return await apiResource(request, url, resourceMatch[1], env, ctx)
      }
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await apiStats(env)
      }
      if (url.pathname === '/api/recent' && request.method === 'GET') {
        return await apiRecent(env)
      }
      if (url.pathname === '/api/brief' && request.method === 'GET') {
        return await apiBrief(url, env)
      }
      if (url.pathname === '/api/topics' && request.method === 'GET') {
        return await apiTopics(env)
      }
      if (url.pathname === '/api/parties' && request.method === 'GET') {
        return await apiParties(env)
      }
      const topicMatch = url.pathname.match(/^\/api\/topic\/([a-z][a-z-]*)$/)
      if (topicMatch && request.method === 'GET') {
        return await apiTopic(topicMatch[1], env)
      }
      if (url.pathname === '/api/tide' && request.method === 'GET') {
        return await apiTide(url, env)
      }
      if (url.pathname === '/api/person-topics' && request.method === 'GET') {
        return await apiPersonTopics(url, env)
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
      // Real paths for the hash-routed app (see the SEO section): only paths
      // no asset answers reach here, so index.html itself is never rewritten.
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (url.pathname === '/sitemap.xml') return await sitemapXml(env)
        if (url.pathname === '/robots.txt') return robotsTxt()
        const seoRoute = matchSeoRoute(url)
        if (seoRoute) return await serveSeoPage(seoRoute, url, request, env, ctx)
      }
      return await env.ASSETS.fetch(request)
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    const isApi = url.pathname.startsWith('/api/')
    try {
      // The route table only matches GET, so a HEAD (curl -I, uptime probes)
      // used to fall through to the 404. Run it as a GET and drop the body.
      if (isApi && request.method === 'HEAD') {
        const got = await route(
          new Request(url.toString(), { method: 'GET', headers: request.headers }),
          url,
          env,
          ctx,
        )
        return withSecurityHeaders(new Response(null, got), url)
      }
      return withSecurityHeaders(await route(request, url, env, ctx), url)
    } catch (err) {
      // The detail goes to the log, never to the client: upstream error text
      // can carry request echoes and internal identifiers.
      console.error(JSON.stringify({ level: 'error', path: url.pathname, message: String(err) }))
      return withSecurityHeaders(json({ error: 'internal error' }, 500), url)
    }
  },
} satisfies ExportedHandler<Env>
