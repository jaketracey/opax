import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { test } from 'node:test'
import roster from '../src/historic-names.json' with { type: 'json' }
import { claimRids, enqueue, finishRows, hasBackfill, reclaimStale, releaseClaims, unwrittenRows } from '../src/db.ts'
import { effectiveBudget } from '../src/budget.ts'
import { isHistoricSpeech, skipHistoricShort, summaryCharacters } from '../src/historic.ts'
import { buildSystemPrompt } from '../src/prompts.ts'
import { runTick } from '../src/tick.ts'
import { NAMES_PROBLEM, hasNewPersonalName, validateSummary } from '../src/validate.ts'
import { RejectedNames, writeItem } from '../src/write.ts'
import { FakeAi, FakeKb, GOOD_SUMMARY, makeD1, makeDeps, rows, speechText } from './helpers.ts'

// Deliberately invented; real parliamentary names are derived from the bundled exports at runtime.
const invented = 'Zelara Quenwick'
const badSummary = `Asked ${invented} to support regional housing projects while calling for better services for young people.`
const labels = [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: 'hansard_hist' }]
const both = JSON.stringify({ summary: GOOD_SUMMARY, topics: ['housing'] })
async function queueBoth(db: D1Database, rid = 'r1') {
  await enqueue(db, [{ rid, task: 'speech_summary', priority: 0 }, { rid, task: 'speech_topics', priority: 0 }], 1)
}
function hist(kb: FakeKb, body = speechText()) {
  kb.add('r1', { classifications: labels, texts: { body } })
}

test('short historic boundary uses the summariser normalisation at 199/200/201 Unicode characters', async () => {
  for (const length of [199, 200, 201]) {
    const body = `  ${'word '.repeat(39)}${'x'.repeat(length - 195)} \n\t `
    assert.equal(summaryCharacters(body), length)
    assert.equal(skipHistoricShort(true, body), length < 200)
    const kb = new FakeKb()
    hist(kb, body)
    const ai = new FakeAi(() => JSON.stringify({ summary: 'Reported concerns about support for regional housing and better local services.', topics: [] }))
    const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
    await queueBoth(d1)
    const stats = await runTick(deps)
    const states = rows(raw, 'SELECT status, done_at, claim_token, neurons FROM queue')
    assert.ok(states.every((r) => r.status === (length < 200 ? 'skipped-short' : 'done')))
    if (length < 200) {
      assert.equal(ai.calls.length, 0)
      assert.deepEqual(kb.writes(), [])
      assert.equal(stats.skippedShort, 2)
      assert.ok(states.every((r) => r.done_at !== null && r.claim_token === null && r.neurons === 0))
      await runTick(deps)
      assert.equal(ai.calls.length, 0)
      assert.ok(kb.resources.has('r1'))
    } else assert.equal(ai.calls.length, 1)
  }
  assert.equal(summaryCharacters('😀'.repeat(199)), 199)
  assert.equal(skipHistoricShort(true, '😀'.repeat(199)), true)
})

test('non-historic speeches keep the existing prompt, short handling and name behavior', async () => {
  const body = 'Requested better regional housing and health services.'
  assert.equal(skipHistoricShort(false, body), false)
  const kb = new FakeKb()
  kb.add('r1', { texts: { body } })
  const ai = new FakeAi(() => JSON.stringify({ summary: badSummary, topics: [] }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  await runTick(deps)
  assert.equal(ai.calls.length, 1)
  assert.equal(ai.systemPrompts()[0], buildSystemPrompt(['summary', 'topics']))
  assert.ok(rows(raw, 'SELECT status FROM queue').every((r) => r.status === 'done'))
  assert.equal(kb.resources.get('r1')!.texts['da-summary-t-body'], badSummary)
})

test('historic eligibility ignores cancelled labels and other resource kinds', () => {
  assert.equal(isHistoricSpeech({ usermetadata: { classifications: labels } }), true)
  assert.equal(isHistoricSpeech({ usermetadata: { classifications: [...labels, { labelset: 'source', label: 'another-source' }] } }), true)
  assert.equal(isHistoricSpeech({ usermetadata: { classifications: [{ ...labels[1], cancelled_by_user: true }, labels[0]] } }), false)
  assert.equal(isHistoricSpeech({ usermetadata: { classifications: [labels[1], { labelset: 'kind', label: 'press_release' }] } }), false)
})

test('the longest non-summary body decides the skip, including before the existing no-text rule', async () => {
  const kb = new FakeKb()
  hist(kb, 'Moved.')
  kb.resources.get('r1')!.texts['da-summary-t-body'] = 'brief '.repeat(60)
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai })
  await queueBoth(d1)
  await runTick(deps)
  assert.ok(rows(raw, 'SELECT status FROM queue').every((r) => r.status === 'skipped-short'))
  assert.equal(ai.calls.length, 0)
})

test('guard rejects invented full names, titled surnames, initials and officeholders without leaking names in complaints', () => {
  for (const name of [invented, 'Mr Quenwick', 'Dr Quenwick', 'Z. Quenwick', `Prime Minister ${invented}`, 'Quenwick said', `${invented}'s`]) {
    assert.equal(hasNewPersonalName(`Reported that ${name} supported better local housing services.`, ''), true)
  }
  const problems = validateSummary(badSummary, { text: speechText(), historic: true })
  assert.ok(problems.includes(NAMES_PROBLEM))
  assert.ok(problems.every((p) => !p.includes(invented)))
  assert.equal(validateSummary(badSummary, { text: speechText() }).includes(NAMES_PROBLEM), false)
})

test('guard passes names in the unit, word boundaries, normalised punctuation and the full unit beyond the clip', () => {
  assert.equal(hasNewPersonalName(badSummary, `The witness ${invented} spoke.`), false)
  assert.equal(hasNewPersonalName(badSummary, `The witness ${invented}son spoke.`), true)
  assert.equal(hasNewPersonalName("Mr O'Quenwick asked about local housing.", 'Mr O’Quenwick attended.'), false)
  assert.equal(hasNewPersonalName(`Reported concerns about '${invented}' in the region.`, ''), true)
  assert.equal(hasNewPersonalName(`Reported concerns about ${invented} in the region.`, `The witness '${invented}' attended.`), false)
  assert.equal(hasNewPersonalName('Reported concerns raised by Mr Quenwick–Zelara about housing.', 'Mr Quenwick–Zelara attended.'), false)
  assert.equal(validateSummary(badSummary, { text: speechText(), historic: true, nameText: `${speechText()} ${'other text '.repeat(1600)} ${invented}` }).includes(NAMES_PROBLEM), false)
})

test('guard passes roster names and titled surnames derived from the asset at runtime', () => {
  const entries = roster.names.split('\n')
  const full = entries.find((n) => /^[a-z]+ [a-z]+$/.test(n))!
  const titled = full.replace(/\b[a-z]/g, (s) => s.toUpperCase())
  assert.equal(hasNewPersonalName(`Reported that ${titled} supported regional housing projects.`, ''), false)
  assert.equal(hasNewPersonalName(`Asked Mr ${titled} about regional housing projects.`, ''), false)
  const surname = entries.find((n) => /^[a-z]{5,}$/.test(n))!
  assert.equal(hasNewPersonalName(`Reported that Mr ${surname[0].toUpperCase() + surname.slice(1)} supported housing.`, ''), false)
})

test('guard passes places, electorates, parties, acts, bills and ministerial titles', () => {
  for (const reference of ['New South Wales', 'South Australia', 'Port Moresby', 'New Zealand', 'Australian Labor Party', 'Liberal Party', 'Australian Democrats', 'One Nation', 'Health Insurance Amendment Bill', 'Health Insurance (Regional Housing) Amendment Bill', 'Native Title Act', 'the Treasurer', 'Mr Speaker', 'Deputy Prime Minister', 'Minister for Foreign Affairs', 'Minister for Regional Development', 'Mr Deputy Speaker', 'Question Time']) {
    assert.equal(hasNewPersonalName(`Reported concerns about ${reference} and better regional services.`, ''), false)
  }
  const electorate = roster.electorates.split('\n').find((n) => n.includes(' '))!
  assert.equal(hasNewPersonalName(electorate.replace(/\b[a-z]/g, (s) => s.toUpperCase()), ''), false)
})

test('historic prompt adds the role instruction while the live golden prompt remains unchanged', () => {
  const prompt = buildSystemPrompt(['summary', 'topics'], true)
  assert.ok(prompt.includes('Describe private individuals by role, not by name.'))
  assert.ok(!buildSystemPrompt(['summary', 'topics']).includes('HISTORIC HANSARD'))
})

test('one name rejection escalates once, then becomes terminal without a summary write', async () => {
  const kb = new FakeKb()
  hist(kb)
  const ai = new FakeAi(() => JSON.stringify({ summary: badSummary, topics: ['housing'] }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  const stats = await runTick(deps)
  assert.deepEqual(ai.calls.map((c) => c.model), [deps.cfg.primaryModel, deps.cfg.escalationModel])
  assert.equal(stats.rejectedNames, 1)
  const summary = rows(raw, "SELECT * FROM queue WHERE task = 'speech_summary'")[0]
  assert.equal(summary.status, 'rejected-names')
  assert.equal(summary.attempts, 2)
  assert.equal(summary.result, null)
  assert.ok(summary.done_at !== null)
  assert.ok(!kb.writes().some((c) => c.includes('summary')))
  assert.equal(rows(raw, "SELECT status FROM queue WHERE task = 'speech_topics'")[0].status, 'done')
  assert.ok(rows(raw, 'SELECT sample FROM rejections').every((r) => r.sample === ''))
  await runTick(deps)
  assert.equal(ai.calls.length, 2)
})

test('one corrective escalation can accept a role-based brief; an invalid corrective reply is terminal', async () => {
  for (const corrective of [both, 'not JSON']) {
    const kb = new FakeKb()
    hist(kb)
    const ai = new FakeAi(({ n }) => n === 0 ? JSON.stringify({ summary: badSummary, topics: [] }) : corrective)
    const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
    await queueBoth(d1)
    await runTick(deps)
    assert.equal(ai.calls.length, 2)
    assert.equal(rows(raw, "SELECT status FROM queue WHERE task = 'speech_summary'")[0].status, corrective === both ? 'done' : 'rejected-names')
  }
})

test('name escalation allowance survives a budget interruption between ticks', async () => {
  const kb = new FakeKb()
  hist(kb)
  const ai = new FakeAi(() => JSON.stringify({ summary: badSummary, topics: [] }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { DAILY_NEURON_BUDGET: '5', WRITE_MODE: 'live' } })
  await queueBoth(d1)
  await runTick(deps)
  assert.equal(ai.calls.length, 1)
  const first = rows(raw, "SELECT status, names_rejected FROM queue WHERE task = 'speech_summary'")[0]
  assert.equal(first.status, 'pending')
  assert.equal(first.names_rejected, 1)
  await runTick({ ...deps, cfg: { ...deps.cfg, dailyBudget: 100 } })
  assert.equal(ai.calls.length, 2)
  assert.equal(ai.calls[1].model, deps.cfg.escalationModel)
  assert.ok(ai.userPrompts()[1].includes(NAMES_PROBLEM))
  assert.equal(rows(raw, "SELECT status FROM queue WHERE task = 'speech_summary'")[0].status, 'rejected-names')
})

test('a name failure on the last ordinary attempt still gets one corrective escalation', async () => {
  const kb = new FakeKb()
  hist(kb)
  const ai = new FakeAi(({ n }) => JSON.stringify({ summary: n < 2 ? 'Asked for 9999 housing places to be delivered through regional projects and better local services.' : badSummary, topics: [] }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  await runTick(deps)
  assert.deepEqual(ai.calls.map((c) => c.model), [deps.cfg.primaryModel, deps.cfg.primaryModel, deps.cfg.escalationModel, deps.cfg.escalationModel])
  assert.equal(rows(raw, "SELECT status FROM queue WHERE task = 'speech_summary'")[0].status, 'rejected-names')
})

test('saved results and forced writes cannot bypass the historic rules', async () => {
  const kb = new FakeKb()
  hist(kb)
  await assert.rejects(writeItem(kb, 'r1', { task: 'speech_summary', force: true, value: badSummary }), RejectedNames)
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  await finishRows(d1, [{ rid: 'r1', task: 'speech_summary', status: 'done', outcome: 'dry', result: badSummary }], 2)
  await runTick(deps)
  assert.equal(ai.calls.length, 1)
  assert.equal(ai.calls[0].model, deps.cfg.escalationModel)
  assert.equal(kb.resources.get('r1')!.texts['da-summary-t-body'], GOOD_SUMMARY)
  assert.equal(rows(raw, "SELECT status FROM queue WHERE task = 'speech_summary'")[0].status, 'done')

  const shortKb = new FakeKb()
  hist(shortKb, 'Moved.')
  const shortAi = new FakeAi(() => both)
  const short = makeDeps({ kb: shortKb, ai: shortAi, env: { WRITE_MODE: 'live' } })
  await queueBoth(short.d1)
  await finishRows(short.d1, [{ rid: 'r1', task: 'speech_summary', status: 'done', outcome: 'dry', result: GOOD_SUMMARY }, { rid: 'r1', task: 'speech_topics', status: 'done', outcome: 'dry', result: '["housing"]' }], 2)
  await runTick(short.deps)
  assert.equal(shortAi.calls.length, 0)
  assert.deepEqual(shortKb.writes(), [])
  assert.ok(rows(short.raw, 'SELECT status, result FROM queue').every((r) => r.status === 'skipped-short' && r.result === null))
})

test('terminal historic states never count as backlog, claims or saved work', async () => {
  const { d1, raw } = makeD1()
  for (const status of ['skipped-short', 'rejected-names'] as const) {
    await enqueue(d1, [{ rid: status, task: 'speech_summary', priority: 0 }], 1)
    await finishRows(d1, [{ rid: status, task: 'speech_summary', status, outcome: status }], 2)
  }
  assert.equal(await hasBackfill(d1), false)
  assert.deepEqual(effectiveBudget(await hasBackfill(d1), 1_500_000, 150_000), { mode: 'steady', budget: 150_000 })
  assert.deepEqual(await claimRids(d1, 10, 3, 'token'), [])
  assert.deepEqual(await unwrittenRows(d1, 10), [])
  assert.equal(await reclaimStale(d1, 100_000_000), 0)
  assert.equal(await releaseClaims(d1, 'token', 4), 0)
  assert.equal(await enqueue(d1, [{ rid: 'skipped-short', task: 'speech_summary', priority: 100 }], 5), 0)
  assert.ok(rows(raw, 'SELECT done_at FROM queue').every((r) => r.done_at === 2))
})

test('migration preserves every existing queue field and recreates its indexes', () => {
  const raw = new DatabaseSync(':memory:')
  raw.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0001_init.sql'), 'utf8'))
  raw.exec("INSERT INTO queue (rid, task, status, priority, attempts, transient, force, model, result, outcome, neurons, claim_token, claimed_at, created_at, updated_at) VALUES ('prior', 'speech_summary', 'claimed', 7, 2, 3, 1, 'model', 'result', 'dry', 4.5, 'token', 6, 1, 8)")
  const before = rows(raw, 'SELECT * FROM queue')[0]
  raw.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0002_historic_rules.sql'), 'utf8'))
  const { names_rejected, ...after } = rows(raw, 'SELECT * FROM queue')[0]
  assert.deepEqual(after, { ...before })
  assert.equal(names_rejected, 0)
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name IN ('queue_pick', 'queue_outcome', 'queue_claim')")[0].n, 3)
  raw.close()
})
