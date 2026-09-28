// D1 access: the queue, state, spend and error tables (migrations/0001_init.sql).
// Times are unix milliseconds. Every function takes the database so the tests can
// run it against a node:sqlite shim.

export type TaskName = 'speech_summary' | 'speech_topics' | 'release_summary'
export type RowStatus = 'pending' | 'claimed' | 'done' | 'quarantined'
export type Outcome = 'written' | 'dry' | 'unwritten' | 'empty' | 'skipped-existing' | 'no-text' | 'missing'

export const SUMMARY_TASKS: readonly TaskName[] = ['speech_summary', 'release_summary']
export const isSummaryTask = (task: string): boolean => SUMMARY_TASKS.includes(task as TaskName)

export interface QueueRow {
  rid: string
  task: TaskName
  status: RowStatus
  priority: number
  source_created: number | null
  attempts: number
  transient: number
  force: number
  model: string | null
  result: string | null
  outcome: Outcome | null
  last_error: string | null
  neurons: number
  claim_token: string | null
  claimed_at: number | null
  created_at: number
  updated_at: number
  done_at: number | null
}

export const NEW_CONTENT_PRIORITY = 100
export const BACKFILL_PRIORITY = 0
/** Stale claims older than this are reclaimable (a tick that died mid-flight). */
export const STALE_CLAIM_MS = 10 * 60 * 1000
/** Infrastructure failures a row may absorb before it is set aside. */
export const MAX_TRANSIENT = 8

const ROWS_PER_INSERT = 15 // 6 bound parameters a row; D1 allows 100 per statement

// ---------------------------------------------------------------- state

export async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM state WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function setState(db: D1Database, key: string, value: string, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, value, now)
    .run()
}

export async function getStates(db: D1Database, like: string): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM state WHERE key LIKE ?').bind(like).all<{ key: string; value: string }>()
  return Object.fromEntries(results.map((r) => [r.key, r.value]))
}

// ---------------------------------------------------------------- enqueue

export interface NewWork {
  rid: string
  task: TaskName
  priority: number
  /** The resource's `created` time in the box (unix ms), when known. */
  sourceCreated?: number | null
}

/** INSERT OR IGNORE on (rid, task): the queue de-duplicates. Returns how many rows were new. */
export async function enqueue(db: D1Database, work: readonly NewWork[], now: number): Promise<number> {
  if (work.length === 0) return 0
  const statements: D1PreparedStatement[] = []
  for (let i = 0; i < work.length; i += ROWS_PER_INSERT) {
    const chunk = work.slice(i, i + ROWS_PER_INSERT)
    const values = chunk.map(() => "(?, ?, 'pending', ?, ?, ?, ?)").join(', ')
    const params = chunk.flatMap((w) => [w.rid, w.task, w.priority, w.sourceCreated ?? null, now, now])
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO queue (rid, task, status, priority, source_created, created_at, updated_at) VALUES ${values}`).bind(...params),
    )
  }
  let inserted = 0
  for (let i = 0; i < statements.length; i += 50) {
    const results = await db.batch(statements.slice(i, i + 50))
    for (const r of results) inserted += r.meta?.changes ?? 0
  }
  return inserted
}

// ---------------------------------------------------------------- claiming

/** Put claims older than STALE_CLAIM_MS back in the queue. */
export async function reclaimStale(db: D1Database, now: number): Promise<number> {
  const r = await db
    .prepare("UPDATE queue SET status = 'pending', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE status = 'claimed' AND claimed_at < ?")
    .bind(now, now - STALE_CLAIM_MS)
    .run()
  return r.meta?.changes ?? 0
}

/**
 * Claim up to `n` resources (all their pending rows together): highest priority
 * first, then the newest in the box. The claim UPDATE only touches rows still pending, and the
 * rows returned are the ones carrying THIS tick's token, so two overlapping
 * ticks can never process the same row.
 */
export async function claimRids(db: D1Database, n: number, now: number, token: string): Promise<QueueRow[]> {
  const { results: candidates } = await db
    .prepare("SELECT rid FROM queue WHERE status = 'pending' ORDER BY priority DESC, source_created DESC, created_at LIMIT ?")
    .bind(n * 2)
    .all<{ rid: string }>()
  const rids: string[] = []
  for (const { rid } of candidates) {
    if (!rids.includes(rid)) rids.push(rid)
    if (rids.length >= n) break
  }
  if (rids.length === 0) return []
  await db
    .prepare(
      `UPDATE queue SET status = 'claimed', claim_token = ?, claimed_at = ?, updated_at = ? WHERE status = 'pending' AND rid IN (${rids.map(() => '?').join(',')})`,
    )
    .bind(token, now, now, ...rids)
    .run()
  const { results } = await db.prepare("SELECT * FROM queue WHERE claim_token = ? AND status = 'claimed'").bind(token).all<QueueRow>()
  return results
}

/** Everything this tick still holds goes back to pending (work that never started). */
export async function releaseClaims(db: D1Database, token: string, now: number): Promise<number> {
  const r = await db
    .prepare("UPDATE queue SET status = 'pending', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE claim_token = ? AND status = 'claimed'")
    .bind(now, token)
    .run()
  return r.meta?.changes ?? 0
}

// ---------------------------------------------------------------- finishing rows

export interface RowUpdate {
  rid: string
  task: string
  status: RowStatus
  outcome?: Outcome | null
  result?: string | null
  model?: string | null
  lastError?: string | null
  /** Neurons to ADD to the row's running total. */
  addNeurons?: number
  /** Validator-rejected outputs to ADD. */
  addAttempts?: number
  /** Infrastructure failures to ADD. */
  addTransient?: number
}

/** Settle rows in one batch. `claim_token` is cleared, so nothing finished is ever "released". */
export async function finishRows(db: D1Database, updates: readonly RowUpdate[], now: number): Promise<void> {
  if (updates.length === 0) return
  const statements = updates.map((u) =>
    db
      .prepare(
        `UPDATE queue SET status = ?, outcome = COALESCE(?, outcome), result = COALESCE(?, result), model = COALESCE(?, model),
           last_error = ?, neurons = neurons + ?, attempts = attempts + ?, transient = transient + ?,
           claim_token = NULL, claimed_at = NULL, updated_at = ?, done_at = ?
         WHERE rid = ? AND task = ?`,
      )
      .bind(
        u.status,
        u.outcome ?? null,
        u.result ?? null,
        u.model ?? null,
        u.lastError ?? null,
        u.addNeurons ?? 0,
        u.addAttempts ?? 0,
        u.addTransient ?? 0,
        now,
        u.status === 'done' || u.status === 'quarantined' ? now : null,
        u.rid,
        u.task,
      ),
  )
  await db.batch(statements)
}

// ---------------------------------------------------------------- dry results awaiting a live write

/** Rows the model has finished but the box has not received: dry-run results, or writes that met backpressure. */
export async function unwrittenRows(db: D1Database, limit: number): Promise<QueueRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM queue WHERE status = 'done' AND outcome IN ('dry', 'unwritten') AND result IS NOT NULL ORDER BY priority DESC, done_at LIMIT ?")
    .bind(limit)
    .all<QueueRow>()
  return results
}

// ---------------------------------------------------------------- spend

export async function addSpend(
  db: D1Database,
  day: string,
  model: string,
  neurons: number,
  inTokens: number,
  outTokens: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO spend (day, model, neurons, calls, in_tokens, out_tokens) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(day, model) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1,
         in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens`,
    )
    .bind(day, model, neurons, inTokens, outTokens)
    .run()
}

export async function spentOnDay(db: D1Database, day: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(SUM(neurons), 0) AS n FROM spend WHERE day = ?').bind(day).first<{ n: number }>()
  return row?.n ?? 0
}

// ---------------------------------------------------------------- rejections and errors

export async function logRejection(
  db: D1Database,
  now: number,
  rid: string,
  task: string,
  model: string,
  attempt: number,
  reasons: string,
  sample: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO rejections (ts, rid, task, model, attempt, reasons, sample) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(now, rid, task, model, attempt, reasons.slice(0, 600), sample.slice(0, 400))
    .run()
}

export async function logError(db: D1Database, now: number, kind: string, message: string, rid?: string, task?: string): Promise<void> {
  await db
    .prepare('INSERT INTO errors (ts, rid, task, kind, message) VALUES (?, ?, ?, ?, ?)')
    .bind(now, rid ?? null, task ?? null, kind, message.slice(0, 500))
    .run()
}

export async function pruneErrors(db: D1Database, keep = 200): Promise<void> {
  await db.prepare('DELETE FROM errors WHERE id <= (SELECT MAX(id) FROM errors) - ?').bind(keep).run()
  await db.prepare('DELETE FROM rejections WHERE id <= (SELECT MAX(id) FROM rejections) - 1000').run()
}
