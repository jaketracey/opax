import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: [
  "export {excerpt, pageTurns, pageHits, speakerName, dayWords, spanWords} from './src/tools/transcript-text'",
  "export {callTool} from './src/tools/index'",
  "export {transcriptListingOnly, withTranscriptNote, TRANSCRIPT_LABEL, TRANSCRIPT_NOTE} from './src/transcript-answer'",
  "export {groundAnswerPayload} from './src/research-grounding'",
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
  // A word index and an exhibit list are not hearing turns.
  const index = ['ability [3] - 1023:4,', '1031:12, 1040:7', 'able [2] - 1011:30,', '1012:2', 'about [41] - 1001:9,'].join('\n')
  const exhibits = ['12. ABC.0001.0002.0003 Letter to the board', '13. ABC.0001.0002.0004 Reply from the board', 'dated 1 February 2020', '14. ABC.0001.0002.0005 Minute', '15. ABC.0001.0002.0006 Email'].join('\n')
  for (const page of [index, exhibits]) { assert.deepEqual(api.pageTurns(page).turns, []); assert.deepEqual(api.excerpt(page, ['board', 'able']), { excerpt: '' }) }
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
  assert.deepEqual(quote('withdrew'), { excerpt: '' })
  // A page of headings only, as before.
  const page = 'that is the position.\nMS QUELLWORTH: Thank you, Commissioner. I want to ask about income averaging and how\nthe scheme applied it to each debt.\nCOMMISSIONER: Yes.\nMR VANTERPOOL SC: Income averaging was raised later.'
  assert.deepEqual(api.excerpt(page, ['income', 'averaging']), { excerpt: 'Thank you, Commissioner. I want to ask about income averaging and how the scheme applied it to each debt.' })
  assert.deepEqual(api.excerpt('averaging continued from the last page, said the witness.\nTHE COMMISSIONER:: Noted.', ['averaging']), { excerpt: 'averaging continued from the last page, said the witness.' })
  // A long turn is cut at words, inside the turn.
  const long = api.excerpt(`MS QUELLWORTH: ${'word '.repeat(40)}averaging ${'more '.repeat(80)}\nCOMMISSIONER: Yes.`, ['averaging'])
  assert.match(long.excerpt, /^\.\.\.word .*averaging more .* more\.\.\.$/); assert.ok(long.excerpt.length < 300)
  assert.equal(api.speakerName('MS EXAMPLE-SAMPLE'), 'Ms Example-Sample'); assert.equal(api.speakerName('MR STANDIN SC'), 'Mr Standin SC')
  assert.equal(api.speakerName('McSAMPLE'), 'McSample'); assert.equal(api.speakerName("MR O'MOCKUP"), "Mr O'Mockup"); assert.equal(api.speakerName('THE COMMISSIONER'), 'The Commissioner')
})

test('a page with nothing to quote is not offered as a hit', async () => {
  const doc = { key: 'k1', quote_policy: 'quote', attribution: 'Example attribution', licence_url: 'https://example.test/licence', pdf_url: 'https://example.test/day-1.pdf', terms: { vanterpool: [1, 2] },
    pages: [{ n: 1, folio: '10', text: 'The evidence closed.\nMR VANTERPOOL:' }, { n: 2, folio: '11', text: 'MR VANTERPOOL: Thank you.' }] }
  const found = await api.pageHits({ origin: 'https://opax.test', asset: async () => doc }, { docs: [{ key: 'k1', file: '/transcripts/cth-example/transcript-k1.json' }] }, 'k1', ['vanterpool'])
  assert.deepEqual(found.hits, [{ pdf_page: 2, transcript_page: '11', url: 'https://example.test/day-1.pdf#page=2', excerpt: 'Thank you.' }])
})

/** What opens a line, read without the parser's own patterns: a note, a "Q."/"A." mark, or a heading (a short
 * run before a colon that is mostly capital letters, or a role word alone). */
function opener(line, afterNote) {
  if (line[0] === '<') return 'note'
  if ((line[0] === 'Q' || line[0] === 'A') && (line[1] === '.' || line[1] === ':') && (line.length === 2 || line[2] === ' ')) return 'mark'
  const colon = line.indexOf(':'), head = colon > 0 && colon <= 70 && (colon + 1 === line.length || ' :'.includes(line[colon + 1])) ? line.slice(0, colon).trim() : ''
  const letters = [...head].filter(ch => ch.toLowerCase() !== ch.toUpperCase()), capitals = letters.filter(ch => ch === ch.toUpperCase()).length
  if (head && head.split(' ').length <= 8 && ((capitals >= 2 && capitals >= 0.7 * letters.length) || ['commissioner', 'the commissioner', 'the witness', 'chair'].includes(head.toLowerCase()))) return 'heading'
  return afterNote && ![...line.replace(/\[[^\]]*\]/g, '')].some(ch => ch !== ch.toUpperCase()) ? 'note' : null
}

test('over every quotable page: no excerpt holds a heading, a mark or a note line, and nothing names a speaker', async () => {
  let quoted = 0
  for (const [commission, words] of [['robodebt', 'income averaging'], ['robodebt', 'debt'], ['healthcare-funding', 'funding'], ['healthcare-funding', 'hospital workforce'], ['antisemitism', 'university']]) {
    const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission, words, limit: 8 })
    assert.ok(!/"speaker(?:_label)?"/.test(JSON.stringify(out)), `${commission}: a speaker field in the tool output`)
    for (const c of out.citations) assert.ok(!/hearing turn by /.test(c.text), c.text)
    for (const [i, r] of out.rows.entries()) for (const h of r.text_matches?.hits ?? []) {
      assert.deepEqual(Object.keys(h).sort(), ['excerpt', 'pdf_page', ...(h.speaker_role ? ['speaker_role'] : []), 'transcript_page', 'url'], `${commission} ${r.key} page ${h.pdf_page}`)
      if (h.excerpt === null) continue
      assert.ok(/[^.\s]/.test(h.excerpt), 'no empty quotation')
      quoted++; assert.ok(out.citations[i + 1].text.includes(`(PDF page ${h.pdf_page}), hearing turn${h.speaker_role ? ` (${h.speaker_role})` : ''}: "${h.excerpt}"`))
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
      let at = 0, kind = null
      const found = flat.toLowerCase().match(/[a-z]{5,}/g) ?? []
      if (found.length) search.add(found[found.length >> 1])
      for (const [i, line] of lines.entries()) {
        kind = opener(line, kind === 'note')
        if (kind) {
          barred.push([at, kind === 'note' ? at + line.length : at + 1])
          // Search for the words of the opener itself, the word before it and the first long word after it.
          const own = (kind === 'heading' ? line.slice(0, line.indexOf(':')) : kind === 'note' ? line : '').toLowerCase().match(/[a-z0-9]{2,}/g) ?? []
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
  const mixed = { ...payload, sources: [...payload.sources, { resource: 'fact-2', kind: 'record', url: 'https://opax.test/report/robodebt', title: 'Final report, page 3', snippet: 'Final report, page 3: "a finding".', cited: true }] }
  assert.equal(api.withTranscriptNote(mixed).answer, answer, 'a non-transcript source: no note')
  const uncited = { ...mixed, sources: mixed.sources.map(s => s.resource === 'fact-2' ? { ...s, cited: false } : s) }
  assert.equal(api.withTranscriptNote(uncited).answer, `${answer}\n\n${api.TRANSCRIPT_NOTE}`, 'only cited sources count')
  for (const over of [{ answer_decision: 'limitation' }, { answered: false }, { answer: '' }]) assert.deepEqual(api.withTranscriptNote({ ...payload, ...over }), { ...payload, ...over })
  assert.equal(api.withTranscriptNote(listing()).answer, listing().answer, 'a listing already carries the label')
  assert.match(await readFile(new URL('../src/index.ts', import.meta.url), 'utf8'), /linkAskSources\(withTranscriptNote\(/, 'applied to the final Ask payload')
})
