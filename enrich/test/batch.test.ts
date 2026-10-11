import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join } from 'node:path'
import worker from '../src/index.ts'
import { applyBatch, BatchBusy, BatchConflict, cancelBatch, parseBatchBody, readBatchReservations, readHeldBatch, reserveBatch, type BatchDeps } from '../src/batch.ts'
import { hashValue, validateBatchResult } from '../src/batch-result.ts'
import { claimRids, enqueue } from '../src/db.ts'
import { releaseHistoric } from '../src/reconcile.ts'
import { KbBackpressure } from '../src/kb.ts'
import type { Env } from '../src/env.ts'
import { batchRequest, batchVerdict, decode, reserveSpend, usageCost } from '../scripts/batch-lib.ts'
import { FakeKb, makeD1, rows } from './helpers.ts'

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'batch-responses.json'), 'utf8'))
const rid = 'a'.repeat(32), run = 'invented-run'
const good = decode(fixture.responses[0])
const labels = [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }, { labelset: 'chamber', label: 'senate' }]
async function setup() {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  kb.add(rid, { title: '', slug: 'invented-unit', texts: { body: fixture.source }, classifications: structuredClone(labels) })
  await enqueue(d1, ['speech_summary', 'speech_topics'].map(task => ({ rid, task: task as 'speech_summary', priority: 0, historicHold: true })), 1)
  let clock = 100
  const d: BatchDeps = { db: d1, kb, now: () => clock, live: true }
  const unit = (await readHeldBatch(d, 20)).units[0]!
  return { d, d1, raw, kb, unit, advance: () => { clock += 16 * 60000 } }
}

test('recorded batch requests use worker prompts, enum schema, one-hour cache and disabled thinking', async () => {
  const { unit } = await setup(), req = batchRequest(unit, 1)
  assert.equal(req.params.model, 'claude-haiku-5-5')
  assert.deepEqual(req.params.thinking, { type: 'disabled' })
  assert.equal(req.params.system[0].cache_control.ttl, '1h')
  assert.ok(req.params.system[0].text.includes('HISTORIC HANSARD'))
  assert.ok(req.params.output_config.format.schema.properties.topics.items.enum.includes('housing'))
  assert.ok(batchVerdict(unit, fixture.responses[0]).valid)
  for (const r of fixture.responses.slice(1)) assert.equal(batchVerdict(unit, r).valid, false)
  assert.ok(Math.abs(usageCost(fixture.responses[0].result.message.usage) - 0.0000325) < 1e-12)
})

test('held inventory is read-only and reservations exclude overlap without making rows claimable', async () => {
  const { d, raw, unit } = await setup()
  const before = rows(raw, 'SELECT * FROM queue')
  await readHeldBatch(d, 1)
  assert.deepEqual(rows(raw, 'SELECT * FROM queue'), before)
  await reserveBatch(d, run, rid, unit.source_hash)
  assert.deepEqual(await reserveBatch(d, run, rid, unit.source_hash), { state: 'reserved' })
  await assert.rejects(reserveBatch(d, 'other-run', rid, unit.source_hash), BatchConflict)
  assert.equal((await readHeldBatch(d, 20)).units.length, 0)
  assert.deepEqual(await claimRids(d.db, 10, 3, 'live'), [])
})

test('concurrent reserve retries have one durable owner and both acknowledge that owner', async () => {
  const { d, raw, unit } = await setup()
  const replies = await Promise.all([reserveBatch(d, run, rid, unit.source_hash), reserveBatch(d, run, rid, unit.source_hash)])
  assert.deepEqual(replies, [{ state: 'reserved' }, { state: 'reserved' }])
  assert.equal(rows(raw, 'SELECT * FROM batch_items').length, 1)
  assert.deepEqual(await cancelBatch(d, 'other-run', rid), { state: 'unowned' })
  assert.equal(rows(raw, 'SELECT state FROM batch_items')[0].state, 'reserved')
  await cancelBatch(d, run, rid)
  assert.deepEqual(await reserveBatch(d, run, rid, unit.source_hash), { state: 'released' })
  assert.deepEqual(await readBatchReservations(d, 'other-run', 200), { reservations: [], next_after: null })
})

test('batch delivery rejects missing, pending, claimed, terminal and non-historic rows', async () => {
  for (const state of ['missing', 'pending', 'claimed', 'terminal', 'non-historic', 'forced']) {
    const { d, raw, kb, unit } = await setup()
    await reserveBatch(d, run, rid, unit.source_hash)
    if (state === 'missing') raw.exec('DELETE FROM queue')
    if (state === 'pending' || state === 'claimed') raw.prepare('UPDATE queue SET status=?').run(state)
    if (state === 'terminal') raw.exec("UPDATE queue SET terminal_reason='skipped-short'")
    if (state === 'non-historic') kb.resources.get(rid)!.classifications = [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard' }]
    if (state === 'forced') raw.exec('UPDATE queue SET force=1')
    await assert.rejects(applyBatch(d, run, rid, unit.source_hash, good), BatchConflict)
    assert.deepEqual(kb.writes(), [])
  }
})

test('every result is validated on the server regardless of caller flags', async () => {
  const { d, kb, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  for (const output of [
    { ...good, summary: 'Too short.', validated: true, skip_validation: true },
    { ...good, summary: good.summary + ' The cost was $999 million.' },
    { ...good, summary: good.summary + ' Unlisted Institute offered assistance.' },
    { ...good, summary: fixture.source.slice(0, 200) },
    { ...good, topics: {} },
  ]) {
    const result = await applyBatch(d, run, rid, unit.source_hash, output)
    assert.equal(result.state, 'invalid')
  }
  assert.deepEqual(kb.writes(), [])
  assert.equal(validateBatchResult(unit.record, ['summary','topics'], { ...good, topics: [] }).valid, true)
})

test('delivery uses the tick write path, repairs non-topic labels and replays without a second write', async () => {
  const { d, kb, raw, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  kb.dropOnWrite = 'chamber'
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, good)).state, 'done')
  assert.deepEqual(kb.resources.get(rid)!.classifications.filter(c => c.labelset !== 'topic'), labels)
  const calls = kb.writes().length
  assert.deepEqual(await applyBatch(d, run, rid, unit.source_hash, good), { state: 'done', replay: true })
  assert.equal(kb.writes().length, calls)
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, { topics: good.topics, summary: good.summary })).state, 'done')
  assert.deepEqual(await cancelBatch(d, run, rid), { state: 'done' })
  assert.deepEqual(await reserveBatch(d, run, rid, unit.source_hash), { state: 'done' })
  assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'done' && r.terminal_reason === null && r.batch_run === run))
  await assert.rejects(applyBatch(d, run, rid, unit.source_hash, { ...good, summary: good.summary + ' changed' }), BatchConflict)
})

test('existing briefs and topics appearing after generation are preserved', async () => {
  const { d, kb, raw, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  kb.resources.get(rid)!.texts['da-summary-t-body'] = 'Existing reviewed brief.'
  kb.resources.get(rid)!.classifications.push({ labelset: 'topic', label: 'health' })
  await applyBatch(d, run, rid, unit.source_hash, good)
  assert.equal(kb.resources.get(rid)!.texts['da-summary-t-body'], 'Existing reviewed brief.')
  assert.ok(kb.resources.get(rid)!.classifications.some(c => c.label === 'health'))
  assert.deepEqual(kb.writes(), [])
  assert.ok(rows(raw, 'SELECT outcome FROM queue').every(r => r.outcome === 'skipped-existing'))
})

test('changed source and a lost hold are rejected before any write', async () => {
  const { d, kb, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  kb.resources.get(rid)!.texts.body += ' Additional source information.'
  await assert.rejects(applyBatch(d, run, rid, unit.source_hash, good), BatchConflict)
  assert.deepEqual(kb.writes(), [])
})

test('dry delivery leaves the hold intact and live delivery revalidates it', async () => {
  const { d, kb, raw, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  assert.equal((await applyBatch({ ...d, live: false }, run, rid, unit.source_hash, good)).state, 'dry')
  assert.ok(rows(raw, 'SELECT terminal_reason FROM queue').every(r => r.terminal_reason === 'historic-held'))
  assert.deepEqual(kb.writes(), [])
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, good)).state, 'done')
})

test('write backpressure keeps paid results resumable and leases prevent concurrent delivery or release', async () => {
  const { d, kb, raw, unit, advance } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  kb.failWrites = new KbBackpressure('invented backpressure', 429)
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, good)).state, 'retry-write')
  kb.failWrites = null
  raw.exec("UPDATE batch_items SET state='applying',lease_until=900000")
  await assert.rejects(applyBatch(d, run, rid, unit.source_hash, good), BatchBusy)
  await assert.rejects(cancelBatch(d, run, rid), BatchBusy)
  await assert.rejects(applyBatch(d, run, rid, unit.source_hash, { ...good, summary: good.summary + ' changed' }), BatchConflict)
  advance()
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, good)).state, 'done')
})

test('partial delivery resumes after a crash without overwriting the first task', async () => {
  const { d, kb, raw, unit, advance } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  const original = kb.patchClassifications.bind(kb)
  let fail = true
  kb.patchClassifications = async (...args) => {
    if (fail) { fail = false; throw new KbBackpressure('injected interruption', 429) }
    return original(...args)
  }
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, good)).state, 'retry-write')
  kb.patchClassifications = original
  assert.equal(rows(raw, 'SELECT * FROM queue WHERE batch_run=?', run).length, 1)
  const writes = kb.writes().length
  advance()
  assert.equal((await applyBatch(d, run, rid, unit.source_hash, good)).state, 'done')
  assert.equal(kb.writes().length, writes + 1)
  assert.ok(rows(raw, 'SELECT batch_run FROM queue').every(r => r.batch_run === run))
})

test('fallback uses release and preserves live-worker attempts and terminal rules', async () => {
  const { d, raw, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  const releaseDeps = { db: d.db, kb: { getBySlug: async () => d.kb.getBasic(rid) }, now: d.now }
  assert.equal((await releaseHistoric(releaseDeps, ['invented-unit'])).released, 0)
  await cancelBatch(d, run, rid)
  assert.equal((await releaseHistoric(releaseDeps, ['invented-unit'])).released, 2)
  assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'pending' && r.attempts === 0 && r.names_rejected === 0 && r.historic_released === 1))
  await assert.rejects(applyBatch(d, run, rid, unit.source_hash, good), BatchConflict)
})

test('short records paginate but cannot be reserved or charged to Anthropic', async () => {
  const { d, kb } = await setup()
  kb.resources.get(rid)!.texts.body = 'Moved that the debate be adjourned until later.'
  const page = await readHeldBatch(d, 1)
  assert.equal(page.units[0]!.short, true)
  assert.equal(page.next_after, rid)
  assert.equal((await readHeldBatch(d, 1, rid)).units.length, 0)
  await assert.rejects(reserveBatch(d, run, rid, page.units[0]!.source_hash), BatchConflict)
})

test('admin batch routes require authentication and reject invalid bodies', async () => {
  const { d1 } = makeD1(), env = { DB: d1, ENRICH_ADMIN_TOKEN: 'invented-admin-secret' } as Env
  for (const path of ['/backfill/batch','/backfill/batch/reservations','/backfill/batch/reserve','/backfill/batch/result','/backfill/batch/cancel']) {
    const method = path === '/backfill/batch' || path === '/backfill/batch/reservations' ? 'GET' : 'POST'
    assert.equal((await worker.fetch(new Request('https://example.invalid' + path, { method }), env)).status, 401)
  }
  assert.ok('error' in parseBatchBody({ rid: 'unsafe', run_id: run }))
  const headers = { authorization: 'Bearer invented-admin-secret' }
  assert.equal((await worker.fetch(new Request('https://example.invalid/backfill/batch?limit=21', { headers }), env)).status, 400)
  for (const query of ['', '?run_id=unsafe%2Frun', '?run_id=invented-run&limit=201', '?run_id=invented-run&after=unsafe']) {
    assert.equal((await worker.fetch(new Request('https://example.invalid/backfill/batch/reservations' + query, { headers }), env)).status, 400)
  }
  assert.equal((await worker.fetch(new Request('https://example.invalid/backfill/batch/result', { method: 'POST', headers, body: '{}' }), env)).status, 400)
})

test('authenticated reservation reads isolate runs, paginate and never mutate queue or call KB', async () => {
  const { d, d1, raw, unit } = await setup()
  await reserveBatch(d, run, rid, unit.source_hash)
  raw.prepare("INSERT INTO batch_items (rid,run_id,source_hash,tasks,state,updated_at) VALUES (?,?,?,'[]','reserved',1)")
    .run('b'.repeat(32), 'other-run', unit.source_hash)
  const before = rows(raw, 'SELECT * FROM queue')
  const env = { DB: d1, ENRICH_ADMIN_TOKEN: 'invented-admin-secret' } as Env
  const get = (query: string) => worker.fetch(new Request('https://example.invalid/backfill/batch/reservations' + query, { headers: { authorization: 'Bearer invented-admin-secret' } }), env)
  const first = await get('?run_id=invented-run&limit=1')
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await first.json(), { reservations: [{ rid, source_hash: unit.source_hash, state: 'reserved', lease_until: 0 }], next_after: rid })
  assert.deepEqual(await (await get(`?run_id=invented-run&limit=1&after=${rid}`)).json(), { reservations: [], next_after: null })
  assert.deepEqual(rows(raw, 'SELECT * FROM queue'), before)
})

test('HTTP result route separates active leases from conflicts and cannot bypass validation', async () => {
  const { d, d1, unit, kb, raw } = await setup()
  const env = { DB: d1, ENRICH_ADMIN_TOKEN: 'invented-admin-secret', ARAG_ZONE: 'example', ARAG_KB_ID: 'invented-kb', ARAG_KB_TOKEN: 'invented-kb-secret', WRITE_MODE: 'live' } as Env
  const original = globalThis.fetch
  let patches = 0
  globalThis.fetch = async (_input, init) => { if (init?.method === 'PATCH') patches++; return new Response(JSON.stringify(await kb.getResource(rid))) }
  const send = (result: unknown) => worker.fetch(new Request('https://example.invalid/backfill/batch/result', { method: 'POST', headers: { authorization: 'Bearer invented-admin-secret' }, body: JSON.stringify({ run_id: run, rid, source_hash: unit.source_hash, result, validated: true, skip_validation: true }) }), env)
  try {
    assert.equal((await send(good)).status, 409)
    await reserveBatch(d, run, rid, unit.source_hash)
    assert.equal((await send({ ...good, summary: 'Too short.' })).status, 422)
    const expiry = Date.now() + 15 * 60000
    raw.prepare("UPDATE batch_items SET state='applying',payload_hash=?,lease_until=?").run(await hashValue({ summary: good.summary, topics: good.topics }), expiry)
    const busy = await send(good)
    assert.equal(busy.status, 423)
    assert.equal((await busy.json() as { lease_until: number }).lease_until, expiry)
    assert.equal((await send({ ...good, summary: good.summary + ' changed' })).status, 409)
    kb.resources.get(rid)!.classifications = [{ labelset: 'kind', label: 'speech' }]
    assert.equal((await send(good)).status, 409)
    assert.equal(patches, 0)
  } finally { globalThis.fetch = original }
})

test('spend reservations include outstanding batches across days and settled receipts on their completion day', async () => {
  const { unit } = await setup(), requests = [batchRequest(unit, 1)], now = Date.parse('2026-10-11T00:00:00Z')
  const reserved = reserveSpend([], requests, now, 3, 3)
  assert.throws(() => reserveSpend([reserved], requests, now + 86400000, reserved.upper, 3))
  assert.throws(() => reserveSpend([{ ...reserved, actual: 0.49, settled_day: '2026-10-12' }], requests, now + 86400000, 0.49, 3))
  assert.throws(() => reserveSpend([], requests, now, NaN, 3))
  assert.throws(() => reserveSpend([reserved], requests, now, 3, reserved.upper))
})
