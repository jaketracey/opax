import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claimRids, enqueue, finishRows, getState, holdHistoricStatements, setState, type NewWork } from '../src/db.ts'
import { discover, windowKey } from '../src/discover.ts'
import { USD_PER_NEURON } from '../src/run-budget.ts'
import { FakeKb, makeD1, rows, speechText } from './helpers.ts'

const START = Date.parse('2026-10-13T00:11:34Z')
const iso = (ms: number) => new Date(ms).toISOString()
const run_id = '9a73f94cb0d54b9bbdd45dec8b1368d6'
const tasks = (rid: string, historicHold = false): NewWork[] => ['speech_summary', 'speech_topics'].map(task => ({
  rid, task: task as 'speech_summary' | 'speech_topics', priority: 100, historicHold,
}))

test('the fake rejects 51 compound terms and 101 bound parameters', async () => {
  const { d1 } = makeD1({ maxCompoundTerms: 50, maxParameters: 100 })
  assert.equal((await d1.prepare(Array.from({ length: 50 }, () => 'SELECT 1 n').join(' UNION ALL ')).all()).results.length, 50)
  await assert.rejects(d1.prepare(Array.from({ length: 51 }, () => 'SELECT 1 n').join(' UNION ALL ')).all(), /too many terms in compound SELECT/)
  assert.equal((await d1.prepare(`SELECT ${Array(100).fill('?').join(',')}`).bind(...Array(100).fill(1)).all()).results.length, 1)
  await assert.rejects(d1.prepare(`SELECT ${Array(101).fill('?').join(',')}`).bind(...Array(101).fill(1)).all(), /too many SQL variables/)
})

test('the old four-speech enqueue reproduces the live eight-term error at the real five-term limit', async () => {
  const { d1 } = makeD1()
  const params = tasks('a').concat(tasks('b'), tasks('c'), tasks('d')).flatMap(w => [
    w.rid, w.task, 'pending', 100, null, 0, null, 1, 1, w.rid,
  ])
  const sql = 'INSERT OR IGNORE INTO queue(rid,task,status,priority,source_created,historic,terminal_reason,created_at,updated_at) '
    + Array(8).fill('SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM enrichment_units WHERE rid=?)').join(' UNION ALL ')
  await assert.rejects(d1.prepare(sql).bind(...params).run(), /too many terms in compound SELECT/)
  assert.equal(await enqueue(d1, tasks('a').concat(tasks('b'), tasks('c'), tasks('d')), 1), 8)
})

test('bulk enqueue, dedup, holds, claiming and finishing 513 resources stay inside both limits', async () => {
  const db = makeD1()
  const ids = Array.from({ length: 513 }, (_, i) => `fixture-${i}`)
  const work = ids.flatMap(rid => tasks(rid))
  assert.equal(await enqueue(db.d1, work, 1), 1026)
  assert.equal(await enqueue(db.d1, work, 2), 0)
  const claimed = await claimRids(db.d1, 513, 3, 'fixture-token')
  assert.equal(claimed.length, 1026)
  await finishRows(db.d1, claimed.map(row => ({ rid: row.rid, task: row.task, status: 'done' as const, outcome: 'dry' as const })), 4)
  const heldIds = ids.map(id => `held-${id}`)
  assert.equal(await enqueue(db.d1, heldIds.flatMap(rid => tasks(rid, true)), 5), 1026)
  await db.d1.batch(holdHistoricStatements(db.d1, ids, 6))
  assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM queue')[0].n, 2052)
  assert.equal(rows(db.raw, "SELECT COUNT(*) n FROM queue WHERE terminal_reason='historic-held'")[0].n, 2052)
  assert.ok(db.statements.every(s => s.parameters <= 100 && s.compoundTerms <= 5))
  assert.ok(db.statements.filter(s => s.sql.startsWith('INSERT OR IGNORE INTO queue')).every(s => s.compoundTerms === 1 && s.parameters <= 10))
  assert.ok(db.batches.every(n => n <= 50))
  assert.equal(Math.max(...db.statements.map(s => s.parameters)), 53)
})

for (const limit of [50, 5]) {
  test(`1,027 rows within two seconds resume exactly under ${limit}-term/100-parameter D1 limits`, async () => {
    const db = makeD1({ maxCompoundTerms: limit, maxParameters: 100 }), kb = new FakeKb()
    let bounded = 0
    for (let i = 0; i < 1027; i++) {
      const rid = `dense-${i}`
      const kind = i % 3
      if (kind === 2) bounded++
      const created = i < 1024 ? '2026-10-13T00:11:34.123456' : i === 1024
        ? '2026-10-13T00:11:34.999999' : i === 1025 ? '2026-10-13T00:11:35.000000' : '2026-10-13T00:11:35.000001'
      kb.add(rid, { texts: { body: speechText() }, classifications: [
        { labelset: 'kind', label: 'speech' },
        { labelset: 'source', label: kind === 1 ? 'hansard_hist' : kind === 2 ? 'openaustralia' : 'vic_hansard' },
      ], ...(kind === 2 ? { extraMetadata: { enrichment_budget: { run_id, max_usd: 40 } } } : {}) })
      kb.catalogRows.push({ rid, kind: 'speech', created })
    }
    await setState(db.d1, 'cursor:speech', iso(START), START)
    await setState(db.d1, 'partial:speech', '1', START)
    const opts = { db: db.d1, kb, now: START + 2000, startIso: iso(START), maxPages: 2, overlapS: 120,
      historicHold: true, pageSize: 200, maxMs: 20_000, clock: () => 0 }
    let complete = false, ticksWithRows = 0, previous = 0
    for (let tick = 0; tick < 40; tick++) {
      const out = await discover(opts)
      assert.deepEqual(out.errors, [])
      assert.ok(Object.values(out.requests).reduce((a, b) => a + b, 0) <= 800)
      const count = rows(db.raw, 'SELECT COUNT(*) n FROM queue')[0].n
      assert.ok(count >= previous)
      if (count > previous) ticksWithRows++
      previous = count
      const cursor = await getState(db.d1, 'cursor:speech')
      const firstWindowRows = rows(db.raw, 'SELECT COUNT(*) n FROM queue WHERE source_created < ?', START + 1000)[0].n
      if (firstWindowRows < 2050) assert.equal(cursor, iso(START), 'unfinished first window cannot move the cursor')
      if (!out.partial.includes('speech')) {
        assert.equal(cursor, iso(START + 2000))
        assert.equal(await getState(db.d1, 'partial:speech'), '0')
        assert.equal(await getState(db.d1, windowKey('speech')), 'null')
        complete = true
        break
      }
    }
    assert.ok(complete, 'dense timestamp ties eventually finish across bounded ticks')
    assert.ok(ticksWithRows > 1, 'progress is durable across multiple ticks')
    assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM queue')[0].n, 2054)
    assert.equal(rows(db.raw, 'SELECT COUNT(DISTINCT rid) n FROM queue')[0].n, 1027)
    assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM enrichment_units')[0].n, bounded)
    const run = rows(db.raw, 'SELECT * FROM enrichment_runs')[0]
    assert.equal(run.run_id, run_id)
    assert.equal(run.cap_neurons, Math.floor(40 / USD_PER_NEURON))
    assert.equal(run.reserved_neurons, rows(db.raw, 'SELECT SUM(credit_neurons) n FROM enrichment_units')[0].n)
    assert.ok(run.reserved_neurons <= run.cap_neurons)
    assert.equal(run.spent_neurons, 0)
    assert.ok(db.statements.every(s => s.parameters <= 100 && s.compoundTerms <= limit))
    assert.ok(db.batches.every(n => n <= 50))
    // Complete-window overlap re-reads edges without duplicate queue tasks or credits.
    assert.deepEqual((await discover({ ...opts, maxPages: 40 })).errors, [])
    assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM queue')[0].n, 2054)
    assert.equal(rows(db.raw, 'SELECT reserved_neurons FROM enrichment_runs')[0].reserved_neurons, run.reserved_neurons)
    assert.deepEqual(kb.writes(), [])
  })
}

test('513 exhausted federal resources retain run ownership without uncapped queue admission', async () => {
  const db = makeD1(), kb = new FakeKb(), cap = Math.floor(40 / USD_PER_NEURON)
  db.raw.prepare('INSERT INTO enrichment_runs(run_id,cap_neurons,spent_neurons) VALUES (?,?,?)').run(run_id, cap, cap)
  for (let i = 0; i < 513; i++) {
    const rid = `waiting-${i}`
    kb.add(rid, { texts: { body: speechText() }, classifications: [
      { labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'openaustralia' },
    ], extraMetadata: { enrichment_budget: { run_id, max_usd: 40 } } })
    kb.catalogRows.push({ rid, kind: 'speech', created: '2026-10-13T00:11:34.123456' })
  }
  const opts = { db: db.d1, kb, now: START + 1000, startIso: iso(START), maxPages: 2, overlapS: 120, pageSize: 200 }
  for (let i = 0; i < 20 && await getState(db.d1, 'cursor:speech') !== iso(START + 1000); i++) {
    const out = await discover(opts)
    assert.deepEqual(out.errors, [])
    assert.equal(out.enqueued.speech, 0)
  }
  assert.equal(await getState(db.d1, 'cursor:speech'), iso(START + 1000))
  assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM enrichment_units WHERE run_id=? AND admitted=0', run_id)[0].n, 513)
  assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM queue')[0].n, 0)
  const run = rows(db.raw, 'SELECT spent_neurons,reserved_neurons FROM enrichment_runs')[0]
  assert.equal(run.spent_neurons, cap)
  assert.equal(run.reserved_neurons, 0)
  assert.equal(rows(db.raw, 'SELECT COUNT(*) n FROM enrichment_calls')[0].n, 0)
})
