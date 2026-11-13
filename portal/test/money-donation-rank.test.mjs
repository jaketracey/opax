// "Who gives / donates" ranks donations, not loan drawdowns or public funding (BACKLOG A34 and A35).
// Every name here is invented: a bank, a union, a company, an untyped source and a public-funding
// payer whose spelling no name rule knows, all giving to an invented party.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {PUBLIC_FUNDING_ONLY, DONOR_DECLARED_ONLY, hasPartyReceipts, notListedLine, otherReceiptsLine, publicFundingOnly, receiptFigures, receiptGraph, receiptSplit} from '../public/donor-disclosure.js'

const root = new URL('../', import.meta.url).pathname
const built = await build({
  stdin: {contents: "export {factSheet, periodPlan} from './src/agentic-ask'; export {partyDonations, TOOL_SPECS} from './src/agentic-tools'; export {callTool} from './src/tools/index'; export {writingFacts, proseFallback} from './src/research-writing'; export {receiptMeasureIntent} from './src/ask-money-family'; export {receiptAnswer, lendingQuestion, voiceReceiptData} from './src/voice-money'; export {LENDING_NOTE, declaredDebtsLine} from './src/tools/declared-debts'; export {extractAskConstraints, constrainStep} from './src/ask-constraints'; export {donorRanking} from './src/research-coherence.mjs';", resolveDir: root},
  bundle: true, write: false, platform: 'node', format: 'esm', external: ['node:*'],
})
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
// The writer pulls in the AI SDK, which bundles for the browser platform, as in ask-answers.test.mjs.
const writerBuilt = await build({stdin: {contents: "export {createAnswerWriter} from './src/research-writer'", resolveDir: root}, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*']})
const {createAnswerWriter} = await import('data:text/javascript;base64,' + Buffer.from(writerBuilt.outputFiles[0].text).toString('base64'))
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('Money tests must never call a public service.') }
test.after(() => { globalThis.fetch = savedFetch })

const BANK = 'donor:invented bank', UNION = 'donor:invented union', COMPANY = 'donor:invented company', UNTYPED = 'donor:untyped example', FUND = 'donor:zed funding body'
const cells = {
  [BANK]: {'2019-20': {other_receipt: [300000, 2]}, '2020-21': {donation_received: [1000, 1], other_receipt: [200000, 1]}},
  [UNION]: {'2020-21': {donation_received: [50000, 1], subscription: [80000, 4]}},
  [COMPANY]: {'2019-20': {donation_received: [60000, 2]}},
  [UNTYPED]: {'2019-20': {unspecified: [7000, 1], unknown: [3000, 1]}},
  [FUND]: {'2020-21': {public_funding: [900000, 1]}},
}
const byType = years => {
  const out = {}
  for (const types of Object.values(years)) for (const [type, [d]] of Object.entries(types)) out[type] = (out[type] || 0) + d
  return out
}
const legacy = years => {
  const byYear = {}
  let total = 0, count = 0
  for (const [fy, types] of Object.entries(years)) for (const [d, n] of Object.values(types)) {
    const y = Number(fy.slice(0, 4)), c = byYear[y] ||= [0, 0]
    c[0] += d; c[1] += n; total += d; count += n
  }
  return {total, count, byYear, firstYear: 2019, lastYear: 2020}
}
const donor = (id, label, industry) => ({id, label, kind: 'donor', industry, ...legacy(cells[id]), by_type: byType(cells[id]), by_type_year: cells[id]})
const GRAPH = {
  meta: {generated: '2026-11-13', coverage: 'Invented', receipt_types: {schema: 1, available: true, donation_type: 'donation_received'}},
  nodes: [
    {id: 'party:Example', label: 'Example', kind: 'party', total: 2000000, count: 20, byYear: {2019: [1000000, 10], 2020: [1000000, 10]}},
    donor(BANK, 'Invented Bank Ltd', 'finance'), donor(UNION, 'Invented Workers Union', 'unions'), donor(COMPANY, 'Invented Company Pty Ltd', 'property'),
    donor(UNTYPED, 'Untyped Example Ltd', 'other'), donor(FUND, 'Zed Funding Body', 'individual'),
  ],
  edges: Object.keys(cells).map(source => ({source, target: 'party:Example', ...legacy(cells[source]), by_type: byType(cells[source]), by_type_year: cells[source]})),
}
const deps = {kb: async () => { throw Error('no retrieval') }, asset: async path => path === '/graph/money.json' ? structuredClone(GRAPH) : null, origin: 'https://opax.test'}
const env = {origin: 'https://opax.test', asset: deps.asset}
const LOAN = /\bloans?\b|\blent\b/i

test('typed cells carry their AEC receipt type; no total moves, and Public Funding counts in no donor figure', async () => {
  const read = receiptGraph(GRAPH)
  for (const e of GRAPH.edges.filter(e => e.source !== FUND)) {
    const r = read.edges.find(x => x.source === e.source)
    assert.equal(r.total, Object.values(e.by_type).reduce((a, b) => a + b, 0), `${e.source}: every type but Public Funding, as published`)
    assert.equal(r.count, Object.values(e.by_type_year).flatMap(Object.values).reduce((a, [, n]) => a + n, 0))
    assert.deepEqual(Object.keys(r.typeCells).sort(), Object.keys(e.by_type_year).map(fy => fy.slice(0, 4)).sort(), 'each year keeps its typed cell')
  }
  assert.deepEqual(read.edges.find(e => e.source === UNION).typeCells, {2020: {donation_received: [50000, 1], subscription: [80000, 4]}})
  assert.deepEqual(read.edges.find(e => e.source === UNION).typeCounts, {donation_received: 1, subscription: 4})
  // The public-funding payer is spelled like no rule knows; its receipt type alone keeps it off every donor list.
  assert.ok(!read.edges.some(e => e.source === FUND), 'no donor flow for Public Funding')
  const fund = GRAPH.edges.find(e => e.source === FUND)
  assert.deepEqual([receiptFigures(fund).total, receiptFigures(fund).publicFunding], [0, [900000, 1]])
  assert.equal(publicFundingOnly(fund), true)
  assert.equal(hasPartyReceipts(fund), false)
  assert.equal(notListedLine(GRAPH.nodes.find(n => n.id === FUND)), PUBLIC_FUNDING_ONLY)
  assert.equal(notListedLine({by_type: {}, by_type_year: {}}), DONOR_DECLARED_ONLY, 'a donor-declared flow keeps its own line')
  // The released graph: every typed flow without Public Funding reads exactly as row 99's rule read it.
  const published = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'))
  const released = receiptGraph(published)
  let checked = 0
  for (const e of published.edges) {
    if (e.grant || e.flow || !e.by_type || e.by_type.public_funding || !hasPartyReceipts(e)) continue
    const r = released.edges.find(x => x.source === e.source && x.target === e.target && !x.grant && !x.flow)
    const count = Object.values(e.by_type_year).flatMap(Object.values).reduce((a, [, n]) => a + n, 0)
    assert.deepEqual([r.total, r.count], [Object.values(e.by_type).reduce((a, b) => a + b, 0), count], `${e.source} -> ${e.target}`)
    checked++
  }
  assert.ok(checked > 700, `${checked} released flows checked`)
})

test('receiptSplit splits a window by type, and the other-receipts line never calls a receipt a donation or a loan', () => {
  const bank = GRAPH.edges.find(e => e.source === BANK)
  assert.deepEqual(receiptSplit(bank), {donations: [1000, 1], other: [500000, 3], subscriptions: [0, 0], untyped: [0, 0], all: [501000, 4], publicFunding: [0, 0], otherYears: [2019, 2020]})
  assert.deepEqual(receiptSplit(bank, 2019, 2019).donations, [0, 0])
  assert.deepEqual(receiptSplit(bank, 2019, 2019).other, [300000, 2])
  assert.equal(receiptSplit({total: 5, count: 1, byYear: {2020: [5, 1]}}), null, 'a record without types has no split')
  const line = otherReceiptsLine('Invented Bank Ltd', 'Example', receiptSplit(bank), {also: true, period: 'financial years 2019-20 to 2020-21'})
  assert.equal(line, "Invented Bank Ltd also recorded $500,000 in other receipts (amounts other than donations or subscriptions) to Example in financial years 2019-20 to 2020-21.")
  assert.doesNotMatch(line, LOAN)
  assert.equal(otherReceiptsLine('Invented Workers Union', 'Example', receiptSplit(GRAPH.edges.find(e => e.source === UNION))),
    "Invented Workers Union recorded $80,000 in subscriptions to Example, which the AEC doesn't class as donations.")
  assert.equal(otherReceiptsLine('Invented Company Pty Ltd', 'Example', receiptSplit(GRAPH.edges.find(e => e.source === COMPANY))), '', 'nothing but donations: no line')
})

test('party_receipts: "gives" ranks Donation Received only, with labelled lines; "money from" ranks every type with its breakdown', async () => {
  const given = await api.partyDonations(deps, {party: 'Example', measure: 'donations'})
  assert.equal(given.data.measure, 'donations')
  assert.deepEqual(given.data.rows.map(r => [r.donor, r.total_aud, r.receipts]), [['Invented Company Pty Ltd', 60000, 2], ['Invented Workers Union', 50000, 1], ['Invented Bank Ltd', 1000, 1]])
  assert.deepEqual(given.data.other_receipts.map(r => [r.donor, r.other_receipts_aud, r.subscriptions_aud, r.untyped_aud, r.in_ranking]),
    [['Invented Bank Ltd', 500000, 0, 0, true], ['Invented Workers Union', 0, 80000, 0, true], ['Untyped Example Ltd', 0, 0, 10000, false]])
  assert.equal(given.data.other_receipts[2].line, "Untyped Example Ltd recorded $10,000 in receipts the return gave no type for to Example in financial year 2019-20, which the AEC doesn't class as donations.")
  assert.deepEqual(given.data.public_funding, [{source: 'Zed Funding Body', amount_aud: 900000, receipts: 1, period: '2020-21'}])
  assert.ok(!given.data.rows.some(r => r.donor === 'Zed Funding Body'))
  for (const c of given.cite) assert.doesNotMatch(c.label, LOAN, c.label)
  assert.ok(given.cite.some(c => c.label === "Example's returns also list $900,000 in public funding from Zed Funding Body in 2020-21. Public funding is election funding, not a donation, so it is not ranked as a donor."))
  // Unset: a donor breakdown ranks donations.
  assert.deepEqual((await api.partyDonations(deps, {party: 'Example'})).data.rows, given.data.rows)
  const all = await api.partyDonations(deps, {party: 'Example', measure: 'all_types'})
  assert.deepEqual(all.data.rows.map(r => [r.donor, r.total_aud]), [['Invented Bank Ltd', 501000], ['Invented Workers Union', 130000], ['Invented Company Pty Ltd', 60000], ['Untyped Example Ltd', 10000]])
  assert.deepEqual(all.data.rows[0].by_type, {donations_aud: 1000, other_receipts_aud: 500000, subscriptions_aud: 0, untyped_aud: 0})
  assert.equal(all.data.other_receipts, undefined)
  assert.ok(!all.data.rows.some(r => r.donor === 'Zed Funding Body'), 'public funding is no donor under either measure')
  // A year window: the bank's 2019-20 receipts are all Other Receipt.
  const window = await api.partyDonations(deps, {party: 'Example', measure: 'donations', from_year: 2019, to_year: 2019})
  assert.deepEqual(window.data.rows.map(r => r.donor), ['Invented Company Pty Ltd'])
  assert.match(window.data.other_receipts[0].line, /^Invented Bank Ltd recorded \$300,000 in other receipts \(amounts other than donations or subscriptions\) to Example in financial year 2019-20\.$/)
  // An industry: the union's subscriptions are not donations.
  assert.deepEqual((await api.partyDonations(deps, {industry: 'unions', measure: 'donations'})).data.rows, [{party: 'Example', total_aud: 50000, receipts: 1}])
  assert.deepEqual((await api.partyDonations(deps, {industry: 'unions', measure: 'all_types'})).data.rows, [{party: 'Example', total_aud: 130000, receipts: 5}])
})

test('the answer leads with the largest donation and gives other receipts and public funding after it, in their own words', async () => {
  const period = {kind: 'all', label: ''}
  // The writer ranks only for a party its scope rules know, so the same invented sources and figures
  // are also filed under a known party label; the invented party itself gets a plain list.
  const relabel = label => JSON.parse(JSON.stringify(GRAPH).replaceAll('party:Example', `party:${label}`).replaceAll('"label":"Example"', `"label":"${label}"`))
  const answer = async (question, args, graph = GRAPH) => {
    const result = await api.partyDonations({...deps, asset: async path => path === '/graph/money.json' ? structuredClone(graph) : null}, args)
    const facts = api.factSheet([result]).facts
    const input = {question, period, facts: api.writingFacts(undefined, facts)}
    return {facts, input, out: api.proseFallback(input)}
  }
  const greens = relabel('Greens')
  const {facts, input, out} = await answer('Who gives the most to the Greens?', {party: 'Greens', measure: 'donations'}, greens)
  assert.equal(facts.filter(f => f.receipt?.aside).length, 4, 'three other-receipt lines and one public-funding line')
  assert.deepEqual(api.donorRanking(input.question, input.facts.map(f => f.source)).map(r => r.name), ['Invented Company Pty Ltd', 'Invented Workers Union', 'Invented Bank Ltd'], 'asides never rank')
  const lines = out.answer.split('\n').filter(Boolean)
  assert.match(lines[0], /^Invented Company Pty Ltd gave the most in donations to Greens: \$60,000 /)
  assert.ok(lines.includes("Invented Bank Ltd also recorded $500,000 in other receipts (amounts other than donations or subscriptions) to Greens in financial years 2019-20 to 2020-21."), out.answer)
  assert.ok(lines.some(l => l.startsWith("Greens' returns also list $900,000 in public funding from Zed Funding Body")), out.answer)
  assert.ok(lines.findIndex(l => /also recorded/.test(l)) > lines.findIndex(l => /Invented Bank Ltd gave donations/.test(l)), 'the lines come after the ranking')
  for (const answerText of [out.answer, (await answer('Who gives the most to Example?', {party: 'Example', measure: 'donations'})).out.answer]) {
    assert.doesNotMatch(answerText, /Invented Bank Ltd gave the most|Zed Funding Body gave|Invented Bank Ltd (?:donated|is a donor)/)
    assert.doesNotMatch(answerText, /\bloans?\b|\blent\b/i, 'no line mentions loans')
    assert.match(answerText, /Invented Bank Ltd (?:also )?recorded \$500,000 in other receipts/)
  }
  // How much did a source give, when it gave no donations in the window: say so, then what it gave.
  const named = await answer('How much did Invented Bank Ltd give to the Greens in 2019-20?', {party: 'Greens', measure: 'donations', from_year: 2019, to_year: 2019}, greens)
  assert.match(named.out.answer, /^Greens' returns list no donations from Invented Bank Ltd in financial year 2019-20\.\n/, named.out.answer)
  assert.match(named.out.answer, /Invented Bank Ltd recorded \$300,000 in other receipts \(amounts other than donations or subscriptions\) to Greens in financial year 2019-20/)
  // A donation the named source did give: the donation, then its other receipts.
  const both = await answer('How much did Invented Workers Union give to the Greens?', {party: 'Greens', measure: 'donations'}, greens)
  assert.match(both.out.answer, /^Invented Workers Union gave \$50,000 in donations to Greens /, both.out.answer)
  assert.match(both.out.answer, /Invented Workers Union also recorded \$80,000 in subscriptions to Greens/)
})

test('money_totals: donations for who gives, every type for money from, and a labelled line when a source gave no donations', async () => {
  const call = args => api.callTool(env, 'money_totals', args)
  const none = await call({donor: 'Invented Bank Ltd', party: 'Example', financial_year: '2019-20', measure: 'donations'})
  assert.equal(none.coverage_only, undefined, 'an answer: no donations, and what the returns do list')
  assert.deepEqual(none.rows, [])
  assert.equal(none.citations[0].text, "Example's returns list no donations from Invented Bank Ltd in financial year 2019-20.")
  assert.match(none.citations[1].text, /^Invented Bank Ltd recorded \$300,000 in other receipts \(amounts other than donations or subscriptions\) to Example in financial year 2019-20\.$/)
  const all = await call({donor: 'Invented Bank Ltd', party: 'Example', financial_year: '2019-20'})
  assert.deepEqual([all.rows[0].total_aud, all.rows[0].receipts, all.measure], [300000, 2, 'all_types'], 'without a cue, every receipt type')
  assert.match(all.citations[0].text, /in federal disclosed receipts to Example across 2 receipts/)
  const ranked = await call({party: 'Example', group_by: 'donor', measure: 'donations', limit: 5})
  assert.deepEqual(ranked.rows.map(r => [r.donor, r.total_aud]), [['Invented Company Pty Ltd', 60000], ['Invented Workers Union', 50000], ['Invented Bank Ltd', 1000]])
  assert.match(ranked.citations[0].text, /^Invented Company Pty Ltd: \$60,000 in federal disclosed donations to Example across 2 donations /)
  assert.ok(ranked.other_receipts.some(r => r.donor === 'Invented Bank Ltd' && r.other_receipts_aud === 500000))
  assert.ok(!ranked.rows.some(r => r.donor === 'Zed Funding Body') && !ranked.other_receipts.some(r => r.donor === 'Zed Funding Body'))
  const industry = await call({party: 'Example', group_by: 'industry', measure: 'donations'})
  assert.deepEqual(industry.rows.map(r => [r.industry, r.total_aud]), [['property', 60000], ['unions', 50000], ['finance', 1000]])
})

test('the question decides the measure: gives, donates and donors rank donations; money from, receipts and paid keep every type', () => {
  const cases = {
    'Who gives the most money to Example?': 'donations', 'Who donates the most to the Nationals?': 'donations', 'Top donors to the Liberal Party': 'donations',
    'Who is the biggest donor to Labor?': 'donations', 'who else gave to them?': 'donations', 'How much did Westpac give to One Nation?': 'donations',
    'Who funds the Greens?': 'donations', 'Who gave the most money to Labor from 2019 to 2021?': 'donations', 'What donations did Labor receive from unions?': 'donations',
    'Who has the most disclosed receipts to Labor?': 'donations',
    'Where does Labor get its money from?': 'all_types', 'How much money did Labor receive from Westpac?': 'all_types', 'What receipts did Westpac give the Liberals?': 'all_types',
    'Who paid the Nationals the most?': 'all_types', 'Show me loans to One Nation': 'all_types', 'Who did Labor take the most money from?': 'all_types',
    'How much funding did Labor get from Westpac?': 'all_types', 'How much public funding did the Greens get?': 'all_types',
    'What did Labor say about housing?': null, 'Top sources for Labor': null,
  }
  for (const [question, measure] of Object.entries(cases)) assert.equal(api.receiptMeasureIntent(question), measure, question)
})

test('Ask constraints set the measure from the question, whatever the planner chose', () => {
  const period = {kind: 'all', label: ''}, named = {people: [], parties: []}
  const props = name => api.TOOL_SPECS.find(t => t.name === name).input.properties
  for (const tool of ['party_receipts', 'money_totals']) {
    assert.ok(props(tool).measure, `${tool} takes a measure`)
    const gives = api.extractAskConstraints('Who gives the most to Example?', period, named)
    assert.equal(api.constrainStep({tool, args: {party: 'Example', measure: 'all_types'}}, gives, props(tool)).args.measure, 'donations', tool)
    const from = api.extractAskConstraints('Where does Example get its money from?', period, named)
    assert.equal(api.constrainStep({tool, args: {party: 'Example', measure: 'donations'}}, from, props(tool)).args.measure, 'all_types', tool)
    const silent = api.extractAskConstraints('Top sources for Example', period, named)
    assert.equal(api.constrainStep({tool, args: {party: 'Example', measure: 'all_types'}}, silent, props(tool)).args.measure, 'all_types', `${tool}: no cue keeps the planner's choice`)
  }
  const gives = api.extractAskConstraints('Who gives the most to Example?', period, named)
  assert.equal(api.periodPlan({shape: 'money', steps: [{tool: 'party_receipts', args: {party: 'Example'}}]}, period, {}, gives).steps[0].args.measure, 'donations', 'the planner path too')
})

test('a graph without receipt types never calls a figure donations', async () => {
  const untyped = {meta: {generated: '2026-11-13'}, nodes: [{id: 'party:Example', label: 'Example', kind: 'party', total: 900, count: 3, byYear: {2020: [900, 3]}},
    {id: BANK, label: 'Invented Bank Ltd', kind: 'donor', industry: 'finance', total: 900, count: 3, byYear: {2020: [900, 3]}}],
    edges: [{source: BANK, target: 'party:Example', total: 900, count: 3, byYear: {2020: [900, 3]}}]}
  const asset = async path => path === '/graph/money.json' ? structuredClone(untyped) : null
  const out = await api.partyDonations({...deps, asset}, {party: 'Example', measure: 'donations'})
  assert.equal(out.data.measure, undefined)
  assert.deepEqual(out.data.rows.map(r => [r.donor, r.total_aud]), [['Invented Bank Ltd', 900]])
  assert.match(api.factSheet([out]).facts[0].text, /^Example disclosed \$900 in receipts from Invented Bank Ltd/)
  const totals = await api.callTool({origin: 'https://opax.test', asset}, 'money_totals', {party: 'Example', group_by: 'donor', measure: 'donations'})
  assert.equal(totals.measure, 'all_types')
  assert.match(totals.citations[0].text, /in federal disclosed receipts/)
})

test('the deterministic money route counts no Public Funding: the Greens total is the map\'s, and NSW Efa never ranks', async () => {
  const published = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'))
  const mapTotal = receiptGraph(published).edges.filter(e => e.target === 'party:Greens' && !e.grant && !e.flow).reduce((a, e) => a + e.total, 0)
  assert.equal(mapTotal, 13155663, 'the map leaves NSW Efa\'s $1,069,773 out of $14,225,436')
  const all = api.receiptAnswer(published, 'How much money did the Greens receive?', 'federal', 'https://opax.test', {measure: 'receipts_all'})
  assert.equal(all.all_types_aud, mapTotal)
  assert.doesNotMatch(all.answer, /14,225,436/)
  for (const measure of ['receipts_all', 'donations']) {
    const ranked = api.receiptAnswer(published, 'Who gave the most money to the Greens in 2010-11?', 'federal', 'https://opax.test', {measure})
    assert.ok(!JSON.stringify(ranked.by_donor ?? []).includes('NSW Efa'), `${measure}: NSW Efa is never a ranked source`)
    assert.doesNotMatch(ranked.answer, /NSW Efa|1,069,773/)
  }
})

// Lending (A34 review P3): the AEC types no receipt as a loan, so no receipt is said to be lent. What the
// returns do declare is the party's debts at 30 June, listed apart and never matched to a receipt.
const EXTRAS = {meta: {latest_year: '2024-25'}, parties: {Greens: {debts: {year: '2024-25', total: 628768, lenders: 9, top: [
  {name: 'Zed Studios', amount: 159225, type: 'Non-financial'}, {name: 'Invented Bank Ltd', amount: 100000, type: 'Financial'},
  {name: 'A Member', amount: 93652, type: 'Non-financial'}, {name: 'Fourth Creditor', amount: 1000, type: 'Non-financial'}]}}}}
const greensGraph = () => JSON.parse(JSON.stringify(GRAPH).replaceAll('party:Example', 'party:Greens').replaceAll('"label":"Example"', '"label":"Greens"'))
const lendingAsset = async path => path === '/graph/money.json' ? greensGraph() : path === '/graph/aec-extras.json' ? structuredClone(EXTRAS) : null
const DEBTS = "Greens' returns for 2024-25 declare $628,768 in debts owed at 30 June 2025; the largest creditors listed are Zed Studios ($159,225), Invented Bank Ltd ($100,000, a financial institution) and A Member ($93,652)."

test('a lending question is flagged, and both money tools add the note and the declared debts, never a lent receipt', async () => {
  const period = {kind: 'all', label: ''}, named = {people: [], parties: []}
  for (const q of ['Who lent money to the Greens?', 'Which banks loaned the Greens money?', 'Who does One Nation owe money to?']) {
    const c = api.extractAskConstraints(q, period, named)
    assert.equal(c.lending, true, q)
    for (const tool of ['party_receipts', 'money_totals']) {
      const props = api.TOOL_SPECS.find(t => t.name === tool).input.properties
      assert.equal(api.constrainStep({tool, args: {party: 'Greens'}}, c, props).args.lending, true, `${tool}: ${q}`)
    }
    assert.equal(api.periodPlan({shape: 'money', steps: [{tool: 'party_receipts', args: {party: 'Greens'}}]}, period, {}, c).steps[0].args.lending, true)
  }
  assert.equal(api.extractAskConstraints('Who gives the most to the Greens?', period, named).lending, undefined)
  assert.equal(api.declaredDebtsLine(EXTRAS, 'Greens').text, DEBTS)
  assert.equal(api.declaredDebtsLine(EXTRAS, 'Labor'), null, 'no declared debts: no line')
  const out = await api.partyDonations({...deps, asset: lendingAsset}, {party: 'Greens', measure: 'all_types', lending: true})
  assert.deepEqual(out.data.lending, [api.LENDING_NOTE, DEBTS])
  assert.deepEqual(out.cite.slice(-2).map(c => c.label), [api.LENDING_NOTE, DEBTS])
  assert.ok(!out.cite.some(c => /\blent\b|\bloaned\b/i.test(c.label)))
  assert.equal((await api.partyDonations({...deps, asset: lendingAsset}, {party: 'Greens', measure: 'all_types'})).data.lending, undefined, 'only when asked')
  const totals = await api.callTool({origin: 'https://opax.test', asset: lendingAsset}, 'money_totals', {party: 'Greens', group_by: 'donor', lending: true})
  assert.deepEqual(totals.citations.slice(-2).map(c => c.text), [api.LENDING_NOTE, DEBTS])
})

test('a lending answer leads with the note and the debts, ranks receipts as receipts, and a draft that says "lent" gives way', async () => {
  const question = 'Who lent money to the Greens?', period = {kind: 'all', label: ''}
  const result = await api.partyDonations({...deps, asset: lendingAsset}, {party: 'Greens', measure: 'all_types', lending: true})
  const facts = api.factSheet([result]).facts
  const input = {question, period, facts: api.writingFacts(undefined, facts)}
  const debtFacts = facts.filter(f => f.receipt?.measure === 'declared_debts')
  assert.deepEqual(debtFacts.map(f => [f.text, !!f.receipt.aside]), [[api.LENDING_NOTE, true], [DEBTS, true]], 'labelled asides, so they never rank')
  assert.deepEqual(api.donorRanking('Who gave the most money to the Greens?', input.facts.map(f => f.source)).map(r => r.name), ['Invented Bank Ltd', 'Invented Workers Union', 'Invented Company Pty Ltd', 'Untyped Example Ltd'])
  const prose = api.proseFallback(input).answer
  const lines = prose.split('\n').filter(Boolean)
  assert.equal(lines[0], api.LENDING_NOTE)
  assert.equal(lines[1], DEBTS)
  assert.match(lines[2], /^Greens disclosed \$501,000 in receipts from Invented Bank Ltd /, 'the receipts, called receipts')
  assert.doesNotMatch(prose.replace(api.LENDING_NOTE, ''), LOAN)
  // A writer draft that calls a receipt lent is replaced by the facts-only answer.
  const bank = input.facts.find(f => f.source.receipt?.source === 'Invented Bank Ltd' && !f.source.receipt.aside)
  const model = new MockLanguageModelV4({doGenerate: () => ({content: [{type: 'text', text: JSON.stringify({answer_decision: 'answer', sentences: [
    {text: 'Invented Bank Ltd lent the Greens the most: $501,000 across financial years 2019-20 to 2020-21.', facts: [bank.id]}]})}],
    finishReason: {unified: 'stop', raw: 'stop'}, usage: {inputTokens: {total: 10}, outputTokens: {total: 10}}, warnings: []})})
  const write = createAnswerWriter({model, modelBudgetSpent: async () => false, dailyBudget: {reserve: async () => ({settle: async () => {}})}})
  const written = await write(input, {rounds: 1, tokens: {input: 0, output: 0}}, undefined, 3000)
  assert.equal(model.doGenerateCalls.length, 1, 'the writer ran')
  assert.doesNotMatch(written.answer, /\blent\b/)
  assert.match(written.answer, /Greens disclosed \$501,000 in receipts from Invented Bank Ltd/)
  assert.ok(written.answer.startsWith(api.LENDING_NOTE), written.answer)
})

test('an industry donations ranking gives each party its industry\'s other receipts as labelled lines, never ranked', async () => {
  const unions = await api.partyDonations(deps, {industry: 'unions', measure: 'donations'})
  assert.deepEqual(unions.data.rows, [{party: 'Example', total_aud: 50000, receipts: 1}])
  assert.deepEqual(unions.data.other_receipts.map(r => [r.party, r.subscriptions_aud, r.line]),
    [['Example', 80000, "Union sources also recorded $80,000 in subscriptions to Example in financial year 2020-21, which the AEC doesn't class as donations."]])
  const finance = await api.partyDonations(deps, {industry: 'finance', measure: 'donations', from_year: 2019, to_year: 2019})
  assert.deepEqual(finance.data.rows, [], 'the bank gave no donations in 2019-20')
  assert.equal(finance.data.other_receipts[0].line, 'Finance sources recorded $300,000 in other receipts (amounts other than donations or subscriptions) to Example in financial year 2019-20.')
  const facts = api.factSheet([unions]).facts
  assert.equal(facts.filter(f => f.receipt?.aside).length, 1)
  assert.equal((await api.partyDonations(deps, {industry: 'unions', measure: 'all_types'})).data.other_receipts, undefined, 'all types: no lines')
})

test('voice never gives a Public Funding payer as a donor\'s own declaration; a donor-declared flow keeps that line', () => {
  // A flow only the donor's own return declares: typed, no receipt on the party's return, no Public Funding.
  const DECL = 'donor:declared only'
  const graph = structuredClone(GRAPH)
  graph.nodes.push({id: DECL, label: 'Declared Only Ltd', kind: 'donor', industry: 'other', total: 4000, count: 1, by_type: {}, by_type_year: {}})
  graph.edges.push({source: DECL, target: 'party:Example', total: 4000, count: 1, byYear: {2020: [4000, 1]}, by_type: {}, by_type_year: {}})
  const found = (donorId, donor) => ({type_breakdown: {}, total_aud: 4000, receipts: 1, period: '2020-21', subject: donor, period_reading: '', scope_reading: '',
    flows: [{donor, donor_id: donorId, donor_href: null, return_reference: 'AEC donor return', party: 'Example', party_id: 'party:Example', total_aud: 4000}],
    selected_donors: [donor], selected_parties: ['Example'], selected_industries: [], requested_years: [2020, 2020], jurisdiction: 'federal', period_options: [], scope_options: [],
    period_coverage: {since: '2020-07-01', until: '2021-06-30', as_of: null, basis: 'financial_year'}, generated: '2026-11-13', sources: [{title: 'map', url: 'https://opax.test/money'}]})
  const fund = found(FUND, 'Zed Funding Body')
  assert.equal(api.voiceReceiptData(graph, fund), fund, 'Public Funding: left as found, never a declaration')
  const declared = api.voiceReceiptData(graph, found(DECL, 'Declared Only Ltd'))
  assert.equal(declared.donor_declared_only, true, 'the donor-declared line still renders')
  assert.match(declared.answer, /^Declared Only Ltd declared \$4,000 to Example on its own donor return/)
  // End to end: the deterministic route holds no receipt from the payer to name.
  const asked = api.receiptAnswer(GRAPH, 'How much did Zed Funding Body give to Example?', 'federal', 'https://opax.test', {measure: 'receipts_all'})
  assert.doesNotMatch(asked.answer, /declared|900,000/)
})
