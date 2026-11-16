// The source policy in the enrichment Worker: a withheld or non-quotable resource is never queued, never sent to
// a model and never written to. Each test adds an entry to a policy and asserts nothing gets through.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discover } from '../src/discover.ts'
import { enqueue } from '../src/db.ts'
import type { CatalogPage } from '../src/kb.ts'
import { POLICY, SourceWithheld, closedResource, policyKb } from '../src/policy.ts'
import { runTick } from '../src/tick.ts'
import { sourcePolicy } from '../../parli/ingest/source_policy.mjs'
import { FakeAi, FakeKb, GOOD_SUMMARY, makeD1, makeDeps, rows, speechText } from './helpers.ts'

const START = Date.parse('2026-10-13T00:00:00Z'), HOUR = 3600_000
const entry = (id: Record<string, string>, reason = 'publisher_request') => ({ ...id, reason, date: '2026-11-16' })
const policy = (withheld: unknown[] = [], sources: Record<string, Record<string, unknown>> = {}) => sourcePolicy({ schema: 2, sources, withheld })
const both = JSON.stringify({ summary: GOOD_SUMMARY, topics: ['housing'] })
/** The real client's catalog rows carry the slug; the shared fake's do not. */
class SlugKb extends FakeKb {
  async catalog(kind: string, since: string, page: number, size?: number, until?: string): Promise<CatalogPage> {
    const got = await super.catalog(kind, since, page, size, until)
    return { ...got, rows: got.rows.map(r => ({ ...r, slug: `speech-${r.rid}` })) }
  }
}
function box() {
  const kb = new SlugKb()
  for (const [rid, source] of [['open', 'nsw_hansard'], ['held', 'vic_hansard']] as const) {
    kb.add(rid, { texts: { body: speechText() }, classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: source }] })
    kb.catalogRows.push({ rid, kind: 'speech', created: new Date(START + 1000).toISOString() })
  }
  return kb
}
const CLOSED = {
  'a withheld source': policy([entry({ source: 'vic_hansard' }, 'legal_order')]),
  'a withheld document': policy([entry({ document: 'speech-held' })]),
  'a search-only source': policy([], { vic_hansard: { use: 'search_only' } }),
  'a documents-only source': policy([], { vic_hansard: { use: 'documents_only' } }),
  'a quote-and-cite source': policy([], { vic_hansard: { use: 'quote_and_cite', names: ['A Name For This Source'] } }),
  // Machine summaries and topic labels are off for a listed source, whatever its tier, until its record allows them.
  'a full source whose record does not say summaries: allowed': policy([], { vic_hansard: { use: 'full' } }),
}

test('a full source whose record says summaries: allowed is summarised and labelled as before', async () => {
  const allowed = policy([], { vic_hansard: { use: 'full', summaries: 'allowed' } })
  assert.equal(closedResource({ slug: 'speech-held', usermetadata: { classifications: [{ labelset: 'source', label: 'vic_hansard' }] } }, allowed), false)
  const kb = box(), guarded = policyKb(kb, allowed)
  assert.ok(await guarded.getResource('held'))
  await guarded.patchSummary('held', 'A brief.')
  assert.deepEqual(kb.writes(), ['PATCH summary held'])
})

test('the published policy withholds nothing', () => {
  assert.deepEqual(POLICY.withheldSources, [])
  assert.deepEqual(POLICY.withheldDocuments, [])
  assert.equal(closedResource({ slug: 'speech-1', usermetadata: { classifications: [{ labelset: 'source', label: 'openaustralia' }] } }), false)
})

for (const [name, closed] of Object.entries(CLOSED)) {
  test(`discovery never queues ${name}`, async () => {
    const { d1, raw } = makeD1(), kb = box()
    const out = await discover({ db: d1, kb, now: START + HOUR, startIso: new Date(START).toISOString(), maxPages: 6, overlapS: 120, policy: closed })
    assert.deepEqual(out.errors, [])
    assert.deepEqual([...new Set(rows(raw, 'SELECT rid FROM queue').map(r => r.rid))], ['open'])
  })

  test(`work already queued for ${name} reaches no model and writes nothing`, async () => {
    const kb = box(), ai = new FakeAi(() => both)
    const { deps, raw, d1 } = makeDeps({ kb, ai, env: { LIVE: 'true', DISCOVERY_ENABLED: 'false' } })
    await enqueue(d1, [{ rid: 'held', task: 'speech_summary', priority: 100 }, { rid: 'held', task: 'speech_topics', priority: 100 }], 1000)
    await runTick({ ...deps, kb: policyKb(kb, closed) })
    assert.equal(ai.calls.length, 0)
    assert.deepEqual(kb.writes(), [])
    assert.ok(rows(raw, "SELECT status, outcome FROM queue WHERE rid = 'held'").every(r => r.status === 'done' && r.outcome === 'missing'))
    // The same work for a resource the policy leaves open does reach the model, so the check above is not vacuous.
    await enqueue(d1, [{ rid: 'open', task: 'speech_summary', priority: 100 }, { rid: 'open', task: 'speech_topics', priority: 100 }], 2000)
    await runTick({ ...deps, kb: policyKb(kb, closed) })
    assert.ok(ai.calls.length > 0)
    assert.ok(ai.userPrompts().every(p => !p.includes('speech-held')))
  })

  test(`nothing can be written to ${name}, whether or not it was read first`, async () => {
    const kb = box(), guarded = policyKb(kb, closed)
    assert.equal(await guarded.getResource('held'), null)
    assert.equal(await guarded.getBasic('held'), null)
    assert.equal(await guarded.getEverything('held'), null)
    await assert.rejects(guarded.patchSummary('held', 'A brief.'), SourceWithheld)
    await assert.rejects(policyKb(kb, closed).patchClassifications('held', [{ labelset: 'topic', label: 'housing' }]), SourceWithheld)
    assert.deepEqual(kb.writes(), [])
    assert.ok(await guarded.getResource('open'))
    await guarded.patchSummary('open', 'A brief.')
    assert.deepEqual(kb.writes(), ['PATCH summary open'])
  })
}
