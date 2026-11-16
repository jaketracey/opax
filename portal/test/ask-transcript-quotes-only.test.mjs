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
  "export {pageHits} from './src/tools/transcript-text'",
  "export {transcriptTurns, withTranscriptNote} from './src/transcript-answer'",
  "export {writingFacts, writingPrompt, proseFallback, quotationBlock, joinWritten, QUOTES_LEAD} from './src/research-writing'",
  "export {hearingFallbackPayload} from './src/ask-hearing-fallback'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {createResearch} from './src/research-loop'",
  "export {runAgentic} from './src/agentic-ask'",
  "export {createResearchCreditCooldown} from './src/research-credit'",
  "export {callTool} from './src/tools/index'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('These tests must not make network requests') }
test.after(() => { globalThis.fetch = savedFetch })

const LABEL = 'Hearing transcript: evidence, not findings'
const LEAD = 'Here is what the hearing transcripts record on this, in the order it was heard.'
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
  assert.equal(long.excerpt, 'Yes, shredded.'); assert.match(long.question.text, /^\.\.\.\S.* Were the drafts destroyed\?$/); assert.ok(long.question.text.length <= 283)
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
    'Hearing day 46 (10 March 2023), transcript page P-4901, the question put: “And you prepared the instructions?”',
    'Hearing day 46 (10 March 2023), transcript page P-4902, the reply: “I did.”',
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
  assert.equal(off.length, 4); assert.ok(off.every(line => /^The hearing transcript records on hearing day \d+ \(\d{1,2} [A-Z][a-z]+ \d{4}\): “[^”]+”$/.test(line)), off.join('\n'))
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
  assert.deepEqual(lines.slice(0, 4), [LEAD, 'Hearing day 44 (8 March 2023), transcript page P-4698: “Was legal advice sought on averaging?”', 'Hearing day 46 (10 March 2023), transcript page P-4901, the question put: “And you prepared the instructions?”', 'Hearing day 46 (10 March 2023), transcript page P-4902, the reply: “I did.”'])
  assert.equal(out.answer.match(/evidence, not findings/g)?.length, 1, out.answer); validRanges(out)
  // A written paragraph about another record goes first; the block follows it unbroken.
  const written = { answer: 'The report recommended that debts raised by averaging be reviewed.', citations: { 'fact-9/t/body/0': [[0, 66]] }, sources: [{ resource: 'fact-9', slug: '', title: 'Report', href: 'https://commission.example/report', url: 'https://commission.example/report', snippet: 'Debts raised by averaging should be reviewed.', cited: true, kind: 'record' }], answer_decision: 'answer', machine_written: true }
  const joined = api.joinWritten(written, block)
  assert.equal(joined.answer, written.answer + '\n\n' + block.answer); assert.equal(joined.machine_written, true); validRanges(joined)
  assert.deepEqual(joined.citations['fact-9/t/body/0'], [[0, 66]])
  assert.ok(cited(joined).includes('Hearing day 46 (10 March 2023), transcript page P-4902, the reply: “I did.”'))
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
const BLOCK_LINE = /^Hearing day \d+ \(\d{1,2} [A-Z][a-z]+ \d{4}\), transcript page \S+(?:, the (?:question put|reply))?: “[^”]+”$/
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
  assert.equal(off.calls, 3); assert.doesNotMatch(off.out.answer, /Here is what the hearing transcripts record/); assert.equal('transcript_quotes_only' in off.out.research, false)
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
  assert.ok(out.answer.includes(`“${excerpt}”`)); validRanges(out.qualitative)
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
  assert.doesNotMatch(before.out.answer, /Here is what the hearing transcripts record/)
})
