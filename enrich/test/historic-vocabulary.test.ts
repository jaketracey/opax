import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generate } from '../src/generate.ts'
import { OFFICE_KEYS, allowedHistoricTerm, hasNewPersonalName } from '../src/validate.ts'
import { FakeAi, GOOD_SUMMARY, speechText } from './helpers.ts'

test('whole acronyms of two to six capitals pass without permitting compound personal names', () => {
  for (const term of ['UN', 'ABC', 'OECD', 'CSIRO', 'UNESCO']) assert.equal(allowedHistoricTerm(term), true)
  for (const term of ['V', 'VAELQUIST', 'ZELARA QUENWICK', 'ABC Vaelquist', 'Vaelquist ABC']) assert.equal(allowedHistoricTerm(term), false)
})

test('reviewed offices pass whole, and an attached name always fails', () => {
  for (const key of OFFICE_KEYS) {
    const office = key.replace(/\b[a-z]/g, s => s.toUpperCase())
    assert.equal(allowedHistoricTerm(office), true)
    assert.equal(hasNewPersonalName(`Reported concerns about ${office} Vaelquist and services.`, ''), true)
  }
  for (const office of ['Prime Minister', 'Deputy Leader of the Opposition', 'Attorney-General', 'Minister for Foreign Affairs']) {
    assert.equal(hasNewPersonalName(`Reported concerns about ${office} and services.`, ''), false)
  }
})

test('gazetteered country and nationality terms pass whole without becoming geographic prefixes', () => {
  for (const term of ['United States', 'Indonesian', 'Indonesia', 'South Korean', 'New Caledonia', 'New Zealand']) {
    assert.equal(hasNewPersonalName(`Reported concerns about ${term} and services.`, ''), false)
    assert.equal(hasNewPersonalName(`Reported concerns about ${term} Vaelquist and services.`, ''), true)
  }
  for (const term of ['Vaelquist', 'Arvella Street', 'River Vaelquist', 'Justice Zelara Justice']) {
    assert.equal(hasNewPersonalName(`Thanked ${term} for supporting regional services.`, ''), true)
  }
})

test('dictionary words pass alone; dictionary surnames are an accepted residual, compound names remain guarded', () => {
  for (const term of ['Budget', 'Schools', 'Acknowledged', 'Criticised', 'Street', 'River', 'Rose']) assert.equal(allowedHistoricTerm(term), true)
  for (const term of ['Vaelquist Street', 'Arvella Street', 'River Vaelquist', 'Rose Vaelquist', 'Rose Street', 'Government Department']) assert.equal(allowedHistoricTerm(term), false)
})

test('corrective prompt lists offending terms only in transient model input; diagnostics remain redacted', async () => {
  const summary = 'Thanked Arvella Street and River Vaelquist for supporting regional housing and better local services.'
  const ai = new FakeAi(({ n }) => JSON.stringify({ summary: n ? GOOD_SUMMARY : summary, topics: [] }))
  const diagnostics: unknown[] = []
  const result = await generate({
    ai, record: { rid: 'invented-rid', title: '', kind: 'speech', words: 100, text: speechText(), historic: true },
    tasks: ['summary'], primaryModel: 'primary', escalationModel: 'escalation', maxTokens: 100,
    mayContinue: () => true, onSpend: async () => {}, onReject: async info => { diagnostics.push(info) },
  })
  assert.equal(ai.calls.length, 2)
  const prompt = ai.userPrompts()[1]
  assert.ok(prompt.includes('Arvella Street'))
  assert.ok(prompt.includes('River Vaelquist'))
  assert.ok(prompt.includes('Rewrite the brief without them'))
  assert.equal(result.results.summary?.value, GOOD_SUMMARY)
  for (const data of [diagnostics, result.results.summary?.complaints]) {
    assert.ok(!JSON.stringify(data).includes('Arvella'))
    assert.ok(!JSON.stringify(data).includes('Vaelquist'))
  }
})
