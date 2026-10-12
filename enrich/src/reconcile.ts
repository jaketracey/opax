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
  historicHold?: boolean
}

/** Verify the entire batch before mutating; no resource bodies or private metadata are read. */
async function verifyHistoricRids(d: ReconcileDeps, slugs: string[]): Promise<Set<string>> {
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
  return rids
}

export async function reconcileHistoric(d: ReconcileDeps, slugs: string[]): Promise<{ verified: number; inserted: number; reconciled: number }> {
  const rids = await verifyHistoricRids(d, slugs)
  let inserted = 0
  let reconciled = 0
  const now = d.now()
  // Paired transactions resolve either discovery order. Completed writes and terminal
  // outcomes are untouched. A hold cancels unfinished claims/results, never a release.
  const statements: D1PreparedStatement[] = []
  for (const rid of rids) {
    statements.push(
      d.db.prepare(`INSERT OR IGNORE INTO queue (rid, task, status, terminal_reason, priority, historic, created_at, updated_at)
        VALUES (?, 'speech_summary', ?, ?, ?, 1, ?, ?), (?, 'speech_topics', ?, ?, ?, 1, ?, ?)`)
        .bind(rid, d.historicHold ? 'done' : 'pending', d.historicHold ? 'historic-held' : null, BACKFILL_PRIORITY, now, now,
          rid, d.historicHold ? 'done' : 'pending', d.historicHold ? 'historic-held' : null, BACKFILL_PRIORITY, now, now),
      d.historicHold ? d.db.prepare(`UPDATE queue SET priority = ?, historic = 1,
        status = CASE WHEN historic_released = 0 THEN 'done' ELSE status END,
        terminal_reason = CASE WHEN historic_released = 0 THEN 'historic-held' ELSE terminal_reason END,
        outcome = CASE WHEN historic_released = 0 THEN NULL ELSE outcome END,
        result = CASE WHEN historic_released = 0 THEN NULL ELSE result END,
        claim_token = CASE WHEN historic_released = 0 THEN NULL ELSE claim_token END,
        claimed_at = CASE WHEN historic_released = 0 THEN NULL ELSE claimed_at END,
        done_at = CASE WHEN historic_released = 0 THEN NULL ELSE done_at END,
        updated_at = CASE WHEN historic_released = 0 THEN ? ELSE updated_at END
        WHERE rid = ? AND task IN ('speech_summary', 'speech_topics') AND (
          (terminal_reason IS NULL AND (status IN ('pending', 'claimed') OR (status = 'done' AND outcome IN ('dry', 'unwritten')))
            AND (priority != ? OR historic != 1 OR historic_released = 0))
          OR (terminal_reason = 'historic-held' AND (priority != ? OR historic != 1)))`)
        .bind(BACKFILL_PRIORITY, now, rid, BACKFILL_PRIORITY, BACKFILL_PRIORITY)
      : d.db.prepare(`UPDATE queue SET priority = ?, historic = 1 WHERE rid = ? AND terminal_reason IS NULL
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

/** Explicit fallback/emergency release. Never inserts work or changes completed rows. */
export async function releaseHistoric(d: ReconcileDeps, slugs: string[]): Promise<{ verified: number; released: number }> {
  const rids = await verifyHistoricRids(d, slugs)
  const now = d.now()
  const statements = [...rids].map(rid => d.db.prepare(`UPDATE queue SET status = 'pending', priority = ?,
    terminal_reason = NULL, historic_released = 1, outcome = NULL, result = NULL,
    claim_token = NULL, claimed_at = NULL, done_at = NULL, updated_at = ?
    WHERE rid = ? AND task IN ('speech_summary', 'speech_topics') AND status = 'done' AND terminal_reason = 'historic-held'
      AND NOT EXISTS (SELECT 1 FROM batch_items b WHERE b.rid = queue.rid AND b.state IN ('reserved','applying'))`)
    .bind(BACKFILL_PRIORITY, now, rid))
  let released = 0
  for (let i = 0; i < statements.length; i += 50) {
    const results = await d.db.batch(statements.slice(i, i + 50))
    for (const result of results) released += result.meta.changes
  }
  return { verified: rids.size, released }
}
