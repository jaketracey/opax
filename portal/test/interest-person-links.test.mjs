import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {interestPerson} from '../../scripts/build_search_catalog.mjs';
import {searchCatalog} from '../src/catalog-search.ts';

const root = new URL('../public/', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const [roster, index] = await Promise.all([read('parliamentarians.json'), read('interests/index.json')]);
const cases = [
  ['10784', 'Antony Pasin', 'Tony Pasin'],
  ['10922', 'Patrick Conaghan', 'Pat Conaghan'],
  ['n-alison-brynes', 'Alison Brynes', 'Alison Byrnes'],
  ['10352', 'Robert Katter', 'Bob Katter'],
  ['10874', 'Rebeka Sharkie', 'Rebekha Sharkie'],
  ['10809', 'James Chalmers', 'Jim Chalmers'],
];

test('register IDs and the exported alias index resolve all six reported spellings', async () => {
  for (const [id, name, expected] of cases) {
    const register = await read(`interests/${id}.json`);
    assert.equal(register.name, name);
    assert.equal(interestPerson(register, id, roster.people, index._by_name)?.name, expected);
  }
});

test('a familiar spelling cannot override a different person ID; exact identities beat shared-ID historic names', async () => {
  const pat = interestPerson(await read('interests/10922.json'), '10922', roster.people, index._by_name);
  assert.equal(pat.pid, '10922');
  assert.notEqual(pat.name, 'Patrick Conaghan');
  for (const [id, name] of [['10964', 'Dorinda Cox'], ['10959', 'Andrew McLachlan'], ['10921', 'Libby Coker'], ['10912', 'Mehreen Faruqi'], ['11010', 'David Shoebridge']]) {
    assert.equal(interestPerson(await read(`interests/${id}.json`), id, roster.people, index._by_name)?.name, name);
  }
});

test('the Queensland Robert Katter never borrows Bob Katter’s federal profile or aliases', async () => {
  const register = await read('interests/n-robert-katter.json');
  assert.equal(register.jurisdiction, 'qld');
  assert.equal(interestPerson(register, 'n-robert-katter', roster.people, index._by_name), null);
  const records = await find('Robert Katter', {state: 'qld'});
  const published = records.results.filter(r => r.source === 'Register of interests');
  assert.ok(published.length);
  assert.ok(published.every(r => r.href === register.source_url));
});

const assets = {fetch: async request => {
  const path = new URL(request.url).pathname;
  assert.match(path, /^\/search-catalog\//);
  try { return new Response(await readFile(new URL('.' + path, root))); }
  catch { return new Response('missing', {status: 404}); }
}};
const find = (q, extra = {}) => searchCatalog(new URL('https://opax.test/api/search-all?' + new URLSearchParams({q, kind: 'interest', per: '100', ...extra})), assets);

test('rebuilt search returns correct person links for both register and canonical names', async () => {
  for (const [, name, expected] of cases) {
    for (const query of [name, expected]) {
      const data = await find(query, {state: 'federal'});
      const rows = data.results.filter(r => r.source === 'Register of interests' && r.title.startsWith(name + ' — '));
      assert.ok(rows.length, query);
      assert.ok(rows.every(r => r.href === '/subject/person/' + encodeURIComponent(expected)), query);
      assert.ok(rows.some(r => r.title.startsWith(name + ' — ')), 'retain the name printed in the register');
    }
  }
});

test('every exported register resolves within its jurisdiction or keeps its official source', async () => {
  for (const file of await readdir(new URL('interests/', root))) {
    if (!file.endsWith('.json') || ['index.json', 'recent.json', 'ties-by-donor.json'].includes(file)) continue;
    const register = await read('interests/' + file);
    const person = interestPerson(register, file.slice(0, -5), roster.people, index._by_name);
    if (person) assert.ok(person.states.includes(register.jurisdiction), file);
    else assert.match(register.source_url, /^https:\/\//, file);
  }
});
