// The grants files behind the daily edition's program and largest kinds (scripts/social_grants_lib.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonParty, partyGroup, governmentOn, seatTimelines, holderOn, houseShares, programSeatSplit, programEligible,
  programEra, programRecord, monthComplete, largestByMonth, wholePercents, PARTY_GROUPS,
} from '../../scripts/social_grants_lib.mjs';

const blocs = { Liberal: 'Coalition', Nationals: 'Coalition', LNP: 'Coalition', 'Country Liberal Party': 'Coalition', Labor: 'Labor' };
const government = [['2013-09-18', '2022-05-23', 'Coalition'], ['2022-05-23', null, 'Labor']];
const meta = { blocs, government };

/** An electorates-release detail file: service terms with dated party periods, and AEC contests. */
function detail(name, terms, contests = []) {
  const people = {};
  const t = terms.map(([person, periods], i) => { people[`p${name}${i}`] = { name: person }; return { person_id: `p${name}${i}`, party_periods: periods.map(([party, start, end]) => ({ party, start, end })) }; });
  const elections = contests.map(([day, party, person], i) => ({ contest_id: `c${name}${i}`, election: { poll_date: day }, candidates: [{ name: person, party, elected: true }, { name: 'Loser', party: 'Other', elected: false }] }));
  return { jurisdiction: 'federal', chamber: 'representatives', name, people, terms: t, elections, contests: elections };
}
// Calare: a Nationals member who became an independent on 23 Dec 2022 (the Gee case).
// New England: Nationals, then One Nation from 8 Dec 2025 (the Joyce case).
// Dunkley: vacant between a death on 15 Dec 2023 and the by-election on 2 Mar 2024.
// Fisher: no service record at all; the AEC winner fills it.
const details = [
  detail('Calare', [['Andrew Gee', [['Nationals', '2016-07-02', '2022-12-23'], ['Independent', '2022-12-23', null]]]]),
  detail('New England', [['Barnaby Joyce', [['Nationals', '2017-12-02', '2025-11-27'], ['Independent', '2025-11-27', '2025-12-08'], ['One Nation', '2025-12-08', null]]]]),
  detail('Dunkley', [['Peta Murphy', [['Labor', '2019-05-18', '2023-12-15']]], ['Jodie Belyea', [['Labor', '2024-03-02', null]]]], [['2022-05-21', 'Labor', 'Peta Murphy']]),
  detail('Fisher', [], [['2019-05-18', 'Liberal National Party of Queensland', 'Andrew Wallace'], ['2025-05-03', 'Labor', 'Someone Else']]),
  detail('Grayndler', [['Anthony Albanese', [['Labor', '1996-03-02', null]]]]),
  { jurisdiction: 'nsw', chamber: 'assembly', name: 'Not Federal', terms: [], elections: [] },
];
const seats = seatTimelines(details);

test('party spellings from the release and the grants files are one party each', () => {
  assert.equal(canonParty('Liberal National Party of Queensland'), 'LNP');
  assert.equal(canonParty('Australian Labor Party (Northern Territory) Branch'), 'Labor');
  assert.equal(canonParty('A.L.P.'), 'Labor');
  assert.equal(canonParty('The Greens (VIC)'), 'Greens');
  assert.equal(canonParty("Katter's Australian Party (KAP)"), "Katter's Australian Party");
  assert.equal(canonParty('CA'), 'Centre Alliance');
  assert.equal(canonParty('PHON'), 'One Nation');
  assert.equal(partyGroup('Liberal National Party of Queensland', blocs), 'Coalition');
  assert.equal(partyGroup('Labor', blocs), 'Labor');
  assert.equal(partyGroup('Independent', blocs), 'Crossbench');
  assert.equal(partyGroup('Greens', blocs), 'Crossbench');
  assert.equal(partyGroup(null, blocs), null);
  assert.deepEqual(PARTY_GROUPS, ['Labor', 'Coalition', 'Crossbench']);
  assert.equal(governmentOn('2021-06-01', government), 'Coalition');
  assert.equal(governmentOn('2022-05-23', government), 'Labor');
  assert.equal(governmentOn('2012-01-01', government), null);
});

test('the seat holder\'s party is the one they belonged to on the day, not the one they belong to now', () => {
  assert.ok(!seats.has('not federal'));
  assert.deepEqual(holderOn(seats.get('calare'), '2021-03-01'), { person: 'Andrew Gee', party: 'Nationals' });
  assert.deepEqual(holderOn(seats.get('calare'), '2023-03-01'), { person: 'Andrew Gee', party: 'Independent' });
  assert.equal(holderOn(seats.get('new england'), '2021-03-01').party, 'Nationals', 'a later switch does not rewrite the past');
  assert.equal(holderOn(seats.get('new england'), '2026-03-01').party, 'One Nation');
  assert.equal(holderOn(seats.get('dunkley'), '2024-01-10'), null, 'a vacancy is nobody\'s seat');
  assert.equal(holderOn(seats.get('dunkley'), '2024-04-01').person, 'Jodie Belyea');
  assert.deepEqual(holderOn(seats.get('fisher'), '2021-01-01'), { person: 'Andrew Wallace', party: 'LNP' }, 'the AEC result fills a seat with no service record');
  assert.equal(holderOn(seats.get('fisher'), '2025-06-01').party, 'Labor');
  assert.equal(holderOn(seats.get('fisher'), '2018-01-01'), null, 'before the first result on record');
});

test('the House on a day is counted from the same records, and too few seats says nothing', () => {
  const day = houseShares(seats, '2021-03-01', blocs, 1);
  assert.equal(day.n, 5);
  assert.deepEqual(day.shares, { Labor: 2 / 5, Coalition: 3 / 5, Crossbench: 0 });
  assert.equal(houseShares(seats, '2021-03-01', blocs), null, 'the default floor wants a whole House');
});

/** A program file with every award listed. */
const program = (grants, extra = {}) => ({
  jur: 'federal', id: 'GO1', key: 'go1', n: 'Test Program', t: grants.reduce((s, g) => s + g.v, 0), c: grants.length, r: grants.length,
  cats: [['Regional Development', 1]], grants, grants_listed: grants.length, grants_total: grants.length,
  sel: { 'Closed Non-Competitive': [1, 1] }, sel_known: [1, 1],
  recipients: grants.map((g, i) => [`abn:${String(i).padStart(11, '0')}`, `Council ${i}`, 'council', g.v, 1]), ...extra,
});

test('a program\'s dollars are split by the party holding the seat on each grant\'s date, against the House that day', () => {
  const p = program([
    { v: 100, el: 'Calare', elst: 'nsw', s: '2021-03-01' },       // Nationals then: Coalition, government
    { v: 300, el: 'Calare', elst: 'nsw', s: '2023-03-01' },       // Independent then: crossbench
    { v: 200, el: 'New England', elst: 'nsw', s: '2021-06-01' },  // Nationals then, One Nation now
    { v: 400, el: 'Grayndler', elst: 'nsw', a: '2021-06-01' },    // approval date when there is no start
    { v: 50, el: 'Dunkley', elst: 'vic', s: '2024-01-10' },       // vacant: not placed
    { v: 70, el: 'Nowhere', s: '2021-06-01' },                    // unknown seat: not placed
    { v: 30, s: '2021-06-01' },                                   // no seat: not placed
  ]);
  const memo = new Map();
  const split = programSeatSplit(p, seats, meta, { memo, minSeats: 1 });
  // houseShares' default floor is a whole House; this fixture has five seats, so the split has nothing to weigh.
  assert.equal(split, null);
  const small = new Map([...seats]);
  const split5 = programSeatSplit(p, small, meta, { memo: new Map([['2021-03-01', houseShares(seats, '2021-03-01', blocs, 1)], ['2023-03-01', houseShares(seats, '2023-03-01', blocs, 1)], ['2021-06-01', houseShares(seats, '2021-06-01', blocs, 1)]]) });
  assert.deepEqual(split5.mapped, [1000, 4]);
  assert.deepEqual(split5.groups, { Labor: [400, 1], Coalition: [300, 2], Crossbench: [300, 1] });
  assert.deepEqual(split5.blocSplit, { gov: [300, 2], opp: [400, 1], cross: [300, 1] }, 'government and opposition read on each grant\'s date');
  assert.deepEqual(split5.governed, { Coalition: 800, Labor: 350 }, 'dollars by the government of the day, placed or not (a vacant seat\'s grant still has a government)');
  assert.equal(split5.seats[0].n, 'Calare');
  assert.deepEqual(split5.seats[0].holders, [['Andrew Gee', 'Independent', 300], ['Andrew Gee', 'Nationals', 100]]);
  assert.equal(split5.seats.find(s => s.n === 'New England').holders[0][1], 'Nationals');
  const record = programRecord(p, split5);
  assert.deepEqual(record.split.map(s => s.pct), [40, 30, 30]);
  assert.equal(record.split.reduce((s, r) => s + r.pct, 0), 100);
  assert.equal(record.split.reduce((s, r) => s + r.seatPct, 0), 100);
  assert.equal(record.era, 'both', 'no government awarded 70% of it');
  assert.equal(programSeatSplit({ ...p, grants_listed: 3 }, seats, meta), null, 'a program file that lists only some awards cannot be summed');
});

test('only a place-based program with its dollars spread over enough seats is told by seat', () => {
  const split = { mapped: [100, 10], seatCount: 12, seats: [{ t: 20 }] };
  const base = { jur: 'federal', t: 30e6, cats: [['Regional Development', 1]], recipients: [['a', 'Council', 'council', 10, 1]] };
  assert.equal(programEligible({ ...base, t: 150 }, split, { minTotal: 100 }), null);
  assert.equal(programEligible({ ...base, cats: [['Mental Health', 1]] }, split, { minTotal: 0 }), 'not a place-based category');
  assert.equal(programEligible({ ...base, recipients: [['a', 'Uni', 'university', 10, 1]] }, split, { minTotal: 0, minMappedShare: 0 }), 'mostly head-office recipients');
  assert.equal(programEligible({ ...base, t: 1000 }, split, { minTotal: 0 }), 'too few dollars placed in a seat');
  assert.equal(programEligible({ ...base, t: 150 }, { ...split, seatCount: 3 }, { minTotal: 0 }), 'too few seats');
  assert.equal(programEligible({ ...base, t: 150 }, { ...split, seats: [{ t: 60 }] }, { minTotal: 0 }), 'one seat dominates');
  assert.equal(programEligible({ ...base, jur: 'qld' }, split), 'not federal');
  assert.equal(programEligible(base, null), 'no seat split');
  assert.equal(programEra({ Coalition: 80, Labor: 20 }), 'Coalition');
  assert.equal(programEra({ Labor: 100 }), 'Labor');
  assert.equal(programEra({ Coalition: 60, Labor: 40 }), 'both');
  assert.equal(programEra({}), 'both');
});

test('a month is listed once its publication deadline has passed, one row per recipient', () => {
  assert.equal(monthComplete('2026-08', '2026-09-21'), true);
  assert.equal(monthComplete('2026-08', '2026-09-20'), false);
  assert.equal(monthComplete('2026-02', '2026-03-21'), true);
  const g = (id, rid, v, s, extra = {}) => ({ id, rid, rn: `Recipient ${rid.slice(-1)}`, k: 'company', v, s, guid: `g-${id}`, desc: 'The project will deliver the thing. More words.', pr: 'Program', ...extra });
  const months = largestByMonth([
    g('GA1', 'abn:00000000001', 100, '2026-08-02'),
    g('GA2', 'abn:00000000001', 300, '2026-08-03'),
    g('GA3', 'abn:00000000002', 200, '2026-08-04', { el: 'Calare', sel: 'Open Competitive' }),
    g('GA4', 'abn:00000000003', 900, '2026-08-05', { k: 'person' }),
    g('GA5', 'name:someone', 800, '2026-08-05'),
    g('GA6', 'abn:00000000004', 700, '2026-08-05', { guid: null }),
    g('GA7', 'abn:00000000005', 50, '2026-09-01'),
    g('GA8', 'abn:00000000006', 60, '2026-07-31'),
  ], '2026-09-21', seats);
  assert.deepEqual(Object.keys(months), ['2026-08', '2026-07'], 'September is not over its deadline yet');
  assert.deepEqual(months['2026-08'].map(r => [r.id, r.amount, r.more]), [['GA2', 300, 1], ['GA3', 200, 0]], 'people, name-only recipients and awards without a record are left out');
  assert.equal(months['2026-08'][0].sourceUrl, 'https://www.grants.gov.au/Ga/Show/g-GA2');
  assert.equal(months['2026-08'][1].selection, 'Open Competitive');
  assert.deepEqual(wholePercents([2, 1, 1]), [50, 25, 25]);
});
