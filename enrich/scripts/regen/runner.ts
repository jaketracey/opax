// 5b-cheap regeneration loop. Generates with the Worker's own generate() (same prompts, schema, validators,
// retry and escalation), meters every call into the ledger, and hands each new brief to the Worker through
// the queue (see store.queueNewBrief). It never writes the knowledge box itself.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readClassifications } from '../../src/classify.ts'
import { generate } from '../../src/generate.ts'
import { isHistoricSpeech } from '../../src/historic.ts'
import { KbBackpressure, type KbApi, type KbResource } from '../../src/kb.ts'
import type { PromptRecord } from '../../src/prompts.ts'
import { readModelReply } from '../../src/extract.ts'
import { clip, existingSummary, pickText, wordCount } from '../../src/text.ts'
import { admit, appendDurable, classifyResponse, MAX_SKIPS_IN_A_ROW, meter, SkipItem, StopRun, stopRequested, upperFor, USD_PER_NEURON, utcDayOf, type Caps, type Ledger } from './guard.ts'
import type { MiniD1 } from './d1rest.ts'
import { outsideSlice } from './slices.ts'
import * as store from './store.ts'
import type { RegenRow } from './store.ts'

export const PRIMARY_MODEL = '@cf/qwen/qwen3.8-27b'
export const ESCALATION_MODEL = '@cf/openai/gpt-oss-120b'
/** Pilot max completion was 143 tokens; the validator caps a brief near 170. Smaller cap = smaller reservation. */
export const PRIMARY_MAX_TOKENS = 256
/** gpt-oss reasons before it answers; keep the Worker's own limit. */
export const ESCALATION_MAX_TOKENS = 4000

export interface AiPost {
  /**
   * One Workers AI request. `gate` must be called immediately before the request is sent (after any token
   * refresh or other wait); it throws StopRun when the run has been stopped meanwhile, and nothing is sent.
   */
  post(model: string, body: Record<string, unknown>, gate: () => void): Promise<{ status: number; raw: string }>
}

export interface RunDeps {
  db: MiniD1
  kb: Pick<KbApi, 'getResource'>
  ai: AiPost
  ledger: Ledger
  /** fsynced copy of every generated brief: a result is never paid for twice. */
  resultsPath: string
  stopFile: string
  caps: Caps
  /** The Worker's spend so far today (UTC), without the runner's own `regen:` rows; may be cached briefly by the caller. */
  workerSpendToday: (day: string) => Promise<number>
  /**
   * Whether the deployed Worker keeps our `regen:` rows out of its live budget (store.workerSplitsRegen: its
   * last tick reports `neuronsRegen`). Then our spend counts only against its overall 1.5M cap, and the daily
   * share (guard.ts admit) keeps the live budget's remainder free. Only `true` counts. May be cached briefly.
   */
  workerSplitsRegen: () => Promise<boolean>
  /**
   * Only read while the Worker does NOT split our spend out (an older Worker, or one rolled back): whether it
   * is on its backfill budget (any low-priority row still to do, its own hasBackfill). Without backfill that
   * Worker is on STEADY_NEURON_BUDGET (150k) and counts our rows against it, so the runner admits nothing.
   * Only `true` counts; anything else, or a failed read, pauses. May be cached briefly by the caller.
   */
  backfillActive: () => Promise<boolean>
  /** Book a settled call into the Worker's D1 `spend` table (as `regen:<model>`) so the Worker's own guard sees it. */
  recordSpend: (s: { day: string; model: string; neurons: number; inTokens: number; outTokens: number }) => Promise<void>
  now: () => number
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

export interface RunOptions {
  runId: string
  concurrency: number
  /** Stop after this many items were attempted (the pilot). */
  limit?: number
  /**
   * Pilot: hold EVERY row (state 'held'); nothing reaches the queue, so nothing is written to production,
   * until `release` picks a variant. 'role' rows also get the plain-b variant generated for comparison.
   */
  compare?: boolean
  /**
   * When paused, wait and continue (else return 'paused'): to the next UTC day when today's share is used up,
   * or STEADY_RECHECK_MS at a time for the other pauses (an older Worker with no backfill, a failed read).
   */
  waitForNextDay?: boolean
}

export type RunEnd = { end: 'done' | 'limit' | 'paused' } | { end: 'stopped'; reason: string }

/** A pause that is not today's share (an older Worker with no backfill, a failed read): look again this often. */
export const STEADY_RECHECK_MS = 10 * 60_000
export const NO_BACKFILL = 'the deployed Worker still counts our spend against its live budget (its last tick has no neuronsRegen) and has no backfill rows, so it is on its steady budget (150k): paused so live enrichment is never starved'
export const READ_FAILED = 'could not read the Worker\'s spend or state: paused, nothing sent'

/** The Worker's prompt record (tick.ts processRid), plus speaker_role for the 'role' variant. */
export function recordFor(resource: KbResource, rid: string, variant: 'b' | 'role'): PromptRecord {
  const text = pickText(resource.data?.texts)
  const historic = isHistoricSpeech(resource)
  const tag = (labelset: string): string | null => readClassifications(resource).find((c) => c.labelset === labelset && !c.cancelled_by_user)?.label ?? null
  return {
    rid,
    slug: resource.slug ?? null,
    kind: tag('kind') ?? 'speech',
    title: resource.title ?? '',
    state: tag('state'),
    party: tag('party'),
    words: wordCount(text),
    text: clip(text),
    historic,
    nameText: historic ? text : undefined,
    ...(variant === 'role' ? { speaker_role: tag('speaker_type') } : {}),
  }
}

interface ItemCtx {
  rid: string
  calls: number
  neurons: number
  model: string | null
  reservation: { id: string; upper: number; day: string } | null
  stop: StopRun | null
  skip: SkipItem | null
  paused: string | null
  /** A request went out and no answer came back: it may have been billed, so the row is never retried automatically. */
  unanswered: boolean
}

const sameBrief = (a: string | null | undefined, b: string | null | undefined): boolean => (a ?? '').trim() === (b ?? '').trim()

export class Runner {
  private stop: StopRun | null = null
  private paused: string | null = null
  /** Why the run is paused: today's share ('daily', resumes next UTC day), or anything else ('recheck'). */
  private pauseKind: 'daily' | 'recheck' = 'daily'
  private kbFailures = 0
  private skipsInARow = 0
  private lastSettle = -Infinity
  attempted = 0

  private readonly d: RunDeps
  private readonly o: RunOptions
  constructor(d: RunDeps, o: RunOptions) {
    this.d = d
    this.o = o
  }

  /** A stop, a pause or the STOP file; true when the call must not go out. */
  private blocked(ctx: ItemCtx): boolean {
    if (this.stop) {
      ctx.stop = this.stop
      return true
    }
    if (this.paused) {
      ctx.paused = this.paused
      return true
    }
    if (stopRequested(this.d.stopFile)) {
      ctx.stop = this.stop = new StopRun('STOP file present')
      return true
    }
    return false
  }

  /**
   * Before every request: stop, pause, STOP file; the Worker's spend (a D1 read); then the same checks again,
   * the ledger re-read from disk, the run cap and today's share; then the reservation is written. Nothing is
   * awaited between the second check and the reservation.
   */
  private async beforeCall(ctx: ItemCtx, model: string, body: Record<string, unknown>): Promise<boolean> {
    if (model === PRIMARY_MODEL) {
      body.max_tokens = PRIMARY_MAX_TOKENS
      // Thinking off, in the form Workers AI honours (5b pilot arm b). A top-level `enable_thinking` is ignored:
      // the model then reasons until max_tokens and every reply is cut off.
      body.chat_template_kwargs = { enable_thinking: false }
    } else body.max_tokens = ESCALATION_MAX_TOKENS
    if (this.blocked(ctx)) return false
    const day = utcDayOf(this.d.now())
    let worker: number
    let admits: boolean
    try {
      worker = await this.d.workerSpendToday(day)
      // A Worker that splits our rows out never starves live enrichment (the daily share below keeps its
      // budget free). An older one does on a steady day, so for it: no backfill, no admits.
      admits = (await this.d.workerSplitsRegen()) === true || (await this.d.backfillActive()) === true
    } catch (err) {
      if (this.blocked(ctx)) return false
      ctx.paused = this.paused = `${READ_FAILED} (${String((err as Error)?.message ?? err).slice(0, 200)})`
      this.pauseKind = 'recheck'
      return false
    }
    if (this.blocked(ctx)) return false // set while the D1 reads were in flight
    if (!admits) {
      ctx.paused = this.paused = NO_BACKFILL
      this.pauseKind = 'recheck'
      return false
    }
    this.d.ledger.sync()
    const upper = upperFor(model, body)
    const verdict = admit(this.d.caps, this.d.ledger.totals(), day, worker, upper)
    if (!verdict.ok) {
      if (verdict.kind === 'daily') {
        ctx.paused = this.paused = verdict.reason
        this.pauseKind = 'daily'
      } else ctx.stop = this.stop = new StopRun(verdict.reason)
      return false
    }
    const id = randomUUID()
    this.d.ledger.append({ t: 'reserve', id, ts: this.d.now(), day, rid: ctx.rid, model, upper })
    ctx.reservation = { id, upper, day }
    return true
  }

  /** Called by AiPost immediately before the request is sent: a stop or STOP file set during a wait sends nothing. */
  private gate(): void {
    if (this.stop) throw this.stop
    if (stopRequested(this.d.stopFile)) throw (this.stop = new StopRun('STOP file present'))
  }

  /** Copy a settled call into the Worker's D1 spend table. If that fails the run stops (the result in hand is kept). */
  private async book(ctx: ItemCtx, day: string, model: string, neurons: number, p: number | null, c: number | null): Promise<void> {
    if (!(neurons > 0)) return
    try {
      await this.d.recordSpend({ day, model, neurons, inTokens: p ?? 0, outTokens: c ?? 0 })
    } catch (err) {
      this.stop ??= new StopRun(`could not book spend into D1 (the Worker's guard would not see it): ${String((err as Error)?.message ?? err).slice(0, 200)}`)
      ctx.stop ??= this.stop
    }
  }

  /** The metered model call: settles the reservation from the response's usage, or stops / skips. */
  private async run(ctx: ItemCtx, model: string, body: Record<string, unknown>): Promise<unknown> {
    const res = ctx.reservation
    if (!res) throw (ctx.stop = this.stop = new StopRun('model call without a reservation'))
    ctx.reservation = null
    const settle = (status: number, neurons: number, source: 'usage' | 'upper' | 'none', p: number | null = null, c: number | null = null) =>
      this.d.ledger.append({ t: 'settle', id: res.id, ts: this.d.now(), day: res.day, rid: ctx.rid, model, status, neurons, prompt_tokens: p, completion_tokens: c, source, usd: neurons * USD_PER_NEURON })
    let status: number
    let raw: string
    try {
      ;({ status, raw } = await this.d.ai.post(model, body, () => this.gate()))
    } catch (err) {
      if (err instanceof StopRun) {
        settle(0, 0, 'none') // raised before the request went out (the gate, or the OAuth token could not be refreshed)
        throw (ctx.stop = this.stop = err)
      }
      // Unknown whether it was billed: book the upper bound and stop.
      settle(0, res.upper, 'upper')
      await this.book(ctx, res.day, model, res.upper, null, null)
      ctx.unanswered = true
      throw (ctx.stop = this.stop = new StopRun(`network error: ${String((err as Error)?.message ?? err).slice(0, 200)}`))
    }
    const v = classifyResponse(status, raw)
    if (v.action !== 'ok') {
      settle(status, 0, 'none')
      if (v.action === 'skip') {
        this.skipsInARow += 1
        if (this.skipsInARow >= MAX_SKIPS_IN_A_ROW) throw (ctx.stop = this.stop = new StopRun(`${this.skipsInARow} per-item errors in a row, the last: ${v.reason}`))
        throw (ctx.skip = new SkipItem(v.reason))
      }
      throw (ctx.stop = this.stop = new StopRun(v.reason))
    }
    this.skipsInARow = 0
    let m
    try {
      m = meter(model, v.json.result, res.upper)
    } catch (err) {
      settle(status, res.upper, 'upper')
      await this.book(ctx, res.day, model, res.upper, null, null)
      throw (ctx.stop = this.stop = err instanceof StopRun ? err : new StopRun(String(err)))
    }
    settle(status, m.neurons, m.source, m.promptTokens, m.completionTokens)
    await this.book(ctx, res.day, model, m.neurons, m.promptTokens, m.completionTokens)
    if (m.source === 'upper') this.d.log(`note ${ctx.rid}: response had no usage; booked the upper bound ${res.upper}`)
    ctx.calls += 1
    ctx.neurons += m.neurons
    ctx.model = model
    // A qwen reply cut off at max_tokens: how the ignored thinking switch showed (pilot, 14 Nov). Paid for and
    // booked above; the row ends failed (never re-run) and nothing more is admitted.
    if (model === PRIMARY_MODEL && readModelReply(v.json.result, false).finishReason === 'length') {
      throw (ctx.stop = this.stop = new StopRun(`${model} reply cut off at max_tokens ${body.max_tokens} (finish_reason 'length') on ${ctx.rid}: thinking may be on again`))
    }
    return v.json.result
  }

  private async generateOne(ctx: ItemCtx, record: PromptRecord): Promise<{ value: string; model: string } | null> {
    const gen = await generate({
      ai: { run: (model: string, body: Record<string, unknown>) => this.run(ctx, model, body) } as any,
      record,
      tasks: ['summary'],
      primaryModel: PRIMARY_MODEL,
      escalationModel: ESCALATION_MODEL,
      maxTokens: ESCALATION_MAX_TOKENS,
      mayContinue: () => !this.stop && !this.paused && !ctx.skip,
      beforeCall: (model, body) => this.beforeCall(ctx, model, body),
      onSpend: async () => {},
      onReject: async (i) => this.d.log(`reject ${ctx.rid} attempt ${i.attempt} ${i.model}: ${i.reasons.join('; ')}`),
    })
    const s = gen.results.summary as { value?: string; model?: string } | undefined
    return s?.value ? { value: s.value, model: s.model ?? ctx.model ?? PRIMARY_MODEL } : null
  }

  /** One row, start to hand-off. Never throws except KbBackpressure (row released to pending). */
  async processItem(row: RegenRow): Promise<void> {
    const { db, now } = this.d
    if (this.stop || this.paused) return
    if (!(await store.transition(db, row.rid, 'pending', 'generating', now()))) return
    this.attempted += 1
    const q = await store.queueRow(db, row.rid)
    if (!q || q.status !== 'done' || q.outcome !== 'written' || q.terminal_reason || !sameBrief(q.result, row.old_result)) {
      await store.transition(db, row.rid, 'generating', 'skipped', now(), { note: 'queue row changed since the snapshot' })
      return
    }
    let resource: KbResource | null
    try {
      resource = await this.d.kb.getResource(row.rid)
      this.kbFailures = 0
    } catch (err) {
      await store.transition(db, row.rid, 'generating', 'pending', now())
      throw err
    }
    if (!resource) {
      await store.transition(db, row.rid, 'generating', 'skipped', now(), { note: 'not in the knowledge box' })
      return
    }
    const outside = outsideSlice(row.slice, row, resource)
    if (outside) {
      await store.transition(db, row.rid, 'generating', 'skipped', now(), { note: `outside the ${row.slice} slice: ${outside}` })
      return
    }
    const live = existingSummary(resource.data?.texts)
    if (!sameBrief(live, row.old_result)) {
      await store.transition(db, row.rid, 'generating', 'skipped', now(), { note: 'live brief differs from the snapshot', kb_brief: live })
      return
    }
    const ctx: ItemCtx = { rid: row.rid, calls: 0, neurons: 0, model: null, reservation: null, stop: null, skip: null, paused: null, unanswered: false }
    const main = await this.generateOne(ctx, recordFor(resource, row.rid, row.variant))
    let alt: { value: string; model: string } | null = null
    const altVariant = row.variant === 'role' ? 'b' : null
    if (main && this.o.compare && altVariant && !ctx.stop && !ctx.paused) alt = await this.generateOne(ctx, recordFor(resource, row.rid, altVariant))

    if (main) {
      const held = !!this.o.compare
      appendDurable(this.d.resultsPath, { rid: row.rid, run_id: row.run_id, variant: row.variant, model: main.model, value: main.value, alt_variant: alt ? altVariant : null, alt_model: alt?.model ?? null, alt_value: alt?.value ?? null, held, neurons: ctx.neurons, calls: ctx.calls, ts: now() })
      await store.transition(db, row.rid, 'generating', held ? 'held' : 'generated', now(), {
        new_result: main.value, new_model: main.model, neurons: ctx.neurons, calls: ctx.calls, kb_brief: live,
        ...(alt ? { alt_variant: altVariant, alt_result: alt.value, alt_model: alt.model } : {}),
      })
      if (!held && !(await store.queueNewBrief(db, row.rid, now()))) {
        await store.transition(db, row.rid, 'generated', 'skipped', now(), { note: 'queue row changed before the hand-off; new brief kept here only' })
      }
      return
    }
    if (ctx.unanswered) {
      await store.transition(db, row.rid, 'generating', 'interrupted', now(), { note: 'a request got no answer (may have been billed); not retried automatically', neurons: ctx.neurons, calls: ctx.calls })
      return
    }
    if (!ctx.skip && ctx.calls === 0 && (ctx.stop || ctx.paused || this.stop || this.paused)) {
      await store.transition(db, row.rid, 'generating', 'pending', now()) // nothing was generated: try again later
      return
    }
    const why = ctx.skip?.reason ?? ctx.stop?.reason ?? 'no valid brief after retries and escalation'
    await store.transition(db, row.rid, 'generating', 'failed', now(), { note: why.slice(0, 500), neurons: ctx.neurons, calls: ctx.calls })
    if (ctx.skip) this.d.log(`skip ${row.rid}: ${ctx.skip.reason}`)
  }

  /** Start-up: finish what a crash left. A stored result is reused; nothing is regenerated. */
  async recover(): Promise<void> {
    const { db, now } = this.d
    const stored = new Map<string, any>()
    if (existsSync(this.d.resultsPath)) {
      for (const line of readFileSync(this.d.resultsPath, 'utf8').split('\n')) {
        if (!line.trim()) continue
        const r = JSON.parse(line)
        if (r.run_id === this.o.runId) stored.set(r.rid, r)
      }
    }
    for (const row of await store.rowsIn(db, this.o.runId, ['generating'])) {
      const r = stored.get(row.rid)
      if (r) {
        // Held if it was generated in compare mode (even when its second variant failed), or if this run compares.
        const held = !!(r.held || r.alt_value || this.o.compare)
        await store.transition(db, row.rid, 'generating', held ? 'held' : 'generated', now(), {
          new_result: r.value, new_model: r.model, neurons: r.neurons, calls: r.calls,
          ...(r.alt_value ? { alt_variant: r.alt_variant, alt_result: r.alt_value, alt_model: r.alt_model } : {}),
        })
        this.d.log(`recovered ${row.rid} from the local results file`)
      } else {
        await store.transition(db, row.rid, 'generating', 'interrupted', now(), { note: 'found generating at start-up with no stored result; not retried automatically' })
        this.d.log(`interrupted ${row.rid}`)
      }
    }
    for (const row of await store.rowsIn(db, this.o.runId, ['generated'])) {
      if (!(await store.queueNewBrief(db, row.rid, now()))) {
        await store.transition(db, row.rid, 'generated', 'skipped', now(), { note: 'queue row changed before the hand-off; new brief kept here only' })
      }
    }
  }

  async loop(): Promise<RunEnd> {
    await this.recover()
    for (;;) {
      if (this.d.now() - this.lastSettle >= 10 * 60_000) {
        // Rows the Worker has written since: force back to the snapshot's value, state written.
        await store.markWritten(this.d.db, this.o.runId, this.d.now())
        this.lastSettle = this.d.now()
      }
      if (stopRequested(this.d.stopFile)) this.stop ??= new StopRun('STOP file present')
      if (this.stop) return this.halt(this.stop.reason)
      const left = this.o.limit === undefined ? Infinity : this.o.limit - this.attempted
      if (left <= 0) return { end: 'limit' }
      const batch = await store.nextPending(this.d.db, this.o.runId, Math.min(this.o.concurrency * 4, left))
      if (!batch.length) return { end: 'done' }
      let next = 0
      const worker = async () => {
        while (next < batch.length && !this.stop && !this.paused && this.attempted < (this.o.limit ?? Infinity)) {
          const row = batch[next++]
          try {
            await this.processItem(row)
          } catch (err) {
            if (err instanceof KbBackpressure) {
              this.kbFailures += 1
              this.d.log(`knowledge box pushed back (${this.kbFailures}): ${err.message}`)
              if (this.kbFailures >= 5) this.stop ??= new StopRun(`knowledge box unavailable: ${err.message}`)
              else await this.d.sleep(60_000)
            } else {
              this.stop ??= new StopRun(`unexpected: ${String((err as Error)?.stack ?? err).slice(0, 400)}`)
            }
          }
        }
      }
      await Promise.all(Array.from({ length: this.o.concurrency }, worker))
      const { stop, paused } = this.flags() // set by the workers above
      if (stop) return this.halt(stop.reason)
      if (paused) {
        if (!this.o.waitForNextDay) return { end: 'paused' }
        this.d.log(`paused: ${paused}`)
        if (this.pauseKind === 'recheck') await this.sleepFor(STEADY_RECHECK_MS)
        else await this.sleepToNextDay()
        this.paused = null
      }
    }
  }

  private flags(): { stop: StopRun | null; paused: string | null } {
    return { stop: this.stop, paused: this.paused }
  }

  private halt(reason: string): RunEnd {
    this.d.ledger.append({ t: 'stop', ts: this.d.now(), reason })
    this.d.log(`STOPPED: ${reason}`)
    return { end: 'stopped', reason }
  }

  private async sleepFor(ms: number): Promise<void> {
    const wake = this.d.now() + ms
    while (this.d.now() < wake) {
      if (stopRequested(this.d.stopFile)) return
      await this.d.sleep(Math.min(30_000, wake - this.d.now()))
    }
  }

  private async sleepToNextDay(): Promise<void> {
    const t = this.d.now()
    const wake = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate() + 1, 0, 5)
    while (this.d.now() < wake) {
      if (stopRequested(this.d.stopFile)) return
      await this.d.sleep(Math.min(30_000, wake - this.d.now()))
    }
  }
}

/**
 * Pilot release: queue the chosen variant of every held row (no model call). A plain row (variant b, no
 * alternate) has one result and is queued as it is; a role row is queued as the chosen variant, or left held
 * if that variant was not generated.
 */
export async function release(db: MiniD1, runId: string, variant: 'b' | 'role', now: number, dryRun: boolean, only?: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = []
  for (const row of await store.rowsIn(db, runId, ['held'])) {
    if (only && !only.has(row.rid)) continue // not listed: stays held
    const single = row.variant === 'b' && !row.alt_result
    const swap = !single && row.variant !== variant
    if (swap && (!row.alt_result || row.alt_variant !== variant)) {
      out.push(`${row.rid}: no ${variant} result stored; left held`)
      continue
    }
    out.push(`${row.rid}: queue ${single ? 'b (its only variant)' : variant}${swap ? ' (alternate)' : ''}`)
    if (dryRun) continue
    if (swap) {
      await db.prepare(`UPDATE ${store.TABLE} SET variant = alt_variant, new_result = alt_result, new_model = alt_model,
        alt_variant = ?2, alt_result = new_result, alt_model = new_model, updated_at = ?3 WHERE rid = ?1 AND state = 'held'`).bind(row.rid, row.variant, now).run()
    }
    await store.transition(db, row.rid, 'held', 'generated', now)
    if (!(await store.queueNewBrief(db, row.rid, now))) await store.transition(db, row.rid, 'generated', 'skipped', now, { note: 'queue row changed before the hand-off' })
  }
  return out
}
