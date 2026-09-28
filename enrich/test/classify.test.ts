import assert from 'node:assert/strict'
import { test } from 'node:test'
import { droppedNonTopicLabels, hasTopicLabels, mergeTopicClassifications, planTopicWrite, readClassifications } from '../src/classify.ts'
import { UnsafeWrite, writeItem, writeSummary, writeTopics } from '../src/write.ts'
import { FakeKb } from './helpers.ts'

const resource = (classifications: unknown[], field?: unknown[]) => ({
  usermetadata: { classifications },
  computedmetadata: { field_classifications: field ?? [] },
})

const FULL = [
  { labelset: 'kind', label: 'speech', cancelled_by_user: false },
  { labelset: 'source', label: 'vic_hansard', cancelled_by_user: false },
  { labelset: 'state', label: 'vic', cancelled_by_user: false },
  { labelset: 'party', label: 'labor', cancelled_by_user: false },
  { labelset: 'chamber', label: 'vic_la', cancelled_by_user: false },
  { labelset: 'decade', label: '2020s', cancelled_by_user: false },
]

test('merge keeps every non-topic label and appends the new topics (label_workers.cmd_submit)', () => {
  const merged = mergeTopicClassifications(readClassifications(resource(FULL)), ['housing', 'health'])
  assert.deepEqual(merged, [
    { labelset: 'kind', label: 'speech' },
    { labelset: 'source', label: 'vic_hansard' },
    { labelset: 'state', label: 'vic' },
    { labelset: 'party', label: 'labor' },
    { labelset: 'chamber', label: 'vic_la' },
    { labelset: 'decade', label: '2020s' },
    { labelset: 'topic', label: 'housing' },
    { labelset: 'topic', label: 'health' },
  ])
})

test('merge replaces any existing topic labels rather than adding to them', () => {
  const withTopic = [...FULL, { labelset: 'topic', label: 'gambling', cancelled_by_user: false }]
  const merged = mergeTopicClassifications(readClassifications(resource(withTopic)), ['education'])
  assert.deepEqual(merged.filter((c) => c.labelset === 'topic'), [{ labelset: 'topic', label: 'education' }])
  assert.equal(merged.length, FULL.length + 1)
})

test('a cancelled non-topic label keeps its flag (it is not resurrected)', () => {
  const cls = [...FULL, { labelset: 'party', label: 'green', cancelled_by_user: true }]
  const merged = mergeTopicClassifications(readClassifications(resource(cls)), ['health'])
  assert.deepEqual(merged.find((c) => c.label === 'green'), { labelset: 'party', label: 'green', cancelled_by_user: true })
})

test('property: for many shapes of existing labels, no non-topic label is ever dropped', () => {
  const sets = ['kind', 'source', 'state', 'party', 'chamber', 'decade', 'century', 'jurisdiction', 'topic']
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = 0; i < 300; i += 1) {
    const existing = Array.from({ length: Math.floor(rnd() * 9) }, () => ({
      labelset: sets[Math.floor(rnd() * sets.length)],
      label: `l${Math.floor(rnd() * 5)}`,
      cancelled_by_user: rnd() < 0.2,
    }))
    const topics = ['health', 'housing', 'education'].slice(0, Math.floor(rnd() * 4))
    const before = readClassifications(resource(existing))
    const merged = mergeTopicClassifications(before, topics)
    assert.deepEqual(droppedNonTopicLabels(before, merged), [])
    assert.deepEqual(merged.filter((c) => c.labelset === 'topic').map((c) => c.label), topics)
  }
})

test('an empty topic verdict writes nothing, even when forced', () => {
  assert.deepEqual(planTopicWrite(resource(FULL), [], false), { patch: null, reason: 'empty-verdict' })
  assert.deepEqual(planTopicWrite(resource(FULL), [], true), { patch: null, reason: 'empty-verdict' })
})

test('a resource that already has topic labels is skipped unless forced', () => {
  const labelled = resource([...FULL, { labelset: 'topic', label: 'health' }])
  assert.equal(planTopicWrite(labelled, ['housing'], false).reason, 'already-labelled')
  const forced = planTopicWrite(labelled, ['housing'], true)
  assert.equal(forced.reason, 'write')
  assert.deepEqual(forced.patch?.filter((c) => c.labelset === 'topic'), [{ labelset: 'topic', label: 'housing' }])
})

test('platform-labeler topics in computedmetadata.field_classifications count as already labelled', () => {
  const r = resource(FULL, [{ classifications: [{ labelset: 'topic', label: 'health' }] }])
  assert.equal(hasTopicLabels(r), true)
  assert.equal(planTopicWrite(r, ['housing'], false).reason, 'already-labelled')
  assert.equal(hasTopicLabels(resource(FULL)), false)
  assert.equal(hasTopicLabels(resource([{ labelset: 'topic', label: 'health', cancelled_by_user: true }])), false)
})

// ---------------------------------------------------------------- writes against the fake box

const item = (task: 'speech_topics' | 'speech_summary', value: string | string[], force = false) => ({ task, force, value })

test('writeTopics PATCHes the full merged list: nothing but the topic labelset changes', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text' } })
  const before = kb.resources.get('r1')!.classifications.map((c) => ({ ...c }))
  const out = await writeTopics(kb, 'r1', item('speech_topics', ['housing', 'health']))
  assert.equal(out.outcome, 'written')
  const after = kb.resources.get('r1')!.classifications
  assert.deepEqual(after.filter((c) => c.labelset !== 'topic'), before)
  assert.deepEqual(after.filter((c) => c.labelset === 'topic').map((c) => c.label), ['housing', 'health'])
})

test('writeTopics with an empty verdict makes no knowledge-box call at all', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text' } })
  const out = await writeTopics(kb, 'r1', item('speech_topics', []))
  assert.equal(out.outcome, 'empty')
  assert.deepEqual(kb.calls, [])
})

test('writeTopics leaves an already-labelled resource alone unless forced', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text' } })
  kb.resources.get('r1')!.classifications.push({ labelset: 'topic', label: 'gambling' })
  assert.equal((await writeTopics(kb, 'r1', item('speech_topics', ['housing']))).outcome, 'skipped-existing')
  assert.deepEqual(kb.writes(), [])
  assert.equal((await writeTopics(kb, 'r1', item('speech_topics', ['housing'], true))).outcome, 'written')
  assert.deepEqual(kb.resources.get('r1')!.classifications.filter((c) => c.labelset === 'topic'), [{ labelset: 'topic', label: 'housing' }])
})

test('writeTopics refuses to write when the read-back has no kind classification', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text' }, classifications: [{ labelset: 'party', label: 'labor' }] })
  await assert.rejects(writeTopics(kb, 'r1', item('speech_topics', ['housing'])), UnsafeWrite)
  assert.deepEqual(kb.writes(), [])
})

test('writeTopics repairs a box that dropped non-topic labels on write (read-back check)', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text' } })
  kb.dropOnWrite = 'party'
  kb.resources.get('r1')!.classifications.push({ labelset: 'party', label: 'labor' })
  const out = await writeTopics(kb, 'r1', item('speech_topics', ['health']))
  assert.equal(out.outcome, 'written')
  assert.ok(out.warning?.includes('party/labor'))
  assert.ok(kb.resources.get('r1')!.classifications.some((c) => c.labelset === 'party' && c.label === 'labor'))
})

test('writeTopics on a resource that has vanished reports missing', async () => {
  const kb = new FakeKb()
  assert.equal((await writeTopics(kb, 'gone', item('speech_topics', ['health']))).outcome, 'missing')
})

test('writeSummary writes only when no non-empty brief exists now, unless forced', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text' } })
  kb.add('r2', { texts: { body: 'text', 'da-summary-t-body': 'An existing brief.' } })
  assert.equal((await writeSummary(kb, 'r1', item('speech_summary', 'A new brief.'))).outcome, 'written')
  assert.equal(kb.resources.get('r1')!.texts['da-summary-t-body'], 'A new brief.')
  assert.equal((await writeSummary(kb, 'r2', item('speech_summary', 'A new brief.'))).outcome, 'skipped-existing')
  assert.equal(kb.resources.get('r2')!.texts['da-summary-t-body'], 'An existing brief.')
  assert.equal((await writeSummary(kb, 'r2', item('speech_summary', 'A forced brief.', true))).outcome, 'written')
  assert.equal(kb.resources.get('r2')!.texts['da-summary-t-body'], 'A forced brief.')
})

test('writeSummary treats a whitespace-only existing brief as empty and refuses an empty new one', async () => {
  const kb = new FakeKb()
  kb.add('r1', { texts: { body: 'text', 'da-summary-t-body': '   ' } })
  assert.equal((await writeSummary(kb, 'r1', item('speech_summary', 'Now there is one.'))).outcome, 'written')
  await assert.rejects(writeItem(kb, 'r1', item('speech_summary', '  ')), UnsafeWrite)
})
