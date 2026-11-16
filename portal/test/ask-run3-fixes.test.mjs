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
  "export {NO_SUPPORTED_ANSWER, MACHINE_LABELS, unescapedQuotes, withoutGivenFactLabels} from './src/research-evidence'",
  "export {ASK_SELF_REFERENCE_RULE} from './src/ask-writing-rules'",
  "export {writingFacts, writingPrompt, verifyWrittenAnswer, draftWrittenAnswer, TRANSCRIPT_COVERAGE_RULE} from './src/research-writing'",
  "export {createAnswerWriter} from './src/research-writer'",
  "export {createResearch, NO_EXCERPT_HELD, NO_EXCERPT_YET} from './src/research-loop'",
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

test('the writer is asked to cover each transcript excerpt once, only when it is given one; its left-out sentences are counted by reason', async () => {
  // Run 4a: the writer was handed a median of 9 facts and cited 6. Its contract said "under 180 words", written for a
  // writer that only added to the research model's own points, which no longer word hearing evidence.
  assert.equal(api.TRANSCRIPT_COVERAGE_RULE, ' With hearing transcript excerpts among the facts the answer may run to 400 words: give each excerpt you are given one sentence of its own, once.')
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=15', label: text } }])
  const withExcerpt = JSON.parse(api.writingPrompt({ question: hearingQuestion, period, facts })).contract
  assert.ok(withExcerpt.includes('under 180 words unless a requested annual or monthly series needs more.' + api.TRANSCRIPT_COVERAGE_RULE))
  // No transcript fact: the contract is as it was.
  const grant = api.writingFacts(undefined, [{ id: 1, text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', cite: { kind: 'record', url: 'https://opax.test/grants/example', label: 'Example Health grant' } }])
  const plain = JSON.parse(api.writingPrompt({ question: 'Which grants did Example Health receive?', period, facts: grant })).contract
  assert.ok(plain.endsWith('under 180 words unless a requested annual or monthly series needs more.')); assert.equal(plain.includes('400 words'), false)
  // The count: one near-quotation of the transcript, one sentence said twice, one kept.
  const leftOut = {}
  const good = 'The transcript records: “The executive minute was prepared in the department and went to the committee in March.”'
  const out = api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [{ text: good, facts: [1] }, { text: good, facts: [1] }, { text: 'The transcript records that “the executive minute was prepared by the department and went to the committee in March”.', facts: [1] }] }, { question: hearingQuestion, period, facts }, leftOut)
  assert.equal(out.answer, good); assert.deepEqual(leftOut, { repeated: 1, transcript_quotation: 1 })
  // Through the writer, the count lands in the run's record (coherence.left_out), not in the answer.
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
  const model = new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text: JSON.stringify({ answer_decision: 'answer', sentences: [{ text: good, facts: [1] }, { text: 'The transcript records that “the executive minute was prepared by the department”.', facts: [1] }] }) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }) })
  const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }
  const written = await api.createAnswerWriter({ model, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, modelBudgetSpent: async () => false })({ question: hearingQuestion, period, facts }, stats, undefined, 20000)
  assert.equal(written.answer, good); assert.deepEqual(stats.coherence.left_out, { transcript_quotation: 1 })
  assert.doesNotMatch(JSON.stringify(written.answer), /left_out/)
})

test('the writer is not asked for a fact id in its prose, and its own "(fact N)" after a sentence is taken out; the same words in ordinary prose stay', async () => {
  // The gating run on 16 November: two answers showed "(fact 1)" to "(fact 8)" after every sentence. The coverage line
  // had asked for "its fact id", and the label strip leaves the parenthesised form alone as ordinary prose.
  assert.doesNotMatch(api.TRANSCRIPT_COVERAGE_RULE, /fact id/)
  const given = new Set([1, 2, 3])
  // The two answers' own text.
  assert.equal(api.withoutGivenFactLabels('The report concluded that "The Ombudsman was deliberately misled, thus providing further opportunity for the Government to resist scrutiny by using his report as a shield" (fact 1).', given),
    'The report concluded that "The Ombudsman was deliberately misled, thus providing further opportunity for the Government to resist scrutiny by using his report as a shield".')
  assert.equal(api.withoutGivenFactLabels('On hearing day 46 (10 March 2023), transcript page P-4951, the transcript records: "Were you aware at this time that the Ombudsman was investigating the Online Compliance Intervention program carried out by the Department?" (fact 2).', given),
    'On hearing day 46 (10 March 2023), transcript page P-4951, the transcript records: "Were you aware at this time that the Ombudsman was investigating the Online Compliance Intervention program carried out by the Department?"')
  assert.equal(api.withoutGivenFactLabels('At transcript page P-2940 the transcript reads: "...Do you recall having those allegations drawn to your attention?" (fact 1).', given), 'At transcript page P-2940 the transcript reads: "...Do you recall having those allegations drawn to your attention?"')
  assert.equal(api.withoutGivenFactLabels('The transcript records: “It went in March.” (facts 2 and 3)', given), 'The transcript records: “It went in March.”')
  assert.equal(api.withoutGivenFactLabels('The minute went to the committee in March. (fact 3)', given), 'The minute went to the committee in March.')
  // Ordinary prose: a number the writer was not given, or the words in the middle of a sentence.
  for (const prose of ['The report sets this out in its summary. (fact 7)', 'The submission lists three facts. (Facts 2 and 9) are disputed.', 'The second point (fact 2) was not disputed by the department.', 'It is a fact 2 of the three were late.'])
    assert.equal(api.withoutGivenFactLabels(prose, given), prose)
  assert.equal(api.withoutGivenFactLabels('The report sets this out in its summary. (fact 2)', new Set()), 'The report sets this out in its summary. (fact 2)')
  // Through the writer's checks: the answer comes out clean, verified and as a stopped draft alike, still cited.
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=15', label: text } }])
  const raw = { answer_decision: 'answer', sentences: [{ text: 'On hearing day 46 the transcript records: “The executive minute was prepared in the department and went to the committee in March.” (fact 1).', facts: [1] }, { text: 'An earlier review is described in the report. (fact 7)', facts: [] }] }
  const input = { question: hearingQuestion, period, facts }
  for (const out of [api.verifyWrittenAnswer(raw, input), api.draftWrittenAnswer(raw, input)]) {
    const [first, second] = out.answer.split('\n\n')
    assert.equal(first, 'On hearing day 46 the transcript records: “The executive minute was prepared in the department and went to the committee in March.”')
    assert.ok(second.startsWith('An earlier review is described in the report. (fact 7)'), second)
    assert.ok(Object.values(out.citations).flat().length >= 1)
  }
})

test('a hearing-evidence question with no excerpt held is told to search the transcript text with every lookup result, from the first round', async () => {
  // The gating run on 16 November: every word of "the 2015 budget measure and who prepared the executive minute" is too
  // common for the transcript word index, the model searched recommendations instead, and it first heard that an
  // excerpt was needed when its answer was refused in round 7 of 8.
  assert.equal(api.NO_EXCERPT_YET, 'This question asks what was said in evidence, and no hearing transcript excerpt is held yet. Search the transcript text now (royal_commissions view=transcripts with words). Everyday words are too common to match: search one rarer word from the subject by itself, then another, until excerpts come back. An answer needs at least one excerpt.')
  const asset = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'))
  const deps = { origin: 'https://offline.test', asset, kb: async () => ({ resources: {} }), generate: async () => ({ text: '{}' }) }
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
  const reply = (toolName, args) => ({ content: [{ type: 'tool-call', toolName, toolCallId: toolName + Math.random(), input: JSON.stringify(args) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] })
  const named = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
  const run = async question => {
    let call = 0
    // The recorded shape: words too common to match, then a recommendations search, then a rarer word, then the answer.
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++
      return call === 1 ? reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'executive minute' })
        : call === 2 ? reply('royal_commissions', { view: 'recommendations', commission: 'robodebt', words: 'Cabinet' })
        : call === 3 ? reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'averaging', limit: 1 })
        : call === 4 ? reply('answer', { facts: [] }) : { content: [{ type: 'text', text: 'not json' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } } })
    const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
    const out = await api.runAgentic(question, { ...deps, research }, async () => {}, 40000, undefined, {}, named)
    // What the model was shown before each of its calls.
    return { out, shown: model.doGenerateCalls.map(c => JSON.stringify(c.prompt)) }
  }
  const told = 'no hearing transcript excerpt is held yet. Search the transcript text now'
  const { out, shown } = await run('What evidence was given at the Robodebt Royal Commission about the 2015 budget measure and who prepared the executive minute?')
  assert.equal(shown[0].includes(told), false, 'nothing has been looked up yet')
  assert.ok(shown[1].includes(told), 'after the first lookup, which matched nothing')
  assert.ok(shown[2].split(told).length > shown[1].split(told).length, 'again after the recommendations lookup, which gives no excerpt')
  // Once an excerpt is held it is not said again, and the question is answered from the transcript.
  assert.equal(shown[3].split(told).length, shown[2].split(told).length, 'not said with the result that brought excerpts')
  assert.equal(out.answered, true); assert.match(out.answer, /transcript page/)
  // Another kind of question is never told this.
  const other = await run('What did the Robodebt Royal Commission recommend about debts?')
  assert.ok(other.shown.every(prompt => !prompt.includes(told)))
})
