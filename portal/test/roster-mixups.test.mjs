import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { profileAffiliations, profileJurisdictions } from '../public/profile-jurisdictions.js';
import { isWeakName } from '../../scripts/photo_identity.mjs';
const roster = JSON.parse(await readFile(new URL('../public/parliamentarians.json', import.meta.url)));
const people = new Map(roster.people.map(p => [p.name, p]));
const mainRoster = JSON.parse(await readFile(new URL('../../tests/fixtures/roster-export/main-66e75d74.json', import.meta.url), 'utf8'));

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

test('ambiguous prints stay neutral and retained aliases contain real given names', () => {
  for (const name of ['Horne', 'Andrews', 'Theophanous', 'Cox', 'Katter', 'Smith', 'Tudehope']) {
    const p = people.get(name);
    for (const field of ['pid', 'full', 'current', 'party_now', 'party', 'parties']) assert.equal(p[field], undefined, `${name}: ${field}`);
    assert.deepEqual(p.representation, [], name);
  }
  for (const p of roster.people) {
    if (!p.full) continue;
    assert.ok(!isWeakName(p.full), p.name);
    assert.doesNotMatch(p.full, /^(?:By|Sm|Gj|Lm|Ml|Aj|Pt|Mt|Sj|De|Mc|Cd|Maj) /, p.name);
    if (isWeakName(p.name) && p.states.length > 1) {
      assert.ok(p.identity_evidence?.length || p.identity_basis, p.name);
      assert.equal(p.pid, undefined, p.name);
      assert.equal(p.current, undefined, p.name);
      assert.equal(p.party_now, undefined, p.name);
    }
  }
});

test('SA two-house careers keep main’s parties, and dated mixed-era careers remain visible', () => {
  for (const [name, full, party] of [['K.J. Maher', 'Kyam Maher', 'Labor'], ['R.I. Lucas', 'Rob Lucas', 'Liberal'],
    ['S.G. Wade', 'Stephen Wade', 'Liberal'], ['C.M. Scriven', 'Clare Scriven', 'Labor'], ['J.M.A. Lensink', 'Michelle Lensink', 'Liberal']]) {
    if (name === 'J.M.A. Lensink') assert.equal(people.get(name).full, full);
    else assert.equal(people.get(name).full, undefined);
    assert.equal(people.get(name).party, party);
  }
  assert.ok(profileAffiliations(people.get('Mark Latham')).some(r => r.party === 'Labor' && r.electorate === 'Werriwa'));
  assert.ok(profileAffiliations(people.get('Lynda Voltz')).some(r => r.chamber === 'nsw_lc' && r.party === 'Labor'));
  assert.ok(profileJurisdictions(people.get('Ros Spence')).representations.some(r => r.electorate === 'Yuroke'));
  for (const name of ['Ros Spence', 'Malinauskas', 'P.B. Malinauskas', 'V.A. Chapman', 'S.S. Marshall', 'A. Koutsantonis', 'Picton', 'C.J. Picton']) {
    assert.deepEqual(people.get(name), mainRoster.people.find(p => p.name === name), name);
  }
});

test('state records never take a federal committee namesake, and witness-majority aggregates stay neutral', () => {
  for (const name of ['Paterson', 'Roberts', 'Watt', 'Walsh', 'Pratt', 'Hanson', 'McBride', 'Gee', 'Kennedy',
    'Green', 'Berry', 'Wells', 'Watts', 'Lim', 'T Smith', 'Bates', 'Perrett', 'Ng', 'Le', 'Thomas', 'Power', 'Guy', 'Dick']) {
    assert.equal(people.get(name).full, undefined, name);
    assert.equal(people.get(name).party, undefined, name);
    assert.deepEqual(people.get(name).representation, [], name);
  }
  for (const p of roster.people) {
    if ((p.witness_rows || 0) * 2 <= (p.speeches ?? 0)) continue;
    for (const field of ['pid', 'full', 'current', 'party_now', 'party', 'parties', 'identity_evidence', 'affiliations']) {
      assert.equal(p[field], undefined, `${p.name}: ${field}`);
    }
  }
});
