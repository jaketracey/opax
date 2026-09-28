import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildMessages, buildRecordMessage, buildSystemPrompt, buildUserPrompt, type PromptRecord } from '../src/prompts.ts'

const record: PromptRecord = { rid: 'abc', slug: 'speech-1', kind: 'speech', title: 'A B \u2014 Topic \u2014 2026-09-24', state: 'vic', party: null, words: 3, text: 'Some text \u2013 here.' }

test('the combined system prompt is byte-identical to the bake-off winner (scratchpad/bakeoff/prompt_system.txt)', () => {
  const golden = readFileSync(join(import.meta.dirname, 'fixtures', 'bakeoff_system.txt'), 'utf8')
  assert.equal(buildSystemPrompt(['summary', 'topics']), golden)
})

test('the record message is bake.build_user: "RECORD" then compact JSON in rid, slug, title, kind, state, party, words, text order', () => {
  assert.equal(
    buildRecordMessage(record),
    'RECORD\n{"rid":"abc","slug":"speech-1","title":"A B \u2014 Topic \u2014 2026-09-24","kind":"speech","state":"vic","party":null,"words":3,"text":"Some text \u2013 here."}',
  )
})

test('a single-task prompt asks for one key and only includes its own section', () => {
  const summary = buildSystemPrompt(['summary'])
  assert.ok(summary.includes('exactly one key: "summary"'))
  assert.ok(summary.includes('{"summary": "<one sentence>"}'))
  assert.ok(!summary.includes('TAXONOMY') && !summary.includes('TOPICS\n'))
  const topics = buildSystemPrompt(['topics'])
  assert.ok(topics.includes('exactly one key: "topics"'))
  assert.ok(topics.includes('TAXONOMY') && topics.includes('- gambling:'))
  assert.ok(!topics.includes('SUMMARY\nWrite a brief'))
})

test('complaints ride on the user message after the record, capped at twenty', () => {
  const user = buildUserPrompt(record, Array.from({ length: 25 }, (_, i) => `problem ${i}`))
  assert.ok(user.startsWith('RECORD\n'))
  assert.ok(user.includes('The previous attempt failed these checks. Rewrite every value and return the complete object:\n- problem 0'))
  assert.ok(user.includes('problem 19') && !user.includes('problem 20'))
  assert.equal(buildMessages(record, ['summary']).length, 2)
})
