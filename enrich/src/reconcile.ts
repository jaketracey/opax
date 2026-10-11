import { BACKFILL_PRIORITY } from './db.ts'
import { isHistoricSpeech } from './historic.ts'
import type { KbResource } from './kb.ts'

export const MAX_RECONCILE_SLUGS = 200
export function parseReconcileBody(body: unknown): { slugs: string[] } | { error: string } {
  const slugs = (body as { slugs?: unknown } | null)?.slugs
  if (!Array.isArray(slugs) || !slugs.length || slugs.length > MAX_RECONCILE_SLUGS
    || !slugs.every((s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,256}$/.test(s))) {
    return { error: 'body must contain 1-200 valid resource slugs' }
  }
  return { slugs: [...new Set(slugs)] }
}

export interface ReconcileDeps {
  db: D1Database
  kb: { getBySlug(slug: string): Promise<KbResource | null> }
  now: () => number
}

/** Verify the entire batch before mutating; no resource bodies or private metadata are read. */
export async function reconcileHistoric(d: ReconcileDeps, slugs: string[]): Promise<{ verified: number; inserted: number; reconciled: number }> {
  const rids = new Set<string>()
  for (let i = 0; i < slugs.length; i += 4) {
    const resources = await Promise.all(slugs.slice(i, i + 4).map((slug) => d.kb.getBySlug(slug)))
    for (const resource of resources) {
      if (!resource?.id || !/^[0-9a-f]{32}$/.test(resource.id) || !isHistoricSpeech(resource)) {
        throw new Error('push-log batch contains a missing or non-historic speech')
      }
      rids.add(resource.id)
    }
  }
  let inserted = 0
  let reconciled = 0
  const now = d.now()
  // Paired insert/update transactions resolve either discovery order. Preserve claims,
  // attempts, results and all processing timestamps; completed writes are untouched.
  const statements: D1PreparedStatement[] = []
  for (const rid of rids) {
    statements.push(
      d.db.prepare("INSERT OR IGNORE INTO queue (rid, task, priority, historic, created_at, updated_at) VALUES (?, 'speech_summary', ?, 1, ?, ?), (?, 'speech_topics', ?, 1, ?, ?)")
        .bind(rid, BACKFILL_PRIORITY, now, now, rid, BACKFILL_PRIORITY, now, now),
      d.db.prepare(`UPDATE queue SET priority = ?, historic = 1 WHERE rid = ? AND terminal_reason IS NULL
        AND (status IN ('pending', 'claimed') OR (status = 'done' AND outcome IN ('dry', 'unwritten')))
        AND (priority != ? OR historic != 1)`).bind(BACKFILL_PRIORITY, rid, BACKFILL_PRIORITY),
    )
  }
  for (let i = 0; i < statements.length; i += 50) {
    const results = await d.db.batch(statements.slice(i, i + 50))
    results.forEach((result, index) => {
      if (index % 2 === 0) inserted += result.meta.changes
      else reconciled += result.meta.changes
    })
  }
  return { verified: rids.size, inserted, reconciled }
}
