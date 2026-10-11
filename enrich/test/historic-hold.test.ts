import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import worker from '../src/index.ts'
import { claimRids, enqueue, finishRows, getState, hasBackfill, unwrittenRows } from '../src/db.ts'
import { discover } from '../src/discover.ts'
import { readConfig, type Env } from '../src/env.ts'
import { Kb } from '../src/kb.ts'
import { reconcileHistoric, releaseHistoric } from '../src/reconcile.ts'
import { buildStatus } from '../src/status.ts'
import { runTick } from '../src/tick.ts'
import { checkHistoricHold } from '../scripts/check_historic_hold.ts'
import { FakeAi, FakeKb, GOOD_SUMMARY, makeD1, makeDeps, rows, speechText } from './helpers.ts'

const rid = 'a'.repeat(32)
const labels = [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }]
const resource = { id: rid, usermetadata: { classifications: labels } }
const slugKb = { getBySlug: async (_slug: string) => resource }
const discovery = (db: D1Database, kb: FakeKb, historicHold = true) => discover({
  db, kb, historicHold, now: 1, startIso: '2026-09-20T00:00:00Z', maxPages: 2, overlapS: 120,
})
function catalogKb(): FakeKb {
  const kb = new FakeKb()
  kb.add(rid, { classifications: labels.map(label => ({ ...label })), texts: { body: speechText() } })
  kb.catalogRows = [{ rid, kind: 'speech', created: '2026-09-28T11:00:00.000000' }]
  return kb
}

test('historic discovery advances its cursor and spends no neurons on held tasks, regardless of priority', async () => {
  const kb = catalogKb()
  const ai = new FakeAi(() => JSON.stringify({ summary: GOOD_SUMMARY, topics: ['housing'] }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { HISTORIC_HOLD: 'true', WRITE_MODE: 'live' } })
  await runTick(deps)
  assert.equal(await getState(d1, 'cursor:speech'), '2026-09-28T11:00:00.000Z')
  assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'done' && r.terminal_reason === 'historic-held' && r.historic === 1))
  raw.exec('UPDATE queue SET priority = 999999')
  assert.deepEqual(await claimRids(d1, 90, 2, 'token'), [])
  assert.equal(await hasBackfill(d1), false)
  assert.deepEqual(await unwrittenRows(d1, 200), [])
  await runTick(deps)
  assert.equal(ai.calls.length, 0)
  assert.deepEqual(kb.calls, [])
})

test('reconcile holds either discovery order and release stays pending at priority zero across retries', async () => {
  for (const discoverFirst of [true, false]) {
    const { d1, raw } = makeD1()
    const kb = catalogKb()
    const deps = { db: d1, kb: slugKb, now: () => 2, historicHold: true }
    if (discoverFirst) await discovery(d1, kb)
    await reconcileHistoric(deps, ['invented-slug'])
    await discovery(d1, kb)
    assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'done' && r.terminal_reason === 'historic-held' && r.priority === 0))
    assert.deepEqual(await reconcileHistoric(deps, ['invented-slug']), { verified: 1, inserted: 0, reconciled: 0 })
    assert.deepEqual(await releaseHistoric(deps, ['invented-slug']), { verified: 1, released: 2 })
    assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'pending' && r.priority === 0 && r.terminal_reason === null && r.historic_released === 1))
    assert.deepEqual(await releaseHistoric(deps, ['invented-slug']), { verified: 1, released: 0 })
    await discovery(d1, kb)
    await reconcileHistoric(deps, ['invented-slug'])
    assert.equal((await claimRids(d1, 90, 3, 'released')).length, 2)
  }
})

test('pending or saved historic work from an old deployment is held before model use, and explicit release permits it', async () => {
  for (const saved of [false, true]) {
    const kb = catalogKb()
    const ai = new FakeAi(() => JSON.stringify({ summary: GOOD_SUMMARY, topics: ['housing'] }))
    const { deps, d1, raw } = makeDeps({ kb, ai, env: { HISTORIC_HOLD: 'true', WRITE_MODE: 'live' } })
    await enqueue(d1, ['speech_summary', 'speech_topics'].map(task => ({ rid, task: task as 'speech_summary', priority: 100 })), 1)
    if (saved) await finishRows(d1, [
      { rid, task: 'speech_summary', status: 'done', outcome: 'dry', historic: true, result: GOOD_SUMMARY },
      { rid, task: 'speech_topics', status: 'done', outcome: 'dry', historic: true, result: '["housing"]' },
    ], 2)
    await runTick(deps)
    assert.equal(ai.calls.length, 0)
    assert.deepEqual(kb.writes(), [])
    assert.ok(rows(raw, 'SELECT terminal_reason FROM queue').every(row => row.terminal_reason === 'historic-held'))
    await releaseHistoric({ db: d1, kb: slugKb, now: () => 3 }, ['invented-slug'])
    await runTick(deps)
    assert.equal(ai.calls.length, 1)
    assert.ok(rows(raw, 'SELECT status,outcome FROM queue').every(row => row.status === 'done' && row.outcome === 'written'))
  }
})

test('hold cancels unfinished claims and saved writes while leaving completed pilot and terminal rows intact', async () => {
  for (const state of ['pending', 'claimed', 'dry', 'unwritten', 'written', 'empty', 'skipped-existing', 'no-text', 'missing', 'quarantined', 'skipped-short', 'rejected-names']) {
    const { d1, raw } = makeD1()
    await enqueue(d1, [{ rid, task: 'speech_summary', priority: 100 }], 1)
    if (state === 'pending' || state === 'claimed' || state === 'quarantined') {
      raw.prepare('UPDATE queue SET status=?,claim_token=?,claimed_at=?,attempts=2,neurons=4').run(state, state === 'claimed' ? 'old' : null, state === 'claimed' ? 2 : null)
    } else {
      await finishRows(d1, [{ rid, task: 'speech_summary', status: 'done', outcome: state as 'written', result: 'saved',
        terminalReason: state === 'skipped-short' || state === 'rejected-names' ? state : undefined }], 2)
    }
    const before = { ...rows(raw, "SELECT * FROM queue WHERE task='speech_summary'")[0] }
    await reconcileHistoric({ db: d1, kb: slugKb, now: () => 3, historicHold: true }, ['invented-slug'])
    const unfinished = ['pending', 'claimed', 'dry', 'unwritten'].includes(state)
    if (unfinished) {
      const held = rows(raw, "SELECT * FROM queue WHERE task='speech_summary'")[0]
      assert.equal(held.terminal_reason, 'historic-held')
      assert.equal(held.claim_token, null)
      assert.equal(held.outcome, null)
      assert.equal(held.result, null)
      assert.equal(held.attempts, before.attempts)
      assert.equal(held.neurons, before.neurons)
      // A tick that held a claim before reconciliation cannot overwrite the hold.
      await finishRows(d1, [{ rid, task: 'speech_summary', status: 'pending' }], 4)
      assert.equal(rows(raw, "SELECT terminal_reason FROM queue WHERE task='speech_summary'")[0].terminal_reason, 'historic-held')
    } else {
      await releaseHistoric({ db: d1, kb: slugKb, now: () => 4 }, ['invented-slug'])
      assert.deepEqual({ ...rows(raw, "SELECT * FROM queue WHERE task='speech_summary'")[0] }, before)
    }
    // The original worker's flush also cannot see held results during rollout.
    assert.equal(rows(raw, "SELECT * FROM queue WHERE status='done' AND outcome IN ('dry','unwritten') AND result IS NOT NULL").length, 0)
  }
})

test('discovery uses basic metadata if catalog labels are absent, and retries without advancing on failure', async () => {
  const { d1, raw } = makeD1()
  const kb = catalogKb()
  const catalog = kb.catalog.bind(kb)
  kb.catalog = async (...args) => {
    const page = await catalog(...args)
    return { ...page, rows: page.rows.map(r => ({ rid: r.rid, created: r.created })) }
  }
  kb.getBasic = async () => { throw new Error('injected metadata failure') }
  assert.equal((await discovery(d1, kb)).errors.length, 1)
  assert.equal(await getState(d1, 'cursor:speech'), null)
  assert.equal(rows(raw, 'SELECT COUNT(*) AS n FROM queue')[0].n, 0)
  kb.getBasic = async () => resource
  assert.deepEqual((await discovery(d1, kb)).errors, [])
  assert.ok(rows(raw, 'SELECT terminal_reason FROM queue').every(r => r.terminal_reason === 'historic-held'))
})

test('catalog client preserves source labels and cancelled historic labels remain eligible for live discovery', async () => {
  const client = new Kb({ ARAG_ZONE: 'example', ARAG_KB_ID: 'invented', ARAG_KB_TOKEN: 'invented' }, async () =>
    new Response(JSON.stringify({ resources: { [rid]: { ...resource, created: '2026-09-28T11:00:00Z' } }, fulltext: { next_page: false } })))
  assert.deepEqual((await client.catalog('speech', '2026-09-20T00:00:00Z', 0)).rows[0].usermetadata, resource.usermetadata)
  const { d1, raw } = makeD1()
  const kb = catalogKb()
  kb.resources.get(rid)!.classifications[1].cancelled_by_user = true
  await discovery(d1, kb)
  assert.ok(rows(raw, 'SELECT status,terminal_reason FROM queue').every(r => r.status === 'pending' && r.terminal_reason === null))
})

test('with historic hold false, discovery and reconciliation retain the existing pending behavior', async () => {
  const { d1, raw } = makeD1()
  const kb = catalogKb()
  await discovery(d1, kb, false)
  assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'pending' && r.priority === 100 && r.historic === 0))
  await reconcileHistoric({ db: d1, kb: slugKb, now: () => 2, historicHold: false }, ['invented-slug'])
  assert.ok(rows(raw, 'SELECT * FROM queue').every(r => r.status === 'pending' && r.priority === 0 && r.historic === 1))
  assert.equal((await claimRids(d1, 1, 3, 'existing')).length, 2)
  assert.equal(readConfig({ HISTORIC_HOLD: 'true' }).historicHold, true)
  for (const value of [undefined, 'false', 'TRUE', '1']) assert.equal(readConfig({ HISTORIC_HOLD: value }).historicHold, false)
})

test('status reports the hold switch and held row count; switching off does not implicitly release rows', async () => {
  const { d1 } = makeD1()
  await reconcileHistoric({ db: d1, kb: slugKb, now: () => 1, historicHold: true }, ['invented-slug'])
  for (const enabled of [true, false]) {
    await reconcileHistoric({ db: d1, kb: slugKb, now: () => 2, historicHold: enabled }, ['invented-slug'])
    const status = await buildStatus(d1, readConfig({ HISTORIC_HOLD: String(enabled) }), 3)
    assert.equal(status.historicHold, enabled)
    assert.equal(status.heldRows, 2)
    assert.equal(status.readyToWrite, 0)
  }
  await releaseHistoric({ db: d1, kb: slugKb, now: () => 4 }, ['invented-slug'])
  assert.equal((await buildStatus(d1, readConfig({ HISTORIC_HOLD: 'true' }), 5)).heldRows, 0)
})

test('release verifies every historic slug before mutation', async () => {
  const { d1, raw } = makeD1()
  await reconcileHistoric({ db: d1, kb: slugKb, now: () => 1, historicHold: true }, ['invented-slug'])
  const before = rows(raw, 'SELECT * FROM queue')
  let n = 0
  await assert.rejects(releaseHistoric({ db: d1, kb: { getBySlug: async () => n++ ? null : resource }, now: () => 2 }, ['invented-one', 'invented-two']))
  assert.deepEqual(rows(raw, 'SELECT * FROM queue'), before)
})

test('release route shares admin auth and batch limits, and only releases held rows', async () => {
  const { d1, raw } = makeD1()
  const env = { DB: d1, HISTORIC_HOLD: 'true', ENRICH_ADMIN_TOKEN: 'invented-test-secret', ARAG_ZONE: 'example', ARAG_KB_ID: 'invented-kb', ARAG_KB_TOKEN: 'invented-token' } as Env
  const request = (route: string, body: unknown, authorization = 'Bearer invented-test-secret') => new Request(`https://example.invalid${route}`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  assert.equal((await worker.fetch(request('/backfill/release', { slugs: ['invented-slug'] }, 'Bearer wrong'), env)).status, 401)
  for (const body of [{}, { slugs: [] }, { slugs: ['unsafe/slug'] }, { slugs: Array(201).fill('invented-slug') }]) {
    assert.equal((await worker.fetch(request('/backfill/release', body), env)).status, 400)
  }
  const savedFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async input => { calls.push(new URL(String(input)).pathname); return new Response(JSON.stringify(resource)) }
  try {
    assert.equal((await worker.fetch(request('/backfill/reconcile', { slugs: ['invented-slug'] }), env)).status, 200)
    assert.ok(rows(raw, 'SELECT terminal_reason FROM queue').every(r => r.terminal_reason === 'historic-held'))
    const response = await worker.fetch(request('/backfill/release', { slugs: Array(200).fill('invented-slug') }), env)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { verified: 1, released: 2 })
    assert.deepEqual(calls, Array(2).fill('/api/v1/kb/invented-kb/slug/invented-slug'))
    assert.ok(rows(raw, 'SELECT status,priority FROM queue').every(r => r.status === 'pending' && r.priority === 0))
  } finally { globalThis.fetch = savedFetch }
})

test('historic hold migration is additive, preserves pilot rows and index roots, and the old worker still runs', () => {
  const raw = new DatabaseSync(':memory:')
  for (const file of ['0001_init.sql', '0002_historic_rules.sql']) raw.exec(readFileSync(resolve(import.meta.dirname, '../migrations', file), 'utf8'))
  raw.exec("INSERT INTO queue(rid,task,status,outcome,result,priority,created_at,updated_at,done_at) VALUES('pilot','speech_summary','done','written','saved',7,1,2,2)")
  const before = rows(raw, 'SELECT * FROM queue')
  const roots = rows(raw, "SELECT name,rootpage FROM sqlite_master WHERE name='queue' OR name LIKE 'queue_%'")
  const migration = readFileSync(resolve(import.meta.dirname, '../migrations/0003_historic_hold.sql'), 'utf8')
  assert.equal(migration.split('\n').filter(line => line.trim() && !line.startsWith('--')).join('\n'), 'ALTER TABLE queue ADD COLUMN historic_released INTEGER NOT NULL DEFAULT 0;')
  raw.exec(migration)
  assert.deepEqual(rows(raw, 'SELECT * FROM queue').map(({ historic_released, ...row }) => { assert.equal(historic_released, 0); return row }), before.map(row => ({ ...row })))
  assert.deepEqual(rows(raw, "SELECT name,rootpage FROM sqlite_master WHERE name='queue' OR name LIKE 'queue_%'"), roots)
  raw.exec("INSERT OR IGNORE INTO queue(rid,task,status,priority,source_created,created_at,updated_at) VALUES('old-worker','speech_summary','pending',100,1,1,1)")
  raw.exec("INSERT INTO queue(rid,task,status,terminal_reason,priority,created_at,updated_at) VALUES('held','speech_summary','done','historic-held',999999,1,1)")
  assert.deepEqual(rows(raw, "SELECT rid FROM queue WHERE status='pending' ORDER BY priority DESC,source_created DESC,created_at LIMIT 2").map(row => ({ ...row })), [{ rid: 'old-worker' }])
  raw.exec("UPDATE queue SET status='claimed',claim_token='old',claimed_at=2,updated_at=2 WHERE status='pending' AND rid='old-worker'")
  raw.exec("UPDATE queue SET status='done',outcome='written',result='saved',model='model',neurons=neurons+4.5,claim_token=NULL,claimed_at=NULL,updated_at=3,done_at=3 WHERE rid='old-worker' AND task='speech_summary'")
  assert.equal(rows(raw, "SELECT outcome FROM queue WHERE rid='old-worker'")[0].outcome, 'written')
  assert.equal(rows(raw, "SELECT terminal_reason FROM queue WHERE rid='held'")[0].terminal_reason, 'historic-held')
  raw.close()
})

test('T1 preflight refuses false, absent, malformed and unavailable hold status', async () => {
  const endpoint = 'https://example.invalid'
  const token = 'invented-test-secret'
  for (const status of [{ historicHold: false }, {}, null, { historicHold: 'true' }]) {
    await assert.rejects(checkHistoricHold(endpoint, token, async () => new Response(JSON.stringify(status))))
  }
  await assert.rejects(checkHistoricHold(endpoint, token, async () => new Response('unavailable', { status: 503 })))
  await assert.rejects(checkHistoricHold(endpoint, token, async () => new Response('invalid JSON')))
  await checkHistoricHold(endpoint, token, async (input, init) => {
    assert.equal(String(input), `${endpoint}/status`)
    assert.deepEqual(init?.headers, { authorization: `Bearer ${token}` })
    return new Response(JSON.stringify({ historicHold: true, heldRows: 2 }))
  })
})
