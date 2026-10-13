import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countedDb, discover, windowKey, type DiscoveryOptions } from '../src/discover.ts'
import { enqueue, getState, setState } from '../src/db.ts'
import { Kb, KbBackpressure, type CatalogPage } from '../src/kb.ts'
import { USD_PER_NEURON, admissionBudget } from '../src/run-budget.ts'
import { readConfig } from '../src/env.ts'
import { FakeAi, FakeKb, GOOD_SUMMARY, makeDeps, makeD1, rows, speechText } from './helpers.ts'
import { runTick } from '../src/tick.ts'

const START = Date.parse('2026-10-13T00:00:00Z')
const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()
const run_id = '9a73f94cb0d54b9bbdd45dec8b1368d6'
const options = (db: D1Database, kb: FakeKb, extra: Partial<DiscoveryOptions> = {}): DiscoveryOptions => ({
  db, kb, now: START + HOUR, startIso: iso(START), maxPages: 6, overlapS: 120, ...extra,
})
function speech(kb: FakeKb, rid: string, created: number | string, bounded = false) {
  kb.add(rid, { texts: { body: speechText() }, ...(bounded ? {
    classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'openaustralia' }],
    extraMetadata: { enrichment_budget: { run_id, max_usd: 40 } },
  } : {}) })
  kb.catalogRows.push({ rid, kind: 'speech', created: typeof created === 'number' ? iso(created) : created })
}
const checkpoint = async (db: D1Database) => JSON.parse((await getState(db, windowKey('speech'))) ?? 'null')

test('the KB client sends documented created.since/until on a bounded catalog request', async () => {
  let body: any
  const kb = new Kb({ ARAG_ZONE: 'fixture', ARAG_KB_ID: 'fixture', ARAG_KB_TOKEN: 'fixture' }, async (_input, init) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ resources: {}, fulltext: { next_page: false } }))
  })
  await kb.catalog('speech', iso(START), 2, 50, iso(START + HOUR), 123)
  assert.deepEqual(body.filter_expression.resource.and, [
    { prop: 'label', labelset: 'kind', label: 'speech' },
    { prop: 'created', since: iso(START), until: iso(START + HOUR) },
  ])
  assert.equal(body.page_number, 2)
  assert.equal(body.page_size, 50)
  assert.deepEqual(body.sort, { field: 'created', order: 'asc' })
})

test('an unbounded catalog times out; discovery shrinks bounded windows and queues every row', async () => {
  class SlowKb extends FakeKb {
    async catalog(kind: string, since: string, page: number, size = 50, until?: string): Promise<CatalogPage> {
      if (!until || Date.parse(until) - Date.parse(since) > HOUR / 8) {
        this.catalogCalls.push({ kind, since, page, pageSize: size, until })
        throw new KbBackpressure('POST /catalog -> timeout', 0)
      }
      return super.catalog(kind, since, page, size, until)
    }
  }
  const { d1, raw } = makeD1(), kb = new SlowKb()
  speech(kb, 'a', START + 1000); speech(kb, 'b', START + HOUR / 2)
  await assert.rejects(kb.catalog('speech', iso(START), 0), /timeout/)
  kb.catalogCalls = []
  for (let i = 0; i < 12 && await getState(d1, 'cursor:speech') !== iso(START + HOUR); i++) {
    const out = await discover(options(d1, kb))
    assert.deepEqual(out.errors, [])
  }
  assert.equal(await getState(d1, 'cursor:speech'), iso(START + HOUR))
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 4)
  assert.ok(kb.catalogCalls.every(c => c.until))
  assert.deepEqual(kb.writes(), [])
})

test('shrinking survives a page cap or exhausted clock instead of repeating the same timeout next tick', async () => {
  const { d1 } = makeD1(), kb = new FakeKb()
  const original = kb.catalog.bind(kb)
  let time = 0
  kb.catalog = async (...args: Parameters<FakeKb['catalog']>) => {
    await original(...args)
    time += 5000
    throw new KbBackpressure('operation aborted due to timeout', 0)
  }
  const first = await discover(options(d1, kb, { maxPages: 1, maxMs: 5000, clock: () => time }))
  assert.deepEqual(first.errors, [])
  assert.equal((await checkpoint(d1)).untilMs, START + HOUR / 2)
  time = 0
  await discover(options(d1, kb, { maxPages: 1, maxMs: 5000, clock: () => time }))
  assert.equal((await checkpoint(d1)).untilMs, START + HOUR / 4)
  assert.equal(kb.catalogCalls.filter(c => c.kind === 'speech')[1].until, iso(START + HOUR / 2))
  assert.equal(await getState(d1, 'cursor:speech'), null)
})

test('page and time budgets count discarded slow or oversized catalog attempts', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (let i = 0; i < 20; i++) speech(kb, `r${i}`, START + HOUR / 2 + i * 1000)
  const out = await discover(options(d1, kb, { maxPages: 1, pageSize: 2 }))
  assert.equal(kb.catalogCalls.filter(c => c.kind === 'speech').length, 1)
  assert.ok(out.partial.includes('speech'))
  assert.equal((await checkpoint(d1)).untilMs, START + HOUR / 2)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 0)
  let time = 0
  const catalog = kb.catalog.bind(kb)
  kb.catalog = async (...args: Parameters<FakeKb['catalog']>) => {
    time += 2000
    return catalog(...args)
  }
  await discover(options(d1, kb, { maxPages: 6, maxMs: 1000, clock: () => time }))
  assert.equal((await checkpoint(d1)).untilMs, START + HOUR / 4)
})

test('empty windows advance the cursor to their end and partial ticks resume without overlap', async () => {
  const { d1 } = makeD1(), kb = new FakeKb()
  for (let i = 1; i <= 3; i++) {
    const out = await discover(options(d1, kb, { now: START + 3 * HOUR, maxPages: 1 }))
    assert.deepEqual(out.errors, [])
    assert.equal(await getState(d1, 'cursor:speech'), iso(START + i * HOUR))
    assert.equal(await getState(d1, 'partial:speech'), i === 3 ? '0' : '1')
    const call = kb.catalogCalls.filter(c => c.kind === 'speech').at(-1)!
    assert.equal(Date.parse(call.since), START + (i - 1) * HOUR)
  }
})

test('inclusive edges and sub-millisecond timestamps cause no lost or duplicate queue rows', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (const [i, created] of [iso(START), iso(START + HOUR - 1), iso(START + HOUR),
    '2026-10-13T01:00:00.000001', '2026-10-13T01:00:00.999999', iso(START + 2 * HOUR)].entries())
    speech(kb, `r${i}`, created)
  const opts = options(d1, kb, { now: START + 2 * HOUR, maxPages: 1 })
  for (let i = 0; i < 4; i++) assert.deepEqual((await discover(opts)).errors, [])
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 12)
  assert.equal(rows(raw, 'SELECT COUNT(DISTINCT rid) n FROM queue')[0].n, 6)
  assert.equal(await getState(d1, 'cursor:speech'), iso(START + 2 * HOUR))
})

test('more timestamp ties than a page resume at durable page offsets across ticks', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (let i = 0; i < 10; i++) speech(kb, `r${i}`, '2026-10-13T00:00:01.123456')
  const opts = options(d1, kb, { maxPages: 1, pageSize: 2, minWindowMs: HOUR })
  for (let i = 0; i < 5; i++) {
    const out = await discover(opts)
    assert.deepEqual(out.errors, [])
    assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, (i + 1) * 4)
    assert.equal(await getState(d1, 'cursor:speech'), i === 4 ? iso(START + HOUR) : null)
  }
  assert.deepEqual(kb.catalogCalls.filter(c => c.kind === 'speech').map(c => c.page), [0, 1, 2, 3, 4])
})

test('complete discovery re-reads overlap for late visibility and keeps cursor monotonic', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  await discover(options(d1, kb))
  speech(kb, 'late', START + HOUR - 60_000)
  const out = await discover(options(d1, kb))
  assert.equal(out.enqueued.speech, 2)
  assert.equal(kb.catalogCalls.filter(c => c.kind === 'speech').at(-1)!.since, '2026-10-13T00:58:00Z')
  assert.equal(await getState(d1, 'cursor:speech'), iso(START + HOUR))
  await discover(options(d1, kb))
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 2)
})

test('metadata time budget queues completed chunks and resumes inside a page', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (let i = 0; i < 12; i++) speech(kb, `r${i}`, START + 1000)
  const basic = kb.getBasic.bind(kb)
  let time = 0
  kb.getBasic = async (rid: string) => { time += 30; return basic(rid) }
  const opts = options(d1, kb, { maxMs: 100, clock: () => time })
  const first = await discover(opts)
  assert.deepEqual(first.errors, [])
  assert.equal(first.requests.basic, 4)
  assert.equal((await checkpoint(d1)).offset, 4)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 8)
  for (let i = 0; i < 2; i++) { time = 0; await discover(opts) }
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 24)
  assert.equal(await getState(d1, 'cursor:speech'), iso(START + HOUR))
})

test('subrequest budget counts getBasic, getResource and D1 and stops before the limit', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (let i = 0; i < 20; i++) speech(kb, `r${i}`, START + 1000, true)
  const opts = options(d1, kb, { maxSubrequests: 50 })
  const first = await discover(opts)
  assert.deepEqual(first.errors, [])
  assert.ok(Object.values(first.requests).reduce((a, b) => a + b, 0) <= 50)
  assert.equal(first.requests.basic, kb.calls.filter(c => c.startsWith('GET basic')).length)
  assert.equal(first.requests.resource, kb.calls.filter(c => c.startsWith('GET full')).length)
  assert.equal(first.requests.catalog, kb.catalogCalls.length)
  assert.ok(first.partial.includes('speech'))
  assert.ok(rows(raw, 'SELECT COUNT(*) n FROM enrichment_units')[0].n < 20)
  for (let i = 0; i < 25 && await getState(d1, 'cursor:speech') !== iso(START + HOUR); i++) await discover(opts)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM enrichment_units')[0].n, 20)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 40)
})

test('queue failures checkpoint only previous queued chunks and replay safely', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (let i = 0; i < 8; i++) speech(kb, `r${i}`, START + 1000)
  let inserts = 0
  const failing = { ...d1, prepare(sql: string) {
    if (sql.startsWith('INSERT OR IGNORE INTO queue') && ++inserts === 2) throw new Error('fixture D1 down')
    return d1.prepare(sql)
  } } as D1Database
  const first = await discover(options(failing, kb))
  assert.match(first.errors[0], /fixture D1 down/)
  assert.equal((await checkpoint(d1)).offset, 4)
  assert.equal(await getState(d1, 'cursor:speech'), null)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 8)
  assert.deepEqual((await discover(options(d1, kb))).errors, [])
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 16)
})

test('federal windows retain US$40 ownership, exact reservations and waiting admission', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  speech(kb, 'federal-a', START + 1000, true)
  speech(kb, 'federal-b', START + HOUR, true)
  const out = await discover(options(d1, kb, { now: START + 2 * HOUR, historicHold: true }))
  assert.deepEqual(out.errors, [])
  const units = rows(raw, 'SELECT * FROM enrichment_units')
  assert.equal(units.length, 2)
  assert.ok(units.every(u => u.run_id === run_id && u.admitted === 1))
  const run = rows(raw, 'SELECT * FROM enrichment_runs')[0]
  assert.equal(run.cap_neurons, Math.floor(40 / USD_PER_NEURON))
  assert.equal(run.reserved_neurons, units.reduce((n, u) => n + u.initial_neurons, 0))
  assert.equal(run.spent_neurons, 0)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM enrichment_calls')[0].n, 0)
  assert.equal(units[0].initial_neurons, admissionBudget((await kb.getResource('federal-a'))!, 'federal-a', readConfig({}))!.initial_neurons)
  await discover(options(d1, kb, { now: START + 2 * HOUR }))
  assert.deepEqual(rows(raw, 'SELECT * FROM enrichment_runs')[0], run)
  // Exhaust the test ledger locally; new resources remain owned and waiting.
  raw.prepare('UPDATE enrichment_runs SET spent_neurons=cap_neurons-reserved_neurons').run()
  speech(kb, 'waiting', START + 2 * HOUR + 1000, true)
  assert.deepEqual((await discover(options(d1, kb, { now: START + 3 * HOUR }))).errors, [])
  assert.equal(rows(raw, "SELECT admitted FROM enrichment_units WHERE rid='waiting'")[0].admitted, 0)
  assert.equal(rows(raw, "SELECT COUNT(*) n FROM queue WHERE rid='waiting'")[0].n, 0)
})

test('a conflicting budget still fails discovery; no cursor or uncapped queue bypass', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  speech(kb, 'a', START + 1000, true)
  await discover(options(d1, kb))
  kb.resources.get('a')!.extraMetadata!.enrichment_budget = { run_id: 'different-run', max_usd: 40 }
  // Re-read the resource in the normal overlap.
  await setState(d1, 'cursor:speech', iso(START + 1000), START)
  const first = await discover(options(d1, kb))
  assert.match(first.errors[0], /budget changed after ownership/)
  assert.equal(await getState(d1, 'cursor:speech'), iso(START + 1000))
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM enrichment_runs')[0].n, 1)
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 2)
})

test('a catalog body timeout is backpressure too, so discovery can shrink and retry', async () => {
  const kb = new Kb({ ARAG_ZONE: 'fixture', ARAG_KB_ID: 'fixture', ARAG_KB_TOKEN: 'fixture' }, async () =>
    new Response(new ReadableStream({ start(controller) { controller.error(new Error('operation aborted due to timeout')) } })))
  await assert.rejects(kb.catalog('speech', iso(START), 0, 50, iso(START + HOUR)),
    (err: unknown) => err instanceof KbBackpressure && err.status === 0 && /timeout/.test(err.message))
})

test('a checkpoint failure after funded enqueue replays without duplicate run credits', async () => {
  const { d1, raw } = makeD1(), kb = new FakeKb()
  for (let i = 0; i < 4; i++) speech(kb, `r${i}`, START + 1000, true)
  const failing = { ...d1, async batch(statements: D1PreparedStatement[]) {
    if (rows(raw, 'SELECT COUNT(*) n FROM enrichment_units')[0].n === 4
        && rows(raw, 'SELECT COUNT(*) n FROM state WHERE key=?', windowKey('speech'))[0].n) {
      // Only the discovery checkpoint follows the fourth unit's completed admit.
      throw new Error('fixture checkpoint down')
    }
    return d1.batch(statements)
  } } as D1Database
  const first = await discover(options(failing, kb))
  assert.match(first.errors[0], /checkpoint down/)
  const run = rows(raw, 'SELECT * FROM enrichment_runs')[0]
  assert.equal((await checkpoint(d1)).offset, 0)
  assert.equal(await getState(d1, 'cursor:speech'), null)
  const retry = await discover(options(d1, kb))
  assert.deepEqual(retry.errors, [])
  assert.equal(rows(raw, 'SELECT COUNT(*) n FROM queue')[0].n, 8)
  assert.deepEqual(rows(raw, 'SELECT * FROM enrichment_runs')[0], run)
})

test('429 catalog backpressure retains the window and never advances the cursor', async () => {
  const { d1 } = makeD1(), kb = new FakeKb()
  kb.catalog = async () => { throw new KbBackpressure('POST /catalog -> 429', 429) }
  const out = await discover(options(d1, kb))
  assert.ok(out.errors.some(e => e.includes('429')))
  assert.equal((await checkpoint(d1)).untilMs, START + HOUR)
  assert.equal(await getState(d1, 'cursor:speech'), null)
  assert.equal(await getState(d1, 'partial:speech'), '1')
})

test('a tick subtracts processing queries before discovery and leaves cleanup headroom', async () => {
  const kb = new FakeKb(), ai = new FakeAi(() => JSON.stringify({ summary: GOOD_SUMMARY, topics: ['housing'] }))
  const fixture = makeDeps({ kb, ai, env: { BATCH_SIZE: '60', DISCOVERY_START: iso(START) }, now: () => START + HOUR })
  for (let i = 0; i < 300; i++) {
    const rid = `r${i}`
    kb.add(rid, { texts: { body: speechText() }, extraMetadata: { enrichment_budget: { run_id, max_usd: 40 } } })
    if (i < 60) await enqueue(fixture.d1, ['speech_summary', 'speech_topics'].map(task => ({
      rid, task: task as 'speech_summary' | 'speech_topics', priority: 100,
      runBudget: { run_id, max_usd: 40, initial_neurons: 500 },
    })), 1)
    else kb.catalogRows.push({ rid, kind: 'speech', created: iso(START + (i - 60) * 10_000) })
  }
  let queries = 0
  const stats = await runTick({ ...fixture.deps, db: countedDb(fixture.d1, n => { queries += n }) })
  assert.equal(stats.rids, 60)
  assert.deepEqual(stats.discoveryErrors, [])
  assert.ok(stats.discoveryRequests.basic > 0, 'discovery still makes progress')
  assert.ok(stats.discoveryRequests.basic < 20, 'processing reduced the admission allowance')
  assert.ok(stats.discoveryPartial.includes('speech'))
  assert.ok(queries < 1000, 'entire tick including cleanup remains below the query limit')
})
