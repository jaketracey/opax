// 5b-cheap regeneration guard: what a Workers AI response means, what it cost, and whether the next
// call may go out. Pure functions plus a file ledger; no network. See scripts/regen/README.md.
import { appendFileSync, closeSync, existsSync, fstatSync, fsyncSync, openSync, readFileSync, readSync, unlinkSync, writeSync } from 'node:fs'
import { NEURON_PRICES } from '../../src/budget.ts'
import { callUpper } from '../../src/run-budget.ts'

/** Workers AI list price: US$0.011 per 1,000 neurons. */
export const USD_PER_NEURON = 0.011 / 1000
/** Jake's hard cap for this run (note-5b-go): no cap above it is accepted anywhere. */
export const HARD_CAP_USD = 30
/** A cap in US dollars as neurons; throws unless 0 < usd <= HARD_CAP_USD (a NaN or missing cap never passes). */
export function usdToNeurons(usd: number): number {
  if (!(typeof usd === 'number' && Number.isFinite(usd) && usd > 0 && usd <= HARD_CAP_USD)) throw new StopRun(`cap must be above US$0 and at most US$${HARD_CAP_USD}, got ${usd}`)
  return Math.floor(usd / USD_PER_NEURON)
}

/** The run stops; nothing more is sent until an operator restarts it. */
export class StopRun extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`stop: ${reason}`)
    this.reason = reason
    this.name = 'StopRun'
  }
}

/** This one item is skipped and logged (a per-item 4xx); the run continues. */
export class SkipItem extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`skip: ${reason}`)
    this.reason = reason
    this.name = 'SkipItem'
  }
}

/** Billing, quota or limit wording anywhere outside the model's own text stops the run. */
export const BILLING_WORDING = /billing|payment|quota|limit|exceed|insufficient|credit|allocation|exhaust|suspend|overage|budget|plan/i

/** Statuses that MAY be about this request only. Only with an allowlisted error code (below) is it a skip. */
export const PER_ITEM_STATUSES = new Set([400, 413, 422])

/**
 * Workers AI error codes that are about this request's input only: 5006 (input failed the model's schema).
 * Any other code, or none, stops the run: 4006 and 3036 are allocation limits, 10000 is authentication.
 */
export const PER_ITEM_CODES = new Set([5006])

/** After this many per-item skips in a row the run stops: the "per-item" error is probably not. */
export const MAX_SKIPS_IN_A_ROW = 3

/** Keys whose string values are model output; wording inside them never stops the run. */
const CONTENT_KEYS = new Set(['content', 'text', 'response', 'reasoning', 'reasoning_content', 'output_text', 'arguments', 'refusal'])

/** The response with every model-output string removed: only the envelope is left to scan. */
export function envelopeOf(value: unknown, key = ''): unknown {
  if (CONTENT_KEYS.has(key) && (typeof value === 'string' || Array.isArray(value) || (value && typeof value === 'object'))) return '[model output]'
  if (Array.isArray(value)) return value.map((v) => envelopeOf(v))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, envelopeOf(v, k)]))
  return value
}

export type Verdict = { action: 'ok'; json: any } | { action: 'skip'; reason: string } | { action: 'stop'; reason: string }

/** The guard's reading of one Workers AI REST response (status plus raw body). */
export function classifyResponse(status: number, raw: string): Verdict {
  let json: any = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    json = null
  }
  const envelope = json === null ? raw.slice(0, 2000) : JSON.stringify(envelopeOf(json))
  const brief = `HTTP ${status}: ${envelope.slice(0, 300)}`
  if (status === 402 || status === 403 || status === 429) return { action: 'stop', reason: brief }
  if (status >= 400) {
    const errors: any[] = Array.isArray(json?.errors) ? json.errors : []
    const perItem = PER_ITEM_STATUSES.has(status) && errors.length > 0 && errors.every((e) => PER_ITEM_CODES.has(Number(e?.code)))
    if (perItem && !BILLING_WORDING.test(envelope)) return { action: 'skip', reason: brief }
    return { action: 'stop', reason: brief }
  }
  if (status < 200 || status >= 300) return { action: 'stop', reason: brief }
  if (json === null || typeof json !== 'object') return { action: 'stop', reason: `unreadable ${brief}` }
  if (json.success === false) return { action: 'stop', reason: `success=false ${brief}` }
  if (BILLING_WORDING.test(envelope)) return { action: 'stop', reason: `billing wording in a 200 body: ${envelope.slice(0, 300)}` }
  if (!json.result || typeof json.result !== 'object') return { action: 'stop', reason: `no result in ${brief}` }
  return { action: 'ok', json }
}

export interface Metered {
  neurons: number
  promptTokens: number | null
  completionTokens: number | null
  /** 'usage' = billed tokens from the response; 'upper' = usage missing, booked at the reservation. */
  source: 'usage' | 'upper'
}

/** Actual neurons from the response's usage at the published per-token rates; the upper bound if usage is missing. */
export function meter(model: string, result: any, upper: number): Metered {
  const price = NEURON_PRICES[model]
  if (!price) throw new StopRun(`no published price for ${model}`)
  const usage = result?.usage ?? {}
  const p = Number(usage.prompt_tokens ?? usage.input_tokens)
  const c = Number(usage.completion_tokens ?? usage.output_tokens)
  if (Number.isFinite(p) && Number.isFinite(c) && p >= 0 && c >= 0 && p + c > 0) {
    return { neurons: (p * price.input + c * price.output) / 1_000_000, promptTokens: p, completionTokens: c, source: 'usage' }
  }
  return { neurons: upper, promptTokens: null, completionTokens: null, source: 'upper' }
}

/** The most a call can cost: the Worker's own reservation formula (input bytes + envelope, full max_tokens). */
export const upperFor = (model: string, body: Record<string, unknown>): number => callUpper(model, body)

export const utcDayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

// ------------------------------------------------------------------ ledger

export type LedgerLine =
  | { t: 'reserve'; id: string; ts: number; day: string; rid: string; model: string; upper: number }
  | { t: 'settle'; id: string; ts: number; day: string; rid: string; model: string; status: number; neurons: number; prompt_tokens: number | null; completion_tokens: number | null; source: 'usage' | 'upper' | 'none'; usd: number }
  | { t: 'stop'; ts: number; reason: string }
  | { t: 'note'; ts: number; text: string }

export interface Totals {
  neurons: number
  usd: number
  calls: number
  byDay: Record<string, number>
  /** Reservations with no settlement (a crash mid-call), counted at their upper bound. */
  unsettled: number
  stops: number
}

/**
 * Append-only JSONL ledger, fsynced per line, rebuilt on start. Every call writes a reservation BEFORE it
 * goes out and a settlement after, so a crash can only over-count (an open reservation counts at its upper).
 * `sync()` reads whatever was appended since the last read (by any process), so the totals always cover the
 * whole file; the runner calls it right before each admission.
 */
export class Ledger {
  private open = new Map<string, { day: string; upper: number }>()
  private settled = { neurons: 0, calls: 0, byDay: {} as Record<string, number>, stops: 0 }
  private offset = 0
  private partial = ''

  readonly path: string
  constructor(path: string) {
    this.path = path
    this.sync()
  }

  /** Apply every complete line appended to the file since the last read. */
  sync(): void {
    if (!existsSync(this.path)) return
    const fd = openSync(this.path, 'r')
    try {
      const size = fstatSync(fd).size
      if (size < this.offset) throw new StopRun(`ledger ${this.path} shrank (${this.offset} -> ${size} bytes): refusing to continue`)
      if (size === this.offset) return
      const buf = Buffer.alloc(size - this.offset)
      let got = 0
      while (got < buf.length) {
        const n = readSync(fd, buf, got, buf.length - got, this.offset + got)
        if (n === 0) break
        got += n
      }
      this.offset += got
      const lines = (this.partial + buf.subarray(0, got).toString('utf8')).split('\n')
      this.partial = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) this.apply(JSON.parse(line) as LedgerLine)
    } finally {
      closeSync(fd)
    }
  }

  private apply(l: LedgerLine): void {
    if (l.t === 'reserve') this.open.set(l.id, { day: l.day, upper: l.upper })
    else if (l.t === 'settle') {
      this.open.delete(l.id)
      this.settled.neurons += l.neurons
      this.settled.calls += 1
      this.settled.byDay[l.day] = (this.settled.byDay[l.day] ?? 0) + l.neurons
    } else if (l.t === 'stop') this.settled.stops += 1
  }

  append(l: LedgerLine): void {
    const fd = openSync(this.path, 'a')
    try {
      writeSync(fd, JSON.stringify(l) + '\n')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    this.sync() // applies this line, and anything another process appended
  }

  totals(): Totals {
    let unsettled = 0
    const byDay = { ...this.settled.byDay }
    for (const r of this.open.values()) {
      unsettled += r.upper
      byDay[r.day] = (byDay[r.day] ?? 0) + r.upper
    }
    const neurons = this.settled.neurons + unsettled
    return { neurons, usd: neurons * USD_PER_NEURON, calls: this.settled.calls, byDay, unsettled, stops: this.settled.stops }
  }
}

/** Append a JSON line and fsync it (the local copy of every generated brief, so none is paid for twice). */
export function appendDurable(path: string, value: unknown): void {
  appendFileSync(path, '') // create
  const fd = openSync(path, 'a')
  try {
    writeSync(fd, JSON.stringify(value) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

// ------------------------------------------------------------------ caps

export interface Caps {
  /** Hard cap on actual spend for the whole run (US$30 -> 2,727,272 neurons). */
  runNeurons: number
  /** The account-wide daily budget the Worker also uses (DAILY_NEURON_BUDGET). */
  dailyBudget: number
  /** Room kept for the Worker (live enrich plus the Senate and NSW backfills): 1.2 x its peak day of the last 30. */
  workerHeadroom: number
}

/**
 * May a call with this upper bound go out now? Run cap first, then today's share of the daily budget:
 * ours + upper <= dailyBudget - max(worker spend so far today, worker headroom).
 */
export function admit(caps: Caps, totals: Totals, today: string, workerToday: number, upper: number):
  { ok: true } | { ok: false; kind: 'run-cap' | 'daily' | 'invalid'; reason: string } {
  const ours = totals.byDay[today] ?? 0
  const inputs = { runNeurons: caps.runNeurons, dailyBudget: caps.dailyBudget, workerHeadroom: caps.workerHeadroom, spent: totals.neurons, ours, workerToday, upper }
  // Fail closed: a non-number refuses here, and each comparison below is written so that a NaN refuses too.
  if (!Object.values(inputs).every((n) => typeof n === 'number' && Number.isFinite(n)) || !(upper > 0) || !(caps.runNeurons > 0)) {
    return { ok: false, kind: 'invalid', reason: `guard input is not a usable number: ${JSON.stringify(inputs)}` }
  }
  if (!(totals.neurons + upper <= caps.runNeurons)) {
    return { ok: false, kind: 'run-cap', reason: `run cap: ${Math.round(totals.neurons)} + ${upper} > ${caps.runNeurons} neurons (US$${(caps.runNeurons * USD_PER_NEURON).toFixed(2)})` }
  }
  const allowance = caps.dailyBudget - Math.max(workerToday, caps.workerHeadroom)
  if (!(ours + upper <= allowance)) {
    return { ok: false, kind: 'daily', reason: `daily share: ours ${Math.round(ours)} + ${upper} > ${allowance} (budget ${caps.dailyBudget} - max(worker today ${Math.round(workerToday)}, headroom ${caps.workerHeadroom}))` }
  }
  return { ok: true }
}

/** 1.2 x the Worker's highest daily spend over the window, from the D1 spend table rows. */
export function headroomFrom(days: Array<{ day: string; n: number }>, factor = 1.2): number {
  const peak = days.reduce((m, d) => Math.max(m, Number(d.n) || 0), 0)
  return Math.ceil(peak * factor)
}

export const stopRequested = (stopFile: string): boolean => existsSync(stopFile)

// ------------------------------------------------------------------ single runner

/**
 * Take the state directory's lock: an exclusive create (`wx`) holding our PID. If the lock exists, refuse and
 * say whose it is; a lock is never taken over automatically, even when its process looks gone. Returns the release.
 */
export function acquireLock(path: string, what: string): () => void {
  let fd: number
  try {
    fd = openSync(path, 'wx')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    let holder = ''
    try {
      holder = readFileSync(path, 'utf8').trim()
    } catch {}
    throw new StopRun(`another regen command holds the lock ${path} (${holder || 'no details'}). If that process is gone (check with /bin/ps -p <pid>), remove the file by hand; a lock is never taken over automatically`)
  }
  const mine = JSON.stringify({ pid: process.pid, what, started: new Date().toISOString() })
  try {
    writeSync(fd, mine + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    try {
      if (readFileSync(path, 'utf8').trim() === mine) unlinkSync(path)
    } catch {}
  }
}
