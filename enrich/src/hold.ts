import { readClassifications } from './classify.ts'
import { holdHistoricStatement, type QueueRow } from './db.ts'
import { isHistoricSpeech } from './historic.ts'
import type { KbResource } from './kb.ts'

/** A default queue flag cannot establish a resource's source. Missing/partial
 * metadata must be retried rather than treated as permission to write. */
export function classifyForHistoricHold(resource: KbResource | null): boolean {
  const labels = readClassifications(resource).filter(label => !label.cancelled_by_user)
  if (!labels.some(label => label.labelset === 'kind') || !labels.some(label => label.labelset === 'source')) {
    throw new Error('historic hold source classification unavailable')
  }
  return isHistoricSpeech(resource!)
}

/** Classify from KB metadata, backfill only unfinished historic rows, and hold
 * every unreleased task. Completed pilot rows never enter either update. */
export async function eligibleHistoricRows(db: D1Database, rows: QueueRow[], resource: KbResource | null, now: () => number): Promise<QueueRow[]> {
  if (!classifyForHistoricHold(resource)) return rows
  const rid = rows[0].rid
  await db.batch([
    db.prepare(`UPDATE queue SET historic = 1 WHERE rid = ? AND historic != 1 AND terminal_reason IS NULL
      AND task IN ('speech_summary', 'speech_topics')
      AND (status IN ('pending', 'claimed') OR (status = 'done' AND outcome IN ('dry', 'unwritten')))`)
      .bind(rid),
    holdHistoricStatement(db, [rid], now()),
  ])
  return rows.filter(row => row.historic_released === 1)
}
