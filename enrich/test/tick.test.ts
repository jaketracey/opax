import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claimRids, enqueue, finishRows, getState, reclaimStale, releaseClaims, STALE_CLAIM_MS } from '../src/db.ts'
import { runTick } from '../src/tick.ts'
import { FakeAi, FakeKb, GOOD_SUMMARY, KbBackpressure, makeD1, makeDeps, rows, speechText } from './helpers.ts'

const both = JSON.stringify({ summary: GOOD_SUMMARY, topics: ['housing', 'welfare-social'] })

function seed(kb: FakeKb, rid = 'r1', extra: Record<string, string> = {}) {
  kb.add(rid, { texts: { body: speechText(), ...extra } })
}

async function queueBoth(d1: D1Database, rid = 'r1', priority = 100) {
  await enqueue(
    d1,
    [
      { rid, task: 'speech_summary', priority },
      { rid, task: 'speech_topics', priority },
    ],
    1000,
  )
}

// ---------------------------------------------------------------- the queue

test('the queue de-duplicates on (rid, task) and reports only new rows', async () => {
  const { d1, raw } = makeD1()
  assert.equal(await enqueue(d1, [{ rid: 'a', task: 'speech_summary', priority: 100 }, { rid: 'a', task: 'speech_topics', priority: 100 }], 1), 2)
  assert.equal(await enqueue(d1, [{ rid: 'a', task: 'speech_summary', priority: 100 }, { rid: 'b', task: 'speech_summary', priority: 0 }], 2), 1)
  assert.equal(rows(raw, 'SELECT COUNT(*) AS n FROM queue')[0].n, 3)
})

test('claim order: priority first, then newest in the box; a rid is claimed with all its rows', async () => {
  const { d1 } = makeD1()
  await enqueue(d1, [
    { rid: 'backfill', task: 'speech_summary', priority: 0, sourceCreated: 5000 },
    { rid: 'old', task: 'speech_summary', priority: 100, sourceCreated: 1000 },
    { rid: 'old', task: 'speech_topics', priority: 100, sourceCreated: 1000 },
    { rid: 'new', task: 'speech_summary', priority: 100, sourceCreated: 3000 },
  ], 1)
  const claimed = await claimRids(d1, 2, 10, 'tok')
  assert.deepEqual([...new Set(claimed.map((r) => r.rid))].sort(), ['new', 'old'])
  assert.equal(claimed.filter((r) => r.rid === 'old').length, 2)
  const next = await claimRids(d1, 5, 11, 'tok2')
  assert.deepEqual(next.map((r) => r.rid), ['backfill'])
})

test('two overlapping ticks never claim the same row', async () => {
  const { d1 } = makeD1()
  await enqueue(d1, Array.from({ length: 10 }, (_, i) => ({ rid: `r${i}`, task: 'speech_summary' as const, priority: 100 })), 1)
  const [a, b] = await Promise.all([claimRids(d1, 6, 10, 'A'), claimRids(d1, 6, 10, 'B')])
  const seen = new Set([...a, ...b].map((r) => r.rid))
  assert.equal(seen.size, a.length + b.length)
})

test('stale claims (older than 10 minutes) are reclaimable; fresh ones are not', async () => {
  const { d1, raw } = makeD1()
  await enqueue(d1, [{ rid: 'a', task: 'speech_summary', priority: 100 }, { rid: 'b', task: 'speech_summary', priority: 100 }], 1)
  await claimRids(d1, 1, 1_000, 'old')
  await claimRids(d1, 1, 2_000_000, 'fresh')
  assert.equal(await reclaimStale(d1, 1_000 + STALE_CLAIM_MS + 1), 1)
  const states = Object.fromEntries(rows(raw, 'SELECT rid, status FROM queue').map((r) => [r.rid, r.status]))
  assert.equal(Object.values(states).filter((s) => s === 'pending').length, 1)
  assert.equal(await releaseClaims(d1, 'fresh', 3_000_000), 1)
})

test('finishRows accumulates neurons and attempts across updates and clears the claim', async () => {
  const { d1, raw } = makeD1()
  await enqueue(d1, [{ rid: 'a', task: 'speech_summary', priority: 0 }], 1)
  await claimRids(d1, 1, 2, 'tok')
  await finishRows(d1, [{ rid: 'a', task: 'speech_summary', status: 'pending', lastError: 'x', addNeurons: 1.5, addAttempts: 1 }], 3)
  await claimRids(d1, 1, 4, 'tok2')
  await finishRows(d1, [{ rid: 'a', task: 'speech_summary', status: 'done', outcome: 'dry', result: 'R', model: 'm', addNeurons: 2 }], 5)
  const r = rows(raw, 'SELECT * FROM queue')[0]
  assert.equal(r.neurons, 3.5)
  assert.equal(r.attempts, 1)
  assert.equal(r.status, 'done')
  assert.equal(r.claim_token, null)
  assert.equal(r.last_error, null)
})

// ---------------------------------------------------------------- discovery

test('discovery enqueues speeches (both tasks, high priority) and releases, and advances the cursor after enqueuing', async () => {
  const kb = new FakeKb()
  kb.catalogRows = [
    { kind: 'speech', rid: 's1', created: '2026-09-28T11:48:20.705955' },
    { kind: 'speech', rid: 's2', created: '2026-09-28T11:48:21.000000' },
    { kind: 'press_release', rid: 'p1', created: '2026-09-28T11:00:00.000000' },
    { kind: 'speech', rid: 'too-old', created: '2026-09-01T00:00:00.000000' },
  ]
  const ai = new FakeAi(() => both)
  const { deps, raw, d1 } = makeDeps({ kb, ai, env: { BATCH_SIZE: '1' } })
  const stats = await runTick(deps)
  assert.deepEqual(stats.discovered, { speech: 4, press_release: 1 })
  const q = rows(raw, 'SELECT rid, task, priority FROM queue ORDER BY rid, task')
  assert.deepEqual(q.map((r) => `${r.rid}:${r.task}`), ['p1:release_summary', 's1:speech_summary', 's1:speech_topics', 's2:speech_summary', 's2:speech_topics'])
  assert.ok(q.every((r) => r.priority === 100))
  assert.equal(await getState(d1, 'cursor:speech'), '2026-09-28T11:48:21.000Z')
  assert.equal(await getState(d1, 'cursor:press_release'), '2026-09-28T11:00:00.000Z')
  assert.equal(kb.catalogCalls[0].since, '2026-09-20T00:00:00Z')
})

test('a page-capped walk resumes exactly at the cursor and eventually enqueues everything; a complete walk then re-reads a short overlap', async () => {
  const kb = new FakeKb()
  kb.catalogRows = Array.from({ length: 5 }, (_, i) => ({ kind: 'speech', rid: `s${i}`, created: `2026-09-28T11:00:0${i}.000000` }))
  const { deps, raw, d1 } = makeDeps({ kb, ai: new FakeAi(() => both), env: { DISCOVERY_MAX_PAGES: '1', DAILY_NEURON_BUDGET: '0' } })
  const small = { ...deps, kb: kbWithPage(kb, 2) as any }
  const cursors: Array<string | null> = []
  let complete = -1
  for (let i = 0; i < 6; i += 1) {
    const stats = await runTick(small)
    cursors.push(await getState(d1, 'cursor:speech'))
    if (!stats.discoveryPartial.includes('speech') && complete < 0) complete = i
  }
  assert.equal(rows(raw, "SELECT COUNT(DISTINCT rid) AS n FROM queue WHERE task = 'speech_summary'")[0].n, 5)
  assert.equal(cursors.at(-1), '2026-09-28T11:00:04.000Z')
  assert.ok(complete >= 0, 'the walk finished')
  // Progress is monotonic while capped.
  for (let i = 1; i < cursors.length; i += 1) assert.ok(cursors[i]! >= cursors[i - 1]!)
  // After a complete walk, the following tick's since is the cursor minus the 120 s overlap.
  await runTick(small)
  const lastCall = kb.catalogCalls.filter((c) => c.kind === 'speech').at(-1)!
  assert.equal(lastCall.since, '2026-09-28T10:58:04Z')
})

/** A view of the fake box whose catalog uses a small page size (discovery normally asks for 200). */
function kbWithPage(kb: FakeKb, size: number) {
  return {
    getResource: kb.getResource.bind(kb),
    getBasic: kb.getBasic.bind(kb),
    getSummaryBody: kb.getSummaryBody.bind(kb),
    patchSummary: kb.patchSummary.bind(kb),
    patchClassifications: kb.patchClassifications.bind(kb),
    catalog: (kind: string, since: string, page: number) => kb.catalog(kind, since, page, size),
  }
}

test('the cursor does not advance when enqueuing fails', async () => {
  const kb = new FakeKb()
  kb.catalogRows = [{ kind: 'speech', rid: 's1', created: '2026-09-28T11:48:20.000000' }]
  const { deps, d1 } = makeDeps({ kb, ai: new FakeAi(() => both), env: { DAILY_NEURON_BUDGET: '0' } })
  const failing = { ...deps, db: { ...(d1 as any), prepare: (sql: string) => { if (sql.startsWith('INSERT OR IGNORE')) throw new Error('D1 down'); return (d1 as any).prepare(sql) }, batch: (s: any) => (d1 as any).batch(s) } as any }
  const stats = await runTick(failing)
  assert.ok(stats.discoveryErrors.length > 0)
  assert.equal(await getState(d1, 'cursor:speech'), null)
})

test('discovery runs after processing, so a slow or hung catalog can never delay or eat the model work (bug seen on the first remote tick)', async () => {
  const kb = new FakeKb()
  seed(kb, 'r1')
  kb.catalogRows = [{ kind: 'speech', rid: 'newer', created: '2026-09-28T11:48:20.000000' }]
  const events: string[] = []
  let clock = Date.parse('2026-09-28T12:00:00Z')
  const realCatalog = kb.catalog.bind(kb)
  kb.catalog = async (...args: Parameters<FakeKb['catalog']>) => {
    events.push('catalog')
    clock += 50_000 // the catalog and the D1 inserts took 50 s of wall time
    return realCatalog(...args)
  }
  const ai = new FakeAi(() => {
    events.push('ai')
    return both
  })
  const { deps, d1 } = makeDeps({ kb, ai, now: () => clock })
  await queueBoth(d1, 'r1')
  const stats = await runTick(deps)
  assert.equal(stats.dry, 2)
  assert.deepEqual([events[0], events.includes('catalog')], ['ai', true])
  assert.ok(events.indexOf('ai') < events.indexOf('catalog'))
  assert.equal(stats.discovered.speech, 2, 'and discovery still ran')
})

test('discovery honours its time box: stops paging, marks the walk partial, resumes next tick', async () => {
  const kb = new FakeKb()
  kb.catalogRows = Array.from({ length: 6 }, (_, i) => ({ kind: 'speech', rid: `s${i}`, created: `2026-09-28T11:00:0${i}.000000` }))
  let clock = 0
  const slow = { ...kbWithPage(kb, 2), catalog: async (kind: string, since: string, page: number) => { clock += 15_000; return kb.catalog(kind, since, page, 2) } }
  const { deps } = makeDeps({ kb, ai: new FakeAi(() => both), env: { DAILY_NEURON_BUDGET: '0' } })
  const { discover } = await import('../src/discover.ts')
  const out = await discover({ db: deps.db, kb: slow as any, now: 1, startIso: '2026-09-20T00:00:00Z', maxPages: 10, overlapS: 120, maxMs: 20_000, clock: () => clock })
  assert.deepEqual(out.partial, ['speech'])
  assert.equal(out.seen.speech, 4, 'two pages of two, then out of time')
})

// ---------------------------------------------------------------- processing: dry mode

test('dry mode: one call yields both summary and topics, recorded in D1, nothing written to the box', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  const stats = await runTick(deps)
  assert.equal(ai.calls.length, 1)
  assert.deepEqual(kb.writes(), [])
  assert.equal(stats.dry, 2)
  const q = Object.fromEntries(rows(raw, 'SELECT * FROM queue').map((r) => [r.task, r]))
  assert.equal(q.speech_summary.status, 'done')
  assert.equal(q.speech_summary.outcome, 'dry')
  assert.equal(q.speech_summary.result, GOOD_SUMMARY)
  assert.equal(q.speech_topics.result, '["housing","welfare-social"]')
  assert.equal(q.speech_summary.model, '@cf/qwen/qwen3-30b-a3b-fp8')
  assert.ok(q.speech_summary.neurons > 0)
  assert.equal(rows(raw, 'SELECT neurons FROM spend')[0].neurons, 5)
})

test('WRITE_MODE anything but "live" is dry', async () => {
  for (const mode of ['', 'LIVE', 'true']) {
    const kb = new FakeKb()
    seed(kb)
    const { deps, d1 } = makeDeps({ kb, ai: new FakeAi(() => both), env: { WRITE_MODE: mode } })
    await queueBoth(d1)
    await runTick(deps)
    assert.deepEqual(kb.writes(), [], mode)
  }
})

test('the model is shown the speech, never the machine brief that sits beside it', async () => {
  const kb = new FakeKb()
  seed(kb, 'r1', { 'da-summary-t-body': 'BRIEF-MARKER-SHOULD-NEVER-BE-SUMMARISED '.repeat(60) })
  const ai = new FakeAi(() => both)
  const { deps, d1 } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await enqueue(d1, [{ rid: 'r1', task: 'speech_topics', priority: 100 }], 1)
  await runTick(deps)
  const prompt = ai.userPrompts()[0]
  assert.ok(prompt.includes('supported housing places'))
  assert.ok(!prompt.includes('BRIEF-MARKER'))
})

test('an existing brief means no model call and no write (skipped-existing)', async () => {
  const kb = new FakeKb()
  seed(kb, 'r1', { 'da-summary-t-body': 'A brief that already exists in the box and is long enough.' })
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await enqueue(d1, [{ rid: 'r1', task: 'speech_summary', priority: 100 }], 1)
  const stats = await runTick(deps)
  assert.equal(ai.calls.length, 0)
  assert.deepEqual(kb.writes(), [])
  assert.equal(stats.skipped, 1)
  assert.equal(rows(raw, 'SELECT outcome FROM queue')[0].outcome, 'skipped-existing')
})

test('a resource with no text is settled without a model call; a missing resource is settled as missing', async () => {
  const kb = new FakeKb()
  kb.add('empty', { texts: { 'da-summary-t-body': 'only a brief' } })
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await enqueue(d1, [{ rid: 'empty', task: 'speech_summary', priority: 100 }, { rid: 'gone', task: 'speech_summary', priority: 100 }], 1)
  await runTick(deps)
  assert.equal(ai.calls.length, 0)
  const o = Object.fromEntries(rows(raw, 'SELECT rid, outcome FROM queue').map((r) => [r.rid, r.outcome]))
  assert.deepEqual(o, { empty: 'no-text', gone: 'missing' })
})

test('an empty topic verdict is recorded in D1 and writes nothing to the box, even live', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(() => '{"topics": []}')
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await enqueue(d1, [{ rid: 'r1', task: 'speech_topics', priority: 100 }], 1)
  const stats = await runTick(deps)
  assert.equal(stats.empty, 1)
  assert.deepEqual(kb.writes(), [])
  const r = rows(raw, 'SELECT * FROM queue')[0]
  assert.equal(r.status, 'done')
  assert.equal(r.outcome, 'empty')
  assert.equal(r.result, '[]')
})

// ---------------------------------------------------------------- processing: live mode

test('live mode: summary and topic labels are written, and every non-topic label survives', async () => {
  const kb = new FakeKb()
  seed(kb)
  const before = kb.resources.get('r1')!.classifications.map((c) => ({ ...c }))
  const { deps, d1, raw } = makeDeps({ kb, ai: new FakeAi(() => both), env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  const stats = await runTick(deps)
  assert.equal(stats.written, 2)
  const r = kb.resources.get('r1')!
  assert.equal(r.texts['da-summary-t-body'], GOOD_SUMMARY)
  assert.deepEqual(r.classifications.filter((c) => c.labelset !== 'topic'), before)
  assert.deepEqual(r.classifications.filter((c) => c.labelset === 'topic').map((c) => c.label), ['housing', 'welfare-social'])
  assert.deepEqual(rows(raw, 'SELECT outcome FROM queue ORDER BY task').map((x) => x.outcome), ['written', 'written'])
})

test('live mode writes the brief in the exact PATCH shape the Python harness uses', async () => {
  const seen: any[] = []
  const { Kb } = await import('../src/kb.ts')
  const kb = new Kb({ ARAG_ZONE: 'zone', ARAG_KB_ID: 'KBID', ARAG_KB_TOKEN: 'TOKEN' }, (async (url: string, init: any) => {
    seen.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers['x-nuclia-serviceaccount'] })
    return new Response('{}', { status: 200 })
  }) as any)
  await kb.patchSummary('abc', 'A brief.')
  await kb.patchClassifications('abc', [{ labelset: 'kind', label: 'speech' }, { labelset: 'topic', label: 'health' }])
  assert.equal(seen[0].url, 'https://zone.rag.progress.cloud/api/v1/kb/KBID/resource/abc')
  assert.equal(seen[0].method, 'PATCH')
  assert.deepEqual(seen[0].body, { texts: { 'da-summary-t-body': { body: 'A brief.', format: 'PLAIN' } } })
  assert.equal(seen[0].auth, 'Bearer TOKEN')
  assert.deepEqual(seen[1].body, { usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'topic', label: 'health' }] } })
})

// ---------------------------------------------------------------- validation, retry, escalation, quarantine

test('a rejected brief is retried once on the primary with the complaint, then escalated, and accepted from the escalation model', async () => {
  const kb = new FakeKb()
  seed(kb)
  const bad = JSON.stringify({ summary: 'Asked about 2003 housing places for young people in the region and how they will be delivered by the department.', topics: ['housing'] })
  const ai = new FakeAi(({ model, n }) => (n < 2 ? bad : both))
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  await runTick(deps)
  assert.deepEqual(ai.calls.map((c) => c.model), ['@cf/qwen/qwen3-30b-a3b-fp8', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/openai/gpt-oss-120b'])
  // The retry carries the validator's complaint; the topics were accepted first time so only the summary is re-asked.
  const retry = ai.userPrompts()[1]
  assert.ok(retry.includes('figure 2003 is not present in the supplied text'))
  assert.ok(retry.includes('The previous attempt failed these checks'))
  assert.ok(!ai.systemPrompts()[1].includes('TAXONOMY'), 'a summary-only retry does not resend the taxonomy')
  assert.ok(ai.systemPrompts()[0].includes('TAXONOMY'))
  assert.deepEqual(Object.keys(ai.calls[1].body.response_format.json_schema.schema.properties), ['summary'], 'and constrains only the summary')
  const q = Object.fromEntries(rows(raw, 'SELECT * FROM queue').map((r) => [r.task, r]))
  assert.equal(q.speech_summary.status, 'done')
  assert.equal(q.speech_summary.model, '@cf/openai/gpt-oss-120b')
  assert.equal(q.speech_summary.attempts, 2)
  assert.equal(q.speech_topics.model, '@cf/qwen/qwen3-30b-a3b-fp8')
  assert.equal(q.speech_topics.attempts, 0)
  assert.equal(rows(raw, 'SELECT COUNT(*) AS n FROM rejections')[0].n, 2)
})

test('after three failures the row is quarantined with diagnostics and NO invalid summary is ever written', async () => {
  const kb = new FakeKb()
  seed(kb)
  const bad = JSON.stringify({ summary: 'In this speech the member argued that 2003 funding rose for housing places in the region overall.', topics: ['housing'] })
  const ai = new FakeAi(() => bad)
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await enqueue(d1, [{ rid: 'r1', task: 'speech_summary', priority: 100 }], 1)
  const stats = await runTick(deps)
  assert.equal(ai.calls.length, 3)
  assert.equal(stats.quarantined, 1)
  assert.deepEqual(kb.writes(), [])
  const r = rows(raw, 'SELECT * FROM queue')[0]
  assert.equal(r.status, 'quarantined')
  assert.equal(r.attempts, 3)
  assert.ok(r.last_error.includes('figure 2003'), r.last_error)
  assert.ok(r.last_error.includes('In this speech') || r.last_error.includes('framing phrase'))
})

test('unparseable output and truncated output are rejected and retried; JSON in a fence is accepted', async () => {
  const kb = new FakeKb()
  seed(kb)
  const replies = ['I think the speech is about housing.', { content: null, reasoning: 'Okay, the user wants me to', finish: 'length' }, '```json\n' + both + '\n```']
  const ai = new FakeAi(({ n }) => replies[n] as any)
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  await runTick(deps)
  assert.equal(ai.calls.length, 3)
  assert.ok(ai.userPrompts()[1].includes('not a single JSON object'))
  assert.ok(ai.userPrompts()[2].includes('cut off'))
  assert.equal(rows(raw, 'SELECT status FROM queue').every((r) => r.status === 'done'), true)
})

test('reasoning is ignored: an answer that only appears in the reasoning field is a parse failure, not an answer', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(({ n }) => (n === 0 ? { content: null, reasoning: both, finish: 'length' } : both))
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  await runTick(deps)
  assert.equal(ai.calls.length, 2, 'the first reply had no content, so it was retried')
  assert.ok(ai.userPrompts()[1].includes('cut off'))
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM queue WHERE outcome = 'dry'")[0].n, 2)
})

test('request shapes: qwen3 thinking ON with strict json_schema (topics an enum); gpt-oss reasoning effort low with NO schema', async () => {
  const kb = new FakeKb()
  seed(kb)
  const bad = JSON.stringify({ summary: 'no', topics: ['housing'] })
  const ai = new FakeAi(({ n }) => (n < 2 ? bad : both))
  const { deps, d1 } = makeDeps({ kb, ai })
  await queueBoth(d1)
  await runTick(deps)
  const q = ai.calls[0].body
  assert.equal(q.chat_template_kwargs, undefined, 'thinking is not switched off')
  assert.ok(!JSON.stringify(q.messages).includes('/no_think'))
  assert.equal(q.max_tokens, 4000)
  assert.equal(q.temperature, 0.2)
  assert.equal(q.response_format.type, 'json_schema')
  assert.equal(q.response_format.json_schema.name, 'enrichment')
  assert.equal(q.response_format.json_schema.strict, true)
  const schema = q.response_format.json_schema.schema
  assert.deepEqual(schema.required, ['summary', 'topics'])
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.properties.summary, { type: 'string' })
  assert.equal(schema.properties.topics.items.enum.length, 21)
  assert.ok(schema.properties.topics.items.enum.includes('integrity-democracy'))
  assert.equal(schema.properties.topics.maxItems, 3)
  const oss = ai.calls[2]
  assert.equal(oss.model, '@cf/openai/gpt-oss-120b')
  assert.deepEqual(oss.body.reasoning, { effort: 'low' })
  assert.equal(oss.body.response_format, undefined)
  assert.equal(oss.body.reasoning_effort, undefined)
})

test('a degenerate gpt-oss reply ("!!!!") is a parse failure: the row is quarantined after the third attempt', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(({ model }) => (model.includes('gpt-oss') ? '!'.repeat(400) : '{"summary": "x"}'))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await enqueue(d1, [{ rid: 'r1', task: 'speech_summary', priority: 100 }], 1)
  await runTick(deps)
  assert.deepEqual(ai.calls.map((c) => c.model.split('/').pop()), ['qwen3-30b-a3b-fp8', 'qwen3-30b-a3b-fp8', 'gpt-oss-120b'])
  assert.equal(rows(raw, 'SELECT status FROM queue')[0].status, 'quarantined')
  assert.deepEqual(kb.writes(), [])
})

test('cleanup runs before validation: percent signs and dashes are fixed, so a faithful brief passes', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'The minister said unemployment fell to 4 per cent in the region, the lowest in a decade, at Portfolio Committee No. 5 - Justice and Communities today.' } })
  const brief = 'Reported that unemployment fell to 4% in the region \u2013 the lowest in a decade \u2013 the minister said at the \u201cJustice and Communities\u201d committee.'
  const ai = new FakeAi(() => JSON.stringify({ summary: brief, topics: ['Health', 'made-up', 'health'] }))
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  await runTick(deps)
  assert.equal(ai.calls.length, 1)
  const q = Object.fromEntries(rows(raw, 'SELECT task, result FROM queue').map((r) => [r.task, r.result]))
  assert.equal(q.speech_summary, 'Reported that unemployment fell to 4 per cent in the region - the lowest in a decade - the minister said at the "Justice and Communities" committee.')
  assert.equal(q.speech_topics, '["health"]')
})

// ---------------------------------------------------------------- budget

test('budget cutoff: a tick with the day already spent processes nothing', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { DAILY_NEURON_BUDGET: '100' } })
  await queueBoth(d1)
  raw.prepare("INSERT INTO spend (day, model, neurons, calls) VALUES ('2026-09-28', 'm', 100, 1)").run()
  const stats = await runTick(deps)
  assert.equal(stats.stop, 'budget')
  assert.equal(ai.calls.length, 0)
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM queue WHERE status = 'pending'")[0].n, 2)
})

test('budget cutoff mid-tick: stops starting new work once the day is spent, and leaves the rest pending', async () => {
  const kb = new FakeKb()
  for (let i = 0; i < 6; i += 1) seed(kb, `r${i}`)
  const ai = new FakeAi(() => ({ content: both, neurons: 40 }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { DAILY_NEURON_BUDGET: '100', CONCURRENCY: '1', BATCH_SIZE: '6' } })
  for (let i = 0; i < 6; i += 1) await queueBoth(d1, `r${i}`)
  const stats = await runTick(deps)
  assert.equal(stats.stop, 'budget')
  assert.equal(ai.calls.length, 3, 'stops at 120 neurons: the call that crosses the line is the last')
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM queue WHERE status = 'done'")[0].n, 6)
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM queue WHERE status = 'pending'")[0].n, 6)
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM queue WHERE status = 'claimed'")[0].n, 0)
  assert.ok(stats.neuronsToday >= 100)
})

// ---------------------------------------------------------------- backpressure and outages

test('a 429 from the box on a write keeps the generated result, backs off, and stops the tick', async () => {
  const kb = new FakeKb()
  seed(kb, 'r1')
  seed(kb, 'r2')
  kb.failWrites = new KbBackpressure('PATCH -> 429: Too many messages pending to ingest', 429, 90)
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live', CONCURRENCY: '1' } })
  await queueBoth(d1, 'r1')
  await queueBoth(d1, 'r2')
  const stats = await runTick(deps)
  assert.equal(stats.stop, 'kb-backpressure')
  assert.equal(ai.calls.length, 1, 'the second resource is not started')
  const done = rows(raw, "SELECT rid, task, outcome, status FROM queue WHERE rid = 'r1'")
  assert.ok(done.every((r) => r.status === 'done' && r.outcome === 'unwritten'))
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM queue WHERE rid = 'r2' AND status = 'pending'")[0].n, 2)
  const until = Number(await getState(d1, 'kb_backoff_until'))
  assert.ok(until > deps.now() + 60_000)
  // the next tick is inside the backoff window: nothing runs
  kb.failWrites = null
  const next = await runTick(deps)
  assert.equal(next.stop, 'kb-backoff')
  assert.equal(ai.calls.length, 1)
})

test('after the backoff, live mode flushes unwritten results without paying for the model again', async () => {
  const kb = new FakeKb()
  seed(kb, 'r1')
  kb.failWrites = new KbBackpressure('429', 429, 30)
  const ai = new FakeAi(() => both)
  let clock = Date.parse('2026-09-28T12:00:00Z')
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' }, now: () => clock })
  await queueBoth(d1, 'r1')
  await runTick(deps)
  assert.equal(ai.calls.length, 1)
  kb.failWrites = null
  clock += 10 * 60_000
  const stats = await runTick(deps)
  assert.equal(ai.calls.length, 1)
  assert.equal(stats.flushed, 2)
  assert.equal(kb.resources.get('r1')!.texts['da-summary-t-body'], GOOD_SUMMARY)
  assert.deepEqual(rows(raw, 'SELECT outcome FROM queue').map((r) => r.outcome), ['written', 'written'])
})

test('a dry run can be flushed by switching to live: the stored results are written, invariants re-checked', async () => {
  const kb = new FakeKb()
  seed(kb, 'r1')
  seed(kb, 'r2')
  const { deps, d1, raw } = makeDeps({ kb, ai: new FakeAi(() => both) })
  await queueBoth(d1, 'r1')
  await queueBoth(d1, 'r2')
  await runTick(deps)
  assert.deepEqual(kb.writes(), [])
  // Someone (a person, another worker) wrote r2's brief in the meantime.
  kb.resources.get('r2')!.texts['da-summary-t-body'] = 'A hand-written brief that must not be overwritten by a stale dry result.'
  const live = makeDeps({ kb, ai: new FakeAi(() => both), env: { WRITE_MODE: 'live' }, d1: { d1, raw } })
  const stats = await runTick(live.deps)
  assert.equal(stats.flushed, 4)
  assert.equal(kb.resources.get('r1')!.texts['da-summary-t-body'], GOOD_SUMMARY)
  assert.equal(kb.resources.get('r2')!.texts['da-summary-t-body'], 'A hand-written brief that must not be overwritten by a stale dry result.')
  const r2 = Object.fromEntries(rows(raw, "SELECT task, outcome FROM queue WHERE rid = 'r2'").map((r) => [r.task, r.outcome]))
  assert.equal(r2.speech_summary, 'skipped-existing')
  assert.equal(r2.speech_topics, 'written')
})

test('a model outage leaves rows pending (transient), and a quota error pauses the day', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(() => new Error('InferenceUpstreamError: 3040: Capacity temporarily exceeded'))
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  const stats = await runTick(deps)
  assert.equal(stats.transient, 2)
  const r = rows(raw, 'SELECT status, transient, attempts FROM queue')
  assert.ok(r.every((x) => x.status === 'pending' && x.transient === 1 && x.attempts === 0))

  const quota = new FakeAi(() => new Error('4006: you have used up your daily free allocation of 10,000 neurons'))
  const b = makeDeps({ kb, ai: quota, d1: { d1, raw } })
  const s2 = await runTick(b.deps)
  assert.equal(s2.stop, 'ai-quota')
  const s3 = await runTick(b.deps)
  assert.equal(s3.stop, 'ai-paused')
  assert.equal(quota.calls.length, 1)
})

test('a row that keeps hitting infrastructure failures is quarantined after eight', async () => {
  const kb = new FakeKb()
  seed(kb)
  const ai = new FakeAi(() => new Error('boom'))
  const shared = makeD1()
  await enqueue(shared.d1, [{ rid: 'r1', task: 'speech_summary', priority: 100 }], 1)
  for (let i = 0; i < 8; i += 1) {
    const { deps } = makeDeps({ kb, ai, d1: shared })
    await runTick(deps)
  }
  assert.equal(rows(shared.raw, 'SELECT status FROM queue')[0].status, 'quarantined')
})

test('a knowledge-box write refusal (4xx) or an unsafe write quarantines the row, never loops', async () => {
  const kb = new FakeKb()
  kb.add('nokind', { texts: { body: speechText() }, classifications: [{ labelset: 'party', label: 'labor' }] })
  const { deps, d1, raw } = makeDeps({ kb, ai: new FakeAi(() => '{"topics": ["housing"]}'), env: { WRITE_MODE: 'live' } })
  await enqueue(d1, [{ rid: 'nokind', task: 'speech_topics', priority: 100 }], 1)
  await runTick(deps)
  const r = rows(raw, 'SELECT * FROM queue')[0]
  assert.equal(r.status, 'quarantined')
  assert.ok(r.last_error.includes('no kind classification'))
  assert.deepEqual(kb.writes(), [])
})
