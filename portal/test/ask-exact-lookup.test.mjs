import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: "export * from './src/ask-exact-lookup'; export * from './src/ask-constraints'; export {runAgentic, inferPeriod, extractNamedScope} from './src/agentic-ask'; export {agenticAskPayload} from './src/agentic-response'; export {groundAnswerPayload} from './src/research-grounding';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'] })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const emptyScope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
const json = path => JSON.parse(readFileSync(new URL('../public' + path, import.meta.url)))
const bills = json('/bills/index.json'), divisions = json('/divisions/index.json'), roster = json('/parliamentarians.json'), pay = json('/pay.json')
const assets = { '/bills/index.json': bills, '/divisions/index.json': divisions, '/parliamentarians.json': roster, '/pay.json': pay }
const deps = overrides => ({ asset: async path => assets[path] ?? null, kb: async () => { throw Error('exact lookup must not use ranked retrieval') }, generate: async () => { throw Error('exact lookup must not use a model') }, ...overrides })
const lookup = (q, d = deps(), named = api.extractNamedScope(q, roster, bills)) => api.exactRecordLookup(q, d, api.inferPeriod(q), named)
const passed = bills.bills.find(b => b.status === 'passed' && b.title === 'Statute Stocktake (Appropriations) Bill 2013')
// Coverage and snapshot dates are read from the published files the lookup reads, so the tests follow the data
// as it moves on; the floors only guard against an index going backwards.
const divisionDates = chamber => divisions.divisions.filter(r => !chamber || String(r.key).startsWith('federal-' + chamber + '-'))
  .map(r => String(r.date).slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
const chamberOf = q => /\bsenat(?:e|ors?)\b/i.test(q) ? 'senate' : /\bhouse\b/i.test(q) ? 'representatives' : undefined
const latestDivision = divisionDates().at(-1)
assert.ok(divisionDates()[0] === '2006-02-07' && latestDivision >= '2026-10-29', 'the divisions index covers 2006-02-07 to at least 2026-10-29')
assert.ok(pay.meta.from === '1999-12-07' && /^\d{4}-\d{2}-\d{2}$/.test(pay.meta.as_of) && pay.meta.as_of >= '2026-10-19', 'the pay records run from 1999-12-07 to at least 2026-10-19')

test('an absent full bill title is not replaced by a related fuel bill; it falls through to the agent', async () => {
  assert.equal(await lookup('Who introduced the Rural Postcode Equity (Fuel Rebate) Bill 2017?'), null)
})

test('bill title matching preserves the year and accepts an unambiguous title without it', async () => {
  assert.equal(await lookup(`What is the status of the ${passed.title}?`), null)
  assert.equal(await lookup(`What is the status of the ${passed.title.replace(/ 2013$/, '')}?`), null)
  assert.equal(await lookup(`What is the status of the ${passed.title.replace(/2013$/, '2014')}?`), null, 'a different year is not the indexed bill')
  assert.equal(await lookup('Who introduced the Victorian Example Infrastructure Bill 2020?'), null, 'the federal index cannot establish state absence')
})

test('a rejected-bill premise is corrected with the exact recorded status first', async () => {
  const q = `Why was the ${passed.title} rejected by parliament?`, out = await lookup(q)
  assert.equal(out.answer.answer, `${passed.title} passed parliament; it was not rejected.`)
  assert.match(out.answer.sources[0].url, new RegExp('/bill/' + passed.key + '$'))
})

test('a wrong introduction date is corrected from the indexed lifecycle field', async () => {
  const bill = bills.bills.find(b => b.introduced === '2026-09-17')
  const out = await lookup(`Why was the ${bill.title} introduced on 18 September 2026?`)
  assert.match(out.answer.answer, /was introduced on 2026-09-17, not 2026-09-18\.$/)
})

test('missing division dates, including dates before coverage, fall through to the agent', async () => {
  for (const q of ['What divisions were held in federal parliament on 2 September 2012?', 'How many divisions did the Senate hold in 1987?', 'How did the House vote on the Mabo response legislation in December 1993?'])
    assert.equal(await lookup(q), null, q)
})

test('future requests fall through to the agent instead of a fixed no-record answer', async () => {
  for (const q of ['How will Vanessa Bleyer vote on the next budget?', 'What will Dan Tehan declare in the register of interests next year?', 'Who won the 2091 federal election?', 'Which bills received royal assent in December 2091?', 'How much did Labor receive in disclosed donations in 2091-92?', 'What will the Prime Minister be paid in 2091?'])
    assert.equal(await lookup(q), null, q)
  assert.equal(await lookup('What protections will be introduced by the housing bill?'), null, 'published proposals are not predictions of events')
})

test('unavailable indexes never establish absence', async () => {
  const d = deps({ asset: async () => null })
  assert.equal(await lookup('Who introduced the Example Infrastructure Bill 2020?', d), null)
  assert.equal(await lookup('Which electorate does Ingrid Penhaligon MP represent?', d), null)
  assert.equal(await lookup('How did the House vote on 2 September 2012?', d), null)
  assert.equal(await lookup('Who will win the next election?', d), null)
})

test('full person slots do not substitute a real person sharing the first name', async () => {
  for (const q of ['Which electorate does Ingrid Penhaligon MP represent?', "what's on Ingrid Vandermolen's interests register", "what's Ingrid Pemberley mp paid", 'Ingrid Marchbanks declared interests?', 'What did Ingrid Brightwater say about the Budget Savings (Omnibus) Bill 2016?']) {
    assert.equal(await lookup(q), null, q)
  }
  const q = 'What did Albo say about housing?', scope = { ...emptyScope, people: ['Anthony Albanese'] }
  assert.equal(await lookup(q, deps(), scope), null, 'respect the identity already resolved by the name resolver')
  for (const q of ['What has the federal government said about housing?', 'How did federal parliament vote on climate legislation?']) assert.equal(await lookup(q), null)
})

test('party and electorate premises use recorded identity rather than the claimed label', async () => {
  const q = 'As a Liberal senator, how has Dorinda Cox voted on climate legislation?'
  const out = await lookup(q)
  assert.equal(out.answer.answer, 'Dorinda Cox is recorded as Labor, not Liberal.')
  assert.equal(out.correctedParty, true)
  assert.equal(out.terminal, false)
  const scope = { ...api.extractNamedScope(q, roster, bills), parties: [], correctedParty: true }
  assert.equal(api.extractAskConstraints(q, api.inferPeriod(q), scope).party, undefined)
  assert.equal(await lookup(q + ' in 2021?'), null, 'an undated current affiliation cannot correct a historical party')
  const seat = await lookup('What has Darren Chester done for the people of Oxley as their MP?')
  assert.equal(seat.answer.answer, 'Darren Chester is recorded as the member for Gippsland, not Oxley.')
})

test('office premises are scoped to the recorded offices and their coverage', async () => {
  for (const person of ['Bill Shorten', 'Peter Dutton', 'Kim Beazley']) {
    const out = await lookup(`When was ${person} Prime Minister?`)
    assert.match(out.answer.answer, new RegExp(`^OPAX has no record of ${person} serving as Prime Minister;`))
    assert.match(out.answer.answer, /Leader of the Opposition/)
    assert.ok(out.answer.answer.includes(`office records cover ${pay.meta.from} to ${pay.meta.as_of}.`), out.answer.answer)
  }
  assert.equal(await lookup('When was John Howard Prime Minister?'), null)
})

test('a false vote premise is corrected from one exact division and member, never a tally of neighbours', async () => {
  const date = '2007-02-07', name = 'Richard Colbeck'
  const dayRows = divisions.divisions.filter(r => r.date === date)
  const files = Object.fromEntries(dayRows.map(r => ['/divisions/' + r.slug + '.json', json('/divisions/' + r.slug + '.json')]))
  const div = Object.values(files).find(r => /Matters of Urgency.*Climate Change/i.test(r.name) && r.members.some(m => m.name === name && m.vote === 'no'))
  assert.ok(div)
  const q = `Why did ${name} vote for the ${div.name} on 7 February 2007?`
  const out = await lookup(q, deps({ asset: async path => files[path] ?? assets[path] ?? null }))
  assert.equal(out.answer.answer, `${name} voted no on ${div.name} on ${date}.`)
  assert.equal(out.answer.sources[0].url, 'https://opax.com.au/doc/division-' + div.key)
  assert.equal(await lookup(q.replace(div.name, 'a different motion'), deps({ asset: async path => files[path] ?? assets[path] ?? null })), null, 'a same-day neighbour cannot establish the vote')
})

test('division title financial years cannot widen an explicit sitting date', () => {
  const p = api.inferPeriod('Why did a member vote for the Appropriation Bill (No. 1) 2022-2023 on 28 November 2022?')
  assert.deepEqual([p.since, p.until], ['2022-11-28', '2022-11-28'])
})

test('ranked catalog hits with the wrong bill title or division date cannot become answer facts', () => {
  for (const [q, rows] of [
    ['Who introduced the Example Infrastructure Bill 2020?', [{ kind: 'bill', title: 'Other Infrastructure Bill 2020', url: 'https://example.org/other' }]],
    ['How did the House vote on 1 October 2020?', [{ kind: 'division', title: 'Other vote', period: '2020-10-02', url: 'https://example.org/other' }, { kind: 'division', title: 'Undated vote', url: 'https://example.org/undated' }]],
  ]) {
    const c = api.extractAskConstraints(q, api.inferPeriod(q), emptyScope)
    const result = api.guardExactLookupResult({ tool: 'find_records', ok: true, data: { rows, total: 5 }, cite: rows.map(r => ({ kind: 'record', label: r.title, url: r.url })), notes: [] }, c)
    assert.deepEqual(result.data.rows, [])
    assert.equal(result.data.coverage_only, true)
    assert.match(result.cite[0].label, /^OPAX has no matching/)
    assert.doesNotMatch(JSON.stringify(result), /example\.org|Other Infrastructure|Other vote|Undated vote/)
  }
})

test('a checked party correction stays first after the writer and preserves citation character offsets', async () => {
  const q = 'As a Liberal senator, how has Dorinda Cox voted on climate legislation?'
  const answer = 'Dorinda Cox has recorded climate votes.', resource = 'vote-record', source = { resource, slug: '', title: 'Climate votes', href: 'https://example.org/vote', url: 'https://example.org/vote', snippet: answer, cited: true, kind: 'record' }
  let wrote = false
  const research = Object.assign(async (_q, context) => {
    assert.deepEqual(context.named.parties, [])
    assert.equal(context.scope({ tool: 'member_votes', args: { person: 'Dorinda Cox', keyword: 'climate' } }).args.party, undefined)
    return { rounds: 1, steps: [], results: [], selected: [], tokens: { input: 0, output: 0 }, qualitative: { answer, citations: { [resource + '/t/body/0']: [[0, answer.length]] }, sources: [source] } }
  }, { write: async () => { wrote = true; return { answer, answer_decision: 'answer', citations: { [resource + '/t/body/0']: [[0, answer.length]] }, sources: [source] } } })
  const run = await api.runAgentic(q, deps({ research }), async () => {}, 40_000, api.inferPeriod(q), {}, api.extractNamedScope(q, roster, bills))
  assert.equal(wrote, true)
  assert.match(run.answer, /^Dorinda Cox is recorded as Labor, not Liberal\.\n\nDorinda/)
  const range = run.qualitative.citations[resource + '/t/body/0'][0]
  assert.equal(Array.from(run.answer).slice(...range).join(''), answer)
  const body = api.agenticAskPayload(run, q)
  assert.match(body.answer, /^Dorinda Cox is recorded as Labor, not Liberal\./)
  assert.match(api.groundAnswerPayload(body, q).answer, /^Dorinda Cox is recorded as Labor, not Liberal\./)
})

test('the exact absence check respects fuzzy names, ambiguous names and register-only members', async () => {
  assert.equal(await lookup('Which electorate does Anthony Albanes MP represent?'), null)
  const q = "What is on Bree James's interests register?"
  const d = deps({ asset: async path => path === '/interests/index.json' ? { people: { 'n-bree-james': { name: 'Bree James' } } } : assets[path] ?? null })
  assert.equal(await lookup(q, d), null)
  const ambiguous = deps({ asset: async path => path === '/parliamentarians.json' ? { people: [{ name: 'John Smith', pid: '1' }, { name: 'Joan Smith', pid: '2' }] } : null })
  assert.equal(await lookup('What did Jonn Smith say about housing?', ambiguous, emptyScope), null)
})

test('empty count windows within dated coverage remain available to count_records', async () => {
  const d = deps({ asset: async path => path === '/divisions/index.json' ? { divisions: [{ key: 'federal-senate-1', date: '2025-07-30' }, { key: 'federal-senate-2', date: '2025-08-01' }] } : null })
  assert.equal(await lookup('How many divisions did the Senate hold on 31 July 2025?', d, emptyScope), null)
})
