// Discovery: page the knowledge-box catalog for speeches and press releases created
// after the stored cursor, enqueue them, and only then advance the cursor.
//
// The catalog is walked in ascending `created` order with a `since` filter
// (offset paging over the whole set degrades to ~40 s a page; a recent window
// pages in about a second: see scripts/arag_enrich_resume.catalog_rids).

import { enqueue, getState, setState, NEW_CONTENT_PRIORITY, type NewWork, type TaskName } from './db.ts'
import type { KbApi } from './kb.ts'

export const DISCOVERY_KINDS: ReadonlyArray<{ kind: string; tasks: readonly TaskName[] }> = [
  { kind: 'speech', tasks: ['speech_summary', 'speech_topics'] },
  { kind: 'press_release', tasks: ['release_summary'] },
]

export const cursorKey = (kind: string): string => `cursor:${kind}`
const partialKey = (kind: string): string => `partial:${kind}`

/** The catalog reports `created` as a naive UTC timestamp ("2026-09-28T11:48:20.705955"). */
export function parseCreated(value: string | null | undefined): number | null {
  if (!value) return null
  const hasZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(value)
  const ms = Date.parse(hasZone ? value : `${value}Z`)
  return Number.isFinite(ms) ? ms : null
}

/** The `since` filter format the Python tools use: whole seconds, Z suffix. */
export const sinceParam = (ms: number): string => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z')

export interface DiscoveryOptions {
  db: D1Database
  kb: KbApi
  now: number
  startIso: string
  maxPages: number
  overlapS: number
  pageSize?: number
  /** Time box for the whole discovery pass; when it runs out the walk is left partial and resumes next tick. */
  maxMs?: number
  clock?: () => number
}

export interface DiscoveryResult {
  seen: Record<string, number>
  enqueued: Record<string, number>
  partial: string[]
  errors: string[]
}

export async function discover(opts: DiscoveryOptions): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { seen: {}, enqueued: {}, partial: [], errors: [] }
  const clock = opts.clock ?? Date.now
  const started = clock()
  const outOfTime = (): boolean => opts.maxMs !== undefined && clock() - started > opts.maxMs
  for (const { kind, tasks } of DISCOVERY_KINDS) {
    result.seen[kind] = 0
    result.enqueued[kind] = 0
    try {
      const stored = await getState(opts.db, cursorKey(kind))
      const cursorMs = parseCreated(stored) ?? Date.parse(opts.startIso)
      // After a walk that hit the page cap the cursor is exact progress: re-reading an
      // overlap window could put us behind where we started. Otherwise re-read a short
      // window, in case rows became visible in the catalog late.
      const wasPartial = (await getState(opts.db, partialKey(kind))) === '1'
      const sinceMs = wasPartial || !stored ? cursorMs : cursorMs - opts.overlapS * 1000

      let maxCreated = cursorMs
      let hasNext = true
      let pages = 0
      for (let page = 0; hasNext && page < opts.maxPages && !(page > 0 && outOfTime()); page += 1) {
        const got = await opts.kb.catalog(kind, sinceParam(sinceMs), page, opts.pageSize ?? 200)
        pages += 1
        result.seen[kind] += got.rows.length
        const work: NewWork[] = got.rows.flatMap((r) => tasks.map((task) => ({ rid: r.rid, task, priority: NEW_CONTENT_PRIORITY, sourceCreated: parseCreated(r.created) })))
        result.enqueued[kind] += await enqueue(opts.db, work, opts.now)
        for (const r of got.rows) {
          const created = parseCreated(r.created)
          if (created !== null && created > maxCreated) maxCreated = created
        }
        // The cursor moves only after this page's rows are safely in the queue.
        if (maxCreated > cursorMs) await setState(opts.db, cursorKey(kind), new Date(maxCreated).toISOString(), opts.now)
        hasNext = got.hasNext
      }
      const partial = hasNext
      await setState(opts.db, partialKey(kind), partial ? '1' : '0', opts.now)
      if (partial) result.partial.push(kind)
    } catch (err) {
      result.errors.push(`${kind}: ${String((err as Error)?.message ?? err).slice(0, 200)}`)
    }
  }
  return result
}
