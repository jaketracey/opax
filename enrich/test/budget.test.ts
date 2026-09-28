import assert from 'node:assert/strict'
import { test } from 'node:test'
import { budgetView, neuronsFor, nextUtcMidnight, parseBudget, priceFor, utcDay, FALLBACK_PRICE } from '../src/budget.ts'
import { readConfig } from '../src/env.ts'

const qwen = '@cf/qwen/qwen3-30b-a3b-fp8'

test('the platform-reported neurons figure wins', () => {
  assert.deepEqual(neuronsFor(qwen, { promptTokens: 23, completionTokens: 6, neurons: 0.289 }), { neurons: 0.289, source: 'reported' })
})

test('the price table reproduces what the platform reported (probe 2026-09-28: 23 in / 6 out = 0.2892 neurons)', () => {
  const cost = neuronsFor(qwen, { promptTokens: 23, completionTokens: 6, neurons: null })
  assert.equal(cost.source, 'computed')
  assert.ok(Math.abs(cost.neurons - 0.28921) < 0.0005, String(cost.neurons))
  // gpt-oss-120b: 84 in / 23 out = 4.2409 neurons on the platform
  const oss = neuronsFor('@cf/openai/gpt-oss-120b', { promptTokens: 84, completionTokens: 23, neurons: null })
  assert.ok(Math.abs(oss.neurons - 4.2409) < 0.001, String(oss.neurons))
})

test('with no usage block at all the cost is estimated from characters, never zero', () => {
  const cost = neuronsFor(qwen, { promptTokens: null, completionTokens: null, neurons: null }, 7000, 700)
  assert.equal(cost.source, 'estimated')
  assert.ok(cost.neurons > 0)
})

test('an unknown model is priced at the dearest tier, not as free', () => {
  assert.deepEqual(priceFor('@cf/some/new-model'), FALLBACK_PRICE)
  const cost = neuronsFor('@cf/some/new-model', { promptTokens: 1_000_000, completionTokens: 0, neurons: null })
  assert.equal(cost.neurons, FALLBACK_PRICE.input)
})

test('budget cutoff: exhausted exactly at the limit', () => {
  assert.equal(budgetView(399_999.9, 400_000).exhausted, false)
  assert.equal(budgetView(400_000, 400_000).exhausted, true)
  assert.equal(budgetView(500_000, 400_000).remaining, 0)
  assert.equal(budgetView(0, 0).exhausted, true)
})

test('parseBudget falls back on junk; readConfig defaults', () => {
  assert.equal(parseBudget('10000'), 10000)
  assert.equal(parseBudget('lots'), 400_000)
  assert.equal(parseBudget(undefined), 400_000)
  const cfg = readConfig({})
  assert.equal(cfg.live, false)
  assert.equal(cfg.primaryModel, '@cf/qwen/qwen3-30b-a3b-fp8')
  assert.equal(cfg.escalationModel, '@cf/openai/gpt-oss-120b')
  assert.equal(cfg.dailyBudget, 400_000)
})

test('only the exact string "live" ever enables writing; batch and concurrency are clamped', () => {
  for (const v of [undefined, '', 'dry', 'LIVE', 'true', '1', 'live ']) assert.equal(readConfig({ WRITE_MODE: v }).live, false, String(v))
  assert.equal(readConfig({ WRITE_MODE: 'live' }).live, true)
  assert.equal(readConfig({ BATCH_SIZE: '500' }).batchSize, 90)
  assert.equal(readConfig({ BATCH_SIZE: '0' }).batchSize, 1)
  assert.equal(readConfig({ CONCURRENCY: '50' }).concurrency, 6)
})

test('UTC day keys and the next reset', () => {
  const t = Date.parse('2026-09-28T23:59:59Z')
  assert.equal(utcDay(t), '2026-09-28')
  assert.equal(new Date(nextUtcMidnight(t)).toISOString(), '2026-09-29T00:00:00.000Z')
})
