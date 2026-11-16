// Transcript quotes only: behind a runtime switch that is off by default, hearing transcript evidence is never worded
// by a model. Code quotes each selected excerpt in one block that closes the answer. Every test here runs both states
// where the state matters: with the switch off, the answer is the one the stack gives without this change.
// No model call, no network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { MockLanguageModelV4 } from 'ai/test'

const built = await build({ stdin: { contents: [
  "export {refreshTranscriptQuotesOnly, transcriptQuotesOnly, forgetTranscriptQuotesOnly, QUOTES_ONLY_KEY} from './src/ask-flags'",
  "export {pageHits, pageTurns, textIndex} from './src/tools/transcript-text'",
  "export {transcriptTurns, withTranscriptNote} from './src/transcript-answer'",
  "export {writingFacts, writingPrompt, proseFallback, quotationBlock, joinWritten, QUOTES_LEAD} from './src/research-writing'",
  "export {hearingFallbackPayload} from './src/ask-hearing-fallback'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {createResearch} from './src/research-loop'",
  "export {runAgentic} from './src/agentic-ask'",
  "export {createResearchCreditCooldown} from './src/research-credit'",
  "export {callTool} from './src/tools/index'",
  "export {runTool} from './src/agentic-tools'",
  "export {commissionHearingQuestion, NO_PASSAGE_FOUND, NO_PASSAGE_SELECTED} from './src/transcript-answer'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('These tests must not make network requests') }
test.after(() => { globalThis.fetch = savedFetch })

const LABEL = 'Hearing transcript: evidence, not findings'
const LEAD = 'These passages from the hearing transcripts matched your question. They are in the order they were heard and may not answer it directly.'
const period = { kind: 'all', label: 'All time' }
const named = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
const hearingQuestion = 'What evidence was given at the Example Royal Commission about the executive minute?'
const row = (day, date, turns, commission = 'Example Royal Commission') => `${commission}, Transcript Hearing Day ${day} (${date}), ${turns} ${LABEL}. © Example, licensed under CC BY 4.0.`
const turn = (page, words, pdf = 15) => `transcript page ${page} (PDF page ${pdf}), hearing turn: "${words}"`
const put = (page, words, pdf = 15) => `transcript page ${page} (PDF page ${pdf}), question put: "${words}"`
const facts = texts => api.writingFacts(undefined, texts.map((text, i) => ({ id: i + 1, text, cite: { kind: 'record', url: `https://commission.example/day.pdf#page=${i + 1}`, label: text } })))
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
const validRanges = payload => { const length = Array.from(payload.answer).length; for (const ranges of Object.values(payload.citations)) for (const [a, b] of ranges) assert.ok(a >= 0 && b <= length && a < b, `range ${a}-${b} of ${length}`) }
/** The answer text a range covers. */
const cited = payload => Object.values(payload.citations).flat().map(([a, b]) => Array.from(payload.answer).slice(a, b).join(''))

test('the switch is off by default, flips from one KV key without a deploy, and a local variable decides first', async () => {
  assert.equal(api.QUOTES_ONLY_KEY, 'flag:ask-transcript-quotes-only')
  const kv = value => { const store = { value, reads: 0 }; return { store, GENERATION_CACHE: { get: async key => { store.reads++; assert.equal(key, 'flag:ask-transcript-quotes-only'); return store.value } } } }
  api.forgetTranscriptQuotesOnly()
  // Before any read, and with no key, a missing binding or a failed read: off.
  assert.equal(api.transcriptQuotesOnly({}), false)
  assert.equal(await api.refreshTranscriptQuotesOnly({}, 0), false)
  api.forgetTranscriptQuotesOnly()
  assert.equal(await api.refreshTranscriptQuotesOnly(kv(null), 0), false)
  api.forgetTranscriptQuotesOnly()
  assert.equal(await api.refreshTranscriptQuotesOnly({ GENERATION_CACHE: { get: async () => { throw Error('KV is down') } } }, 0), false)
  for (const value of ['off', 'ON', 'true', '1', '']) { api.forgetTranscriptQuotesOnly(); assert.equal(await api.refreshTranscriptQuotesOnly(kv(value), 0), false, value) }
  // Exactly "on" turns it on; the value is held for 30 seconds, then read again, so a flip back takes effect.
  api.forgetTranscriptQuotesOnly()
  const live = kv('on')
  assert.equal(await api.refreshTranscriptQuotesOnly(live, 1000), true); assert.equal(api.transcriptQuotesOnly(live), true)
  live.store.value = 'off'
  assert.equal(await api.refreshTranscriptQuotesOnly(live, 30_000), true, 'held'); assert.equal(live.store.reads, 1)
  assert.equal(await api.refreshTranscriptQuotesOnly(live, 31_001), false, 'read again'); assert.equal(live.store.reads, 2); assert.equal(api.transcriptQuotesOnly(live), false)
  // A local Worker's variable decides before the key, and never reads it.
  const local = kv('off')
  assert.equal(await api.refreshTranscriptQuotesOnly({ ...local, ASK_TRANSCRIPT_QUOTES_ONLY: 'on' }, 99_000), true); assert.equal(local.store.reads, 0)
  assert.equal(api.transcriptQuotesOnly({ ASK_TRANSCRIPT_QUOTES_ONLY: 'on' }), true)
  const remote = kv('on')
  assert.equal(await api.refreshTranscriptQuotesOnly({ ...remote, ASK_TRANSCRIPT_QUOTES_ONLY: 'off' }, 199_000), false); assert.equal(remote.store.reads, 0)
  api.forgetTranscriptQuotesOnly()
})

test('with the switch on, the transcript tool gives the question a short reply answered, with its own page; off, the hit is as it was', async () => {
  const ix = { docs: [{ key: 'k1', file: '/transcripts/cth-example/transcript-k1.json' }] }
  const doc = { key: 'k1', quote_policy: 'quote', attribution: 'Example attribution', licence_url: 'https://example.test/licence', pdf_url: 'https://example.test/day-1.pdf', terms: { correct: [3, 5], minute: [4], shredded: [6] },
    pages: [
      { n: 2, folio: '10', text: 'MS TALLOWAY: Thank you, Commissioner.\nQ. And the executive minute went to the committee in March, did it not, after the department had settled its terms?' },
      { n: 3, folio: '11', text: 'A. Correct.\nQ. Who settled them?\nA. The branch settled them over several weeks with the legal area, and I was not part of that.' },
      { n: 4, folio: '12', text: 'Q. Did you read the executive minute before it went?\nA. I read the executive minute twice and I raised my concern about the legal advice with my manager at the time.' },
      { n: 5, folio: '13', text: 'THE COMMISSIONER: I will take that as read.\nA. Correct.' },
      { n: 6, folio: '14', text: `Q. ${'I want to take you slowly through the sequence of the drafts. '.repeat(6)}Were the drafts destroyed?\nA. Yes, shredded.` },
    ] }
  const hits = async (terms, on) => (await api.pageHits({ origin: 'https://opax.test', asset: async () => doc, ...(on ? { transcriptQuotesOnly: true } : {}) }, ix, 'k1', terms)).hits
  // The reply opens its page: the question closes the page before, and carries that page.
  const on = await hits(['correct'], true)
  assert.deepEqual(on[0], { pdf_page: 3, transcript_page: '11', url: 'https://example.test/day-1.pdf#page=3', excerpt: 'Correct.',
    question: { pdf_page: 2, transcript_page: '10', text: 'And the executive minute went to the committee in March, did it not, after the department had settled its terms?' } })
  // The turn before is not a "Q." turn (a headed turn): no question is shown, and nothing is guessed.
  assert.deepEqual(on[1], { pdf_page: 5, transcript_page: '13', url: 'https://example.test/day-1.pdf#page=5', excerpt: 'Correct.' })
  // A reply of more than a few words stands alone.
  assert.equal((await hits(['minute'], true))[0].question, undefined)
  // A long question keeps its last 280 characters, from a word boundary, marked as cut.
  const long = (await hits(['shredded'], true))[0]
  // A long question keeps its last whole sentences that fit in 280 characters: no sentence is cut, so nothing is marked.
  assert.equal(long.excerpt, 'Yes, shredded.'); assert.match(long.question.text, /^I want to take you slowly .* Were the drafts destroyed\?$/); assert.ok(long.question.text.length <= 280); assert.equal(long.question.text.includes('...'), false)
  assert.equal(long.question.transcript_page, '14')
  // Off: the same hits with no question, exactly as before.
  const off = await hits(['correct'], false)
  assert.deepEqual(off, [{ pdf_page: 3, transcript_page: '11', url: 'https://example.test/day-1.pdf#page=3', excerpt: 'Correct.' }, { pdf_page: 5, transcript_page: '13', url: 'https://example.test/day-1.pdf#page=5', excerpt: 'Correct.' }])
  assert.deepEqual(await hits(['shredded'], false), [{ pdf_page: 6, transcript_page: '14', url: 'https://example.test/day-1.pdf#page=6', excerpt: 'Yes, shredded.' }])
})

test('a "question put" entry is read with the turn it is followed by; a row without one reads as before', () => {
  const plain = row(46, '10 March 2023', `${turn('P-4899', 'The minute went in March.')} ${turn('P-4901', 'Nobody raised it.')}`)
  assert.deepEqual(api.transcriptTurns(plain), [{ page: 'P-4899', excerpt: 'The minute went in March.', day: '46', date: '10 March 2023' }, { page: 'P-4901', excerpt: 'Nobody raised it.', day: '46', date: '10 March 2023' }])
  const paired = row(46, '10 March 2023', `${put('P-4898', 'Did the minute go in March?')} ${turn('P-4899', 'Yes.')} ${turn('P-4901', 'Nobody raised it.')}`)
  assert.deepEqual(api.transcriptTurns(paired), [{ page: 'P-4899', excerpt: 'Yes.', day: '46', date: '10 March 2023', question: { page: 'P-4898', excerpt: 'Did the minute go in March?' } }, { page: 'P-4901', excerpt: 'Nobody raised it.', day: '46', date: '10 March 2023' }])
})

test('the quotation block: a fixed lead line, six excerpts chosen in research order, shown in hearing date and page order, each with its page', () => {
  // Research order is not hearing order; one excerpt is selected twice; there are eight in all.
  const held = facts([
    row(46, '10 March 2023', turn('P-4938', 'The draft advice went to the acting chief counsel.')),
    row(44, '8 March 2023', `${turn('P-4712', 'The document does not say when that advice was obtained.')} ${turn('P-4698', 'Was legal advice sought on averaging?')}`),
    row(46, '10 March 2023', turn('P-4938', 'The draft advice went to the acting chief counsel.')),
    row(46, '10 March 2023', `${put('P-4901', 'And you prepared the instructions?')} ${turn('P-4902', 'I did.')}`),
    row(9, '7 November 2022', turn('P-801', 'The first paper was written in 2014.')),
    row(47, '11 March 2023', turn('P-5001', 'It was a top priority.')),
    row(48, '12 March 2023', turn('P-5101', 'A seventh excerpt, beyond the six.')),
    row(1, '31 October 2022', turn('P-12', 'An eighth excerpt, beyond the six.')),
  ])
  const block = api.quotationBlock({ question: hearingQuestion, period, facts: held })
  assert.equal(api.QUOTES_LEAD, LEAD)
  assert.deepEqual(block.answer.split('\n\n'), [
    LEAD,
    'Hearing day 9 (7 November 2022), transcript page P-801: “The first paper was written in 2014.”',
    'Hearing day 44 (8 March 2023), transcript page P-4698: “Was legal advice sought on averaging?”',
    'Hearing day 44 (8 March 2023), transcript page P-4712: “The document does not say when that advice was obtained.”',
    'Question put, hearing day 46 (10 March 2023), transcript page P-4901: “And you prepared the instructions?”',
    'Reply, hearing day 46 (10 March 2023), transcript page P-4902: “I did.”',
    'Hearing day 46 (10 March 2023), transcript page P-4938: “The draft advice went to the acting chief counsel.”',
    'Hearing day 47 (11 March 2023), transcript page P-5001: “It was a top priority.”',
  ])
  assert.equal(block.machine_written, false); assert.equal(block.answer_decision, 'answer'); validRanges(block)
  // The lead line says it once: "evidence, not findings" is left to the one closing line the way out adds.
  assert.doesNotMatch(block.answer, /evidence, not findings|CC BY|©|PDF page/)
  // Every line after the lead is cited, and every cited span is a whole line.
  const lines = block.answer.split('\n\n').slice(1), spans = cited(block)
  for (const line of lines) assert.ok(spans.includes(line), line)
  // The same facts through the fallback with the switch on give the same block; off, the form is the one before.
  assert.equal(api.proseFallback({ question: hearingQuestion, period, facts: held, quotesOnly: true }).answer, block.answer)
  const off = api.proseFallback({ question: hearingQuestion, period, facts: held }).answer.split('\n\n')
  assert.equal(off.length, 6); assert.ok(off.every(line => /^The hearing transcript records on hearing day \d+ \(\d{1,2} [A-Z][a-z]+ \d{4}\): “[^”]+”$/.test(line)), off.join('\n'))
  // No quotable excerpt: no block.
  assert.equal(api.quotationBlock({ question: hearingQuestion, period, facts: facts(['Example Royal Commission, Transcript Hearing Day 46 (10 March 2023), 120 pages. ' + LABEL + '.']) }), null)
})

test('excerpts from two commissions say which commission each line is from', () => {
  const held = facts([row(3, '5 March 2024', turn('210', 'The alarms were not tested.'), 'Example Special Commission of Inquiry'), row(46, '10 March 2023', turn('P-4938', 'The draft advice went to counsel.'))])
  assert.deepEqual(api.quotationBlock({ question: 'q', period, facts: held }).answer.split('\n\n').slice(1), [
    'The Example Royal Commission, hearing day 46 (10 March 2023), transcript page P-4938: “The draft advice went to counsel.”',
    'The Example Special Commission of Inquiry, hearing day 3 (5 March 2024), transcript page 210: “The alarms were not tested.”',
  ])
})

test('the block passes the final boundary whole, with one evidence line, and other records are worded above it, never between quotations', () => {
  const texts = [row(46, '10 March 2023', `${put('P-4901', 'And you prepared the instructions?')} ${turn('P-4902', 'I did.')}`), row(44, '8 March 2023', turn('P-4698', 'Was legal advice sought on averaging?'))]
  const held = facts(texts)
  const block = api.quotationBlock({ question: hearingQuestion, period, facts: held })
  const out = api.withTranscriptNote(api.groundAnswerPayload({ answered: true, ...block, research: { pre_writer_sources: held.map(f => ({ ...f.source, snippet: f.text })) } }, hearingQuestion))
  const lines = out.answer.split('\n\n')
  assert.deepEqual(lines.slice(0, 4), [LEAD, 'Hearing day 44 (8 March 2023), transcript page P-4698: “Was legal advice sought on averaging?”', 'Question put, hearing day 46 (10 March 2023), transcript page P-4901: “And you prepared the instructions?”', 'Reply, hearing day 46 (10 March 2023), transcript page P-4902: “I did.”'])
  assert.equal(out.answer.match(/evidence, not findings/g)?.length, 1, out.answer); validRanges(out)
  // A written paragraph about another record goes first; the block follows it unbroken.
  const written = { answer: 'The report recommended that debts raised by averaging be reviewed.', citations: { 'fact-9/t/body/0': [[0, 66]] }, sources: [{ resource: 'fact-9', slug: '', title: 'Report', href: 'https://commission.example/report', url: 'https://commission.example/report', snippet: 'Debts raised by averaging should be reviewed.', cited: true, kind: 'record' }], answer_decision: 'answer', machine_written: true }
  const joined = api.joinWritten(written, block)
  assert.equal(joined.answer, written.answer + '\n\n' + block.answer); assert.equal(joined.machine_written, true); validRanges(joined)
  assert.deepEqual(joined.citations['fact-9/t/body/0'], [[0, 66]])
  assert.ok(cited(joined).includes('Reply, hearing day 46 (10 March 2023), transcript page P-4902: “I did.”'))
  assert.equal(api.joinWritten({ answer: '', citations: {}, sources: [], machine_written: false }, block), block)
})

test('a stopped run on a hearing question: the held excerpts in the block form with the switch on, the earlier form with it off', () => {
  const text = row(46, '10 March 2023', turn('P-4899', 'The executive minute was prepared in the department.'))
  const research = { mode: 'loop', failure: 'steps', rounds: 8, trail: [], sources: [{ kind: 'record', title: text, url: 'https://commission.example/day46.pdf#page=15' }] }
  const on = api.hearingFallbackPayload(hearingQuestion, research, true)
  assert.equal(on.answer, LEAD + '\n\nHearing day 46 (10 March 2023), transcript page P-4899: “The executive minute was prepared in the department.”')
  assert.equal(on.research.transcript_quotes_only, true); assert.equal(on.research.mode, 'hearing_fallback'); assert.equal(on.machine_written, false)
  const off = api.hearingFallbackPayload(hearingQuestion, research)
  assert.equal(off.answer, 'The hearing transcript records on hearing day 46 (10 March 2023): “The executive minute was prepared in the department.”')
  assert.equal('transcript_quotes_only' in off.research, false)
  assert.deepEqual(api.hearingFallbackPayload(hearingQuestion, research, false), off)
})

const asset = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'))
const reply = (toolName, args) => ({ content: [{ type: 'tool-call', toolName, toolCallId: toolName, input: JSON.stringify(args) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] })
const said = text => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
const BLOCK_LINE = /^(?:Hearing|Question put, hearing|Reply, hearing|The next turn in the transcript, hearing) day \d+ \(\d{1,2} [A-Z][a-z]+ \d{4}\), transcript page \S+: “[\s\S]+”$/
const research = (model, on) => api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown(), ...(on ? { transcriptQuotesOnly: true } : {}) })
const deps = on => ({ origin: 'https://offline.test', asset, kb: async () => ({ resources: {} }), generate: async () => ({ text: '{}' }), ...(on ? { transcriptQuotesOnly: true } : {}) })

test('a hearing-evidence question with the switch on: the answer is the block and no model writes any of it', async () => {
  const q = 'What evidence was given at the Robodebt Royal Commission about income averaging?'
  const search = { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 2 }
  const run = async on => {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++; return call === 1 ? reply('royal_commissions', search) : call === 2 ? reply('answer', { facts: [2, 3], points: [{ claim: 'Ms Quellworth told the commission the department knew averaging was unlawful.' }] })
      : said(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'A written sentence about the hearing.', facts: [1] }] })) } })
    const out = await api.runAgentic(q, { ...deps(on), research: research(model, on) }, async () => {}, 40000, undefined, {}, named)
    return { out, calls: model.doGenerateCalls.length }
  }
  const on = await run(true)
  assert.equal(on.out.answered, true)
  const lines = on.out.answer.split('\n\n')
  assert.equal(lines[0], LEAD); assert.ok(lines.length >= 2 && lines.slice(1).every(line => BLOCK_LINE.test(line)), on.out.answer)
  assert.equal(on.calls, 2, 'research made its two calls and the writer was never called')
  assert.equal(on.out.qualitative.machine_written, false); assert.equal(on.out.research.transcript_quotes_only, true); validRanges(on.out.qualitative)
  assert.doesNotMatch(on.out.answer, /Quellworth|A written sentence/)
  // Off: the writer is called and words the excerpts, as before this change, and the record carries no switch field.
  const off = await run(false)
  assert.equal(off.calls, 3); assert.doesNotMatch(off.out.answer, /These passages from the hearing transcripts matched your question/); assert.equal('transcript_quotes_only' in off.out.research, false)
})

test('a mixed answer with the switch on: the writer is given no transcript fact and words the other records above the block; uncited points and the text form are not shown', async () => {
  const q = 'What did the Robodebt Royal Commission recommend about debts?'
  const heard = await api.callTool(deps(true), 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 1 })
  const recs = await api.callTool(deps(true), 'royal_commissions', { view: 'recommendations', commission: 'robodebt', words: 'debts', limit: 1 })
  const at = recs.citations.findIndex(c => /recommendation \d/.test(c.text)); assert.ok(at >= 0)
  const recFact = heard.citations.length + at + 1, excerptFact = heard.citations.findIndex(c => api.transcriptTurns(c.text).length) + 1; assert.ok(excerptFact > 0)
  const excerpt = api.transcriptTurns(heard.citations[excerptFact - 1].text)[0].excerpt
  const run = async (answer, on = true) => {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async options => { call++
      if (call === 1) return reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 1 })
      if (call === 2) return reply('royal_commissions', { view: 'recommendations', commission: 'robodebt', words: 'debts', limit: 1 })
      if (call === 3) return reply('answer', answer)
      // The writer: it words the first fact it was given.
      const given = JSON.parse(options.prompt.at(-1).content.map(part => part.text ?? '').join('')).facts
      return said(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'The Royal Commission made a recommendation about debts.', facts: [given[0].id] }] })) } })
    const out = await api.runAgentic(q, { ...deps(on), research: research(model, on) }, async () => {}, 40000, undefined, {}, named)
    return { out, model }
  }
  // Facts from both kinds of record, an uncited point that words the evidence, and a point citing the recommendation.
  const { out, model } = await run({ facts: [excerptFact, recFact], points: [{ claim: 'Ms Quellworth told the commission the department knew averaging was unlawful.' }, { id: `fact-${recFact}`, claim: 'The Commission made a recommendation on debts.' }] })
  assert.equal(out.answered, true)
  const lines = out.answer.split('\n\n'), lead = lines.indexOf(LEAD)
  assert.ok(lead > 0, out.answer)
  // Everything from the lead line on is the block; everything above it is about the other records.
  assert.ok(lines.slice(lead + 1).length >= 1 && lines.slice(lead + 1).every(line => BLOCK_LINE.test(line)), out.answer)
  assert.ok(lines.slice(0, lead).every(line => !/“/.test(line) && !/hearing day/i.test(line)), out.answer)
  assert.doesNotMatch(out.answer, /Quellworth|knew averaging was unlawful/)
  assert.ok(out.answer.includes(`“${excerpt}”`), `${excerpt}\n---\n${out.answer}`); validRanges(out.qualitative)
  // The writer's prompt held the recommendation and no hearing transcript fact or excerpt.
  const writerPrompt = JSON.stringify(model.doGenerateCalls.at(-1).prompt)
  assert.equal(model.doGenerateCalls.length, 4)
  const givenFacts = JSON.parse(model.doGenerateCalls.at(-1).prompt.at(-1).content.map(part => part.text ?? '').join('')).facts
  assert.ok(givenFacts.length >= 1 && givenFacts.every(f => !f.text.includes(LABEL) && !f.transcript), JSON.stringify(givenFacts).slice(0, 400))
  assert.equal(writerPrompt.includes(excerpt.slice(0, 60).replace(/"/g, '\\\\\\"')), false)
  // The text form, with an excerpt held, is not shown: the excerpts are quoted instead.
  const legacy = await run({ text: 'Ms Quellworth told the commission the department knew averaging was unlawful.', citations: [] })
  assert.equal(legacy.out.answered, true); assert.doesNotMatch(legacy.out.answer, /Quellworth|knew averaging/)
  assert.ok(legacy.out.answer.split('\n\n').includes(LEAD), legacy.out.answer)
  // Off, the same text form is the answer the stack gives today.
  const before = await run({ text: 'Ms Quellworth told the commission the department knew averaging was unlawful.', citations: [] }, false)
  assert.doesNotMatch(before.out.answer, /These passages from the hearing transcripts matched your question/)
})

// ---- After run 4b and its independent read (16 November 2026) ----
test('the switch reaches the transcript tool through the Ask run\'s own tool runner', async () => {
  // In run 4b it did not: the runner rebuilt the tool environment without it, so no question was paired with a reply.
  const args = { view: 'transcripts', commission: 'nsw-healthcare-funding', words: 'duress alarm', limit: 4 }
  const base = { origin: 'https://offline.test', asset, kb: async () => ({ resources: {} }) }
  const on = await api.runTool({ ...base, transcriptQuotesOnly: true }, 'royal_commissions', args), off = await api.runTool(base, 'royal_commissions', args)
  const text = result => result.cite.map(c => c.label ?? c.text ?? '').join('\n') + JSON.stringify(result.data?.citations ?? result.data ?? '')
  assert.equal(on.ok, true); assert.equal(off.ok, true)
  assert.notEqual(text(on), text(off), 'the passages differ with the switch on')
  assert.match(text(on), /question put: |reply given: /); assert.doesNotMatch(text(off), /question put: |reply given: /)
})

test('a passage is whole sentences within 280 characters, a cut is always marked, and a marked question is shown with its reply', async () => {
  const ix = { docs: [{ key: 'k1', file: '/transcripts/cth-example/transcript-k1.json' }] }
  const long = 'The department had by then prepared, over several weeks and with the help of the legal area and two outside advisers whose names I do not now recall, a minute for the executive that set out each of the options and the reasons the earlier advice had not gone to the minister before the budget measure was announced, and I read every page of it shredded or not.'
  const doc = { key: 'k1', quote_policy: 'quote', attribution: 'Example attribution', licence_url: 'https://example.test/licence', pdf_url: 'https://example.test/day-1.pdf', terms: { alarm: [2], shredded: [4], ledger: [5], tested: [3] },
    pages: [
      { n: 2, folio: '10', text: 'Q. I will come to the roster shortly. Was the alarm working that night? Take your time.\nA. No. It had not worked for weeks. We had reported it twice to the manager on duty.' },
      { n: 3, folio: '11', text: 'A. Nobody tested it after that.\nMS TALLOWAY: I tender that document.' },
      { n: 4, folio: '12', text: `Q. What became of the drafts?\nA. ${long}` },
      { n: 5, folio: '13', text: 'THE COMMISSIONER: Is the ledger in evidence?\nMS TALLOWAY: It is, Commissioner.' },
    ] }
  const hits = async terms => (await api.pageHits({ origin: 'https://opax.test', asset: async () => doc, transcriptQuotesOnly: true }, ix, 'k1', terms)).hits
  // The match is in a question: whole sentences from the one holding the word, and the reply given to it.
  const [alarm] = await hits(['alarm'])
  assert.equal(alarm.excerpt, 'Was the alarm working that night? Take your time.')
  assert.deepEqual(alarm.reply, { pdf_page: 2, transcript_page: '10', text: 'No. It had not worked for weeks. We had reported it twice to the manager on duty.' })
  assert.equal(alarm.question, undefined)
  // The match is in a reply that opens its page: the question closes the page before, with that page.
  const [tested] = await hits(['tested'])
  assert.equal(tested.excerpt, 'Nobody tested it after that.'); assert.equal(tested.reply, undefined)
  // (Page 3's reply follows page 2's reply, not a question: nothing is paired.)
  assert.equal(tested.question, undefined)
  // One sentence longer than 280 characters, with the word near its end: cut at words and marked at both ends.
  const [shredded] = await hits(['shredded'])
  assert.ok(shredded.excerpt.startsWith('...') && shredded.excerpt.length <= 286, shredded.excerpt)
  assert.ok(shredded.excerpt.endsWith('shredded or not.'), shredded.excerpt)
  assert.ok(long.includes(shredded.excerpt.replace(/^\.\.\./, '')), 'verbatim')
  assert.deepEqual(shredded.question, { pdf_page: 4, transcript_page: '12', text: 'What became of the drafts?' })
  // Headed turns are not a marked pair: the question stands alone, and no speaker or role is read.
  const [ledger] = await hits(['ledger'])
  assert.equal(ledger.excerpt, 'Is the ledger in evidence?'); assert.equal(ledger.reply, undefined); assert.equal(ledger.question, undefined)
  // In the block a pair is two quotations, each with its own page, under the two code-made labels.
  const row = `Example Royal Commission, Transcript Hearing Day 6 (5 March 2024), transcript page 10 (PDF page 2), hearing turn: "${alarm.excerpt}" transcript page 10 (PDF page 2), reply given: "${alarm.reply.text}" ${LABEL}. © Example, licensed under CC BY 4.0.`
  assert.deepEqual(api.transcriptTurns(row), [{ page: '10', excerpt: alarm.excerpt, day: '6', date: '5 March 2024', reply: { page: '10', excerpt: alarm.reply.text } }])
  assert.deepEqual(api.quotationBlock({ question: hearingQuestion, period, facts: facts([row]) }).answer.split('\n\n').slice(1), [
    'Question put, hearing day 6 (5 March 2024), transcript page 10: “Was the alarm working that night? Take your time.”',
    'Reply, hearing day 6 (5 March 2024), transcript page 10: “No. It had not worked for weeks. We had reported it twice to the manager on duty.”',
  ])
})

test('the relevance floor: with labels sent, only labelled excerpts are shown, and with none kept one fixed line stands where the block would', () => {
  const held = facts([row(46, '10 March 2023', turn('P-4938', 'The draft advice went to the acting chief counsel.')), row(44, '8 March 2023', turn('P-4698', 'Was legal advice sought on averaging?'))])
  const labelled = held.map((f, i) => i === 1 ? { ...f, bears_on: 'legal advice' } : f)
  assert.deepEqual(api.quotationBlock({ question: hearingQuestion, period, facts: labelled, selected: true }).answer.split('\n\n'), [LEAD, 'Hearing day 44 (8 March 2023), transcript page P-4698: “Was legal advice sought on averaging?”'])
  const none = api.quotationBlock({ question: hearingQuestion, period, facts: held, selected: true })
  assert.equal(none.answer, 'OPAX found passages in the hearing transcripts, but none that it judged to answer this question.'); assert.equal(none.answer, api.NO_PASSAGE_SELECTED)
  assert.deepEqual(none.citations, {}); assert.equal(none.machine_written, false)
  // No labels sent (or a stopped run): every held excerpt, as before.
  assert.equal(api.quotationBlock({ question: hearingQuestion, period, facts: held }).answer.split('\n\n').length, 3)
})

test('a hearing question under the switch, by commission and hearing word; and with no excerpt held the answer is the fixed line, never model prose about the record', async () => {
  // NP-NSW-09 in run 4b: not a hearing-evidence question by the narrow test, so the writer was handed the transcript
  // count row and wrote that no such evidence is recorded.
  const q = 'Who gave evidence to the NSW Healthcare Funding inquiry about general practice training, and what did they say?'
  assert.equal(api.commissionHearingQuestion(q), true)
  for (const yes of ['What did the Robodebt Royal Commission hear about income averaging?', 'What evidence was given at the Robodebt Royal Commission about income averaging?']) assert.equal(api.commissionHearingQuestion(yes), true, yes)
  for (const no of ['What did the Robodebt Royal Commission recommend about debts?', 'What did witnesses tell the Senate inquiry into consulting services?', 'What did the inquiry into supermarket prices hear?', 'Which donors gave the most to the Liberal Party in 2022-23?']) assert.equal(api.commissionHearingQuestion(no), false, no)
  assert.equal(api.NO_PASSAGE_FOUND, 'OPAX searched the hearing transcripts for this question and found no matching passage.')
  const run = async (on, answer) => {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { call++
      // A text search that matches nothing: the count row, no excerpt. Then the answer the model gave in 4b.
      if (call === 1) return reply('royal_commissions', { view: 'transcripts', commission: 'nsw-healthcare-funding', words: 'xylophonist', limit: 2 })
      if (call === 2) return reply('answer', answer)
      return said(JSON.stringify({ answer_decision: 'answer', sentences: [{ text: 'No witness evidence about general practice training is recorded in the transcripts held in the public record.', facts: [1] }] })) } })
    const out = await api.runAgentic(q, { ...deps(on), research: research(model, on) }, async () => {}, 40000, undefined, {}, named)
    return { out, model }
  }
  const selected = { facts: [1], points: [{ claim: 'No witness evidence about general practice training is recorded.' }] }
  const on = await run(true, selected)
  assert.equal(on.out.answered, true)
  assert.equal(on.out.answer, 'OPAX searched the hearing transcripts for this question and found no matching passage.')
  assert.doesNotMatch(on.out.answer, /is recorded|no witness/i)
  // No writing call was made: there was nothing but transcript rows, and the writer is given none of them.
  assert.equal(on.model.doGenerateCalls.length, 2)
  // Off: the writer is called with the count row, as before this change.
  const off = await run(false, selected)
  assert.equal(off.model.doGenerateCalls.length, 3); assert.doesNotMatch(off.out.answer, /OPAX searched the hearing transcripts/)
})

test('headed transcripts: a turn that ends in a question is shown with the turn printed after it, labelled only as the next turn; no heading is in a quotation or a label', async () => {
  const env = { origin: 'https://offline.test', asset, transcriptQuotesOnly: true }
  const ix = await api.textIndex(env)
  const found = { commissioner: 0, acrossPages: 0, pairs: 0 }
  for (const commission of ['cth-robodebt', 'cth-antisemitism']) {
    let checked = 0
    for (const d of ix.docs.filter(d => d.commission === commission && d.quote_policy === 'quote').slice(0, 14)) {
      const doc = await asset(d.file)
      for (const page of doc.pages) {
        if (typeof page.text !== 'string') continue
        const { text: flat, turns } = api.pageTurns(page.text, page.n)
        for (const [i, turn] of turns.entries()) {
          if (turn.opens !== 'heading' || turn.mark || !/\?$/.test(flat.slice(turn.start, turn.end).trimEnd())) continue
          // A word that is first spoken on this page inside this turn's last sentence, so the hit lands on it.
          const body = flat.slice(turn.start, turn.end), last = body.slice(Math.max(0, body.length - 200))
          const word = (last.toLowerCase().match(/[a-z]{6,}/g) ?? []).find(w => doc.terms[w]?.includes(page.n) && flat.toLowerCase().search(new RegExp(`\\b${w}`)) >= turn.start + body.length - last.length)
          if (!word) continue
          const hit = (await api.pageHits(env, ix, d.key, [word], 400)).hits.find(h => h.pdf_page === page.n)
          if (!hit) continue
          const nextOnPage = turns[i + 1], nextPage = doc.pages.find(p => p.n === page.n + 1)
          const after = nextOnPage ? { turn: nextOnPage, flat, folio: page.folio } : typeof nextPage?.text === 'string' ? (() => { const read = api.pageTurns(nextPage.text, nextPage.n); return read.turns[0] ? { turn: read.turns[0], flat: read.text, folio: nextPage.folio } : null })() : null
          const speaker = t => /^(?:THE|MR|MS|MRS|DR|PROFESSOR|COMMISSIONER|SENATOR|COUNSEL|JUSTICE)\b/.test(t.heading ?? '')
          if (!speaker(turn)) continue
          if (!after || after.turn.opens !== 'heading' || after.turn.mark || after.turn.end <= after.turn.start || !speaker(after.turn)) { if (!after || after.turn.opens !== 'heading') assert.equal(hit.next, undefined, `${d.key} page ${page.n}: nothing headed follows`); continue }
          if (!/\?["”’')\]]*$/.test(hit.excerpt)) continue
          assert.ok(hit.next, `${d.key} page ${page.n}: ${word}`)
          checked++; found.pairs++
          // The next turn's own page, and its words from the start of the turn, verbatim.
          assert.equal(hit.next.transcript_page, after.folio ?? null)
          const spoken = after.flat.slice(after.turn.start, after.turn.end)
          assert.ok(spoken.startsWith(hit.next.text.replace(/\.\.\.$/, '')), `${d.key} page ${page.n}`); assert.ok(hit.next.text.length <= 283)
          // The speaker headings are in neither quotation.
          // Each passage lies wholly inside its turn's spoken words, which start after the heading: the heading
          // itself ("MR SURNAME:", "THE COMMISSIONER:") is in neither quotation.
          assert.ok(turn.heading && after.turn.heading)
          assert.ok(body.includes(hit.excerpt.replace(/^\.\.\.|\.\.\.$/g, '')), `${d.key} page ${page.n}`)
          assert.equal(flat.slice(turn.from, turn.start).includes(turn.heading), true)
          for (const heading of [turn.heading, after.turn.heading]) { assert.equal(hit.excerpt.startsWith(heading), false, heading); assert.equal(hit.next.text.startsWith(heading), false, heading) }
          if (/COMMISSIONER/.test(after.turn.heading)) found.commissioner++
          if (!nextOnPage) found.acrossPages++
        }
      }
    }
    assert.ok(checked >= 5, `${commission}: ${checked} pairs checked`)
  }
  // Among them: a question followed by the Commissioner, and a question at the foot of a page whose next turn opens the next page.
  assert.ok(found.commissioner >= 1, JSON.stringify(found)); assert.ok(found.acrossPages >= 1, JSON.stringify(found))
  // In the block the second quotation carries the fixed label and its own page, and no name.
  const row = `Example Royal Commission, Transcript Hearing Day 46 (10 March 2023), transcript page P-4899 (PDF page 15), hearing turn: "Were you raising those concerns?" transcript page P-4900 (PDF page 16), next turn: "Yes, I was." ${LABEL}. © Example, licensed under CC BY 4.0.`
  assert.deepEqual(api.quotationBlock({ question: hearingQuestion, period, facts: facts([row]) }).answer.split('\n\n').slice(1), [
    'Hearing day 46 (10 March 2023), transcript page P-4899: “Were you raising those concerns?”',
    'The next turn in the transcript, hearing day 46 (10 March 2023), transcript page P-4900: “Yes, I was.”',
  ])
  const prior = `Example Royal Commission, Transcript Hearing Day 46 (10 March 2023), transcript page P-4899 (PDF page 15), turn before: "Were you raising those concerns?" transcript page P-4900 (PDF page 16), hearing turn: "Yes, I was." ${LABEL}. © Example, licensed under CC BY 4.0.`
  assert.deepEqual(api.quotationBlock({ question: hearingQuestion, period, facts: facts([prior]) }).answer.split('\n\n').slice(1), [
    'Hearing day 46 (10 March 2023), transcript page P-4899: “Were you raising those concerns?”',
    'The next turn in the transcript, hearing day 46 (10 March 2023), transcript page P-4900: “Yes, I was.”',
  ])
})
