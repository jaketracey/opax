import test from 'node:test'
import assert from 'node:assert/strict'
import { runEval, spendOf } from '../../scripts/research_eval.mjs'

const questions = Array.from({ length: 6 }, (_, i) => ({ id: `cost-${i}`, question: 'Which party?', must: [] }))
const run = (fetchImpl, extra = {}) => runEval({ questions, modes: ['loop'], bases: { loop: 'http://localhost:8963', planner: 'http://localhost:8963' }, spendCap: 0.1, fetchImpl, ...extra })

test('reported costs settle requests without holding back the unknown-cost reserve', async () => {
  let calls = 0
  const { rows, report } = await run(async () => {
    calls++
    return Response.json({ answer: 'Labor.', research: { tokens: { input: 1e6, output: 1e6 }, cost_usd: '0.01' } })
  })
  assert.equal(calls, questions.length)
  assert.equal(rows.length, questions.length)
  assert.equal(report.stopped, null)
  assert.ok(Math.abs(report.spent_usd - 0.06) < 1e-12)
  assert.equal(report.spent_upper_estimate, report.spent_usd)
  assert.ok(rows.every(r => r.usage.cost_source === 'reported'))
})

test('reported cost on an HTTP or SSE error is charged, including explicit zero', async () => {
  const responses = [
    Response.json({ error: 'rate limited', research: { cost_usd: 0 } }, { status: 429 }),
    new Response('event: error\ndata: {"research":{"cost_usd":0.02}}\n\n', { headers: { 'content-type': 'text/event-stream' } }),
    Response.json({ error: 'billed failure', usage: { cost_usd: 0.08 } }, { status: 503 }),
  ]
  let calls = 0
  const { rows, report } = await run(async () => responses[calls++])
  assert.equal(calls, 3)
  assert.equal(rows.length, 3)
  assert.ok(rows.every(r => r.error && !r.grade))
  assert.equal(report.spent_usd, 0.1)
  assert.equal(report.stopped, 'spend_cap')
})

test('missing reported cost uses token estimates and unmetered errors use the reserve', async () => {
  let calls = 0
  const { rows, report } = await run(async () => ++calls === 1
    ? Response.json({ answer: 'Labor.', tokens: { input: 1000, output: 1000 } })
    : new Response('unavailable', { status: 503 }), { requestReserveUsd: 0.2 })
  assert.equal(calls, 2)
  assert.equal(rows[0].usage.cost_source, 'estimated')
  assert.ok(Math.abs(report.spent_usd - (0.2 + 0.00176)) < 1e-12)
  assert.equal(report.stopped, 'spend_cap')
})

test('a costly final request stops further calls in both-mode runs', async () => {
  let calls = 0
  const { rows, report } = await run(async () => {
    calls++
    return Response.json({ answer: 'Labor.', cost_usd: 0.11 })
  }, { modes: ['planner', 'loop'] })
  assert.equal(calls, 1)
  assert.equal(rows[0].mode, 'planner')
  assert.equal(report.spent_usd, 0.11)
  assert.equal(report.stopped, 'spend_cap')
})

test('invalid costs cannot refund the ledger; a reported zero is free', () => {
  for (const cost_usd of [NaN, Infinity, -1, null, undefined]) assert.equal(spendOf({ cost_usd }, 0.5), 0.5)
  assert.equal(spendOf({ cost_usd: 0 }), 0)
})
