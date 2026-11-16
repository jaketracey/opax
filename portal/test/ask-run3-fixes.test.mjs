// Faults a blind read of a 20-question run found on 16 November 2026, each fixed without a check on model prose:
// an unsourced answer from the older engine on a hearing-evidence question, a visible backslash before a quotation
// mark, the model's own input labels in an answer, and answers that talk about themselves. No model call.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { MockLanguageModelV4 } from 'ai/test'

const built = await build({ stdin: { contents: [
  "export {quotedOrNothing, hearingFallbackPayload} from './src/ask-hearing-fallback'",
  "export {groundAnswerPayload, withoutMachineLabels} from './src/research-grounding'",
  "export {NO_SUPPORTED_ANSWER, MACHINE_LABELS, unescapedQuotes} from './src/research-evidence'",
  "export {ASK_SELF_REFERENCE_RULE} from './src/ask-writing-rules'",
  "export {writingFacts, writingPrompt, verifyWrittenAnswer, draftWrittenAnswer} from './src/research-writing'",
  "export {createResearch, NO_EXCERPT_HELD} from './src/research-loop'",
  "export {runAgentic} from './src/agentic-ask'",
  "export {createResearchCreditCooldown} from './src/research-credit'",
  "export {callTool} from './src/tools/index'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('These tests must not make network requests') }
test.after(() => { globalThis.fetch = savedFetch })

const LABEL = 'Hearing transcript: evidence, not findings'
const period = { kind: 'all', label: 'All time' }
const excerpt = (page, words) => `Example Royal Commission, Transcript Hearing Day 46 (10 March 2023), transcript page ${page} (PDF page 15), hearing turn: "${words}" ${LABEL}. © Example, licensed under CC BY 4.0.`
const hearingQuestion = 'What evidence was given at the Example Royal Commission about the executive minute?'

test('a hearing-evidence question whose research ends without an answer never shows another engine\'s prose: held excerpts quoted by code, or one fixed line', () => {
  // The one predicate. Other questions keep their general-knowledge answers.
  assert.equal(api.quotedOrNothing(hearingQuestion), true)
  assert.equal(api.quotedOrNothing('Who decided to release the information, according to evidence at the Robodebt Royal Commission?'), true)
  assert.equal(api.quotedOrNothing('What happened with the Leppington Triangle purchase?'), false)
  assert.equal(api.quotedOrNothing('Which donors gave the most to the Liberal Party in 2022-23?'), false)
  // Research held two excerpts and some unrelated records.
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const other = excerpt('P-4900', 'Nobody raised the legal advice at that meeting.')
  const research = { mode: 'loop', failure: 'steps', rounds: 8, trail: [], sources: [
    { kind: 'record', title: text, url: 'https://commission.example/day46.pdf#page=15' },
    { kind: 'contract', title: 'Contract CN123 for debt collection services', url: 'https://opax.test/contracts/CN123' },
    { kind: 'record', title: 'A listing row', snippet: other, url: 'https://commission.example/day46.pdf#page=16' },
    { kind: 'record', title: text, url: 'https://commission.example/day46.pdf#page=15' },
  ] }
  const out = api.hearingFallbackPayload(hearingQuestion, research)
  assert.equal(out.answered, true); assert.equal(out.machine_written, false)
  assert.equal(out.answer, 'The hearing transcript records on hearing day 46 (10 March 2023): “The executive minute was prepared in the department and went to the committee in March.”\n\nThe hearing transcript records on hearing day 46 (10 March 2023): “Nobody raised the legal advice at that meeting.”')
  // Every line is a quotation of a held excerpt and is cited; nothing else is shown, and no unrelated record is a source.
  assert.ok(out.sources.length >= 2 && out.sources.every(s => `${s.snippet} ${s.title}`.includes(LABEL)))
  assert.ok(Object.values(out.citations).flat().length >= 2)
  assert.doesNotMatch(out.answer, /general knowledge|Searched records|Next useful lookup|Contract/i)
  // Nothing held: the fixed line, with no source and no citation. Never prose, never empty.
  for (const none of [undefined, { sources: [] }, { sources: [{ kind: 'contract', title: 'Contract CN123', url: 'https://opax.test/contracts/CN123' }] }]) {
    const fixed = api.hearingFallbackPayload(hearingQuestion, none)
    assert.equal(fixed.answer, api.NO_SUPPORTED_ANSWER); assert.equal(fixed.answer, 'OPAX cannot establish the requested answer from the selected records.')
    assert.deepEqual(fixed.citations, {}); assert.deepEqual(fixed.sources, []); assert.equal(fixed.answered, true); assert.equal(fixed.machine_written, false)
  }
})

test('the research model is told in fixed words why its answer to a hearing-evidence question was refused', async () => {
  assert.equal(api.NO_EXCERPT_HELD, 'no hearing transcript excerpt is held: search the transcript text with one or two specific words (royal_commissions view=transcripts with words), then answer')
  // A listing lookup (no words) gives rows with no excerpt; the answer call is refused and the next turn says why.
  const asset = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'))
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
  const reply = (toolName, args) => ({ content: [{ type: 'tool-call', toolName, toolCallId: toolName, input: JSON.stringify(args) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] })
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => { call++; return call === 1 ? reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', limit: 2 }) : call === 2 ? reply('answer', { points: [{ claim: 'The commission heard about the minute.' }] })
    : call === 3 ? reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 1 }) : reply('answer', { facts: [] }) } })
  const research = api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() })
  const q = 'What evidence was given at the Robodebt Royal Commission about income averaging?'
  const out = await api.runAgentic(q, { origin: 'https://offline.test', asset, research, kb: async () => ({ resources: {} }), generate: async () => ({ text: '{}' }) }, async () => {}, 40000, undefined, {}, { people: [], parties: [], bills: [], ambiguous: false, unresolved: false })
  const third = JSON.stringify(model.doGenerateCalls[2].prompt)
  assert.ok(third.includes('no hearing transcript excerpt is held: search the transcript text with one or two specific words'), 'the refusal reaches the model')
  // Once an excerpt is held, the answer is the excerpt as recorded.
  assert.equal(out.answered, true); assert.match(out.answer, /^The hearing transcript records on hearing day \d+ \(\d{1,2} [A-Z][a-z]+ \d{4}\): “/)
})

test('a backslash left before a quotation mark by over-escaped model output never reaches the reader', () => {
  assert.equal(api.unescapedQuotes('the word used in the documents is \\"cleared\\" by the minister'), 'the word used in the documents is "cleared" by the minister')
  assert.equal(api.unescapedQuotes('is”cleared\\" and \\\\"again\\\\”'), 'is”cleared" and "again”')
  assert.equal(api.unescapedQuotes('a path C:\\Users and 3 \\ 4 are untouched'), 'a path C:\\Users and 3 \\ 4 are untouched')
  // Through the writer's own reading of its sentences, with an excerpt that itself holds quotation marks.
  const text = excerpt('P-4899', 'The proposal was approved - the word used in the documents is "cleared" - by the minister.')
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=15', label: text } }])
  const raw = { answer_decision: 'answer', sentences: [{ text: 'The transcript records that the proposal was approved, and that the word used in the documents is \\"cleared\\".', facts: [1] }] }
  for (const out of [api.verifyWrittenAnswer(raw, { question: hearingQuestion, period, facts }), api.draftWrittenAnswer(raw, { question: hearingQuestion, period, facts })]) {
    assert.ok(out.answer.includes('is "cleared".') || out.answer.includes('is “cleared”.'), out.answer); assert.doesNotMatch(out.answer, /\\/)
  }
})

test('the model\'s echoed input labels are taken out of every answer, with citations kept in step; ordinary wording is untouched', () => {
  const strip = answer => api.withoutMachineLabels({ answer }).answer
  // Every token form removed.
  assert.equal(strip('The district paid the supplement [fact 1].'), 'The district paid the supplement.')
  assert.equal(strip('The district paid the supplement (fact 3) in 2024.'), 'The district paid the supplement in 2024.')
  assert.equal(strip('Two excerpts say so [facts 1, 2] and one does not (facts 3 and 4).'), 'Two excerpts say so and one does not.')
  assert.equal(strip('The excerpt (fact id fact-25/turn/1/t/body/0) says so.'), 'The excerpt says so.')
  assert.equal(strip('See fact id fact-25/turn/1/t/body/0 for the words.'), 'See for the words.')
  assert.equal(strip('It is recorded at fact-3/t/body/0.'), 'It is recorded at.')
  assert.equal(strip('It is recorded at fact-25/turn/1, as quoted.'), 'It is recorded at, as quoted.')
  // Ordinary text and real markers stay.
  for (const same of ['The fact that the minister knew is recorded.', 'In fact 3 of the 12 districts reported a deficit.', 'Fact 3 of the report is disputed.', 'The report says so [1].', 'A fact-finding mission reported in 2023.', 'The fact-check found 12 errors.', 'Section 3(2) (the fact provision) applies.'])
    assert.equal(strip(same), same)
  // Citation ranges still cover the same words after a label goes.
  const answer = 'The district paid the supplement [fact 1]. The board was told in March.', second = 'The board was told in March.'
  const at = Array.from(answer).length - Array.from(second).length
  const out = api.withoutMachineLabels({ answer, citations: { 'fact-1/t/body/0': [[0, 41]], 'fact-2/t/body/0': [[at, Array.from(answer).length]] }, sources: [{ resource: 'fact-1', cited: true }, { resource: 'fact-2', cited: true }] })
  assert.equal(out.answer, 'The district paid the supplement. The board was told in March.')
  const [[a, b]] = out.citations['fact-2/t/body/0']
  assert.equal(Array.from(out.answer).slice(a, b).join(''), second)
  // The final check applies it to an answer the research model or the writer wrote.
  const grounded = api.groundAnswerPayload({ answered: true, answer: 'The board was told in March [fact 2].', answer_decision: 'answer', research: { mode: 'loop' }, citations: {}, sources: [] }, 'What was the board told?')
  assert.equal(grounded.answer, 'The board was told in March.')
})

test('every call that writes prose is told to write about the records, not about itself', () => {
  assert.equal(api.ASK_SELF_REFERENCE_RULE, 'Write about the records only: leave out any mention of your own answer, your points, your search or yourself ("I", "my", "above", "as summarised earlier"). ')
  const contract = JSON.parse(api.writingPrompt({ question: 'What did the commission hear?', period, facts: [] })).contract
  assert.ok(contract.includes(api.ASK_SELF_REFERENCE_RULE))
})
