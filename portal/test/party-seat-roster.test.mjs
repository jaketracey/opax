// Party pages list a state member whose only party is the one a verified seat roster
// records for them (scripts/build_party_index.mjs seat_rosters, public/roster-party.js),
// the same fallback the person page uses: unambiguous or nothing, never a surname.
// Invented people in the fixtures; the shipped-data check names sitting members.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {recordedElections, seatRosterMembers} from '../../scripts/build_party_index.mjs';
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
  assert.deepEqual(names('Animal Justice Party'), ['Georgie Purcell']);
  assert.deepEqual(names('Legalise Cannabis'), ['David Ettershank', 'Rachel Payne']);
  assert.deepEqual(names('Shooters, Fishers and Farmers'), ['Jeff Bourman']);
});

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const helpers = {esc, photoUrlFor: () => null, personUrl: () => '/subject/person', partyChipHTML: p => esc(p),
  yearSpan: (a, b) => a === b ? String(a) : `${a}–${b}`, sourceLineHTML: () => '', same: (a, b) => a === b, stateName: s => s};
const vicSeat = (name, chamber, party, holder) => seat({name, chamber, representatives: [{party, person: {name: holder, aliases: []}}]});
const vicMember = (name, chamber, electorate, over = {}) => member({name, chambers: [chamber], first: 2023, last: 2026,
  representation: [{jurisdiction: 'vic', chamber, electorate}], ...over});
const initials = (name, party, over = {}) => ({name, pid: null, party, states: ['vic'], chambers: ['vic_la'], first: 2018, last: 2022, ...over});
const names = list => list.map(m => m.name).sort();

test('an initials print the seat roster explains is shown once; an ambiguous one or another party keeps both', () => {
  const elections = {vic: ['2026-11-28']};
  const people = [
    vicMember('Tessa Quill', 'vic_la', 'Fixtureton'), initials('T Quill', 'Labor'),                       // one fit: folded
    vicMember('Rhys Marlow', 'vic_la', 'Northside'), vicMember('Ruth Marlow', 'vic_la', 'Southside'),
    initials('R Marlow', 'Labor'),                                                                         // two fits: both kept
    vicMember('Owen Vance', 'vic_la', 'Eastvale'), initials('O Vance', 'Labor'),                           // Owen is Liberal: kept
  ];
  const seats = [vicSeat('Fixtureton', 'vic_la', 'Labor', 'Tessa Quill'), vicSeat('Northside', 'vic_la', 'Labor', 'Rhys Marlow'),
    vicSeat('Southside', 'vic_la', 'Labor', 'Ruth Marlow'), vicSeat('Eastvale', 'vic_la', 'Liberal', 'Owen Vance')];
  const divisions = {seat_rosters: seatRosterMembers(people, seats, elections)};
  const labor = partyMembers('Labor', {roster: {people}, divisions, today: '2026-11-13'});
  assert.deepEqual(names([...labor.current, ...labor.former]), ['O Vance', 'R Marlow', 'Rhys Marlow', 'Ruth Marlow', 'Tessa Quill']);
  assert.deepEqual(names(partyMembers('Liberal', {roster: {people}, divisions, today: '2026-11-13'}).current), ['Owen Vance']);
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
  for (const list of Object.values(index.seat_rosters)) for (const m of list) {
    assert.ok(m.jurisdiction && m.chamber && m.as_of, m.name);
    assert.equal(m.next_election, (days[m.jurisdiction] || []).filter(d => d > m.as_of).sort()[0] || null, m.name);
  }
});
