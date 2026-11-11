import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: [
  "export {excerpt, speakerName, dayWords, spanWords} from './src/tools/transcript-text'",
  "export {callTool} from './src/tools/index'",
  "export {transcriptListingOnly, TRANSCRIPT_LABEL} from './src/transcript-answer'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {guardClaimMeasures, MEASURE_GAP} from './src/ask-claim-measures'",
  "export {extractNamedScope} from './src/agentic-ask'",
  "export {unresolvedPersonAsked} from './src/research-evidence'",
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
  assert.deepEqual(api.guardClaimMeasures(payload), payload, 'the measure guard leaves the listing whole')
  const out = api.groundAnswerPayload(payload, "Which hearing transcripts are there for IBAC's Operation Gloucester?")
  assert.ok(!out.answer.includes(api.MEASURE_GAP)); assert.notEqual(out.answer_decision, 'limitation')
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
  assert.match(rc.citations[0].text, /^Royal Commission into the Robodebt Scheme: \d+ hearing transcripts listed, dated \d{1,2} [A-Z][a-z]+ 2022 to \d{1,2} [A-Z][a-z]+ 2023 \(/)
  for (const c of rc.citations) assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(c.text), c.text)
  const profile = await api.callTool(env, 'royal_commissions', { view: 'profile', commission: 'robodebt' })
  for (const c of profile.citations) assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(c.text), c.text)
  const ibac = await api.callTool(env, 'integrity_reports', { view: 'transcripts', body: 'IBAC', operation: 'Gloucester', limit: 2 })
  assert.match(ibac.citations[0].text, /, dated 4 February 2019 to 1 March 2019, newest first\./)
})

test('an excerpt stays inside one speaker turn, with the label moved to a speaker field', () => {
  const page = 'that is the position.\nMS PRESTON: Thank you, Commissioner. I want to ask about income averaging and how\nthe scheme applied it to each debt.\nCOMMISSIONER: Yes.\nMR SMITH SC: Income averaging was raised later.'
  const one = api.excerpt(page, ['income', 'averaging'])
  assert.deepEqual(one, { excerpt: 'Thank you, Commissioner. I want to ask about income averaging and how the scheme applied it to each debt.', speaker: 'Ms Preston', speaker_label: 'MS PRESTON' })
  const carried = api.excerpt('averaging continued from the last page, said the witness. THE COMMISSIONER: Noted.', ['averaging'])
  assert.deepEqual(carried, { excerpt: 'averaging continued from the last page, said the witness.' }, 'a turn begun on an earlier page has no speaker here')
  assert.equal(api.speakerName('MS HOGAN-DORAN'), 'Ms Hogan-Doran'); assert.equal(api.speakerName('MR LANCASTER SC'), 'Mr Lancaster SC')
  assert.equal(api.speakerName('McLEOD'), 'McLeod'); assert.equal(api.speakerName("MR O'BRIEN"), "Mr O'Brien"); assert.equal(api.speakerName('THE COMMISSIONER'), 'The Commissioner')
})

test('quoted CC BY excerpts carry no speaker labels, and a hearing turn supports "said"', async () => {
  const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 8 })
  let named = 0
  for (const [i, r] of out.rows.entries()) for (const h of r.text_matches?.hits ?? []) {
    if (h.excerpt === null) continue
    assert.ok(!/(?:^|\s)(?:THE |MR |MS |DR )?[A-Z][A-Za-z'’.-]*[A-Z]:\s/.test(h.excerpt), h.excerpt)
    if (!h.speaker) continue
    named++; assert.ok(out.citations[i + 1].text.includes(`hearing turn by ${h.speaker}: "${h.excerpt}"`))
    const sentence = `${h.speaker} said the scheme used income averaging.`
    const payload = { answer: sentence, citations: { 'fact-1/t/body/0': [[0, Array.from(sentence).length]] }, sources: [{ resource: 'fact-1', kind: 'record', url: out.citations[i + 1].url, snippet: out.citations[i + 1].text, cited: true }] }
    assert.equal(api.guardClaimMeasures(payload).answer, sentence)
  }
  assert.ok(named > 0)
})

test('a commission named in the question is not an unresolved person', () => {
  const roster = { people: [{ name: 'Bill Shorten' }, { name: 'Penny Wong' }] }
  const asked = q => api.unresolvedPersonAsked(q, api.extractNamedScope(q, roster, null))
  for (const q of ['What did witnesses at the Robodebt Royal Commission say about income averaging?', 'What has the Robodebt Royal Commission said about income averaging?',
    'What did counsel assisting the Royal Commission into the Robodebt Scheme say about income averaging?', 'What did Bill Shorten say at the Robodebt Royal Commission?']) assert.equal(asked(q), false, q)
  for (const q of ['What has John Smith said about income averaging?', 'What did John Smith at the Robodebt Royal Commission say about income averaging?']) assert.equal(asked(q), true, q)
})
