// The final check on quotations (research-grounding.ts withCheckedQuotes), for hearing transcripts.
// The operator's statement of 16 November 2026: words in quotation marks are checked against the source and removed
// if they do not match exactly. At this last check a sentence checked against a hearing transcript whose quotation
// the transcript does not hold word for word is removed, words and all. Every other sentence keeps the rule of
// 13 November 2026 (marks off, words stay). No model call; stored payloads only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: "export {groundAnswerPayload, NO_SUPPORTED_ANSWER} from './src/research-grounding';export {researchSentenceStream} from './src/research-sentence-stream';export {checkedAnswerPayload} from './src/research-response'", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

const LABEL = 'Hearing transcript: evidence, not findings'
const EXCERPT = 'Mr Placeholder had approved the use of income averaging in that year, and nobody raised the legal advice.'
const heard = { resource: 'fact-1', slug: '', kind: 'record', cited: true, url: 'https://commission.example/day46.pdf#page=15', href: 'https://commission.example/day46.pdf#page=15',
  title: `Example Royal Commission, Transcript Hearing Day 46 (10 March 2023). ${LABEL}.`, snippet: `Example Royal Commission, Transcript Hearing Day 46 (10 March 2023), transcript page P-4899 (PDF page 15), hearing turn: "${EXCERPT}" ${LABEL}.` }
const speech = { resource: 'speech-7', slug: 'speech-7', kind: 'speech', cited: true, speaker: 'Robin Example', date: '2023-03-20', title: 'Social services statement', url: 'https://opax.test/doc/speech-7', href: 'https://opax.test/doc/speech-7',
  snippet: 'Income averaging was applied to every debt raised under the scheme, and the department knew it.' }
const question = 'What is on the record about income averaging?'
const chars = s => Array.from(s).length
/** A payload whose sentences each cite the sources named beside them, joined by a space or a line break. */
function payload(parts, sources, join = ' ') {
  let answer = ''; const citations = {}
  for (const [text, ...ids] of parts) {
    if (answer) answer += join
    const from = chars(answer); answer += text
    for (const id of ids) (citations[`${id}/t/body/0`] ??= []).push([from, chars(answer)])
  }
  return { answered: true, answer, answer_decision: 'answer', research: { mode: 'loop' }, citations, sources }
}
const ground = (p, partial = false) => api.groundAnswerPayload(p, question, '', partial)
/** Every citation range lies inside the answer and covers whole words of it. */
function rangesHold(out) {
  for (const [id, ranges] of Object.entries(out.citations ?? {})) for (const [a, b] of ranges) {
    assert.ok(a >= 0 && b > a && b <= chars(out.answer), `${id} ${a}-${b}`)
    const cited = Array.from(out.answer).slice(a, b).join('')
    assert.ok(/^\S/.test(cited) && /\S$/.test(cited), JSON.stringify(cited))
  }
}
const NEAR = 'The transcript records a witness saying that “Mr Placeholder approved the use of income averaging in that year”.'
const EXACT = 'The transcript records: “Mr Placeholder had approved the use of income averaging in that year”.'
const SAID = 'On 20 March 2023 Robin Example said income averaging was applied to every debt.'

test('a near-verbatim quotation of a transcript goes with its words: no name is left in prose', () => {
  const out = ground(payload([[NEAR, 'fact-1'], [SAID, 'speech-7']], [heard, speech]))
  assert.doesNotMatch(out.answer, /Placeholder|a witness saying/)
  assert.match(out.answer, /Robin Example said income averaging was applied to every debt\./)
  rangesHold(out)
  // The transcript is no longer cited; the speech still is, on the words that are still there.
  assert.deepEqual(Object.keys(out.citations), ['speech-7/t/body/0'])
  const [[a, b]] = out.citations['speech-7/t/body/0']
  assert.equal(Array.from(out.answer).slice(a, b).join(''), SAID)
  assert.deepEqual(out.sources.map(s => [s.resource, s.cited]), [['fact-1', false], ['speech-7', true]])
})

test('a quotation with "..." inside is not word for word, and goes; an exact one is untouched', () => {
  const elided = 'The transcript records: “Mr Placeholder had approved ... in that year”.'
  const out = ground(payload([[elided, 'fact-1'], [EXACT, 'fact-1'], [SAID, 'speech-7']], [heard, speech]))
  assert.doesNotMatch(out.answer, /\.\.\./)
  assert.ok(out.answer.includes(EXACT), out.answer)
  assert.equal(out.answer.replace(/“[^”]*”/g, '').includes('Placeholder'), false, 'the name is only inside the verbatim quotation')
  rangesHold(out)
  // An answer whose quotations are all exact comes out as it went in.
  const same = payload([[EXACT, 'fact-1'], [SAID, 'speech-7']], [heard, speech])
  assert.equal(ground(same).answer, same.answer); assert.deepEqual(ground(same).citations, same.citations)
})

test('the whole sentence goes, so nothing is left broken; list markers and blank lines close up', () => {
  const out = ground(payload([[`- ${SAID}`, 'speech-7'], [`- ${NEAR}`, 'fact-1'], ['- The commission reported in July 2023.']], [heard, speech], '\n'))
  // (The answer's later shaping may drop the list markers of a two-line list; the lines themselves are what matter.)
  assert.deepEqual(out.answer.split('\n').map(l => l.replace(/^- /, '')), [SAID, 'The commission reported in July 2023.'])
  rangesHold(out)
  const mid = ground(payload([[SAID, 'speech-7'], [NEAR, 'fact-1'], ['The commission reported in July 2023.']], [heard, speech]))
  assert.equal(mid.answer, `${SAID} The commission reported in July 2023.`)
  const last = ground(payload([[SAID, 'speech-7'], [NEAR, 'fact-1']], [heard, speech]))
  assert.equal(last.answer, SAID); rangesHold(last)
  const paragraphs = ground(payload([[SAID, 'speech-7'], [NEAR, 'fact-1'], ['The commission reported in July 2023.']], [heard, speech], '\n\n'))
  assert.equal(paragraphs.answer, `${SAID}\n\nThe commission reported in July 2023.`); rangesHold(paragraphs)
})

test('an answer whose only sentence is removed still says something: the fixed line, with nothing cited, and the same on a second pass', () => {
  const out = ground(payload([[NEAR, 'fact-1']], [heard]))
  assert.equal(out.answer, api.NO_SUPPORTED_ANSWER); assert.equal(api.NO_SUPPORTED_ANSWER, 'OPAX cannot establish the requested answer from the selected records.')
  assert.deepEqual(out.citations, {}); assert.ok(out.sources.every(s => s.cited !== true))
  const again = ground(out)
  assert.equal(again.answer, api.NO_SUPPORTED_ANSWER)
})

test('an uncited sentence that loosely quotes a held transcript excerpt goes', () => {
  const uncited = 'One account was that “Mr Placeholder approved the use of income averaging in that year”.'
  const out = ground(payload([[uncited], [SAID, 'speech-7']], [heard, speech]))
  assert.doesNotMatch(out.answer, /Placeholder/); assert.match(out.answer, /Robin Example said/)
})

test('sentences that rest on no transcript keep the standing rule: marks off, words stay', () => {
  // Cited to a speech only.
  const loose = 'Robin Example said the scheme “applied income averaging to all debts whatsoever”.'
  const out = ground(payload([[loose, 'speech-7']], [heard, speech]))
  assert.match(out.answer, /Robin Example said the scheme applied income averaging to all debts whatsoever\./); assert.doesNotMatch(out.answer, /“/)
  // No transcript among the answer's sources at all.
  const plain = ground(payload([['The minister called it a “landmark” reform.']], [speech]))
  assert.match(plain.answer, /called it a landmark reform/)
  // A verbatim quotation of the speech stays quoted.
  const kept = ground(payload([['Robin Example said: “Income averaging was applied to every debt raised under the scheme”.', 'speech-7']], [heard, speech]))
  assert.match(kept.answer, /“Income averaging was applied to every debt raised under the scheme”/)
})

test('a streamed preview is checked the same way, so a sentence that will be removed is never shown first', () => {
  const full = payload([[SAID, 'speech-7'], [NEAR, 'fact-1'], ['The commission reported in July 2023.']], [heard, speech])
  // Each preview holds the sentences written so far; the check runs on it before anything is released.
  const first = ground(payload([[SAID, 'speech-7']], [heard, speech]), true)
  const second = ground(payload([[SAID, 'speech-7'], [NEAR, 'fact-1']], [heard, speech]), true)
  const done = ground(full)
  assert.equal(first.answer, SAID)
  assert.equal(second.answer, SAID, 'the failing sentence never reaches a preview')
  assert.ok(done.answer.startsWith(second.answer), 'the final answer extends what was shown; nothing shown is taken back')
  assert.doesNotMatch(done.answer, /Placeholder/)
  // A preview that is only the failing sentence shows the fixed line's place as nothing to release, never the words.
  assert.doesNotMatch(ground(payload([[NEAR, 'fact-1']], [heard]), true).answer, /Placeholder/)
})

// ---- Review of 16 November 2026 (REQUEST CHANGES): each case below failed before its fix. ----
const EXCERPT2 = 'Mr Placeholder had approved the use of income averaging in that year, and nobody raised the legal advice. I didn’t see the advice until No. 4 was signed.'
const heard2 = { ...heard, snippet: heard.snippet.replace(EXCERPT, EXCERPT2) }
const TAIL = 'The commission reported in July 2023.'

test('every form of quotation is read in a sentence citing a transcript: over a line break, single marks, marks inside marks, a dash, a mark never closed', () => {
  const rows = [
    'The transcript records: “Did Mr Placeholder approve it?\nYes, Mr Placeholder approved all of it.”',
    'A witness said ‘I didn’t ever tell Mr Placeholder a thing’.',
    "A witness said 'Mr Placeholder didn't approve any of it'.",
    'A witness said “Mr Placeholder had approved "the fraud" in that year”.',
    "A witness said—'Mr Placeholder approved all of it'—under oath.",
    'A witness said “Mr Placeholder approved all of it.',
  ]
  for (const row of rows) {
    const out = ground(payload([[SAID, 'speech-7'], [row, 'fact-1']], [heard2, speech], '\n'))
    assert.equal(out.answer, SAID, row); rangesHold(out)
  }
  // The same marks around words the transcript does hold are untouched.
  for (const row of ['A witness said ‘I didn’t see the advice until No. 4 was signed’.', 'The transcript records: “Mr Placeholder had approved the use of income averaging in that year, and nobody raised the legal advice. I didn’t see the advice until No. 4 was signed.”']) {
    const out = ground(payload([[SAID, 'speech-7'], [row, 'fact-1']], [heard2, speech], '\n'))
    assert.ok(out.answer.includes(row.replace(/‘([^’]*’[^’]*)’\./, '‘$1’.')) || out.answer.includes('didn’t see the advice until No. 4 was signed'), out.answer)
  }
})

test('Hansard and every other record behave exactly as on main, with a transcript among the sources or not', () => {
  // The four uncited sentences the review ran. On main each loses its marks and keeps its words.
  const cases = [
    ['Robin Example told the House the scheme “applied income averaging to all debts whatsoever”.', 'Robin Example told the House the scheme applied income averaging to all debts whatsoever.'],
    ['The scheme became known as “robodebt” in the press.', 'The scheme became known as robodebt in the press.'],
    ['The “Social Services Legislation Amendment Bill 2023” was then introduced.', 'The Social Services Legislation Amendment Bill 2023 was then introduced.'],
  ]
  const count = { resource: 'fact-3', slug: '', kind: 'count', cited: true, url: 'https://opax.test/rc', href: 'https://opax.test/rc', title: 'Example Royal Commission', snippet: `OPAX lists 46 hearing transcripts from the Example Royal Commission, dated 1 November 2022 to 10 March 2023. ${LABEL}.` }
  for (const [uncited, want] of cases) {
    // The same answer with no transcript anywhere is main's own output; a transcript or a listing row changes nothing.
    const plain = ground(payload([[SAID, 'speech-7'], [uncited]], [speech], '\n'))
    assert.equal(plain.answer, SAID + '\n' + want)
    for (const sources of [[heard, speech], [count, speech], [heard, count, speech]]) assert.equal(ground(payload([[SAID, 'speech-7'], [uncited]], sources, '\n')).answer, plain.answer, uncited)
  }
  // A listing or count row carries the label and holds no evidence: a sentence citing it keeps the standing rule.
  const listed = ground(payload([['OPAX lists 46 transcripts, which one member called “a mountain of paper”.', 'fact-3']], [count, speech]))
  assert.match(listed.answer, /called a mountain of paper/)
  // A sentence citing a speech and a transcript is checked as a transcript sentence (intended): a loose quotation goes.
  const both = ground(payload([[SAID, 'speech-7'], ['Robin Example said the scheme “applied income averaging to all debts whatsoever”.', 'speech-7', 'fact-1']], [heard, speech], '\n'))
  assert.equal(both.answer, SAID)
})

test('a loose quotation of a held excerpt goes whatever the sentence cites; a loose quotation of the cited record itself keeps the standing rule', () => {
  // Cites the speech, near-quotes the transcript.
  const borrowed = 'Robin Example said “Mr Placeholder approved the use of income averaging in that year”.'
  const out = ground(payload([[SAID, 'speech-7'], [borrowed, 'speech-7']], [heard, speech], '\n'))
  assert.equal(out.answer, SAID); rangesHold(out)
  // The transcript is not among the answer's sources, but its excerpt was among the facts given to the writer.
  const given = { ...payload([[SAID, 'speech-7'], [borrowed, 'speech-7'], ['One account was that “nobody raised the legal advice at all that year”.']], [speech], '\n'), research: { mode: 'loop', pre_writer_sources: [speech, heard] } }
  assert.equal(ground(given).answer, SAID)
  // Cites the speech, loosely quotes the speech: marks off, words stay.
  const own = ground(payload([['Robin Example said the scheme “applied income averaging to all debts whatsoever”.', 'speech-7']], [heard, speech]))
  assert.match(own.answer, /said the scheme applied income averaging to all debts whatsoever\./)
})

/** Feeds each preview to the real sentence stream, then runs the final boundary as the done frame does. */
async function streamed(previews, final) {
  const sent = [], stream = api.researchSentenceStream(question, async text => { sent.push(text) })
  for (const preview of previews) await stream.preview(preview)
  stream.close()
  const released = sent.join(''), done = api.checkedAnswerPayload(final, question, false, released)
  return { sent, released, done }
}
const written = (parts, sources) => ({ ...payload(parts, sources, '\n'), machine_written: true, research: { mode: 'loop', pre_writer_sources: [speech, heard] } })

test('a sentence released to a streamed reader is never removed afterwards, and the fixed line is never released', async () => {
  const TERM = 'The scheme became known as “robodebt” in the press.', VERB = 'A witness said “nobody raised the legal advice”.'
  // The writer lane: a draft's source list holds only the facts cited so far. An uncited quoted term is released, then
  // a sentence citing the transcript arrives. The released sentence stays: the answer extends what was shown.
  const grew = await streamed([written([[SAID, 'speech-7'], [TERM]], [speech]), written([[SAID, 'speech-7'], [TERM], [VERB, 'fact-1']], [speech, heard])], written([[SAID, 'speech-7'], [TERM], [VERB, 'fact-1']], [speech, heard]))
  assert.ok(grew.released.includes('The scheme became known as robodebt in the press.'), JSON.stringify(grew.sent))
  assert.ok(String(grew.done.answer).startsWith(grew.released), `final: ${grew.done.answer}\nshown: ${grew.released}`)
  assert.ok(String(grew.done.answer).includes('The scheme became known as robodebt in the press.'))
  // The same with points and no pre_writer_sources: sources grow from a speech to a speech and a transcript.
  const points = (parts, sources) => ({ ...payload(parts, sources, '\n'), machine_written: true })
  const loop = await streamed([points([[SAID, 'speech-7'], [TERM]], [speech]), points([[SAID, 'speech-7'], [TERM], [VERB, 'fact-1']], [speech, heard])], points([[SAID, 'speech-7'], [TERM], [VERB, 'fact-1']], [speech, heard]))
  assert.ok(String(loop.done.answer).startsWith(loop.released), `final: ${loop.done.answer}\nshown: ${loop.released}`)
  // The first sentence is the failing one: nothing is released for it, least of all the fixed line.
  const first = await streamed([points([[NEAR, 'fact-1']], [heard]), points([[NEAR, 'fact-1'], [SAID, 'speech-7']], [heard, speech])], points([[NEAR, 'fact-1'], [SAID, 'speech-7'], [TAIL]], [heard, speech]))
  assert.ok(first.sent.every(text => !text.includes('OPAX cannot establish') && !text.includes('Placeholder')), JSON.stringify(first.sent))
  assert.ok(String(first.done.answer).startsWith(first.released)); assert.doesNotMatch(String(first.done.answer), /Placeholder/)
  // Every sentence fails: nothing is released, and the finished answer is the fixed line.
  const none = await streamed([points([[NEAR, 'fact-1']], [heard])], points([[NEAR, 'fact-1']], [heard]))
  assert.deepEqual(none.sent, []); assert.equal(none.done.answer, api.NO_SUPPORTED_ANSWER)
  assert.equal(ground(payload([[NEAR, 'fact-1']], [heard]), true).answer, '', 'a preview with nothing left is empty, not the fixed line')
})

test('marks that do not pair take only their own sentence, and a mark never closed only its own line', () => {
  for (const row of ['A witness said "Mr Placeholder approved all of it”.', 'A witness said “Mr Placeholder approved all of it".']) {
    const out = ground(payload([[SAID, 'speech-7'], [row, 'fact-1'], [TAIL]], [heard, speech]))
    assert.equal(out.answer, `${SAID} ${TAIL}`, row); rangesHold(out)
  }
  const open = ground(payload([[SAID, 'speech-7'], ['A witness said “Mr Placeholder approved all of it.', 'fact-1'], [TAIL]], [heard, speech], '\n'))
  assert.equal(open.answer, `${SAID}\n${TAIL}`); rangesHold(open)
})

test('an emptied answer reads as a limitation written by code, not as a machine-written answer', () => {
  const out = ground({ ...payload([[NEAR, 'fact-1']], [heard]), machine_written: true })
  assert.equal(out.answer, api.NO_SUPPORTED_ANSWER); assert.equal(out.answer_decision, 'limitation'); assert.equal(out.machine_written, false)
  assert.deepEqual(out.citations, {}); assert.ok(out.sources.every(s => s.cited !== true))
})

test('a term quoted from a transcript row\'s own header is held by that row', () => {
  const out = ground(payload([['The hearing was held by the “Example Royal Commission”.', 'fact-1']], [heard]))
  assert.match(out.answer, /“Example Royal Commission”/)
})
