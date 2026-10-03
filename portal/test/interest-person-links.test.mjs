import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {interestHref, interestPerson} from '../../scripts/build_search_catalog.mjs';
import {searchCatalog} from '../src/catalog-search.ts';

const root = new URL('../public/', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
// These fixed examples are fixtures, independent of the refreshed public exports.
const cases = [
  ['10784', 'Antony Pasin', 'Tony Pasin'],
  ['10922', 'Patrick Conaghan', 'Pat Conaghan'],
  ['n-alison-brynes', 'Alison Brynes', 'Alison Byrnes'],
  ['10352', 'Robert Katter', 'Bob Katter'],
  ['10874', 'Rebeka Sharkie', 'Rebekha Sharkie'],
  ['10809', 'James Chalmers', 'Jim Chalmers'],
];
const fixturePeople = cases.map(([pid, , name]) => ({name, pid: /^\d+$/.test(pid) ? pid : '10973', states: ['federal'], current: true}));
fixturePeople.unshift({name: 'Patrick Conaghan', pid: '10903', states: ['federal']});
const fixtureNames = {'alison byrnes': 'n-alison-brynes', 'rebekha sharkie': '10874', 'bob katter': '10352', 'patrick conaghan': '10922'};

test('register IDs and aliases resolve formal names and spelling errors', () => {
  for (const [id, name, expected] of cases) {
    assert.equal(interestPerson({name, jurisdiction: 'federal'}, id, fixturePeople, fixtureNames)?.name, expected);
  }
});

test('a familiar spelling cannot override a different person ID; exact identities beat shared-ID historic names', () => {
  const pat = interestPerson({name: 'Patrick Conaghan', jurisdiction: 'federal'}, '10922', fixturePeople, fixtureNames);
  assert.equal(pat.pid, '10922');
  assert.notEqual(pat.name, 'Patrick Conaghan');
  for (const [id, name] of [['10964', 'Dorinda Cox'], ['10959', 'Andrew McLachlan'], ['10921', 'Libby Coker'], ['10912', 'Mehreen Faruqi'], ['11010', 'David Shoebridge']]) {
    const people = [{name: 'Other Historic Name', pid: id, states: ['federal'], current: true}, {name, pid: id, states: ['federal']}];
    assert.equal(interestPerson({name, jurisdiction: 'federal'}, id, people, {})?.name, name);
  }
});

test('a missing profile in another jurisdiction does not borrow federal aliases', () => {
  const register = {name: 'Robert Katter', jurisdiction: 'qld', source_url: 'https://register.example/qld.pdf'};
  const person = interestPerson(register, 'n-robert-katter', fixturePeople, fixtureNames);
  assert.equal(person, null);
  assert.equal(interestHref(register, person, new Set(['Bob Katter'])), register.source_url);
});

const assets = {fetch: async request => {
  const path = new URL(request.url).pathname;
  assert.match(path, /^\/search-catalog\//);
  try { return new Response(await readFile(new URL('.' + path, root))); }
  catch { return new Response('missing', {status: 404}); }
}};
const find = (q, extra = {}) => searchCatalog(new URL('https://opax.test/api/search-all?' + new URLSearchParams({q, kind: 'interest', per: '100', ...extra})), assets);

test('rebuilt search returns correct person links for both register and canonical names', async () => {
  const [roster, index] = await Promise.all([read('parliamentarians.json'), read('interests/index.json')]);
  for (const file of await registerFiles()) {
    const register = await read('interests/' + file);
    const person = interestPerson(register, file.slice(0, -5), roster.people, index._by_name);
    if (register.jurisdiction !== 'federal' || !person || person.name === register.name
      || !Object.values(register.buckets || {}).some(b => b.items?.length)) continue;
    for (const query of [register.name, person.name]) {
      const data = await find(query, {state: 'federal'});
      const rows = data.results.filter(r => r.source === 'Register of interests'
        && r.title.startsWith(register.name + ' — ') && r.url === register.source_url);
      assert.ok(rows.length, query);
      assert.ok(rows.every(r => r.href === '/subject/person/' + encodeURIComponent(person.name)), query);
    }
  }
});

const registerFiles = async () => (await readdir(new URL('interests/', root)))
  .filter(file => file.endsWith('.json') && !['index.json', 'recent.json', 'ties-by-donor.json'].includes(file));

test('every refreshed register links to a resolved profile, exact speaker name or its official source', async () => {
  const [roster, index, speakers] = await Promise.all([read('parliamentarians.json'), read('interests/index.json'), read('speakers.json')]);
  const speakerNames = new Set(speakers.map(([name]) => name));
  for (const file of await registerFiles()) {
    const register = await read('interests/' + file);
    const person = interestPerson(register, file.slice(0, -5), roster.people, index._by_name);
    const href = interestHref(register, person, speakerNames);
    if (person) {
      assert.ok(person.states.includes(register.jurisdiction), file);
      assert.equal(href, '/subject/person/' + encodeURIComponent(person.name), file);
    } else if (speakerNames.has(register.name)) {
      assert.equal(href, '/subject/person/' + encodeURIComponent(register.name), file);
    } else {
      assert.match(href, /^https:\/\//, file);
      assert.equal(href, register.source_url, file);
    }
  }
});
