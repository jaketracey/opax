import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { representationAt, validDate, profileHTML, findPerson, outlineHTML } from '../public/electorates.js';

const detail = { capacity: 5, terms: [
  { person_id: 'a', start: '2020-01-01', end: '2024-01-01', start_precision: 'day', end_precision: 'day', party_periods: [{ party: 'Labor', start: '2020-01-01', end: '2022-01-01' }, { party: 'Independent', start: '2022-01-01', end: '2024-01-01' }] },
  { person_id: 'b', start: '2024-01-01', end: null, start_precision: 'day', end_precision: 'open', observed_through: '2026-09-01', party_periods: [] },
], rosters: [{ as_of: '2026-09-04', complete: true, members: [{ person_id: 'a' }, { person_id: 'b' }] }] };
test('dates and representation respect exact evidence boundaries', () => {
  assert.equal(validDate('2023-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(representationAt(detail, '2022-01-01').members[0].party, 'Independent');
  assert.deepEqual(representationAt(detail, '2024-01-01').members.map((m) => m.person_id), ['b']);
  assert.equal(representationAt(detail, '2026-09-02').status, 'unknown');
  assert.equal(representationAt(detail, '2026-09-04').members.length, 2);
  assert.equal(representationAt(detail, '2026-09-05').status, 'unknown');
});
test('ambiguous person names never auto-join', () => {
  const people = [{ name: 'A Person', aliases: ['Alias'] }, { name: 'Other Person', aliases: ['Alias'] }];
  assert.equal(findPerson(people, 'Alias'), null);
  assert.equal(findPerson(people, 'a person'), people[0]);
});
const manifest = JSON.parse(readFileSync(new URL('../public/electorates/manifest.json', import.meta.url)));
const publicFile = (path) => new URL(`../public${path}`, import.meta.url);
const index = JSON.parse(readFileSync(publicFile(manifest.index_url)));
test('released electorates render complete candidate lists, safe HTML and distinct count labels', () => {
  for (const name of ['Farrer', 'Corangamite', 'Southern Metropolitan', 'Bass']) {
    const entry = index.electorates.find((e) => e.name === name);
    const data = JSON.parse(readFileSync(publicFile(entry.detail_url)));
    const html = profileHTML(data);
    assert.match(html, /Latest verified representation/);
    for (const contest of data.elections) for (const c of contest.candidates) assert.ok(html.includes(c.name.replaceAll('&', '&amp;').replaceAll("'", '&#39;')));
    if (data.elections.length) assert.match(html, /Two-candidate preferred/);
    const unsafe = profileHTML({ ...data, name: '<img src=x onerror=alert(1)>' });
    assert.ok(!unsafe.includes('<img src=x'));
    assert.ok(unsafe.includes('&lt;img'));
    const boundary = data.boundaries.find((b) => b.geometry);
    if (boundary) assert.match(outlineHTML(boundary, data.name), /<svg/);
  }
});
test('same names remain separate by jurisdiction and multi-member seats retain all representatives', () => {
  const bass = index.electorates.filter((e) => e.name === 'Bass');
  assert.ok(bass.length >= 3);
  assert.equal(new Set(bass.map((e) => e.electorate_id)).size, bass.length);
  const south = index.electorates.find((e) => e.name === 'Southern Metropolitan');
  assert.equal(south.representatives.length, 5);
  assert.equal(index.electorates.filter((e) => e.name === 'Corangamite').length, 1);
});

test('unknown representation is distinct from a verified vacancy, including future dates', () => {
  const d = { ...detail, rosters: [{ as_of: '2026-09-04', complete: true, members: [] }] };
  const vacancy = representationAt(d, '2026-09-04');
  assert.equal(vacancy.status, 'verified');
  assert.deepEqual(vacancy.members, []);
  assert.equal(representationAt(d, '2026-09-05').status, 'unknown');
});
