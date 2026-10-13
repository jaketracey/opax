import sourceIdentity from '../../parli/ingest/user-agent.json' with { type: 'json' }
// A small client for the OPAX knowledge box (Progress Agentic RAG, Nuclia-style REST).
// Same zone, base URL and service-account header the production Worker uses
// (portal/src/index.ts kbFetch); same endpoints as parli/arag.py and the Codex
// runners' Kb class (scripts/label_workers.py).

import { FIELD } from './text.ts'
import type { Classification } from './classify.ts'

export interface KbEnv {
  ARAG_ZONE: string
  ARAG_KB_ID: string
  ARAG_KB_TOKEN: string
}

/** The box is pushing back (429 "Too many messages pending to ingest", 5xx, network): leave work pending and stop the tick. */
export class KbBackpressure extends Error {
  readonly status: number
  /** Seconds the box asked us to wait, when it said. */
  readonly retryAfterS: number | null
  constructor(message: string, status: number, retryAfterS: number | null = null) {
    super(message)
    this.name = 'KbBackpressure'
    this.status = status
    this.retryAfterS = retryAfterS
  }
}

/** A definite refusal (4xx other than 404/429): the row's problem, not the box's. */
export class KbHttpError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'KbHttpError'
    this.status = status
  }
}

export interface KbResource {
  extra?: { metadata?: Record<string, unknown> }
  id?: string
  slug?: string
  title?: string
  created?: string
  usermetadata?: { classifications?: Array<{ labelset?: string; label?: string; cancelled_by_user?: boolean }> }
  computedmetadata?: { field_classifications?: unknown[] }
  data?: { texts?: Record<string, { value?: { body?: string | null } | null }> }
}

export interface CatalogRow {
  rid: string
  created: string | null
  usermetadata?: KbResource['usermetadata']
}

export interface CatalogPage {
  rows: CatalogRow[]
  hasNext: boolean
}

/** What the pipeline needs from the box; the tests supply an in-memory fake. */
export interface KbApi {
  /** The resource with its text values, or null when it does not exist (404). */
  getResource(rid: string, timeoutMs?: number): Promise<KbResource | null>
  /** The resource's basic view (classifications) without text values, or null on 404. */
  getBasic(rid: string, timeoutMs?: number): Promise<KbResource | null>
  /** Everything the box will show for a resource (basic, values, origin, extra, relations, errors), or null on 404. */
  getEverything(rid: string): Promise<unknown | null>
  /** The current body of the machine-brief field ('' when absent). */
  getSummaryBody(rid: string): Promise<string>
  patchSummary(rid: string, body: string): Promise<void>
  /** Replaces usermetadata.classifications: callers pass the FULL merged list. */
  patchClassifications(rid: string, classifications: Classification[]): Promise<void>
  catalog(kind: string, sinceIso: string, page: number, pageSize?: number, untilIso?: string, timeoutMs?: number): Promise<CatalogPage>
}

const TIMEOUT_MS = 30_000
/** Classification-only reads must leave time for unrelated live work. */
export const HOLD_METADATA_TIMEOUT_MS = 5_000
/** The catalog is only discovery: a slow answer is abandoned and retried next tick. */
export const CATALOG_TIMEOUT_MS = 20_000

export class Kb implements KbApi {
  private readonly base: string
  private readonly headers: Record<string, string>
  private readonly fetcher: typeof fetch

  constructor(env: KbEnv, fetcher?: typeof fetch) {
    // Not `fetch` itself: a bare reference called as a method throws "Illegal invocation" in Workers.
    this.fetcher = fetcher ?? ((input, init) => fetch(input, init))
    this.base = `https://${env.ARAG_ZONE}.rag.progress.cloud/api/v1/kb/${env.ARAG_KB_ID}`
    this.headers = { 'user-agent': sourceIdentity.user_agent, 'content-type': 'application/json', 'x-nuclia-serviceaccount': `Bearer ${env.ARAG_KB_TOKEN}` }
  }

  private async call(method: string, path: string, body?: unknown, allow404 = false, timeoutMs = TIMEOUT_MS): Promise<any> {
    let res: Response
    let raw: string
    try {
      res = await this.fetcher(this.base + path, {
        method,
        headers: this.headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status === 404 && allow404) {
        await res.body?.cancel()
        return null
      }
      raw = await res.text()
    } catch (err) {
      throw new KbBackpressure(`${method} ${scrub(path)} -> ${(err as Error)?.message ?? err}`, 0)
    }
    if (res.ok) return raw ? JSON.parse(raw) : {}
    const snippet = raw.slice(0, 200)
    if (res.status === 429 || res.status >= 500) {
      throw new KbBackpressure(`${method} ${scrub(path)} -> ${res.status}: ${snippet}`, res.status, retryAfterSeconds(raw))
    }
    throw new KbHttpError(`${method} ${scrub(path)} -> ${res.status}: ${snippet}`, res.status)
  }

  getResource(rid: string, timeoutMs = TIMEOUT_MS): Promise<KbResource | null> {
    return this.call('GET', `/resource/${rid}?show=basic&show=values&show=extra`, undefined, true, timeoutMs)
  }

  getEverything(rid: string): Promise<unknown | null> {
    return this.call('GET', `/resource/${rid}?show=basic&show=values&show=origin&show=extra&show=relations&show=errors`, undefined, true)
  }

  getBasic(rid: string, timeoutMs = TIMEOUT_MS): Promise<KbResource | null> {
    return this.call('GET', `/resource/${rid}?show=basic&show=extra`, undefined, true, timeoutMs)
  }

  /** Admin reconciliation resolves only successful push-log slugs. */
  getBySlug(slug: string): Promise<KbResource | null> {
    return this.call('GET', `/slug/${encodeURIComponent(slug)}?show=basic`, undefined, true)
  }

  async getSummaryBody(rid: string): Promise<string> {
    const d = await this.call('GET', `/resource/${rid}/text/${FIELD}`, undefined, true)
    const body = d?.value?.body
    return typeof body === 'string' ? body.trim() : ''
  }

  async patchSummary(rid: string, body: string): Promise<void> {
    await this.call('PATCH', `/resource/${rid}`, { texts: { [FIELD]: { body, format: 'PLAIN' } } })
  }

  async patchClassifications(rid: string, classifications: Classification[]): Promise<void> {
    await this.call('PATCH', `/resource/${rid}`, { usermetadata: { classifications } })
  }

  async catalog(kind: string, sinceIso: string, page: number, pageSize = 200, untilIso?: string, timeoutMs = CATALOG_TIMEOUT_MS): Promise<CatalogPage> {
    const filter = {
      resource: {
        and: [
          { prop: 'label', labelset: 'kind', label: kind },
          { prop: 'created', since: sinceIso, ...(untilIso ? { until: untilIso } : {}) },
        ],
      },
    }
    const r = await this.call('POST', '/catalog', {
      query: '',
      filter_expression: filter,
      page_size: pageSize,
      page_number: page,
      sort: { field: 'created', order: 'asc' },
    }, false, timeoutMs)
    const resources = (r?.resources ?? {}) as Record<string, KbResource>
    const rows = Object.entries(resources).map(([rid, v]) => ({ rid, created: typeof v?.created === 'string' ? v.created : null, usermetadata: v.usermetadata }))
    return { rows, hasNext: Boolean(r?.fulltext?.next_page) && rows.length > 0 }
  }
}

/** Never let a token or a long path leak into an error line. */
const scrub = (path: string): string => path.replace(/[0-9a-f]{32}/g, (m) => `${m.slice(0, 8)}`)

/** label_workers reads detail.try_after (an epoch) from a 429 body. */
export function retryAfterSeconds(raw: string, nowMs: number = Date.now()): number | null {
  try {
    const at = Number((JSON.parse(raw)?.detail ?? {}).try_after)
    if (Number.isFinite(at) && at > 0) return Math.max(0, Math.ceil(at - nowMs / 1000))
  } catch {
    /* not JSON */
  }
  return null
}
