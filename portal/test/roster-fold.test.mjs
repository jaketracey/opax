// Surname prints folded into their person (scripts/roster_fold.py): the person's row holds the
// print in `prints`, the old /subject/person/<surname> address reads as the person, and the
// person's speech searches also cover the print. Fixture rows are the public Shoebridge record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { printSpeakers, splitPerson, splitSpeakers, scopedCollaborators } from '../public/speech-attribution.js';

const bundle = await build({ entryPoints: [new URL('../src/person-slug.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { personIndex } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const david = { name: 'David Shoebridge', speeches: 6418, party: 'Greens', states: ['nsw', 'federal'],
  chambers: ['nsw_lc', 'senate', 'senate_committee', 'joint_committee'], first: 2015, last: 2026, pid: '11010',
  current: true, party_now: 'Greens', prints: ['Shoebridge'] };
const roster = [david, { name: 'Tony Abbott', speeches: 5878, party: 'Liberal', states: ['federal'], chambers: ['representatives'] }];

test('a folded print reads as its person: the old surname address resolves to the full name and its slug', () => {
  const { byName, byFold, bySlug, slugOf } = personIndex(roster);
  assert.equal(byFold.get('shoebridge')?.name, 'David Shoebridge');
  assert.equal(byName.has('Shoebridge'), false);
  assert.equal(bySlug.has('shoebridge'), false, 'the print has no address of its own');
  assert.equal(slugOf.get('David Shoebridge'), 'david-shoebridge');
});

test("a person's speech names are the name and the prints; nobody else gains any", () => {
  assert.deepEqual(printSpeakers(david), ['David Shoebridge', 'Shoebridge']);
  assert.deepEqual(printSpeakers(roster[1]), []);
  assert.deepEqual(printSpeakers({ ...david, speech_scope: { state: 'nsw', chamber: 'nsw_lc' } }), [], 'a witness split keeps its own scope');
  assert.deepEqual(splitSpeakers(david), [], 'prints are not a witness split');
  assert.equal(splitPerson(roster, 'Shoebridge')?.name, 'David Shoebridge');
  assert.equal(splitPerson([david, { ...david, name: 'Other Shoebridge' }], 'Shoebridge'), null, 'two holders: fail closed');
  const filter = { field: { and: [{ prop: 'label', labelset: 'kind', label: 'speech' }, { prop: 'origin_collaborator', collaborator: 'David Shoebridge' }] } };
  assert.deepEqual(scopedCollaborators(filter, { speakers: printSpeakers(david) }), { field: { and: [
    { prop: 'label', labelset: 'kind', label: 'speech' },
    { or: [{ prop: 'origin_collaborator', collaborator: 'David Shoebridge' }, { prop: 'origin_collaborator', collaborator: 'Shoebridge' }] },
  ] } });
});

test('the Worker searches, asks, briefs and topic counts read a folded person through their prints', () => {
  const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(worker, /async function speakerPrints\(/);
  // /api/search, ask bodies, the person overview and person topics all widen the collaborator clause.
  assert.ok((worker.match(/speakerPrints\(env, /g) || []).length >= 3, 'search, ask and topics resolve prints');
  assert.match(worker, /prints\.length \? scopedCollaborators\(base,\{speakers:prints\}\)/, 'the person overview reads prints');
});

test('the client opens the person for a folded print rather than an empty surname page', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const foldedInto = \(await loadParliamentarians\(\)\)\?\.people\?\.find\(p => \(p\.prints \|\| \[\]\)\.some/);
});

test('the shipped roster: Shoebridge is David Shoebridge, and every print is one person with a verified committee identity', () => {
  const people = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8')).people;
  assert.equal(people.some(p => p.name === 'Shoebridge'), false);
  const row = people.find(p => p.name === 'David Shoebridge');
  assert.deepEqual(row.prints, ['Shoebridge']);
  assert.equal(row.pid, '11010');
  const names = new Set(people.map(p => p.name)), seen = new Set();
  for (const p of people) for (const print of p.prints || []) {
    assert.equal(names.has(print), false, `${print} is folded and still a row`);
    assert.equal(seen.has(print), false, `${print} is folded into two people`);
    seen.add(print);
    assert.equal(print.includes(' '), false, `${print} is a surname print`);
    assert.ok(p.name.includes(' '), `${p.name} is a full name`);
    // The apps' identity guard: a full-name row with senate_committee needs a pid.
    if (p.chambers.includes('senate_committee')) assert.ok(p.pid, `${p.name} took committee speeches without an id`);
  }
});
