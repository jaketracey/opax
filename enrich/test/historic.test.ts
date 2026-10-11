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
    const states = rows(raw, 'SELECT status, terminal_reason, done_at, claim_token, neurons FROM queue')
    assert.ok(states.every((r) => r.status === 'done' && r.terminal_reason === (length < 200 ? 'skipped-short' : null)))
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
  assert.ok(rows(raw, 'SELECT status, terminal_reason FROM queue').every((r) => r.status === 'done' && r.terminal_reason === 'skipped-short'))
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
  assert.equal(summary.status, 'done')
  assert.equal(summary.terminal_reason, 'rejected-names')
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
    assert.equal(rows(raw, "SELECT terminal_reason FROM queue WHERE task = 'speech_summary'")[0].terminal_reason, corrective === both ? null : 'rejected-names')
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
  assert.equal(rows(raw, "SELECT terminal_reason FROM queue WHERE task = 'speech_summary'")[0].terminal_reason, 'rejected-names')
})

test('a name failure on the last ordinary attempt still gets one corrective escalation', async () => {
  const kb = new FakeKb()
  hist(kb)
  const ai = new FakeAi(({ n }) => JSON.stringify({ summary: n < 2 ? 'Asked for 9999 housing places to be delivered through regional projects and better local services.' : badSummary, topics: [] }))
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  await runTick(deps)
  assert.deepEqual(ai.calls.map((c) => c.model), [deps.cfg.primaryModel, deps.cfg.primaryModel, deps.cfg.escalationModel, deps.cfg.escalationModel])
  assert.equal(rows(raw, "SELECT terminal_reason FROM queue WHERE task = 'speech_summary'")[0].terminal_reason, 'rejected-names')
})

test('saved results and forced writes cannot bypass the historic rules', async () => {
  const kb = new FakeKb()
  hist(kb)
  await assert.rejects(writeItem(kb, 'r1', { task: 'speech_summary', force: true, value: badSummary, historic: true }), RejectedNames)
  const ai = new FakeAi(() => both)
  const { deps, d1, raw } = makeDeps({ kb, ai, env: { WRITE_MODE: 'live' } })
  await queueBoth(d1)
  await finishRows(d1, [{ rid: 'r1', task: 'speech_summary', status: 'done', outcome: 'dry', historic: true, result: badSummary }], 2)
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
  await finishRows(short.d1, [{ rid: 'r1', task: 'speech_summary', status: 'done', outcome: 'dry', historic: true, result: GOOD_SUMMARY }, { rid: 'r1', task: 'speech_topics', status: 'done', outcome: 'dry', historic: true, result: '["housing"]' }], 2)
  await runTick(short.deps)
  assert.equal(shortAi.calls.length, 0)
  assert.deepEqual(shortKb.writes(), [])
  assert.ok(rows(short.raw, 'SELECT status, terminal_reason, result FROM queue').every((r) => r.status === 'done' && r.terminal_reason === 'skipped-short' && r.result === null))
})

test('terminal historic states never count as backlog, claims or saved work', async () => {
  const { d1, raw } = makeD1()
  for (const status of ['skipped-short', 'rejected-names'] as const) {
    await enqueue(d1, [{ rid: status, task: 'speech_summary', priority: 0 }], 1)
    await finishRows(d1, [{ rid: status, task: 'speech_summary', status: 'done', terminalReason: status, outcome: status }], 2)
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

test('additive migration preserves rows and index roots, and accepts old-worker writes', () => {
  const raw = new DatabaseSync(':memory:')
  raw.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0001_init.sql'), 'utf8'))
  raw.exec("INSERT INTO queue (rid, task, status, priority, attempts, transient, force, model, result, outcome, neurons, claim_token, claimed_at, created_at, updated_at) VALUES ('prior', 'speech_summary', 'claimed', 7, 2, 3, 1, 'model', 'result', 'dry', 4.5, 'token', 6, 1, 8)")
  const before = rows(raw, 'SELECT * FROM queue')[0]
  const roots = rows(raw, "SELECT name, rootpage FROM sqlite_master WHERE name = 'queue' OR name LIKE 'queue_%'")
  raw.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0002_historic_rules.sql'), 'utf8'))
  const { names_rejected, historic, terminal_reason, ...after } = rows(raw, 'SELECT * FROM queue')[0]
  assert.deepEqual(after, { ...before })
  assert.equal(names_rejected, 0)
  assert.equal(historic, 0)
  assert.equal(terminal_reason, null)
  assert.deepEqual(rows(raw, "SELECT name, rootpage FROM sqlite_master WHERE name = 'queue' OR name LIKE 'queue_%'"), roots)
  raw.exec("INSERT OR IGNORE INTO queue (rid, task, status, priority, created_at, updated_at) VALUES ('old-worker', 'speech_summary', 'pending', 100, 1, 1)")
  raw.exec("UPDATE queue SET status='done', outcome='written', claim_token=NULL, claimed_at=NULL, done_at=9 WHERE rid='prior'")
  assert.equal(rows(raw, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name IN ('queue_pick', 'queue_outcome', 'queue_claim')")[0].n, 3)
  raw.close()
})

test('review reproductions reject bare, compound, uppercase and institution-word surnames after one escalation', async () => {
  for (const summary of [
    'Thanked Quenwick for supporting regional housing projects and better local health services.',
    'Asked Zelara de la Quenwick to support regional housing projects and better local health services.',
    'Asked ZELARA QUENWICK to support regional housing projects and better local health services.',
    'Asked Dr Zelara Justice to support regional housing projects and better local health services.',
  ]) {
    assert.equal(hasNewPersonalName(summary,''),true)
    const kb=new FakeKb(); hist(kb)
    const ai=new FakeAi(()=>JSON.stringify({summary,topics:[]}))
    const {deps,d1,raw}=makeDeps({kb,ai,env:{WRITE_MODE:'live'}})
    await queueBoth(d1); await runTick(deps)
    const row=rows(raw,"SELECT * FROM queue WHERE task='speech_summary'")[0]
    assert.equal(row.status,'done'); assert.equal(row.terminal_reason,'rejected-names')
    assert.equal(row.attempts,2); assert.equal(row.result,null)
    assert.equal(ai.calls.length,2); assert.ok(!kb.writes().some(c=>c.includes('summary')))
  }
})

test('personal titles, uppercase surnames and compound or hyphenated names cannot inherit institutional exemptions', () => {
  for (const title of ['Mr','Mrs','Ms','Miss','Dr','Senator','Justice','Sir','Dame','Professor','Prof']) {
    for (const name of ['Zelara Quenwick','QUENWICK','Zelara de la Quenwick','ZELARA-DE-LA QUENWICK','Zelara Justice','Quenwick-Navy']) {
      assert.equal(hasNewPersonalName(`Thanked ${title} ${name} for assistance.`,''),true)
      assert.equal(hasNewPersonalName(`Thanked ${title} ${name} for assistance.`,`${title} ${name} attended.`),false)
    }
  }
  assert.equal(hasNewPersonalName('QUENWICK said that services needed support.',''),true)
  assert.equal(hasNewPersonalName('Thanked Quenwick for support from the Royal Australian Navy.',''),true)
})

test('review place and organisation controls pass without source support', () => {
  for(const reference of ['Port Hedland','Cape Town','Royal Australian Navy','Mount Isa','Lake Eyre','River Murray','Department of Foreign Affairs','Department of Health and Aged Care','Royal Australian Air Force']) {
    assert.equal(hasNewPersonalName(`Reported concerns about ${reference} and regional services.`,''),false)
  }
})

test('saved non-historic writes do not read full resources even under backpressure', async () => {
  const kb=new FakeKb(); kb.add('r1',{texts:{body:speechText()}})
  kb.getResource=async()=>{throw new Error('unexpected full resource read')}
  await writeItem(kb,'r1',{task:'speech_summary',force:false,value:GOOD_SUMMARY})
  await writeItem(kb,'r1',{task:'speech_topics',force:false,value:['housing']})
  assert.ok(!kb.calls.some(c=>c.startsWith('GET full')))
})

test('all-uppercase roster names and honorifics retain roster support', () => {
  const full=roster.names.split('\n').find(n=>/^[a-z]+ [a-z]+$/.test(n))!
  assert.equal(hasNewPersonalName(`Asked MR ${full.toUpperCase()} for assistance.`,''),false)
  assert.equal(hasNewPersonalName('Asked MR ZELARA QUENWICK for assistance.',''),true)
  for(const reference of ['General Bill','Justice Zelara Quenwick Act','Dr Zelara Navy','Ms Zelara Council']) assert.equal(hasNewPersonalName(`Asked ${reference} for assistance.`,''),true)
})

test('bare surnames in personal and possessive positions are checked', () => {
  for(const summary of ['Welcomed Quenwick to the discussion.','Quenwick was asked to give evidence.',"Quenwick's proposal called for better services.",'Thanked Quenwick-Zelara for assistance.']) assert.equal(hasNewPersonalName(summary,''),true)
})

test('historic write guard reuses the full text already read by the worker', async () => {
  const kb=new FakeKb();hist(kb)
  const known=await kb.getResource('r1')
  kb.getResource=async()=>{throw new Error('unexpected additional read')}
  await writeItem(kb,'r1',{task:'speech_summary',force:false,value:GOOD_SUMMARY},known!)
  await writeItem(kb,'r1',{task:'speech_topics',force:false,value:['housing']},known!)
  assert.equal(kb.calls.filter(c=>c.startsWith('GET full')).length,1)
})

test('historic canary name failures discard saved results and preserve the one-escalation allowance', async () => {
  const {runCanary}=await import('../src/canary.ts')
  for(const rejectedBefore of [false,true]) {
    const kb=new FakeKb();hist(kb)
    const {d1,raw}=makeD1()
    await enqueue(d1,[{rid:'r1',task:'speech_summary',priority:0}],1)
    await finishRows(d1,[{rid:'r1',task:'speech_summary',status:'done',outcome:'dry',result:badSummary,namesRejected:rejectedBefore}],2)
    const result=await runCanary({db:d1,kb,now:()=>3,settle:async()=>{}},['r1'])
    assert.equal(result.allClean,false)
    const row=rows(raw,'SELECT * FROM queue')[0]
    assert.equal(row.status,rejectedBefore?'done':'pending')
    assert.equal(row.terminal_reason,rejectedBefore?'rejected-names':null)
    assert.equal(row.names_rejected,1);assert.equal(row.result,null)
    assert.ok(!kb.calls.some(c=>c.startsWith('GET full')))
    assert.deepEqual(kb.writes(),[])
  }
})

test('bare offices and uppercase procedural titles stay distinct from titled people', () => {
  for(const summary of ['Treasurer said services needed support.','Minister argued for regional services.','MR SPEAKER called for order.','Mr SPEAKER called for order.','Discussed concerns raised by the Deputy Treasurer.']) assert.equal(hasNewPersonalName(summary,''),false)
  assert.equal(hasNewPersonalName('MR SPEAKER ZELARA QUENWICK called for order.',''),true)
})
