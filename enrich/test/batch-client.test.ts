import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { join } from 'node:path'
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises'
import { batchRecord, hashValue, sourceHash } from '../src/batch-result.ts'
import { decode } from '../scripts/batch-lib.ts'
import { AdminHttp, adoptRun, cancelRun, deliver, poll, prepare, readDeliveryConcurrency, reconcileRun, saveRun, stepRun, submit, type BatchRuntime, type Run, type Unit } from '../scripts/batch-path.ts'
import { applyBatch, BatchBusy, BatchConflict, cancelBatch, readBatchReservations, readHeldBatch, reserveBatch, type BatchDeps } from '../src/batch.ts'
import { claimRids, enqueue } from '../src/db.ts'
import { releaseHistoric } from '../src/reconcile.ts'
import { FakeKb, makeD1, rows } from './helpers.ts'

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'batch-responses.json'), 'utf8'))
const rid = 'a'.repeat(32)
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function setup() {
  const resource = { title: '', slug: 'invented-unit', usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }] }, data: { texts: { body: { value: { body: fixture.source } } } } }
  const record = batchRecord(resource, rid)
  const unit: Unit = { rid, source_hash: await sourceHash(record), record, tasks: ['summary','topics'], stage: 'selected', attempt: 1 }
  const run: Run = { id: 'invented-run', units: [], submissions: [], preparing: true }
  const saved = new Map<string, Run>(), receipts = new Map<string, unknown>(), adminCalls: Array<{ path: string; body?: any }> = [], posts: any[] = []
  let response = structuredClone(fixture.responses[0]), count = 0, complete = true
  const d: BatchRuntime = {
    dailyCap: 3, totalCap: 3, maxActive: 2, batchSize: 1, deliveryConcurrency: 6, now: () => Date.parse('2026-10-11T00:00:00Z'),
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
async function integrated(count = 1) {
  const client = await setup(), { d, run, adminCalls } = client
  const { d1, raw } = makeD1(), kb = new FakeKb()
  const rids = Array.from({ length: count }, (_, i) => i === 0 ? rid : i.toString(16).padStart(32, '0'))
  for (const id of rids) kb.add(id, { title: '', slug: `invented-unit-${id}`, texts: { body: fixture.source }, classifications: [
    { labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' },
  ] })
  await enqueue(d1, rids.flatMap(rid => ['speech_summary', 'speech_topics'].map(task => ({ rid, task: task as 'speech_summary', priority: 0, historicHold: true }))), 1)
  const server: BatchDeps = { db: d1, kb, now: () => d.now(), live: true }
  run.units = (await readHeldBatch(server, 20)).units.map(u => ({ ...u, stage: 'selected', attempt: 1 }))
  const unit = run.units[0]
  d.batchSize = count
  d.admin = async (path, body?: any) => {
    adminCalls.push({ path, body })
    const query = new URL(path, 'https://example.invalid').searchParams
    try {
      if (path.startsWith('/backfill/batch/reservations?')) return readBatchReservations(server, query.get('run_id')!, Number(query.get('limit')), query.get('after')!)
      if (path.startsWith('/backfill/batch?')) return readHeldBatch(server, Number(query.get('limit')), query.get('after')!)
      if (path === '/backfill/batch/reserve') return await reserveBatch(server, body.run_id, body.rid, body.source_hash)
      if (path === '/backfill/batch/cancel') return await cancelBatch(server, body.run_id, body.rid)
      if (path === '/backfill/batch/result') return await applyBatch(server, body.run_id, body.rid, body.source_hash, body.result)
      if (path === '/backfill/release') return await releaseHistoric({ db: d1, kb: { getBySlug: async slug => kb.getBasic([...kb.resources].find(([, r]) => r.slug === slug)![0]) }, now: server.now }, body.slugs)
      throw Error('unexpected fixture route')
    } catch (e) {
      if (e instanceof BatchBusy) throw new AdminHttp(423, e.leaseUntil)
      if (e instanceof BatchConflict) throw new AdminHttp(409)
      throw e
    }
  }
  return { ...client, unit, server, raw, kb }
}

test('delivery concurrency defaults to six and accepts only integers from one to twelve', async () => {
  assert.equal(readDeliveryConcurrency(6), 6)
  assert.equal(readDeliveryConcurrency('12'), 12)
  const previous = process.env.OPAX_BATCH_DELIVERY_CONCURRENCY
  try {
    delete process.env.OPAX_BATCH_DELIVERY_CONCURRENCY
    assert.equal(readDeliveryConcurrency(), 6)
  } finally {
    if (previous === undefined) delete process.env.OPAX_BATCH_DELIVERY_CONCURRENCY
    else process.env.OPAX_BATCH_DELIVERY_CONCURRENCY = previous
  }
  for (const value of [0, -1, 13, 1.5, NaN, Infinity, '', 'invalid']) assert.throws(() => readDeliveryConcurrency(value), /1-12/)
  const { run, d, adminCalls } = await setup()
  d.deliveryConcurrency = 13
  await assert.rejects(deliver(run, d), /1-12/)
  assert.equal(adminCalls.length, 0)
})

test('delivery caps concurrent requests at one, six and twelve and saves every settled unit', async () => {
  for (const concurrency of [1, 6, 12]) {
    const { run, unit, d, saved } = await setup()
    run.units = Array.from({ length: 29 }, (_, i) => ({ ...structuredClone(unit), rid: i.toString(16).padStart(32, '0'), stage: 'ready' }))
    d.deliveryConcurrency = concurrency
    let active = 0, peak = 0, saves = 0
    const calls: string[] = [], originalSave = d.save
    d.save = r => { saves++; originalSave(r) }
    d.admin = async (path, body: any) => {
      assert.equal(path, '/backfill/batch/result')
      calls.push(body.rid); peak = Math.max(peak, ++active)
      await delay(1 + Number.parseInt(body.rid, 16) % 4)
      active--; return { state: 'done' }
    }
    await deliver(run, d)
    assert.equal(peak, concurrency)
    assert.equal(active, 0)
    assert.equal(new Set(calls).size, 29)
    assert.equal(calls.length, 29)
    assert.equal(saves, 29)
    assert.ok(saved.get(run.id)!.units.every(u => u.stage === 'done'))
  }
})

test('concurrent mixed successes, active leases and conflicts preserve paid results and release ownership safely', async () => {
  const { run, d, kb, raw, server, saved, adminCalls } = await integrated(6)
  run.preparing = false
  const good = decode(fixture.responses[0])
  for (const u of run.units) {
    await reserveBatch(server, run.id, u.rid, u.source_hash)
    u.stage = 'ready'; u.result = { summary: good.summary, topics: good.topics }
  }
  const [busy, stale] = run.units, end = d.now() + 15 * 60000
  raw.prepare("UPDATE batch_items SET state='applying',payload_hash=?,lease_until=? WHERE rid=?")
    .run(await hashValue(busy.result), end, busy.rid)
  kb.resources.get(stale.rid)!.texts.body += ' Additional evidence.'
  const paid = structuredClone(busy.result), originalAdmin = d.admin
  let active = 0, peak = 0
  d.admin = async (path, body) => {
    peak = Math.max(peak, ++active)
    try { await delay(2); return await originalAdmin(path, body) }
    finally { active-- }
  }
  d.deliveryConcurrency = 3
  await deliver(run, d)
  assert.equal(peak, 3)
  assert.equal(busy.stage, 'ready')
  assert.equal(busy.retry_at, end)
  assert.deepEqual(saved.get(run.id)!.units[0].result, paid)
  assert.equal(stale.stage, 'released')
  assert.ok(run.units.slice(2).every(u => u.stage === 'done'))
  assert.deepEqual(adminCalls.filter(c => c.body?.rid === stale.rid || c.path === '/backfill/release').map(c => c.path),
    ['/backfill/batch/result', '/backfill/batch/cancel', '/backfill/release'])
  assert.equal(kb.writes().filter(c => c.endsWith(busy.rid) || c.endsWith(stale.rid)).length, 0)
  const claimed = await claimRids(server.db, 10, 3, 'fixture-tick')
  assert.equal(claimed.length, 2)
  assert.ok(claimed.every(row => row.rid === stale.rid))
  const writes = kb.writes().length
  await deliver(saved.get(run.id)!, d)
  assert.equal(kb.writes().length, writes)
  d.now = () => end
  const resumed = saved.get(run.id)!
  await stepRun(resumed, d)
  assert.equal(resumed.units[0].stage, 'done')
  assert.equal(kb.writes().length, writes + 2)
  const replay = await applyBatch(server, run.id, busy.rid, busy.source_hash, paid)
  assert.deepEqual(replay, { state: 'done', replay: true })
  assert.equal(kb.writes().length, writes + 2)
})

test('a failed delivery stops dispatch and drains other units before returning, retaining unsettled results', async () => {
  const { run, unit, d, saved } = await setup()
  run.units = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(unit), rid: i.toString(16).padStart(32, '0'), stage: 'ready', result: { summary: 'Paid fixture result.' } }))
  d.deliveryConcurrency = 3
  d.save(run)
  const gates = Array.from({ length: 3 }, () => deferred<{ state: string }>())
  const calls: string[] = []
  d.admin = async (_path, body: any) => { calls.push(body.rid); return gates[calls.length - 1].promise }
  let finished = false
  const delivery = deliver(run, d).finally(() => { finished = true })
  const rejected = assert.rejects(delivery, e => e instanceof AdminHttp && e.status === 503)
  assert.equal(calls.length, 3)
  gates[0].reject(new AdminHttp(503))
  await nextTurn()
  assert.equal(finished, false)
  assert.equal(calls.length, 3)
  gates[2].resolve({ state: 'done' }); gates[1].resolve({ state: 'done' })
  await rejected
  assert.equal(finished, true)
  assert.equal(calls.length, 3)
  const resumed = saved.get(run.id)!
  assert.deepEqual(resumed.units.map(u => u.stage), ['ready', 'done', 'done', 'ready', 'ready', 'ready', 'ready', 'ready'])
  assert.ok(resumed.units.every(u => u.result?.summary === 'Paid fixture result.'))
  d.admin = async (_path, body: any) => { calls.push(body.rid); return { state: 'done' } }
  await deliver(resumed, d)
  assert.equal(calls.length, 9) // one ambiguous result is replayed; acknowledged successes are skipped
  assert.ok(saved.get(run.id)!.units.every(u => u.stage === 'done'))
})

test('a killed parallel controller resumes its atomic spool and ledger without double writes or lost paid results', { timeout: 20000 }, async () => {
  const { run, d, server, kb, raw } = await integrated(6)
  const directory = mkdtempSync(join(tmpdir(), 'opax-batch-crash-'))
  const good = decode(fixture.responses[0]), acknowledged = deferred<void>()
  const lostAcknowledgement = deferred<void>(), unfinished = deferred<void>()
  run.preparing = false
  for (const u of run.units) {
    await reserveBatch(server, run.id, u.rid, u.source_hash)
    u.stage = 'ready'; u.result = { summary: good.summary, topics: good.topics }
  }
  run.submissions = [{ id: 'msgbatch_fixture', attempt: 1, rids: run.units.map(u => u.rid), ended: true,
    reservation: { day: '2026-10-11', upper: 0.1, actual: 0.000195, settled_day: '2026-10-11' } }]
  saveRun(run, directory)
  let crash = true, deliveries = 0
  const local = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
      if (crash && request.url === '/backfill/batch/result') {
        const number = ++deliveries
        if (number > 2) { if (number === 4) unfinished.resolve(); return } // next dispatch proves the first save completed
        const result = await d.admin(request.url, body)
        if (number === 2) { lostAcknowledgement.resolve(); return } // committed remotely, no client acknowledgement
        response.end(JSON.stringify(result)); acknowledged.resolve(); return
      }
      response.end(JSON.stringify(await d.admin(request.url!, body)))
    } catch (e) {
      response.statusCode = e instanceof AdminHttp ? e.status : 503
      response.end(JSON.stringify({ error: 'fixture request incomplete' }))
    }
  })
  let child: ReturnType<typeof spawn> | undefined
  try {
    local.listen(0, '::1'); await once(local, 'listening')
    const address = local.address()
    assert.ok(address && typeof address !== 'string')
    const start = () => spawn(process.execPath, [join(import.meta.dirname, 'fixtures/batch-controller.ts'), 'step', run.id], {
      stdio: 'ignore', env: { ...process.env, OPAX_BATCH_STATE_DIR: directory, OPAX_ENRICH_URL: 'https://example.invalid',
        ENRICH_ADMIN_TOKEN: 'invented-fixture', OPAX_BATCH_DELIVERY_CONCURRENCY: '3',
        OPAX_BATCH_FIXTURE_URL: `http://[::1]:${address.port}` },
    })
    child = start()
    await Promise.race([
      Promise.all([acknowledged.promise, lostAcknowledgement.promise, unfinished.promise]),
      once(AbortSignal.timeout(8000), 'abort').then(() => { throw Error('controller fixture did not reach crash boundary') }),
      once(child, 'exit').then(() => { throw Error('controller fixture exited before crash boundary') }),
    ])
    // Wait until one settled unit is durable; the next dispatch proves save has completed.
    const durable = JSON.parse(readFileSync(join(directory, `run-${run.id}.json`), 'utf8')) as Run
    assert.equal(durable.units.filter(u => u.stage === 'done').length, 1)
    assert.equal(rows(raw, "SELECT * FROM batch_items WHERE state='done'").length, 2)
    const killed = once(child, 'exit')
    child.kill('SIGKILL'); await killed
    local.closeAllConnections()
    assert.ok(durable.units.every(u => u.result?.summary === good.summary))
    assert.deepEqual(durable.submissions, run.submissions)
    assert.equal(kb.writes().length, 4)
    crash = false
    child = start() // same spool; SQLite's controller lock must have been released on death
    const [code] = await once(child, 'exit')
    assert.equal(code, 0)
    const resumed = JSON.parse(readFileSync(join(directory, `run-${run.id}.json`), 'utf8')) as Run
    assert.ok(resumed.units.every(u => u.stage === 'done' && u.result?.summary === good.summary))
    assert.deepEqual(resumed.submissions, run.submissions)
    assert.equal(kb.writes().length, 12)
    // Explicit replay also cannot write twice, even with the acknowledgement lost before a crash.
    for (const u of resumed.units) assert.deepEqual(await applyBatch(server, run.id, u.rid, u.source_hash, u.result), { state: 'done', replay: true })
    assert.equal(kb.writes().length, 12)
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited }
    local.closeAllConnections(); await new Promise<void>(resolve => local.close(() => resolve()))
    raw.close(); rmSync(directory, { recursive: true, force: true })
  }
})

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
