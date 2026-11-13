// Party pages list a state member whose only party is the one a verified seat roster
// records for them (scripts/build_party_index.mjs seat_rosters, public/roster-party.js),
// the same fallback the person page uses: unambiguous or nothing, never a surname.
// Invented people in the fixtures; the shipped-data check names sitting members.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {officialListMembers, recordedElections, seatRosterMembers} from '../../scripts/build_party_index.mjs';
import {partyMembers, partyMembersHTML} from '../public/party-page.js';

const seat = (over = {}) => ({
  name: 'Fixture Region', jurisdiction: 'vic', chamber: 'vic_lc', slug: 'vic-vic-lc-fixture-region',
  representation_status: 'verified', representation_as_of: '2026-09-09',
  representatives: [{party: 'Animal Justice Party', person: {name: 'Wren Talbot', aliases: []}}],
  ...over,
});
const member = (over = {}) => ({
  name: 'Wren Talbot', states: ['vic'], chambers: ['vic_lc'], first: 2023, last: 2026, speeches: 40,
  representation: [{jurisdiction: 'vic', chamber: 'vic_lc', electorate: 'Fixture Region'}], ...over,
});

test('a state member whose party comes only from the seat roster is a sitting member of that party', () => {
  const roster = {people: [member(), {name: 'Ida Marsh', party: 'Labor', party_now: 'Labor', current: true, states: ['vic'], first: 2018, last: 2026}]};
  const seat_rosters = seatRosterMembers(roster.people, [seat()]);
  assert.deepEqual(seat_rosters, {'Animal Justice Party': [{name: 'Wren Talbot', pid: null, jurisdiction: 'vic', chamber: 'vic_lc',
    electorate: 'Fixture Region', as_of: '2026-09-09', next_election: null}]});
  const members = partyMembers('Animal Justice Party', {roster, divisions: {parties: {}, seat_rosters}});
  assert.deepEqual(members.current.map(m => [m.name, m.first, m.last]), [['Wren Talbot', 2023, 2026]]);
  assert.deepEqual(members.former, []);
  // The short label the money page uses joins through the party map.
  assert.equal(partyMembers('Animal Justice', {roster, divisions: {seat_rosters}}).current.length, 1);
  // Nobody else is filed under it.
  assert.deepEqual(partyMembers('Labor', {roster, divisions: {seat_rosters}}).current.map(m => m.name), ['Ida Marsh']);
});

test('no verified roster, a surname print, an own party or a former member: nothing guessed', () => {
  for (const status of ['partial', 'unknown', undefined]) {
    assert.deepEqual(seatRosterMembers([member()], [seat({representation_status: status})]), {}, String(status));
  }
  assert.deepEqual(seatRosterMembers([member({name: 'Talbot'})], [seat()]), {}, 'a surname print never matches');
  assert.deepEqual(seatRosterMembers([member({party: 'Greens'})], [seat()]), {}, 'their own record decides');
  const roster = {people: [member({current: false})]};
  const members = partyMembers('Animal Justice Party', {roster, divisions: {seat_rosters: seatRosterMembers(roster.people, [seat()])}});
  assert.deepEqual([members.current.length, members.former.map(m => m.name)], [0, ['Wren Talbot']], 'a member who left is former');
});

test('the shipped index gives the three minor state parties their sitting members', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'));
  const roster = read('/parliamentarians.json'), divisions = read('/graph/party-members.json');
  const names = label => partyMembers(label, {roster, divisions, today: '2026-11-13'}).current.map(m => m.name);
  // Victorian members from the seat roster; NSW Council members from the dated official list (A17).
  assert.deepEqual(names('Animal Justice Party'), ['Emma Hurst', 'Georgie Purcell']);
  assert.deepEqual(names('Legalise Cannabis'), ['David Ettershank', 'Jeremy Buckingham', 'Rachel Payne']);
  assert.deepEqual(names('Shooters, Fishers and Farmers'), ['Jeff Bourman', 'Mark Banasiak', 'Robert Borsak']);
});

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const helpers = {esc, photoUrlFor: () => null, personUrl: () => '/subject/person', partyChipHTML: p => esc(p),
  yearSpan: (a, b) => a === b ? String(a) : `${a}–${b}`, sourceLineHTML: () => '', same: (a, b) => a === b, stateName: s => s};
const vicSeat = (name, chamber, party, holder) => seat({name, chamber, representatives: [{party, person: {name: holder, aliases: []}}]});
const vicMember = (name, chamber, electorate, over = {}) => member({name, chambers: [chamber], first: 2023, last: 2026,
  representation: [{jurisdiction: 'vic', chamber, electorate}], ...over});
const initials = (name, party, over = {}) => ({name, pid: null, party, states: ['vic'], chambers: ['vic_la'], first: 2018, last: 2022, ...over});
const names = list => list.map(m => m.name).sort();

test('an initials print the seat roster explains is shown once; an ambiguous one keeps both; one tied to another party is not listed', () => {
  const elections = {vic: ['2026-11-28']};
  const people = [
    vicMember('Tessa Quill', 'vic_la', 'Fixtureton'), initials('T Quill', 'Labor'),                       // one fit: folded
    vicMember('Rhys Marlow', 'vic_la', 'Northside'), vicMember('Ruth Marlow', 'vic_la', 'Southside'),
    initials('R Marlow', 'Labor'),                                                                         // two fits: both kept
    vicMember('Owen Vance', 'vic_la', 'Eastvale'), initials('O Vance', 'Labor'),                           // Owen is Liberal: not Labor's
  ];
  const seats = [vicSeat('Fixtureton', 'vic_la', 'Labor', 'Tessa Quill'), vicSeat('Northside', 'vic_la', 'Labor', 'Rhys Marlow'),
    vicSeat('Southside', 'vic_la', 'Labor', 'Ruth Marlow'), vicSeat('Eastvale', 'vic_la', 'Liberal', 'Owen Vance')];
  const divisions = {seat_rosters: seatRosterMembers(people, seats, elections)};
  const labor = partyMembers('Labor', {roster: {people}, divisions, today: '2026-11-13'});
  assert.deepEqual(names([...labor.current, ...labor.former]), ['R Marlow', 'Rhys Marlow', 'Ruth Marlow', 'Tessa Quill']);
  // Not merged either: the Liberal page lists Owen Vance alone, not the Labor-labelled print.
  const liberal = partyMembers('Liberal', {roster: {people}, divisions, today: '2026-11-13'});
  assert.deepEqual(names([...liberal.current, ...liberal.former]), ['Owen Vance']);
  // Two Vances with initial O in the seat rosters (Liberal and Greens): it is not clear whose print it is, so it stays.
  const twice = [...people, vicMember('Olive Vance', 'vic_la', 'Westvale')];
  const both = {seat_rosters: seatRosterMembers(twice, [...seats, vicSeat('Westvale', 'vic_la', 'Greens', 'Olive Vance')], elections)};
  const kept = partyMembers('Labor', {roster: {people: twice}, divisions: both, today: '2026-11-13'});
  assert.ok(kept.former.some(m => m.name === 'O Vance'), 'two candidates: nothing hidden');
  // Another chamber is another print: a T Quill of the upper house stays.
  const upper = [people[0], initials('T Quill', 'Labor', {chambers: ['vic_lc']})];
  const other = partyMembers('Labor', {roster: {people: upper}, divisions: {seat_rosters: seatRosterMembers(upper, seats, elections)}, today: '2026-11-13'});
  assert.equal(other.current.length + other.former.length, 2);
});

test('seat-roster members are dated, and after the next recorded election they no longer sit', (t) => {
  const people = [vicMember('Wren Talbot', 'vic_lc', 'Fixture Region'),
    {name: 'Ida Marsh', party: 'Animal Justice Party', current: false, states: ['nsw'], first: 2015, last: 2019}];
  const divisions = {seat_rosters: seatRosterMembers(people, [seat()], {vic: ['2022-11-26', '2026-11-28'], nsw: ['2026-12-01']})};
  assert.equal(divisions.seat_rosters['Animal Justice Party'][0].next_election, '2026-11-28', 'the first election after the roster date');
  const render = today => {
    const members = partyMembers('Animal Justice Party', {roster: {people}, divisions, today});
    return {members, doc: new JSDOM(partyMembersHTML('Animal Justice Party', members, helpers)).window.document};
  };
  const heads = doc => [...doc.querySelectorAll('h4')].map(h => h.textContent.trim());
  // Before (and on) election day: sitting, as at the roster's date.
  for (const today of ['2026-11-13', '2026-11-28']) {
    const {members, doc} = render(today);
    assert.deepEqual(names(members.current), ['Wren Talbot'], today);
    assert.deepEqual(heads(doc), ['Sitting members, as at 9 Sep 2026 (1)', 'Former members (1)'], today);
  }
  // After it: not sitting, not former; listed under the roster's date. Still counted once.
  const {members, doc} = render('2026-11-29');
  assert.deepEqual(members.current, []);
  assert.equal(members.former.length, 2);
  assert.deepEqual(heads(doc), ['On the parliamentary roster as at 9 Sep 2026 (1)', 'Former members (1)']);
  assert.doesNotMatch(doc.body.textContent, /Sitting/);
  // The default clock is the real one.
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-12-01T00:00:00Z')});
  assert.deepEqual(partyMembers('Animal Justice Party', {roster: {people}, divisions}).current, []);
  t.mock.timers.setTime(Date.parse('2026-10-01T00:00:00Z'));
  assert.deepEqual(names(partyMembers('Animal Justice Party', {roster: {people}, divisions}).current), ['Wren Talbot']);
});

test('a mixed sitting group dates each seat-roster row instead of the heading', () => {
  const people = [vicMember('Wren Talbot', 'vic_lc', 'Fixture Region'),
    {name: 'Ida Marsh', party: 'Animal Justice Party', party_now: 'Animal Justice Party', current: true, states: ['nsw'], first: 2019, last: 2026}];
  const members = partyMembers('Animal Justice Party', {roster: {people}, divisions: {seat_rosters: seatRosterMembers(people, [seat()], {})}});
  const doc = new JSDOM(partyMembersHTML('Animal Justice Party', members, helpers)).window.document;
  assert.deepEqual([...doc.querySelectorAll('h4')].map(h => h.textContent.trim()), ['Sitting members (2)']);
  const rows = Object.fromEntries([...doc.querySelectorAll('li.dir-row')].map(li => [li.querySelector('.dir-name').textContent, li.textContent]));
  assert.match(rows['Wren Talbot'], /Parliamentary roster as at 9 Sep 2026/);
  assert.doesNotMatch(rows['Ida Marsh'], /as at/);
});

test('election days come from the repository: the electorate release and the committed election configs', () => {
  const days = recordedElections(JSON.parse(readFileSync(new URL('../public/electorates/manifest.json', import.meta.url), 'utf8')));
  const vic = JSON.parse(readFileSync(new URL('../../scripts/hubs/vic-election-2026.json', import.meta.url), 'utf8')).election_day;
  assert.ok(days.vic.includes(vic));
  assert.ok(days.federal.length > 0);
  const index = JSON.parse(readFileSync(new URL('../public/graph/party-members.json', import.meta.url), 'utf8'));
  // With no recorded election after the date, an official-list entry ends at its term window's reviewed end (A22).
  const windows = JSON.parse(readFileSync(new URL('../../scripts/roster_service.json', import.meta.url), 'utf8')).snapshot_party_windows;
  for (const list of Object.values(index.seat_rosters)) for (const m of list) {
    assert.ok(m.jurisdiction && m.chamber && m.as_of, m.name);
    const end = windows[m.chamber]?.end > m.as_of ? windows[m.chamber].end : null;
    assert.equal(m.next_election, (days[m.jurisdiction] || []).filter(d => d > m.as_of).sort()[0] || end, m.name);
  }
});

test('A3c: the "T Bull" initials row (Victorian Assembly, 2018 to 2022) is not listed as a former Labor member', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'));
  const roster = read('/parliamentarians.json'), divisions = read('/graph/party-members.json');
  // The shipped roster still files the print under Labor; the repository has no dated party for Tim Bull in those years.
  assert.equal(roster.people.find(p => p.name === 'T Bull')?.party, 'Labor');
  assert.equal(divisions.seat_rosters.Nationals.filter(m => m.name === 'Tim Bull' && m.chamber === 'vic_la').length, 1);
  const all = label => {
    const m = partyMembers(label, {roster, divisions, today: '2026-11-13'});
    return [...m.current, ...m.former].map(r => r.name);
  };
  assert.ok(!all('Labor').includes('T Bull'));
  assert.ok(all('Labor').includes('Josh Bull'), 'Josh Bull stays Labor');
  assert.ok(all('Nationals').includes('Tim Bull') && !all('Nationals').includes('T Bull'), 'nothing moved to the Nationals page');
  // The other Victorian initials prints with a same-party roster member are unchanged.
  assert.ok(!all('Labor').includes('J Bull') && !all('Liberal').includes('M O’Brien'));
});

test('A3d: a sitting member with no roster row is counted from the party index, joining the Worker\'s added row', async () => {
  const {referenceOnlyPeople} = await import('../public/roster-party.js');
  const {splitSpeakers} = await import('../public/speech-attribution.js');
  const reference = [
    {name: 'Mara Quint', aliases: [], person_id: 'person_x', legacy_person_id: 'vic_quint',
      electorates: [{current: true, name: 'Fixtureton', jurisdiction: 'vic', chamber: 'vic_la', party: 'Labor', as_of: '2026-09-09'}]},
    {name: 'Tessa Quill', aliases: [], person_id: 'person_y', electorates: [{current: true, name: 'Northside', jurisdiction: 'vic', chamber: 'vic_la', party: 'Labor', as_of: '2026-09-09'}]},
    {name: 'Former Person', aliases: [], person_id: 'person_z', electorates: [{current: false, name: 'Southside', jurisdiction: 'vic', chamber: 'vic_la', party: 'Labor'}]},
    {name: 'Cal Scoped', aliases: [], person_id: 'person_w', electorates: [{current: true, name: 'Eastvale', jurisdiction: 'vic', chamber: 'vic_la', party: 'Labor', as_of: '2026-09-09'}]},
  ];
  const people = [vicMember('Tessa Quill', 'vic_la', 'Northside'), {name: 'Quill', full: 'Cal Scoped', speech_scope: {state: 'vic'}}];
  assert.deepEqual(splitSpeakers(people[1]), ['Cal Scoped', 'Quill'], 'the names the rule treats as already in the roster');
  assert.deepEqual(referenceOnlyPeople(people, reference).map(r => r.person.name), ['Mara Quint']);
  const seat_rosters = seatRosterMembers(people, [], {vic: ['2026-11-28']}, reference);
  assert.deepEqual(seat_rosters.Labor, [{name: 'Mara Quint', pid: 'vic_quint', jurisdiction: 'vic', chamber: 'vic_la', electorate: 'Fixtureton',
    as_of: '2026-09-09', next_election: '2026-11-28', reference: true}]);
  // The browser's roster has no row for her; the Worker's has one under the same pid. Both count her once.
  const browser = partyMembers('Labor', {roster: {people}, divisions: {seat_rosters}, today: '2026-11-13'});
  const worker = partyMembers('Labor', {roster: {people: [...people, {name: 'Mara Quint', pid: 'vic_quint', party: 'Labor', party_now: 'Labor', current: true}]},
    divisions: {seat_rosters}, today: '2026-11-13'});
  assert.deepEqual(browser.current.map(m => m.name), ['Mara Quint']);
  assert.deepEqual(worker.current.map(m => m.name), ['Mara Quint']);
  // After the next election the roster no longer says she sits, on either side.
  for (const people2 of [people, [...people, {name: 'Mara Quint', pid: 'vic_quint', party: 'Labor', current: true}]]) {
    const later = partyMembers('Labor', {roster: {people: people2}, divisions: {seat_rosters}, today: '2026-12-01'});
    assert.deepEqual([later.current.length, later.former.map(m => m.name)], [0, ['Mara Quint']]);
  }
});

// A17: a sitting MLC whose roster row carries a party from the dated NSW Council list (a state-party-snapshot
// accept: party and representation, no `current`) was listed as former. The chamber's latest official list,
// inside the reviewed term window, now dates them as sitting. Invented people throughout.
const mlcRow = (over = {}) => ({
  name: 'Quill Varney', speeches: 120, states: ['nsw'], chambers: ['nsw_lc'], first: 2025, last: 2026, party: 'Fixture Party',
  representation: [{jurisdiction: 'nsw', chamber: 'nsw_lc', electorate: 'New South Wales', state: 'NSW', as_of: '2026-09-25',
    source_url: 'https://example.invalid/lc-list.pdf', basis: 'Official parliamentary roster on the stated date; full name and chamber verified'}],
  ...over,
});
const listed = (name, over = {}) => ({name, aliases: [], jurisdiction: 'nsw', chamber: 'nsw_lc', electorate: 'New South Wales',
  party: 'Fixture Party', as_of: '2026-09-25', source_url: 'https://example.invalid/lc-list.pdf', basis: 'official list', ...over});
const nswWindow = {nsw_lc: {start: '2023-03-25'}};

test('A17: a sitting MLC with the snapshot-accept row shape is a sitting member; a retired one stays former', () => {
  const retired = mlcRow({name: 'Odile Prest', first: 2015, last: 2023});
  const people = [mlcRow(), retired];
  // The retiree is on an older list only; the chamber's latest list decides.
  const observations = [listed('Quill Varney'), listed('Odile Prest', {as_of: '2023-02-01'})];
  const seat_rosters = officialListMembers(people, observations, nswWindow, {});
  assert.deepEqual(seat_rosters, {'Fixture Party': [{name: 'Quill Varney', pid: null, jurisdiction: 'nsw', chamber: 'nsw_lc',
    electorate: 'New South Wales', as_of: '2026-09-25', next_election: null}]});
  const members = partyMembers('Fixture Party', {roster: {people}, divisions: {parties: {}, seat_rosters}, today: '2026-11-13'});
  assert.deepEqual(members.current.map(m => m.name), ['Quill Varney']);
  assert.deepEqual(members.former.map(m => m.name), ['Odile Prest']);
  // Before the fix the electorate path skipped a row with its own party, so the same MLC was former.
  const before = partyMembers('Fixture Party', {roster: {people}, divisions: {seat_rosters: seatRosterMembers(people, [])}, today: '2026-11-13'});
  assert.deepEqual(before.current, []);
  // A recorded election after the list date ends it, as for seat rosters.
  const later = officialListMembers(people, observations, nswWindow, {nsw: ['2027-03-27']});
  assert.equal(later['Fixture Party'][0].next_election, '2027-03-27');
  assert.deepEqual(partyMembers('Fixture Party', {roster: {people}, divisions: {seat_rosters: later}, today: '2027-04-01'}).current, []);
});

test('A17: no reviewed window, a list before the term, a later service end, a surname print or two parties: nothing', () => {
  const people = [mlcRow()];
  assert.deepEqual(officialListMembers(people, [listed('Quill Varney')], {}, {}), {}, 'no reviewed term window');
  assert.deepEqual(officialListMembers(people, [listed('Quill Varney', {as_of: '2022-12-01'})], nswWindow, {}), {}, 'list predates the term');
  assert.deepEqual(officialListMembers(people, [listed('Quill Varney'), {...listed('Quill Varney', {as_of: '2026-10-30'}), basis: 'service record'}],
    nswWindow, {}), {}, 'a later service record ends their service');
  assert.deepEqual(officialListMembers([mlcRow({name: 'Varney'})], [listed('Varney')], nswWindow, {}), {}, 'a surname print never matches');
  assert.deepEqual(officialListMembers(people, [listed('Quill Varney'), listed('Quill Varney', {party: 'Other Party'})], nswWindow, {}), {},
    'two parties at the date');
  assert.deepEqual(officialListMembers([mlcRow({chambers: ['nsw_la']})], [listed('Quill Varney')], nswWindow, {}), {}, 'another chamber');
  // A person the electorate roster already lists in that chamber is not listed twice.
  const seat = {'Fixture Party': [{name: 'Quill Varney', pid: null, jurisdiction: 'nsw', chamber: 'nsw_lc', electorate: 'New South Wales',
    as_of: '2026-09-01', next_election: null}]};
  assert.deepEqual(officialListMembers(people, [listed('Quill Varney')], nswWindow, {}, seat)['Fixture Party'].map(m => m.as_of), ['2026-09-01']);
});

test('A17: the shipped index lists every member of the latest NSW Council list as sitting', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'));
  const roster = read('/parliamentarians.json'), divisions = read('/graph/party-members.json');
  const list = read('/data/roster-list-parties.json').observations.filter(o => o.chamber === 'nsw_lc' && o.basis === 'official list');
  const latest = list.reduce((a, o) => (o.as_of > a ? o.as_of : a), '');
  const fold = s => s.replace(/[‘’]/g, "'");
  const members = list.filter(o => o.as_of === latest);
  assert.ok(members.length >= 40, `${members.length} listed`);
  for (const o of members) {
    const sitting = partyMembers(o.party, {roster, divisions, today: '2026-11-13'}).current.map(m => fold(m.name));
    assert.ok(sitting.includes(fold(o.name)), `${o.name} sits for ${o.party}`);
  }
  const libertarian = partyMembers('Libertarian Party', {roster, divisions, today: '2026-11-13'});
  assert.ok(libertarian.current.some(m => m.name === 'John Ruddick') && !libertarian.former.some(m => m.name === 'John Ruddick'));
});

// A22: the SA Council. SA Hansard prints every member by initials ("K.J. Maher"), so the list entry records that
// print (`prints`), reviewed, and only this rule reads it. An MLC serves two four-year terms and half the Council
// is elected at each periodic election: the window starts at the latest one, and a list dated inside it names both
// halves. Invented people throughout.
const saRow = (name, over = {}) => ({name, speeches: 80, states: ['sa'], chambers: ['sa_lc'], first: 2020, last: 2023,
  representation: [], ...over});
const saListed = (name, over = {}) => ({name, aliases: [], jurisdiction: 'sa', chamber: 'sa_lc', electorate: 'South Australia',
  party: 'Fixture Party', as_of: '2026-11-13', source_url: 'https://example.invalid/lc-members', basis: 'official list', ...over});
const saWindow = {sa_lc: {start: '2026-03-21', end: '2030-03-16'}};

test('A22: two-term halves: the half elected in 2022 and the half elected in 2026 both sit; a member whose term ended in 2026 is former', () => {
  // Odessa Ferrant: elected 2022, sits until 2030 (not up in 2026). Piers Lowth: elected 2026, a first-term
  // member with no speeches yet in this data. Saul Dace: elected 2018, term ended at the March 2026 election.
  const people = [saRow('O.M. Ferrant', {party: 'Fixture Party', first: 2022}), saRow('P.L. Lowth', {first: 2026, last: 2026}),
    saRow('S.A. Dace', {party: 'Fixture Party', first: 2018, last: 2023})];
  const observations = [
    // The list before the 2026 election names the 2018 and 2022 halves.
    saListed('Odessa Ferrant', {as_of: '2025-08-01', aliases: ['Odessa Mae Ferrant'], prints: ['O.M. Ferrant']}),
    saListed('Saul Dace', {as_of: '2025-08-01', aliases: ['Saul Arno Dace'], prints: ['S.A. Dace']}),
    // The list after it names the 2022 and 2026 halves.
    saListed('Odessa Ferrant', {aliases: ['Odessa Mae Ferrant'], prints: ['O.M. Ferrant']}),
    saListed('Piers Lowth', {aliases: ['Piers Leon Lowth'], prints: ['P.L. Lowth']}),
  ];
  const seat_rosters = officialListMembers(people, observations, saWindow, {});
  assert.deepEqual(seat_rosters['Fixture Party'].map(m => [m.name, m.as_of, m.next_election]),
    [['O.M. Ferrant', '2026-11-13', '2030-03-16'], ['P.L. Lowth', '2026-11-13', '2030-03-16']]);
  const members = partyMembers('Fixture Party', {roster: {people}, divisions: {parties: {}, seat_rosters}, today: '2026-11-13'});
  assert.deepEqual(members.current.map(m => m.name), ['O.M. Ferrant', 'P.L. Lowth']);
  assert.deepEqual(members.former.map(m => m.name), ['S.A. Dace']);
  // With only the pre-election list, nobody is dated as sitting: the 2022 half is not carried across the 2026 election.
  assert.deepEqual(officialListMembers(people, observations.filter(o => o.as_of === '2025-08-01'), saWindow, {}), {});
  // After the window's end (the next periodic election) the entries are stale, not sitting.
  assert.deepEqual(partyMembers('Fixture Party', {roster: {people}, divisions: {seat_rosters}, today: '2030-03-17'}).current, []);
  // A recorded election before the reviewed end wins.
  assert.equal(officialListMembers(people, observations, saWindow, {sa: ['2028-01-01']})['Fixture Party'][0].next_election, '2028-01-01');
});

test('A22: an initials print matches only as the list records it, and never in another chamber', () => {
  const people = [saRow('O.M. Ferrant', {party: 'Fixture Party'})];
  assert.deepEqual(officialListMembers(people, [saListed('Odessa Ferrant', {aliases: ['Odessa Mae Ferrant']})], saWindow, {}), {},
    'no recorded print: the initials are never derived');
  assert.deepEqual(officialListMembers(people, [saListed('Odessa Ferrant', {prints: ['O. Ferrant']})], saWindow, {}), {},
    'another print');
  assert.deepEqual(officialListMembers([saRow('O.M. Ferrant', {chambers: ['sa_ha']})], [saListed('Odessa Ferrant', {prints: ['O.M. Ferrant']})],
    saWindow, {}), {}, 'another chamber');
  assert.deepEqual(officialListMembers(people, [saListed('Odessa Ferrant', {prints: ['O.M. Ferrant']}),
    saListed('Olive Ferrant', {prints: ['O.M. Ferrant'], party: 'Other Party'})], saWindow, {}), {}, 'one print on two members');
});

test('A22: every recorded SA Council print is the initials of the listed full name, unique, and one roster row', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../scripts/roster_state_evidence.json', import.meta.url), 'utf8'));
  const roster = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8')).people;
  const rows = roster.filter(p => (p.chambers || []).includes('sa_lc')).map(p => p.name);
  const seen = new Set();
  let count = 0;
  for (const snap of evidence.snapshots) for (const m of snap.members) for (const print of m.prints || []) {
    count++;
    assert.equal(snap.chamber, 'sa_lc', `${print}: prints are recorded only for the SA Council`);
    const full = [m.name, ...(m.aliases || [])].sort((a, b) => b.split(' ').length - a.split(' ').length)[0].split(' ');
    assert.equal(print, `${full.slice(0, -1).map(t => `${t[0]}.`).join('')} ${full.at(-1)}`, `${print} is ${full.join(' ')}`);
    assert.ok(!seen.has(`${snap.as_of}|${print}`), `${print} once per list`);
    seen.add(`${snap.as_of}|${print}`);
    assert.equal(rows.filter(r => r === print).length, 1, `${print} is one SA Council roster row`);
  }
  assert.ok(count >= 15, `${count} prints`);
});

test('A22: the shipped index lists every printed member of the latest SA Council list as sitting, and its leavers as former', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'));
  const roster = read('/parliamentarians.json'), divisions = read('/graph/party-members.json');
  const list = read('/data/roster-list-parties.json').observations.filter(o => o.chamber === 'sa_lc' && o.basis === 'official list');
  const latest = list.reduce((a, o) => (o.as_of > a ? o.as_of : a), '');
  assert.ok(latest >= '2026-03-21', `latest SA Council list ${latest} is inside the term`);
  const printed = list.filter(o => o.as_of === latest && o.prints?.length);
  assert.ok(printed.length >= 15, `${printed.length} printed`);
  for (const o of printed) {
    const page = partyMembers(o.party, {roster, divisions, today: '2026-11-13'});
    assert.ok(page.current.some(m => m.name === o.prints[0]), `${o.prints[0]} sits for ${o.party}`);
  }
  // Rob Lucas retired at the 2022 election: on the 2021 list, not the current one.
  const liberal = partyMembers('Liberal', {roster, divisions, today: '2026-11-13'});
  assert.ok(liberal.former.some(m => m.name === 'R.I. Lucas') && !liberal.current.some(m => m.name === 'R.I. Lucas'));
});
