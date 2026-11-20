// The error notice on every machine-written answer: one additive string field, `machine_notice`, set by code at
// the Worker's exits and printed by every client under the answer and above its sources. Two fixed wordings.
// No network, no model: payloads here are fixtures with invented names.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: [
  "export * from './src/machine-notice'",
  "export {transcriptNoteResponse, withTranscriptNote, TRANSCRIPT_LABEL} from './src/transcript-answer'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const read = path => readFile(new URL(path, import.meta.url), 'utf8')

const DEFAULT = 'Machine-written answers can contain errors. Check the original record before relying on one.'
const TRANSCRIPT = 'Machine-written answers can contain errors. Check the original transcript before relying on it.'
const SPEECH = { resource: 'speech-1', kind: 'speech', url: 'https://opax.test/doc/speech-1', title: 'Alex Example, second reading speech', snippet: 'We will vote for the bill.', cited: true }
const HEARING = { resource: 'fact-2', kind: 'record', url: 'https://opax.test/t/2.pdf', title: `An invented commission, hearing day 2. ${api.TRANSCRIPT_LABEL}.`, snippet: `Morgan Sample said: “We did not know.” transcript page P-12. ${api.TRANSCRIPT_LABEL}.`, cited: true }
const written = { answered: true, answer_decision: 'answer', answer: 'Alex Example said the bill would pass.', answer_status: 'answered', machine_written: true, citations: { 'speech-1/t/body/0': [[0, 20]] }, sources: [SPEECH] }

const sse = events => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
const doneOf = wire => JSON.parse(/^event: done\ndata: (.+)$/m.exec(wire)[1])
/** A stream delivered in pieces that cut frames, and a multi-byte character, in half. */
function chunked(wire, size) {
  const bytes = new TextEncoder().encode(wire)
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close() } }), { headers: { 'content-type': 'text/event-stream', 'x-opax-cache': 'HIT' } })
}
/** The Ask exit as index.ts composes it. */
const exit = response => api.transcriptNoteResponse(response).then(api.machineNoticeResponse)

test('the two wordings are fixed strings', () => {
  assert.equal(api.MACHINE_NOTICE, DEFAULT)
  assert.equal(api.MACHINE_NOTICE_TRANSCRIPT, TRANSCRIPT)
  for (const text of [DEFAULT, TRANSCRIPT]) assert.ok(!/[\u2013\u2014]/.test(text))
})

test('every machine-written payload carries the notice; the wording follows the transcript test', () => {
  const cases = {
    'written answer': written,
    'older engine, uncited': { ...written, answer_status: 'uncited', citations: {} },
    'limited answer': { ...written, answer_decision: 'limited' },
    'answer cached before the Worker said who wrote it': { answer: written.answer, citations: written.citations, sources: [SPEECH] },
    'written overview paragraph above a calculated table': { answer: '| Donor | Total |\n|---|---|\n| A | $1 |', answer_status: 'calculated', money_ranking: true, money_overview: 'Receipts rose over the period.', machine_written: true, sources: [SPEECH] },
    'overview from before the flag': { answer: '| Donor | Total |', answer_status: 'calculated', money_overview: 'Receipts rose over the period.', sources: [SPEECH] },
    'did you mean': { answer: 'That does not say enough to search the record on. Did you mean: What has Alex Example said about housing?', answer_status: 'needs_question', suggested_question: 'What has Alex Example said about housing?', machine_written: true, citations: {}, sources: [] },
    'did you mean, from before the flag': { answer: 'Did you mean: What has Alex Example said about housing?', answer_status: 'needs_question', suggested_question: 'What has Alex Example said about housing?', sources: [] },
  }
  for (const [name, payload] of Object.entries(cases)) {
    const out = api.withMachineNotice(payload)
    assert.equal(out.machine_notice, DEFAULT, name)
    const { machine_notice, ...rest } = out
    assert.deepEqual(rest, payload, `${name}: nothing else changes`)
    assert.equal(api.withMachineNotice(out), out, `${name}: said once`)
  }
  // A hearing transcript among the cited sources, alone or beside other records: the transcript wording.
  for (const sources of [[HEARING], [SPEECH, HEARING]]) {
    const payload = { ...written, sources }
    assert.equal(api.withMachineNotice(payload).machine_notice, TRANSCRIPT)
    // The same rows that give the answer its evidence line.
    assert.match(api.withTranscriptNote(payload).answer, /evidence, not findings\.$/)
    assert.equal(api.withMachineNotice(api.withTranscriptNote(payload)).machine_notice, TRANSCRIPT)
  }
  // Retrieved but not cited, or a speech that only talks about a transcript: the default wording, and no line.
  for (const sources of [[SPEECH, { ...HEARING, cited: false }], [{ ...SPEECH, snippet: 'I have read the hearing transcript.' }]]) {
    assert.equal(api.withMachineNotice({ ...written, sources }).machine_notice, DEFAULT)
    assert.equal(api.withTranscriptNote({ ...written, sources }).answer, written.answer)
  }
})

test('a response with no model-written text carries no notice', () => {
  const cases = {
    'calculated table': { answer: '| Donor | Total |', answer_status: 'calculated', money_ranking: true, machine_written: false, sources: [SPEECH] },
    'calculated table from before the flag': { answer: '| Donor | Total |', answer_status: 'calculated', sources: [SPEECH] },
    'passages only': { answer: 'Passages from the record.', answer_status: 'evidence_only', machine_written: false, sources: [SPEECH] },
    'records do not cover it': { answer: 'The disclosures do not cover this.', answer_status: 'evidence_gap', machine_written: false, sources: [] },
    'choose the scope': { answer: 'Which donor do you mean?', answer_status: 'needs_scope', sources: [] },
    'choose the period': { answer: 'Which year do you mean?', answer_status: 'needs_period', sources: [] },
    'clarify prompt with no suggestion': { answer: 'Ask a full question, naming the person, party or topic you mean.', answer_status: 'needs_question', machine_written: false, sources: [] },
    'decline': { answer: '', answered: false, reason: 'no_support', sources: [SPEECH] },
    'decline that kept a draft': { answer: 'A draft.', answered: false, machine_written: true, sources: [SPEECH] },
    'blank answer': { answer: '   ', answer_status: 'answered', machine_written: true, sources: [SPEECH] },
    'identity fact from the roster': { answer: 'Alex Example is a senator for Tasmania.', answer_status: 'answered', identity_fact: true, machine_written: false, sources: [SPEECH] },
    'transcript quote lines, fixed wording': { answer: 'Morgan Sample said on hearing day 2: “We did not know.”', answer_status: 'answered', machine_written: false, sources: [HEARING] },
    'record-summary fallback': { answer: 'Here is what the record shows.', answered: true, fallback: 'record_summary', machine_written: false, sources: [SPEECH] },
    'an error': { error: 'The answer took too long. Please try again.' },
  }
  for (const [name, payload] of Object.entries(cases)) {
    assert.equal(api.withMachineNotice(payload), payload, name)
    assert.equal(api.machineNotice(payload, true), null, name)
  }
  for (const value of [null, undefined, 'text', 3, [written]]) assert.equal(api.withMachineNotice(value), value)
})

test('every Ask exit carries the field: blocking and streamed, both engines, cached and replayed', async () => {
  // Blocking JSON, a fresh answer.
  const blocking = await exit(Response.json(written, { headers: { 'x-opax-cache': 'MISS' } }))
  assert.equal(blocking.headers.get('x-opax-cache'), 'MISS')
  assert.deepEqual(await blocking.json(), { ...written, machine_notice: DEFAULT })
  // What the cache held before this change: no field, and no word on who wrote it. It gains the field as served.
  const stored = { answered: true, answer: written.answer, citations: written.citations, sources: [SPEECH] }
  const hit = await exit(Response.json(stored, { headers: { 'x-opax-cache': 'HIT', 'x-opax-cached-at': '2026-11-01T00:00:00Z' } }))
  assert.equal(hit.headers.get('x-opax-cache'), 'HIT'); assert.equal(hit.headers.get('x-opax-cached-at'), '2026-11-01T00:00:00Z')
  assert.deepEqual(await hit.json(), { ...stored, machine_notice: DEFAULT })
  // The research loop's reply and the older engine's differ in fields, not in the exit.
  const loop = { ...written, research: { trail: [{ tool: 'search' }] }, agentic: { steps: [], ms: 10 } }
  assert.equal((await (await exit(Response.json(loop))).json()).machine_notice, DEFAULT)
  // A live stream and a cached replay speak the same frames: status, deltas, then the payload as `done`.
  for (const first of [{ phase: 'writing' }, { phase: 'cached' }]) {
    const wire = sse([['status', first], ['delta', { text: 'Alex Example said “the bill' }], ['delta', { text: ' would pass”.' }], ['done', stored]])
    for (const size of [1, 7, 64, 100_000]) {
      const out = await (await exit(chunked(wire, size))).text()
      assert.deepEqual(doneOf(out), { ...stored, machine_notice: DEFAULT }, `chunks of ${size}`)
      assert.equal(out.replace(/^event: done\ndata: .+$/m, ''), wire.replace(/^event: done\ndata: .+$/m, ''), 'every other frame is untouched')
    }
  }
  // A transcript answer leaves with its evidence line and the transcript wording, streamed or not.
  const hearing = { ...stored, sources: [SPEECH, HEARING] }
  const json = await (await exit(Response.json(hearing))).json()
  assert.equal(json.machine_notice, TRANSCRIPT); assert.match(json.answer, /Source 2 is a hearing transcript: evidence, not findings\.$/)
  const streamed = doneOf(await (await exit(chunked(sse([['delta', { text: stored.answer }], ['done', hearing]]), 9))).text())
  assert.deepEqual(streamed, json)
  // Already carrying it (a hop that passed through the exit before): served byte for byte.
  const text = JSON.stringify({ ...written, machine_notice: DEFAULT })
  assert.equal(await (await exit(new Response(text, { headers: { 'content-type': 'application/json' } }))).text(), text)
  // No model-written text, an error, or a body that is not what it claims: out as it came, never emptied or blocked.
  const table = { answer: '| Donor | Total |', answer_status: 'calculated', machine_written: false, sources: [SPEECH] }
  assert.equal(await (await exit(new Response(JSON.stringify(table), { headers: { 'content-type': 'application/json' } }))).text(), JSON.stringify(table))
  assert.equal(await (await exit(chunked(sse([['done', table]]), 11))).text(), sse([['done', table]]))
  const failed = await exit(Response.json({ error: 'The answer took too long. Please try again.' }, { status: 504 }))
  assert.equal(failed.status, 504); assert.deepEqual(await failed.json(), { error: 'The answer took too long. Please try again.' })
  assert.equal(await (await exit(new Response('not json', { headers: { 'content-type': 'application/json' } }))).text(), 'not json')
  const broken = 'event: done\ndata: {"answer": \n\n'
  assert.equal(await (await exit(chunked(broken, 4))).text(), broken)
  assert.equal(await (await exit(chunked(sse([['error', { error: 'The stream broke.' }]]), 6))).text(), sse([['error', { error: 'The stream broke.' }]]))
})

test('the Worker has one way out for Ask, and it sets the field there', async () => {
  const index = await read('../src/index.ts')
  assert.match(index, /async function apiAskReply\([^)]*\): Promise<Response> \{\n[^\n]*\n  return transcriptNoteResponse\(await apiAskRouted\([^\n]*\)\)\.then\(machineNoticeResponse\)/)
  assert.equal(index.match(/\bapiAskRouted\(/g).length, 2, 'the route and voice reach Ask only through the wrapped entry point')
  // The operator's gold route builds its own reply; it sets the field too.
  assert.match(index, /json\(withMachineNotice\(withTranscriptNote\(linkAskSources\(agenticAskPayload\(run, q\)/)
  // The other two routes where a model writes for a reader.
  assert.match(index, /mapAnswerPayload\(await apiSearchSummary\(request, url, env, ctx, summaryMayGenerate\(request\.method, request\.headers\.get\('user-agent'\)\)\), withSummaryNotice\)/)
  assert.match(index, /mapAnswerPayload\(await apiJourneyStory\(request,body\.value,env,ctx\), withStoryNotice\)/)
  assert.equal(index.match(/\bapiSearchSummary\(/g).length, 2); assert.equal(index.match(/\bapiJourneyStory\(/g).length, 2)
})

test('a search overview and a journey story carry the notice; an empty or failed one does not', async () => {
  const summary = { status: 'ready', points: [{ text: 'Members debated housing.', source_ids: ['s1'] }], sources: [{ id: 's1', title: 'A speech', href: '/doc/s1', snippet: '', kind: 'speech', evidence: [] }], reviewed_count: 1, partial: false }
  assert.deepEqual(api.withSummaryNotice(summary), { ...summary, machine_notice: DEFAULT })
  const empty = { status: 'empty', points: [], sources: [] }
  assert.equal(api.withSummaryNotice(empty), empty)
  // A cache hit is plain JSON, a miss streams points then `done`; both leave with the field.
  assert.equal((await (await api.mapAnswerPayload(Response.json(summary, { headers: { 'x-opax-cache': 'HIT' } }), api.withSummaryNotice)).json()).machine_notice, DEFAULT)
  const wire = sse([['point', summary.points[0]], ['done', summary]])
  const out = await (await api.mapAnswerPayload(chunked(wire, 13), api.withSummaryNotice)).text()
  assert.equal(doneOf(out).machine_notice, DEFAULT)
  assert.ok(out.startsWith(sse([['point', summary.points[0]]])), 'points pass as they came')
  assert.equal(await (await api.mapAnswerPayload(chunked(sse([['error', { error: 'A cited summary is unavailable.' }]]), 13), api.withSummaryNotice)).text(), sse([['error', { error: 'A cited summary is unavailable.' }]]))
  const story = { steps: [{ title: 'Who gave', body: 'Receipts were disclosed.', evidence: ['n1'] }], generated: true, version: 'story-3' }
  assert.deepEqual(api.withStoryNotice(story), { ...story, machine_notice: DEFAULT })
  const unavailable = await api.mapAnswerPayload(Response.json({ error: 'Story unavailable' }, { status: 502 }), api.withStoryNotice)
  assert.deepEqual(await unavailable.json(), { error: 'Story unavailable' })
  assert.equal(api.withStoryNotice({ error: 'Story unavailable' }).machine_notice, undefined)
})

test('the web prints the field in the search overview, the journey story and Then vs now, above their sources', async () => {
  const [html, app, journeys, tvn, css] = await Promise.all(['index.html', 'app.js', 'money-journeys.js', 'thenvsnow.js', 'style.css'].map(f => read('../public/' + f)))
  // Search overview: points, then the notice, then the Sources fold.
  assert.match(html, /id="search-answer-body"><\/div>\s*<p class="answer-notice" id="search-answer-notice" hidden><\/p>\s*<details id="search-answer-fold"/)
  assert.match(app, /renderAnswerNotice\(\$\("search-answer-notice"\), data\.machine_notice\);/)
  // Journey story: narration, its status line, the notice, then the links to the records.
  assert.match(journeys, /<p class="journey-story-status" role="status">[^<]*<\/p><p class="answer-notice journey-notice">\$\{esc\(storyNotice\(\)\)\}<\/p><div class="journey-source-links">/)
  // Then vs now: the answer, the notice, then "From the record".
  assert.match(tvn, /renderAnswer\(panel\.bodyEl, answerText\)\n[^\n]*\n\s*if \(typeof data\.machine_notice === 'string' && data\.machine_notice\) panel\.bodyEl\.appendChild\(el\('p', 'answer-notice', data\.machine_notice\)\)[\s\S]{0,600}From the record/)
  // Real text in the secondary ink (6.5:1 on paper, 6.9:1 on a raised sheet), not hidden from a screen reader.
  assert.match(css, /\.answer-notice \{ font: var\(--type-fine\); color: var\(--ink-soft\);/)
  assert.ok(!/class="answer-notice[^>]*aria-hidden/.test(html + app + journeys + tvn))
})

test('the app contract names the field', async () => {
  const contract = await read('../../docs/IOS-API-CONTRACT.md')
  assert.ok(contract.includes('`machine_notice`'), 'docs/IOS-API-CONTRACT.md names machine_notice')
  assert.ok(contract.includes(DEFAULT) && contract.includes(TRANSCRIPT))
})
