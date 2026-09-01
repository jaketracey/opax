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
  if (kind !== 'all') {
    body.filter_expression = { field: { prop: 'label', labelset: 'kind', label: kind } }
  }

  const res = await kbFetch(env, '/find', { body })
  if (!res.ok) return json({ error: `find failed (${res.status})` }, 502)
  const found = (await res.json()) as { resources?: Record<string, FindResource> }

  const results = Object.entries(found.resources ?? {}).map(([rid, resource]) => {
    const slug = resource.slug ?? ''
    const m = SLUG_RE.exec(slug)
    const meta = resource.extra?.metadata ?? {}
    let bestText = ''
    let bestScore = 0
    let bestType = 'BM25'
    for (const field of Object.values(resource.fields ?? {})) {
      for (const para of Object.values(field.paragraphs ?? {})) {
        if (para.score >= bestScore) {
          bestScore = para.score
          bestText = para.text
          bestType = para.score_type
        }
      }
    }
    return {
      kind: m?.[1] ?? 'unknown',
      id: m ? Number(m[2]) : null,
      slug,
      resource: rid,
      title: resource.title ?? slug,
      speaker: resource.origin?.collaborators?.[0] ?? null,
      party: label(resource, 'party'),
      state: label(resource, 'state'),
      date: (meta.date as string) ?? null,
      snippet: bestText.slice(0, 600),
      score: Math.round(calibrate(bestScore, bestType) * 1000) / 1000,
    }
  })
  results.sort((a, b) => b.score - a.score)
  return json({ query: q, mode, kind, count: results.length, results })
}

async function apiAsk(request: Request, env: Env): Promise<Response> {
  const { question, kind } = (await request.json().catch(() => ({}))) as {
    question?: string
    kind?: string
  }
  if (!question?.trim()) return json({ error: 'question is required' }, 400)

  const body: Record<string, unknown> = {
    query: question,
    citations: true, // NEVER combine with answer_json_schema — platform bug
    top_k: 20,
    reranker: 'predict',
    show: ['basic', 'origin', 'extra'],
  }
  if (kind && kind !== 'all') {
    body.filter_expression = { field: { prop: 'label', labelset: 'kind', label: kind } }
  }

  const res = await kbFetch(env, '/ask', { body, headers: { 'x-synchronous': 'true' } })
  if (!res.ok) return json({ error: `ask failed (${res.status})` }, 502)
  const answer = (await res.json()) as {
    answer?: string
    citations?: Record<string, unknown>
    retrieval_results?: { resources?: Record<string, FindResource> }
  }

  const sources = Object.entries(answer.retrieval_results?.resources ?? {})
    .filter(([, r]) => !(r.slug ?? '').startsWith('da-'))
    .map(([rid, r]) => {
      const meta = r.extra?.metadata ?? {}
      return {
        resource: rid,
        slug: r.slug ?? '',
        title: r.title ?? r.slug ?? rid,
        speaker: r.origin?.collaborators?.[0] ?? null,
        party: label(r, 'party'),
        date: (meta.date as string) ?? null,
      }
    })

  return json({
    answer: answer.answer ?? '',
    citations: answer.citations ?? {},
    sources,
  })
}

async function apiResource(slug: string, env: Env): Promise<Response> {
  if (!SLUG_RE.test(slug)) return json({ error: 'bad slug' }, 400)
  const res = await kbFetch(
    env,
    `/slug/${slug}?show=basic&show=origin&show=extra&show=values&show=extracted&extracted=text`,
  )
  if (res.status === 404) return json({ error: 'not found' }, 404)
  if (!res.ok) return json({ error: `resource fetch failed (${res.status})` }, 502)
  const r = (await res.json()) as {
    title?: string
    origin?: { collaborators?: string[]; url?: string }
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
  return json({
    slug,
    title: r.title ?? slug,
    speaker: r.origin?.collaborators?.[0] ?? null,
    url: r.origin?.url ?? null,
    metadata: r.extra?.metadata ?? {},
    text: bodyText,
  })
}

async function apiStats(env: Env): Promise<Response> {
  const res = await kbFetch(env, '/counters')
  if (!res.ok) return json({ error: `counters failed (${res.status})` }, 502)
  return json(await res.json())
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/search' && request.method === 'GET') {
        return await apiSearch(url, env)
      }
      if (url.pathname === '/api/ask' && request.method === 'POST') {
        return await apiAsk(request, env)
      }
      const resourceMatch = url.pathname.match(/^\/api\/resource\/([a-z]+-\d+)$/)
      if (resourceMatch && request.method === 'GET') {
        return await apiResource(resourceMatch[1], env)
      }
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await apiStats(env)
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
