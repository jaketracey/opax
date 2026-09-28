import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffResources, parseCanaryBody, runCanary } from '../src/canary.ts'
import { enqueue, finishRows } from '../src/db.ts'
import { FakeKb, GOOD_SUMMARY, KbBackpressure, makeD1, rows, speechText } from './helpers.ts'

const RID = 'a'.repeat(32)
const RID2 = 'b'.repeat(32)

async function storeDry(d1: D1Database, rid: string, summary: string | null, topics: string[] | null) {
  const work = [
    ...(summary !== null ? [{ rid, task: 'speech_summary' as const, priority: 100 }] : []),
    ...(topics !== null ? [{ rid, task: 'speech_topics' as const, priority: 100 }] : []),
  ]
  await enqueue(d1, work, 1)
  await finishRows(
    d1,
    [
      ...(summary !== null ? [{ rid, task: 'speech_summary', status: 'done' as const, outcome: 'dry' as const, result: summary, model: 'm' }] : []),
      ...(topics !== null ? [{ rid, task: 'speech_topics', status: 'done' as const, outcome: topics.length ? ('dry' as const) : ('empty' as const), result: JSON.stringify(topics), model: 'm' }] : []),
    ],
    2,
  )
}

const deps = (kb: FakeKb, d1: D1Database) => ({ db: d1, kb, now: () => 1000, settle: async () => {} })

test('canary: a topic + brief write changes ONLY the new topic labels and the brief field', async () => {
  const kb = new FakeKb()
  kb.add(RID, { texts: { body: speechText() } })
  const { d1, raw } = makeD1()
  await storeDry(d1, RID, GOOD_SUMMARY, ['housing', 'welfare-social'])
  const out = await runCanary(deps(kb, d1), [RID])
  const r = out.results[0]
  assert.equal(r.status, 'written')
  assert.deepEqual(r.writes.map((w) => `${w.task}:${w.outcome}`).sort(), ['speech_summary:written', 'speech_topics:written'])
  assert.deepEqual(r.diff!.classifications, { added: ['topic/housing', 'topic/welfare-social'], removed: [] })
  assert.deepEqual(r.diff!.unexpected, [], 'nothing else moved')
  assert.equal(r.clean, true)
  assert.ok(r.diff!.expected.includes('data.texts.da-summary-t-body.value.body'))
  assert.equal(out.allClean, true)
  assert.equal(kb.resources.get(RID)!.texts['da-summary-t-body'], GOOD_SUMMARY)
  // the queue records the write
  assert.deepEqual(rows(raw, 'SELECT outcome FROM queue ORDER BY task').map((x) => x.outcome), ['written', 'written'])
  // before/after are returned in full for the record
  assert.ok((r.before as any).data.texts.body)
  assert.ok((r.after as any).data.texts['da-summary-t-body'])
})

test('canary: the diff catches any other movement (a dropped label, a changed title, a changed origin)', () => {
  const before = { title: 'T', origin: { collaborators: ['A'] }, usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'party', label: 'labor' }] }, data: { texts: { body: { value: { body: 'x' } } } }, modified: 1, last_seqid: 4 }
  const after = { title: 'T2', origin: { collaborators: ['A', 'B'] }, usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'topic', label: 'health' }] }, data: { texts: { body: { value: { body: 'x' } }, 'da-summary-t-body': { value: { body: 'brief', format: 'PLAIN' } } } }, modified: 2, last_seqid: 5 }
  const d = diffResources(before, after)
  assert.deepEqual(d.classifications, { added: ['topic/health'], removed: ['party/labor'] })
  assert.deepEqual(d.volatile.sort(), ['last_seqid', 'modified'])
  assert.ok(d.unexpected.includes('usermetadata.classifications - party/labor'))
  assert.ok(d.unexpected.includes('title'))
  assert.ok(d.unexpected.includes('origin.collaborators[1]'))
  assert.ok(d.expected.includes('usermetadata.classifications + topic/health'))
  assert.ok(d.expected.includes('data.texts.da-summary-t-body.value.body'))
  assert.equal(d.unexpected.length, 3)
})

test('canary: a transient metadata.status flip (PROCESSED -> PENDING while the new field is processed) is volatile, not unexpected', () => {
  const d = diffResources({ metadata: { status: 'PROCESSED' }, title: 't' }, { metadata: { status: 'PENDING' }, title: 't' })
  assert.deepEqual([d.volatile, d.unexpected], [['metadata.status'], []])
})

test('canary: an identical resource has an empty diff; a non-topic label added is unexpected', () => {
  const r = { usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }] }, title: 't' }
  const same = diffResources(r, JSON.parse(JSON.stringify(r)))
  assert.deepEqual([same.expected, same.volatile, same.unexpected], [[], [], []])
  const extra = diffResources(r, { ...r, usermetadata: { classifications: [...r.usermetadata.classifications, { labelset: 'party', label: 'green' }] } })
  assert.deepEqual(extra.unexpected, ['usermetadata.classifications + party/green'])
})

test('canary: an existing brief right now wins over the stored result (re-checked at write time), and the resource is left otherwise untouched', async () => {
  const kb = new FakeKb()
  kb.add(RID, { texts: { body: speechText(), 'da-summary-t-body': 'A brief someone wrote meanwhile, long enough to count.' } })
  const { d1 } = makeD1()
  await storeDry(d1, RID, GOOD_SUMMARY, ['housing'])
  const out = await runCanary(deps(kb, d1), [RID])
  assert.deepEqual(out.results[0].writes.map((w) => `${w.task}:${w.outcome}`).sort(), ['speech_summary:skipped-existing', 'speech_topics:written'])
  assert.equal(kb.resources.get(RID)!.texts['da-summary-t-body'], 'A brief someone wrote meanwhile, long enough to count.')
  assert.equal(out.results[0].clean, true)
})

test('canary: only rows finished in dry mode can be canaried; nothing is regenerated', async () => {
  const kb = new FakeKb()
  kb.add(RID, { texts: { body: speechText() } })
  kb.add(RID2, { texts: { body: speechText() } })
  const { d1 } = makeD1()
  await enqueue(d1, [{ rid: RID2, task: 'speech_summary', priority: 100 }], 1) // still pending: no stored result
  const out = await runCanary(deps(kb, d1), [RID, RID2])
  assert.deepEqual(out.results.map((r) => r.status), ['skipped', 'skipped'])
  assert.deepEqual(kb.writes(), [])
  assert.deepEqual(kb.calls, [], 'not even a read')
})

test('canary: an empty topic verdict makes no write; the box pushing back stops the whole canary', async () => {
  const kb = new FakeKb()
  kb.add(RID, { texts: { body: speechText() } })
  kb.add(RID2, { texts: { body: speechText() } })
  const { d1 } = makeD1()
  await storeDry(d1, RID, null, [])
  const empty = await runCanary(deps(kb, d1), [RID])
  assert.equal(empty.results[0].status, 'skipped')
  assert.deepEqual(kb.writes(), [])

  await storeDry(d1, RID2, GOOD_SUMMARY, ['housing'])
  kb.failWrites = new KbBackpressure('429', 429, 30)
  const out = await runCanary(deps(kb, d1), [RID2, RID])
  assert.equal(out.results[0].status, 'error')
  assert.equal(out.results.length, 1, 'stopped after the first backpressure')
  assert.equal(out.allClean, false)
})

test('canary body: at most ten distinct 32-hex rids', () => {
  assert.deepEqual(parseCanaryBody({ rids: [RID, RID] }), { rids: [RID] })
  assert.ok('error' in parseCanaryBody({ rids: [] }))
  assert.ok('error' in parseCanaryBody({}))
  assert.ok('error' in parseCanaryBody(null))
  assert.ok('error' in parseCanaryBody({ rids: ['nope'] }))
  assert.ok('error' in parseCanaryBody({ rids: ["' OR 1=1 --"] }))
  assert.ok('error' in parseCanaryBody({ rids: Array.from({ length: 11 }, (_, i) => `${i}`.padStart(32, 'a').replace(/[^a-f0-9]/g, 'a')) }))
  assert.equal((parseCanaryBody({ rids: Array.from({ length: 10 }, (_, i) => String(i).repeat(32).slice(0, 32)) }) as any).rids.length, 10)
})
