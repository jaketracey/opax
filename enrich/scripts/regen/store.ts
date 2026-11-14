// D1 side of the 5b-cheap regeneration: a snapshot table owned by the runner (the Worker never reads it)
// and every queue update the run makes. Each step is ONE conditional statement and safe to repeat.
//
// Row states:
//   pending      snapshot taken (old brief saved), nothing generated
//   generating   claimed; a model call may be in flight
//   generated    new brief stored here, queue not yet updated
//   held         pilot compare mode: both variants stored, nothing queued until `release`
//   queued       queue row now carries the new brief as outcome 'unwritten', force 1: the Worker's flush writes it
//   written      the Worker has written it (queue outcome 'written' with the new brief) and force is back
//                to the snapshot's value
//   failed       no valid brief (validator, per-item 4xx, or stopped mid-item); the old brief stays
//   skipped      the queue row or the live KB brief no longer matched the snapshot; nothing generated
//   interrupted  found 'generating' at start-up with no stored result: never retried automatically
//   rolled-back  old brief handed back to the Worker the same way (force reset once the Worker has written it)
import { REGEN_SPEND_PREFIX } from '../../src/budget.ts'
import type { MiniD1 } from './d1rest.ts'
import { SEQ_BAND, seqBase, SLICES, type SliceName } from './slices.ts'

export const TABLE = 'regen_5b_cheap'
export const PROMPT_VERSION = '5b-cheap-1'
export const TASK = 'speech_summary'
/**
 * The runner's own rows in the Worker's D1 `spend` table. The Worker counts them against its overall cap only
 * (src/budget.ts dayAllows); the runner's read of the Worker's spend leaves them out (its ledger has them).
 */
export const SPEND_PREFIX = REGEN_SPEND_PREFIX

export const DDL = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    rid TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    slice TEXT NOT NULL,
    seq INTEGER NOT NULL,
    variant TEXT NOT NULL CHECK (variant IN ('b', 'role')),
    prompt_version TEXT NOT NULL,
    old_result TEXT NOT NULL,
    old_model TEXT,
    old_force INTEGER NOT NULL,
    old_neurons REAL,
    old_done_at INTEGER,
    old_updated_at INTEGER,
    kb_brief TEXT,
    state TEXT NOT NULL DEFAULT 'pending',
    new_result TEXT,
    new_model TEXT,
    alt_variant TEXT,
    alt_result TEXT,
    alt_model TEXT,
    neurons REAL NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    snapshot_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ${TABLE}_next ON ${TABLE} (run_id, state, seq)`,
]

export interface RegenRow {
  rid: string
  run_id: string
  slice: string
  seq: number
  variant: 'b' | 'role'
  prompt_version: string
  old_result: string
  old_model: string | null
  old_force: number
  state: string
  new_result: string | null
  new_model: string | null
  alt_variant: string | null
  alt_result: string | null
  alt_model: string | null
  neurons: number
  calls: number
  note: string | null
}

export async function init(db: MiniD1): Promise<void> {
  for (const sql of DDL) await db.prepare(sql).run()
}

/**
 * Snapshot BEFORE anything is generated: copy each listed rid's current queue row (only Workers AI
 * briefs that are written and finished) into the table. INSERT OR IGNORE: a re-seed never replaces
 * the original old brief. rids travel as one JSON array parameter (D1 caps bound parameters at 100).
 */
export async function seed(db: MiniD1, o: { runId: string; slice: SliceName; variant: 'b' | 'role'; rids: string[]; now: number }): Promise<number> {
  if (!Object.hasOwn(SLICES, o.slice)) throw new Error(`unknown slice '${o.slice}'`)
  if (!(SLICES[o.slice].variants as readonly string[]).includes(o.variant)) throw new Error(`slice ${o.slice} does not take variant ${o.variant}`)
  if (o.rids.length >= SEQ_BAND) throw new Error('too many rids for one slice band')
  const base = seqBase(o.slice)
  let added = 0
  for (let i = 0; i < o.rids.length; i += 500) {
    const chunk = o.rids.slice(i, i + 500)
    const r = await db.prepare(`INSERT OR IGNORE INTO ${TABLE}
        (rid, run_id, slice, seq, variant, prompt_version, old_result, old_model, old_force, old_neurons, old_done_at, old_updated_at, state, snapshot_at, updated_at)
      SELECT q.rid, ?1, ?2, ?3 + CAST(j.key AS INTEGER), ?4, ?5, q.result, q.model, q.force, q.neurons, q.done_at, q.updated_at, 'pending', ?6, ?6
      FROM json_each(?7) AS j JOIN queue AS q ON q.rid = j.value AND q.task = '${TASK}'
      WHERE q.status = 'done' AND q.outcome = 'written' AND q.terminal_reason IS NULL
        AND q.model LIKE '@cf/%' AND q.result IS NOT NULL AND TRIM(q.result) != ''`)
      .bind(o.runId, o.slice, base + i, o.variant, PROMPT_VERSION, o.now, JSON.stringify(chunk)).run()
    added += r.meta.changes
  }
  return added
}

/** The next pending rows, all from the earliest slice that still has any: a batch never mixes slices, and a later slice waits. */
export async function nextPending(db: MiniD1, runId: string, limit: number): Promise<RegenRow[]> {
  // The band is an integer literal (a bound JS number may arrive as REAL and turn this into real division).
  const band = String(Math.trunc(SEQ_BAND))
  const r = await db.prepare(`SELECT * FROM ${TABLE} WHERE run_id = ?1 AND state = 'pending'
      AND seq / ${band} = (SELECT MIN(seq) / ${band} FROM ${TABLE} WHERE run_id = ?1 AND state = 'pending')
    ORDER BY seq LIMIT ?2`).bind(runId, limit).all<RegenRow>()
  return r.results
}

export async function rowsIn(db: MiniD1, runId: string, states: string[]): Promise<RegenRow[]> {
  const r = await db.prepare(`SELECT * FROM ${TABLE} WHERE run_id = ?1 AND state IN (SELECT value FROM json_each(?2)) ORDER BY seq`).bind(runId, JSON.stringify(states)).all<RegenRow>()
  return r.results
}

/** Move a row between states only from the expected one; true when this caller made the move. */
export async function transition(db: MiniD1, rid: string, from: string, to: string, now: number, set: Partial<Record<'kb_brief' | 'new_result' | 'new_model' | 'alt_variant' | 'alt_result' | 'alt_model' | 'note', string | null> & Record<'neurons' | 'calls', number>> = {}): Promise<boolean> {
  const cols = Object.keys(set)
  const assigns = cols.map((c, i) => `${c} = ?${i + 5}`).join(', ')
  const r = await db.prepare(`UPDATE ${TABLE} SET state = ?3, updated_at = ?4${assigns ? ', ' + assigns : ''} WHERE rid = ?1 AND state = ?2`)
    .bind(rid, from, to, now, ...cols.map((c) => (set as any)[c])).run()
  return r.meta.changes === 1
}

/** The queue row as it is now, to compare with the snapshot before spending anything. */
export async function queueRow(db: MiniD1, rid: string): Promise<{ status: string; outcome: string | null; result: string | null; model: string | null; terminal_reason: string | null } | null> {
  return db.prepare(`SELECT status, outcome, result, model, terminal_reason FROM queue WHERE rid = ?1 AND task = '${TASK}'`).bind(rid).first()
}

/**
 * Hand the new brief to the Worker: the queue row becomes a finished, forced, unwritten result, which the
 * Worker's live tick (flush -> writeItem, force) writes to the knowledge box. Only if the row still holds
 * the snapshotted old brief and this table holds the new one.
 */
export async function queueNewBrief(db: MiniD1, rid: string, now: number): Promise<boolean> {
  await db.prepare(`UPDATE queue SET
      result = (SELECT r.new_result FROM ${TABLE} r WHERE r.rid = queue.rid),
      model = (SELECT r.new_model FROM ${TABLE} r WHERE r.rid = queue.rid),
      force = 1, status = 'done', outcome = 'unwritten', last_error = NULL, done_at = ?2, updated_at = ?2
    WHERE rid = ?1 AND task = '${TASK}' AND status = 'done' AND outcome = 'written' AND terminal_reason IS NULL
      AND EXISTS (SELECT 1 FROM ${TABLE} r WHERE r.rid = queue.rid AND r.state = 'generated'
        AND r.new_result IS NOT NULL AND r.old_result = queue.result)`).bind(rid, now).run()
  // Mark queued whenever the queue now carries our brief (also after a crash between the two statements).
  const r = await db.prepare(`UPDATE ${TABLE} SET state = 'queued', updated_at = ?2
    WHERE rid = ?1 AND state = 'generated' AND EXISTS (SELECT 1 FROM queue q WHERE q.rid = ?1 AND q.task = '${TASK}'
      AND q.result = ${TABLE}.new_result AND q.status = 'done' AND q.outcome IN ('unwritten', 'written'))`).bind(rid, now).run()
  return r.meta.changes === 1
}

/**
 * After the Worker has written: put the queue row's `force` back to the snapshot's value (so a later Worker
 * pass never overwrites a brief because of us), then queued -> written. The same for rolled-back rows whose
 * old brief the Worker has written back. One batch; every statement is conditional, so repeating it is safe.
 * Returns how many rows became written.
 */
export async function markWritten(db: MiniD1, runId: string, now: number): Promise<number> {
  const [, written] = await db.batch([
    db.prepare(`UPDATE queue SET force = (SELECT r.old_force FROM ${TABLE} r WHERE r.rid = queue.rid), updated_at = ?2
      WHERE task = '${TASK}' AND rid IN (SELECT rid FROM ${TABLE} WHERE run_id = ?1 AND state = 'queued')
        AND status = 'done' AND outcome = 'written'
        AND result = (SELECT r.new_result FROM ${TABLE} r WHERE r.rid = queue.rid)
        AND force != (SELECT r.old_force FROM ${TABLE} r WHERE r.rid = queue.rid)`).bind(runId, now),
    db.prepare(`UPDATE ${TABLE} SET state = 'written', updated_at = ?2
      WHERE run_id = ?1 AND state = 'queued' AND EXISTS (SELECT 1 FROM queue q WHERE q.rid = ${TABLE}.rid AND q.task = '${TASK}'
        AND q.status = 'done' AND q.outcome = 'written' AND q.result = ${TABLE}.new_result AND q.force = ${TABLE}.old_force)`).bind(runId, now),
    db.prepare(`UPDATE queue SET force = (SELECT r.old_force FROM ${TABLE} r WHERE r.rid = queue.rid), updated_at = ?2
      WHERE task = '${TASK}' AND rid IN (SELECT rid FROM ${TABLE} WHERE run_id = ?1 AND state = 'rolled-back')
        AND status = 'done' AND outcome = 'written'
        AND result = (SELECT r.old_result FROM ${TABLE} r WHERE r.rid = queue.rid)
        AND force != (SELECT r.old_force FROM ${TABLE} r WHERE r.rid = queue.rid)`).bind(runId, now),
  ])
  return written.meta.changes
}

/** Rows whose new brief the Worker could not write (quarantined, rejected, skipped), for the report. */
export async function deliveryProblems(db: MiniD1, runId: string): Promise<Array<{ rid: string; status: string; outcome: string | null; last_error: string | null }>> {
  const r = await db.prepare(`SELECT q.rid, q.status, q.outcome, q.last_error FROM ${TABLE} r JOIN queue q ON q.rid = r.rid AND q.task = '${TASK}'
    WHERE r.run_id = ?1 AND r.state = 'queued' AND NOT (q.status = 'done' AND q.outcome IN ('unwritten', 'written'))`).bind(runId).all<any>()
  return r.results
}

/**
 * Rollback, the same way forward: the queue row gets the OLD brief back as a forced unwritten result and
 * the Worker writes it. Only rows still carrying our new brief are touched. One batch: the queue update, then
 * the state, which follows from the queue (it now holds the old brief). If a batch were ever cut short,
 * running rollback again finishes it. True when this call marked the row rolled-back.
 */
export async function rollbackRow(db: MiniD1, rid: string, now: number): Promise<boolean> {
  const [, state] = await db.batch([
    db.prepare(`UPDATE queue SET
        result = (SELECT r.old_result FROM ${TABLE} r WHERE r.rid = queue.rid),
        model = (SELECT r.old_model FROM ${TABLE} r WHERE r.rid = queue.rid),
        force = 1, status = 'done', outcome = 'unwritten', terminal_reason = NULL, last_error = '${PROMPT_VERSION} rollback', updated_at = ?2
      WHERE rid = ?1 AND task = '${TASK}'
        AND EXISTS (SELECT 1 FROM ${TABLE} r WHERE r.rid = queue.rid AND r.state IN ('queued', 'written') AND r.new_result = queue.result)`).bind(rid, now),
    db.prepare(`UPDATE ${TABLE} SET state = 'rolled-back', updated_at = ?2
      WHERE rid = ?1 AND state IN ('queued', 'written')
        AND EXISTS (SELECT 1 FROM queue q WHERE q.rid = ?1 AND q.task = '${TASK}' AND q.result = ${TABLE}.old_result)`).bind(rid, now),
  ])
  return state.meta.changes === 1
}

export async function counts(db: MiniD1, runId: string): Promise<Array<{ slice: string; state: string; n: number; neurons: number }>> {
  const r = await db.prepare(`SELECT slice, state, COUNT(*) AS n, ROUND(SUM(neurons), 1) AS neurons FROM ${TABLE} WHERE run_id = ?1 GROUP BY slice, state ORDER BY slice, state`).bind(runId).all<any>()
  return r.results
}

/** The Worker's own spend so far today (UTC), from its D1 ledger, without the runner's `regen:` rows. */
export async function workerSpendToday(db: MiniD1, day: string): Promise<number> {
  const r = await db.prepare(`SELECT COALESCE(SUM(neurons), 0) AS n FROM spend WHERE day = ?1 AND model NOT LIKE '${SPEND_PREFIX}%'`).bind(day).first<{ n: number }>()
  return Number(r?.n ?? 0)
}

/** A Worker tick at most this old describes the Worker that is deployed now. */
export const LAST_TICK_FRESH_MS = 15 * 60_000

/**
 * Whether the deployed Worker keeps `regen:` rows out of its live budget: its last tick (D1 state `last_tick`,
 * written every minute) is fresh and reports `neuronsRegen`, which only a Worker with the split writes. An
 * older Worker, one rolled back, a stale or unreadable last tick: false.
 */
export async function workerSplitsRegen(db: MiniD1, now: number): Promise<boolean> {
  const r = await db.prepare(`SELECT value FROM state WHERE key = 'last_tick'`).first<{ value: string }>()
  let last: any
  try {
    last = JSON.parse(r?.value ?? '')
  } catch {
    return false
  }
  const at = Date.parse(last?.at)
  return typeof last?.neuronsRegen === 'number' && Number.isFinite(at) && at <= now + 60_000 && now - at <= LAST_TICK_FRESH_MS
}

/** The Worker's daily totals since a UTC day, without the runner's `regen:` rows, for the headroom. */
export async function workerDays(db: MiniD1, sinceDay: string): Promise<Array<{ day: string; n: number }>> {
  const r = await db.prepare(`SELECT day, SUM(neurons) AS n FROM spend WHERE day >= ?1 AND model NOT LIKE '${SPEND_PREFIX}%' GROUP BY day ORDER BY day`).bind(sinceDay).all<{ day: string; n: number }>()
  return r.results
}

/**
 * Book one settled call into the Worker's D1 `spend` table as `regen:<model>`, the same upsert the Worker
 * uses (db.ts recordSpend), so the Worker's own daily guard (SUM over the day) counts the runner's spend.
 */
export async function recordSpend(db: MiniD1, s: { day: string; model: string; neurons: number; inTokens: number; outTokens: number }): Promise<void> {
  await db.prepare(`INSERT INTO spend (day, model, neurons, calls, in_tokens, out_tokens) VALUES (?1, ?2, ?3, 1, ?4, ?5)
     ON CONFLICT(day, model) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1,
       in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens`)
    .bind(s.day, SPEND_PREFIX + s.model, s.neurons, s.inTokens, s.outTokens).run()
}
