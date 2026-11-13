import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const load = async entry => {
  const out = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const [{ findPeople, runTool }, { resolvePersonName }, roster] = await Promise.all([
  load('../src/agentic-tools.ts'), load('../src/person-name-matching.ts'),
  readFile(new URL('../public/parliamentarians.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const depsFor = people => ({
  origin: 'https://fixture.invalid',
  asset: async path => { assert.equal(path, '/parliamentarians.json'); return { people }; },
  kb: async () => { throw new Error('Name resolution must use the roster only'); },
});
const deps = depsFor(roster.people);
test('find_people keeps the exact Panopoulos speech row despite the Mirabella alias', async () => {
  const result = await findPeople(deps, {name: 'Sophie Panopoulos'});
  assert.equal(result.data.match_status, 'matched');
  assert.equal(result.data.people[0].name, 'Sophie Panopoulos');
  assert.equal(result.data.people[0].speeches_indexed, 147);
  assert.equal(result.data.clarification, undefined);
});
const person = (name, pid, speeches = 1) => ({ name, pid, speeches, states: ['federal'], chambers: ['senate'] });
const resolved = (result, name) => {
  assert.equal(result.ok, true);
  assert.equal(result.data.match_status, 'matched');
  assert.deepEqual(result.data.people.map(p => p.name), [name]);
  assert.equal(result.data.clarification, undefined);
  assert.equal(result.data.people[0].confidence, result.data.candidates[0].confidence);
  assert.ok(result.data.people[0].confidence >= 0.85 && result.data.people[0].confidence <= 1);
  assert.equal(result.cite.length, 1);
  assert.equal(result.cite[0].url, `https://fixture.invalid/subject/person/${encodeURIComponent(name)}`);
};

test('find_people resolves common name typos against the published roster', async () => {
  for (const [query, name] of [
    ['Jacqui Lamby', 'Jacqui Lambie'], ['Tanmy Tyrrell', 'Tammy Tyrrell'],
    ["Llew O'Brine", "Llew O'Brien"], ['Krith Pitt', 'Keith Pitt'],
    ['Malcolm Rboerts', 'Malcolm Roberts'], ['Gaye Tierney', 'Gayle Tierney'],
    ['Anthony Albanes', 'Anthony Albanese'],
  ]) {
    const result = await findPeople(deps, { name: query });
    resolved(result, name);
    assert.ok(result.data.people[0].confidence < 1, query);
  }
});

test('find_people accepts surname-first order, honorifics, punctuation and suffix variants', async () => {
  for (const [query, name] of [
    // The Hansard print 'Katter Bob Jnr' is folded into Bob Katter, the person holding its verified id (fold_ids).
    ['Katter Bob Jnr', 'Bob Katter'], ['Katter, Bob Jr.', 'Bob Katter'],
    ['Bob Katter Junior MP', 'Bob Katter'], ['The Hon. Senator Jacqui Lambie', 'Jacqui Lambie'],
    ['Senator Lambie, Jacqui', 'Jacqui Lambie'], ['Senator Lamby, Jacqui', 'Jacqui Lambie'],
    ['Dr Anthony Albanese MP', 'Anthony Albanese'], ['Van Manen Bert', 'Bert Van Manen'],
    ['Reverend the Hon. Fred Nile MLC', 'Reverend the Hon. Fred Nile'],
    ['Llew O’Brien', "Llew O'Brien"], ['  ANTHONY   ALBANÉSE  ', 'Anthony Albanese'],
  ]) resolved(await findPeople(deps, { name: query }), name);
});

test('nickname resolution uses given names and preserves roster spelling and metadata', async () => {
  for (const [query, name] of [
    ['Robert Katter', 'Bob Katter'], ['William Shorten', 'Bill Shorten'],
    ['Tony Albanese', 'Anthony Albanese'], ['Michael Baird', 'Mike Baird'],
    ['Jacqueline Lambie', 'Jacqui Lambie'], ['Deb O’Neill', "Deborah O'Neill"],
  ]) resolved(await findPeople(deps, { name: query }), name);
  const result = await runTool(deps, 'find_people', { name: 'Robert Katter' });
  const row = roster.people.find(p => p.name === 'Bob Katter');
  assert.deepEqual(result.data.people[0], {
    name: row.name, confidence: 0.995, party: row.party_now, states: row.states,
    chambers: row.chambers, years: [row.first, row.last], current: row.current, speeches_indexed: row.speeches,
    representation: row.representation ?? [], service: [],
  });
});

test('known aliases and surname-only labels do not create false ambiguity', async () => {
  for (const [query, name] of [
    ['Bob Katter', 'Bob Katter'], ['Katter', 'Bob Katter'],
    ["Brendan O'Connor", "Brendan O'Connor"], ['Hugh Mcdermott', 'Hugh McDermott'],
    ['Jacqui Lambie', 'Jacqui Lambie'],
  ]) resolved(await findPeople(deps, { name: query }), name);
  const result = await findPeople(deps, { name: 'Katter' });
  assert.deepEqual(result.data.candidates.map(p => p.name), ['Bob Katter']);
});

test('all invented people in the baseline still return no record, with no suggested stranger', async () => {
  const baseline = JSON.parse(await readFile(new URL('../../scripts/ask_baseline/questions-v1.json', import.meta.url), 'utf8'));
  const fakeNames = baseline.questions.filter(q => q.family === 'negative.fake_person').map(q => q.expected.values.fake);
  assert.equal(fakeNames.length, 15);
  for (const name of fakeNames) {
    const result = await findPeople(deps, { name });
    assert.equal(result.ok, true, name);
    assert.deepEqual(result.data, { people: [], candidates: [], match_status: 'no_match' }, name);
    assert.deepEqual(result.cite, []);
    assert.match(result.notes.join(' '), /OPAX has no record of a parliamentarian named/);
    assert.ok(result.notes.join(' ').includes(name));
    assert.equal(result.data.clarification, undefined);
  }
});

test('matching requires every supplied name part, without substring or nearest-name fallback', async () => {
  for (const name of [
    'Anthony Thistlewood', 'Ingrid Albanese', 'Jacqui Lambieworth', 'Ingrid Stitt-Moore',
    'Ingrid Alexandra Stitt', 'An Wong', 'Albanes', 'Alban', 'Tyrrellson', 'Unlisted Person',
  ]) {
    const result = await findPeople(deps, { name });
    assert.equal(result.data.match_status, 'no_match', name);
    assert.deepEqual(result.data.people, [], name);
    assert.deepEqual(result.data.candidates, [], name);
    assert.equal(result.data.clarification, undefined, name);
  }
  const bothMisspelt = resolvePersonName('Jonn Smitn', [person('John Smith', '1')]);
  assert.equal(bothMisspelt.status, 'no_match');
});

test('exact matches beat fuzzy alternatives regardless of speech count', async () => {
  const people = [person('John Smith', '1', 1), person('Joan Smith', '2', 10000)];
  const result = await findPeople(depsFor(people), { name: 'John Smith' });
  resolved(result, 'John Smith');
  assert.deepEqual(result.data.candidates.map(p => p.confidence), [1, 0.95]);
});

test('equal real matches ask for clarification without resolving the first candidate', async () => {
  const people = [person('John Smith', '1', 1), person('Joan Smith', '2', 10000)];
  for (const ordered of [people, people.toReversed()]) {
    const result = await findPeople(depsFor(ordered), { name: 'Jonn Smith', limit: 1 });
    assert.equal(result.data.match_status, 'ambiguous');
    assert.deepEqual(result.data.people, []);
    assert.equal(result.data.candidates.length, 2);
    assert.equal(result.data.candidates[0].confidence, result.data.candidates[1].confidence);
    assert.match(result.data.clarification, /John Smith/);
    assert.match(result.data.clarification, /Joan Smith/);
    assert.deepEqual(result.cite, []);
  }
  const nicknameTie = await findPeople(deps, { name: 'Rob Brown' });
  assert.equal(nicknameTie.data.match_status, 'ambiguous');
  assert.deepEqual(nicknameTie.data.candidates.map(p => p.name).sort(), ['Bob Brown', 'Robert Brown']);
});

test('one-word lookups retain genuine ambiguity, even beside surname-first aliases', async () => {
  const result = await findPeople(deps, { name: 'Bob' });
  assert.equal(result.data.match_status, 'ambiguous');
  assert.deepEqual(result.data.people, []);
  assert.ok(result.data.candidates.length > 1);
  assert.ok(result.data.candidates.every(p => p.confidence === result.data.candidates[0].confidence));
  resolved(await findPeople(deps, { name: 'Albanese' }), 'Anthony Albanese');
});

test('Jnr and Snr distinguish different people and do not break ties when omitted', async () => {
  const people = [person('John Smith Jnr', '1'), person('John Smith Snr', '2', 10000)];
  resolved(await findPeople(depsFor(people), { name: 'Smith John Junior' }), 'John Smith Jnr');
  resolved(await findPeople(depsFor(people), { name: 'John Smith Sr.' }), 'John Smith Snr');
  assert.equal((await findPeople(depsFor(people), { name: 'John Smith' })).data.match_status, 'ambiguous');
  // The published Bob Katter aliases explicitly identify junior, even though
  // the most common indexed spelling omits the suffix.
  assert.equal((await findPeople(deps, { name: 'Bob Katter Snr' })).data.match_status, 'no_match');
});

test('middle names can be omitted, but supplied middle names must match', async () => {
  const people = [person('Brendan Patrick John O’Connor', '1')];
  for (const name of ["Brendan O'Connor", "Brendan John O'Connor", "O'Connor Brendan Patrick John"])
    resolved(await findPeople(depsFor(people), { name }), 'Brendan Patrick John O’Connor');
  assert.equal((await findPeople(depsFor(people), { name: "Brendan James O'Connor" })).data.match_status, 'no_match');
});

test('different roster IDs remain distinct even when their names are identical', async () => {
  const result = await findPeople(depsFor([person('John Smith', '1'), person('John Smith', '2')]), { name: 'John Smith' });
  assert.equal(result.data.match_status, 'ambiguous');
  assert.deepEqual(result.data.people, []);
  assert.equal(result.data.candidates.length, 2);
});

test('missing roster data is a tool failure, not evidence that a person does not exist', async () => {
  const result = await findPeople({ ...deps, asset: async () => null }, { name: 'Jacqui Lambie' });
  assert.equal(result.ok, false);
  assert.match(result.error, /roster is unavailable/);
  assert.deepEqual(result.cite, []);
});

test('name lookups reject empty input and bound candidate output without changing the winner', async () => {
  assert.equal((await findPeople(deps, { name: ' ' })).ok, false);
  resolved(await findPeople(deps, { name: 'Jacqui Lamby', limit: -1 }), 'Jacqui Lambie');
  assert.ok((await findPeople(deps, { name: 'John', limit: 1000 })).data.candidates.length <= 10);
  const long = await findPeople(deps, { name: 'Ingrid '.repeat(1000) });
  assert.equal(long.data.match_status, 'no_match');
});


test('a service-only profile establishes identity without claiming a zero speech count', async () => {
 const result = await findPeople(depsFor([{...person('Bill Example','19999',0),roster_only:true,aliases:['William Example']}]),{name:'William Example'});
 resolved(result,'Bill Example');
 assert.equal(result.data.people[0].speeches_indexed,null);
 assert.match(result.notes.join(' '),/no speech total is published/);
});
