// The error notice on STORED machine-written text: a record's brief, briefs by resource, a bill's summary in a
// search row. The Worker adds `machine_notice` as these replies leave for a reader, and the web prints one grey
// line directly under the text (or once under a list of briefs), in the words machine-notice.js holds.
// No network, no model: payloads are fixtures with invented names.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import ts from 'typescript'
import { machineNoticeHTML, machineNoticeText, machineLabelHTML } from '../public/labels.js'
import { MACHINE_NOTICE, MACHINE_NOTICE_STORED } from '../public/machine-notice.js'
import { answerBlock } from '../src/seo-content.ts'

const built = await build({ stdin: { contents: "export * from './src/machine-notice'", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const read = path => readFile(new URL(path, import.meta.url), 'utf8')

const ANSWERS = 'Machine-written answers can contain errors. Check the original record before relying on one.'
const DEFAULT = 'Machine-written summaries can contain errors. Check the original record before relying on one.'
const LINE = `<p class="answer-notice">${DEFAULT}</p>`
const RID = 'a'.repeat(32), RID2 = 'b'.repeat(32)
const record = { slug: 'speech-example-1', title: 'Second reading', speaker: 'Alex Example', labels: { kind: 'speech' }, topics: [], metadata: {}, summary: 'Alex Example backs the bill and asks for a review after two years.', text: 'I rise to support the bill.' }
const billRow = { kind: 'bill', title: 'Example Amendment Bill 2026', href: '/bill/example-1', snippet: 'Before the Senate. Treasury. Changes the reporting date.', machine: true }
const speechRow = { kind: 'speech', title: 'Morgan Sample: Budget', slug: 'speech-example-2', resource: RID, snippet: 'The budget papers show the figure.' }
const json = (payload, headers = {}) => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', ...headers } })

test('stored text reads "summaries", an Ask answer reads "answers", and both strings live in the one module', async () => {
  assert.equal(MACHINE_NOTICE, ANSWERS)
  assert.equal(api.MACHINE_NOTICE, ANSWERS)
  assert.equal(MACHINE_NOTICE_STORED, DEFAULT)
  assert.equal(api.MACHINE_NOTICE_STORED, DEFAULT)
  assert.equal(api.MACHINE_NOTICE_TRANSCRIPT, 'Machine-written answers can contain errors. Check the original transcript before relying on it.')
  assert.ok(!/[\u2013\u2014]/.test(DEFAULT))
  // Only the first noun differs between the two.
  assert.equal(DEFAULT.replace('summaries', 'answers'), ANSWERS)
  const module = await read('../public/machine-notice.js')
  assert.equal(module.split('can contain errors').length - 1, 3, 'three wordings, all here')
  // What an Ask surface carries is unchanged: a written answer, a search overview and a journey story say "answers".
  assert.equal(api.withMachineNotice({ answered: true, answer: 'Alex Example said the bill would pass.', machine_written: true, sources: [] }).machine_notice, ANSWERS)
  assert.equal(api.withSummaryNotice({ status: 'ready', points: [{ text: 'A point.', source_ids: ['s1'] }], sources: [] }).machine_notice, ANSWERS)
  assert.equal(api.withStoryNotice({ generated: true, steps: [{ title: 'A step', body: 'A body.', evidence: [] }] }).machine_notice, ANSWERS)
})

test('a response cached with the old wording still prints in the present words at a stored-text site', () => {
  // /api/resource, /api/brief and a bill text version may sit in a browser or edge cache for up to an hour.
  assert.equal(machineNoticeText(ANSWERS), DEFAULT)
  assert.equal(machineNoticeText('  ' + ANSWERS + ' '), DEFAULT)
  assert.equal(machineNoticeHTML({ notice: ANSWERS }), LINE)
  assert.equal(machineNoticeText(DEFAULT), DEFAULT)
  // Any other string the Worker sends is printed as it arrives, the transcript wording included.
  assert.equal(machineNoticeText('Words the Worker sent.'), 'Words the Worker sent.')
  assert.equal(machineNoticeText(api.MACHINE_NOTICE_TRANSCRIPT), api.MACHINE_NOTICE_TRANSCRIPT)
  // The Worker corrects a payload that already carries the old string, as it leaves.
  assert.equal(api.withRecordNotice({ ...record, machine_notice: ANSWERS }).machine_notice, DEFAULT)
  assert.equal(api.withBriefsNotice({ briefs: { [RID]: 'A brief.' }, machine_notice: ANSWERS }).machine_notice, DEFAULT)
})

test('a record with a brief carries the field; a record without one does not', () => {
  const out = api.withRecordNotice(record)
  assert.equal(out.machine_notice, DEFAULT)
  assert.deepEqual({ ...out, machine_notice: undefined }, { ...record, machine_notice: undefined }, 'nothing else changes')
  assert.deepEqual(Object.keys(out).filter(k => !(k in record)), ['machine_notice'], 'additive, at the top level')
  for (const summary of [null, undefined, '', '   ', 12]) {
    const bare = { ...record, summary }
    assert.equal(api.withRecordNotice(bare), bare, JSON.stringify(summary))
    assert.ok(!('machine_notice' in api.withRecordNotice(bare)))
  }
  // A division or a bill's text served by the same route with no brief stays as it was.
  const division = { slug: 'division-federal-senate-1', labels: { kind: 'division' }, summary: null, text: 'Ayes 30, Noes 28.' }
  assert.equal(api.withRecordNotice(division), division)
})

test('briefs carry the field beside the map, never inside it; no briefs, no field', () => {
  const out = api.withBriefsNotice({ briefs: { [RID]: 'Morgan Sample sets out the budget figure.', [RID2]: 'Alex Example replies.' } })
  assert.equal(out.machine_notice, DEFAULT)
  assert.deepEqual(Object.keys(out), ['briefs', 'machine_notice'])
  assert.deepEqual(Object.keys(out.briefs), [RID, RID2], 'every key in the map is still a resource id')
  for (const empty of [{ briefs: {} }, { briefs: { [RID]: '' } }, { briefs: null }, {}]) {
    assert.equal(api.withBriefsNotice(empty), empty)
    assert.ok(!('machine_notice' in api.withBriefsNotice(empty)))
  }
})

test('search results carry the field only when a row holds a bill summary a model wrote', () => {
  const page = { query: 'reporting', results: [speechRow, billRow], count: 2, total: 2 }
  assert.equal(api.withResultsNotice(page).machine_notice, DEFAULT)
  assert.deepEqual(api.withResultsNotice(page).results, page.results, 'rows are not touched')
  for (const results of [[speechRow], [], [{ ...billRow, machine: false }], [{ ...billRow, machine: undefined }], [{ ...billRow, snippet: '' }], undefined]) {
    const none = { query: 'reporting', results }
    assert.equal(api.withResultsNotice(none), none)
  }
})

test('a notice left on a payload no model wrote is taken off, here and on an Ask answer', () => {
  const stale = { ...record, summary: null, machine_notice: DEFAULT }
  assert.ok(!('machine_notice' in api.withRecordNotice(stale)))
  assert.equal(api.withRecordNotice(stale).text, record.text)
  assert.ok(!('machine_notice' in api.withBriefsNotice({ briefs: {}, machine_notice: DEFAULT })))
  // The #470 review's note: a calculated answer that somehow still carried the key loses it.
  const calculated = { answered: true, answer: '12 grants worth $3.4 million.', answer_status: 'calculated', machine_written: false, machine_notice: ANSWERS, sources: [] }
  const cleaned = api.withMachineNotice(calculated)
  assert.ok(!('machine_notice' in cleaned))
  assert.deepEqual(cleaned, { answered: true, answer: calculated.answer, answer_status: 'calculated', machine_written: false, sources: [] })
  // With no key and no notice the payload comes back as the same object, so nothing is re-serialised.
  const plain = { answered: true, answer: 'A table.', answer_status: 'calculated', machine_written: false }
  assert.equal(api.withMachineNotice(plain), plain)
  // A wrong wording is corrected, a right one left alone.
  const written = { answered: true, answer: 'Alex Example said the bill would pass.', machine_written: true, sources: [] }
  assert.equal(api.withMachineNotice({ ...written, machine_notice: 'Old words.' }).machine_notice, ANSWERS)
  const right = { ...written, machine_notice: ANSWERS }
  assert.equal(api.withMachineNotice(right), right)
})

test('only the reader-facing routes that carry stored text are mapped', async () => {
  assert.equal(api.storedNoticeMap('/api/brief'), api.withBriefsNotice)
  assert.equal(api.storedNoticeMap('/api/resource/speech-example-1'), api.withRecordNotice)
  assert.equal(api.storedNoticeMap('/api/search'), api.withResultsNotice)
  assert.equal(api.storedNoticeMap('/api/search-all'), api.withResultsNotice)
  // Not these: suggestions are shown by title only, and the shipped apps' edition decoder rejects any key it does not name.
  assert.equal(api.storedNoticeMap('/bill-texts/example-1/v2.json'), api.withBillTextNotice)
  for (const path of ['/bill-texts/example-1/index.json', '/bill-texts/example-1/v2.txt', '/bill-texts/v2.json', '/api/suggest', '/api/app/v1/edition/latest', '/api/resource/a/b', '/api/resource/', '/api/stats', '/api/followups', '/bills/example-1.json', '/api/report/example']) assert.equal(api.storedNoticeMap(path), null, path)

  const out = await api.storedNoticeResponse(json(record, { 'x-opax-cache': 'HIT' }), '/api/resource/speech-example-1')
  assert.equal(out.headers.get('cache-control'), 'public, max-age=3600')
  assert.equal(out.headers.get('x-opax-cache'), 'HIT')
  assert.deepEqual(await out.json(), { ...record, machine_notice: DEFAULT })
  // A reply with nothing to add, a failure and an unmapped route go out as the same response.
  const bare = json({ ...record, summary: null })
  assert.equal(await api.storedNoticeResponse(bare, '/api/resource/speech-example-1'), bare)
  const failed = new Response(JSON.stringify({ error: 'not found', summary: 'x' }), { status: 404, headers: { 'content-type': 'application/json' } })
  assert.equal(await api.storedNoticeResponse(failed, '/api/resource/speech-example-1'), failed)
  const other = json({ briefs: { [RID]: 'A brief.' } })
  assert.equal(await api.storedNoticeResponse(other, '/api/stats'), other)
  assert.equal((await (await api.storedNoticeResponse(json({ briefs: { [RID]: 'A brief.' } }), '/api/brief')).json()).machine_notice, DEFAULT)
  assert.equal((await (await api.storedNoticeResponse(json({ results: [billRow] }), '/api/search-all')).json()).machine_notice, DEFAULT)
})

test('the Worker adds it at the reader\'s exits only: the MCP tools, voice and Ask research read these routes unchanged', async () => {
  const src = await read('../src/index.ts')
  // The two public exits.
  assert.ok(src.includes('return withSecurityHeaders(await storedNoticeResponse(await display(await route(request, url, env, ctx)), url.pathname), url)'))
  assert.ok(src.includes("withSecurityHeaders(await storedNoticeResponse(await display(await apiUnifiedSearch(request, url, env, ctx, { suggest: url.pathname === '/api/suggest' })), url.pathname), url)"))
  assert.equal(src.split('storedNoticeResponse(').length - 1, 2, 'nowhere else')
  // The readers the MCP tools and voice use call route() and apiUnifiedSearch() with their own local request, with no notice.
  const internal = src.split('\n').filter(line => /display\(await (?:route|apiUnifiedSearch)\(local, target/.test(line))
  assert.equal(internal.length, 4)
  for (const line of internal) assert.ok(!line.includes('storedNoticeResponse'), line)
  // The route handlers and their caches are as they were: the field is not stored.
  assert.match(src, /return await apiResource\(request, url, resourceMatch\[1\], env, ctx\)/)
  assert.match(src, /return await apiBrief\(url, env\)/)
  const brief = src.slice(src.indexOf('async function apiBrief'), src.indexOf('async function apiBrief') + 1600)
  assert.ok(!brief.includes('machine_notice'))
})

test('the line is real text in the class of the Ask line, escaped, with the Worker\'s words when it sent them', () => {
  assert.equal(machineNoticeHTML(), LINE)
  assert.equal(machineNoticeHTML({ notice: 'Words the Worker sent.' }), '<p class="answer-notice">Words the Worker sent.</p>')
  assert.equal(machineNoticeHTML({ notice: '<img src=x onerror=alert(1)> & "more"' }), '<p class="answer-notice">&lt;img src=x onerror=alert(1)&gt; &amp; &quot;more&quot;</p>')
  assert.equal(machineNoticeHTML({ className: 'report-notice' }), `<p class="answer-notice report-notice">${DEFAULT}</p>`)
  for (const none of ['', '  ', null, undefined, 7, {}]) assert.equal(machineNoticeText(none), DEFAULT)
  // Not a control, not hidden, not a live region: a paragraph a screen reader meets in order, with no tap.
  assert.doesNotMatch(LINE, /hidden|aria-live|role=|<details|<button|title=/)
  // The label is unchanged by this.
  assert.match(machineLabelHTML(), /^<details class="ui-pop ui-machine"><summary>.*Machine-written<\/summary>/)
})

test('the wording lives in machine-notice.js alone; the pages reach it through the label module', async () => {
  const files = ['../public/app.js', '../public/labels.js', '../public/timemachine.js', '../public/thenvsnow.js', '../public/money-journeys.js', '../src/hubs.ts', '../src/seo-content.ts', '../src/machine-notice.ts', '../src/index.ts']
  for (const file of files) assert.ok(!(await read(file)).includes('can contain errors'), file)
  assert.match(await read('../public/labels.js'), /import \{ MACHINE_NOTICE, MACHINE_NOTICE_STORED \} from '\.\/machine-notice\.js\?v=[0-9a-f]{10}'/)
  assert.match(await read('../../scripts/stamp_assets.mjs'), /\['labels\.js', 'machine-notice\.js'\]/)
  const css = await read('../public/style.css')
  assert.match(css, /\.answer-notice \{ font: var\(--type-fine\); color: var\(--ink-soft\);/)
})

/** `after` follows `before` in the source with at most `gap` characters between: the text, then the line. */
function follows(source, before, after, gap, message) {
  const at = source.indexOf(before)
  assert.ok(at >= 0, 'missing: ' + before)
  const next = source.indexOf(after, at + before.length)
  assert.ok(next >= 0 && next - (at + before.length) <= gap, message ?? `${after} should follow ${before}`)
}

test('web, one text: the line is directly under a record\'s brief, a bill\'s summary and the year in brief', async () => {
  const app = await read('../public/app.js')
  // Record page: the brief, then the line in the Worker's words, and an old line cleared before the next record.
  follows(app, '$("doc-brief-text").textContent = doc.summary;', '$("doc-brief-text").insertAdjacentHTML("afterend", machineNoticeHTML({ notice: doc.machine_notice }));', 10)
  assert.ok(app.indexOf('$("doc-brief").querySelector(".answer-notice")?.remove();') < app.indexOf('$("doc-brief-text").textContent = doc.summary;'))
  // Bill page, "In short": after the last of the model's text (sentences, changes, who is affected), before the source line.
  follows(app, '<p class="bill-affected">${esc(s.affected)}</p>` : ""}', '${machineNoticeHTML()}', 8)
  follows(app, '<p class="bill-affected">${esc(s.affected)}</p>` : ""}\n    ${machineNoticeHTML()}', '${sourceLineHTML({', 8)
  // Bill peek and the bill panel on a record page.
  assert.ok(app.includes('<div class="bill-sentences">${sentences.map((t) => `<p>${esc(t)}</p>`).join("")}</div>\n    ${machineNoticeHTML()}\n    <p class="fineprint">${esc(billStatusLine(entry))}.</p>'))
  follows(app, '<p class="doc-bill-sentence">${esc(first)}</p>', '${machineNoticeHTML()}', 10)
  // The search page keeps the Worker's words for its results (drawn once at the head of the list: see the rendered test).
  assert.match(app, /machine_notice: typeof data\.machine_notice === "string" \? data\.machine_notice : "",/)
  // Bill text, "In this version": the model's overview, then the line, before the topics and the "AI overview" note.
  const billText = await read('../public/bill-text.js')
  follows(billText, "overview.append(element('h3', 'In this version'), element('p', enrichment.brief));", "if (warning) overview.append(element('p', warning, 'answer-notice'));", 420)
  assert.ok(billText.indexOf("overview.append(element('p', warning, 'answer-notice'))") < billText.indexOf("const topics = element('div', null, 'bill-text-topics')"))
  assert.ok(billText.includes("typeof document.machine_notice === 'string' && document.machine_notice.trim() ? document.machine_notice.trim() : machineNotice"))
  assert.ok(app.includes('machineNotice: uiLabels.machineNoticeText(),'))
  // A topic report: under the opening, above the opening's sources.
  follows(app, 'head.appendChild(lede);', 'head.insertAdjacentHTML("beforeend", machineNoticeHTML({ className: "report-notice" }));', 140)
  follows(app, 'machineNoticeHTML({ className: "report-notice" }));', 'if (sources.length) head.appendChild(reportSourcesFold(sources, "Sources for this opening"));', 10)

  const tm = await read('../public/timemachine.js')
  // Year in brief: after the brief's paragraphs (and its "Read the rest"), before the fine print and the speeches it drew on.
  const body = tm.indexOf('briefEl.appendChild(body)'), line = tm.indexOf("briefEl.insertAdjacentHTML('beforeend', machineNoticeHTML())"), fine = tm.indexOf("const fine = el('p', 'tm-fineprint')", body)
  assert.ok(body > 0 && body < line && line < fine)
})

test('web, a list of briefs: one line directly under the list, only when a row is a brief, in the words /api/brief sent', async () => {
  const app = await read('../public/app.js')
  assert.match(app, /if \(typeof data\.machine_notice === "string" && data\.machine_notice\) briefNotice = data\.machine_notice;/)
  // Party mentions, a person's speeches, the debate arc, similar speeches, the speeches on a bill.
  for (const under of [
    '</ul>${results.some((result) => briefs[result.resource]) ? machineNoticeHTML({ notice: briefNotice }) : ""}`;',
    '</ul>${any ? machineNoticeHTML({ notice: briefNotice }) : ""}',
    '${briefCount ? machineNoticeHTML({ notice: briefNotice }) : ""}<ol class="topic-arc-list">${rowsHTML(items)}</ol>',
    '</ul>${rows.some((row) => briefs[row.resource]) ? machineNoticeHTML({ notice: briefNotice }) : ""}`',
    '<ul class="ui-list bill-speeches" role="list">${rows}</ul>${briefs ? machineNoticeHTML() : ""}',
  ]) assert.equal(app.split(under).length, 2, under)
  // Briefs that arrive after the list is drawn bring the line with them, once.
  assert.ok(app.includes('ensureListNotice(slot.querySelector(".speech-rows"));'))
  // The long lists (the debate arc, search results, the time machine's cards) take the line at their head, where it is seen.
  assert.ok(app.includes("if (results.some((r) => briefs[r.resource])) ensureListNotice(mount.querySelector('.topic-arc-list'), 'beforebegin');"))
  const tm = await read('../public/timemachine.js')
  assert.ok(tm.includes("if (shown && !cardsEl.previousElementSibling?.matches('.tm-cards-notice')) cardsEl.insertAdjacentHTML('beforebegin', machineNoticeHTML({ notice: data?.machine_notice, className: 'tm-cards-notice' }))"))
  // Outside the cards' live region, so never announced as an update, and gone whenever the cards are redrawn.
  assert.ok(!tm.includes("cardsEl.insertAdjacentHTML('beforeend', machineNoticeHTML"))
  assert.equal(tm.split('cardsEl.replaceChildren()').length - 1, 1, 'every redraw goes through clearCards')
  assert.match(tm, /function clearCards\(\) \{\n    if \(cardsEl\.previousElementSibling\?\.matches\('\.tm-cards-notice'\)\) cardsEl\.previousElementSibling\.remove\(\)\n    cardsEl\.replaceChildren\(\)/)
})

test('no server string reaches the page as markup, and the line is never per row in a list of briefs', async () => {
  const app = await read('../public/app.js')
  // Every use goes through the helper, which escapes; machine_notice is never concatenated into HTML on its own.
  for (const line of app.split('\n').filter(l => l.includes('machine_notice') && /innerHTML|insertAdjacentHTML|`</.test(l))) assert.ok(line.includes('machineNoticeHTML({ notice:') || line.includes('renderAnswerNotice('), line.trim().slice(0, 160))
  // The rows of the brief lists hold no notice of their own.
  for (const row of ['"party-mention-brief" : "snippet"', 'class="topic-arc-brief"', 'class="person-speech-text is-brief"', 'class="ui-row-text bill-speech-brief"']) {
    const at = app.indexOf(row)
    assert.ok(at > 0, row)
    assert.ok(!app.slice(at, at + 400).split('</li>')[0].includes('machineNoticeHTML'), row)
  }
})

test('the app contract says will, and lists the stored-text responses', async () => {
  const contract = await read('../../docs/IOS-API-CONTRACT.md')
  assert.ok(contract.includes('The apps will read and print it from version 1.1.6.'))
  assert.ok(!contract.includes('The apps read and print it'))
  assert.match(contract, /#### `machine_notice` on stored machine-written text/)
  for (const route of ['GET `/api/resource/:slug` | `summary`', 'GET `/api/brief` | `briefs`', 'GET `/api/search`, GET `/api/search-all`', '`/api/app/v1/edition/latest` are unchanged']) assert.ok(contract.includes(route), route)
})

test('server-rendered record page: a paragraph that is the stored brief has the line directly under it; any other paragraph has none', async () => {
  const src = await read('../src/index.ts')
  // Both record kinds that take their paragraph from the brief (a release, a speech or committee turn) go through one helper.
  assert.equal(src.split('...briefPrerender(').length - 1, 2)
  assert.ok(src.includes("return typeof summary === 'string' && summary.trim() ? { prerender: answerBlock(heading, description, machineNoticeHTML()) } : {}"))
  // The brief is used in three places: the two page paragraphs above, and the share image's second line (an image, no line).
  assert.equal(src.split('r.summary?.trim() ||').length - 1, 3)
  // What that prints: the heading, the brief, then the line, as real text inside the prerendered section.
  const html = answerBlock('Alex Example, 3 March 2026 · From the record', 'Alex Example backs the bill & asks for a review.', machineNoticeHTML())
  assert.ok(html.includes('<p>Alex Example backs the bill &amp; asks for a review.</p>' + LINE + '</section>'), html)
  assert.ok(!answerBlock('Alex Example', 'Speech by Alex Example: 412 words from the official federal parliamentary record.').includes('answer-notice'))
})

test('a bill text version with a model overview carries the field; one without, and the index, do not', () => {
  const version = { bill_key: 'example-1', version: { id: 'v2' }, complete: true, text: 'Section 1.', sections: [{ id: 's1', title: 'Section 1', text: 'Section 1.' }], enrichment: { brief: 'This version moves the reporting date to 1 July.', topics: ['economy'], evidence: [] } }
  const out = api.withBillTextNotice(version)
  assert.equal(out.machine_notice, DEFAULT)
  assert.deepEqual(out.enrichment, version.enrichment)
  assert.equal(out.text, version.text)
  for (const enrichment of [null, undefined, {}, { brief: '' }, { brief: null, topics: ['economy'] }]) {
    const bare = { ...version, enrichment }
    assert.equal(api.withBillTextNotice(bare), bare)
  }
  const index = { bill_key: 'example-1', versions: [{ id: 'v2' }] }
  assert.equal(api.withBillTextNotice(index), index)
})

/** The page's own renderResults and syncSearchBriefsNotice, run in a real DOM with the real label module's line. */
async function searchPage(mode = 'passages') {
  const source = await read('../public/app.js')
  const ast = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const code = ['renderResults', 'syncSearchBriefsNotice'].map(name => {
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
    assert.ok(fn, name)
    return source.slice(fn.getStart(ast), fn.end)
  }).join('\n')
  const dom = new JSDOM('<section><h2>Results</h2><ul id="search-results"></ul><nav id="search-pager"></nav></section>')
  const document = dom.window.document, esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const ctx = { document, $: id => document.getElementById(id), esc, machineNoticeHTML, machineLabelHTML: () => '<span class="ui-machine">Machine-written</span>',
    lastSearch: { query: '', filters: {}, briefs: {}, machine_notice: '' }, briefNotice: '', searchReadMode: mode,
    recordTypeLink: kind => esc(kind), isMultiSpeaker: () => false, isUnattributed: () => false, isCommitteeChamber: () => false, displayTitle: r => r.title, titleSubject: r => r.title,
    cleanPassage: v => v, highlightHTML: v => esc(v), excerptNoticeHTML: () => '', searchResultHref: r => r.href, speechIdentityHTML: r => esc(r.speaker), partyChipHTML: esc, fmtDate: v => v,
    billNoteHTML: esc, entityHrefAttr: href => `href="${href}"`, subjectHash: () => '/subject', STATE_NAMES: {}, TOPICS: {}, participantLinksHTML: () => '', speakerHref: () => '/subject',
    decorateMetaPortraits: () => {}, requestAnimationFrame: () => {}, refreshSearchPassageFolds: () => {} }
  runInNewContext(code + '\nthis.render = renderResults; this.sync = syncSearchBriefsNotice;', ctx)
  return { ctx, document, list: document.getElementById('search-results') }
}
const bill = n => ({ kind: 'bill', title: `Example Amendment Bill ${n}`, href: `/bill/example-${n}`, snippet: `Before the Senate. Changes reporting date ${n}.`, machine: true })
const person = { kind: 'person', title: 'Alex Example', href: '/subject/person/alex-example', snippet: 'Senator for an invented state.' }

test('rendered search results: one line at the head of the list for any number of bill-summary rows, none inside a row, none without one', async () => {
  const { ctx, document, list } = await searchPage()
  ctx.lastSearch.machine_notice = 'Words the Worker sent with this search.'
  ctx.render([person, bill(1), bill(2), bill(3)])
  const lines = [...document.querySelectorAll('.answer-notice')]
  assert.equal(lines.length, 1, 'once, however many rows carry a summary')
  assert.equal(lines[0].textContent, 'Words the Worker sent with this search.')
  // Placement: the element directly before the list, after the heading; not in a row, not after the list.
  assert.equal(list.previousElementSibling, lines[0])
  assert.equal(lines[0].previousElementSibling.tagName, 'H2')
  assert.equal(list.querySelectorAll('.answer-notice').length, 0)
  assert.equal(list.nextElementSibling.id, 'search-pager')
  assert.equal(list.children.length, 4)
  assert.equal(list.querySelectorAll('.ui-machine').length, 3, 'each summary row keeps its own label')
  // In reading order the line comes before the first machine-written row's text.
  assert.ok(lines[0].compareDocumentPosition(list.children[1]) & 4)
  // Redrawn with the same rows: still one. Redrawn with no machine row, or cleared: none.
  ctx.render([bill(1), person]); assert.equal(document.querySelectorAll('.answer-notice').length, 1)
  ctx.render([person]); assert.equal(document.querySelectorAll('.answer-notice').length, 0)
  ctx.render([bill(1)]); ctx.sync(); assert.equal(document.querySelectorAll('.answer-notice').length, 0)
  // With no string from the Worker the fixed words stand in.
  ctx.lastSearch.machine_notice = ''
  ctx.render([bill(1)]); assert.equal(document.querySelector('.answer-notice').outerHTML, `<p class="answer-notice search-machine-notice">${DEFAULT}</p>`)
})

test('rendered search results, Briefs mode: the same single line when a record row shows its brief; none in Passages mode', async () => {
  const speech = { kind: 'speech', title: 'Morgan Sample — Budget — 2026-03-03', slug: 'speech-example-2', resource: RID, speaker: 'Morgan Sample', date: '2026-03-03', snippet: 'The budget papers show the figure.' }
  const briefs = await searchPage('briefs')
  briefs.ctx.lastSearch.briefs = { [RID]: 'Morgan Sample sets out the budget figure.' }
  briefs.ctx.render([speech, { ...speech, resource: RID2, slug: 'speech-example-3' }])
  assert.equal(briefs.document.querySelectorAll('.answer-notice').length, 1)
  assert.equal(briefs.list.previousElementSibling.className, 'answer-notice search-machine-notice')
  assert.equal(briefs.list.querySelectorAll('.search-result-brief').length, 1)
  assert.equal(briefs.list.querySelectorAll('.answer-notice').length, 0)
  const passages = await searchPage('passages')
  passages.ctx.lastSearch.briefs = { [RID]: 'Morgan Sample sets out the budget figure.' }
  passages.ctx.render([speech])
  assert.equal(passages.document.querySelectorAll('.answer-notice').length, 0, 'the record\'s own text is showing')
})
