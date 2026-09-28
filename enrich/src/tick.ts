// One cron tick: discover, then process a bounded batch of claimed resources.

import { budgetView, nextUtcMidnight, utcDay } from './budget.ts'
import { hasTopicLabels, readClassifications } from './classify.ts'
import {
  MAX_TRANSIENT,
  addSpend,
  claimRids,
  finishRows,
  getState,
  isSummaryTask,
  logError,
  logRejection,
  pruneErrors,
  reclaimStale,
  releaseClaims,
  setState,
  spentOnDay,
  unwrittenRows,
  type Outcome,
  type QueueRow,
  type RowUpdate,
} from './db.ts'
import { discover } from './discover.ts'
import type { AiLike, Config } from './env.ts'
import { MAX_ATTEMPTS, generate, type Generation } from './generate.ts'
import { KbBackpressure, KbHttpError, type KbApi, type KbResource } from './kb.ts'
import type { PromptRecord, Task } from './prompts.ts'
import { clip, existingSummary, pickText, wordCount } from './text.ts'
import { UnsafeWrite, writeItem, type WriteItem, type WriteOutcome } from './write.ts'

export interface TickDeps {
  db: D1Database
  kb: KbApi
  ai: AiLike
  cfg: Config
  now: () => number
  log: (line: Record<string, unknown>) => void
  newToken: () => string
}

export interface TickStats {
  evt: 'tick'
  mode: 'live' | 'dry'
  discovered: Record<string, number>
  discoveryPartial: string[]
  discoveryErrors: string[]
  claimed: number
  rids: number
  written: number
  dry: number
  empty: number
  skipped: number
  noText: number
  missing: number
  retried: number
  quarantined: number
  transient: number
  flushed: number
  neuronsTick: number
  neuronsToday: number
  budget: number
  stop: string | null
  ms: number
}

/** Shared by the concurrent workers of one tick. */
interface Ctl {
  stop: string | null
  spent: number
  neuronsTick: number
  deadline: number
  consecutiveModelFailures: number
}

const kbBackoffKey = 'kb_backoff_until'
const aiPauseKey = 'ai_pause_until'

const errText = (err: unknown): string => String((err as Error)?.message ?? err).slice(0, 400)

/** Run `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: readonly T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
}

export async function runTick(d: TickDeps): Promise<TickStats> {
  const t0 = d.now()
  const day = utcDay(t0)
  const stats: TickStats = {
    evt: 'tick',
    mode: d.cfg.live ? 'live' : 'dry',
    discovered: {},
    discoveryPartial: [],
    discoveryErrors: [],
    claimed: 0,
    rids: 0,
    written: 0,
    dry: 0,
    empty: 0,
    skipped: 0,
    noText: 0,
    missing: 0,
    retried: 0,
    quarantined: 0,
    transient: 0,
    flushed: 0,
    neuronsTick: 0,
    neuronsToday: 0,
    budget: d.cfg.dailyBudget,
    stop: null,
    ms: 0,
  }
  const token = d.newToken()

  try {
    // 1. Should we process at all?
    const spent = await spentOnDay(d.db, day)
    stats.neuronsToday = spent
    // The processing deadline is soft: no new resource is started after it (in-flight ones finish).
    const ctl: Ctl = { stop: null, spent, neuronsTick: 0, deadline: d.now() + d.cfg.tickSoftMs, consecutiveModelFailures: 0 }
    const kbUntil = Number((await getState(d.db, kbBackoffKey)) ?? 0)
    const aiUntil = Number((await getState(d.db, aiPauseKey)) ?? 0)
    if (aiUntil > t0) ctl.stop = 'ai-paused'
    else if (kbUntil > t0) ctl.stop = 'kb-backoff'
    else if (budgetView(spent, d.cfg.dailyBudget).exhausted) ctl.stop = 'budget'

    if (!ctl.stop) {
      await reclaimStale(d.db, t0)

      // 2. Live mode first delivers results already read (dry-run results, or writes that met backpressure).
      if (d.cfg.live) await flush(d, ctl, stats)

      // 3. Claim and process.
      if (!ctl.stop) {
        const rows = await claimRids(d.db, d.cfg.batchSize, d.now(), token)
        stats.claimed = rows.length
        const byRid = new Map<string, QueueRow[]>()
        for (const row of rows) byRid.set(row.rid, [...(byRid.get(row.rid) ?? []), row])
        stats.rids = byRid.size
        await pool([...byRid.entries()], d.cfg.concurrency, async ([rid, group]) => {
          if (!mayContinue(d, ctl)) return // stays claimed; released below
          try {
            await processRid(d, ctl, day, rid, group, stats)
          } catch (err) {
            // A bug or an unexpected failure must not lose or double-count the row.
            stats.transient += 1
            await logError(d.db, d.now(), 'exception', errText(err), rid)
            await finishRows(d.db, group.map((row) => retryOrQuarantine(row, `unexpected: ${errText(err)}`, 0)), d.now())
          }
        })
      }
    }

    stats.stop = ctl.stop
    stats.neuronsTick = ctl.neuronsTick
    stats.neuronsToday = ctl.spent

    // 4. Discovery runs AFTER processing so that a slow or timed-out catalog can never eat the
    //    tick's model time (seen on the first remote tick). Rows found here are claimed next tick.
    //    It is cheap, and independent of the model budget and of KB write backoff.
    try {
      const found = await discover({
        db: d.db,
        kb: d.kb,
        now: d.now(),
        startIso: d.cfg.discoveryStart,
        maxPages: d.cfg.discoveryMaxPages,
        overlapS: d.cfg.discoveryOverlapS,
        maxMs: d.cfg.discoveryMaxMs,
        clock: d.now,
      })
      stats.discovered = found.enqueued
      stats.discoveryPartial = found.partial
      stats.discoveryErrors = found.errors
      for (const e of found.errors) await logError(d.db, d.now(), 'discovery', e)
    } catch (err) {
      stats.discoveryErrors.push(errText(err))
      await logError(d.db, d.now(), 'discovery', errText(err))
    }
  } finally {
    // Anything this tick still holds (never started, or cut off) goes back to pending.
    try {
      await releaseClaims(d.db, token, d.now())
      await pruneErrors(d.db)
    } catch {
      /* the stale-claim sweep will catch it */
    }
    stats.ms = d.now() - t0
    try {
      await setState(d.db, 'last_tick', JSON.stringify({ at: new Date(t0).toISOString(), ...stats }), d.now())
    } catch {
      /* status only */
    }
    d.log(stats as unknown as Record<string, unknown>)
  }
  return stats
}

function mayContinue(d: TickDeps, ctl: Ctl): boolean {
  return !ctl.stop && ctl.spent < d.cfg.dailyBudget && d.now() < ctl.deadline
}

/** A row that hit an infrastructure failure goes back to pending, or is set aside after too many. */
function retryOrQuarantine(row: QueueRow, message: string, neurons: number): RowUpdate {
  const transient = row.transient + 1
  if (transient >= MAX_TRANSIENT) {
    return { rid: row.rid, task: row.task, status: 'quarantined', lastError: `${transient} infrastructure failures; last: ${message}`, addTransient: 1, addNeurons: neurons }
  }
  return { rid: row.rid, task: row.task, status: 'pending', lastError: message, addTransient: 1, addNeurons: neurons }
}

async function backoffKb(d: TickDeps, ctl: Ctl, err: KbBackpressure): Promise<void> {
  const seconds = Math.min(300, Math.max(30, err.retryAfterS ?? 60))
  ctl.stop = 'kb-backpressure'
  await setState(d.db, kbBackoffKey, String(d.now() + seconds * 1000), d.now())
  await logError(d.db, d.now(), 'kb-backpressure', `${err.message} (backing off ${seconds}s)`)
}

const kindOf = (resource: KbResource, task: string): string =>
  readClassifications(resource).find((c) => c.labelset === 'kind' && !c.cancelled_by_user)?.label ?? (task === 'release_summary' ? 'press_release' : 'speech')

const tagOf = (resource: KbResource, labelset: string): string | null =>
  readClassifications(resource).find((c) => c.labelset === labelset && !c.cancelled_by_user)?.label ?? null

const taskOf = (task: string): Task => (isSummaryTask(task) ? 'summary' : 'topics')

function count(stats: TickStats, outcome: Outcome): void {
  if (outcome === 'written') stats.written += 1
  else if (outcome === 'dry' || outcome === 'unwritten') stats.dry += 1
  else if (outcome === 'empty') stats.empty += 1
  else if (outcome === 'skipped-existing') stats.skipped += 1
  else if (outcome === 'no-text') stats.noText += 1
  else if (outcome === 'missing') stats.missing += 1
}

async function processRid(d: TickDeps, ctl: Ctl, day: string, rid: string, rows: QueueRow[], stats: TickStats): Promise<void> {
  const updates: RowUpdate[] = []

  // ---- read the resource
  let resource: KbResource | null
  try {
    resource = await d.kb.getResource(rid)
  } catch (err) {
    if (err instanceof KbBackpressure) {
      await backoffKb(d, ctl, err) // rows stay claimed and are released at the end of the tick
      return
    }
    throw err
  }
  if (!resource) {
    for (const row of rows) updates.push({ rid, task: row.task, status: 'done', outcome: 'missing', lastError: 'resource not found in the knowledge box' })
    stats.missing += rows.length
    await finishRows(d.db, updates, d.now())
    return
  }

  const texts = resource.data?.texts
  const text = pickText(texts)
  const words = wordCount(text)
  const briefPresent = existingSummary(texts) !== ''
  const topicsPresent = hasTopicLabels(resource)

  // ---- settle what needs no model
  const todo: QueueRow[] = []
  for (const row of rows) {
    if (words < 3) updates.push({ rid, task: row.task, status: 'done', outcome: 'no-text', lastError: null })
    else if (isSummaryTask(row.task) && briefPresent && !row.force) updates.push({ rid, task: row.task, status: 'done', outcome: 'skipped-existing', lastError: null })
    else if (!isSummaryTask(row.task) && topicsPresent && !row.force) updates.push({ rid, task: row.task, status: 'done', outcome: 'skipped-existing', lastError: null })
    else todo.push(row)
  }
  for (const u of updates) count(stats, u.outcome as Outcome)
  if (todo.length === 0) {
    await finishRows(d.db, updates, d.now())
    return
  }

  // ---- generate
  const tasks = [...new Set(todo.map((r) => taskOf(r.task)))]
  const record: PromptRecord = {
    rid,
    slug: resource.slug ?? null,
    kind: kindOf(resource, todo[0].task),
    title: resource.title ?? '',
    state: tagOf(resource, 'state'),
    party: tagOf(resource, 'party'),
    words,
    text: clip(text),
  }
  const gen: Generation = await generate({
    ai: d.ai,
    record,
    tasks,
    primaryModel: d.cfg.primaryModel,
    escalationModel: d.cfg.escalationModel,
    maxTokens: d.cfg.maxTokens,
    mayContinue: () => mayContinue(d, ctl),
    onReject: (info) => logRejection(d.db, d.now(), rid, info.task, info.model, info.attempt, info.reasons.join('; '), info.sample),
    onSpend: async (spend) => {
      ctl.spent += spend.neurons
      ctl.neuronsTick += spend.neurons
      if (ctl.spent >= d.cfg.dailyBudget) ctl.stop ??= 'budget'
      await addSpend(d.db, day, spend.model, spend.neurons, spend.promptTokens, spend.completionTokens)
    },
  })

  if (gen.unavailable) {
    ctl.consecutiveModelFailures += 1
    await logError(d.db, d.now(), 'model', gen.unavailable.message, rid)
    if (gen.unavailable.quota) {
      ctl.stop = 'ai-quota'
      await setState(d.db, aiPauseKey, String(nextUtcMidnight(d.now())), d.now())
    } else if (ctl.consecutiveModelFailures >= 5) {
      ctl.stop = 'model-failing'
    }
  } else {
    ctl.consecutiveModelFailures = 0
  }

  // ---- place each outstanding row
  const toWrite: Array<{ row: QueueRow; item: WriteItem; neurons: number; model: string; rejected: number }> = []
  for (const row of todo) {
    const r = gen.results[taskOf(row.task)]
    if (!r) continue
    if (r.value !== undefined) {
      const value = isSummaryTask(row.task) ? (r.value as string) : (r.value as string[])
      toWrite.push({ row, item: { task: row.task, force: row.force === 1, value }, neurons: r.neurons, model: r.model, rejected: r.rejected })
      continue
    }
    const totalRejected = row.attempts + r.rejected
    if (totalRejected >= MAX_ATTEMPTS) {
      const why = `rejected after ${totalRejected} attempts (${d.cfg.primaryModel}, then ${d.cfg.escalationModel}): ${r.complaints.join('; ')}`
      updates.push({ rid, task: row.task, status: 'quarantined', model: r.model, lastError: why.slice(0, 900), addAttempts: r.rejected, addNeurons: r.neurons })
      stats.quarantined += 1
      await logError(d.db, d.now(), 'quarantined', why, rid, row.task)
    } else if (gen.unavailable) {
      const u = retryOrQuarantine(row, gen.unavailable.message, r.neurons)
      updates.push({ ...u, model: r.model, addAttempts: r.rejected })
      if (u.status === 'quarantined') stats.quarantined += 1
      else stats.transient += 1
    } else {
      // Cut short (budget or tick deadline) with attempts to spare: try again next tick.
      updates.push({ rid, task: row.task, status: 'pending', model: r.model, lastError: 'cut short before every attempt ran', addAttempts: r.rejected, addNeurons: r.neurons })
      stats.retried += 1
    }
  }

  // ---- deliver accepted values
  let backpressure: KbBackpressure | null = null
  for (const w of toWrite) {
    const base: RowUpdate = { rid, task: w.row.task, status: 'done', model: w.model, addAttempts: w.rejected, addNeurons: w.neurons, result: Array.isArray(w.item.value) ? JSON.stringify(w.item.value) : w.item.value }
    if (!d.cfg.live) {
      const outcome: Outcome = Array.isArray(w.item.value) && w.item.value.length === 0 ? 'empty' : 'dry'
      updates.push({ ...base, outcome, lastError: null })
      count(stats, outcome)
      continue
    }
    if (backpressure) {
      updates.push({ ...base, outcome: 'unwritten', lastError: 'knowledge box pushed back; result kept for the next tick' })
      count(stats, 'unwritten')
      continue
    }
    try {
      const done: WriteOutcome = await writeItem(d.kb, rid, w.item)
      updates.push({ ...base, outcome: done.outcome, lastError: done.warning ?? null })
      count(stats, done.outcome)
      if (done.warning) await logError(d.db, d.now(), 'verify', done.warning, rid, w.row.task)
    } catch (err) {
      if (err instanceof KbBackpressure) {
        backpressure = err
        updates.push({ ...base, outcome: 'unwritten', lastError: errText(err) })
        count(stats, 'unwritten')
      } else if (err instanceof UnsafeWrite || err instanceof KbHttpError) {
        updates.push({ ...base, status: 'quarantined', outcome: 'unwritten', lastError: errText(err) })
        stats.quarantined += 1
        await logError(d.db, d.now(), err instanceof UnsafeWrite ? 'unsafe-write' : 'kb-rejected', errText(err), rid, w.row.task)
      } else {
        throw err
      }
    }
  }
  await finishRows(d.db, updates, d.now())
  if (backpressure) await backoffKb(d, ctl, backpressure)
}

/** Live mode: write results the model already produced, without paying for them again. */
async function flush(d: TickDeps, ctl: Ctl, stats: TickStats): Promise<void> {
  const rows = await unwrittenRows(d.db, d.cfg.batchSize * 2)
  const byRid = new Map<string, QueueRow[]>()
  for (const row of rows) byRid.set(row.rid, [...(byRid.get(row.rid) ?? []), row])
  await pool([...byRid.entries()], d.cfg.concurrency, async ([rid, group]) => {
    if (!mayContinue(d, ctl)) return
    const updates: RowUpdate[] = []
    for (const row of group) {
      if (ctl.stop) return
      const value = isSummaryTask(row.task) ? (row.result as string) : (JSON.parse(row.result as string) as string[])
      try {
        const done = await writeItem(d.kb, rid, { task: row.task, force: row.force === 1, value })
        updates.push({ rid, task: row.task, status: 'done', outcome: done.outcome, lastError: done.warning ?? null })
        stats.flushed += 1
        count(stats, done.outcome)
      } catch (err) {
        if (err instanceof KbBackpressure) {
          await backoffKb(d, ctl, err)
          break
        }
        if (err instanceof UnsafeWrite || err instanceof KbHttpError) {
          updates.push({ rid, task: row.task, status: 'quarantined', outcome: 'unwritten', lastError: errText(err) })
          stats.quarantined += 1
          await logError(d.db, d.now(), err instanceof UnsafeWrite ? 'unsafe-write' : 'kb-rejected', errText(err), rid, row.task)
        } else {
          await logError(d.db, d.now(), 'exception', errText(err), rid, row.task)
        }
      }
    }
    await finishRows(d.db, updates, d.now())
  })
}

