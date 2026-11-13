// Party pages list a state member whose only party is the one a verified seat roster
// records for them (scripts/build_party_index.mjs seat_rosters, public/roster-party.js),
// the same fallback the person page uses: unambiguous or nothing, never a surname.
// Invented people in the fixtures; the shipped-data check names sitting members.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seatRosterMembers} from '../../scripts/build_party_index.mjs';
import {partyMembers} from '../public/party-page.js';

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
  assert.deepEqual(seat_rosters, {'Animal Justice Party': [{name: 'Wren Talbot', pid: null, electorate: 'Fixture Region', as_of: '2026-09-09'}]});
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
  const names = label => partyMembers(label, {roster, divisions}).current.map(m => m.name);
  assert.deepEqual(names('Animal Justice Party'), ['Georgie Purcell']);
  assert.deepEqual(names('Legalise Cannabis'), ['David Ettershank', 'Rachel Payne']);
  assert.deepEqual(names('Shooters, Fishers and Farmers'), ['Jeff Bourman']);
});
