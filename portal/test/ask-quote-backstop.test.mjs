// The final check on quotations (research-grounding.ts withCheckedQuotes), for hearing transcripts.
// The operator's statement of 16 November 2026: words in quotation marks are checked against the source and removed
// if they do not match exactly. At this last check a sentence checked against a hearing transcript whose quotation
// the transcript does not hold word for word is removed, words and all. Every other sentence keeps the rule of
// 13 November 2026 (marks off, words stay). No model call; stored payloads only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: "export {groundAnswerPayload, NO_SUPPORTED_ANSWER} from './src/research-grounding'", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent' })
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

test('an uncited sentence is checked against every source: with a transcript among them a failed quotation goes', () => {
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
