// Authenticated admin delivery of historic, pre-generated results. The client is untrusted.
import { batchRecord, BATCH_MODEL, hashValue, sourceHash, validateBatchResult } from './batch-result.ts'
import { isSummaryTask, type QueueRow, type TaskName } from './db.ts'
import { isHistoricSpeech, skipHistoricShort } from './historic.ts'
import { KbHttpError, type KbApi } from './kb.ts'
import type { Task } from './prompts.ts'
import { pickText } from './text.ts'
import { UnsafeWrite, writeItem } from './write.ts'

interface BatchJob { rid: string; run_id: string; source_hash: string; tasks: string; state: string; payload_hash: string | null; lease_until: number }
export interface BatchDeps { db: D1Database; kb: KbApi; now(): number; live: boolean }
const RID = /^[0-9a-f]{32}$/
const RUN = /^[a-zA-Z0-9_-]{1,64}$/
const HASH = /^[0-9a-f]{64}$/
const HELD = "status = 'done' AND terminal_reason = 'historic-held' AND historic = 1 AND force = 0"
const held = (r: QueueRow) => r.status === 'done' && r.terminal_reason === 'historic-held' && r.historic === 1 && r.force === 0
const taskOf = (t: string): Task => isSummaryTask(t) ? 'summary' : 'topics'
export class BatchConflict extends Error {}
export class BatchBusy extends Error {
  leaseUntil: number
  constructor(leaseUntil: number) { super('batch writer lease active'); this.leaseUntil = leaseUntil }
}
const conflict = () => new BatchConflict('batch ownership, queue eligibility or source changed')

export function parseBatchBody(body: unknown): { run_id: string; rid: string; source_hash?: string; result?: unknown } | { error: string } {
  const b = body as Record<string, unknown> | null
  if (!b || typeof b.run_id !== 'string' || !RUN.test(b.run_id) || typeof b.rid !== 'string' || !RID.test(b.rid)
    || (b.source_hash !== undefined && (typeof b.source_hash !== 'string' || !HASH.test(b.source_hash)))) return { error: 'valid run_id, rid and optional source_hash required' }
  return { run_id: b.run_id, rid: b.rid, source_hash: b.source_hash as string | undefined, result: b.result }
}
async function queue(d: BatchDeps, rid: string): Promise<QueueRow[]> {
  return (await d.db.prepare("SELECT * FROM queue WHERE rid = ? AND task IN ('speech_summary', 'speech_topics')").bind(rid).all<QueueRow>()).results
}
async function job(d: BatchDeps, rid: string): Promise<BatchJob | null> {
  return d.db.prepare('SELECT * FROM batch_items WHERE rid = ?').bind(rid).first<BatchJob>()
}

/** Authoritative ownership, including acknowledgements lost before a client save. */
export async function readBatchReservations(d: BatchDeps, run: string, limit: number, after = '') {
  const { results } = await d.db.prepare(`SELECT rid, source_hash, state, lease_until FROM batch_items
    WHERE run_id = ? AND rid > ? ORDER BY rid LIMIT ?`).bind(run, after, limit)
    .all<Pick<BatchJob, 'rid' | 'source_hash' | 'state' | 'lease_until'>>()
  return { reservations: results, next_after: results.length === limit ? results.at(-1)!.rid : null }
}

function reservedBy(b: BatchJob, run: string, expectedHash: string) {
  if (b.run_id !== run || b.source_hash !== expectedHash) throw conflict()
  return { state: b.state }
}

/** Read only: full source records remain in the authenticated response, never logs. */
export async function readHeldBatch(d: BatchDeps, limit: number, after = '') {
  const { results } = await d.db.prepare(`SELECT DISTINCT rid FROM queue q WHERE ${HELD}
    AND task IN ('speech_summary', 'speech_topics') AND rid > ? AND NOT EXISTS (SELECT 1 FROM batch_items b WHERE b.rid = q.rid)
    ORDER BY rid LIMIT ?`).bind(after, limit).all<{ rid: string }>()
  const units = []
  for (let i = 0; i < results.length; i += 4) {
    const chunk = await Promise.all(results.slice(i, i + 4).map(async ({ rid }) => {
      const resource = await d.kb.getResource(rid)
      if (!resource || resource.id !== rid || !isHistoricSpeech(resource) || !resource.slug || !/^[a-zA-Z0-9_-]{1,256}$/.test(resource.slug)) return null
      const rows = (await queue(d, rid)).filter(held)
      if (!rows.length) return null
      const record = batchRecord(resource, rid)
      return { rid, source_hash: await sourceHash(record), tasks: rows.map(r => taskOf(r.task)), record, short: skipHistoricShort(true, pickText(resource.data?.texts)) }
    }))
    units.push(...chunk.filter(u => u !== null))
  }
  return { units, next_after: results.length === limit ? results.at(-1)!.rid : null }
}

/** Reserve without releasing the hold; one durable owner per resource. */
export async function reserveBatch(d: BatchDeps, run: string, rid: string, expectedHash: string) {
  const existing = await job(d, rid)
  if (existing) return reservedBy(existing, run, expectedHash)
  const resource = await d.kb.getResource(rid)
  if (!resource || resource.id !== rid || !isHistoricSpeech(resource) || skipHistoricShort(true, pickText(resource.data?.texts))) throw conflict()
  if (await sourceHash(batchRecord(resource, rid)) !== expectedHash) throw conflict()
  const rows = (await queue(d, rid)).filter(held)
  if (!rows.length) throw conflict()
  const tasks = rows.map(r => r.task).sort()
  const result = await d.db.prepare(`INSERT OR IGNORE INTO batch_items (rid, run_id, source_hash, tasks, state, updated_at)
    SELECT ?, ?, ?, ?, 'reserved', ? WHERE (SELECT COUNT(*) FROM queue WHERE rid = ? AND ${HELD}
      AND task IN ('speech_summary','speech_topics')) = ?`)
    .bind(rid, run, expectedHash, JSON.stringify(tasks), d.now(), rid, tasks.length).run()
  if (result.meta.changes !== 1) {
    // Concurrent retries can both read no owner before one wins the insert.
    const winner = await job(d, rid)
    if (!winner) throw conflict()
    return reservedBy(winner, run, expectedHash)
  }
  return { state: 'reserved' }
}

/** Cancellation precedes /backfill/release. A writer holding a live lease cannot be released. */
export async function cancelBatch(d: BatchDeps, run: string, rid: string) {
  const existing = await job(d, rid)
  if (!existing) return { state: 'unreserved' }
  if (existing.run_id !== run) return { state: 'unowned' }
  if (existing?.run_id === run && existing.state === 'done') return { state: 'done' }
  await d.db.prepare(`UPDATE batch_items SET state = 'released', lease_until = 0, updated_at = ?
    WHERE rid = ? AND run_id = ? AND (state IN ('reserved','released') OR (state = 'applying' AND lease_until <= ?))`)
    .bind(d.now(), rid, run, d.now()).run()
  const b = await job(d, rid)
  if (b?.run_id === run && b.state === 'done') return { state: 'done' }
  if (b?.run_id === run && b.state === 'applying' && b.lease_until > d.now()) throw new BatchBusy(b.lease_until)
  if (!b || b.run_id !== run || b.state !== 'released') throw conflict()
  return { state: 'released' }
}

export async function applyBatch(d: BatchDeps, run: string, rid: string, expectedHash: string, output: unknown) {
  const b = await job(d, rid)
  if (!b || b.run_id !== run || b.source_hash !== expectedHash || b.state === 'released') throw conflict()
  const payload = output as { summary?: unknown; topics?: unknown } | null
  const payloadHash = await hashValue({ summary: payload?.summary, topics: payload?.topics })
  if (b.state === 'done') {
    if (b.payload_hash !== payloadHash) throw conflict()
    const completed = await queue(d, rid)
    if (JSON.parse(b.tasks).some((task: string) => !completed.some(r => r.task === task && r.batch_run === run && r.status === 'done' && r.historic === 1 && r.terminal_reason === null))) throw conflict()
    const current = await d.kb.getBasic(rid)
    if (!current || current.id !== rid || !isHistoricSpeech(current)) throw conflict()
    return { state: 'done', replay: true }
  }
  const tasks: TaskName[] = JSON.parse(b.tasks)
  const rows = await queue(d, rid)
  if (tasks.some(t => !rows.some(r => r.task === t && (held(r) || (r.batch_run === run && r.status === 'done' && r.terminal_reason === null))))) throw conflict()
  const resource = await d.kb.getResource(rid)
  if (!resource || resource.id !== rid || !isHistoricSpeech(resource)) throw conflict()
  const record = batchRecord(resource, rid)
  if (await sourceHash(record) !== expectedHash) throw conflict()
  const verdict = validateBatchResult(record, tasks.map(taskOf), output)
  if (!verdict.valid) return { state: 'invalid', problems: verdict.problems }
  // Dry mode does not drain held rows: switching live later must revalidate and re-read.
  if (!d.live) return { state: 'dry', validated: true }
  const lock = await d.db.prepare(`UPDATE batch_items SET state = 'applying', payload_hash = ?, lease_until = ?, updated_at = ?
    WHERE rid = ? AND run_id = ? AND (payload_hash IS NULL OR payload_hash = ?)
    AND (state = 'reserved' OR (state = 'applying' AND lease_until <= ?))`)
    .bind(payloadHash, d.now() + 15 * 60000, d.now(), rid, run, payloadHash, d.now()).run()
  if (lock.meta.changes !== 1) {
    const writer = await job(d, rid)
    if (writer?.run_id === run && writer.source_hash === expectedHash && writer.state === 'applying'
      && writer.payload_hash === payloadHash && writer.lease_until > d.now()) throw new BatchBusy(writer.lease_until)
    throw conflict()
  }
  try {
    for (const task of tasks) {
      const row = rows.find(r => r.task === task)!
      if (row.batch_run === run && row.terminal_reason === null) continue // restart after a partial delivery
      const value = isSummaryTask(task) ? verdict.summary as string : verdict.topics
      // The exact tick write path: fresh brief check, classification merge/read-back repair,
      // historic short/name guard. No caller-provided force or validation flag is accepted.
      const done = await writeItem(d.kb, rid, { task, force: false, value, historic: true }, resource)
      const settled = await d.db.prepare(`UPDATE queue SET terminal_reason = NULL, status = 'done', outcome = ?, result = ?, model = ?,
        batch_run = ?, last_error = ?, updated_at = ?, done_at = ? WHERE rid = ? AND task = ? AND ${HELD}
        AND EXISTS (SELECT 1 FROM batch_items WHERE rid = ? AND run_id = ? AND state = 'applying' AND payload_hash = ?)`)
        .bind(done.outcome, typeof value === 'string' ? value : JSON.stringify(value), BATCH_MODEL, run,
          done.warning ? 'topic read-back repaired' : null, d.now(), d.now(), rid, task, rid, run, payloadHash).run()
      if (settled.meta.changes !== 1) throw conflict()
    }
    await d.db.prepare("UPDATE batch_items SET state = 'done', lease_until = 0, updated_at = ? WHERE rid = ? AND run_id = ? AND state = 'applying'")
      .bind(d.now(), rid, run).run()
    return { state: 'done', replay: false }
  } catch (e) {
    await d.db.prepare("UPDATE batch_items SET state = 'reserved', lease_until = 0, updated_at = ? WHERE rid = ? AND run_id = ? AND state = 'applying'").bind(d.now(), rid, run).run()
    if (e instanceof KbHttpError || e instanceof UnsafeWrite) return { state: 'release', problems: ['worker write refused; release remaining held tasks to live processing'] }
    return { state: 'retry-write' }
  }
}
