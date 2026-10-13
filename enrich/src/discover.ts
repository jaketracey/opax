// Discovery walks bounded, inclusive created windows. A durable page/row offset
// keeps timestamp ties from starving later rows; only queued windows move the cursor.
import { enqueue, getState, NEW_CONTENT_PRIORITY, type NewWork, type TaskName } from './db.ts'
import { KbBackpressure, type KbApi, type KbResource } from './kb.ts'
import { isHistoricSpeech } from './historic.ts'
import { ownedBudget, assertBudgetOwnership, resourceBudget, admissionBudget, type AdmissionBudget } from './run-budget.ts'
import { readConfig, type Config } from './env.ts'
import { readClassifications } from './classify.ts'

export const DISCOVERY_KINDS: ReadonlyArray<{ kind: string; tasks: readonly TaskName[] }> = [
  { kind: 'speech', tasks: ['speech_summary', 'speech_topics'] },
  { kind: 'press_release', tasks: ['release_summary'] },
]
export const cursorKey = (kind: string): string => `cursor:${kind}`
const partialKey = (kind: string): string => `partial:${kind}`
export const windowKey = (kind: string): string => `discovery-window:${kind}`
export const DISCOVERY_SUBREQUESTS = 800 // Conservatively counts each D1 statement as well as KB requests.
const WINDOW_MS = 60 * 60 * 1000
const MIN_WINDOW_MS = 1000
const CATALOG_SLICE_MS = 5000
const SLOW_PAGE_MS = 1000
const METADATA_CONCURRENCY = 4
const CONTROL_REQUESTS = 16
class DiscoveryStopped extends Error {}

/** Catalog timestamps without a zone are UTC. */
export function parseCreated(value: string | null | undefined): number | null {
  if (!value) return null
  const hasZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(value)
  const ms = Date.parse(hasZone ? value : `${value}Z`)
  return Number.isFinite(ms) ? ms : null
}
export const sinceParam = (ms: number): string => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z')

interface Window {
  sinceMs: number
  untilMs: number
  spanMs: number
  page: number
  pageSize: number
  offset: number
}
export interface DiscoveryOptions {
  db: D1Database
  kb: KbApi
  now: number
  startIso: string
  maxPages: number
  overlapS: number
  historicHold?: boolean
  pageSize?: number
  maxMs?: number
  clock?: () => number
  config?: Config
  windowMs?: number
  minWindowMs?: number
  slowPageMs?: number
  /** Shared across both kinds, counting catalog, metadata and D1 requests. */
  maxSubrequests?: number
}
export interface DiscoveryResult {
  seen: Record<string, number>
  enqueued: Record<string, number>
  partial: string[]
  errors: string[]
  requests: { catalog: number; basic: number; resource: number; d1: number }
}

/** Count each D1 statement, including batches, to cover the D1 query limit too. */
export function countedDb(db: D1Database, count: (queries: number) => void): D1Database {
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>()
  const statement = (stmt: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(stmt, { get(target, prop) {
      if (prop === 'bind') return (...args: unknown[]) => statement(target.bind(...args))
      const value = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => { count(1); return value.apply(target, args) }
    } })
    originals.set(proxy, stmt)
    return proxy
  }
  return new Proxy(db, { get(target, prop) {
    if (prop === 'prepare') return (sql: string) => statement(target.prepare(sql))
    if (prop === 'batch') return (stmts: D1PreparedStatement[]) => {
      count(stmts.length)
      return target.batch(stmts.map(s => originals.get(s) ?? s))
    }
    const value = Reflect.get(target, prop)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

function readWindow(raw: string | null): Window | null {
  if (!raw || raw === 'null') return null
  const w = JSON.parse(raw) as Window
  if (![w.sinceMs, w.untilMs, w.spanMs, w.page, w.pageSize, w.offset].every(Number.isSafeInteger)
      || w.untilMs <= w.sinceMs || w.spanMs <= 0 || w.page < 0 || w.pageSize < 1 || w.pageSize > 200
      || w.offset < 0 || w.offset > w.pageSize) throw new Error('invalid discovery window checkpoint')
  return w
}

export async function discover(opts: DiscoveryOptions): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { seen: {}, enqueued: {}, partial: [], errors: [], requests: { catalog: 0, basic: 0, resource: 0, d1: 0 } }
  const clock = opts.clock ?? Date.now
  const started = clock()
  const remainingMs = () => opts.maxMs === undefined ? Infinity : opts.maxMs - (clock() - started)
  const maxRequests = opts.maxSubrequests ?? DISCOVERY_SUBREQUESTS
  const requestCount = () => Object.values(result.requests).reduce((a, b) => a + b, 0)
  const room = (n: number) => requestCount() + n + CONTROL_REQUESTS <= maxRequests
  const db = countedDb(opts.db, queries => { result.requests.d1 += queries })
  const timeout = (cap: number) => {
    if (remainingMs() <= 0) throw new DiscoveryStopped()
    return Math.max(1, Math.floor(Math.min(cap, remainingMs())))
  }
  const maxWindow = Math.max(MIN_WINDOW_MS, Math.floor((opts.windowMs ?? WINDOW_MS) / 1000) * 1000)
  const minWindow = Math.max(MIN_WINDOW_MS, Math.min(maxWindow, Math.floor((opts.minWindowMs ?? MIN_WINDOW_MS) / 1000) * 1000))
  // Keep boundaries at whole seconds so sub-millisecond catalog timestamps are
  // re-read at the next inclusive boundary instead of rounded past it.
  const horizon = Math.floor(opts.now / 1000) * 1000
  for (const { kind, tasks } of DISCOVERY_KINDS) {
    result.seen[kind] = 0
    result.enqueued[kind] = 0
    if (remainingMs() <= 0 || !room(5)) {
      result.partial.push(kind)
      continue
    }
    let partial = true
    try {
      const stored = await getState(db, cursorKey(kind))
      let cursorMs = parseCreated(stored) ?? Date.parse(opts.startIso)
      const wasPartial = (await getState(db, partialKey(kind))) === '1'
      let w = readWindow(await getState(db, windowKey(kind)))
      const sinceMs = Math.floor((wasPartial || !stored ? cursorMs : cursorMs - opts.overlapS * 1000) / 1000) * 1000
      const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 50))
      const makeWindow = (start: number, span: number): Window => ({ sinceMs: start,
        untilMs: Math.min(horizon, start + span), spanMs: span, page: 0, pageSize, offset: 0 })
      // Checkpoint and cursor are atomic with one another, AFTER enqueue succeeds.
      // If checkpointing fails, the same rows are safely re-read next tick.
      const save = async (next: Window | null, complete = false, cursor?: number) => {
        const states: Array<[string, string]> = [[windowKey(kind), JSON.stringify(next)], [partialKey(kind), complete ? '0' : '1']]
        if (cursor !== undefined) states.push([cursorKey(kind), new Date(cursor).toISOString()])
        await db.batch(states.map(([key, value]) => db.prepare('INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, opts.now)))
      }
      if (!w && sinceMs >= horizon) {
        partial = false
        await save(null, true)
        continue
      }
      w ??= makeWindow(sinceMs, maxWindow)
      await save(w)
      let pages = 0
      while (w && pages < opts.maxPages && remainingMs() > 0 && room(1)) {
        const pageStarted = clock()
        result.requests.catalog += 1
        pages += 1 // Failed and discarded catalog attempts also consume the page budget.
        const shrink = async (): Promise<boolean> => {
          const width = w!.untilMs - w!.sinceMs
          if (width <= minWindow) return false
          const span = Math.max(minWindow, Math.floor(width / 2000) * 1000)
          // Even after earlier pages were queued it is safe to restart a smaller
          // window: queue and run ownership de-duplicate every resource.
          w = makeWindow(w!.sinceMs, span)
          await save(w)
          return true
        }
        let got
        try {
          got = await opts.kb.catalog(kind, sinceParam(w.sinceMs), w.page, w.pageSize,
            new Date(w.untilMs).toISOString(), timeout(CATALOG_SLICE_MS))
        } catch (err) {
          if (err instanceof KbBackpressure && err.status === 0 && /timeout|abort/i.test(err.message) && await shrink()) continue
          throw err
        }
        if ((clock() - pageStarted > (opts.slowPageMs ?? SLOW_PAGE_MS)
            || (w.page === 0 && w.offset === 0 && got.hasNext && got.rows.length >= w.pageSize))
            && await shrink()) continue
        if (got.rows.length > w.pageSize || w.offset > got.rows.length || (got.hasNext && !got.rows.length))
          throw new Error('inconsistent discovery catalog page')
        // Queue small chunks before starting more metadata reads. A slow metadata
        // read cannot throw away an entire tick's progress, or bypass run admission.
        while (w.offset < got.rows.length && remainingMs() > 0 && room(16)) {
          // A bounded speech uses two KB reads and ten SQL statements including
          // both ownership reads and the exact admit transaction. Reserve thirteen
          // units per row plus the checkpoint and control headroom.
          const capacity = Math.floor((maxRequests - requestCount() - CONTROL_REQUESTS - 3) / 13)
          const chunk = got.rows.slice(w.offset, w.offset + Math.min(METADATA_CONCURRENCY, capacity))
          const prepared = await Promise.allSettled(chunk.map(async row => {
            let basic: KbResource | null | undefined
            let held = false
            if (opts.historicHold && kind === 'speech') {
              if (!Array.isArray(row.usermetadata?.classifications)) {
                const ms = timeout(CATALOG_SLICE_MS)
                result.requests.basic += 1
                basic = await opts.kb.getBasic(row.rid, ms)
                if (!basic) throw new Error('discovery metadata unavailable')
              }
              held = isHistoricSpeech(basic ?? { usermetadata: row.usermetadata })
            }
            let budget: AdmissionBudget | undefined
            if (kind === 'speech' && !held) {
              const saved = await ownedBudget(db, row.rid)
              if (basic === undefined) {
                const ms = timeout(CATALOG_SLICE_MS)
                result.requests.basic += 1
                basic = await opts.kb.getBasic(row.rid, ms)
              }
              if (!saved && basic && readClassifications(basic).some(c => c.labelset === 'source' && c.label === 'openaustralia')
                  && !basic.extra?.metadata) throw new Error('OpenAustralia budget metadata unavailable')
              const declared = basic ? resourceBudget(basic) : null
              assertBudgetOwnership(saved, declared)
              if (saved) budget = saved
              else if (declared) {
                const ms = timeout(CATALOG_SLICE_MS)
                result.requests.resource += 1
                const full = await opts.kb.getResource(row.rid, ms)
                if (!full) throw new Error('bounded resource unavailable')
                assertBudgetOwnership(declared, resourceBudget(full))
                budget = admissionBudget(full, row.rid, opts.config ?? readConfig({})) ?? undefined
                if (!budget) throw new Error('bounded resource metadata changed')
              }
            }
            return tasks.map(task => ({ rid: row.rid, task, priority: NEW_CONTENT_PRIORITY,
              sourceCreated: parseCreated(row.created), historicHold: held, runBudget: budget } satisfies NewWork))
          }))
          const work = prepared.flatMap(p => {
            if (p.status === 'rejected') throw p.reason
            return p.value
          })
          result.enqueued[kind] += await enqueue(db, work, opts.now)
          result.seen[kind] += chunk.length
          w = { ...w, offset: w.offset + chunk.length }
          await save(w)
        }
        if (w.offset < got.rows.length) break
        if (got.hasNext) {
          w = { ...w, page: w.page + 1, offset: 0 }
          await save(w)
          continue
        }
        // Empty windows are progress too. Inclusive ends and the next inclusive
        // start re-read edges; INSERT OR IGNORE prevents duplicate work/reservations.
        cursorMs = Math.max(cursorMs, w.untilMs)
        const end: number = w.untilMs
        // Grow sparse windows. Dense windows keep their working size so each
        // tick does not spend its page budget expanding and shrinking again.
        const span: number = w.page === 0 && got.rows.length < w.pageSize / 4 ? Math.min(maxWindow, w.spanMs * 2) : w.spanMs
        w = end >= horizon ? null : makeWindow(end, span)
        partial = w !== null
        await save(w, !partial, cursorMs)
      }
    } catch (err) {
      if (!(err instanceof DiscoveryStopped)) result.errors.push(`${kind}: ${String((err as Error)?.message ?? err).slice(0, 200)}`)
    }
    if (partial) result.partial.push(kind)
  }
  return result
}
