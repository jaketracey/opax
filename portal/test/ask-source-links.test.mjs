// Every Ask source row opens a page the Worker serves. The tools build their citation URLs from the published
// data in public/ (the same assets production reads); each URL is then requested from the real Worker, offline,
// and must come back 200 after its redirects, never as the router's "Page not found". No network, no model.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, existsSync, readdirSync} from 'node:fs'
import {build} from 'esbuild'
import {loadWorker, offline} from './worker-harness.mjs'

const root = new URL('../', import.meta.url).pathname, pub = root + 'public'
// Supply the published division table from the same original files as its detail reader.
const tables = {name: 'source-links-table', setup(builder) {
 builder.onResolve({filter: /^\.\.\/table-api$/}, () => ({path: 'source-links-table', namespace: 'fixture'}))
 builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({loader: 'js', contents: `export async function tableApi(req) {
  const q = new URL(req.url).searchParams, words = (q.get('q') || '').toLowerCase().split(/\\s+/).filter(Boolean);
  const rows = globalThis.__sourceLinksDivisions.filter(r => words.every(w => r.title.toLowerCase().includes(w)));
  return Response.json({rows: rows.slice(0, 200), total: rows.length});
 }`}))
}}
const built = await build({stdin: {contents: "export {partyDonations, memberVotes, countSpeeches, speechTrend, findPeople, findQuotes} from './src/agentic-tools';export {factSheet, sourceLinks} from './src/agentic-ask';export {agenticAskPayload} from './src/agentic-response';export {linkAskSources, cleanSnippet, withoutBareUrls} from './src/ask-source-links';export {getTool} from './src/tools/index';export {federalPartyMoneyAnswer, publicPartyMoneyAnswer} from './src/ask-money-routing';", resolveDir: root}, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'], plugins: [tables]})
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const restore = offline()
test.after(restore)
const worker = await loadWorker(root + 'src/index.ts', pub + '/')
const origin = 'https://opax.com.au'
const json = path => existsSync(pub + path) ? JSON.parse(readFileSync(pub + path, 'utf8')) : null

/** Follows same-site redirects; resolves with the last status and page title. */
async function visit(url) {
  let target = new URL(url, origin)
  for (let hop = 0; hop < 4; hop++) {
    const r = await worker.fetch(target.pathname + target.search, {headers: {accept: 'text/html'}})
    const location = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && location) { target = new URL(location, target); if (target.origin !== origin) return {status: 200, title: 'external'}; continue }
    const body = await r.text()
    return {status: r.status, title: /<title>([^<]*)<\/title>/.exec(body)?.[1] ?? '', path: target.pathname + target.search}
  }
  return {status: 310, title: 'too many redirects'}
}
/** A URL is served when the Worker routes it to a real page (status 200). External https pages are not fetched. */
async function unserved(urls) {
  const bad = []
  for (const url of new Set(urls)) {
    const u = new URL(url, origin)
    assert.ok(u.protocol === 'https:', `source URL is not https or site-relative: ${url}`)
    if (u.origin !== origin) continue
    const page = await visit(u.href)
    if (page.status !== 200 || /^Page not found/.test(page.title)) bad.push(`${url} -> ${page.status} ${page.title}`)
  }
  return bad
}

// The published money graph and division exports stand in for production assets; the knowledge box is a stub.
const divisionFiles = readdirSync(pub + '/divisions').filter(f => /^division-federal-representatives-\d+\.json$/.test(f)).slice(0, 40)
const divisions = divisionFiles.map(f => json('/divisions/' + f)).filter(d => d?.members?.length)
globalThis.__sourceLinksDivisions = divisions.map(d => ({key: d.key, title: d.name, date: d.date, house: d.house, jurisdiction: d.jurisdiction}))
const member = divisions[0].members[0].name, memberParty = divisions[0].members[0].party
const asset = async path => json(path)
const kb = async (endpoint, body) => {
  if (endpoint === '/catalog' && JSON.stringify(body).includes('"division"')) return {resources: Object.fromEntries(divisionFiles.map((f, i) => [String(i), {slug: f.replace(/\.json$/, '')}]))}
  if (endpoint === '/catalog') return {fulltext: {total: 40, facets: {'/u/o': {[`/u/o/${member}`]: 30}, '/l/party': {'/l/party/Labor': 30}}}, resources: {}}
  if (endpoint === '/search') return {fulltext: {total: 12}, resources: {}}
  const speech = {slug: 'speech-1509316', title: 'Fixture passage', origin: {collaborators: [member], created: '2020-06-15T00:00:00Z'}, usermetadata: {classifications: [{labelset: 'kind', label: 'speech'}, {labelset: 'state', label: 'federal'}, {labelset: 'chamber', label: 'representatives'}]}, data: {texts: {body: {value: {body: 'A fixture passage about housing supply.'}}}}}
  if (endpoint === '/find') return {resources: {r1: speech}}
  if (endpoint.startsWith('/slug/speech-1509316?')) return speech
  throw Error('unexpected knowledge-box call ' + endpoint)
}
const deps = {asset, kb, origin, toolEnv: {TABLE_DB: {}}}

async function allToolResults() {
  const results = [
    await api.partyDonations(deps, {party: 'Labor'}),
    await api.partyDonations(deps, {party: 'Labor', industry: 'gambling', from_year: 2019}),
    await api.partyDonations(deps, {industry: 'gambling'}),
    await api.partyDonations(deps, {party: 'Labor', since: '1900-01-01', until: '1901-12-31'}),
    await api.memberVotes(deps, {keyword: 'bill', person: member}),
    await api.memberVotes(deps, {keyword: 'bill', party: memberParty}),
    await api.countSpeeches(deps, {topic: 'gambling', state: 'federal', group_by: 'speaker'}),
    await api.countSpeeches(deps, {topic: 'gambling', speaker: member}),
    await api.speechTrend(deps, {topic: 'gambling', by: 'year', since: '2020-01-01', until: '2022-12-31'}),
    await api.findPeople(deps, {name: member}),
    await api.findQuotes(deps, {query: 'housing'}),
  ]
  const contracts = await api.getTool('contracts').handler({asset, origin}, {agency: 'Defence'})
  results.push({tool: 'contracts', ok: !contracts.error, data: contracts, cite: contracts.citations.map(c => ({kind: 'record', label: c.text, url: c.url})), notes: contracts.notes, list: origin + '/money/contracts'})
  return results
}

test('every citation URL the Ask tools build is a page the Worker serves', async () => {
  const results = await allToolResults()
  for (const r of results) assert.ok(r.ok && (r.cite.length || r.data?.coverage_only), `${r.tool} produced citations: ${r.error ?? ''}`)
  const urls = results.flatMap(r => [...r.cite.flatMap(c => [c.url, ...(c.related ?? []).map(x => x.url)]), ...(r.list ? [r.list] : [])])
  // The calculated money answers' rows and links (receipt-ranking-*), from the same graph.
  const assets = {fetch: async request => { const data = json(new URL(request.url).pathname); return data ? Response.json(data) : new Response('', {status: 404}) }}
  for (const question of ['Who has given the most money to Labor since 2019?', 'Who gave the most to the Liberal Party?']) {
    const money = await api.federalPartyMoneyAnswer({question}, assets)
    assert.ok(money, question)
    const payload = api.publicPartyMoneyAnswer(money)
    urls.push(...payload.sources.map(s => s.href), ...[...payload.answer.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]).filter(u => !/\.json$/.test(u)))
  }
  assert.ok(urls.length > 40, `checked ${urls.length} URLs`)
  assert.deepEqual(await unserved(urls), [])
})

test('the check itself fails on a path the router does not serve', async () => {
  assert.deepEqual(await unserved([origin + '/money/party/Labor']), [origin + '/money/party/Labor -> 404 Page not found · OPAX'])
})

test('party receipts cite the receipts map filtered to the party (and industry, and years), never /money/party', async () => {
  const one = await api.partyDonations(deps, {party: 'Labor', industry: 'gambling', from_year: 2019})
  const summary = new URL(one.cite[0].url)
  assert.equal(summary.pathname, '/money')
  assert.deepEqual(Object.fromEntries(summary.searchParams), {jur: 'federal', type: 'receipts', party: 'party:Labor', industry: 'gambling', from: '2019'})
  assert.equal(one.list, one.cite[0].url)
  const all = await allToolResults()
  assert.ok(!all.flatMap(r => r.cite).some(c => /\/money\/party\//.test(c.url)))
})

test('a vote count opens the division list, and every counted division is its own source row', async () => {
  const selected = divisions.filter(d => /bill/i.test(d.name) && d.members.some(m => m.name === member)).slice(0, 3)
  assert.ok(selected.length)
  const votes = await api.memberVotes({...deps, asset: async path => path === '/divisions/index.json' ? {divisions: selected.map(d => ({key: d.key, date: d.date}))} : asset(path)}, {keyword: 'bill', person: member})
  const {facts} = api.factSheet([votes])
  assert.equal(facts.length, 1)
  assert.equal(facts[0].cite.url, `${origin}/divisions/index.json`)
  assert.equal(facts[0].cite.related.length, votes.data.rows.length)
  assert.match(facts[0].cite.related[0].label, /^\d{4}-\d{2}-\d{2}: .+ \((?:voted aye|voted no|paired)\)$/)
  const run = {answered: true, answer: `${facts[0].text} [1].`, period: {label: ''}, facts: facts.map(f => ({id: f.id, text: f.text, url: f.cite.url, kind: f.cite.kind})), notes: [], steps: [], events: [], timings: {total_ms: 0}, tokens: {input: 0, output: 0}, cost_usd: 0}
  const payload = api.linkAskSources(api.agenticAskPayload(run, 'How has this member voted?'), api.sourceLinks([votes]), origin)
  assert.equal(payload.sources[0].url, facts[0].cite.url)
  const rows = payload.sources.slice(1)
  assert.equal(rows.length, facts[0].cite.related.length)
  assert.ok(rows.every(r => /^https:\/\/opax\.com\.au\/doc\/division-/.test(r.url) && r.cited === true && typeof r.snippet === 'string' && r.title))
  assert.equal(new Set(rows.map(r => r.url)).size, rows.length, 'one row per division')
  // Every row keeps the string fields the app decodes.
  for (const s of payload.sources) for (const k of ['resource', 'slug', 'title', 'href', 'url', 'snippet', 'kind']) assert.equal(typeof s[k], 'string', k)
})

test('a coverage row opens the whole selection, not the first record it borrowed a URL from', () => {
  const division = origin + '/doc/division-federal-representatives-311'
  const payload = {answer: 'x', citations: {}, sources: [
    {resource: 'fact-2', slug: '', title: 'Divisions with "climate" in the title', href: division, url: division, snippet: 'A count', cited: true, kind: 'record'},
    {resource: 'coverage', slug: '', title: 'Coverage of the selected records', href: division, url: division, snippet: 'Divisions are matched by a word…', cited: true, kind: 'record'},
  ], research: {sources: [{title: 'Coverage of the selected records', url: division}]}}
  const list = origin + '/search?kind=division&q=climate&mode=keyword'
  const linked = api.linkAskSources(payload, {lists: [list], related: {}}, origin)
  assert.equal(linked.sources[1].url, list); assert.equal(linked.sources[1].href, list)
  assert.equal(linked.research.sources[0].url, list)
  // With no list, a borrowed record URL gives way to the methods page.
  assert.equal(api.linkAskSources(payload, {lists: [], related: {}}, origin).sources[1].url, origin + '/methods')
})

test('source rows do not repeat the answer: no bare URLs in titles, no duplicated or internal checking lines', () => {
  const title = 'Example Donor Pty Ltd to Labor — AEC annual return · 2003-04 · https://transparency.aec.gov.au/'
  const line = 'Labor disclosed $2,000 in receipts from Example Donor Pty Ltd (federal disclosures; financial years 1998-99 to 2025-26) — AEC annual return · 2003-04 · https://transparency.aec.gov.au/'
  const snippet = `${line}\nDonor: Example Donor Pty Ltd — $2,000. Financial years: 1998-99 to 2025-26.\n${line}`
  const [row] = api.linkAskSources({sources: [{resource: 'fact-1', slug: '', title, href: origin + '/subject/donor/Example', url: origin + '/subject/donor/Example', snippet, cited: true, kind: 'export'}]}, undefined, origin).sources
  assert.equal(row.title, 'Example Donor Pty Ltd to Labor — AEC annual return · 2003-04')
  assert.equal(row.snippet, 'Labor disclosed $2,000 in receipts from Example Donor Pty Ltd (federal disclosures; financial years 1998-99 to 2025-26) — AEC annual return · 2003-04')
  assert.doesNotMatch(JSON.stringify(row), /https:\/\/transparency|Donor: /)
})

// --- the web client: rows saved before this change, and the calculated answer's next step -------------------
import {runInNewContext} from 'node:vm'
const app = readFileSync(root + 'public/app.js', 'utf8')
const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)))
const client = {URL, URLSearchParams, encodeURIComponent, decodeURIComponent, document: {createElement: tag => ({tag, children: [], appendChild(n) { this.children.push(n) }, setAttribute(k, v) { this[k] = v }})}, askHash: q => '/ask?q=' + encodeURIComponent(q)}
runInNewContext([slice('function safeAnswerLink', '\n/** Render links'), slice('function moneyNextSteps', '\nfunction followupPassages'), slice('function sourceText', '\nfunction sourceItem')].join('\n'), client)

test('a calculated answer\'s next step names the donor, not the markdown link in its table cell', () => {
  const answer = '**Example Holdings Pty Ltd: $9,000**.\n\n| Source | Disclosed receipts | Records |\n| --- | ---: | ---: |\n| [Example Holdings Pty Ltd](/subject/donor/Example%20Holdings%20Pty%20Ltd) | $9,000 | 2 |\n\n[Explore these records](https://opax.com.au/money?jur=federal&type=receipts&party=party%3ALabor&from=2019)'
  assert.equal(client.moneyNextSteps(answer).donor, 'Example Holdings Pty Ltd')
  const nav = client.document.createElement('div'); client.renderMoneyNextSteps(nav, answer)
  const ask = nav.children[0].children.at(-1)
  assert.equal(ask.textContent, 'Ask what parliament said about Example Holdings Pty Ltd')
  assert.doesNotMatch(ask.textContent + decodeURIComponent(ask.href), /\]\(|\[/)
})

test('rows from answers saved before the change render without the copy of the answer or the dead party link', () => {
  const line = 'Labor disclosed $2,000 in receipts from Example Donor (federal disclosures) — AEC annual return · 2003-04 · https://transparency.aec.gov.au/'
  const row = client.tidySource({resource: 'fact-1', title: 'Example Donor to Labor — AEC annual return · 2003-04 · https://transparency.aec.gov.au/', href: 'https://opax.com.au/subject/donor/Example', snippet: `${line}\nDonor: Example Donor — $2,000. Financial years: 1998-99 to 2025-26.\n${line}`})
  assert.equal(row.title, 'Example Donor to Labor — AEC annual return · 2003-04')
  assert.equal(row.snippet, 'Labor disclosed $2,000 in receipts from Example Donor (federal disclosures) — AEC annual return · 2003-04')
  const coverage = client.tidySource({resource: 'coverage', title: 'Coverage of the selected records', href: 'https://opax.com.au/money/party/Labor', url: 'https://opax.com.au/money/party/Labor', snippet: 'Notes.'})
  assert.equal(coverage.href, '/money?jur=federal&type=receipts&party=party%3ALabor')
  // A quote that only repeats the title is dropped (contract rows used to show their sentence twice).
  assert.equal(client.tidySource({title: 'A: $5 contract "B" (CN1)', snippet: 'A: $5 contract "B" (CN1)'}).snippet, '')
})

// --- the vote split ---------------------------------------------------------------------------------------
test('a written vote answer keeps the aye and no split however the writer words it', async () => {
  const writing = await build({stdin: {contents: "export * from './src/research-writing';export * from './src/research-writer';export {factSheet} from './src/agentic-ask';", resolveDir: root}, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*']})
  const w = await import('data:text/javascript;base64,' + Buffer.from(writing.outputFiles[0].text).toString('base64'))
  const {MockLanguageModelV4} = await import('ai/test')
  const question = 'How has Robin Example voted on climate change?'
  const result = {tool: 'member_votes', ok: true, data: {person: 'Robin Example', keyword: 'climate', summary: {divisions: 13, aye: 6, no: 7}, rows: []}, cite: [{kind: 'record', label: 'd', url: origin + '/doc/division-x'}], list: origin + '/search?kind=division&q=climate&mode=keyword',
    notes: ['Divisions are matched by a word in the division or bill title, so related divisions under other titles are missed.', 'A recorded vote is not a statement of reasons; read the speeches for those.']}
  const {facts} = w.factSheet([result])
  const sources = [...facts.map(f => ({resource: 'fact-' + f.id, slug: '', title: f.cite.label, href: f.cite.url, url: f.cite.url, snippet: f.text, cited: true, kind: f.cite.kind})), {resource: 'coverage', slug: '', title: 'Coverage of the selected records', href: result.list, url: result.list, snippet: result.notes.join(' '), cited: true, kind: 'record'}]
  const answer = sources.map(s => s.snippet).join('\n'); let at = 0; const citations = {}
  for (const s of sources) { citations[s.resource + '/t/body/0'] = [[at, at + Array.from(s.snippet).length]]; at += Array.from(s.snippet).length + 1 }
  const input = {question, period: {kind: 'all', label: ''}, constraints: {}, facts: w.writingFacts({answer, citations, sources})}
  // The 1 Nov production answer worded the split in a way the figure checks dropped, and kept the rest.
  for (const lead of ['Robin Example voted in 13 divisions with "climate" in the title. He voted aye 6 times and no 7 times.', 'Robin Example voted in 13 divisions with "climate" in the title, 6 aye and 7 no.', 'Robin Example voted in 13 divisions with "climate" in the title: aye 6, no 7.']) {
    const reply = {answer_decision: 'answer', sentences: [{text: lead, facts: [1]}, {text: 'Divisions are matched by a word in the division or bill title, so related divisions under other titles are missed, and a recorded vote is not a statement of reasons; the speeches hold those.', facts: [2], coverage: true}]}
    const model = new MockLanguageModelV4({doGenerate: () => ({content: [{type: 'text', text: JSON.stringify(reply)}], finishReason: {unified: 'stop', raw: 'stop'}, usage: {inputTokens: {total: 10}, outputTokens: {total: 10}}, warnings: []})})
    const write = w.createAnswerWriter({model, modelBudgetSpent: async () => false, dailyBudget: {reserve: async () => ({settle: async () => {}})}})
    const out = await write(input, {rounds: 1, tokens: {input: 0, output: 0}}, undefined, 8000)
    assert.match(out.answer, /aye (?:in )?6\b|\b6 aye\b/, lead); assert.match(out.answer, /no (?:in )?7\b|\b7 no\b/, lead)
    assert.doesNotMatch(out.answer, /Divisions are matched|statement of reasons/, 'coverage stays outside the answer: ' + lead)
    assert.match(out.coverage?.note ?? '', /matched by (?:a word|words).*title/, 'the aggregate retains its title-search coverage note: ' + lead)
  }
})
