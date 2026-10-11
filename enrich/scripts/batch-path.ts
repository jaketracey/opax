// Run by the orchestrator, with one private spool shared by all runs on this host.
// Commands are bounded steps: cron can resume them without keeping a process alive.
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, openSync, fsyncSync, closeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { batchRequest, decode, reserveSpend, usageCost, type BatchUnit, type Reservation } from './batch-lib.ts'
import { validateBatchResult } from '../src/batch-result.ts'
import type { Task } from '../src/prompts.ts'

export interface Unit extends BatchUnit {
  stage: 'selected' | 'reserved' | 'ready' | 'release' | 'done' | 'released'
  attempt: number
  retry_tasks?: Task[]
  complaints?: string[]
  result?: { summary?: unknown; topics?: unknown }
  short?: boolean
  retry_at?: number
}
export interface Submission { id?: string; attempt: number; rids: string[]; reservation: Reservation; ended?: boolean }
export interface Run { id: string; units: Unit[]; submissions: Submission[]; canceled?: boolean; preparing?: boolean; after?: string }
export class AdminHttp extends Error {
  status: number
  retryAt?: number
  constructor(status: number, retryAt?: number) { super('admin request refused'); this.status = status; this.retryAt = retryAt }
}

const root = resolve(process.env.OPAX_BATCH_STATE_DIR ?? '/home/jake/opax-staging/federation/enrich-batch-path/spool')
const integer = (name: string, fallback: number, max: number) => {
  const n = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(n) || n < 1 || n > max) throw Error('invalid integer setting')
  return n
}
const dailyCap = Number(process.env.OPAX_BATCH_DAILY_USD ?? 3)
const totalCap = Number(process.env.OPAX_BATCH_TOTAL_USD ?? 3)
const maxActive = integer('OPAX_BATCH_CONCURRENCY', 2, 4)
const batchSize = integer('OPAX_BATCH_UNITS', 1000, 5000)
const read = (name: string): any => JSON.parse(readFileSync(join(root, name), 'utf8'))
function write(name: string, value: unknown) {
  const path = join(root, name), temp = path + '.tmp'
  writeFileSync(temp, JSON.stringify(value) + '\n', { mode: 0o600 })
  const fd = openSync(temp, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temp, path)
  const dir = openSync(root, 'r'); try { fsyncSync(dir) } finally { closeSync(dir) }
}
const save = (run: Run) => write(`run-${run.id}.json`, run)
function allRuns(): Run[] { return readdirSync(root).filter(n => /^run-[a-zA-Z0-9_-]+\.json$/.test(n)).map(read) }
function loadRun(id: string): Run {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw Error('invalid run id')
  return read(`run-${id}.json`)
}
async function anthropic(path: string, body?: unknown, raw = false): Promise<any> {
  // Read only the one approved key. Never copy it into state or diagnostics.
  const line = readFileSync('/home/jake/opax/.env', 'utf8').split('\n').find(s => s.startsWith('ANTHROPIC_API_KEY='))
  const key = line?.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^(["'])(.*)\1$/, '$2')
  if (!key) throw Error('API credential unavailable')
  const url = new URL(path, 'https://api.anthropic.com')
  if (url.origin !== 'https://api.anthropic.com') throw Error('unexpected API origin')
  const response = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(55000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) throw Error('Anthropic request incomplete')
  return raw ? response.text() : response.json()
}
async function admin(path: string, body?: unknown): Promise<any> {
  const base = process.env.OPAX_ENRICH_URL, token = process.env.ENRICH_ADMIN_TOKEN
  if (!base || !token) throw Error('admin configuration required')
  const url = new URL(path, base)
  if (url.protocol !== 'https:' || url.origin !== new URL(base).origin) throw Error('invalid admin origin')
  const response = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(55000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok && response.status !== 422) {
    const busy = response.status === 423 ? await response.json().catch(() => null) as { lease_until?: unknown } | null : null
    throw new AdminHttp(response.status, typeof busy?.lease_until === 'number' ? busy.lease_until : undefined)
  }
  return response.json()
}

export interface BatchRuntime {
  admin(path: string, body?: unknown): Promise<any>
  anthropic(path: string, body?: unknown, raw?: boolean): Promise<any>
  save(run: Run): void
  allRuns(): Run[]
  write(name: string, value: unknown): void
  now(): number
  dailyCap: number
  totalCap: number
  maxActive: number
  batchSize: number
}
const runtime: BatchRuntime = { admin, anthropic, save, allRuns, write, now: () => Date.now(), dailyCap, totalCap, maxActive, batchSize }

/** Read ownership before any resumed work; local selection can predate a lost reserve acknowledgement. */
export async function reconcileRun(run: Run, d: BatchRuntime = runtime) {
  const owned = new Map<string, { source_hash: string; state: string }>()
  let after = ''
  do {
    const page = await d.admin(`/backfill/batch/reservations?run_id=${encodeURIComponent(run.id)}&limit=200&after=${after}`)
    if (!Array.isArray(page.reservations)) throw Error('invalid reservation inventory')
    for (const b of page.reservations) {
      const u = run.units.find(u => u.rid === b.rid)
      if (!u || b.rid <= after || owned.has(b.rid) || b.source_hash !== u.source_hash
        || !['reserved','applying','done','released'].includes(b.state)) throw Error('reservation inventory does not match durable run')
      owned.set(b.rid, b)
    }
    if (page.next_after !== null && (typeof page.next_after !== 'string' || page.next_after <= after || !owned.has(page.next_after))) throw Error('invalid reservation cursor')
    after = page.next_after ?? ''
  } while (after)
  for (const u of run.units) {
    const b = owned.get(u.rid)
    if (!b) continue // cancel still asks the worker; absence never proves a local release
    if (b.state === 'done') u.stage = 'done'
    else if (b.state === 'released') {
      if (u.stage !== 'released') u.stage = 'release' // /release may have been interrupted after /cancel
    } else if (u.stage === 'selected' || u.stage === 'released') {
      if (run.canceled) u.stage = 'release'
      else if (u.result) u.stage = 'ready'
      else if (b.state === 'reserved') u.stage = 'reserved'
      else throw Error('active writer has no durable result')
    }
  }
  d.save(run)
}

async function reserveSelected(run: Run, d: BatchRuntime) {
  for (const u of run.units.filter(u => u.stage === 'selected')) {
      try {
        if (u.short) {
          await d.admin('/backfill/release', { slugs: [u.record.slug] })
          u.stage = 'released' // live worker applies its own short-unit skip without a model call
        } else {
          const reserved = await d.admin('/backfill/batch/reserve', { run_id: run.id, rid: u.rid, source_hash: u.source_hash })
          if (reserved.state === 'reserved' || reserved.state === 'done') u.stage = reserved.state
          else if (reserved.state === 'released') { u.stage = 'release'; await release(run, u, d) }
          else throw Error('unexpected reservation state')
        }
      } catch (e) {
        if (e instanceof AdminHttp && e.status === 409) { u.stage = 'release'; await release(run, u, d) }
        else throw e
      }
      d.save(run)
    }
}

export async function prepare(run: Run, d: BatchRuntime = runtime) {
  await reconcileRun(run, d)
  if (run.canceled) { run.preparing = false; d.save(run); return }
  await reserveSelected(run, d)
  while (run.units.length < d.batchSize) {
    const page = await d.admin(`/backfill/batch?limit=${Math.min(20, d.batchSize - run.units.length)}&after=${run.after ?? ''}`)
    if (!Array.isArray(page.units)) throw Error('invalid held inventory')
    for (const u of page.units) {
      if (!/^[0-9a-f]{32}$/.test(u.rid) || !/^[0-9a-f]{64}$/.test(u.source_hash) || !u.record?.slug
        || !Array.isArray(u.tasks) || !u.tasks.length || u.tasks.some((t: unknown) => t !== 'summary' && t !== 'topics')) throw Error('invalid held record')
      if (!run.units.some(r => r.rid === u.rid)) run.units.push({ ...u, stage: 'selected', attempt: 1 })
    }
    run.after = page.next_after ?? undefined
    d.save(run) // selected records must survive a crash before reserving
    await reserveSelected(run, d)
    if (!page.next_after) break
  }
  run.preparing = false; d.save(run)
}

export async function submit(run: Run, d: BatchRuntime = runtime) {
  if (run.canceled) return
  if (run.submissions.some(s => !s.ended)) return
  if (d.allRuns().flatMap(r => r.submissions).filter(s => !s.ended).length >= d.maxActive) return
  const units = run.units.filter(u => u.stage === 'reserved')
  if (!units.length) return
  const attempt = Math.min(...units.map(u => u.attempt)), group = units.filter(u => u.attempt === attempt)
  const requests = group.map(u => batchRequest(u, attempt, u.complaints, u.retry_tasks ?? u.tasks, attempt > 1 ? u.result?.summary : undefined))
  if (Buffer.byteLength(JSON.stringify({ requests })) > 250_000_000) throw Error('batch request size exceeded')
  const ledger = d.allRuns().flatMap(r => r.submissions.map(s => s.reservation))
  const reservation = reserveSpend(ledger, requests, d.now(), d.dailyCap, d.totalCap)
  const submission: Submission = { attempt, rids: group.map(u => u.rid), reservation }
  run.submissions.push(submission); d.save(run) // ambiguous POST stays reserved and is NEVER automatically replayed
  const batch = await d.anthropic('/v1/messages/batches', { requests })
  if (typeof batch.id !== 'string' || !/^msgbatch_[a-zA-Z0-9]+$/.test(batch.id)) throw Error('invalid batch receipt')
  submission.id = batch.id; d.save(run)
}

export async function poll(run: Run, s: Submission, d: BatchRuntime = runtime) {
  if (s.ended) return
  if (!s.id) throw Error('ambiguous POST: reconcile with Anthropic batch list, then adopt the verified ID')
  const batch = await d.anthropic(`/v1/messages/batches/${s.id}`)
  if (batch.processing_status !== 'ended') return
  const raw = await d.anthropic(batch.results_url ?? `/v1/messages/batches/${s.id}/results`, undefined, true)
  const responses: any[] = raw.split('\n').filter(Boolean).map((line: string) => JSON.parse(line))
  const byId = new Map(responses.map(r => [r.custom_id, r]))
  if (byId.size !== responses.length || responses.length !== s.rids.length || s.rids.some(rid => !byId.has(`${rid}-${s.attempt}`))) throw Error('batch result coverage mismatch')
  d.write(`receipt-${s.id}.json`, { responses })
  s.reservation.settled_day = new Date(d.now()).toISOString().slice(0, 10)
  const actual = responses.reduce((n, r) => n + usageCost(r.result?.message?.usage), 0)
  if (actual > s.reservation.upper) throw Error('receipt exceeds reserved bound: halt for pricing review')
  s.reservation.actual = actual
  for (const rid of s.rids) {
    const u = run.units.find(u => u.rid === rid)!, output = decode(byId.get(`${rid}-${s.attempt}`))
    if (run.canceled || u.stage === 'released' || u.stage === 'done') continue
    const incomplete = output.error || output.stop_reason !== 'end_turn'
    const changed = u.retry_tasks ?? u.tasks
    const merged = { ...u.result, ...(changed.includes('summary') ? { summary: output.summary } : {}), ...(changed.includes('topics') ? { topics: output.topics } : {}) }
    u.result = merged
    const v = validateBatchResult(u.record, u.tasks, merged)
    if (!incomplete && !output.refusal && v.valid) u.stage = 'ready'
    else if (output.refusal || s.attempt >= 2 || run.canceled) u.stage = 'release'
    else {
      u.stage = 'reserved'; u.attempt = 2
      u.retry_tasks = incomplete ? u.tasks : u.tasks.filter(t => !validateBatchResult(u.record, [t], merged).valid)
      u.complaints = incomplete ? ['incomplete model response; return the complete requested JSON object'] : v.problems
    }
  }
  s.ended = true; d.save(run)
}

async function release(run: Run, u: Unit, d: BatchRuntime) {
  let canceled
  try { canceled = await d.admin('/backfill/batch/cancel', { run_id: run.id, rid: u.rid }) }
  catch (e) { if (deferLease(run, u, e, d)) return; throw e }
  if (canceled.state === 'done') { u.stage = 'done'; d.save(run); return }
  if (canceled.state === 'unowned') { u.stage = 'released'; d.save(run); return } // leave the other owner's rows alone
  if (canceled.state !== 'released' && canceled.state !== 'unreserved') throw Error('unexpected cancellation state')
  await d.admin('/backfill/release', { slugs: [u.record.slug] })
  delete u.retry_at; u.stage = 'released'; d.save(run)
}
function deferLease(run: Run, u: Unit, e: unknown, d: BatchRuntime): boolean {
  if (!(e instanceof AdminHttp) || e.status !== 423) return false
  u.retry_at = Number.isFinite(e.retryAt) ? Math.max(d.now() + 1000, e.retryAt!) : d.now() + 60000
  d.save(run) // preserve the paid result and stage; a later step retries the same write/cancel
  return true
}
export async function deliver(run: Run, d: BatchRuntime = runtime) {
  for (const u of run.units) {
    if (u.retry_at && u.retry_at > d.now()) continue
    if (run.canceled && u.stage !== 'done' && u.stage !== 'released') { await release(run, u, d); continue }
    if (u.stage === 'release') { await release(run, u, d); continue }
    if (u.stage !== 'ready') continue
    let response
    try { response = await d.admin('/backfill/batch/result', { run_id: run.id, rid: u.rid, source_hash: u.source_hash, result: u.result }) }
    catch (e) {
      if (deferLease(run, u, e, d)) continue
      if (e instanceof AdminHttp && e.status === 409) {
        // A stale source/queue is released only if this run still owns the hold.
        u.stage = 'release'; d.save(run); await release(run, u, d); continue
      }
      throw e
    }
    delete u.retry_at
    if (response.state === 'done') u.stage = 'done'
    else if (response.state === 'release') u.stage = 'release'
    else if (response.state === 'invalid') {
      if (u.attempt >= 2) u.stage = 'release'
      else { u.stage = 'reserved'; u.attempt = 2; u.complaints = response.problems; u.retry_tasks = u.tasks }
    } else if (response.state !== 'dry' && response.state !== 'retry-write') throw Error('unexpected delivery state')
    d.save(run)
    if (u.stage === 'release') await release(run, u, d)
  }
}
export function stats(run: Run) {
  return { run_id: run.id, units: run.units.length, stages: Object.fromEntries(['selected','reserved','ready','release','done','released'].map(stage => [stage, run.units.filter(u => u.stage === stage).length])),
    batches: run.submissions.length, pending_batches: run.submissions.filter(s => !s.ended).length,
    billed_usd: run.submissions.reduce((n, s) => n + (s.reservation.actual ?? 0), 0), outstanding_upper_usd: run.submissions.filter(s => s.reservation.actual === undefined).reduce((n, s) => n + s.reservation.upper, 0) }
}

export async function cancelRun(run: Run, d: BatchRuntime = runtime) {
  await reconcileRun(run, d)
  run.canceled = true; d.save(run)
  for (const s of run.submissions.filter(s => !s.ended)) {
    if (!s.id) throw Error('reconcile ambiguous submission before cancellation')
    await d.anthropic(`/v1/messages/batches/${s.id}/cancel`, {})
  }
  for (const u of run.units.filter(u => u.stage !== 'done' && u.stage !== 'released' && (!u.retry_at || u.retry_at <= d.now()))) await release(run, u, d)
}

export async function adoptRun(run: Run, id: string, d: BatchRuntime = runtime) {
  await reconcileRun(run, d)
  const pending = run.submissions.filter(s => !s.id)
  if (pending.length !== 1 || !/^msgbatch_[a-zA-Z0-9]+$/.test(id) || d.allRuns().some(r => r.submissions.some(s => s.id === id))) throw Error('invalid adoption')
  const batch = await d.anthropic(`/v1/messages/batches/${id}`)
  if (batch.processing_status !== 'ended') throw Error('wait for the ambiguous batch to end before matching custom IDs')
  const raw = await d.anthropic(batch.results_url ?? `/v1/messages/batches/${id}/results`, undefined, true)
  const ids: string[] = raw.split('\n').filter(Boolean).map((line: string) => JSON.parse(line).custom_id)
  const expected = pending[0].rids.map(rid => `${rid}-${pending[0].attempt}`)
  if (new Set(ids).size !== ids.length || ids.length !== expected.length || expected.some(id => !ids.includes(id))) throw Error('adopted batch coverage mismatch')
  pending[0].id = id; d.save(run)
}

export async function stepRun(run: Run, d: BatchRuntime = runtime) {
  if (run.preparing) await prepare(run, d)
  else await reconcileRun(run, d)
  for (const s of run.submissions.filter(s => !s.ended)) await poll(run, s, d)
  await deliver(run, d)
  if (!run.submissions.some(s => !s.ended)) await submit(run, d)
}

async function main() {
let lock: DatabaseSync | undefined
try {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  // SQLite releases this exclusive controller transaction on crash. No stale PID locks.
  lock = new DatabaseSync(join(root, 'controller.sqlite'))
  lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE')
  const command = process.argv[2]
  if (command !== 'status') reserveSpend([], [], Date.now(), dailyCap, totalCap)
  if (command === 'status') console.log(JSON.stringify(allRuns().map(stats)))
  else {
    const run: Run = command === 'prepare' ? { id: randomUUID(), units: [], submissions: [], preparing: true } : loadRun(process.argv[3])
    if (command === 'prepare') { save(run); await prepare(run) }
    else if (command === 'step') {
      await stepRun(run)
    } else if (command === 'cancel') {
      await cancelRun(run)
    } else if (command === 'adopt') {
      await adoptRun(run, process.argv[4])
    } else throw Error('usage: batch-path.ts prepare|status|step RUN|cancel RUN|adopt RUN VERIFIED_BATCH_ID')
    console.log(JSON.stringify(stats(run)))
  }
} catch { console.error('batch step incomplete; inspect private spool state and retry; no private payload was logged'); process.exitCode = 1 }
finally { if (lock) { try { lock.exec('ROLLBACK') } catch {} lock.close() } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
