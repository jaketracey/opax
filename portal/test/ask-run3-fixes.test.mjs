// Faults a blind read of a 20-question run found on 16 November 2026, each fixed without a check on model prose:
// an unsourced answer from the older engine on a hearing-evidence question, a visible backslash before a quotation
// mark, the model's own input labels in an answer, and answers that talk about themselves. No model call.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { MockLanguageModelV4 } from 'ai/test'

const built = await build({ stdin: { contents: [
  "export {quotedOrNothing, namesRegisteredCommission, hearingFallbackPayload} from './src/ask-hearing-fallback'",
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
  // Most questions about what an inquiry heard are not worded as "evidence at": the run's own state decides. A run
  // that called the commissions tool, or holds a transcript source, is covered; so is a question naming a commission.
  const called = { trail: [{ tool: 'royal_commissions', round: 1 }], sources: [] }
  assert.equal(api.quotedOrNothing('What did the hearings hear about duress alarms?'), false, 'wording alone does not catch it')
  assert.equal(api.quotedOrNothing('What did the hearings hear about duress alarms?', called), true)
  assert.equal(api.quotedOrNothing('What did the inquiry hear?', { trail: [], sources: [{ title: `A transcript. ${LABEL}.`, url: 'https://commission.example/a.pdf' }] }), true)
  assert.equal(api.quotedOrNothing('What did the Robodebt Royal Commission hear about who was told of the legal advice?'), true)
  // A parliamentary committee inquiry is Hansard, and a run that used only other tools is not covered.
  assert.equal(api.quotedOrNothing('Who gave evidence to the Senate committee inquiry into consulting services?', { trail: [{ tool: 'corpus_records' }, { tool: 'search' }], sources: [] }), false)
  assert.equal(api.quotedOrNothing('What happened with the Leppington Triangle purchase?', { trail: [{ tool: 'search' }], sources: [] }), false)
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
  // Every token form removed: only the forms the model's input uses.
  assert.equal(strip('The district paid the supplement [fact 1].'), 'The district paid the supplement.')
  assert.equal(strip('Two excerpts say so [facts 1, 2] and one does not [fact 3 and 4].'), 'Two excerpts say so and one does not.')
  assert.equal(strip('The transcript records a question about averaging” (fact id 3), and at page P-4716 another (fact id 4).'), 'The transcript records a question about averaging”, and at page P-4716 another.')
  assert.equal(strip('The excerpt (fact id fact-25/turn/1/t/body/0) says so.'), 'The excerpt says so.')
  assert.equal(strip('The words are at fact id fact-25/turn/1/t/body/0 in the record.'), 'The words are at in the record.')
  assert.equal(strip('It is recorded at fact-3/t/body/0, as quoted.'), 'It is recorded at, as quoted.')
  assert.equal(strip('It is recorded at fact-25/turn/1, as quoted.'), 'It is recorded at, as quoted.')
  // Ordinary text and real markers stay, including the forms an earlier version removed.
  for (const same of ['The fact that the minister knew is recorded.', 'In fact 3 of the 12 districts reported a deficit.', 'Fact 3 of the report is disputed.', 'The report says so [1].', 'A fact-finding mission reported in 2023.', 'The fact-check found 12 errors.',
    'The report lists seven facts; the last (fact 7) is disputed.', 'Two were agreed (Facts 2 and 3).', 'The post-fact-3 analysis changed nothing.', 'The post-fact-3/t/body/0 note is odd but not a label.', 'Section 3(2) (the fact provision) applies.', 'It cites fact-3 of the schedule.'])
    assert.equal(strip(same), same)
  // A sentence left with nothing that says anything once its labels are gone is dropped whole.
  assert.equal(strip('The board was told in March. See also [fact 1] and [fact 2].'), 'The board was told in March.')
  assert.equal(strip('See also [fact 1] and [fact 2]. The board was told in March.'), 'The board was told in March.')
  assert.equal(strip('- The board was told in March.\n- (fact id 2)\n- The district replied in April.'), '- The board was told in March.\n- The district replied in April.')
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
  assert.equal(api.ASK_SELF_REFERENCE_RULE, 'Write about the records only: leave out any mention of your own answer, your points, your search or yourself ("I", "my points", "as summarised earlier"). ')
  const contract = JSON.parse(api.writingPrompt({ question: 'What did the commission hear?', period, facts: [] })).contract
  assert.ok(contract.includes(api.ASK_SELF_REFERENCE_RULE))
})

test('the 20 transcript questions of the named-people eval are all covered by wording alone; the Hansard, donations and estimates controls are not', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/named-people-evals.json', import.meta.url), 'utf8'))
  const transcript = fixture.questions.filter(q => /^NP-(?:RBD|NSW)-/.test(q.id))
  assert.equal(transcript.length, 20)
  // Each names its commission or inquiry, so each is covered even when the run fails before any tool is called.
  assert.deepEqual(transcript.filter(q => !api.quotedOrNothing(q.question)).map(q => q.id), [])
  assert.deepEqual(transcript.filter(q => !api.namesRegisteredCommission(q.question) && !/royal commission/i.test(q.question)).map(q => q.id), [])
  // By state as well: any run that called the commissions tool.
  assert.ok(transcript.every(q => api.quotedOrNothing(q.question, { trail: [{ tool: 'royal_commissions' }], sources: [] })))
  // Controls that name no commission are not covered, with or without a run of other tools.
  for (const id of ['NP-CTRL-01', 'NP-CTRL-02', 'NP-CTRL-03', 'NP-CTRL-04', 'NP-CTRL-05']) for (const run of [undefined, { trail: [{ tool: 'corpus_records' }, { tool: 'money_totals' }], sources: [] }])
    assert.equal(api.quotedOrNothing(fixture.questions.find(q => q.id === id).question, run), false, id)  // All 27 questions of the fixture, as a table. The recommendation control and the mixed question name the Robodebt
  // Royal Commission, so they are covered too: if their loop fails they get held excerpts or the fixed line, never the
  // older engine's prose on a commission question. A loop that succeeds is not affected by this predicate at all.
  const covered = Object.fromEntries(fixture.questions.map(q => [q.id, api.quotedOrNothing(q.question)]))
  assert.equal(fixture.questions.length, 27)
  assert.deepEqual(Object.entries(covered).filter(([, yes]) => !yes).map(([id]) => id), ['NP-CTRL-01', 'NP-CTRL-02', 'NP-CTRL-03', 'NP-CTRL-04', 'NP-CTRL-05'])
  assert.equal(covered['NP-CTRL-06'], true); assert.equal(covered['NP-MIX-01'], true)
})

test('every registered commission is matched by its name and its aliases, as a whole phrase; a parliamentary inquiry is not', async () => {
  const registry = JSON.parse(await readFile(new URL('../../parli/ingest/royal_commissions.json', import.meta.url), 'utf8'))
  const names = JSON.parse(await readFile(new URL('../src/commission-names.json', import.meta.url), 'utf8'))
  // The Worker's list is the registry's: rebuilt by scripts/build_commission_names.mjs, and stale if this fails.
  const { commissionNames } = await import('../../scripts/build_commission_names.mjs')
  assert.deepEqual(names, await commissionNames(), 'run node scripts/build_commission_names.mjs')
  assert.equal(registry.commissions.length, names.commissions.length)
  for (const c of registry.commissions) for (const name of [c.name, ...(c.aliases ?? [])]) {
    assert.equal(api.namesRegisteredCommission(`What did the ${name} hear about funding?`), true, name)
    assert.equal(api.namesRegisteredCommission(`what did the ${name.toUpperCase()}, in 2024, hear?`), true, name)
  }
  // The three indexed commissions carry aliases; no other entry was given any, and no entry's other fields changed.
  assert.deepEqual(registry.commissions.filter(c => c.aliases).map(c => c.id).sort(), ['cth-antisemitism', 'cth-robodebt', 'nsw-healthcare-funding'])
  for (const phrase of ['What did the Healthcare Funding inquiry hear about locums?', 'What did the NSW Healthcare Funding inquiry hear?', 'What was said at the Robodebt Royal Commission?', 'What has the Antisemitism Royal Commission heard?'])
    assert.equal(api.namesRegisteredCommission(phrase), true, phrase)
  for (const phrase of ['What did the Senate inquiry hear about consulting?', 'Who gave evidence to the committee inquiry into consulting services?', 'Was there an inquiry into the scheme?', 'What did the funding inquiry of the Senate find?', 'What is healthcare funding in NSW?'])
    assert.equal(api.quotedOrNothing(phrase), false, phrase)
})
