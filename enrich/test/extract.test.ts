import assert from 'node:assert/strict'
import { test } from 'node:test'
import { balancedObjects, extractJsonObject, readModelReply, readUsage } from '../src/extract.ts'

test('plain JSON', () => {
  assert.deepEqual(extractJsonObject('{"summary": "x", "topics": ["health"]}'), { summary: 'x', topics: ['health'] })
})

test('JSON in a code fence with prose around it', () => {
  const raw = 'Sure! Here is the result:\n```json\n{"summary": "Asked about roads.", "topics": []}\n```\nHope that helps.'
  assert.deepEqual(extractJsonObject(raw), { summary: 'Asked about roads.', topics: [] })
})

test('JSON buried in prose (no fence)', () => {
  const raw = 'The answer is {"topics": ["housing"]} as requested.'
  assert.deepEqual(extractJsonObject(raw, ['topics']), { topics: ['housing'] })
})

test('<think> blocks are ignored, including braces inside them', () => {
  const raw = '<think>Maybe {"summary": "draft"} or something else {</think>\n{"summary": "final answer here", "topics": ["health"]}'
  assert.deepEqual(extractJsonObject(raw), { summary: 'final answer here', topics: ['health'] })
})

test('a thinking model that states its answer last: the last object with the wanted keys wins', () => {
  const raw = 'Draft: {"summary": "first try", "topics": []}. On reflection: {"summary": "second try", "topics": ["health"]}'
  assert.deepEqual(extractJsonObject(raw), { summary: 'second try', topics: ['health'] })
})

test('braces and escaped quotes inside strings do not break the scan', () => {
  const raw = 'Result: {"summary": "Said \\"yes\\" to {the} plan", "topics": []} done'
  assert.deepEqual(extractJsonObject(raw), { summary: 'Said "yes" to {the} plan', topics: [] })
})

test('a wrapper object is unwrapped', () => {
  assert.deepEqual(extractJsonObject('{"result": {"summary": "s", "topics": []}}'), { summary: 's', topics: [] })
})

test('an object without the wanted keys is returned only as a last resort; garbage is null', () => {
  assert.deepEqual(extractJsonObject('{"ok": true}'), { ok: true })
  assert.equal(extractJsonObject('no json here'), null)
  assert.equal(extractJsonObject(''), null)
  assert.equal(extractJsonObject('[1,2,3]'), null)
  assert.equal(extractJsonObject('{"summary": "cut off'), null)
})

test('balancedObjects finds top-level spans only', () => {
  assert.deepEqual(balancedObjects('a {"x": {"y": 1}} b {"z": 2}'), ['{"x": {"y": 1}}', '{"z": 2}'])
})

// ---------------------------------------------------------------- reading the response

test('chat completion: content first, with usage and the platform neurons figure', () => {
  const reply = readModelReply({
    choices: [{ finish_reason: 'stop', message: { content: '{"topics": []}', reasoning: 'thinking...' } }],
    usage: { prompt_tokens: 84, completion_tokens: 23, neurons: 4.24 },
  })
  assert.equal(reply.text, '{"topics": []}')
  assert.equal(reply.fromReasoning, false)
  assert.equal(reply.finishReason, 'stop')
  assert.deepEqual(reply.usage, { promptTokens: 84, completionTokens: 23, neurons: 4.24 })
})

test('qwen3 with thinking off: content is null and the answer sits in the reasoning field', () => {
  const reply = readModelReply({
    choices: [{ finish_reason: 'stop', message: { content: null, reasoning: '{"summary": "s"}', reasoning_content: '{"summary": "s"}' } }],
    usage: { prompt_tokens: 23, completion_tokens: 6 },
  })
  assert.equal(reply.text, '{"summary": "s"}')
  assert.equal(reply.fromReasoning, true)
  assert.deepEqual(extractJsonObject(reply.text), { summary: 's' })
  assert.equal(reply.usage.neurons, null)
})

test('with allowReasoning=false the reasoning fields are ignored, even when content is empty (thinking-on runs)', () => {
  const thinking = { choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'Draft: {"summary": "a draft", "topics": ["health"]} but wait', reasoning_content: 'Draft: {"summary": "a draft", "topics": ["health"]} but wait' } }] }
  const strict = readModelReply(thinking, false)
  assert.equal(strict.text, '')
  assert.equal(strict.fromReasoning, false)
  assert.equal(extractJsonObject(strict.text), null)
  // the same response with reasoning allowed would have yielded the DRAFT
  assert.deepEqual(extractJsonObject(readModelReply(thinking).text), { summary: 'a draft', topics: ['health'] })
  // content, when present, is still used
  assert.equal(readModelReply({ choices: [{ message: { content: '{"a":1}', reasoning: 'x' } }] }, false).text, '{"a":1}')
  // Responses-API reasoning items are ignored too
  assert.equal(readModelReply({ output: [{ type: 'reasoning', content: [{ text: '{"a":1}' }] }] }, false).text, '')
})

test('a "reasoning" field is used only when content is empty', () => {
  const reply = readModelReply({ choices: [{ message: { content: '  ', reasoning: 'the answer {"topics": ["health"]}' } }] })
  assert.equal(reply.fromReasoning, true)
  assert.deepEqual(extractJsonObject(reply.text, ['topics']), { topics: ['health'] })
})

test('a truncated thinking run yields reasoning text with no JSON and finish_reason length', () => {
  const reply = readModelReply({ choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'Okay, the user wants...' } }] })
  assert.equal(reply.finishReason, 'length')
  assert.equal(extractJsonObject(reply.text), null)
})

test('legacy {response: "..."} and Responses-API output shapes', () => {
  assert.equal(readModelReply({ response: '{"a":1}' }).text, '{"a":1}')
  assert.deepEqual(readModelReply({ response: { summary: 'x' } }).text, '{"summary":"x"}')
  const responsesApi = {
    output: [
      { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'hmm' }] },
      { type: 'message', content: [{ type: 'output_text', text: '{"topics": []}' }] },
    ],
    usage: { input_tokens: 5, output_tokens: 7 },
  }
  const reply = readModelReply(responsesApi)
  assert.equal(reply.text, '{"topics": []}')
  assert.deepEqual(readUsage(responsesApi), { promptTokens: 5, completionTokens: 7, neurons: null })
})

test('content given as an array of parts', () => {
  assert.equal(readModelReply({ choices: [{ message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] } }] }).text, '{"a":1}')
})

test('null and junk responses give empty text, not an exception', () => {
  assert.equal(readModelReply(null).text, '')
  assert.equal(readModelReply({}).text, '')
  assert.equal(readModelReply('nope').text, '')
})
