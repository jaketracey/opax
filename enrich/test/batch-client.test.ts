import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join } from 'node:path'
import { batchRecord, sourceHash } from '../src/batch-result.ts'
import { decode } from '../scripts/batch-lib.ts'
import { AdminHttp, adoptRun, cancelRun, deliver, poll, prepare, submit, type BatchRuntime, type Run, type Unit } from '../scripts/batch-path.ts'

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
      if (path.startsWith('/backfill/batch?')) return { units: [unit], next_after: null }
      if (path === '/backfill/batch/result') return { state: 'done' }
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

test('client prepares only held inventory and resumes selected rows saved before reservation', async () => {
  const { run, unit, d, adminCalls } = await setup()
  run.units = [unit] // crash just after the page was saved at the target batch size
  await prepare(run, d)
  assert.equal(run.units[0].stage, 'reserved')
  assert.equal(adminCalls.length, 1)
  assert.equal(adminCalls[0].path, '/backfill/batch/reserve')
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
