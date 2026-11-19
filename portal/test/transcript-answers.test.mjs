import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'

const built = await build({ stdin: { contents: [
  "export {excerpt, pageTurns, pageHits, dayWords, spanWords} from './src/tools/transcript-text'",
  "export {callTool} from './src/tools/index'",
  "export {transcriptListingOnly, withTranscriptNote, transcriptNoteResponse, TRANSCRIPT_LABEL, TRANSCRIPT_NOTE, TRANSCRIPT_NAMED_PEOPLE_RULE, NAMED_PEOPLE_EXCEPTION, TRANSCRIPT_POINT_RULE} from './src/transcript-answer'",
  "export {writingPrompt, ANSWER_WRITING_VERSION} from './src/research-writing'",
  "export {askOpaxResult} from './src/voice-sources'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {linkAskSources} from './src/ask-source-links'",
  "export {writingFacts, proseFallback} from './src/research-writing'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('Transcript answer tests must not make network requests') }
test.after(() => { globalThis.fetch = savedFetch })
const cache = new Map()
const env = { origin: 'https://opax.test', asset: async path => {
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')))
  return cache.get(path)
} }

const LABEL = 'Hearing transcript: evidence, not findings'
const IBAC = 'Independent Broad-based Anti-corruption Commission (IBAC), Operation Gloucester hearing transcript'
const COUNT = `OPAX lists 17 public hearing transcripts from the Independent Broad-based Anti-corruption Commission (IBAC) matching "Operation Gloucester", from 1 case, dated 4 February 2019 to 1 March 2019, newest first. ${LABEL}.`
const ROWS = ['1 March 2019, 48 pages', '28 February 2019, 67 pages', '26 February 2019 (part 1 of 2), 102 pages', '26 February 2019 (part 2 of 2), 57 pages', '12 February 2019, 136 pages, as redacted by the publisher']
/** The answer the loop composes from the integrity tool's own lines (live check of 12 Nov 2026). */
function listing(extra = '') {
  const sources = [{ resource: 'fact-1', kind: 'count', url: 'https://opax.com.au/integrity-reports/index.json', title: COUNT, snippet: COUNT, cited: true },
    ...ROWS.map((row, i) => ({ resource: `fact-${i + 2}`, kind: 'record', url: `https://www.ibac.vic.gov.au/t${i}.pdf`, title: `${IBAC}, ${row}. ${LABEL}.`, snippet: `${IBAC}, ${row}. ${LABEL}.`, cited: true }))]
  let answer = '', citations = {}
  for (const [i, s] of sources.entries()) {
    if (answer) answer += '\n\n'
    const line = i ? `- ${IBAC}, ${ROWS[i - 1]}. ` : COUNT, from = Array.from(answer).length
    answer += line; citations[`${s.resource}/t/body/0`] = [[from, Array.from(answer).length]]
  }
  return { answered: true, answer: answer + extra, citations, sources, answer_decision: 'answer' }
}

test('a transcript listing keeps every row: not read as a financial or count claim, no decline', () => {
  const payload = listing()
  const out = api.groundAnswerPayload(payload, "Which hearing transcripts are there for IBAC's Operation Gloucester?")
  assert.notEqual(out.answer_decision, 'limitation')
  assert.ok(out.answer.startsWith('OPAX lists 17 public hearing transcripts'))
  for (const row of ROWS) assert.ok(out.answer.includes(`${IBAC}, ${row}.`), row)
  assert.ok(!/[ \t]$/m.test(out.answer), 'no trailing spaces')
  assert.equal(Object.keys(out.citations).length, ROWS.length + 1)
})

test('empty list markers never ship', () => {
  for (const tail of ['\n\n- ', '\n\n-', '\n\n• ', '\n\n* [3]', '\n\n2. ']) {
    const out = api.groundAnswerPayload(listing(tail), "Which hearing transcripts are there for IBAC's Operation Gloucester?")
    assert.ok(!/^[ \t]*(?:[-*•]|\d+[.)])[ \t]*(?:\[\d+\][ \t]*)?$/m.test(out.answer), JSON.stringify(tail) + ' ' + JSON.stringify(out.answer.slice(-60)))
    assert.ok(out.answer.endsWith('as redacted by the publisher.'))
  }
})

test('people named in hearing evidence appear only inside a quotation: one fixed rule, given to the writer in every prompt', () => {
  const RULE = 'For a record labelled "Hearing transcript: evidence, not findings" (royal commission, integrity commission and inquiry hearings), name a person only inside quotation marks, in words copied exactly from the cited excerpt with nothing left out or added, never in your own words. In your own words, refer to them by a neutral description ("an officer", "a staff member"), or by a role only where the cited transcript page states that role; with no role stated there, use the neutral description. This covers everyone named in the evidence: witnesses, people they discuss, commissioners and counsel. It comes before every other instruction here about naming people or saying who said something. Hansard speeches, committee hearings and every other record keep their names.'
  assert.equal(api.TRANSCRIPT_NAMED_PEOPLE_RULE, RULE); assert.doesNotMatch(RULE, /—/)
  // Tied to the record's own label, so it cannot be read as covering Hansard or committee hearings.
  assert.ok(RULE.includes(`"${LABEL}"`))
  assert.equal(api.NAMED_PEOPLE_EXCEPTION, 'except people named in hearing transcript evidence')
  const contract = JSON.parse(api.writingPrompt({ question: 'What did the commission hear?', period: { kind: 'all', label: 'All time' }, facts: [] })).contract
  assert.ok(contract.includes(`licence details belong in the source card. ${RULE} `), 'the rule sits with the hearing excerpt sentence')
  // The shared rules carry the exception themselves, and the writer's "who" sentence carries it too.
  assert.ok(contract.includes('Name the people the records name, except in a record labelled ‘Hearing transcript: evidence, not findings’ (a royal commission, integrity commission or inquiry transcript), where a person is named only inside a verbatim quotation; Hansard and parliamentary committee hearings keep their names. '))
  assert.ok(contract.includes('For a who question, name the people and their roles first, then what the inquiry or record found about each, except people named in hearing transcript evidence; for why, give the reason'))
  // The research model's rule for excerpts: fixed text.
  assert.equal(api.TRANSCRIPT_POINT_RULE, 'Leave what a record labelled "Hearing transcript: evidence, not findings" (a royal commission, integrity commission or inquiry transcript) says out of your points and reply text, in your own words or quoted: select the excerpt\'s numeric record fact id, and the writer words it from the record. Hansard and parliamentary committee hearings stay in your points. ')
  // Stored answers written before the rule are retired.
  assert.equal(api.ANSWER_WRITING_VERSION, 'written-answer-35-excerpts-selected')
})

test('the writer is skipped only when every fact is a transcript listing row', async () => {
  const row = { text: `${IBAC}, 1 March 2019, 48 pages. ${LABEL}.` }
  const coverage = { text: 'Transcripts are listed as each commission published them.', coverage: true }
  assert.equal(api.transcriptListingOnly([row, coverage]), true)
  assert.equal(api.transcriptListingOnly([coverage]), false)
  assert.equal(api.transcriptListingOnly([row, { text: 'NSW ICAC, Operation Wyvern report, page 12: "a finding".' }]), false)
  assert.equal(api.transcriptListingOnly([{ text: `Royal Commission into the Robodebt Scheme, Day 12 (1 November 2022), transcript page 1203 (PDF page 9), hearing turn by Ms Quellworth: "income averaging". ${LABEL}.` }]), false, 'excerpts go to the writer')
  for (const file of ['royal-commissions', 'integrity-reports']) assert.match(await readFile(new URL(`../src/tools/${file}.ts`, import.meta.url), 'utf8'), new RegExp(`TRANSCRIPT_LABEL = '${api.TRANSCRIPT_LABEL}'`))
})

test('transcript counts give their dates in words', async () => {
  assert.equal(api.dayWords('2022-09-27'), '27 September 2022'); assert.equal(api.dayWords('2019-03-01'), '1 March 2019')
  assert.equal(api.spanWords('2022-09-27', '2023-03-10'), '27 September 2022 to 10 March 2023'); assert.equal(api.spanWords('2019-03-01', '2019-03-01'), '1 March 2019')
  const rc = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', limit: 2 })
  assert.match(rc.citations[0].text, /^OPAX lists \d+ hearing transcripts from the Royal Commission into the Robodebt Scheme, dated \d{1,2} [A-Z][a-z]+ 2022 to \d{1,2} [A-Z][a-z]+ 2023 \(/)
  for (const c of rc.citations) assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(c.text), c.text)
  const profile = await api.callTool(env, 'royal_commissions', { view: 'profile', commission: 'robodebt' })
  for (const c of profile.citations) assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(c.text), c.text)
  const ibac = await api.callTool(env, 'integrity_reports', { view: 'transcripts', body: 'IBAC', operation: 'Gloucester', limit: 2 })
  assert.match(ibac.citations[0].text, /, dated 4 February 2019 to 1 March 2019, newest first\./)
})

// Invented names only: none occurs under public/transcripts.
const PAGE = ['and the averaging went on for years.', 'MS QUELLWORTH: I tender the statement about income', 'support. The CE: wrote to the board.',
  'Q. Did the scheme rely on averaging?', 'A. Yes, averaging was applied to each debt.', 'THE COMMISSIONER: Q. For how long?', 'A. Four seasons.',
  '<THE WITNESS WITHDREW', '<EXHIBIT 12 STATEMENT OF ALEX', 'EXAMPLE 01/02/2020', 'A/PROFESSOR THRUPPLE: Thank you.', 'MR De LOREN: No questions.',
  'MS L VANTERPOOL: Nor from me.', 'SENATOR THE HON. ALEX EXAMPLE: May I add a point.', 'Commissioner: Yes.', 'MR VANTERPOOL SC:'].join('\n')

test('a page is read into turns one line at a time, each with its heading as printed', () => {
  const { text, turns } = api.pageTurns(PAGE)
  assert.equal(text, PAGE.replace(/\s+/g, ' ').trim())
  assert.deepEqual(turns.map(t => [t.opens, t.heading ?? null, t.mark ?? null, text.slice(t.start, t.end)]), [
    ['page', null, null, 'and the averaging went on for years.'],
    ['heading', 'MS QUELLWORTH', null, 'I tender the statement about income support. The CE: wrote to the board.'],
    ['mark', null, 'Q', 'Did the scheme rely on averaging?'],
    ['mark', null, 'A', 'Yes, averaging was applied to each debt.'],
    ['mark', 'THE COMMISSIONER', 'Q', 'For how long?'],
    ['mark', null, 'A', 'Four seasons.'],
    ['note', null, null, ''],
    ['heading', 'A/PROFESSOR THRUPPLE', null, 'Thank you.'],
    ['heading', 'MR De LOREN', null, 'No questions.'],
    ['heading', 'MS L VANTERPOOL', null, 'Nor from me.'],
    ['heading', 'SENATOR THE HON. ALEX EXAMPLE', null, 'May I add a point.'],
    ['heading', 'Commissioner', null, 'Yes.'],
    ['heading', 'MR VANTERPOOL SC', null, ''],
  ])
  for (const t of turns) assert.ok(t.from <= t.start && t.start <= t.end && t.end <= text.length)
  assert.equal(text.slice(turns[4].from, turns[4].start), 'THE COMMISSIONER: Q. ', 'from is where the opener begins')
  // A heading is read from the start of a line only, and never joins the line above.
  assert.deepEqual(api.pageTurns('<EXHIBIT 3 STATEMENT OF\nALEX EXAMPLE\nMS QUELLWORTH: Thank you.').turns.map(t => [t.opens, t.heading ?? null]), [['note', null], ['heading', 'MS QUELLWORTH']])
  assert.deepEqual(api.pageTurns('We wrote to the CE: no reply came.').turns.map(t => t.opens), ['page'])
  const read = page => { const { text, turns } = api.pageTurns(page); return turns.map(t => [t.opens, t.heading ?? t.mark ?? null, text.slice(t.start, t.end)]) }
  // A heading or a mark printed without its colon or full stop still opens a turn: a heading the page prints
  // elsewhere with its colon, or a role in capitals, then a space, ".", ";" or "--".
  assert.deepEqual(read('and that was all.\nMS QUELLWORTH I noticed before that you paused.\nA. Yes.\nQ -- "You look tired."\nTHE WITNESS thank you.\nMS QUELLWORTH: Nothing further.\nTHE COMMISSIONER; no.\nMS QUELLWORTH. Yes.\nTHE COMMISSIONER -- between the two.'), [
    ['page', null, 'and that was all.'], ['heading', 'MS QUELLWORTH', 'I noticed before that you paused.'], ['mark', 'A', 'Yes.'], ['mark', 'Q', '"You look tired."'],
    ['heading', 'THE WITNESS', 'thank you.'], ['heading', 'MS QUELLWORTH', 'Nothing further.'], ['heading', 'THE COMMISSIONER', 'no.'], ['heading', 'MS QUELLWORTH', 'Yes.'], ['heading', 'THE COMMISSIONER', 'between the two.']])
  // Capital words at a line start are otherwise text, as is a name the page never prints as a heading.
  assert.deepEqual(read('MS QUELLWORTH: I spoke to\nTHE NSW Government and to\nMR VANTERPOOL about it, and to\nMS QUELLWORTH SC and others.'), [['heading', 'MS QUELLWORTH', 'I spoke to THE NSW Government and to MR VANTERPOOL about it, and to MS QUELLWORTH SC and others.']])
  // Title case is counsel addressing a witness, not a heading; a role word alone is one.
  assert.deepEqual(read('MS QUELLWORTH: Thank you.\nDr Thrupple: at the time you were in charge?\nCommissioner: Go on.'), [['heading', 'MS QUELLWORTH', 'Thank you. Dr Thrupple: at the time you were in charge?'], ['heading', 'Commissioner', 'Go on.']])
  // A run holding a digit or a quote mark, or a long run of capitals with no title, is not a speaker's heading.
  assert.deepEqual(read('MS QUELLWORTH: I tender these.\nABC.0001.0002.0003_R RE: the request\n‘RE: the reply\nA SYSTEM ON THE BRINK OF COLLAPSE: a report\nAND We: so declare.').map(t => t[0]), ['heading'])
  // An examination line, an adjournment and an exhibit line are notes with or without the "<".
  assert.deepEqual(read('MS QUELLWORTH: Thank you.\nSHORT ADJOURNMENT\nTHE COMMISSIONER: Yes.\nEXHIBIT #A1 JOINT REPORT OF ALEX EXAMPLE\nAND ANOTHER [ABC.0001.0002.0003]\nFURTHER EXAMINATION BY MS QUELLWORTH:\nMS QUELLWORTH: Q. One more matter.\nADJOURNED TO THURSDAY AT 10AM'), [
    ['heading', 'MS QUELLWORTH', 'Thank you.'], ['note', null, ''], ['heading', 'THE COMMISSIONER', 'Yes.'], ['note', null, ''], ['mark', 'MS QUELLWORTH', 'One more matter.'], ['note', null, '']])
  // A word index and an exhibit list are not hearing turns.
  const index = ['ability [3] - 1023:4,', '1031:12, 1040:7', 'able [2] - 1011:30,', '1012:2', 'about [41] - 1001:9,'].join('\n')
  const exhibits = ['12. ABC.0001.0002.0003 Letter to the board', 'RE: the request', '13. ABC.0001.0002.0004 Reply from the board', 'FW: the reply', 'dated 1 February 2020', '14. ABC.0001.0002.0005 Minute', '15. ABC.0001.0002.0006 Email'].join('\n')
  for (const page of [index, exhibits]) { assert.deepEqual(api.pageTurns(page).turns, []); assert.deepEqual(api.excerpt(page, ['board', 'able']), { excerpt: '' }) }
  // An exhibit list is also known by how it opens, whatever its rows hold.
  for (const top of ['Exhibit List', 'Exhibit\nDocument ID Document title Date', 'Exhibit Document ID Document title Date']) assert.deepEqual(api.pageTurns(`${top}\n12. Letter to the board\nMS QUELLWORTH: wrote on 1 February.`).turns, [])
  assert.equal(api.pageTurns('Exhibit 12 is the letter.\nMS QUELLWORTH: Thank you.').turns.length, 2, 'evidence that opens with the word is still read')
  // A line marking a document for identification is a note.
  assert.deepEqual(read('MS QUELLWORTH: I ask that it be marked.\nMFI #4 OUTLINE OF EVIDENCE OF ALEX EXAMPLE\nTHE COMMISSIONER: Yes.'), [['heading', 'MS QUELLWORTH', 'I ask that it be marked.'], ['note', null, ''], ['heading', 'THE COMMISSIONER', 'Yes.']])
  // PDF page 1 is the cover: appearances, not evidence.
  const cover = 'Before: The Commissioner\nMS ALEX QUELLWORTH SC, Senior Counsel Assisting\nMR SAM VANTERPOOL, for the board'
  assert.deepEqual(api.pageTurns(cover, 1).turns, []); assert.deepEqual(api.excerpt(cover, ['counsel'], 1), { excerpt: '' }); assert.equal(api.pageTurns(cover, 2).turns.length, 1)
})

test('an excerpt is the words of one turn: no heading, mark or note in it, and no speaker', () => {
  const quote = (...words) => api.excerpt(PAGE, words)
  assert.deepEqual(quote('tender'), { excerpt: 'I tender the statement about income support. The CE: wrote to the board.' })
  assert.deepEqual(quote('applied'), { excerpt: 'Yes, averaging was applied to each debt.' }, 'an answer stays inside the "A." turn')
  assert.deepEqual(quote('rely'), { excerpt: 'Did the scheme rely on averaging?' })
  assert.deepEqual(quote('long'), { excerpt: 'For how long?' }, 'a mark straight after a heading')
  assert.deepEqual(quote('years'), { excerpt: 'and the averaging went on for years.' }, 'the top of the page stops at the first heading')
  // A search word in a heading gives the words that heading opens; in a note, or a heading with no words, nothing.
  assert.deepEqual(quote('quellworth', 'averaging'), { excerpt: 'and the averaging went on for years.' })
  assert.deepEqual(quote('thrupple'), { excerpt: 'Thank you.' })
  assert.deepEqual(quote('loren'), { excerpt: 'No questions.' })
  assert.deepEqual(quote('vanterpool'), { excerpt: 'Nor from me.' })
  assert.deepEqual(quote('senator'), { excerpt: 'May I add a point.' })
  assert.deepEqual(quote('exhibit'), { excerpt: '' })
  // A word printed in a note or a heading and spoken later on the page is quoted where it is spoken.
  assert.deepEqual(api.excerpt('<EXHIBIT 4 STATEMENT ON AVERAGING\nMS QUELLWORTH: I tender it.\nA. The averaging was wrong.', ['averaging']), { excerpt: 'The averaging was wrong.' })
  assert.deepEqual(api.excerpt('MS QUELLWORTH: Thank you.\nTHE COMMISSIONER: Ms Quellworth, go on.', ['quellworth']), { excerpt: 'Ms Quellworth, go on.' })
  assert.deepEqual(quote('withdrew'), { excerpt: '' })
  // A page of headings only, as before.
  const page = 'that is the position.\nMS QUELLWORTH: Thank you, Commissioner. I want to ask about income averaging and how\nthe scheme applied it to each debt.\nCOMMISSIONER: Yes.\nMR VANTERPOOL SC: Income averaging was raised later.'
  assert.deepEqual(api.excerpt(page, ['income', 'averaging']), { excerpt: 'Thank you, Commissioner. I want to ask about income averaging and how the scheme applied it to each debt.' })
  assert.deepEqual(api.excerpt('averaging continued from the last page, said the witness.\nTHE COMMISSIONER:: Noted.', ['averaging']), { excerpt: 'averaging continued from the last page, said the witness.' })
  // A long turn is cut at words, inside the turn.
  const long = api.excerpt(`MS QUELLWORTH: ${'word '.repeat(40)}averaging ${'more '.repeat(80)}\nCOMMISSIONER: Yes.`, ['averaging'])
  assert.match(long.excerpt, /^\.\.\.word .*averaging more .* more\.\.\.$/); assert.ok(long.excerpt.length < 300)
})

test('a page with nothing to quote is not offered as a hit', async () => {
  const doc = { key: 'k1', quote_policy: 'quote', attribution: 'Example attribution', licence_url: 'https://example.test/licence', pdf_url: 'https://example.test/day-1.pdf', terms: { vanterpool: [1, 2] },
    pages: [{ n: 1, folio: '10', text: 'The evidence closed.\nMR VANTERPOOL:' }, { n: 2, folio: '11', text: 'MR VANTERPOOL: Thank you.' }] }
  const found = await api.pageHits({ origin: 'https://opax.test', asset: async () => doc }, { docs: [{ key: 'k1', file: '/transcripts/cth-example/transcript-k1.json' }] }, 'k1', ['vanterpool'])
  assert.deepEqual(found.hits, [{ pdf_page: 2, transcript_page: '11', url: 'https://example.test/day-1.pdf#page=2', excerpt: 'Thank you.' }])
  // The best two pages are chosen among those with something to quote: an empty page does not cost a place.
  const three = { ...doc, terms: { vanterpool: [1, 2, 3] }, pages: [...doc.pages, { n: 3, folio: '12', text: 'MR VANTERPOOL: No questions.' }] }
  const both = await api.pageHits({ origin: 'https://opax.test', asset: async () => three }, { docs: [{ key: 'k1', file: '/transcripts/cth-example/transcript-k1.json' }] }, 'k1', ['vanterpool'])
  assert.deepEqual(both.hits.map(h => [h.pdf_page, h.excerpt]), [[2, 'Thank you.'], [3, 'No questions.']])
  const covered = { ...doc, terms: { vanterpool: [1, 2] }, pages: [{ n: 1, folio: null, text: 'MR SAM VANTERPOOL, for the board' }, doc.pages[1]] }
  const inside = await api.pageHits({ origin: 'https://opax.test', asset: async () => covered }, { docs: [{ key: 'k1', file: '/transcripts/cth-example/transcript-k1.json' }] }, 'k1', ['vanterpool'])
  assert.deepEqual(inside.hits.map(h => h.pdf_page), [2], 'the cover page is never quoted')
})

/** What opens a line, read without the parser's own patterns: a note, a "Q."/"A." mark, or a heading. A heading is
 * a short run before a colon that is nearly all capital letters with no digit or quote mark, or a role word alone;
 * or, with no colon, a role in capitals or a run the page heads another line with, then a space, ".", ";" or "--".
 * `heads` is every such colon heading on the page. */
const hasLower = line => [...line.replace(/\[[^\]]*\]/g, '').replace(/(\d ?)[ap]m\b/g, '$1')].some(ch => ch !== ch.toUpperCase())
function colonHeading(line) {
  const colon = line.indexOf(':'), head = colon > 0 && colon <= 70 && (colon + 1 === line.length || ' :'.includes(line[colon + 1])) ? line.slice(0, colon).trim() : ''
  if (!head) return null
  if (['commissioner', 'the commissioner', 'the witness', 'chair'].includes(head.toLowerCase())) return head
  const letters = [...head].filter(ch => ch.toLowerCase() !== ch.toUpperCase()), lower = letters.filter(ch => ch !== ch.toUpperCase()).length, count = head.split(' ').length
  const titled = ['THE', 'MR', 'MS', 'MRS', 'DR', 'PROFESSOR', 'PROF', 'A/PROFESSOR', 'A/PROF', 'ASSOCIATE', 'SENATOR', 'COMMISSIONER'].includes(head.split(' ')[0])
  return letters.length - lower >= 2 && lower * 5 < letters.length && !/[\d"“”‘]/.test(head) && (count <= 4 || (titled && count <= 8)) ? head : null
}
function opener(line, afterNote, heads) {
  const words = line.split(' ')
  if (line[0] === '<') return 'note'
  if (!hasLower(line) && (line.includes('EXAMINATION BY') && line.indexOf('EXAMINATION BY') <= 14 || words[0] === 'ADJOURNMENT' || words[1] === 'ADJOURNMENT' || words[0] === 'ADJOURNED' || line.startsWith('UPON RESUM') || (words[0] === 'EXHIBIT' && words.length > 1))) return 'note'
  if ((line[0] === 'Q' || line[0] === 'A') && (line[1] === '.' || line[1] === ':' || line.slice(1, 4) === ' --') && (line.length === 2 || line[2] === ' ' || line.slice(1, 4) === ' --')) return 'mark'
  if (colonHeading(line)) return 'heading'
  for (const head of ['THE COMMISSIONER', 'THE WITNESS', 'COMMISSIONER', ...heads]) {
    const rest = line.startsWith(head) ? line.slice(head.length) : null
    if (rest === null) continue
    if (rest === '.' || rest === ';' || rest.startsWith('. ') || rest.startsWith('; ') || rest.startsWith(' -- ')) return 'heading'
    const next = rest[0] === ' ' ? rest.slice(1).split(' ')[0] : null
    if (next && !(next.length > 1 && next === next.toUpperCase() && /[A-Z]$/.test(next.replace(/[^A-Za-z]/g, '') || 'a') && /^[A-Z]/.test(next))) return 'heading'
  }
  return afterNote && !hasLower(line) ? 'note' : null
}

test('over every quotable page: no excerpt holds a heading, a mark or a note line, and nothing names a speaker', async () => {
  let quoted = 0
  for (const [commission, words] of [['robodebt', 'income averaging'], ['robodebt', 'debt'], ['healthcare-funding', 'funding'], ['healthcare-funding', 'hospital workforce'], ['antisemitism', 'university']]) {
    const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission, words, limit: 8 })
    assert.ok(!/"speaker(?:_label)?"/.test(JSON.stringify(out)), `${commission}: a speaker field in the tool output`)
    for (const c of out.citations) assert.ok(!/hearing turn by /.test(c.text), c.text)
    for (const [i, r] of out.rows.entries()) for (const h of r.text_matches?.hits ?? []) {
      assert.deepEqual(Object.keys(h).sort(), ['excerpt', 'pdf_page', 'transcript_page', 'url'], `${commission} ${r.key} page ${h.pdf_page}`)
      if (h.excerpt === null) continue
      assert.ok(/[^.\s]/.test(h.excerpt), 'no empty quotation')
      quoted++; assert.ok(out.citations[i + 1].text.includes(`(PDF page ${h.pdf_page}), hearing turn: "${h.excerpt}"`))
    }
  }
  assert.ok(quoted > 0)
  const index = await env.asset('/transcripts/index.json')
  let pages = 0, checked = 0, said = 0
  for (const d of index.docs) {
    const doc = await env.asset(d.file)
    if (doc.quote_policy !== 'quote') continue
    for (const p of doc.pages) {
      if (typeof p.text !== 'string') continue
      pages++
      const lines = p.text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean), flat = lines.join(' ')
      // Where each opening line starts, and the stretch no excerpt may touch: a whole note line, or the first
      // character of a heading or mark line (an excerpt that held it would hold the heading or the mark).
      const barred = [], search = new Set()
      const heads = [...new Set(lines.map(l => l[0] === '<' ? null : colonHeading(l)).filter(h => h && h === h.toUpperCase() && h.includes(' ')))].sort((a, b) => b.length - a.length)
      let at = 0, kind = null
      const found = flat.toLowerCase().match(/[a-z]{5,}/g) ?? []
      if (found.length) search.add(found[found.length >> 1])
      for (const [i, line] of lines.entries()) {
        kind = opener(line, kind === 'note', heads)
        if (kind) {
          barred.push([at, kind === 'note' ? at + line.length : at + 1])
          // Search for the words of the opener itself, the word before it and the first long word after it.
          const own = (kind === 'heading' ? line.slice(0, line.includes(':') ? line.indexOf(':') : 30) : kind === 'note' ? line : '').toLowerCase().match(/[a-z0-9]{2,}/g) ?? []
          for (const w of [...own.slice(0, 5), (lines[i - 1] ?? '').toLowerCase().match(/[a-z]{3,}/g)?.at(-1), line.slice(line.indexOf(':') + 1).toLowerCase().match(/[a-z]{4,}/)?.[0]]) if (w) search.add(w)
        }
        at += line.length + 1
      }
      for (const w of search) {
        const got = api.excerpt(p.text, [w]); checked++
        assert.deepEqual(Object.keys(got), ['excerpt'], `${d.key} page ${p.n}`)
        const body = got.excerpt.replace(/^\.\.\./, '').replace(/\.\.\.$/, '')
        if (!body) continue
        said++
        let clean = false
        for (let pos = flat.indexOf(body); pos >= 0 && !clean; pos = flat.indexOf(body, pos + 1)) clean = !barred.some(([a, b]) => a < pos + body.length && b > pos)
        assert.ok(clean, `${d.key} page ${p.n} "${w}": the excerpt holds a heading, a mark or a note line`)
      }
    }
  }
  assert.ok(pages > 10000 && checked > 5 * pages && said > 4 * pages)
})

test('a royal commission transcript count opens the way the integrity count does', async () => {
  const listing = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', limit: 1 })
  const profile = await api.callTool(env, 'royal_commissions', { view: 'profile', commission: 'robodebt' })
  const count = profile.citations.find(c => c.kind === 'count')
  for (const text of [listing.citations[0].text, count.text]) {
    assert.match(text, /^OPAX lists 47 hearing transcripts from the Royal Commission into the Robodebt Scheme, dated 27 September 2022 to 10 March 2023[ .]/, text)
    assert.ok(!/\bthe the\b/i.test(text) && !text.includes('transcripts listed'), text)
  }
  assert.equal(count.text, `OPAX lists 47 hearing transcripts from the Royal Commission into the Robodebt Scheme, dated 27 September 2022 to 10 March 2023. ${LABEL}.`, 'no tool hint in answer text')
  assert.ok(profile.notes.some(n => n.startsWith('view=transcripts')), 'the hint is a tool note')
})

const REPORT = { resource: 'fact-2', kind: 'record', url: 'https://opax.test/report/robodebt', title: 'Final report, page 3', snippet: 'Final report, page 3: "a finding".', cited: true }
const SPEECH = { resource: 'a'.repeat(32), kind: 'speech', url: 'https://opax.test/doc/speech-1', title: 'Social Services Legislation Amendment Bill', snippet: 'I rise to speak about the royal commission hearing transcript.', cited: true }
const turnSource = (n, cited = true) => { const text = `Royal Commission into the Robodebt Scheme, Day ${n} (1 November 2022), transcript page 12${n} (PDF page 9), hearing turn by Ms Quellworth: "income averaging". ${LABEL}. CC BY 4.0.`; return { resource: `fact-t${n}`, kind: 'record', url: `https://robodebt.royalcommission.gov.au/t${n}.pdf`, title: text, snippet: text, cited } }
const COVERAGE = { resource: 'coverage', kind: 'record', url: 'https://opax.test/methods', title: 'Coverage', snippet: 'Transcripts as the commission published them.', cited: true, coverage: true }

test('an answer citing only hearing transcripts says they are evidence, not findings', async () => {
  const turn = `Royal Commission into the Robodebt Scheme, Day 12 (1 November 2022), transcript page 1203 (PDF page 9), hearing turn by Ms Quellworth: "income averaging". ${LABEL}. CC BY 4.0.`
  const answer = 'Witnesses described how income averaging was applied to each debt.'
  const payload = { answered: true, answer_decision: 'answer', answer, citations: { 'fact-1/t/body/0': [[0, answer.length]] },
    sources: [{ resource: 'fact-1', kind: 'record', url: 'https://robodebt.royalcommission.gov.au/t12.pdf', title: turn, snippet: turn, cited: true },
      { resource: 'coverage', kind: 'record', url: 'https://opax.test/report/robodebt', title: 'Coverage', snippet: 'Transcripts as the commission published them.', cited: true, coverage: true }] }
  const out = api.withTranscriptNote(payload)
  assert.equal(out.answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`)
  assert.equal(api.TRANSCRIPT_NOTE, 'These are from hearing transcripts: evidence, not findings.')
  assert.deepEqual(out.citations, payload.citations, 'existing citation ranges are unchanged')
  assert.equal(api.withTranscriptNote(out).answer, out.answer, 'added once')
  const uncited = { ...payload, sources: [...payload.sources, { ...REPORT, cited: false }] }
  assert.equal(api.withTranscriptNote(uncited).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`, 'only cited sources count')
  for (const over of [{ answer_decision: 'refusal' }, { answer_decision: 'clarification' }, { answered: false }, { answer: '' }]) assert.deepEqual(api.withTranscriptNote({ ...payload, ...over }), { ...payload, ...over })
  assert.equal(api.withTranscriptNote({ ...payload, answer_decision: 'limitation' }).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`, 'a limited answer still draws on the transcript')
  const listed = api.withTranscriptNote(listing())
  assert.equal(listed.answer, `${listing().answer.trimEnd()}\n\n${api.TRANSCRIPT_NOTE}`, 'a listing carries the label on its rows and ends with the line as well')
  assert.equal(api.withTranscriptNote(listed), listed)
  const written = { ...payload, answer: `Ms Quellworth said on hearing day 12 (1 November 2022): “income averaging” ${api.TRANSCRIPT_NOTE}` }
  assert.equal(api.withTranscriptNote(written), written, "the transcript writer's own line is not repeated")
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.equal(index.match(/withTranscriptNote\(linkAskSources\(/g).length, 2, 'applied to the final Ask payload, after its source rows are linked')
  assert.ok(!/linkAskSources\(withTranscriptNote\(/.test(index))
})

test('a mixed answer names which cited sources are hearing transcripts, by the number the reader sees', () => {
  const answer = 'The report found the scheme unlawful. A witness described income averaging.'
  const mixed = sources => api.withTranscriptNote({ answered: true, answer_decision: 'answer', answer, citations: {}, sources })
  // Numbers are places among the cited rows (the web page and the app number citations that way): an uncited row takes none.
  const two = mixed([REPORT, turnSource(1), { ...turnSource(9), cited: false }, SPEECH, turnSource(2)])
  assert.equal(two.answer, `${answer}\n\nSources 2 and 4 are hearing transcripts: evidence, not findings.`)
  assert.equal(mixed([COVERAGE, REPORT, turnSource(1)]).answer, `${answer}\n\nSource 3 is a hearing transcript: evidence, not findings.`, 'a cited coverage row keeps its number')
  assert.equal(mixed([turnSource(1), REPORT, turnSource(2), turnSource(3)]).answer, `${answer}\n\nSources 1, 3 and 4 are hearing transcripts: evidence, not findings.`)
  assert.equal(mixed([COVERAGE, turnSource(1), turnSource(2)]).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`, 'coverage beside transcripts only: the unnumbered line')
  for (const out of [two, api.withTranscriptNote(two), api.withTranscriptNote(api.withTranscriptNote(two))]) assert.equal(out.answer.match(/evidence, not findings/g).length, 1, 'never twice')
  assert.equal(api.withTranscriptNote(two), two)
  assert.ok(!/[—–]/.test(two.answer))
})

test('no hearing transcript cited: no line, and a Hansard speech about a transcript is not one', () => {
  for (const sources of [[REPORT], [SPEECH], [REPORT, SPEECH, { ...turnSource(1), cited: false }], [COVERAGE], []]) {
    const payload = { answered: true, answer_decision: 'answer', answer: 'The Senate debated the bill.', citations: {}, sources }
    assert.equal(api.withTranscriptNote(payload), payload)
  }
})

const VOTES = { resource: 'fact-v', kind: 'count', url: 'https://opax.test/votes?member=1', title: 'Voted for the bill in 2 of 2 divisions.', snippet: 'Voted for the bill in 2 of 2 divisions.', cited: true }
const VOTE_LINKS = { lists: [], related: { [VOTES.url]: [{ label: 'Division 1, 3 March 2023', url: 'https://opax.test/division/1' }, { label: 'Division 2, 4 March 2023', url: 'https://opax.test/division/2' }] } }

test('the real order: checks, linked sources, the line, then the way out, and Source N is the number the reader sees', async () => {
  const answer = 'The member voted for the bill in 2 of 2 divisions. A witness described income averaging.'
  const payload = { answered: true, answer_decision: 'answer', answer, citations: { 'fact-v/t/body/0': [[0, 50]], 'fact-t1/t/body/0': [[51, answer.length]] }, sources: [VOTES, turnSource(1)] }
  const checked = api.groundAnswerPayload(payload, 'How did the member vote, and what did witnesses say about income averaging?')
  const linked = api.linkAskSources(checked.answered === false ? payload : checked, VOTE_LINKS, 'https://opax.test')
  const cited = linked.sources.filter(s => s.cited)
  const place = cited.findIndex(s => s.title.includes(LABEL)) + 1
  assert.deepEqual(cited.slice(0, 3).map(s => s.url), [VOTES.url, 'https://opax.test/division/1', 'https://opax.test/division/2'], 'both divisions sit between the count and the transcript')
  assert.equal(place, 4)
  const noted = api.withTranscriptNote(linked)
  assert.ok(noted.answer.endsWith('\n\nSource 4 is a hearing transcript: evidence, not findings.'), noted.answer)
  // The way out sees the stored payload again, and an answer cached before the rule: the same line, once.
  for (const stored of [noted, linked]) {
    const out = await (await api.transcriptNoteResponse(Response.json(stored))).json()
    assert.equal(out.answer, noted.answer)
    assert.equal(out.answer.match(/evidence, not findings/g).length, 1)
    assert.equal(doneOf(await (await api.transcriptNoteResponse(chunked(sse([['done', stored]]), 13))).text()).answer, noted.answer)
  }
  // The old order numbered the line before the division rows went in.
  assert.ok(api.withTranscriptNote(payload).answer.endsWith('Source 2 is a hearing transcript: evidence, not findings.'))
  assert.equal(api.withTranscriptNote(api.linkAskSources(api.withTranscriptNote(payload), VOTE_LINKS, 'https://opax.test')).answer, `${answer}\n\nSource 4 is a hearing transcript: evidence, not findings.`, 'a line numbered too early is put right, not doubled')
})

test('a count of transcripts is not a transcript, and a coverage row by any name is not a source either way', () => {
  const answer = 'The commission held 47 hearing days. Its report found the scheme unlawful.'
  const note = sources => api.withTranscriptNote({ answered: true, answer_decision: 'answer', answer, citations: {}, sources }).answer.slice(answer.length).trim()
  const count = { resource: 'fact-1', kind: 'count', url: 'https://opax.test/royal-commissions/robodebt', title: `OPAX lists 47 hearing transcripts from the Royal Commission into the Robodebt Scheme, dated 27 September 2022 to 10 March 2023. ${LABEL}.`, snippet: '', cited: true }
  assert.equal(note([count, REPORT]), '', 'a count beside a report: no source is a transcript')
  assert.equal(note([REPORT, count, turnSource(1)]), 'Source 3 is a hearing transcript: evidence, not findings.', 'the count keeps its number and is not named')
  assert.equal(note([count, turnSource(1), turnSource(2)]), api.TRANSCRIPT_NOTE, 'a count beside transcripts only: the unnumbered line')
  assert.equal(note([VOTES, turnSource(1)]), 'Source 2 is a hearing transcript: evidence, not findings.', 'a count of something else is a source like any other')
  // The older engine's coverage row has a resource and no flag; the linker's are coverage-<name>.
  const { coverage: _flag, ...unflagged } = COVERAGE
  for (const row of [unflagged, { ...unflagged, resource: 'coverage-divisions' }]) {
    assert.equal(note([turnSource(1), turnSource(2), row]), api.TRANSCRIPT_NOTE)
    assert.equal(note([row, REPORT, turnSource(1)]), 'Source 3 is a hearing transcript: evidence, not findings.')
    assert.equal(note([row]), '')
  }
  assert.equal(note([{ ...REPORT, resource: 'coverage-report' }, turnSource(1)]), api.TRANSCRIPT_NOTE)
})

test('the answer ends with the line, in the form its sources call for', () => {
  const base = { answered: true, answer_decision: 'answer', citations: {} }
  // A line with text after it does not end the answer.
  const mid = { ...base, answer: `Ms Quellworth said: “income averaging” ${api.TRANSCRIPT_NOTE}\n\nThe department continued the scheme.`, sources: [turnSource(1)] }
  const ended = api.withTranscriptNote(mid)
  assert.equal(ended.answer, `${mid.answer}\n\n${api.TRANSCRIPT_NOTE}`)
  assert.ok(ended.answer.startsWith(mid.answer), 'the text before it is as it was')
  assert.equal(api.withTranscriptNote(ended), ended)
  // The transcript writer's all-transcripts sentence under a mixed set of sources: that sentence alone becomes the numbered form.
  const prose = 'The report found the scheme unlawful.\n\nMs Quellworth said on hearing day 1 (1 November 2022): “income averaging”\n\n'
  const at = Array.from(prose).length, end = at + api.TRANSCRIPT_NOTE.length
  const written = { ...base, answer: prose + api.TRANSCRIPT_NOTE, citations: { 'fact-2/t/body/0': [[0, 37]], 'fact-t1/t/body/0': [[39, at - 2], [at, end]] }, sources: [REPORT, turnSource(1)] }
  const mixed = api.withTranscriptNote(written), line = 'Source 2 is a hearing transcript: evidence, not findings.'
  assert.equal(mixed.answer, prose + line)
  assert.deepEqual(mixed.citations, { 'fact-2/t/body/0': [[0, 37]], 'fact-t1/t/body/0': [[39, at - 2], [at, at + line.length]] }, 'only the range over the fixed line moves, and it stays inside the answer')
  assert.equal(api.withTranscriptNote(mixed), mixed)
  // And the other way: a numbered line over sources that are all transcripts.
  assert.equal(api.withTranscriptNote({ ...base, answer: `A witness spoke.\n\n${line}`, sources: [turnSource(1), turnSource(2)] }).answer, `A witness spoke.\n\n${api.TRANSCRIPT_NOTE}`)
  // A saved turn's rows are clipped, so the line it was saved with stands.
  const saved = { ...base, answer: `A witness spoke.\n\n${line}`, sources: [turnSource(1)] }
  assert.equal(api.withTranscriptNote(saved, true), saved)
})

test('the fixed words closing a sentence of the answer are prose: left as written, the right line after them', () => {
  const base = { answered: true, answer_decision: 'answer', citations: { 'fact-t1/t/body/0': [[0, 20]] } }
  for (const [said, sources, line] of [
    ['A witness spoke. In short, Sources 1 and 2 are hearing transcripts: evidence, not findings.', [turnSource(1), turnSource(2)], api.TRANSCRIPT_NOTE],
    ['The report made a finding. Note: These are from hearing transcripts: evidence, not findings.', [REPORT, turnSource(1)], 'Source 2 is a hearing transcript: evidence, not findings.'],
    ['Witnesses agreed that These are from hearing transcripts: evidence, not findings.', [REPORT, turnSource(1)], 'Source 2 is a hearing transcript: evidence, not findings.'],
  ]) {
    const payload = { ...base, answer: said, sources }, out = api.withTranscriptNote(payload)
    assert.equal(out.answer, `${said}\n\n${line}`)
    assert.deepEqual(out.citations, payload.citations)
    assert.equal(api.withTranscriptNote(out), out, 'settled in one pass')
  }
  // The right form inside a sentence already ends the answer with the words: nothing to add.
  const right = { ...base, answer: 'In short, Source 2 is a hearing transcript: evidence, not findings.', sources: [REPORT, turnSource(1)] }
  assert.equal(api.withTranscriptNote(right), right)
  // A line of its own is still swapped, whatever ends the sentence before it.
  for (const before of ['', 'A witness spoke.\n\n', 'She said “no.”\n\n', 'Was it lawful?\n\n', 'It was (as found).\n\n', 'It was (as found)\n\n']) {
    const out = api.withTranscriptNote({ ...base, citations: {}, answer: before + api.TRANSCRIPT_NOTE, sources: [REPORT, turnSource(1)] })
    assert.equal(out.answer, `${before}Source 2 is a hearing transcript: evidence, not findings.`)
  }
})

test('the writer leaves the line to the way out: one line, at the end, after anything added under the turns', () => {
  const turn = `Royal Commission into the Robodebt Scheme, Transcript Hearing Day 71 (9 June 2023), transcript page P-9127 (PDF page 4), hearing turn by Ms Vanterpool: "The averaging method was set out in the second schedule." ${LABEL}. © Commonwealth of Australia, Royal Commission into the Robodebt Scheme, licensed under CC BY 4.0.`
  const question = 'What has Example Member said about income averaging?'
  const facts = api.writingFacts(undefined, [{ id: 1, text: turn, kind: 'record', cite: { kind: 'record', url: 'https://robodebt.royalcommission.gov.au/transcript.pdf#page=4', label: turn } }])
  const written = api.proseFallback({ question, period: { kind: 'all', label: 'All time' }, facts })
  assert.ok(written.answer.length > 0)
  assert.ok(!/evidence, not findings/.test(written.answer), written.answer)
  // One hearing turn, then a speech by the person in scope that the person overview adds as a bullet.
  const heard = { ...turnSource(1), resource: 'fact-1' }
  const speech = { resource: 'speech-7', slug: 'speech-7', kind: 'speech', speaker: 'Example Member', title: 'Social services statement', date: '2023-03-20', url: 'https://opax.test/doc/speech-7', href: 'https://opax.test/doc/speech-7', snippet: 'Income averaging was applied to every debt raised under the scheme.', cited: false }
  const answer = written.answer.trim()
  const payload = { answered: true, answer, answer_decision: 'answer', research: { mode: 'loop' }, answer_scope: { people: ['Example Member'] }, sources: [heard, speech], citations: { 'fact-1/t/body/0': [[0, Array.from(answer).length]] } }
  const checked = api.groundAnswerPayload(payload, question)
  assert.match(checked.answer, /\n- On 20 March 2023, Example Member said “Income averaging was applied/, checked.answer)
  const out = api.withTranscriptNote(api.linkAskSources(checked, undefined, 'https://opax.test'))
  assert.deepEqual(out.sources.filter(s => s.cited).map(s => s.resource), ['fact-1', 'speech-7'])
  assert.equal(out.answer.match(/evidence, not findings/g).length, 1)
  assert.ok(out.answer.endsWith('\n\nSource 1 is a hearing transcript: evidence, not findings.'), out.answer)
  assert.ok(out.answer.startsWith(checked.answer.trimEnd()), 'nothing before the line is changed')
})

test('division rows hung off a coverage row are sources like any other', () => {
  const answer = 'The member voted for the bill twice. A witness described income averaging.'
  const { coverage: _flag, ...row } = { ...COVERAGE, resource: 'coverage-divisions', url: 'https://opax.test/coverage/divisions' }
  const links = { lists: [], related: { [row.url]: VOTE_LINKS.related[VOTES.url] } }
  const linked = api.linkAskSources({ answered: true, answer_decision: 'answer', answer, citations: {}, sources: [row, turnSource(1)] }, links, 'https://opax.test')
  assert.deepEqual(linked.sources.map(s => s.resource), ['coverage-divisions', 'coverage-divisions-record-1', 'coverage-divisions-record-2', 'fact-t1'])
  assert.equal(api.withTranscriptNote(linked).answer, `${answer}\n\nSource 4 is a hearing transcript: evidence, not findings.`)
  assert.equal(api.withTranscriptNote({ ...linked, sources: linked.sources.filter(s => !/-record-/.test(s.resource)) }).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`, 'the coverage row alone still is not one')
})

test('voice: a written answer past 4,000 characters is cut in its prose and still ends with the line', () => {
  const long = 'The commission heard about income averaging at length. '.repeat(90).trim()
  const text = sources => api.askOpaxResult(api.withTranscriptNote({ answered: true, answer: long, citations: {}, sources }), 'https://opax.test').answer
  for (const [sources, line] of [[[turnSource(1)], api.TRANSCRIPT_NOTE], [[REPORT, turnSource(1)], 'Source 2 is a hearing transcript: evidence, not findings.']]) {
    const out = text(sources)
    assert.ok(long.length > 4_000 && out.length <= 4_000, String(out.length))
    assert.ok(out.endsWith(`\n${line}`), out.slice(-80))
    assert.ok(long.startsWith(out.slice(0, -line.length - 1)), 'the prose is only shortened')
    assert.equal(out.match(/evidence, not findings/g).length, 1)
  }
  assert.equal(text([REPORT]), long.slice(0, 4_000))
  const short = api.askOpaxResult(api.withTranscriptNote({ answered: true, answer: 'A witness spoke.', citations: {}, sources: [turnSource(1)] }), 'https://opax.test').answer
  assert.equal(short, `A witness spoke.\n${api.TRANSCRIPT_NOTE}`, 'the uncut answer has the same shape')
})

const sse = events => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
const doneOf = wire => JSON.parse(/^event: done\ndata: (.+)$/m.exec(wire)[1])
/** A stream delivered in pieces that cut frames, and a multi-byte character, in half. */
function chunked(wire, size) {
  const bytes = new TextEncoder().encode(wire)
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close() } }), { headers: { 'content-type': 'text/event-stream', 'x-opax-cache': 'HIT' } })
}

test('every Ask reply gains the line on its way out: blocking and streamed, and an answer cached before the rule', async () => {
  const answer = 'The report found the scheme unlawful. A witness said “income averaging” was used.'
  // What the cache held before this change: a mixed answer with no line.
  const stored = { answered: true, answer_decision: 'answer', answer, citations: { 'fact-2/t/body/0': [[0, 37]] }, sources: [REPORT, turnSource(1)] }
  const want = `${answer}\n\nSource 2 is a hearing transcript: evidence, not findings.`
  const blocking = await api.transcriptNoteResponse(Response.json(stored, { headers: { 'x-opax-cache': 'HIT', 'x-opax-cached-at': '2026-11-14T00:00:00Z' } }))
  assert.equal(blocking.headers.get('x-opax-cache'), 'HIT'); assert.equal(blocking.headers.get('x-opax-cached-at'), '2026-11-14T00:00:00Z')
  const body = await blocking.json()
  assert.equal(body.answer, want); assert.deepEqual(body.citations, stored.citations); assert.deepEqual(body.sources, stored.sources)
  // The cached replay and a live stream speak the same frames: status, deltas, then the payload as `done`.
  const wire = sse([['status', { phase: 'cached' }], ['delta', { text: answer.slice(0, 30) }], ['delta', { text: answer.slice(30) }], ['done', stored]])
  for (const size of [1, 7, 64, 100_000]) {
    const out = await (await api.transcriptNoteResponse(chunked(wire, size))).text()
    assert.equal(doneOf(out).answer, want, `chunks of ${size}`)
    assert.equal(out.replace(/^event: done\ndata: .+$/m, ''), wire.replace(/^event: done\ndata: .+$/m, ''), 'every other frame is untouched')
    assert.equal(out.match(/hearing transcript: evidence, not findings\./g).length, 1)
  }
  // An answer stored after the change already ends with the line: served as it is, byte for byte.
  const fresh = { ...stored, answer: want }, text = JSON.stringify(fresh)
  assert.equal(await (await api.transcriptNoteResponse(new Response(text, { headers: { 'content-type': 'application/json' } }))).text(), text)
  assert.equal(await (await api.transcriptNoteResponse(chunked(sse([['done', fresh]]), 5))).text(), sse([['done', fresh]]))
  // All transcripts: the line as written to the commission.
  const all = { ...stored, sources: [turnSource(1), turnSource(2)] }
  assert.equal((await (await api.transcriptNoteResponse(Response.json(all))).json()).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`)
  assert.equal(doneOf(await (await api.transcriptNoteResponse(chunked(sse([['delta', { text: answer }], ['done', all]]), 9))).text()).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`)
  // No transcript, an error, or a body that is not what it claims: out as it came, never emptied or blocked.
  const plain = { ...stored, sources: [REPORT] }
  assert.deepEqual(await (await api.transcriptNoteResponse(Response.json(plain))).json(), plain)
  assert.equal(await (await api.transcriptNoteResponse(chunked(sse([['done', plain]]), 11))).text(), sse([['done', plain]]))
  const failed = await api.transcriptNoteResponse(Response.json({ error: 'The answer took too long. Please try again.' }, { status: 504 }))
  assert.equal(failed.status, 504)
  assert.equal(await (await api.transcriptNoteResponse(new Response('not json', { headers: { 'content-type': 'application/json' } }))).text(), 'not json')
  const broken = 'event: done\ndata: {"answer": \n\n'
  assert.equal(await (await api.transcriptNoteResponse(chunked(broken, 4))).text(), broken)
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(index, /async function apiAskReply\([^)]*\): Promise<Response> \{\n[^\n]*\n  return transcriptNoteResponse\(await apiAskRouted\(/)
  assert.equal(index.match(/\bapiAskRouted\(/g).length, 2, 'the route and voice reach Ask only through the wrapped entry point')
  assert.equal(index.match(/\bapiAskReply\(/g).length, 3)
})

test('voice: the caller hears the line last, without source numbers', () => {
  const long = 'The commission heard about income averaging. It was applied to each debt. Officers raised concerns. The department continued. A fifth sentence follows. And a sixth.'
  const said = sources => api.askOpaxResult(api.withTranscriptNote({ answered: true, answer: long, citations: {}, sources }), 'https://opax.test').spoken_answer
  assert.ok(said([turnSource(1)]).endsWith(' And a sixth.') === false && said([turnSource(1)]).endsWith(` ${api.TRANSCRIPT_NOTE}`), said([turnSource(1)]))
  assert.ok(said([REPORT, turnSource(1)]).endsWith(' Some of these sources are hearing transcripts: evidence, not findings.'), said([REPORT, turnSource(1)]))
  assert.ok(!/Source \d/.test(said([REPORT, turnSource(1)])))
  assert.ok(said([REPORT, turnSource(1)]).startsWith('The commission heard about income averaging.'))
  assert.ok(!/evidence, not findings/.test(said([REPORT])))
})

test('a conversation saved before the rule gains the line when it is restored', async () => {
  const { withTranscriptNote } = await import('../public/transcript-note.js')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  // The page loads the helper by its content hash, written by the stamp step like its sibling imports.
  const { MODULE_STAMPS } = await import('../../scripts/stamp_assets.mjs')
  assert.ok(MODULE_STAMPS.some(([importer, mod]) => importer === 'app.js' && mod === 'transcript-note.js'))
  const hash = createHash('sha256').update(await readFile(new URL('../public/transcript-note.js', import.meta.url))).digest('hex').slice(0, 10)
  assert.ok(app.includes(`import('/transcript-note.js?v=${hash}')`), 'run npm run stamp')
  assert.match(app, /import\('\/transcript-note\.js\?v=[^']+'\)\.then\(module => \{ transcriptNoteHelpers = module; \}\)\.catch/)
  assert.match(app, /function renderChatThread[\s\S]{0,600}transcriptNoteHelpers\.withTranscriptNote\(\{answer:msg\.text, sources:msg\.sources, answered:msg\.answered\}, true\)/)
  // trimTurn keeps 240 characters of each source field, so a long excerpt loses its label; its page pointer remains.
  const cut = v => typeof v === 'string' && v.length > 240 ? `${v.slice(0, 239)}…` : v
  const long = turnSource(1), excerpt = { ...long, title: long.title.replace('income averaging', 'income averaging '.repeat(30)), snippet: long.snippet.replace('income averaging', 'income averaging '.repeat(30)) }
  const saved = [REPORT, excerpt].map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'url' ? v : cut(v)])))
  assert.ok(!saved[1].snippet.includes(LABEL) && saved[1].snippet.endsWith('…'))
  const turn = { answer: 'A saved answer.', sources: saved, answered: true }
  assert.equal(withTranscriptNote(turn, true).answer, 'A saved answer.\n\nSource 2 is a hearing transcript: evidence, not findings.')
  assert.equal(withTranscriptNote(turn).answer, 'A saved answer.', 'the Worker never reads a cut field this way')
  assert.equal(withTranscriptNote({ ...turn, sources: [REPORT, { ...SPEECH, snippet: `${'word '.repeat(60)}…` }] }, true).answer, 'A saved answer.')
})
