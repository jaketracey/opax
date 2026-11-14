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
import { clip, existingSummary, pickText, wordCount } from '../../src/text.ts'
import { admit, appendDurable, classifyResponse, meter, SkipItem, StopRun, stopRequested, upperFor, USD_PER_NEURON, utcDayOf, type Caps, type Ledger } from './guard.ts'
import type { MiniD1 } from './d1rest.ts'
import * as store from './store.ts'
import type { RegenRow } from './store.ts'

export const PRIMARY_MODEL = '@cf/qwen/qwen3.8-27b'
export const ESCALATION_MODEL = '@cf/openai/gpt-oss-120b'
/** Pilot max completion was 143 tokens; the validator caps a brief near 170. Smaller cap = smaller reservation. */
export const PRIMARY_MAX_TOKENS = 256
/** gpt-oss reasons before it answers; keep the Worker's own limit. */
export const ESCALATION_MAX_TOKENS = 4000

export interface AiPost {
  post(model: string, body: Record<string, unknown>): Promise<{ status: number; raw: string }>
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
  /** The Worker's spend so far today (UTC), may be cached briefly by the caller. */
  workerSpendToday: (day: string) => Promise<number>
  now: () => number
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

export interface RunOptions {
  runId: string
  concurrency: number
  /** Stop after this many items were attempted (the pilot). */
  limit?: number
  /** Pilot: for 'role' rows also generate the plain-b variant, store both, queue neither (state 'held'). */
  compare?: boolean
  /** When today's share is used up, sleep to the next UTC day and continue (else return 'paused'). */
  waitForNextDay?: boolean
}

export type RunEnd = { end: 'done' | 'limit' | 'paused' } | { end: 'stopped'; reason: string }

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
  private kbFailures = 0
  attempted = 0

  private readonly d: RunDeps
  private readonly o: RunOptions
  constructor(d: RunDeps, o: RunOptions) {
    this.d = d
    this.o = o
  }

  /** Before every request: STOP file, run cap, today's share; then the reservation is written. Atomic (no await after admission). */
  private async beforeCall(ctx: ItemCtx, model: string, body: Record<string, unknown>): Promise<boolean> {
    if (model === PRIMARY_MODEL) {
      body.max_tokens = PRIMARY_MAX_TOKENS
      body.enable_thinking = false // pilot arm b: qwen3.8 with thinking off
    } else body.max_tokens = ESCALATION_MAX_TOKENS
    if (this.stop) {
      ctx.stop = this.stop
      return false
    }
    if (this.paused) {
      ctx.paused = this.paused
      return false
    }
    if (stopRequested(this.d.stopFile)) {
      ctx.stop = this.stop = new StopRun('STOP file present')
      return false
    }
    const day = utcDayOf(this.d.now())
    const worker = await this.d.workerSpendToday(day)
    const upper = upperFor(model, body)
    const verdict = admit(this.d.caps, this.d.ledger.totals(), day, worker, upper)
    if (!verdict.ok) {
      if (verdict.kind === 'run-cap') ctx.stop = this.stop = new StopRun(verdict.reason)
      else ctx.paused = this.paused = verdict.reason
      return false
    }
    const id = randomUUID()
    this.d.ledger.append({ t: 'reserve', id, ts: this.d.now(), day, rid: ctx.rid, model, upper })
    ctx.reservation = { id, upper, day }
    return true
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
      ;({ status, raw } = await this.d.ai.post(model, body))
    } catch (err) {
      if (err instanceof StopRun) {
        settle(0, 0, 'none') // raised before the request went out (e.g. the OAuth token could not be refreshed)
        throw (ctx.stop = this.stop = err)
      }
      // Unknown whether it was billed: book the upper bound and stop.
      settle(0, res.upper, 'upper')
      ctx.unanswered = true
      throw (ctx.stop = this.stop = new StopRun(`network error: ${String((err as Error)?.message ?? err).slice(0, 200)}`))
    }
    const v = classifyResponse(status, raw)
    if (v.action !== 'ok') {
      settle(status, 0, 'none')
      if (v.action === 'skip') throw (ctx.skip = new SkipItem(v.reason))
      throw (ctx.stop = this.stop = new StopRun(v.reason))
    }
    let m
    try {
      m = meter(model, v.json.result, res.upper)
    } catch (err) {
      settle(status, res.upper, 'upper')
      throw (ctx.stop = this.stop = err instanceof StopRun ? err : new StopRun(String(err)))
    }
    settle(status, m.neurons, m.source, m.promptTokens, m.completionTokens)
    if (m.source === 'upper') this.d.log(`note ${ctx.rid}: response had no usage; booked the upper bound ${res.upper}`)
    ctx.calls += 1
    ctx.neurons += m.neurons
    ctx.model = model
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
      appendDurable(this.d.resultsPath, { rid: row.rid, run_id: row.run_id, variant: row.variant, model: main.model, value: main.value, alt_variant: alt ? altVariant : null, alt_model: alt?.model ?? null, alt_value: alt?.value ?? null, neurons: ctx.neurons, calls: ctx.calls, ts: now() })
      const held = !!(this.o.compare && altVariant)
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
        const held = !!r.alt_value
        await store.transition(db, row.rid, 'generating', held ? 'held' : 'generated', now(), {
          new_result: r.value, new_model: r.model, neurons: r.neurons, calls: r.calls,
          ...(held ? { alt_variant: r.alt_variant, alt_result: r.alt_value, alt_model: r.alt_model } : {}),
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
        await this.sleepToNextDay()
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

  private async sleepToNextDay(): Promise<void> {
    const t = this.d.now()
    const wake = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate() + 1, 0, 5)
    while (this.d.now() < wake) {
      if (stopRequested(this.d.stopFile)) return
      await this.d.sleep(Math.min(30_000, wake - this.d.now()))
    }
  }
}

/** Pilot release: queue the chosen variant of every held row (no model call). */
export async function release(db: MiniD1, runId: string, variant: 'b' | 'role', now: number, dryRun: boolean): Promise<string[]> {
  const out: string[] = []
  for (const row of await store.rowsIn(db, runId, ['held'])) {
    const swap = row.variant !== variant
    if (swap && (!row.alt_result || row.alt_variant !== variant)) {
      out.push(`${row.rid}: no ${variant} result stored; left held`)
      continue
    }
    out.push(`${row.rid}: queue ${variant}${swap ? ' (alternate)' : ''}`)
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
