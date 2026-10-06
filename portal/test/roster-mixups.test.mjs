import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { profileJurisdictions } from '../public/profile-jurisdictions.js';
import { isWeakName } from '../../scripts/photo_identity.mjs';
const roster = JSON.parse(await readFile(new URL('../public/parliamentarians.json', import.meta.url)));
const people = new Map(roster.people.map(p => [p.name, p]));

test('Bob Horne has Paterson; Melissa alone has Williamstown and the Victorian Labor facet', () => {
  const bob = people.get('Bob Horne'), melissa = people.get('Melissa Horne');
  assert.deepEqual(profileJurisdictions(bob).representations.map(r => r.electorate), ['Paterson']);
  assert.deepEqual(bob.states, ['federal']);
  assert.deepEqual(profileJurisdictions(melissa).representations.map(r => r.electorate), ['Williamstown']);
  assert.equal(melissa.party, 'Labor');
  const matches = roster.people.filter(p => p.name.includes('Horne') && p.states.includes('vic') &&
    (p.party === 'Labor' || p.parties?.includes('Labor')));
  assert.deepEqual(matches.map(p => p.name), ['Melissa Horne']);
});

test('Mark retains the federal Labor dates, with One Nation and independent NSW Council service', () => {
  const mark = people.get('Mark Latham');
  assert.equal(mark.party, 'Independent');
  assert.equal(mark.party_now, 'Independent');
  assert.deepEqual(mark.parties, ['Independent', 'One Nation']);
  assert.ok(mark.affiliations.some(r => r.jurisdiction === 'federal' && r.party === 'Labor' && r.end === '2005-01-21'));
  assert.ok(mark.affiliations.some(r => r.jurisdiction === 'nsw' && r.party === 'One Nation' && r.start === '2019-03-23'));
  assert.ok(mark.affiliations.some(r => r.jurisdiction === 'nsw' && r.party === 'Independent' && r.start === '2023-08-22'));
  assert.ok(!mark.affiliations.some(r => r.jurisdiction === 'nsw' && r.party === 'Labor'));
  const labor = roster.people.filter(p => /Latham/.test(p.name) && p.states.includes('nsw') &&
    (p.party === 'Labor' || p.parties?.includes('Labor')));
  assert.deepEqual(labor, []);
});

test('every mixed surname or initials print has no single-person record or party facet', () => {
  for (const p of roster.people) {
    const houses = new Set(p.chambers.filter(c => !c.includes('committee')));
    if (!isWeakName(p.name) || !(p.states.length > 1 || houses.size > 1 || p.witness_rows)) continue;
    for (const field of ['pid', 'full', 'current', 'party_now', 'party', 'parties']) assert.equal(p[field], undefined, `${p.name}: ${field}`);
    assert.deepEqual(p.representation, [], p.name);
  }
});
