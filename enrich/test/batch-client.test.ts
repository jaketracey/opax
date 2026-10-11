import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join } from 'node:path'
import { batchRecord, hashValue, sourceHash } from '../src/batch-result.ts'
import { decode } from '../scripts/batch-lib.ts'
import { AdminHttp, adoptRun, cancelRun, deliver, poll, prepare, reconcileRun, stepRun, submit, type BatchRuntime, type Run, type Unit } from '../scripts/batch-path.ts'
import { applyBatch, BatchBusy, BatchConflict, cancelBatch, readBatchReservations, readHeldBatch, reserveBatch, type BatchDeps } from '../src/batch.ts'
import { claimRids, enqueue } from '../src/db.ts'
import { releaseHistoric } from '../src/reconcile.ts'
import { FakeKb, makeD1, rows } from './helpers.ts'

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'batch-responses.json'), 'utf8'))
const rid = 'a'.repeat(32)
async function setup() {
  const resource = { title: '', slug: 'invented-unit', usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }] }, data: { texts: { body: { value: { body: fixture.source } } } } }
  const record = batchRecord(resource, rid)
  const unit: Unit = { rid, source_hash: await sourceHash(record), record, tasks: ['summary','topics'], stage: 'selected', attempt: 1 }
  const run: Run = { id: 'invented-run', units: [], submissions: [], preparing: true }
  const saved = new Map<string, Run>(), receipts = new Map<string, unknown>(), adminCalls: Array<{ path: string; body?: any }> = [], posts: any[] = []
  let response = structuredClone(fixture.responses[0]), count = 0, complete = true
  const d: BatchRuntime = {
    dailyCap: 3, totalCap: 3, maxActive: 2, batchSize: 1, now: () => Date.parse('2026-10-11T00:00:00Z'),
    save: r => { saved.set(r.id, structuredClone(r)) }, allRuns: () => [...saved.values()], write: (n, v) => { receipts.set(n, structuredClone(v)) },
    admin: async (path, body) => {
      adminCalls.push({ path, body })
      if (path.startsWith('/backfill/batch/reservations?')) return { reservations: [], next_after: null }
      if (path.startsWith('/backfill/batch?')) return { units: [unit], next_after: null }
      if (path === '/backfill/batch/result') return { state: 'done' }
      if (path === '/backfill/batch/cancel') return { state: 'released' }
      return { state: 'reserved', released: 2 }
    },
    anthropic: async (path, body, raw) => {
      if (body && path === '/v1/messages/batches') { posts.push(body); return { id: `msgbatch_invented${++count}` } }
      if (raw) return JSON.stringify(response) + '\n'
      return { processing_status: complete ? 'ended' : 'in_progress' }
    },
  }
  return { run, unit, d, saved, receipts, adminCalls, posts, setResponse: (r: any) => { response = r }, setComplete: (v: boolean) => { complete = v } }
}

// Use the real D1 ownership/queue/write handlers; all KB and batch data is invented.
async function integrated() {
  const client = await setup(), { d, run, adminCalls } = client
  const { d1, raw } = makeD1(), kb = new FakeKb()
  kb.add(rid, { title: '', slug: 'invented-unit', texts: { body: fixture.source }, classifications: [
    { labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' },
  ] })
  await enqueue(d1, ['speech_summary', 'speech_topics'].map(task => ({ rid, task: task as 'speech_summary', priority: 0, historicHold: true })), 1)
  const server: BatchDeps = { db: d1, kb, now: () => d.now(), live: true }
  const unit: Unit = { ...(await readHeldBatch(server, 20)).units[0]!, stage: 'selected', attempt: 1 }
  run.units = [unit]
  d.admin = async (path, body?: any) => {
    adminCalls.push({ path, body })
    const query = new URL(path, 'https://example.invalid').searchParams
    try {
      if (path.startsWith('/backfill/batch/reservations?')) return readBatchReservations(server, query.get('run_id')!, Number(query.get('limit')), query.get('after')!)
      if (path.startsWith('/backfill/batch?')) return readHeldBatch(server, Number(query.get('limit')), query.get('after')!)
      if (path === '/backfill/batch/reserve') return await reserveBatch(server, body.run_id, body.rid, body.source_hash)
      if (path === '/backfill/batch/cancel') return await cancelBatch(server, body.run_id, body.rid)
      if (path === '/backfill/batch/result') return await applyBatch(server, body.run_id, body.rid, body.source_hash, body.result)
      if (path === '/backfill/release') return await releaseHistoric({ db: d1, kb: { getBySlug: async () => kb.getBasic(rid) }, now: server.now }, body.slugs)
      throw Error('unexpected fixture route')
    } catch (e) {
      if (e instanceof BatchBusy) throw new AdminHttp(423, e.leaseUntil)
      if (e instanceof BatchConflict) throw new AdminHttp(409)
      throw e
    }
  }
  return { ...client, unit, server, raw, kb }
}

test('a reserve/save crash reconciles ownership before cancel and makes both held rows claimable', async () => {
  const { run, unit, d, server, raw, adminCalls, saved } = await integrated()
  d.save(run) // durable selection precedes reserve
  const durable = saved.get(run.id)!
  const originalSave = d.save
  d.save = r => {
    if (r.units.some(u => u.stage === 'reserved')) throw Error('invented controller crash before save')
    originalSave(r)
  }
  await assert.rejects(prepare(run, d), /controller crash/)
  assert.equal(durable.units[0].stage, 'selected')
  assert.equal(rows(raw, 'SELECT state FROM batch_items')[0].state, 'reserved')
  assert.equal((await readHeldBatch(server, 20)).units.length, 0)
  d.save = originalSave
  adminCalls.length = 0
  await cancelRun(durable, d)
  assert.ok(adminCalls[0].path.startsWith('/backfill/batch/reservations?'))
  assert.deepEqual(adminCalls.slice(1).map(c => c.path), ['/backfill/batch/cancel','/backfill/release'])
  assert.equal(durable.units[0].stage, 'released')
  assert.equal(rows(raw, 'SELECT state FROM batch_items')[0].state, 'released')
  assert.equal(rows(raw, "SELECT * FROM queue WHERE status='pending' AND historic_released=1").length, 2)
  const claimed = await claimRids(server.db, 10, d.now(), 'invented-live')
  assert.equal(claimed.length, 2)
  assert.equal(claimed[0].rid, unit.rid)
  assert.equal(rows(raw, "SELECT * FROM queue WHERE status='claimed'").length, 2)
})

test('resuming a lost reserve acknowledgement reuses ownership without reserving or paying twice', async () => {
  const { run, d, server, unit, adminCalls, posts } = await integrated()
  await reserveBatch(server, run.id, unit.rid, unit.source_hash)
  await prepare(run, d)
  assert.equal(run.units[0].stage, 'reserved')
  assert.equal(adminCalls.filter(c => c.path === '/backfill/batch/reserve').length, 0)
  await stepRun(run, d)
  assert.equal(posts.length, 1)
})

test('ownership reconciliation repairs a prior local cancellation that never reached the worker', async () => {
  const { run, unit, d, server, raw } = await integrated()
  await reserveBatch(server, run.id, unit.rid, unit.source_hash)
  run.canceled = true; unit.stage = 'released' // state saved by the reviewed buggy controller
  await stepRun(run, d)
  assert.equal(unit.stage, 'released')
  assert.equal(rows(raw, 'SELECT state FROM batch_items')[0].state, 'released')
  assert.equal(rows(raw, "SELECT * FROM queue WHERE status='pending'").length, 2)
})

test('ownership reconciliation reads every page and saves only a complete server snapshot', async () => {
  const { run, d, unit } = await setup()
  const other = { ...structuredClone(unit), rid: 'b'.repeat(32) }
  run.units = [unit, other]
  const paths: string[] = []
  let fail = true
  d.admin = async path => {
    paths.push(path)
    if (path.endsWith(`after=${unit.rid}`)) {
      if (fail) throw new AdminHttp(503)
      return { reservations: [{ ...other, state: 'reserved' }], next_after: null }
    }
    return { reservations: [{ ...unit, state: 'reserved' }], next_after: unit.rid }
  }
  await assert.rejects(reconcileRun(run, d), AdminHttp)
  assert.ok(run.units.every(u => u.stage === 'selected'))
  fail = false
  await reconcileRun(run, d)
  assert.ok(run.units.every(u => u.stage === 'reserved'))
  assert.equal(paths.length, 4)
})

test('cancel before reserve asks the worker, and a failed release never becomes locally released', async () => {
  const { run, d, raw, server, unit, saved } = await integrated()
  await reserveBatch(server, run.id, unit.rid, unit.source_hash)
  const original = d.admin
  d.admin = async (path, body) => { if (path === '/backfill/release') throw new AdminHttp(503); return original(path, body) }
  await assert.rejects(cancelRun(run, d), AdminHttp)
  assert.notEqual(saved.get(run.id)!.units[0].stage, 'released')
  assert.equal(rows(raw, 'SELECT state FROM batch_items')[0].state, 'released')
  d.admin = original
  await cancelRun(saved.get(run.id)!, d)
  assert.equal(rows(raw, "SELECT * FROM queue WHERE status='pending'").length, 2)
  const fresh = await integrated()
  await cancelRun(fresh.run, fresh.d)
  assert.ok(fresh.adminCalls.some(c => c.path === '/backfill/batch/cancel'))
  assert.ok(fresh.adminCalls.some(c => c.path === '/backfill/release'))
  assert.equal(rows(fresh.raw, "SELECT * FROM queue WHERE status='pending'").length, 2)
})

test('failed reservation reconciliation stops resume before any writes or batch API calls', async () => {
  const { run, d, posts, adminCalls } = await integrated()
  d.admin = async () => { throw new AdminHttp(503) }
  await assert.rejects(stepRun(run, d), AdminHttp)
  await assert.rejects(cancelRun(run, d), AdminHttp)
  assert.equal(run.canceled, undefined)
  assert.equal(posts.length, 0)
  assert.equal(adminCalls.length, 0)
})

test('expired writer leases retry the retained paid result; true eligibility conflicts use live release', async () => {
  const { run, d, unit, raw, kb, adminCalls, posts, saved } = await integrated()
  await prepare(run, d); await submit(run, d); await poll(run, run.submissions[0], d)
  const result = structuredClone(unit.result), end = d.now() + 15 * 60000
  // A worker crash leaves its durable writer lease and payload hash.
  raw.prepare("UPDATE batch_items SET state='applying', payload_hash=?, lease_until=?").run(await hashValue(result), end)
  await stepRun(run, d)
  assert.equal(unit.stage, 'ready')
  assert.deepEqual(saved.get(run.id)!.units[0].result, result)
  assert.equal(unit.retry_at, end)
  assert.equal(posts.length, 1)
  assert.deepEqual(kb.writes(), [])
  assert.equal(adminCalls.filter(c => c.path === '/backfill/batch/cancel' || c.path === '/backfill/release').length, 0)
  const deliveries = adminCalls.filter(c => c.path === '/backfill/batch/result').length
  await stepRun(saved.get(run.id)!, d)
  assert.equal(adminCalls.filter(c => c.path === '/backfill/batch/result').length, deliveries)
  d.now = () => end // expiry permits delivery, without another paid submission
  const resumed = saved.get(run.id)!
  await stepRun(resumed, d)
  assert.equal(resumed.units[0].stage, 'done')
  assert.equal(posts.length, 1)
  assert.ok(rows(raw, 'SELECT batch_run FROM queue').every(r => r.batch_run === run.id))

  const conflict = await integrated()
  await prepare(conflict.run, conflict.d); await submit(conflict.run, conflict.d); await poll(conflict.run, conflict.run.submissions[0], conflict.d)
  // A row is no longer held: this is a permanent conflict, rather than a lease.
  conflict.raw.exec("UPDATE queue SET status='pending', terminal_reason=NULL")
  await stepRun(conflict.run, conflict.d)
  assert.equal(conflict.run.units[0].stage, 'released')
  assert.deepEqual(conflict.adminCalls.slice(-2).map(c => c.path), ['/backfill/batch/cancel','/backfill/release'])
  assert.equal(rows(conflict.raw, 'SELECT state FROM batch_items')[0].state, 'released')
  assert.deepEqual(conflict.kb.writes(), [])
})

test('cancellation waits out an active writer lease before releasing any held rows', async () => {
  const { run, d, unit, raw, adminCalls, saved } = await integrated()
  await prepare(run, d); await submit(run, d); await poll(run, run.submissions[0], d)
  const end = d.now() + 15 * 60000
  raw.prepare("UPDATE batch_items SET state='applying',lease_until=?").run(end)
  await cancelRun(run, d)
  assert.equal(unit.stage, 'ready')
  assert.equal(unit.retry_at, end)
  assert.ok(rows(raw, 'SELECT terminal_reason FROM queue').every(r => r.terminal_reason === 'historic-held'))
  assert.equal(adminCalls.filter(c => c.path === '/backfill/release').length, 0)
  d.now = () => end
  await stepRun(saved.get(run.id)!, d)
  assert.equal(rows(raw, "SELECT * FROM queue WHERE status='pending'").length, 2)
})

test('client prepares only held inventory and resumes selected rows saved before reservation', async () => {
  const { run, unit, d, adminCalls } = await setup()
  run.units = [unit] // crash just after the page was saved at the target batch size
  await prepare(run, d)
  assert.equal(run.units[0].stage, 'reserved')
  assert.equal(adminCalls.length, 2)
  assert.ok(adminCalls[0].path.startsWith('/backfill/batch/reservations?run_id=invented-run'))
  assert.equal(adminCalls[1].path, '/backfill/batch/reserve')
})

test('client excludes short records from paid submissions and uses the live short-unit rule', async () => {
  const { run, unit, d, posts, adminCalls } = await setup()
  unit.short = true
  await prepare(run, d)
  await submit(run, d)
  assert.equal(posts.length, 0)
  assert.equal(run.units[0].stage, 'released')
  assert.ok(adminCalls.some(c => c.path === '/backfill/release'))
})

test('ambiguous submission remains reserved and is never submitted twice on resume', async () => {
  const { run, d, saved } = await setup()
  await prepare(run, d)
  let n = 0
  d.anthropic = async () => { n++; throw Error('invented network timeout') }
  await assert.rejects(submit(run, d))
  const resumed = saved.get(run.id)!
  assert.equal(resumed.submissions.length, 1)
  assert.equal(resumed.submissions[0].id, undefined)
  await submit(resumed, d)
  await assert.rejects(poll(resumed, resumed.submissions[0], d), /ambiguous/)
  assert.equal(n, 1)
})

test('ambiguous batch adoption requires an ended batch with the exact saved custom IDs', async () => {
  const { run, d, setComplete, setResponse } = await setup()
  await prepare(run, d); await submit(run, d)
  run.submissions[0].id = undefined; d.save(run)
  setComplete(false)
  await assert.rejects(adoptRun(run, 'msgbatch_verified', d), /end/)
  setComplete(true)
  const wrong = structuredClone(fixture.responses[0]); wrong.custom_id = 'other-unit'; setResponse(wrong)
  await assert.rejects(adoptRun(run, 'msgbatch_verified', d), /coverage/)
  assert.equal(run.submissions[0].id, undefined)
  setResponse(fixture.responses[0])
  await adoptRun(run, 'msgbatch_verified', d)
  assert.equal(run.submissions[0].id, 'msgbatch_verified')
})

test('client retries only a rejected task, retains accepted topics, and delivers a validated merged result', async () => {
  const { run, d, posts, setResponse, adminCalls } = await setup()
  await prepare(run, d); await submit(run, d)
  setResponse(structuredClone(fixture.responses[1]))
  await poll(run, run.submissions[0], d)
  assert.equal(run.units[0].attempt, 2)
  assert.deepEqual(run.units[0].retry_tasks, ['summary'])
  await submit(run, d)
  assert.deepEqual(posts[1].requests[0].params.output_config.format.schema.required, ['summary'])
  const response = structuredClone(fixture.responses[0]); response.custom_id = `${rid}-2`
  response.result.message.content[0].text = JSON.stringify({ summary: decode(fixture.responses[0]).summary })
  setResponse(response)
  await poll(run, run.submissions[1], d)
  await deliver(run, d)
  assert.equal(run.units[0].stage, 'done')
  const delivery = adminCalls.find(c => c.path === '/backfill/batch/result')!
  assert.deepEqual(delivery.body.result.topics, ['housing'])
  const calls = adminCalls.length
  await poll(run, run.submissions[0], d); await deliver(run, d)
  assert.equal(adminCalls.length, calls)
})

test('a refusal releases immediately and a second failed attempt releases through the worker', async () => {
  for (const refusal of [true, false]) {
    const { run, d, setResponse, adminCalls, posts } = await setup()
    await prepare(run, d); await submit(run, d)
    setResponse(structuredClone(fixture.responses[refusal ? 2 : 1]))
    await poll(run, run.submissions[0], d)
    if (!refusal) {
      await submit(run, d)
      const response = structuredClone(fixture.responses[1]); response.custom_id = `${rid}-2`; setResponse(response)
      await poll(run, run.submissions[1], d)
    }
    await deliver(run, d)
    assert.equal(run.units[0].stage, 'released')
    assert.equal(posts.length, refusal ? 1 : 2)
    assert.deepEqual(adminCalls.slice(-2).map(c => c.path), ['/backfill/batch/cancel','/backfill/release'])
    assert.equal(adminCalls.filter(c => c.path === '/backfill/batch/result').length, 0)
  }
})

test('missing or duplicate result IDs fail closed while keeping the spend reservation', async () => {
  const { run, d } = await setup()
  await prepare(run, d); await submit(run, d)
  const response = structuredClone(fixture.responses[0]); response.custom_id = 'unknown'
  d.anthropic = async (_path, _body, raw) => raw ? JSON.stringify(response) : { processing_status: 'ended' }
  await assert.rejects(poll(run, run.submissions[0], d), /coverage/)
  assert.equal(run.submissions[0].reservation.actual, undefined)
  assert.equal(run.units[0].stage, 'reserved')
  d.anthropic = async (_path, _body, raw) => raw ? [fixture.responses[0],fixture.responses[0]].map(r => JSON.stringify(r)).join('\n') : { processing_status: 'ended' }
  await assert.rejects(poll(run, run.submissions[0], d), /coverage/)
})

test('daily and lifetime caps and global concurrency prevent POST before any spend', async () => {
  const { run, d, posts, saved } = await setup()
  await prepare(run, d)
  d.dailyCap = 0.000001
  await assert.rejects(submit(run, d), /cap/)
  assert.equal(run.submissions.length, 0)
  assert.equal(posts.length, 0)
  d.dailyCap = 3; d.totalCap = 0.000001
  await assert.rejects(submit(run, d), /cap/)
  d.totalCap = 3
  saved.set('other', { id: 'other', units: [], submissions: [{ id: 'msgbatch_other', attempt: 1, rids: [], reservation: { day: '2026-10-11', upper: 0.1 } }] })
  d.maxActive = 1
  await submit(run, d)
  assert.equal(posts.length, 0)
})

test('slow batches retain their holds and canceled late results are charged but never delivered', async () => {
  const { run, d, setComplete, adminCalls } = await setup()
  await prepare(run, d); await submit(run, d)
  setComplete(false)
  await poll(run, run.submissions[0], d)
  assert.equal(run.units[0].stage, 'reserved')
  assert.equal(adminCalls.filter(c => c.path === '/backfill/release').length, 0)
  await cancelRun(run, d)
  assert.equal(run.units[0].stage, 'released')
  setComplete(true)
  await poll(run, run.submissions[0], d); await deliver(run, d)
  assert.ok(run.submissions[0].reservation.actual! > 0)
  assert.equal(adminCalls.filter(c => c.path === '/backfill/batch/result').length, 0)
})

test('admin backpressure keeps a ready result while changed-source conflicts release the owned hold', async () => {
  const { run, d, adminCalls } = await setup()
  await prepare(run, d); await submit(run, d); await poll(run, run.submissions[0], d)
  const original = d.admin
  d.admin = async (path, body) => path === '/backfill/batch/result' ? { state: 'retry-write' } : original(path, body)
  await deliver(run, d)
  assert.equal(run.units[0].stage, 'ready')
  d.admin = async (path, body) => { if (path === '/backfill/batch/result') throw new AdminHttp(409); return original(path, body) }
  await deliver(run, d)
  assert.equal(run.units[0].stage, 'released')
  assert.deepEqual(adminCalls.slice(-2).map(c => c.path), ['/backfill/batch/cancel','/backfill/release'])
})

test('cancellation resumes an acknowledged server delivery without releasing it or delivering other results', async () => {
  const { run, d, adminCalls } = await setup()
  await prepare(run, d); await submit(run, d); await poll(run, run.submissions[0], d)
  const original = d.admin
  d.admin = async (path, body) => path === '/backfill/batch/cancel' ? { state: 'done' } : original(path, body)
  await cancelRun(run, d)
  assert.equal(run.units[0].stage, 'done')
  await deliver(run, d)
  assert.equal(adminCalls.filter(c => c.path === '/backfill/batch/result' || c.path === '/backfill/release').length, 0)
})
