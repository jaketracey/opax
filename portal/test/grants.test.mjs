// node --test portal/test/grants.test.mjs
// The pure data layer of grants.js: filters, sorting, window re-summing, the
// government-of-the-day share and the CSV.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  APPROVAL_BUCKETS, MARGIN_BUCKETS, SEAT_BLOCS, TIMING_BUCKETS, bucketRows,
  buildCSV, donorBlocs, donorSummary, filterElectorates, filterPrograms, filterRecipients, fmtMoney,
  fileKey, formatABN, fyShort, fyStart, govBlocAt, govShare, grantConnectUrl, grantDate, latestMargin,
  programByName, programKey, programShares, shareOf, sortRows, viewColumns, windowTotals, yearSpan,
} from '../public/grants.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const programFile = fixture('grants-program-go3141.json')   // contract section 1
const programIndex = fixture('grants-index-programs.json')  // contract section 2: programs[] rows

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

// ---- program files (contract 2026-09-13) ----------------------------------

test('programKey mirrors the exporter: lowercase, non-alphanumerics to dashes, trimmed, at most 80', () => {
  assert.equal(programKey('GO3141'), 'go3141')
  assert.equal(programKey('activity:Some title'), 'activity-some-title')
  assert.equal(programKey('  Regional Economic Futures Fund (2021) '), 'regional-economic-futures-fund-2021')
  assert.equal(programKey(''), '')
  const long = programKey('x'.repeat(70) + ' ' + 'y'.repeat(30))
  assert.ok(long.length <= 80)
  assert.ok(!long.endsWith('-'))
  assert.equal(programKey(programFile.id), programFile.key)
  for (const p of programIndex.programs.filter((r) => r.key)) assert.equal(programKey(p.id), p.key)
})

test('shareOf and programShares: null when the base is not recorded, gov null off the federal file', () => {
  assert.equal(shareOf(1, 0), null)
  assert.equal(shareOf(0, 0), null)
  assert.equal(shareOf(null, 10), 0)
  assert.equal(shareOf(3, 4), 0.75)
  const [cdg, phn, activity, legacy] = programIndex.programs
  const s = programShares(cdg)
  assert.equal(Math.round(s.cnc * 1000), Math.round(5650000 / 8250000 * 1000))
  assert.equal(Math.round(s.gov * 1000), Math.round(550000 / 8200000 * 1000))
  assert.equal(programShares(phn).cnc, null)          // selk 0: the column shows a dash, never 0%
  assert.equal(programShares(phn).gov, 0.25)
  assert.equal(programShares(activity).gov, null)     // elk 0
  assert.deepEqual(programShares(legacy), { cnc: null, gov: null })  // an index without the new fields
  assert.deepEqual(programShares(programIndex.qldPrograms[0]), { cnc: 1, gov: null })
})

test('filterPrograms carries the two new shares and sortRows orders on them with unknowns last', () => {
  const ctx = { agencies: programIndex.agencies }
  const base = { q: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0 }
  const rows = filterPrograms(programIndex.programs, base, ctx)
  assert.equal(rows.length, 4)
  const cdg = rows.find((r) => r.id === 'GO3141')
  assert.ok(cdg.cncS > 0.68 && cdg.cncS < 0.69)
  assert.equal(rows.find((r) => r.id === 'GO2').cncS, null)
  // the two without a recorded selection process tie and fall back to the name sort
  assert.deepEqual(sortRows(rows, 'cnc', 'desc').map((r) => r.id), ['activity:Some Title', 'GO3141', 'GO9', 'GO2'])
  assert.deepEqual(sortRows(rows, 'cnc', 'asc').map((r) => r.id), ['GO9', 'GO2', 'GO3141', 'activity:Some Title'])
  assert.deepEqual(sortRows(rows, 'gov', 'desc').map((r) => r.id), ['GO2', 'GO3141', 'GO9', 'activity:Some Title'])
  // the existing filters still apply to the new rows
  assert.deepEqual(filterPrograms(programIndex.programs, { ...base, q: 'health' }, ctx).map((r) => r.id), ['GO2', 'activity:Some Title'])
})

test('viewColumns: the seat column is federal only', () => {
  assert.deepEqual(viewColumns('programs', 'federal').map((c) => c.key), ['n', 'agency', 't', 'c', 'r', 'share', 'cnc', 'gov', 'adhoc'])
  assert.deepEqual(viewColumns('programs', 'qld').map((c) => c.key), ['n', 'agency', 't', 'c', 'r', 'share', 'cnc', 'adhoc'])
  assert.equal(viewColumns('recipients', 'qld').length, viewColumns('recipients', 'federal').length)
})

test('programByName links a recipient file\'s program names only to rows that have a file', () => {
  const m = programByName(programIndex.programs)
  assert.equal(m.get('Community Development Grants').id, 'GO3141')
  assert.equal(m.get('Community Development Grants').key, 'go3141')
  assert.equal(m.has('Legacy row without a key'), false)
  assert.equal(programByName(null).size, 0)
})

test('bucketRows keeps the contract order, shares of the bucket total, and skips missing keys', () => {
  const seats = bucketRows(programFile.seats, SEAT_BLOCS)
  assert.deepEqual(seats.map((b) => b.key), ['gov', 'opp', 'cross', 'unknown'])
  assert.deepEqual(seats.map((b) => b.d), [550000, 2200000, 5450000, 300000])
  assert.equal(Math.round(seats.reduce((s, b) => s + b.share, 0) * 1000), 1000)
  assert.equal(seats[0].label, 'Government-held seats')
  const margins = bucketRows(programFile.margins, MARGIN_BUCKETS)
  assert.deepEqual(margins.map((b) => [b.key, b.c]), [['marginal', 1], ['fairly_safe', 2], ['safe', 7], ['unknown', 2]])
  const timing = bucketRows(programFile.timing.months_to_election, TIMING_BUCKETS)
  assert.deepEqual(timing.map((b) => b.key), ['0_3', '3_6', '6_12', '12_24', 'over_24', 'unknown'])
  assert.equal(timing[2].d, 0)                      // an empty bucket stays, so the reader sees the zero
  assert.equal(timing[2].share, 0)
  const approval = bucketRows(programFile.timing.approval_to_start_days, APPROVAL_BUCKETS)
  assert.equal(approval.reduce((s, b) => s + b.d, 0), programFile.timing.approval_known[0])
  assert.deepEqual(bucketRows({ safe: [10, 1] }, MARGIN_BUCKETS).map((b) => b.key), ['safe'])
  assert.deepEqual(bucketRows(null, MARGIN_BUCKETS), [])   // QLD: seats/margins null, render nothing
  const sel = bucketRows(programFile.sel, Object.keys(programFile.sel).map((k) => [k, k]))
  assert.equal(sel[0].label, 'Closed Non-Competitive')
  assert.equal(Math.round(sel[0].share * 100), Math.round(5650000 / 8250000 * 100))
})

test('the fixture honours the contract: totals reconcile and the pre-2019 grant has no margin', () => {
  const sum = (o) => Object.values(o).reduce((s, x) => s + x[0], 0)
  assert.equal(programFile.grants.reduce((s, g) => s + g.v, 0), programFile.t)
  assert.equal(sum(programFile.by), programFile.t)
  assert.equal(sum(programFile.seats), programFile.t)
  assert.equal(sum(programFile.margins), programFile.t)
  assert.equal(sum(programFile.timing.months_to_election), programFile.t)
  assert.equal(sum(programFile.sel), programFile.sel_known[0])
  assert.equal(programFile.electorates.reduce((s, e) => s + e.t, 0), programFile.el_known[0])
  const pre2019 = programFile.grants.find((g) => g.id === 'GA1002')
  assert.ok(grantDate(pre2019) < '2019-05-18')
  assert.equal(pre2019.mt, null)
  const unknown = programFile.grants.find((g) => g.el == null)
  assert.equal(unknown.bloc, 'unknown')
  assert.equal(unknown.holder, null)
  assert.equal(grantDate({ s: null, a: '2023-01-01' }), '2023-01-01')
  assert.equal(grantDate({}), '')
  assert.equal(grantConnectUrl('d276a0ae-c1e7-cb68-3393-4be19b8777b0'), 'https://www.grants.gov.au/Ga/Show/d276a0ae-c1e7-cb68-3393-4be19b8777b0')
  assert.equal(grantConnectUrl(null), null)
})

test('buildCSV program view: one row per grant with seat, holder, margin and the GrantConnect link', () => {
  const csv = buildCSV('program', programFile.grants, { agencies: programIndex.agencies }, ['OPAX test'])
  const lines = csv.trim().split('\r\n')
  assert.equal(lines[0], '# OPAX test')
  assert.equal(lines[1], 'Grant id,Title,Recipient,Recipient id,Recipient kind,Value (AUD),Financial year,Start date,Approval date,Selection process,Electorate,State,Seat holder,Holder party,Seat bloc,Seat margin,Ad hoc or one-off,GrantConnect')
  assert.equal(lines.length, 2 + 12)
  assert.equal(lines[2], 'GA1001,Kennedy showground upgrade,Kennedy Showground Trust,abn:11000000011,Trust,2000000,2019-20,2019-11-04,2019-10-01,Closed Non-Competitive,Kennedy,QLD,Bob Katter,Katter\'s Australian Party,cross,safe,0,https://www.grants.gov.au/Ga/Show/11111111-0000-0000-0000-000000001001')
  // nulls stay empty, quoting survives, the ad hoc flag is 0/1
  assert.match(lines[3], /^GA1002,.*,2019-02-01,Closed Non-Competitive,Lingiari,NT,Warren Snowdon,Labor,opp,,0,/)
  assert.match(lines[8], /^GA1007,"Mareeba memorial hall, ""stage two""",/)
  assert.match(lines[9], /^GA1008,.*,2023-10-01,,Closed Non-Competitive,Lingiari,NT,Marion Scrymgour,Labor,gov,fairly_safe,1,/)
  assert.match(lines[11], /^GA1010,.*,Closed Non-Competitive,,,,,unknown,,0,/)
  // a QLD-shaped row: no guid, no holder
  const qld = buildCSV('program', [{ id: 'q1', v: 5000, n: 'Shed', rid: 'name:shed', rn: 'Shed Inc', k: 'company', fy: '2021-22', s: '2021-08-01', a: null, sel: 'Closed Non-Competitive', el: 'Kennedy', elst: 'qld', holder: null, bloc: 'unknown', mt: null, adhoc: 0, guid: null }], {}, [])
  assert.equal(qld.trim().split('\r\n')[1], 'q1,Shed,Shed Inc,name:shed,Company,5000,2021-22,2021-08-01,,Closed Non-Competitive,Kennedy,QLD,,,unknown,,0,')
})

test('buildCSV programs view carries the new columns and blanks them on an index without them', () => {
  const ctx = { agencies: programIndex.agencies }
  const rows = filterPrograms(programIndex.programs, { q: '', agency: '', donors: false, yearFrom: null, yearTo: null, min: 0 }, ctx)
  const lines = buildCSV('programs', sortRows(rows, 't', 'desc'), ctx, []).trim().split('\r\n')
  assert.match(lines[0], /^Program,Program id,Agency,.*Closed non-competitive \(AUD\),Selection process recorded \(AUD\),Closed non-competitive share \(%\),To government-held seats \(AUD\),Electorate mapped \(AUD\),To government-held seats share \(%\),First year,Last year$/)
  assert.equal(lines[1], 'Community Development Grants,GO3141,Department of Infrastructure, Transport, Regional Development, Communications and the Arts,8500000,12,9,900000,11,450000,5650000,8250000,68,550000,8200000,7,2018-19,2025-26'.replace('Department of Infrastructure, Transport, Regional Development, Communications and the Arts', '"Department of Infrastructure, Transport, Regional Development, Communications and the Arts"'))
  assert.match(lines[2], /^Primary Health Networks,GO2,.*,0,0,0,0,,1000000,4000000,25,2020-21,2021-22$/)
  assert.match(lines[4], /^Legacy row without a key,GO9,.*,0,,,,,,,2016-17,2016-17$/)
})
