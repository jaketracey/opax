import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clip, existingSummary, pickText, wordCount } from '../src/text.ts'

const field = (body: string) => ({ value: { body } })

test('the machine brief is never chosen as the text, even when it is the longest field', () => {
  const brief = 'A very long machine brief that runs on and on and on. '.repeat(50)
  const texts = { body: field('The speech itself, short.'), 'da-summary-t-body': field(brief) }
  assert.equal(pickText(texts), 'The speech itself, short.')
})

test('any field with "summary" in its name is excluded, in any case', () => {
  const texts = { Summary: field('x'.repeat(500)), 'ai-SUMMARY-copy': field('y'.repeat(600)), body: field('real text here') }
  assert.equal(pickText(texts), 'real text here')
})

test('the longest non-summary field wins', () => {
  const texts = { body: field('short'), 'body-2': field('a somewhat longer body'), 'da-summary-t-body': field('z'.repeat(1000)) }
  assert.equal(pickText(texts), 'a somewhat longer body')
})

test('a resource whose only text is the brief yields no text', () => {
  assert.equal(pickText({ 'da-summary-t-body': field('only a brief') }), '')
  assert.equal(pickText({}), '')
  assert.equal(pickText(undefined), '')
  assert.equal(pickText({ body: { value: null } }), '')
})

test('existingSummary reads the brief field and trims it', () => {
  assert.equal(existingSummary({ 'da-summary-t-body': field('  a brief  ') }), 'a brief')
  assert.equal(existingSummary({ body: field('x') }), '')
  assert.equal(existingSummary({ 'da-summary-t-body': field('   ') }), '')
})

test('clip keeps short text whole and collapses whitespace', () => {
  assert.equal(clip('a  b\n\nc'), 'a b c')
})

test('clip keeps the head and the tail of a very long text', () => {
  const long = `${'h'.repeat(12000)} ${'m'.repeat(20000)} ${'t'.repeat(1800)}`
  const out = clip(long)
  assert.ok(out.startsWith('h'.repeat(12000)))
  assert.ok(out.endsWith('t'.repeat(1800)))
  assert.ok(out.includes('[...]'))
  assert.ok(out.length < 14000)
})

test('wordCount', () => {
  assert.equal(wordCount(' one two  three '), 3)
  assert.equal(wordCount(''), 0)
})
