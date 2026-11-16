import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'

const built = await build({ stdin: { contents: [
  "export {excerpt, speakerName, dayWords, spanWords} from './src/tools/transcript-text'",
  "export {callTool} from './src/tools/index'",
  "export {transcriptListingOnly, withTranscriptNote, transcriptNoteResponse, TRANSCRIPT_LABEL, TRANSCRIPT_NOTE} from './src/transcript-answer'",
  "export {askOpaxResult} from './src/voice-sources'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {linkAskSources} from './src/ask-source-links'",
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
  assert.equal(api.transcriptListingOnly([{ text: `Royal Commission into the Robodebt Scheme, Day 12 (1 November 2022), transcript page 1203 (PDF page 9), hearing turn by Ms Smith: "income averaging". ${LABEL}.` }]), false, 'excerpts go to the writer')
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

test('an excerpt stays inside one labelled turn, keeps the label out of the text and names no speaker', () => {
  const page = 'that is the position.\nMS PRESTON: Thank you, Commissioner. I want to ask about income averaging and how\nthe scheme applied it to each debt.\nCOMMISSIONER: Yes.\nMR SMITH SC: Income averaging was raised later.'
  const one = api.excerpt(page, ['income', 'averaging'])
  assert.deepEqual(one, { excerpt: 'Thank you, Commissioner. I want to ask about income averaging and how the scheme applied it to each debt.' })
  const carried = api.excerpt('averaging continued from the last page, said the witness. THE COMMISSIONER: Noted.', ['averaging'])
  assert.deepEqual(carried, { excerpt: 'averaging continued from the last page, said the witness.' })
  // Counsel's label, then unlabelled "Q." and "A." turns: the answer is the witness's, so the label must not name it.
  const qa = 'that was the position, said the witness.\nMS QUELLWORTH: Q. Did the scheme rely on income averaging?\nA. Yes, income averaging was applied to each debt.\nCOMMISSIONER: Yes.'
  const answer = api.excerpt(qa, ['applied'])
  assert.deepEqual(Object.keys(answer), ['excerpt']); assert.match(answer.excerpt, /averaging was applied to each debt/)
  // The search word is the surname in the label: the excerpt is the turn the label opens, with the label cut.
  const surname = api.excerpt(qa, ['quellworth', 'income', 'averaging'])
  assert.deepEqual(surname, { excerpt: 'Q. Did the scheme rely on income averaging? A. Yes, income averaging was applied to each debt.' }); assert.doesNotMatch(surname.excerpt, LABELLED)
  // A label that closes the page, and a label with a doubled colon, are still labels.
  assert.deepEqual(api.excerpt('The averaging was applied to each debt.\nMS QUELLWORTH:', ['averaging']), { excerpt: 'The averaging was applied to each debt.' })
  assert.deepEqual(api.excerpt('MS QUELLWORTH:: The averaging was applied.\nMR VANTERPOOL:', ['vanterpool']), { excerpt: '' })
  assert.deepEqual(api.excerpt('MS QUELLWORTH:: The averaging was applied.\nMR VANTERPOOL:', ['applied']), { excerpt: 'The averaging was applied.' })
  assert.equal(api.speakerName('MS HOGAN-DORAN'), 'Ms Hogan-Doran'); assert.equal(api.speakerName('MR LANCASTER SC'), 'Mr Lancaster SC')
  assert.equal(api.speakerName('McLEOD'), 'McLeod'); assert.equal(api.speakerName("MR O'BRIEN"), "Mr O'Brien"); assert.equal(api.speakerName('THE COMMISSIONER'), 'The Commissioner')
})

/** A turn label, as transcript-text.ts reads one. No excerpt may hold one. */
const LABELLED = /(?<=^|\s)(?:(?:THE|MR|MS|MRS|MISS|DR|PROF|UNCLE|AUNTY) )?[A-Z][A-Za-z'’.-]*[A-Z](?: [A-Z][A-Za-z'’.-]*[A-Z]){0,3}:+(?=\s|$)/
test('no transcript excerpt names a speaker: tool rows, citations and every quotable page', async () => {
  let quoted = 0
  for (const [commission, words] of [['robodebt', 'income averaging'], ['robodebt', 'debt'], ['healthcare-funding', 'funding'], ['healthcare-funding', 'hospital workforce'], ['antisemitism', 'university']]) {
    const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission, words, limit: 8 })
    for (const c of out.citations) assert.ok(!/hearing turn by /.test(c.text), c.text)
    for (const [i, r] of out.rows.entries()) for (const h of r.text_matches?.hits ?? []) {
      assert.ok(!('speaker' in h) && !('speaker_label' in h), `${commission} ${r.key} page ${h.pdf_page}`)
      if (h.excerpt === null) continue
      assert.ok(!/(?:^|\s)(?:THE |MR |MS |DR )?[A-Z][A-Za-z'’.-]*[A-Z]:\s/.test(h.excerpt), h.excerpt)
      quoted++; assert.ok(out.citations[i + 1].text.includes(`(PDF page ${h.pdf_page}), hearing turn: "${h.excerpt}"`))
    }
  }
  assert.ok(quoted > 0)
  // Every page that may be quoted, with a word from the middle of the page as the search word.
  const index = await env.asset('/transcripts/index.json')
  let pages = 0, checked = 0
  for (const d of index.docs) {
    const doc = await env.asset(d.file)
    if (doc.quote_policy !== 'quote') continue
    for (const p of doc.pages) {
      if (typeof p.text !== 'string') continue
      const found = p.text.toLowerCase().match(/[a-z]{5,}/g) ?? []
      // A word from the middle of the page, then each word of each label on the page (a search for a surname).
      const inLabels = (p.text.replace(/\s+/g, ' ').match(new RegExp(LABELLED.source, 'g')) ?? []).flatMap(l => l.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])
      pages++
      for (const w of new Set([found[found.length >> 1], ...inLabels])) {
        const got = api.excerpt(p.text, w ? [w] : []); checked++
        assert.deepEqual(Object.keys(got), ['excerpt'], `${d.key} page ${p.n}`)
        assert.doesNotMatch(got.excerpt, LABELLED, `${d.key} page ${p.n} "${w}"`)
      }
    }
  }
  assert.ok(pages > 1000 && checked > 2 * pages)
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
const turnSource = (n, cited = true) => { const text = `Royal Commission into the Robodebt Scheme, Day ${n} (1 November 2022), transcript page 12${n} (PDF page 9), hearing turn by Ms Smith: "income averaging". ${LABEL}. CC BY 4.0.`; return { resource: `fact-t${n}`, kind: 'record', url: `https://robodebt.royalcommission.gov.au/t${n}.pdf`, title: text, snippet: text, cited } }
const COVERAGE = { resource: 'coverage', kind: 'record', url: 'https://opax.test/methods', title: 'Coverage', snippet: 'Transcripts as the commission published them.', cited: true, coverage: true }

test('an answer citing only hearing transcripts says they are evidence, not findings', async () => {
  const turn = `Royal Commission into the Robodebt Scheme, Day 12 (1 November 2022), transcript page 1203 (PDF page 9), hearing turn by Ms Smith: "income averaging". ${LABEL}. CC BY 4.0.`
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
  const written = { ...payload, answer: `Ms Smith said on hearing day 12 (1 November 2022): “income averaging” ${api.TRANSCRIPT_NOTE}` }
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
  const mid = { ...base, answer: `Ms Smith said: “income averaging” ${api.TRANSCRIPT_NOTE}\n\nThe department continued the scheme.`, sources: [turnSource(1)] }
  const ended = api.withTranscriptNote(mid)
  assert.equal(ended.answer, `${mid.answer}\n\n${api.TRANSCRIPT_NOTE}`)
  assert.ok(ended.answer.startsWith(mid.answer), 'the text before it is as it was')
  assert.equal(api.withTranscriptNote(ended), ended)
  // The transcript writer's all-transcripts sentence under a mixed set of sources: that sentence alone becomes the numbered form.
  const prose = 'The report found the scheme unlawful.\n\nMs Smith said on hearing day 1 (1 November 2022): “income averaging”\n\n'
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
