// node --test portal/test/grants.test.mjs
// The pure data layer of grants.js: filters, sorting, window re-summing, the
// government-of-the-day share and the CSV.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCSV, donorBlocs, donorSummary, filterElectorates, filterPrograms, filterRecipients, fmtMoney,
  fileKey, formatABN, fyShort, fyStart, govBlocAt, govShare, latestMargin, sortRows, windowTotals, yearSpan,
} from '../public/grants.js'

const agencies = ['Department of Health', 'Department of Infrastructure']
const years = ['2018-19', '2019-20', '2020-21', '2021-22', '2022-23']
const recipients = [
  { id: 'abn:1', f: 'abn-1', n: 'Alpha Care Ltd', k: 'company', t: 500, c: 5, y0: '2018-19', y1: '2022-23',
    ag: [0], by: [[100, 1], 0, [200, 2], 0, [200, 2]], adhoc: 50,
    d: { e: 'alpha', n: 'Alpha Care', m: 'abn', aec: 30000, p: { Labor: 20000, Liberal: 10000 }, st: { qld: { t: 5000, c: 2, p: { LNP: 5000 } } } } },
  { id: 'abn:2', f: 'abn-2', n: 'Beta Shire Council', k: 'council', t: 900, c: 3, y0: '2019-20', y1: '2019-20',
    ag: [1], by: [0, [900, 3], 0, 0, 0], adhoc: 0 },
  { id: 'person:x', f: 'person-x', n: 'Jane Citizen', k: 'individual', t: 20, c: 1, y0: '2021-22', y1: '2021-22',
    ag: [0], by: [0, 0, 0, [20, 1], 0], adhoc: 20 },
]
const government = [['2013-09-18', '2022-05-23', 'Coalition'], ['2022-05-23', null, 'Labor']]
const blocs = { Liberal: 'Coalition', Nationals: 'Coalition', LNP: 'Coalition', Labor: 'Labor' }

test('formatting helpers', () => {
  assert.equal(fmtMoney(1_250_000_000), '$1.25B')
  assert.equal(fmtMoney(3_400_000), '$3.4M')
  assert.equal(fmtMoney(12_500), '$13K')
  assert.equal(fmtMoney(0), '$0')
  assert.equal(fyStart('2023-24'), 2023)
  assert.equal(fyShort('2023-24'), '23–24')
  assert.equal(formatABN('12131678727'), '12 131 678 727')
  assert.equal(fileKey('abn:12131678727'), 'abn-12131678727')
  assert.equal(fileKey('name:the twyford hall complex'), 'name-the-twyford-hall-complex')
  assert.equal(fileKey('person:jane citizen'), 'person-jane-citizen')
  assert.deepEqual(yearSpan([0, [1, 1], 0, [2, 1], 0], years), { y0: '2019-20', y1: '2021-22' })
})

test('windowTotals re-sums from the year cells', () => {
  const all = windowTotals(recipients[0], null, null, years)
  assert.deepEqual(all, { t: 500, c: 5, y0: '2018-19', y1: '2022-23' })
  const w = windowTotals(recipients[0], 2020, 2021, years)
  assert.deepEqual(w, { t: 200, c: 2, y0: '2020-21', y1: '2020-21' })
  const none = windowTotals(recipients[1], 2021, 2022, years)
  assert.equal(none.c, 0)
})

test('filterRecipients: donors only, kind, agency, text, year window, min', () => {
  const ctx = { agencies, years }
  const base = { q: '', kind: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0 }
  assert.equal(filterRecipients(recipients, base, ctx).length, 3)
  assert.deepEqual(filterRecipients(recipients, { ...base, donors: true }, ctx).map((r) => r.id), ['abn:1'])
  assert.deepEqual(filterRecipients(recipients, { ...base, kind: 'council' }, ctx).map((r) => r.id), ['abn:2'])
  assert.deepEqual(filterRecipients(recipients, { ...base, agency: '1' }, ctx).map((r) => r.id), ['abn:2'])
  assert.deepEqual(filterRecipients(recipients, { ...base, q: 'infrastructure' }, ctx).map((r) => r.id), ['abn:2'])
  assert.deepEqual(filterRecipients(recipients, { ...base, q: 'alpha care' }, ctx).map((r) => r.id), ['abn:1'])
  const windowed = filterRecipients(recipients, { ...base, yearFrom: 2020, yearTo: 2021 }, ctx)
  assert.deepEqual(windowed.map((r) => [r.id, r.wt]), [['abn:1', 200], ['person:x', 20]])
  assert.deepEqual(filterRecipients(recipients, { ...base, min: 600 }, ctx).map((r) => r.id), ['abn:2'])
})

test('donorSummary picks the top party and keeps state money apart', () => {
  const s = donorSummary(recipients[0].d)
  assert.equal(s.aec, 30000)
  assert.equal(s.state, 5000)
  assert.equal(s.topParty, 'Labor')
  assert.equal(Math.round(s.topShare * 100), 67)
  assert.equal(donorSummary(null), null)
})

test('sortRows: numbers biggest-first with a name tiebreak, text A–Z, donor column', () => {
  const ctx = { agencies, years }
  const rows = filterRecipients(recipients, { q: '', kind: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0 }, ctx)
  assert.deepEqual(sortRows(rows, 't', 'desc').map((r) => r.id), ['abn:2', 'abn:1', 'person:x'])
  assert.deepEqual(sortRows(rows, 'n', 'asc').map((r) => r.n), ['Alpha Care Ltd', 'Beta Shire Council', 'Jane Citizen'])
  assert.deepEqual(sortRows(rows, 'donor', 'desc').map((r) => r.id)[0], 'abn:1')
  assert.deepEqual(sortRows(rows, 'years', 'asc').map((r) => r.id), ['abn:1', 'abn:2', 'person:x'])
})

test('programs and electorates filter and carry a donor share', () => {
  const programs = [
    { id: 'GO1', n: 'Home Support', ag: 0, t: 1000, c: 10, r: 4, dt: 250, dr: 1, adhoc: 0, y0: '2019-20', y1: '2021-22' },
    { id: 'GO2', n: 'Roads', ag: 1, t: 400, c: 2, r: 2, dt: 0, dr: 0, adhoc: 400, y0: '2023-24', y1: '2023-24' },
  ]
  const base = { q: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0 }
  assert.equal(filterPrograms(programs, base, { agencies })[0].share, 0.25)
  assert.deepEqual(filterPrograms(programs, { ...base, donors: true }, { agencies }).map((p) => p.id), ['GO1'])
  assert.deepEqual(filterPrograms(programs, { ...base, yearFrom: 2023 }, { agencies }).map((p) => p.id), ['GO2'])
  const electorates = [
    { n: 'Leichhardt', st: 'qld', t: 800, c: 8, r: 5, dt: 400, dr: 2, adhoc: 100,
      mps: [['Warren Entsch', 'Liberal', '1998-03-11', '2025-02-10']], margin: { 2019: [4.2, 'Liberal', 'fairly_safe'], 2022: [3.44, 'Liberal', 'fairly_safe'] } },
    { n: 'Dickson', st: 'qld', t: 100, c: 1, r: 1, dt: 0, dr: 0, adhoc: 0, mps: [], margin: {} },
  ]
  const e = filterElectorates(electorates, { q: 'entsch', donors: false, min: 0 })
  assert.equal(e.length, 1)
  assert.equal(e[0].share, 0.5)
  assert.deepEqual(e[0].marginLatest, { year: '2022', pct: 3.44, party: 'Liberal', type: 'fairly_safe' })
  assert.equal(latestMargin({}), null)
  const byMargin = sortRows(filterElectorates(electorates, { q: '', donors: false, min: 0 }), 'margin', 'asc')
  assert.equal(byMargin[0].n, 'Leichhardt') // a missing margin sorts last
})

test('government of the day and the donor share of grant dollars', () => {
  assert.equal(govBlocAt(government, '2019-07-01'), 'Coalition')
  assert.equal(govBlocAt(government, '2022-05-23'), 'Labor')
  assert.equal(govBlocAt(government, '2010-01-01'), null)
  const b = donorBlocs(recipients[0].d, blocs)
  assert.equal(b.get('Coalition'), 15000) // Liberal AEC + LNP state gift
  assert.equal(b.get('Labor'), 20000)
  const grants = [{ v: 100, s: '2019-01-01' }, { v: 300, s: '2023-01-01' }, { v: 50, fy: '2020-21' }]
  const only = govShare(grants, government, new Set(['Labor']))
  assert.equal(only.dollars, 300)
  assert.equal(only.total, 450)
  assert.equal(Math.round(only.share * 100), 67)
  const both = govShare(grants, government, new Set(['Labor', 'Coalition']))
  assert.equal(both.dollars, 450)
})

test('buildCSV: comment header, one row per recipient, money as integers', () => {
  const ctx = { agencies, years }
  const rows = filterRecipients(recipients, { q: '', kind: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0 }, ctx)
  const csv = buildCSV('recipients', sortRows(rows, 't', 'desc'), ctx, ['OPAX test', 'floor not ceiling'])
  const lines = csv.trim().split('\r\n')
  assert.equal(lines[0], '# OPAX test')
  assert.match(lines[2], /^Recipient,Kind,Recipient id,Awarded \(AUD\)/)
  assert.equal(lines.length, 3 + 3)
  assert.match(lines[3], /^Beta Shire Council,Local council,abn:2,900,3,2019-20,2019-20,Department of Infrastructure,0,,,,$/)
  assert.match(lines[4], /^Alpha Care Ltd,Company,abn:1,500,5,2018-19,2022-23,Department of Health,50,Alpha Care,30000,Labor,5000$/)
})
