import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt, buildUserPrompt } from '../src/prompts.ts'
import { select, recordOf, enrichmentRequests, usageCost, blind, judgeRequests, validate, decode, upperCost } from '../scripts/bakeoff-lib.ts'

const unit = (id: number, length: number, year = '1993', chamber = 'senate', kind = 'speech') => ({ slug: `unit-${id}`, title: 'Record', texts: { body: { body: 'text '.repeat(Math.ceil(length / 5)) } }, extra: { metadata: { date: `${year}-01-01`, unit_kind: kind } }, usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'chamber', label: chamber }] } })
test('selection excludes thin text and preserves strata and short quota deterministically', () => {
  const rows = Array.from({ length: 500 }, (_, i) => unit(i, i < 10 ? 100 : i < 100 ? 400 : 1200, String(1993 + i % 4), i % 2 ? 'senate' : 'representatives', i % 3 ? 'speech' : 'question'))
  const picked = select(rows)
  assert.equal(picked.length, 200)
  assert.equal(new Set(picked.map(u => u.slug)).size, 200)
  assert.ok(picked.every(u => recordOf(u).text.length >= 200))
  assert.ok(picked.filter(u => recordOf(u).text.length < 600).length >= 40)
  assert.deepEqual(picked, select([...rows].reverse()))
})
test('requests use exact worker prompts, enum schema, cached instructions and disabled thinking', () => {
  const u = unit(1, 800), request = enrichmentRequests([u])[0]
  assert.equal(request.params.system[0].text, buildSystemPrompt(['summary', 'topics']))
  assert.equal(request.params.messages[0].content, buildUserPrompt(recordOf(u)))
  assert.equal(request.params.system[0].cache_control.ttl, '1h')
  assert.equal(request.params.thinking.type, 'disabled')
  assert.ok(request.params.output_config.format.schema.properties.topics.items.enum.includes('health'))
})
test('billed usage separates ordinary input, both cache writes, cache reads and output', () => {
  const cost = usageCost({ input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 600, cache_creation: { ephemeral_1h_input_tokens: 400, ephemeral_5m_input_tokens: 200 } })
  assert.ok(Math.abs(cost - 0.0001675) < 1e-12)
  assert.equal(usageCost({ input_tokens: 100001 }), 100001 * 0.25 / 1e6)
})
test('blind judge sees only source and candidates, without model identity, usage or key', () => {
  const units = Array.from({ length: 20 }, (_, i) => unit(i, 800))
  const h = new Map(units.map(u => [u.slug, { summary: 'candidate one', topics: [], model: 'hidden-haiku', usage: 100 }]))
  const q = new Map(units.map(u => [u.slug, { summary: 'candidate two', topics: ['health'], model: 'hidden-qwen', usage: 200 }]))
  const { pairs, key } = blind(units, h, q, 'offline-seed')
  assert.equal(key.filter(k => k.A === 'haiku').length, 10)
  const requests = JSON.stringify(judgeRequests(pairs))
  assert.ok(!requests.includes('hidden-'))
  for (const p of pairs) {
    assert.equal(Object.keys(p.A).sort().join(','), 'summary,topics')
    const mapping = key.find(k => k.id === p.id)!
    for (const position of ['A', 'B'] as const) assert.equal(p[position].summary, mapping[position] === 'haiku' ? 'candidate one' : 'candidate two')
  }
})
test('validator uses worker cleanup and rejects missing summary', () => {
  const u = unit(1, 800)
  assert.equal(validate({ summary: '', topics: [] }, u).valid, false)
})
test('batch refusals, empty responses, errors and billed usage survive decoding', () => {
  const refused = decode({ result: { type: 'succeeded', message: { stop_reason: 'refusal', content: [{ type: 'text', text: 'Declined' }], usage: { output_tokens: 12 } } } })
  assert.equal(refused.refusal, true)
  assert.equal(refused.empty, false)
  assert.equal(refused.cost, 0.000003)
  const failed = decode({ result: { type: 'errored', error: { type: 'invalid_request_error' } } })
  assert.equal(failed.error, 'errored')
  assert.equal(failed.empty, true)
  assert.equal(validate(refused, unit(1, 800)).valid, false)
})
test('preflight accounts for each full output cap and unshared input', () => {
  const requests = enrichmentRequests([unit(1, 800)])
  assert.ok(upperCost(requests) >= 512 * 0.25 / 1e6)
  assert.equal(upperCost([...requests, ...requests]), upperCost(requests) * 2)
})
