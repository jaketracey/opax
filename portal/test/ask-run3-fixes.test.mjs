// Faults a blind read of a 20-question run found on 16 November 2026, each fixed without a check on model prose:
// an unsourced answer from the older engine on a hearing-evidence question, a visible backslash before a quotation
// mark, the model's own input labels in an answer, and answers that talk about themselves. No model call.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { MockLanguageModelV4 } from 'ai/test'
import { StreamingResearchModel } from './fixtures/research-scripted-model.mjs'

const built = await build({ stdin: { contents: [
  "export {quotedOrNothing, namesRegisteredCommission, hearingFallbackPayload} from './src/ask-hearing-fallback'",
  "export {groundAnswerPayload, withoutMachineLabels} from './src/research-grounding'",
  "export {NO_SUPPORTED_ANSWER, MACHINE_LABELS, unescapedQuotes, withoutGivenFactLabels, otherScript, withSourceEllipses, verifyResearchPoints, emptyTally} from './src/research-evidence'",
  "export {hearingEvidenceQuestion, commissionHearingQuestion, parliamentaryQuestion} from './src/transcript-answer'",
  "export {ASK_SELF_REFERENCE_RULE, ASK_ABSENCE_RULE} from './src/ask-writing-rules'",
  "export {writingFacts, writingPrompt, verifyWrittenAnswer, draftWrittenAnswer, TRANSCRIPT_COVERAGE_RULE} from './src/research-writing'",
  "export {createAnswerWriter, writtenSentences} from './src/research-writer'",
  "export {createResearch, NO_EXCERPT_HELD, NO_EXCERPT_YET, SEARCH_TRANSCRIPTS_FURTHER, BEARS_ON_RULE, bearsOn, replyAnswer} from './src/research-loop'",
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
  // that searched hearing transcripts (held_transcripts, empty when nothing quotable came back), or holds a transcript
  // source, is covered; so is a question naming a commission. A commissions lookup of another kind (a list, a
  // profile, recommendations) or an integrity report lookup is not enough.
  assert.equal(api.quotedOrNothing('What did the hearings hear about duress alarms?'), false, 'wording alone does not catch it')
  assert.equal(api.quotedOrNothing('What did the hearings hear about duress alarms?', { trail: [{ tool: 'royal_commissions', round: 1 }], sources: [], held_transcripts: [] }), true)
  assert.equal(api.quotedOrNothing('What did the hearings hear about duress alarms?', { trail: [{ tool: 'royal_commissions', round: 1 }, { tool: 'integrity_reports', round: 2 }], sources: [] }), false)
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
  assert.equal(api.ASK_SELF_REFERENCE_RULE, 'Write about the records only: leave out any mention of your own answer, your points, your search, the material you were given or yourself ("I", "my points", "as summarised earlier", "the excerpts provided here", "returned by the search"). ')
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
  assert.ok(transcript.every(q => api.quotedOrNothing(q.question, { trail: [{ tool: 'royal_commissions' }], sources: [], held_transcripts: [] })))
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
  assert.equal(api.TRANSCRIPT_COVERAGE_RULE, " With hearing transcript excerpts among the facts the answer may run to 300 words. Lead with the excerpts that answer the question, in the order of the question's parts: a fact's bears_on field gives the words of the question it was selected for. Give each excerpt you use one sentence, once, and leave out an excerpt that has no bearing on the question.")
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=15', label: text } }])
  const withExcerpt = JSON.parse(api.writingPrompt({ question: hearingQuestion, period, facts })).contract
  assert.ok(withExcerpt.includes('under 180 words unless a requested annual or monthly series needs more.' + api.TRANSCRIPT_COVERAGE_RULE))
  // No transcript fact: the contract is as it was.
  const grant = api.writingFacts(undefined, [{ id: 1, text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', cite: { kind: 'record', url: 'https://opax.test/grants/example', label: 'Example Health grant' } }])
  const plain = JSON.parse(api.writingPrompt({ question: 'Which grants did Example Health receive?', period, facts: grant })).contract
  assert.ok(plain.endsWith('under 180 words unless a requested annual or monthly series needs more.')); assert.equal(plain.includes('300 words'), false)
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
  const raw = { answer_decision: 'answer', sentences: [{ text: 'On hearing day 46 the transcript records: “The executive minute was prepared in the department and went to the committee in March.” (fact 1).', facts: [1] }, { text: 'An earlier review is described in the report. (fact 7)', facts: [1] }] }
  // (The second sentence cites the excerpt: on a hearing question an uncited sentence is left out whole.)
  const input = { question: hearingQuestion, period, facts }
  for (const out of [api.verifyWrittenAnswer(raw, input), api.draftWrittenAnswer(raw, input)]) {
    const [first, second] = out.answer.split('\n\n')
    assert.equal(first, 'On hearing day 46 the transcript records: “The executive minute was prepared in the department and went to the committee in March.”')
    assert.ok(second.startsWith('An earlier review is described in the report. (fact 7)'), second)
    assert.ok(Object.values(out.citations).flat().length >= 1)
  }
})

test('a hearing-evidence question with no excerpt held is told to search the transcript text with every lookup result, from the first round', async () => {
  // The gating run on 16 November: the model's transcript searches matched nothing (every word of the question was
  // then left out of the word index), it searched recommendations instead, and it first heard that an excerpt was
  // needed when its answer was refused in round 7 of 8.
  assert.equal(api.NO_EXCERPT_YET, 'This question asks what was said in evidence, and no hearing transcript excerpt is held yet. Search the transcript text now (royal_commissions view=transcripts with words): search the specific words or short phrases of the question, one search each, until excerpts come back. An answer needs at least one excerpt.')
  const asset = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'))
  const deps = { origin: 'https://offline.test', asset, kb: async () => ({ resources: {} }), generate: async () => ({ text: '{}' }) }
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
  const reply = (toolName, args) => ({ content: [{ type: 'tool-call', toolName, toolCallId: toolName + Math.random(), input: JSON.stringify(args) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] })
  const named = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
  const run = async question => {
    let call = 0
    // The recorded shape: a search that matches nothing, then a recommendations search, then one that does, then the answer.
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++
      return call === 1 ? reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'xylophonist' })
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

// ---- Delta review at 0fdfcdf3b and the blind read of 16 November 2026 ----
const usage0 = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
const says = text => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage: usage0, warnings: [] })
const calls = (toolName, args) => ({ content: [{ type: 'tool-call', toolName, toolCallId: toolName + Math.random(), input: JSON.stringify(args) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: usage0, warnings: [] })
const offline = { origin: 'https://offline.test', asset: async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')), kb: async () => ({ resources: {} }), generate: async () => ({ text: '{}' }) }
const nobody = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
const writerWith = model => api.createAnswerWriter({ model, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, modelBudgetSpent: async () => false })

test('a parliamentary inquiry in hearing-style wording is a Hansard question: it is not treated as commission evidence and falls back as on main', () => {
  const senate = 'What did witnesses tell the Senate inquiry into consulting services?'
  // Before: the bare word "inquiry" made this a hearing-evidence question, its Hansard point was refused and the reader
  // got the fixed line.
  assert.equal(api.hearingEvidenceQuestion(senate), false)
  for (const q of [senate, 'What evidence did the Senate Community Affairs committee hear about Centrelink debt recovery?', 'What did the parliamentary inquiry into the Optus outage hear from witnesses?', 'Who gave evidence at Senate estimates about Robodebt in 2023?',
    'Did Labor promise a royal commission into veterans suicide in Parliament?', 'What did the Senate inquiry into healthcare funding hear?']) {
    assert.equal(api.hearingEvidenceQuestion(q), false, q)
    for (const run of [undefined, { trail: [{ tool: 'corpus_records' }], sources: [] }, { trail: [{ tool: 'royal_commissions' }, { tool: 'integrity_reports' }], sources: [] }]) assert.equal(api.quotedOrNothing(q, run), false, q)
  }
  // A commission's own hearings are still covered, with a parliamentary word in the question or not.
  for (const q of ['What evidence was given at the Robodebt Royal Commission about income averaging?', 'What evidence was given at the Robodebt Royal Commission about what the Minister told Parliament?',
    'What did the Robodebt Royal Commission hear about income averaging, and what did the Minister for Government Services say in Parliament about the scheme?', 'What did the inquiry into healthcare funding hear about locums?', 'What did the Robodebt Royal Commission recommend?'])
    assert.equal(api.quotedOrNothing(q), true, q)
  assert.equal(api.hearingEvidenceQuestion('What evidence was given at the Robodebt Royal Commission about what the Minister told Parliament?'), true)
  // Any question whose run searched hearing transcripts is covered, whatever its wording.
  assert.equal(api.quotedOrNothing(senate, { trail: [], sources: [], held_transcripts: [] }), true)
})

test('held excerpts answer only a question about a hearing or its evidence; any other question that stops gets the fixed line', () => {
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const research = { mode: 'loop', failure: 'steps', rounds: 8, trail: [], sources: [], held_transcripts: [{ text, url: 'https://commission.example/day46.pdf#page=15' }] }
  // Before: four hearing excerpts were given as the answer to a question about recommendations.
  const recommend = api.hearingFallbackPayload('What did the Example Royal Commission recommend?', research)
  assert.equal(recommend.answer, api.NO_SUPPORTED_ANSWER); assert.deepEqual(recommend.citations, {}); assert.equal(recommend.answer_decision, 'limitation')
  for (const q of [hearingQuestion, 'What did the Example Royal Commission hear about the executive minute?', 'What did witnesses say to the Example Royal Commission?']) {
    const out = api.hearingFallbackPayload(q, research)
    assert.match(out.answer, /“The executive minute was prepared in the department and went to the committee in March\.”/, q)
  }
})

test('the writer\'s own fact label goes before a closing full stop too, and never from inside a quotation', () => {
  const given = new Set([1, 2, 3])
  assert.equal(api.withoutGivenFactLabels('The measure began in 2023 (fact 3).', given), 'The measure began in 2023.')
  assert.equal(api.withoutGivenFactLabels('The measure began in 2023 (facts 2 and 3). It ended in 2024 (fact 1).', given), 'The measure began in 2023. It ended in 2024.')
  assert.equal(api.withoutGivenFactLabels('Did the measure begin in 2023 (fact 3)?', given), 'Did the measure begin in 2023?')
  // Not given, or in the middle of a sentence: prose.
  for (const prose of ['The measure began in 2023 (fact 7).', 'The second point (fact 2), which was not disputed, stands.']) assert.equal(api.withoutGivenFactLabels(prose, given), prose)
  // Inside a quotation the words are the source's own: a word-for-word quotation must stay word for word.
  const quoted = 'The transcript records: “It was agreed. (fact 3) Then we left the room (fact 2).”'
  assert.equal(api.withoutGivenFactLabels(quoted, given), quoted)
  assert.equal(api.withoutGivenFactLabels(quoted + ' (fact 1).', given), quoted)
})

test('a refused answer on a hearing-evidence question is told to search, not to answer again', async () => {
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => { call++; return call === 1 ? calls('royal_commissions', { view: 'recommendations', commission: 'robodebt', words: 'debts', limit: 1 }) : call <= 3 ? calls('answer', { facts: [1] }) : says('not json') } })
  const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
  await api.runAgentic('What evidence was given at the Robodebt Royal Commission about income averaging?', { ...offline, research }, async () => {}, 40000, undefined, {}, nobody).catch(() => {})
  const shown = JSON.stringify(model.doGenerateCalls.at(-1).prompt)
  assert.ok(shown.includes('the answer was not accepted (no hearing transcript excerpt is held: search the transcript text'), shown.slice(-600))
  assert.equal(shown.includes('then answer); answer again with points or facts'), false)
})

test('the research model says what each selected excerpt is for, in the question\'s own words; the writer is given it and no reader is', async () => {
  const q = 'What evidence was given at the Robodebt Royal Commission about income averaging?'
  assert.equal(api.bearsOn('income averaging', q), 'income averaging')
  assert.equal(api.bearsOn('  About   income AVERAGING ', q), 'About income AVERAGING')
  // A word that is not in the question (a name, a claim) drops the label; so does an empty one or one that is not text.
  for (const label of ['Ms Quellworth on income averaging', 'income averaging was unlawful', '', '   ', 7, null, undefined, ['income']]) assert.equal(api.bearsOn(label, q), undefined, String(label))
  // The question's words out of their order can turn what was asked into a claim: only a run of consecutive words stays.
  const asked = 'What did the commission hear about income averaging? Did Jordan Sample know?'
  assert.equal(api.bearsOn('Did Jordan Sample know', asked), 'Did Jordan Sample know')
  for (const label of ['Jordan Sample did know', 'Jordan Sample income averaging', 'evidence income averaging']) assert.equal(api.bearsOn(label, asked) ?? api.bearsOn(label, q), undefined, label)
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async options => { call++
    if (call === 1) return calls('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 2 })
    if (call === 2) return calls('answer', { facts: [2, 3], bears_on: { 2: 'income averaging', 3: 'Ms Quellworth said averaging was unlawful' } })
    const given = JSON.parse(options.prompt.at(-1).content.map(part => part.text ?? '').join('')).facts
    return says(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'The transcript holds evidence about income averaging.', facts: [given[0].id] }] })) } })
  const research = api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() })
  const out = await api.runAgentic(q, { ...offline, research }, async () => {}, 40000, undefined, {}, nobody)
  assert.equal(out.answered, true)
  // The research model was asked for it in fixed words.
  assert.equal(api.BEARS_ON_RULE, 'Select only the transcript excerpts that answer the question, and say what each is for in "bears_on": {"<fact id>": "<the words of the question that excerpt answers>"}, using words from the question only. ')
  assert.ok(JSON.stringify(model.doGenerateCalls[0].prompt).includes('using words from the question only.'))
  // The writer got the label that uses the question's words, on each excerpt of fact 2, and no label for fact 3.
  const prompt = JSON.parse(model.doGenerateCalls.at(-1).prompt.at(-1).content.map(part => part.text ?? '').join(''))
  const labelled = prompt.facts.filter(f => f.bears_on)
  assert.ok(labelled.length >= 1 && labelled.every(f => f.bears_on === 'income averaging' && f.transcript), JSON.stringify(prompt.facts.map(f => [f.id, f.bears_on])))
  assert.ok(prompt.facts.every(f => f.bears_on === undefined || f.bears_on === 'income averaging'), 'the refused label is given to nobody')
  assert.equal(JSON.stringify(prompt).includes('Quellworth said averaging was unlawful'), false)
  assert.ok(prompt.contract.includes('Lead with the excerpts that answer the question'))
  // Nothing of it is in what comes back.
  // (The run's internal step log keeps the model's own call arguments; the answer, its sources and its record do not.)
  const whole = JSON.stringify([out.answer, out.qualitative, out.research])
  assert.equal(whole.includes('fact_notes'), false); assert.equal(whole.includes('bears_on'), false); assert.equal(whole.includes('Quellworth'), false)
})

test('a transcript text search says to search further, until four have been made', async () => {
  assert.equal(api.SEARCH_TRANSCRIPTS_FURTHER, 'Each transcript search returns only a few hearing days. Search each specific word or two-word phrase of the question in its own search before answering, then select only the excerpts that answer the question.')
  const run = async steps => {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { const step = steps[call++]; return step ? calls('royal_commissions', step) : says('not json') } })
    const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
    await api.runAgentic('What did the Robodebt Royal Commission hear about income averaging?', { ...offline, research }, async () => {}, 40000, undefined, {}, nobody).catch(() => {})
    return model.doGenerateCalls.map(c => JSON.stringify(c.prompt).split('Each transcript search returns only a few hearing days').length - 1)
  }
  const search = words => ({ view: 'transcripts', commission: 'robodebt', words, limit: 1 })
  // Before each of the model's calls: said with the results of text searches 1, 2 and 3.
  assert.deepEqual((await run([search('averaging'), search('cabinet'), search('drafted')])).slice(0, 4), [0, 1, 2, 3])
  // Another view of the same tool, or a transcript listing with no words, does not carry it.
  assert.deepEqual((await run([{ view: 'recommendations', commission: 'robodebt', words: 'debts', limit: 1 }, { view: 'transcripts', commission: 'robodebt', limit: 1 }])).slice(0, 3), [0, 0, 0])
})

test('writer output with unescaped quotation marks inside a sentence is read, not thrown away', async () => {
  // An excerpt that holds straight quotation marks, as hearing transcripts often do. A model writes them into its JSON
  // without escaping; the output was then unparseable and the reader got the fallback.
  const words = 'I had often heard comments coming from the department about, "Well, the tribunal is merits review" and nothing more.'
  const text = excerpt('P-4708', words)
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day44.pdf#page=9', label: text } }])
  const sentence = `The transcript records: “${words}”`
  const broken = `{"answer_decision":"answer","sentences":[{"text":"The transcript records: “${words}”","facts":[1],"coverage":false},{"text":"A second line.","facts":[]}]}`
  assert.throws(() => JSON.parse(broken))
  assert.deepEqual(api.writtenSentences(broken), { answer_decision: 'answer', sentences: [{ text: sentence, facts: [1], coverage: false }, { text: 'A second line.', facts: [] }] })
  assert.equal(api.writtenSentences('I could not write an answer.'), null)
  const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }
  const out = await writerWith(new MockLanguageModelV4({ doGenerate: async () => says(broken) }))({ question: hearingQuestion, period, facts }, stats, undefined, 20000)
  assert.ok(out.answer.includes(sentence), out.answer); assert.equal(stats.coherence.fallback, undefined); assert.equal(out.machine_written, true)
})

test('when the writer\'s sentences cannot be used the excerpts are quoted whole, the reason is recorded, and the answer is not marked machine-written', async () => {
  const long = 'Alright. The adviser then set out for the committee, over several pages, how the department had arrived at the figure and why the earlier advice had not been put to the minister before the measure was announced in the budget.'
  const texts = [excerpt('P-4899', long), ...[1, 2, 3, 4, 5, 6].map(n => excerpt(`P-49${n}0`, `Excerpt number ${n} about the executive minute and the committee.`))]
  const facts = api.writingFacts(undefined, texts.map((text, i) => ({ id: i + 1, text, cite: { kind: 'record', url: `https://commission.example/day46.pdf#page=${i + 1}`, label: text } })))
  const run = async model => { const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }; const out = await writerWith(model)({ question: hearingQuestion, period, facts }, stats, undefined, 20000); return { out, stats } }
  // Output that cannot be read at all.
  const unread = await run(new MockLanguageModelV4({ doGenerate: async () => says('I am unable to produce JSON today.') }))
  assert.equal(unread.stats.coherence.fallback, true); assert.equal(unread.stats.coherence.fallback_reason, 'unparseable')
  const lines = unread.out.answer.split('\n\n')
  // Six excerpts, each whole: before, four, each cut to one sentence of at most 32 words (this one to “Alright.”).
  assert.equal(lines.length, 6); assert.equal(lines[0], `The hearing transcript records on hearing day 46 (10 March 2023): “${long}”`)
  assert.equal(unread.out.machine_written, false)
  // Every sentence fails the checks, twice.
  const failing = await run(new MockLanguageModelV4({ doGenerate: async () => says(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'The transcript records that “the adviser never set out anything for the committee at all”.', facts: [1] }] })) }))
  assert.equal(failing.stats.coherence.fallback_reason, 'check_failed'); assert.equal(failing.out.machine_written, false)
  // The provider fails.
  const down = await run(new MockLanguageModelV4({ doGenerate: async () => { throw new Error('provider went away') } }))
  assert.equal(down.stats.coherence.fallback_reason, 'provider')
  // No model at all.
  const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }
  await api.createAnswerWriter({ dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, modelBudgetSpent: async () => false })({ question: hearingQuestion, period, facts }, stats, undefined, 20000)
  assert.equal(stats.coherence.fallback_reason, 'not_called')
})

test('a sentence in another script is left out and counted; a quotation in another script inside an English sentence is not', () => {
  assert.equal(api.otherScript('委员会的最终报告发现，该计划在没有其部门表示所需立法修改的情况下被内阁批准并继续进行。'), true)
  assert.equal(api.otherScript('The report found that the scheme went ahead without the legislative change.'), false)
  assert.equal(api.otherScript('The witness wrote “该计划被批准” on the page.'), false)
  assert.equal(api.otherScript('Доклад комиссии был опубликован в 2023 году.'), true)
  assert.equal(api.otherScript('2023.'), false)
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=15', label: text } }])
  const good = 'The transcript records: “The executive minute was prepared in the department and went to the committee in March.”'
  const leftOut = {}
  const raw = { answer_decision: 'answer', sentences: [{ text: good, facts: [1] }, { text: '报告得出的结论是，这是一次代价高昂的公共行政失败。', facts: [] }] }
  const out = api.verifyWrittenAnswer(raw, { question: hearingQuestion, period, facts }, leftOut)
  assert.equal(out.answer, good); assert.deepEqual(leftOut, { other_script: 1 })
  assert.equal(api.draftWrittenAnswer(raw, { question: hearingQuestion, period, facts }).answer, good)
  // The research model's own points are checked the same way.
  const tally = api.emptyTally()
  const points = api.verifyResearchPoints([{ claim: 'The commission reported in July 2023.' }, { claim: '委员会的最终报告发现，该计划被内阁批准并继续进行。' }], new Map(), 'What did the commission report?', nobody, undefined, undefined, undefined, tally)
  assert.match(points.answer, /The commission reported in July 2023\./); assert.doesNotMatch(points.answer, /委员会/); assert.equal(tally.drops.other_script, 1)
})

test('a quotation that ends where its excerpt was cut keeps the excerpt\'s "...", not a full stop', () => {
  const cut = '...has been some criticism of the way the budget is set and whether the districts are told early enough that they...'
  assert.equal(api.withSourceEllipses('The transcript records: “has been some criticism of the way the budget is set and whether the districts are told early enough that they.”', [cut]),
    'The transcript records: “...has been some criticism of the way the budget is set and whether the districts are told early enough that they...”')
  // Already as the source has it, quoted from the middle, or an excerpt that was not cut: unchanged.
  for (const kept of ['The transcript records: “...has been some criticism of the way the budget is set and whether the districts are told early enough that they...”', 'The transcript records: “some criticism of the way the budget is set”.'])
    assert.equal(api.withSourceEllipses(kept, [cut]), kept)
  const whole = 'The executive minute was prepared in the department.'
  assert.equal(api.withSourceEllipses(`The transcript records: “${whole}”`, [whole]), `The transcript records: “${whole}”`)
  // Through the writer's check, for the excerpt the sentence cites.
  const text = excerpt('6527', cut)
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day64.pdf#page=20', label: text } }])
  const out = api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [{ text: 'The transcript records: “has been some criticism of the way the budget is set and whether the districts are told early enough that they.”', facts: [1] }] }, { question: hearingQuestion, period, facts })
  assert.ok(out.answer.includes('“...has been some criticism of the way the budget is set and whether the districts are told early enough that they...”'), out.answer)
})

test('every call that writes prose on a hearing question is told what it may say about a gap: that the passages found do not address it, nothing about what the record lacks', async () => {
  const { ASK_ABSENCE_RULE } = await import('data:text/javascript;base64,' + Buffer.from((await build({ stdin: { contents: "export {ASK_ABSENCE_RULE} from './src/ask-writing-rules'", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', logLevel: 'silent' })).outputFiles[0].text).toString('base64'))
  assert.equal(ASK_ABSENCE_RULE, 'Describe only what the cited passages say. Where they leave part of the question unanswered, say "the passages found don\'t address this" and stop there. ')
  // Worded as what to do: none of the words the prompt cap counts.
  assert.doesNotMatch(ASK_ABSENCE_RULE, /\b(?:do not|never|must not|cannot)\b/i)
  const text = excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.')
  const facts = api.writingFacts(undefined, [{ id: 1, text, cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=15', label: text } }])
  // The writer.
  assert.ok(JSON.parse(api.writingPrompt({ question: hearingQuestion, period, facts })).contract.includes(api.ASK_SELF_REFERENCE_RULE + ASK_ABSENCE_RULE))
  // The research model's turns, and its final answer call (reached when the provider stops mid-run).
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => { call++; if (call === 1) return calls('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 1 }); throw new Error('provider went away') } })
  const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
  await api.runAgentic('What did the Robodebt Royal Commission hear about income averaging?', { ...offline, research }, async () => {}, 40000, undefined, {}, nobody).catch(() => {})
  assert.ok(model.doGenerateCalls.length >= 2)
  for (const made of model.doGenerateCalls) assert.ok(JSON.stringify(made.prompt).includes('say \\"the passages found don\'t address this\\" and stop there.'), JSON.stringify(made.prompt).slice(0, 200))
})

// ---- Delta review at f026725a4 ----
test('the bare word "inquiry" is not a commission: a hearing-style question about an unnamed inquiry is a Hansard question', () => {
  for (const q of ['What did witnesses tell the inquiry into supermarket prices?', 'What evidence was given at the inquiry into consulting services?', 'Which senators called for a royal commission into banking?', 'What did MPs tell the inquiry about aged care?']) {
    assert.equal(api.hearingEvidenceQuestion(q), false, q); assert.equal(api.quotedOrNothing(q), false, q)
  }
  // An inquiry that is named as a commission, by a commission phrase or a registered name, is one.
  for (const q of ['What did witnesses tell the Special Commission of Inquiry into Healthcare Funding about locums?', 'What evidence was given at the NSW Healthcare Funding inquiry about duress alarms?', 'What evidence was given at the Robodebt Royal Commission about income averaging?'])
    assert.equal(api.hearingEvidenceQuestion(q), true, q)
})

test('a hearing answer that cites none of the excerpts its writer was given is not used: the labelled excerpts are quoted, or one fixed line', async () => {
  const q = 'What evidence was given at the Example Royal Commission about the executive minute?'
  const texts = [excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.'), excerpt('P-4901', 'Nobody raised the legal advice at that meeting.')]
  const facts = labels => api.writingFacts(undefined, texts.map((text, i) => ({ id: i + 1, text, cite: { kind: 'record', url: `https://commission.example/day46.pdf#page=${i + 1}`, label: text } }))).map((f, i) => labels[i] ? { ...f, bears_on: labels[i] } : f)
  // The reviewer's case: one general-knowledge sentence naming a person, with an empty facts list.
  const uncited = () => new MockLanguageModelV4({ doGenerate: async () => says(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'Mr Placeholder approved income averaging in 2015 and the scheme was later found unlawful.', facts: [] }] })) })
  const run = async input => { const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }; const out = await writerWith(uncited())(input, stats, undefined, 20000); return { out, stats } }
  // The research model labelled one excerpt: that one is quoted, the other is not.
  const one = await run({ question: q, period, facts: facts(['the executive minute', undefined]), selected: true })
  assert.equal(one.stats.coherence.fallback_reason, 'check_failed'); assert.equal(one.out.machine_written, false)
  assert.equal(one.out.answer, 'The hearing transcript records on hearing day 46 (10 March 2023): “The executive minute was prepared in the department and went to the committee in March.”')
  // It sent labels and none was usable: the fixed line, never a block of passages nobody judged to be on point.
  const none = await run({ question: q, period, facts: facts([]), selected: true })
  assert.equal(none.out.answer, 'OPAX found passages in the hearing transcripts, but none that it judged to answer this question.')
  assert.equal(none.out.machine_written, false); assert.deepEqual(none.out.citations, {}); assert.doesNotMatch(none.out.answer, /Placeholder/)
  // Like the other fixed lines it is a limitation, not an answer, for graders and clients reading answer_decision.
  assert.equal(none.out.answer_decision, 'limitation'); assert.equal(one.out.answer_decision, 'answer')
  // It sent no labels at all (or the run stopped before any answer call): the held excerpts are quoted, as before.
  const unlabelled = await run({ question: q, period, facts: facts([]) })
  assert.equal(unlabelled.out.answer.split('\n\n').length, 2); assert.doesNotMatch(unlabelled.out.answer, /Placeholder|OPAX found passages/)
  // A sentence that does cite an excerpt keeps the writer's answer.
  const good = 'The transcript records: “Nobody raised the legal advice at that meeting.”'
  const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }
  const kept = await writerWith(new MockLanguageModelV4({ doGenerate: async () => says(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: good, facts: [2] }] })) }))({ question: q, period, facts: facts([]), selected: true }, stats, undefined, 20000)
  assert.equal(kept.answer, good); assert.equal(stats.coherence.fallback, undefined)
  // Another kind of question may be answered whole from other records with an excerpt among its facts.
  const grant = { id: 3, text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', cite: { kind: 'record', url: 'https://opax.test/grants/example', label: 'Example Health grant' } }
  const mixed = api.writingFacts(undefined, [{ id: 1, text: texts[0], cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=1', label: texts[0] } }, grant])
  const other = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }
  const answered = await writerWith(new MockLanguageModelV4({ doGenerate: async () => says(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'Example Health Ltd was awarded a grant of $120,000 in 2023-24.', facts: [mixed.find(f => !f.transcript).id] }] })) }))({ question: 'Which grants did Example Health receive?', period, facts: mixed }, other, undefined, 20000)
  assert.match(answered.answer, /\$120,000/); assert.equal(other.coherence.fallback, undefined)
})

test('the run records how many excerpts carried a kept label, and the labelled ones are what a failed writer falls back to', async () => {
  const q = 'What evidence was given at the Robodebt Royal Commission about income averaging?'
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => { call++
    if (call === 1) return calls('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 2 })
    if (call === 2) return calls('answer', { facts: [2, 3], bears_on: { 2: 'income averaging', 3: 'somebody said averaging was unlawful' } })
    return says('I am unable to produce JSON today.') } })
  let writer
  const research = api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown(), onUsage: stats => { writer = stats } })
  const out = await api.runAgentic(q, { ...offline, research }, async () => {}, 40000, undefined, {}, nobody)
  assert.equal(out.answered, true)
  // The counts are on the writer's coherence record, which only an operator's eval response carries
  // (research-eval.ts captureLoopUsage reads it through onUsage); the reply itself does not hold them.
  const { held, labelled, sent } = writer.coherence.excerpt_labels
  assert.equal(sent, true); assert.ok(held >= labelled && labelled >= 1, JSON.stringify(writer.coherence.excerpt_labels))
  assert.equal(JSON.stringify(out).includes('excerpt_labels'), false)
  // Only the labelled excerpts (fact 2's) are quoted.
  const lines = out.answer.split('\n\n').filter(line => /^The hearing transcript records/.test(line))
  assert.equal(lines.length, Math.min(6, labelled), out.answer)
})

test('the last resort of a stopped run keeps a transcript listing and its count for a question they can answer, and leaves out only excerpts', async () => {
  // The reviewer's case: a listing lookup, then the provider fails.
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => { call++; if (call === 1) return calls('royal_commissions', { view: 'transcripts', commission: 'robodebt', limit: 3 }); throw new Error('provider went away') } })
  const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
  const out = await api.runAgentic('How long did the Robodebt Royal Commission sit?', { ...offline, research }, async () => {}, 40000, undefined, {}, nobody)
  assert.equal(out.answered, true); assert.match(out.answer, /OPAX lists 47 hearing transcripts from the Royal Commission into the Robodebt Scheme, dated 27 September 2022 to 10 March 2023/)
})

test('unreadable writer output: escapes are read as JSON reads them, and a sentence with no facts list is passed over, not merged', () => {
  const broken = '{"sentences":[{"text":"The transcript records: \\u201cIt went in "March" that year.\\u201d","facts":[1]},{"text":"A sentence with no facts list."},{"text":"A third sentence.","facts":[2],"coverage":false}]}'
  assert.throws(() => JSON.parse(broken))
  assert.deepEqual(api.writtenSentences(broken).sentences, [{ text: 'The transcript records: “It went in "March" that year.”', facts: [1] }, { text: 'A third sentence.', facts: [2], coverage: false }])
})

test('prose the research model returns in another script is left out, and the text form in another script is not used', async () => {
  const run = async answer => {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++; return call === 1 ? calls('royal_commissions', { view: 'recommendations', commission: 'robodebt', words: 'debts', limit: 1 }) : answer } })
    const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
    return api.runAgentic('What did the Robodebt Royal Commission recommend about debts?', { ...offline, research }, async () => {}, 40000, undefined, {}, nobody).catch(() => ({ answer: '' }))
  }
  const prose = await run(says('The Royal Commission made recommendations about the recovery of debts and how they are raised.\n委员会的最终报告发现，该计划在没有所需立法修改的情况下被内阁批准并继续进行。'))
  assert.doesNotMatch(String(prose.answer), /委员会/)
  const text = await run(calls('answer', { text: '委员会的最终报告发现，该计划在没有所需立法修改的情况下被内阁批准并继续进行。', citations: [] }))
  assert.doesNotMatch(String(text.answer), /委员会/)
})

test('the search-further line is for questions about a hearing or its evidence only', async () => {
  const shown = async question => {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++; return call === 1 ? calls('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'averaging', limit: 1 }) : says('not json') } })
    const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
    await api.runAgentic(question, { ...offline, research }, async () => {}, 40000, undefined, {}, nobody).catch(() => {})
    return JSON.stringify(model.doGenerateCalls[1].prompt).includes('Each transcript search returns only a few hearing days')
  }
  assert.equal(await shown('What did the Robodebt Royal Commission hear about income averaging?'), true)
  assert.equal(await shown('What did the Robodebt Royal Commission recommend about debts?'), false)
})

// ---- Delta review at 204406e7c, and the hub's rulings on its two P2s ----
const streamedWriter = model => api.createAnswerWriter({ model, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, modelBudgetSpent: async () => false })
const writerModel = sentences => new StreamingResearchModel({ doGenerate: async () => says(JSON.stringify({ answer_decision: 'answer', sentences })) })
const twoExcerpts = [excerpt('P-4899', 'The executive minute was prepared in the department and went to the committee in March.'), excerpt('P-4901', 'Nobody raised the legal advice at that meeting.')]
const excerptFacts = labels => api.writingFacts(undefined, twoExcerpts.map((text, i) => ({ id: i + 1, text, cite: { kind: 'record', url: `https://commission.example/day46.pdf#page=${i + 1}`, label: text } }))).map((f, i) => labels[i] ? { ...f, bears_on: labels[i] } : f)
const NAMED = 'Mr Placeholder approved income averaging in 2015 and the scheme was later found unlawful.'
// One writer call, JSON or streamed (a preview that releases whatever the writer offers, as the web page's stream does).
const writeOnce = async (sentences, input, streamed) => {
  const stats = { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }, released = []
  const preview = streamed ? async draft => { released.push(draft.answer); return draft } : undefined
  const out = await streamedWriter(writerModel(sentences))(input, stats, undefined, 20000, preview)
  return { out, stats, released }
}

test('a streamed hearing answer is held to the same excerpt count as a JSON one: nothing that cites no excerpt is released, and the result is the same', async () => {
  const report = 'The Royal Commission into the Robodebt Scheme reported in July 2023 and made 57 recommendations.'
  const withReport = labels => [...excerptFacts(labels), ...api.writingFacts(undefined, [{ id: 3, text: report, cite: { kind: 'record', url: 'https://commission.example/report.pdf', label: 'Report' } }]).map(f => ({ ...f, id: 3 }))]
  for (const question of ['What evidence was given at the Robodebt Royal Commission about income averaging?', 'What did the Robodebt Royal Commission hear about income averaging?'])
    for (const [labels, selected] of [[['income averaging', undefined], true], [[], true], [[], false]])
      // The writer's whole answer is the named sentence, uncited or cited to the report and to no excerpt.
      for (const cites of [[], [3]]) {
        const input = { question, period, facts: withReport(labels), ...(selected ? { selected: true } : {}) }
        const json = await writeOnce([{ text: NAMED, facts: cites }], input, false)
        const streamed = await writeOnce([{ text: NAMED, facts: cites }], input, true)
        // Before: the preview released the sentence, and the writer, failing the excerpt count at the end, returned
        // the released draft as the whole answer.
        assert.deepEqual(streamed.released, [], `${question} ${cites}`)
        assert.equal(streamed.out.answer, json.out.answer, `${question} ${cites}`)
        assert.doesNotMatch(streamed.out.answer, /Placeholder/, question); assert.equal(streamed.out.machine_written, false, question)
      }
  // A sentence that cites an excerpt is released and kept, streamed as in JSON.
  const good = 'The transcript records: “Nobody raised the legal advice at that meeting.”'
  const cited = await writeOnce([{ text: good, facts: [2] }], { question: 'What did the Robodebt Royal Commission hear about income averaging?', period, facts: excerptFacts([]), selected: true }, true)
  assert.equal(cited.out.answer, good); assert.deepEqual(cited.released, [good])
})

test('on a hearing question an uncited writer sentence is left out even beside a cited one, its words kept only on the operator record; other questions keep it', async () => {
  const good = 'The transcript records: “Nobody raised the legal advice at that meeting.”'
  const question = 'What evidence was given at the Robodebt Royal Commission about the legal advice?'
  for (const streamed of [false, true]) {
    const { out, stats, released } = await writeOnce([{ text: NAMED, facts: [] }, { text: good, facts: [2] }], { question, period, facts: excerptFacts([]) }, streamed)
    assert.equal(out.answer, good)
    assert.equal(stats.coherence.left_out.uncited_on_hearing, 1); assert.deepEqual(stats.coherence.uncited_left_out, [NAMED])
    assert.equal(JSON.stringify(out).includes('Placeholder'), false)
    assert.ok(released.every(text => !/Placeholder/.test(text)))
  }
  // With nothing cited left, the agreed fixed lines: here the held excerpts, quoted by code.
  const alone = await writeOnce([{ text: NAMED, facts: [] }, { text: 'It was a long hearing.', facts: [] }], { question, period, facts: excerptFacts([]) }, false)
  assert.equal(alone.stats.coherence.fallback_reason, 'check_failed'); assert.doesNotMatch(alone.out.answer, /Placeholder|long hearing/)
  // A question that is not about a hearing keeps its uncited context sentence beside a cited one.
  const grant = { id: 3, text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', cite: { kind: 'record', url: 'https://opax.test/grants/example', label: 'Example Health grant' } }
  const facts = api.writingFacts(undefined, [{ id: 1, text: twoExcerpts[0], cite: { kind: 'record', url: 'https://commission.example/day46.pdf#page=1', label: twoExcerpts[0] } }, grant])
  const context = 'Grants of this kind are awarded each year.'
  const other = await writeOnce([{ text: context, facts: [] }, { text: 'Example Health Ltd was awarded a grant of $120,000 in 2023-24.', facts: [facts.find(f => !f.transcript).id] }], { question: 'Which grants did Example Health receive?', period, facts }, false)
  assert.match(other.out.answer, /Grants of this kind/); assert.match(other.out.answer, /\$120,000/); assert.equal(other.stats.coherence?.uncited_left_out, undefined)
  // And a hearing question whose writer was given no excerpt is not affected.
  const noExcerpt = await writeOnce([{ text: context, facts: [] }, { text: 'Example Health Ltd was awarded a grant of $120,000 in 2023-24.', facts: [3] }], { question, period, facts: api.writingFacts(undefined, [grant]) }, false)
  assert.match(noExcerpt.out.answer, /Grants of this kind/)
})

test('"members" and "MPs" are Parliament only in a question that names no commission; witnesses to a named inquiry are not', () => {
  // The review's wordings: true on f026725a4, false at 204406e7c, true again.
  for (const q of ['What did family members tell the NSW Healthcare Funding inquiry about duress alarms?', 'What did staff members tell the NSW Healthcare Funding inquiry about rosters?',
    'Who told the NSW Healthcare Funding inquiry that members of the board were not consulted?', 'What did a local MP tell the NSW Healthcare Funding inquiry about duress alarms?']) {
    assert.equal(api.parliamentaryQuestion(q), false, q); assert.equal(api.hearingEvidenceQuestion(q), true, q); assert.equal(api.quotedOrNothing(q), true, q)
  }
  assert.equal(api.quotedOrNothing('What did members of the Stolen Generations tell the Yoorrook Justice Commission?'), true)
  // With no commission named they are Parliament's, and "senators" and the bodies of Parliament always are.
  for (const q of ['What did MPs tell the inquiry about aged care?', 'Which members voted against the bill?', 'Which senators called for a royal commission into banking?', 'What did the Senate inquiry into healthcare funding hear?', 'What did members of the Senate committee tell the Robodebt Royal Commission?'])
    assert.equal(api.parliamentaryQuestion(q), true, q)
  for (const q of ['What did MPs tell the inquiry about aged care?', 'Which senators called for a royal commission into banking?', 'What did the Senate inquiry into healthcare funding hear?']) {
    assert.equal(api.hearingEvidenceQuestion(q), false, q); assert.equal(api.quotedOrNothing(q), false, q)
  }
  // "The inquiry into the Robodebt scheme" names the Royal Commission (a registry alias).
  assert.equal(api.hearingEvidenceQuestion('What did counsel assisting tell the inquiry into the Robodebt scheme?'), true)
})

test('the absence rule is in the prompts of hearing questions only; every other question keeps main\'s general-knowledge prompts', async () => {
  const grant = { id: 1, text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', cite: { kind: 'record', url: 'https://opax.test/grants/example', label: 'Example Health grant' } }
  for (const question of ['Which donors gave the most to the Liberal Party in 2022-23?', 'Who gave evidence at Senate estimates about Robodebt in 2023?', 'What did the Robodebt Royal Commission recommend about debts?', 'What evidence did the minister give for the policy?']) {
    assert.equal(api.commissionHearingQuestion(question), false, question)
    const contract = JSON.parse(api.writingPrompt({ question, period, facts: api.writingFacts(undefined, [grant]) })).contract
    assert.ok(contract.includes(api.ASK_SELF_REFERENCE_RULE), question); assert.equal(contract.includes(api.ASK_ABSENCE_RULE), false, question)
  }
  for (const question of ['What did the Robodebt Royal Commission hear about income averaging?', 'Who gave evidence to the NSW Healthcare Funding inquiry about locums?', hearingQuestion])
    assert.ok(JSON.parse(api.writingPrompt({ question, period, facts: api.writingFacts(undefined, [grant]) })).contract.includes(api.ASK_SELF_REFERENCE_RULE + api.ASK_ABSENCE_RULE), question)
  // The research model's turns and its final answer call, on a commission question that is not about its hearings.
  let call = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => { call++; if (call === 1) return calls('royal_commissions', { view: 'recommendations', commission: 'robodebt', words: 'debts', limit: 1 }); throw new Error('provider went away') } })
  const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined })
  await api.runAgentic('What did the Robodebt Royal Commission recommend about debts?', { ...offline, research }, async () => {}, 40000, undefined, {}, nobody).catch(() => {})
  assert.ok(model.doGenerateCalls.length >= 2)
  for (const made of model.doGenerateCalls) {
    const prompt = JSON.stringify(made.prompt)
    assert.equal(prompt.includes('the passages found don'), false); assert.ok(prompt.includes('Write about the records only'))
  }
})

test('labels keyed "fact-N" are read; labels only on a listing or count row are not a selection; an answer object may open with "bears_on"', async () => {
  const q = 'What evidence was given at the Robodebt Royal Commission about income averaging?'
  const runWith = async bears_on => {
    let call = 0, writer
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++
      if (call === 1) return calls('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 2 })
      if (call === 2) return calls('answer', { facts: [1, 2, 3], bears_on })
      return says('I am unable to produce JSON today.') } })
    const research = api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown(), onUsage: stats => { writer = stats } })
    const out = await api.runAgentic(q, { ...offline, research }, async () => {}, 40000, undefined, {}, nobody)
    return { out, labels: writer?.coherence?.excerpt_labels }
  }
  // Fact 2 holds the excerpts of one hearing day; each carries its label.
  const keyed = await runWith({ 'fact-2': 'income averaging' })
  assert.equal(keyed.labels.sent, true); assert.ok(keyed.labels.labelled >= 1 && keyed.labels.labelled < keyed.labels.held, JSON.stringify(keyed.labels))
  assert.equal(keyed.out.answer.split('\n\n').filter(line => /^The hearing transcript records/.test(line)).length, keyed.labels.labelled, keyed.out.answer)
  // A label only on fact 1, the transcripts' count row: no judgement about excerpts was made, so the held excerpts
  // are quoted as before, never the fixed line.
  const listing = await runWith({ 1: 'income averaging' })
  assert.equal(listing.labels.sent, false)
  assert.doesNotMatch(listing.out.answer, /OPAX found passages/); assert.ok(listing.out.answer.split('\n\n').filter(line => /^The hearing transcript records/.test(line)).length >= 2, listing.out.answer)
  // Reply text whose answer object opens with bears_on is read.
  assert.deepEqual(api.replyAnswer('{"bears_on":{"2":"income averaging"},"facts":[2,3]}')?.facts, [2, 3])
})
