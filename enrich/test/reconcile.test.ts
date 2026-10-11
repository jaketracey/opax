import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from '../src/index.ts'
import { enqueue, finishRows } from '../src/db.ts'
import { parseReconcileBody, reconcileHistoric } from '../src/reconcile.ts'
import { hasParliamentaryService } from '../scripts/roster_membership.ts'
import { pushedSlug } from '../scripts/reconcile_historic.ts'
import { makeD1, rows } from './helpers.ts'
import type { Env } from '../src/env.ts'

const rid = 'a'.repeat(32)
const resource = { id: rid, usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }] } }
const kb = { getBySlug: async (_slug: string) => resource }

test('reconciliation resolves either discovery order without changing processing state', async () => {
  for (const discoverFirst of [true, false]) {
    const { d1, raw } = makeD1()
    const work = [{ rid, task: 'speech_summary' as const, priority: 100 }, { rid, task: 'speech_topics' as const, priority: 100 }]
    if (discoverFirst) {
      await enqueue(d1, work, 1)
      raw.exec("UPDATE queue SET status='claimed', attempts=2, transient=3, claim_token='claim', claimed_at=4, neurons=5, result='saved', model='model'")
    }
    const before = rows(raw, 'SELECT * FROM queue')
    const deps = { db: d1, kb, now: () => 7 }
    assert.deepEqual(await reconcileHistoric(deps, ['invented-slug']), { verified: 1, inserted: discoverFirst ? 0 : 2, reconciled: discoverFirst ? 2 : 0 })
    await enqueue(d1, work, 8)
    const after = rows(raw, 'SELECT * FROM queue')
    assert.ok(after.every(r => r.priority === 0 && r.historic === 1))
    if (discoverFirst) assert.deepEqual(after.map(r => ({ ...r })), before.map(r => ({ ...r, priority: 0, historic: 1 })))
    assert.deepEqual(await reconcileHistoric(deps, ['invented-slug']), { verified: 1, inserted: 0, reconciled: 0 })
  }
})

test('reconciliation updates saved unfinished results while preserving completed and terminal rows', async () => {
  for (const state of ['pending', 'claimed', 'dry', 'unwritten', 'written', 'empty', 'quarantined', 'skipped-short', 'rejected-names']) {
    const { d1, raw } = makeD1()
    await enqueue(d1, [{ rid, task: 'speech_summary', priority: 100 }], 1)
    if (['dry', 'unwritten', 'written', 'empty'].includes(state)) await finishRows(d1, [{ rid, task: 'speech_summary', status: 'done', outcome: state as 'dry', result: 'saved' }], 2)
    else if (state === 'skipped-short' || state === 'rejected-names') await finishRows(d1, [{ rid, task: 'speech_summary', status: 'done', terminalReason: state, outcome: state }], 2)
    else raw.prepare('UPDATE queue SET status=?').run(state)
    const before = rows(raw, "SELECT * FROM queue WHERE task='speech_summary'")[0]
    await reconcileHistoric({ db: d1, kb, now: () => 9 }, ['invented-slug'])
    const unfinished = ['pending', 'claimed', 'dry', 'unwritten'].includes(state)
    assert.deepEqual({ ...rows(raw, "SELECT * FROM queue WHERE task='speech_summary'")[0] }, unfinished ? { ...before, priority: 0, historic: 1 } : { ...before })
  }
})

test('reconciliation verifies the entire batch before mutations and rejects non-historic or missing resources', async () => {
  for (const invalid of [null, { ...resource, id: 'invalid' }, { ...resource, usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }] } }]) {
    const { d1, raw } = makeD1()
    let n = 0
    await assert.rejects(reconcileHistoric({ db: d1, kb: { getBySlug: async () => n++ === 0 ? resource : invalid }, now: () => 1 }, ['invented-one', 'invented-two']))
    assert.equal(rows(raw, 'SELECT COUNT(*) AS n FROM queue')[0].n, 0)
  }
})

test('admin reconciliation requires the same bearer token as status and canary', async () => {
  const { d1 } = makeD1()
  const env = { DB: d1, ENRICH_ADMIN_TOKEN: 'invented-test-secret' } as Env
  for (const authorization of [undefined, 'Bearer wrong']) {
    const response = await worker.fetch(new Request('https://example.invalid/backfill/reconcile', { method: 'POST', headers: authorization ? { authorization } : undefined }), env)
    assert.equal(response.status, 401)
  }
  const response = await worker.fetch(new Request('https://example.invalid/backfill/reconcile', { method: 'POST', headers: { authorization: 'Bearer invented-test-secret', 'content-type': 'application/json' }, body: '{}' }), env)
  assert.equal(response.status, 400)
  assert.ok('error' in parseReconcileBody({ slugs: [] }))
  assert.ok('error' in parseReconcileBody({ slugs: ['unsafe/slug'] }))
  assert.deepEqual(parseReconcileBody({ slugs: ['invented-slug', 'invented-slug'] }), { slugs: ['invented-slug'] })
})

test('push-log selector admits only successful entries and deduplicates through the client', () => {
  for (const status of ['pushed', 'created', 'updated', 'exists', 'ok', 200, 201]) assert.equal(pushedSlug({ slug: 'invented-slug', status }), 'invented-slug')
  for (const status of ['failed', 'pending', 429, 500]) assert.equal(pushedSlug({ slug: 'invented-slug', status }), null)
  assert.equal(pushedSlug({ slug: 'invented-slug', ok: true }), 'invented-slug')
  assert.equal(pushedSlug({ status: 'pushed' }), null)
})

test('roster admission requires a parliamentary identity, seat, or dated chamber service', () => {
  assert.equal(hasParliamentaryService({ pid: 'invented-id' }), true)
  assert.equal(hasParliamentaryService({ representation: [{ electorate: 'Invented Seat' }] }), true)
  assert.equal(hasParliamentaryService({ speech_scope: { chamber: 'lower', service: [{ start: '1999-01-01' }] } }), true)
  assert.equal(hasParliamentaryService({}), false)
  assert.equal(hasParliamentaryService({ representation: [], speech_scope: { chamber: 'lower', service: [] } }), false)
  assert.equal(hasParliamentaryService({ pid: '', representation: [{}] }), false)
})

test('authenticated route resolves historic slugs using only basic metadata', async () => {
  const { d1, raw } = makeD1()
  const env = { DB: d1, ENRICH_ADMIN_TOKEN: 'invented-test-secret', ARAG_ZONE: 'example', ARAG_KB_ID: 'invented-kb', ARAG_KB_TOKEN: 'invented-kb-secret' } as Env
  const savedFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)); calls.push(url.pathname + url.search)
    return new Response(JSON.stringify(resource), { status: 200 })
  }
  try {
    const response = await worker.fetch(new Request('https://example.invalid/backfill/reconcile', { method: 'POST', headers: { authorization: 'Bearer invented-test-secret', 'content-type': 'application/json' }, body: JSON.stringify({ slugs: ['invented-slug'] }) }), env)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { verified: 1, inserted: 2, reconciled: 0 })
    assert.deepEqual(calls, ['/api/v1/kb/invented-kb/slug/invented-slug?show=basic'])
    assert.ok(rows(raw, 'SELECT priority,historic FROM queue').every(r => r.priority === 0 && r.historic === 1))
  } finally { globalThis.fetch = savedFetch }
})

test('a partially completed reconciliation batch can be retried without changing processing state', async () => {
  const { d1, raw } = makeD1()
  const slugs = Array.from({ length: 51 }, (_, i) => `invented-${i + 1}`)
  const resourceFor = (slug: string) => ({ ...resource, id: Number(slug.split('-').at(-1)).toString(16).padStart(32, '0') })
  await enqueue(d1, slugs.flatMap(slug => ['speech_summary', 'speech_topics'].map(task => ({ rid: resourceFor(slug).id, task: task as 'speech_summary', priority: 100 }))), 1)
  raw.exec("UPDATE queue SET status='claimed',claim_token='preserved',claimed_at=2,attempts=2")
  const before = rows(raw, 'SELECT * FROM queue ORDER BY rid,task').map(r => ({ ...r, priority: 0, historic: 1 }))
  const deps = { db: d1, kb: { getBySlug: async (slug: string) => resourceFor(slug) }, now: () => 9 }
  const batch = d1.batch.bind(d1)
  let n = 0
  d1.batch = async (statements) => { if (++n === 2) throw new Error('injected local failure'); return batch(statements) }
  await assert.rejects(reconcileHistoric(deps, slugs))
  d1.batch = batch
  assert.deepEqual(await reconcileHistoric(deps, slugs), { verified: 51, inserted: 0, reconciled: 52 })
  assert.deepEqual(rows(raw, 'SELECT * FROM queue ORDER BY rid,task').map(r => ({ ...r })), before)
  assert.deepEqual(await reconcileHistoric(deps, slugs), { verified: 51, inserted: 0, reconciled: 0 })
  assert.ok('error' in parseReconcileBody({ slugs: Array(201).fill('invented-slug') }))
})
