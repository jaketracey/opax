// The lending check reads the question's own words, not a donor's disclosed name (BACKLOG 4z).
// A router writes the full disclosed name back into the question ("Comscrv" becomes
// "Comscrv (No. 2092) Pty Ltd - Loan"); a "Loan" or "No. 2092" inside that name is the
// donor's name, never a lending question or a period. Counted as the AEC typed it, name visible.
// Hermetic: the published typed graph, with two real Nationals donors given loan-word names.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {typedMoney, MONEY_PATH} from './money-graph-data.mjs'
import {localApi} from './ask-lobby-money-harness.mjs'

const root = new URL('../', import.meta.url).pathname
const bundle = await build({stdin: {contents: "export {runVoiceTool} from './src/voice-tools';export {receiptAnswer} from './src/voice-money'", resolveDir: root}, bundle: true, write: false, platform: 'node', format: 'esm'})
const voice = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const api = await localApi()

const COMSCRV = 'Comscrv (No. 2092) Pty Ltd - Loan', AUSSIE = 'Aussie Home Loans Pty Ltd'
// Every regex metacharacter, backslash included, is escaped before a name joins a pattern.
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const graph = typedMoney()
const nationals = graph.nodes.find(n => n.kind === 'party' && n.label === 'Nationals')
const donated = {}
for (const [from, to] of [['Mowburn Nominees', COMSCRV], ['Pratt Holdings Pty Ltd', AUSSIE]]) {
  const node = graph.nodes.find(n => n.kind === 'donor' && n.label === from)
  assert.ok(node, `${from} is a donor in the published graph`)
  const edge = graph.edges.find(e => e.source === node.id && e.target === nationals.id)
  assert.ok(edge?.by_type?.donation_received > 0, `${from} has typed donations to the Nationals`)
  Object.assign(node, {label: to, aliases: [], lookup_names: []})
  donated[to] = '$' + edge.by_type.donation_received.toLocaleString('en-AU')
}
const assets = {fetch: async request => {
  const path = new URL(request.url).pathname
  if (path === MONEY_PATH) return Response.json(graph)
  try { return Response.json(JSON.parse(readFileSync(root + 'public' + path, 'utf8'))) } catch { return new Response('', {status: 404}) }
}}
const env = {COMMUNITY_ORIGIN: 'https://opax.test', ASSETS: assets}
const askMoney = question => api.federalPartyMoneyAnswer({question, kind: 'all'}, assets)
const voiceMoney = query => voice.runVoiceTool('search_records', {query}, env, async () => { throw Error('Unexpected network retrieval') })
const LENT = /cannot establish how much was lent/

test('a short donor name the router expands to "... - Loan" gets its Donation Received figure, name visible', async () => {
  const ask = await askMoney('How much did Comscrv give to the Nationals?')
  assert.equal(ask.answer_status, 'calculated')
  assert.doesNotMatch(ask.answer, LENT)
  assert.ok(ask.answer.startsWith(`**${COMSCRV}** has **${donated[COMSCRV]}** recorded in donations received (AEC receipt type: Donation Received) to Nationals`), ask.answer.slice(0, 200))
  // "No. 2092" inside the name is not the 2092–93 financial year.
  assert.doesNotMatch(ask.answer, /2092–93/)
  const ranked = await api.rankedMoneyAnswer({question: 'Which party got the most money from Comscrv?', kind: 'all'}, assets)
  assert.equal(ranked.answer_status, 'calculated')
  assert.ok(ranked.answer.startsWith(`**Nationals** leads parties receiving money from ${COMSCRV}: **${donated[COMSCRV]}** in donations received`), ranked.answer.slice(0, 200))
  const spoken = await voiceMoney('Which party got the most money from Comscrv?')
  assert.doesNotMatch(spoken.data.answer, LENT)
  assert.match(spoken.data.answer, new RegExp(`from ${escapeRe(COMSCRV)}: \\*\\*\\${donated[COMSCRV]}\\*\\*`))
})

test('a donor whose own name says Loans gets its figure on Ask and voice', async () => {
  const ask = await askMoney('How much did Aussie Home Loans give to the Nationals?')
  assert.equal(ask.answer_status, 'calculated')
  assert.ok(ask.answer.startsWith(`**${AUSSIE}** has **${donated[AUSSIE]}** recorded in donations received`), ask.answer.slice(0, 200))
  const direct = voice.receiptAnswer(graph, `How much did ${AUSSIE} give to the Nationals?`, 'federal', 'https://opax.test')
  assert.ok(!('needs_scope' in direct), direct.answer)
  assert.match(direct.answer, new RegExp(`^${AUSSIE}: \\${donated[AUSSIE]} in donations received`))
  const spoken = await voiceMoney('Which party got the most money from Aussie Home Loans?')
  assert.doesNotMatch(spoken.data.answer, LENT)
  assert.match(spoken.data.answer, new RegExp(`leads parties receiving money from ${AUSSIE}: `))
  assert.match(spoken.data.answer, new RegExp(`\\n\\| Nationals \\| \\${donated[AUSSIE]} \\|`))
})

test('a question that asks about lending still gets the lending answer, loan-word donor or not', async () => {
  for (const query of ['How much did Comscrv lend to the Nationals?', 'How much did Aussie Home Loans lend to the Nationals?', `How much did ${COMSCRV} lend to the Nationals?`, 'Loans to the Liberals', 'How much has the Nationals borrowed from Aussie Home Loans?']) {
    const spoken = await voiceMoney(query)
    assert.match(spoken.data.answer, LENT, query)
    assert.equal(spoken.data.total_aud, undefined, query)
    const direct = voice.receiptAnswer(graph, query, 'federal', 'https://opax.test')
    assert.match(direct.answer, LENT, query)
  }
})

// Review note 1: a period in the question must not reach the digits inside the expanded name.
test('the ranking route reads a year, a financial year and a range beside a "No. 2092 ... - Loan" name', async () => {
  const ranked = question => api.rankedMoneyAnswer({question, kind: 'all'}, assets)
  for (const [question, lead] of [
    ['Which party got the most money from Comscrv in 2001-02?', `**Nationals** is the only party receiving **$110,000** in donations received (AEC receipt type: Donation Received), 2001–02 from ${COMSCRV}`],
    ['Which party got the most money from Comscrv from 2001 to 2010?', `**Nationals** leads parties receiving money from ${COMSCRV}: **$489,000** in donations received (AEC receipt type: Donation Received), 2001–02 to 2008–09.`],
  ]) {
    const out = await ranked(question)
    assert.equal(out.answer_status, 'calculated', question)
    assert.ok(out.answer.startsWith(lead), `${question}\n${out.answer.slice(0, 300)}`)
  }
  // A year with no record keeps the held-period answer every donor gets, never the lending one.
  const year = await ranked('Which party got the most money from Comscrv in 2019?')
  assert.equal(year.answer_status, 'calculated')
  assert.doesNotMatch(year.answer, LENT)
  assert.match(year.answer, new RegExp(`^Held-period figures: \\*\\*Nationals\\*\\* leads parties receiving money from ${escapeRe(COMSCRV)}: \\*\\*\\${donated[COMSCRV]}\\*\\*`))
  assert.doesNotMatch(year.answer, /from 2019 to 2092|2092–93/)
})

// Review note 2: the asker types the full disclosed name; its digits and "Loan" are not the question's.
test('the full disclosed name typed by the asker gets its figure, with or without a period', async () => {
  const lifetime = await askMoney(`How much has ${COMSCRV} donated to the Nationals?`)
  assert.equal(lifetime.answer_status, 'calculated')
  assert.ok(lifetime.answer.startsWith(`**${COMSCRV}** has **${donated[COMSCRV]}** recorded in donations received (AEC receipt type: Donation Received) to Nationals, 2001–02 to 2015–16.`), lifetime.answer.slice(0, 200))
  const year = await askMoney(`How much did ${COMSCRV} give to the Nationals in 2001-02?`)
  assert.equal(year.answer_status, 'calculated')
  assert.ok(year.answer.startsWith(`**${COMSCRV}** has **$110,000** recorded in donations received (AEC receipt type: Donation Received) to Nationals, 2001–02.`), year.answer.slice(0, 200))
})

// Review note 3: one financial year is said once.
test('a donor total for one financial year names that year once', async () => {
  const out = await askMoney('How much did Comscrv give to the Nationals in 2019?')
  assert.equal(out.answer_status, 'calculated')
  assert.ok(out.answer.startsWith(`**${COMSCRV}** has **$0** recorded in donations received (AEC receipt type: Donation Received) to Nationals, in 2019–20.`), out.answer.slice(0, 200))
  assert.doesNotMatch(out.answer, /2019–20 to 2019–20/)
})
