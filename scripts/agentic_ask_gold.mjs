#!/usr/bin/env node
// Gold set for the agentic Ask spike (docs/design/agentic-ask-2026-10.md).
//
// Every expected answer here is computed from the record, never by a model:
//  - speech counts from the knowledge box: /catalog facets (counted over every
//    matching resource, verified 2026-10-12 against filtered totals) and, for
//    exact date windows, /search fulltext totals restricted to the speech body
//    field (one row per speech). /search facets are NOT used: they disagree with
//    the filtered totals (Pocock 132 vs 134 on the same filter).
//  - votes from portal/public/divisions/*.json, money from portal/public/graph/money.json
//    after withholdIndividualDonors (donors not named are never ranked by name).
// Each question keeps the exact query that produced its answer, so a reader can
// re-run it. Speaker counts carry an attribution-risk note: the share of the
// speaker's matching documents that come from the OpenAustralia source, where
// data-speaker-attribution-check (12 Oct) found mixed-speaker documents.
//
//   node scripts/agentic_ask_gold.mjs            # writes portal/test/fixtures/agentic-ask-gold.json
//   node scripts/agentic_ask_gold.mjs --out portal/private/agentic-ask-spike/gold-late.json   # a later snapshot for drift-aware scoring
//
// Reads portal/.dev.vars (ARAG_KB_ID, ARAG_KB_TOKEN). Read-only against the KB.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withholdIndividualDonors } from '../portal/public/donor-entity.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'portal/public')
// --out <file>: a later snapshot of the same questions (the record keeps moving while enrichment labels speeches).
const outArg = process.argv.indexOf('--out')
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'portal/test/fixtures/agentic-ask-gold.json')
const vars = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'portal/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = `https://aws-ap-southeast-2-1.rag.progress.cloud/api/v1/kb/${vars.ARAG_KB_ID}`

let calls = 0
async function kb(p, body) {
  for (let attempt = 0; ; attempt++) {
    calls++
    const res = await fetch(BASE + p, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-nuclia-serviceaccount': `Bearer ${vars.ARAG_KB_TOKEN}` },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return res.json()
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    throw new Error(`${p} ${res.status} ${(await res.text()).slice(0, 300)}`)
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
  return out
}

// ---- clause vocabulary (the same grammar the Worker's filterExpression uses) ----
const label = (labelset, l) => ({ prop: 'label', labelset, label: l })
const SPEECH = label('kind', 'speech')
const MEMBERS = { not: label('speaker_type', 'witness') }
// Committee hearings are split into one record per turn, so a committee-active
// senator's question-and-answer turns outnumber their chamber speeches 10:1
// (Pocock: 1,700 senate_committee turns, 181 Senate speeches). A "speech" in the
// gold set is a chamber speech; committee turns are reported beside it.
const COMMITTEES = ['senate_committee', 'joint_committee', 'house_committee']
const CHAMBER_ONLY = { not: { or: COMMITTEES.map((c) => label('chamber', c)) } }
const COMMITTEE_ONLY = { or: COMMITTEES.map((c) => label('chamber', c)) }
const BODY = { prop: 'field', type: 'text', name: 'body' }
const topic = (t) => label('topic', t)
const speaker = (name) => ({ prop: 'origin_collaborator', collaborator: name })
const created = (since, until) => ({ prop: 'created', ...(since ? { since: `${since}T00:00:00Z` } : {}), ...(until ? { until: `${until}T23:59:59Z` } : {}) })
const and = (clauses) => (clauses.length === 1 ? clauses[0] : { and: clauses })

const U_O = '/u/o' // origin collaborators (nidx label path); /origin.collaborators returns nothing
const PARTY = '/classification.labels/party'
const DECADE = '/classification.labels/decade'
const SOURCE = '/classification.labels/source'

async function catalog(clauses, faceted = []) {
  const body = { filter_expression: { resource: and(clauses) }, page_size: 0, ...(faceted.length ? { faceted } : {}) }
  const d = await kb('/catalog', body)
  return { total: d.fulltext?.total ?? 0, facets: d.fulltext?.facets ?? {}, query: { endpoint: 'POST /catalog', body } }
}
async function searchTotal(clauses) {
  const body = { query: '', features: ['fulltext'], top_k: 1, filter_expression: { field: and([...clauses, BODY]) } }
  const d = await kb('/search', body)
  return { total: d.fulltext?.total ?? 0, query: { endpoint: 'POST /search', body } }
}
const facetRows = (facet, prefix) => Object.entries(facet ?? {})
  .map(([k, n]) => ({ name: k.slice(prefix.length + 1), count: n }))
  .filter((r) => r.name)
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

/** Speakers ranked over every matching speech (catalog facet). */
async function rankSpeakers(clauses, n = 5, scope = CHAMBER_ONLY) {
  const c = await catalog([SPEECH, MEMBERS, scope, ...clauses], [U_O])
  const rows = facetRows(c.facets[U_O], U_O)
  return { total: c.total, top: rows.slice(0, n), next: rows[n] ?? null, method: 'catalog facet /u/o over every matching speech', query: c.query }
}
async function rankParties(clauses, n = 5) {
  const c = await catalog([SPEECH, CHAMBER_ONLY, ...clauses], [PARTY])
  const rows = facetRows(c.facets[PARTY], PARTY)
  return { total: c.total, top: rows.slice(0, n), next: rows[n] ?? null, method: 'catalog facet /classification.labels/party', query: c.query }
}
/** decade labels overlapping [since, until] (catalog `created` is index time, so decades stand in). */
function decadesFor(since, until) {
  const a = Number(since.slice(0, 3)), b = Number((until ?? '2026').slice(0, 3))
  return Array.from({ length: b - a + 1 }, (_, i) => `${a + i}0s`)
}
/**
 * Exact ranking inside a date window: candidates from the decade facet, then an
 * exact /search total per candidate. Exact when the n-th window count is at
 * least the best decade count left outside the candidate list (a window count
 * can never exceed its decade count).
 */
async function rankWindow(kind, clauses, since, until, n = 5, k = 30) {
  const decades = decadesFor(since, until)
  const decadeClause = decades.length === 1 ? label('decade', decades[0]) : { or: decades.map((d) => label('decade', d)) }
  const facet = kind === 'speaker' ? U_O : PARTY
  const base = kind === 'speaker' ? [SPEECH, MEMBERS, CHAMBER_ONLY, ...clauses] : [SPEECH, CHAMBER_ONLY, ...clauses]
  const c = await catalog([...base, decadeClause], [facet])
  const cands = facetRows(c.facets[facet], facet)
  const pick = cands.slice(0, k)
  const counted = await pool(pick, 4, async (row) => {
    const who = kind === 'speaker' ? speaker(row.name) : label('party', row.name)
    const t = await searchTotal([...base, who, created(since, until)])
    return { name: row.name, count: t.total }
  })
  counted.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const outside = cands[k]?.count ?? 0
  const exact = (counted[n - 1]?.count ?? 0) >= outside
  const window = await searchTotal([...base, created(since, until)])
  return {
    total: window.total, top: counted.slice(0, n), next: counted[n] ?? null, exact,
    method: `candidates: catalog facet ${facet} over decades ${decades.join('+')} (top ${k}); counts: /search fulltext body-only totals with created ${since}..${until ?? 'now'}`,
    query: { candidates: c.query, per_candidate: { endpoint: 'POST /search', template: { query: '', features: ['fulltext'], top_k: 1, filter_expression: { field: and([...base, kind === 'speaker' ? speaker('<NAME>') : label('party', '<PARTY>'), created(since, until), BODY]) } } } },
  }
}
/** Attribution risk: how many of the speaker's matching speeches come from the OpenAustralia source. */
async function attributionRisk(clauses, rows) {
  return pool(rows, 4, async (r) => {
    const c = await catalog([SPEECH, MEMBERS, CHAMBER_ONLY, ...clauses, speaker(r.name)], [SOURCE])
    const oa = c.facets[SOURCE]?.[`${SOURCE}/openaustralia`] ?? 0
    return { name: r.name, count: c.total, openaustralia: oa, openaustralia_share: c.total ? +(oa / c.total).toFixed(3) : 0 }
  })
}

// ---- votes (portal/public/divisions) ----
const DIVISIONS = fs.readdirSync(path.join(PUBLIC, 'divisions')).filter((f) => f.startsWith('division-'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PUBLIC, 'divisions', f), 'utf8')))
const divisionText = (d) => [d.name ?? '', ...(d.bills ?? []).map((b) => (typeof b === 'object' ? b.title ?? '' : String(b)))].join(' ')
const GAMBLING_DIVISION = /gambl|wagering|betting|poker machine|pokies/i
function personVotes(name, test, house = null) {
  const rows = []
  for (const d of DIVISIONS) {
    if (!test(d) || (house && d.house !== house)) continue
    const m = (d.members ?? []).find((x) => x.name === name)
    if (m) rows.push({ division: `division-${d.key}`, date: d.date, name: d.name, vote: m.vote })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.division.localeCompare(b.division))
  const tally = rows.reduce((t, r) => ({ ...t, [r.vote]: (t[r.vote] ?? 0) + 1 }), {})
  return { divisions: rows.length, aye: tally.aye ?? 0, no: tally.no ?? 0, paired: tally.paired ?? 0, rows }
}
function partyVotes(party, test) {
  let aye = 0, no = 0, split = 0, absent = 0
  const rows = []
  for (const d of DIVISIONS) {
    if (!test(d)) continue
    const ms = (d.members ?? []).filter((x) => x.party === party)
    const a = ms.filter((x) => x.vote === 'aye').length, n = ms.filter((x) => x.vote === 'no').length
    if (!a && !n) { absent++; continue }
    const side = a && n ? 'split' : a ? 'aye' : 'no'
    if (side === 'aye') aye++; else if (side === 'no') no++; else split++
    rows.push({ division: `division-${d.key}`, date: d.date, aye: a, no: n, side })
  }
  return { divisions_voted: rows.length, all_aye: aye, all_no: no, split, not_present: absent, rows }
}

// ---- money (portal/public/graph/money.json, federal AEC returns) ----
const MONEY = withholdIndividualDonors(JSON.parse(fs.readFileSync(path.join(PUBLIC, 'graph/money.json'), 'utf8')))
const NODE = new Map(MONEY.nodes.map((n) => [n.id, n]))
const isWithheld = (n) => /^donor:withheld-/.test(n?.id ?? '')
function topDonors(party, n = 3) {
  const edges = MONEY.edges.filter((e) => e.target === `party:${party}` && NODE.get(e.source)?.kind === 'donor')
  const named = edges.filter((e) => !isWithheld(NODE.get(e.source))).sort((a, b) => b.total - a.total)
  const withheld = edges.filter((e) => isWithheld(NODE.get(e.source)))
  return {
    party, top: named.slice(0, n).map((e) => ({ name: NODE.get(e.source).label, total_aud: e.total, receipts: e.count, years: [e.firstYear, e.lastYear] })),
    donors_not_named: { donors: withheld.length, total_aud: withheld.reduce((s, e) => s + e.total, 0) },
    query: { file: 'portal/public/graph/money.json', select: `edges where target = party:${party}, donor nodes after withholdIndividualDonors, sorted by total` },
  }
}
function industryByParty(industry) {
  const sums = new Map()
  for (const e of MONEY.edges) {
    const d = NODE.get(e.source)
    if (d?.kind !== 'donor' || d.industry !== industry || !e.target.startsWith('party:')) continue
    sums.set(e.target.slice(6), (sums.get(e.target.slice(6)) ?? 0) + e.total)
  }
  return {
    industry, rows: [...sums].map(([party, total_aud]) => ({ party, total_aud })).sort((a, b) => b.total_aud - a.total_aud),
    query: { file: 'portal/public/graph/money.json', select: `sum edge.total by target party where donor.industry = ${industry}` },
  }
}

const TERM_47 = ['2022-07-26', '2025-03-28']
const TERM_48 = ['2025-07-22', null]

// ---- the questions ----
// expect.kind: ranking | numbers | comparison | money. checks are deterministic (see scripts/agentic_ask_spike.mjs score()).
const Q = []
const add = (id, category, question, compute, note = '') => Q.push({ id, category, question, compute, note })

const ranking = (r, extra = {}) => ({ kind: 'ranking', top: r.top, total: r.total, exact: r.exact ?? true, method: r.method, query: r.query, ...extra })

// Speaker rankings
add('R01', 'ranking', 'Who is making the most speeches about gambling reform', async () => {
  const r = await rankSpeakers([topic('gambling')], 5)
  const committee = await rankSpeakers([topic('gambling')], 3, COMMITTEE_ONLY)
  return ranking(r, { attribution: await attributionRisk([topic('gambling')], r.top), committee_top: committee.top, committee_total: committee.total })
}, "Jake's question (12 Oct). Read as: chamber speeches carrying the gambling topic label, members only, whole record, every parliament; committee-hearing turns reported beside it.")
add('R02', 'ranking', 'Which federal politicians have made the most speeches about gambling since 2022?', async () =>
  ranking(await rankWindow('speaker', [topic('gambling'), label('state', 'federal')], '2022-01-01', null, 5), { coverage_caveat: true }), 'Window crosses the federal 2023-24 coverage gap.')
add('R03', 'ranking', 'Who has given the most speeches about housing in the NSW Parliament?', async () =>
  ranking(await rankSpeakers([topic('housing'), label('state', 'nsw')])))
add('R04', 'ranking', 'Which senators have made the most Senate speeches about climate and the environment?', async () =>
  ranking(await rankSpeakers([topic('climate-environment'), label('chamber', 'senate')])), 'Senate floor only (chamber label senate; committee hearings excluded).')
add('R05', 'ranking', 'Who has spoken most about immigration in the House of Representatives?', async () =>
  ranking(await rankSpeakers([topic('immigration'), label('chamber', 'representatives')])))
add('R06', 'ranking', 'Who has made the most speeches about Indigenous affairs in the Victorian Parliament?', async () =>
  ranking(await rankSpeakers([topic('indigenous-affairs'), label('state', 'vic')])))
add('R07', 'ranking', 'Who are the top five speakers on defence and security since 2020?', async () =>
  ranking(await rankSpeakers([topic('defence-security'), label('decade', '2020s')]), { top_n: 5 }), 'Since 2020 = the 2020s decade label, exact via catalog.')
add('R08', 'ranking', 'Which Greens MPs have spoken most about mining and energy?', async () =>
  ranking(await rankSpeakers([topic('mining-energy'), label('party', 'Greens')])))
add('R09', 'ranking', 'Who spoke most about tax and the budget in the 2010s?', async () =>
  ranking(await rankSpeakers([topic('tax-budget'), label('decade', '2010s')])))
add('R10', 'ranking', 'Who in the ACT Legislative Assembly speaks most about health?', async () =>
  ranking(await rankSpeakers([topic('health'), label('state', 'act')])))
// Party rankings
add('P01', 'ranking', 'Which party has made the most speeches about gambling since 2022?', async () =>
  ranking(await rankWindow('party', [topic('gambling')], '2022-01-01', null, 5, 20)))
add('P02', 'ranking', 'Which party has mentioned housing most in federal parliament since 2022?', async () =>
  ranking(await rankWindow('party', [topic('housing'), label('state', 'federal')], '2022-01-01', null, 5, 20), { coverage_caveat: true }), 'Window crosses the federal 2023-24 coverage gap.')
add('P03', 'ranking', 'Which party has made the most speeches about integrity and democracy in federal parliament?', async () =>
  ranking(await rankParties([topic('integrity-democracy'), label('state', 'federal')])))
add('P04', 'decline', 'Which parties speak most about agriculture in the NSW Parliament?', async () => {
  const r = await rankParties([topic('agriculture'), label('state', 'nsw')])
  return { kind: 'decline', reason: 'no_party_labels', party_labelled: r.top.reduce((s, x) => s + x.count, 0), total: r.total, query: r.query,
    method: 'NSW, Victorian, SA and ACT speeches carry no party label; a party ranking needs a roster join that the tools do not do yet. The right answer says so (answered: false or an explicit limit), never a ranking.' }
}, 'Expected behaviour: decline. A speaker ranking is acceptable alongside the limit.')
// Trends
add('T01', 'trend', 'Is gambling debated more in federal parliament this term than last term?', async () => {
  const w = async ([since, until]) => {
    const topicT = await searchTotal([SPEECH, CHAMBER_ONLY, label('state', 'federal'), topic('gambling'), created(since, until)])
    const labelled = await searchTotal([SPEECH, CHAMBER_ONLY, label('state', 'federal'), { prop: 'label', labelset: 'topic' }, created(since, until)])
    return { since, until, gambling: topicT.total, labelled: labelled.total, share: labelled.total ? +(topicT.total / labelled.total).toFixed(5) : 0, query: topicT.query }
  }
  const last = await w(TERM_47), now = await w(TERM_48)
  return { kind: 'numbers', coverage_caveat: true, numbers: [last.gambling, now.gambling], answer: now.share > last.share ? 'more (by share of labelled speeches)' : 'less (by share of labelled speeches)', last_term: last, this_term: now,
    method: '47th Parliament 2022-07-26..2025-03-28 vs 48th from 2025-07-22: gambling-labelled federal speeches and their share of topic-labelled speeches' }
}, 'Raw counts differ in window length; the share of labelled speeches is the like-for-like comparison.')
add('T02', 'trend', 'How has the number of speeches about housing changed since 2015?', async () => {
  const years = Array.from({ length: 12 }, (_, i) => 2015 + i)
  const rows = await pool(years, 4, async (y) => ({ year: y, count: (await searchTotal([SPEECH, CHAMBER_ONLY, topic('housing'), created(`${y}-01-01`, `${y}-12-31`)])).total }))
  const peak = [...rows].sort((a, b) => b.count - a.count)[0]
  return { kind: 'numbers', numbers: [rows[0].count, peak.count], peak_year: peak.year, years: rows, method: '/search body-only totals per calendar year, housing label, every parliament',
    query: { endpoint: 'POST /search', template: 'created <year>-01-01..<year>-12-31 + topic housing + kind speech + body field' } }
}, 'Coverage grows over the period (state sources join), so counts are not shares.')
add('T03', 'trend', 'Is climate change discussed more in the 2020s than in the 2010s?', async () => {
  const c = await catalog([SPEECH, CHAMBER_ONLY, topic('climate-environment')], [DECADE])
  const l = await catalog([SPEECH, CHAMBER_ONLY, { prop: 'label', labelset: 'topic' }], [DECADE])
  const get = (f, d) => f[DECADE]?.[`${DECADE}/${d}`] ?? 0
  const rows = ['2010s', '2020s'].map((d) => ({ decade: d, count: get(c.facets, d), labelled: get(l.facets, d), share: +(get(c.facets, d) / get(l.facets, d)).toFixed(5) }))
  return { kind: 'numbers', numbers: rows.map((r) => r.count), decades: rows, answer: rows[1].share > rows[0].share ? 'more by share' : 'less by share', method: 'catalog decade facet, climate-environment label; denominators = topic-labelled speeches per decade', query: c.query }
})
add('T04', 'trend', 'Which year had the most speeches about gambling?', async () => {
  const years = Array.from({ length: 34 }, (_, i) => 1993 + i)
  const rows = await pool(years, 4, async (y) => ({ year: y, count: (await searchTotal([SPEECH, CHAMBER_ONLY, topic('gambling'), created(`${y}-01-01`, `${y}-12-31`)])).total }))
  const peak = [...rows].sort((a, b) => b.count - a.count)[0]
  return { kind: 'numbers', numbers: [peak.count], years_expected: [peak.year], peak_year: peak.year, years: rows, method: '/search body-only totals per calendar year, gambling label, every parliament' }
})
add('T05', 'trend', 'How many speeches about immigration were made in federal parliament in 2024 compared with 2023?', async () => {
  const y = async (yr) => (await searchTotal([SPEECH, CHAMBER_ONLY, label('state', 'federal'), topic('immigration'), created(`${yr}-01-01`, `${yr}-12-31`)]))
  const a = await y(2023), b = await y(2024)
  return { kind: 'numbers', coverage_caveat: true, numbers: [b.total, a.total], y2023: a.total, y2024: b.total, query: b.query, method: '/search body-only totals per year' }
})
add('T06', 'trend', 'Did Andrew Wilkie speak more about gambling in the 2010s or the 2020s?', async () => {
  const c = await catalog([SPEECH, CHAMBER_ONLY, topic('gambling'), speaker('Andrew Wilkie')], [DECADE])
  const get = (d) => c.facets[DECADE]?.[`${DECADE}/${d}`] ?? 0
  return { kind: 'numbers', numbers: [get('2010s'), get('2020s')], names: ['Andrew Wilkie'], answer: get('2010s') > get('2020s') ? '2010s' : '2020s', query: c.query, method: 'catalog decade facet for one speaker' }
})
// Votes vs words
const speechCount = async (clauses) => (await catalog([SPEECH, MEMBERS, CHAMBER_ONLY, ...clauses])).total
add('C01', 'comparison', 'How did Andrew Wilkie vote on gambling bills compared with what he said about gambling?', async () => {
  const v = personVotes('Andrew Wilkie', (d) => GAMBLING_DIVISION.test(divisionText(d)))
  const s = await speechCount([topic('gambling'), speaker('Andrew Wilkie')])
  return { kind: 'comparison', names: ['Andrew Wilkie'], numbers: [v.aye, v.no, s], votes: v, speeches: s, method: 'division files matching /gambl|wagering|betting|poker machine|pokies/ in the division or bill name; speeches = gambling label' }
})
add('C02', 'comparison', 'How did David Pocock vote on the Interactive Gambling Amendment (Gambling Reform) Bill 2026, and how often has he spoken about gambling?', async () => {
  const v = personVotes('David Pocock', (d) => (d.bills ?? []).some((b) => b?.key === 'au-federal-r7520'))
  const s = await speechCount([topic('gambling'), speaker('David Pocock')])
  return { kind: 'comparison', names: ['David Pocock'], numbers: [v.aye, v.no, s], votes: v, speeches: s, method: 'divisions linked to bill au-federal-r7520' }
})
add('C03', 'comparison', 'How did Sarah Hanson-Young vote on gambling legislation versus what she said about it?', async () => {
  const v = personVotes('Sarah Hanson-Young', (d) => GAMBLING_DIVISION.test(divisionText(d)))
  const s = await speechCount([topic('gambling'), speaker('Sarah Hanson-Young')])
  return { kind: 'comparison', names: ['Sarah Hanson-Young'], numbers: [v.aye, v.no, s], votes: v, speeches: s, method: 'division files matching /gambl|wagering|betting|poker machine|pokies/ in the division or bill name; speeches = gambling label' }
})
add('C04', 'comparison', 'How did the Greens vote on gambling divisions compared with how often they spoke about gambling?', async () => {
  const v = partyVotes('Greens', (d) => GAMBLING_DIVISION.test(divisionText(d)))
  const s = (await catalog([SPEECH, CHAMBER_ONLY, topic('gambling'), label('party', 'Greens')])).total
  return { kind: 'comparison', names: ['Greens'], numbers: [v.all_aye, v.all_no, s], votes: v, speeches: s, method: 'per division: Greens all aye / all no / split among those present' }
})
add('C05', 'comparison', 'Compare how often Peter Dutton and Anthony Albanese spoke about immigration.', async () => {
  const d = await speechCount([topic('immigration'), speaker('Peter Dutton')])
  const a = await speechCount([topic('immigration'), speaker('Anthony Albanese')])
  return { kind: 'comparison', names: ['Peter Dutton', 'Anthony Albanese'], numbers: [d, a], dutton: d, albanese: a, method: 'catalog totals, immigration label, per speaker' }
})
// Money joins (federal AEC returns, so federal speeches)
add('M01', 'money', 'Who donated most to the party whose MPs made the most speeches about gambling?', async () => {
  const p = await rankParties([topic('gambling'), label('state', 'federal')], 3)
  const party = p.top[0].name
  return { kind: 'money', party, names: [party], party_ranking: p.top, numbers: [p.top[0].count], donors: topDonors(party), method: 'federal gambling speeches by party (catalog), then donors to that party (money.json)', query: p.query }
}, 'Federal speeches, because the money graph is federal AEC returns.')
add('M02', 'money', 'Which donors gave the most to the party that made the most federal speeches about mining and energy?', async () => {
  const p = await rankParties([topic('mining-energy'), label('state', 'federal')], 3)
  const party = p.top[0].name
  return { kind: 'money', party, names: [party], party_ranking: p.top, numbers: [p.top[0].count], donors: topDonors(party), query: p.query }
})
add('M03', 'money', "How much did gambling-industry donors give to each party, and which party's MPs spoke most about gambling?", async () => {
  const ind = industryByParty('gambling')
  const p = await rankParties([topic('gambling'), label('state', 'federal')], 3)
  return { kind: 'money', party: p.top[0].name, names: [ind.rows[0].party, p.top[0].name], industry: ind, party_ranking: p.top, numbers: [p.top[0].count], amounts: ind.rows.slice(0, 2).map((r) => r.total_aud) }
})
add('M04', 'money', 'Who donated most to the party of the federal MP who made the most speeches about housing?', async () => {
  const r = await rankSpeakers([topic('housing'), label('state', 'federal')], 3)
  const mp = r.top[0].name
  const pc = await catalog([SPEECH, CHAMBER_ONLY, topic('housing'), speaker(mp)], [PARTY])
  const party = facetRows(pc.facets[PARTY], PARTY)[0]?.name
  return { kind: 'money', party, names: [mp, party], speaker_ranking: r.top, numbers: [r.top[0].count], donors: topDonors(party), query: r.query, method: "top federal housing speaker; party = the party label on that speaker's housing speeches" }
})
add('M05', 'money', 'Which party received the most from mining-industry donors, and how many federal speeches about mining and energy have its MPs made since 2022?', async () => {
  const ind = industryByParty('mining')
  const party = ind.rows[0].party
  const s = await searchTotal([SPEECH, CHAMBER_ONLY, label('state', 'federal'), topic('mining-energy'), label('party', party), created('2022-01-01', null)])
  return { kind: 'money', coverage_caveat: true, party, names: [party], industry: ind, numbers: [s.total], amounts: [ind.rows[0].total_aud], speeches_since_2022: s.total, query: s.query }
})

// ---- coverage notes every answer must be able to state ----
async function coverage() {
  const all = await catalog([SPEECH], [DECADE])
  const labelled = await catalog([SPEECH, { prop: 'label', labelset: 'topic' }], [DECADE])
  const years = Array.from({ length: 8 }, (_, i) => 2019 + i)
  const federal = await pool(years, 4, async (y) => [y, (await searchTotal([SPEECH, CHAMBER_ONLY, label('state', 'federal'), created(`${y}-01-01`, `${y}-12-31`)])).total])
  return {
    speeches: all.total, topic_labelled: labelled.total,
    federal_chamber_speeches_by_year: Object.fromEntries(federal),
    federal_gap: 'Federal chamber Hansard from mid-2022 to mid-2025 is thin in the source data itself (parli.db: Wilkie 14 speeches in 2023, 1 in 2024), not only in the KB.',
    by_decade: Object.fromEntries(['1990s', '2000s', '2010s', '2020s'].map((d) => [d, {
      speeches: all.facets[DECADE]?.[`${DECADE}/${d}`] ?? 0, labelled: labelled.facets[DECADE]?.[`${DECADE}/${d}`] ?? 0,
    }])),
  }
}

const t0 = Date.now()
const questions = []
for (const q of Q) {
  const expected = await q.compute()
  questions.push({ id: q.id, category: q.category, question: q.question, note: q.note || undefined, expected })
  process.stderr.write(`${q.id} ${expected.kind} ${JSON.stringify(expected.top?.slice(0, 3) ?? expected.numbers)}\n`)
}
const out = {
  schema: 1,
  generated: new Date().toISOString(),
  kb_calls: calls,
  definitions: {
    speech: 'a KB resource labelled kind/speech (one Hansard or committee contribution)',
    about_topic: 'carries the OPAX topic label (21-topic enrichment classifier); not every speech is labelled, see coverage',
    members_only: 'speaker rankings exclude committee witnesses (speaker_type/witness)',
    chamber_speeches: 'a speech is a chamber record; committee-hearing turns (senate_committee, joint_committee, house_committee) are counted separately because each question-and-answer turn is its own record',
    speaker: 'the resource collaborator name (one per speech); see attribution notes',
    period: 'exact speech dates via /search created filter; decades via the decade label',
    parliaments: 'every parliament in the record unless the question names one (federal, NSW, Victoria, SA, Queensland, ACT)',
    terms: { '47th': TERM_47, '48th': TERM_48 },
    money: 'federal AEC donation returns (portal/public/graph/money.json, top 250 donors); individual donors not named are aggregated, never ranked by name',
  },
  coverage: await coverage(),
  attribution_note: 'data-speaker-attribution-check (12 Oct 2026): 16,909 KB speech documents carry several speakers\' words under one MP (OpenAustralia legacy markup), mostly OpenAustralia-sourced federal House and Senate debate. Sample error rates: Wilkie 13.3%, Hanson-Young 20.0%, Bandt 3.3%, Katter 3.3%, Wong 3.3%. Committee-hearing and state records come from other parsers.',
  questions,
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
process.stderr.write(`wrote ${path.relative(ROOT, OUT)}: ${questions.length} questions, ${calls} KB calls, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`)
