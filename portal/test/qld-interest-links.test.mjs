import {personSlug,slugIndex} from '../src/person-slug.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {interestHref, interestPerson} from '../../scripts/build_search_catalog.mjs';
import {searchCatalog} from '../src/catalog-search.ts';

test('an exact speaker name keeps its profile when the directory has no match', () => {
  const register = {name: 'Ann Leahy', jurisdiction: 'qld', source_url: 'https://register.example/qld.pdf'};
  const speakers = new Set(['Ann Leahy']);
  assert.equal(interestHref(register, null, speakers), '/subject/person/ann-leahy');
  assert.equal(interestHref({...register, name: 'ann leahy'}, null, speakers), register.source_url);
  assert.equal(interestHref({...register, name: 'Unknown Member'}, null, speakers), register.source_url);
  assert.equal(interestHref(register, {name: 'Resolved Member'}, speakers), '/subject/person/resolved-member');
});

test('Queensland Robert Katter cannot borrow Bob Katter’s federal alias or speaker name', () => {
  const register = {name: 'Robert Katter', jurisdiction: 'qld', source_url: 'https://register.example/qld.pdf'};
  const person = interestPerson(register, 'n-robert-katter', [
    {name: 'Bob Katter', pid: '10352', states: ['federal'], current: true},
  ], {'robert katter': '10352', 'bob katter': '10352'});
  assert.equal(person, null);
  assert.equal(interestHref(register, person, new Set(['Bob Katter', 'Rob Katter'])), register.source_url);
});

const root = new URL('../public/', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const assets = {fetch: async request => {
  const path = new URL(request.url).pathname;
  assert.match(path, /^\/search-catalog\//);
  try { return new Response(await readFile(new URL('.' + path, root))); }
  catch { return new Response('missing', {status: 404}); }
}};

test('rebuilt Queensland interest records retain exact speaker profiles and otherwise use the register', async () => {
  const [roster, index, speakers] = await Promise.all([
    read('parliamentarians.json'), read('interests/index.json'), read('speakers.json'),
  ]);
  const speakerNames = new Set(speakers.map(([name]) => name));
  for (const file of await readdir(new URL('interests/', root))) {
    if (!file.endsWith('.json') || ['index.json', 'recent.json', 'ties-by-donor.json'].includes(file)) continue;
    const register = await read('interests/' + file);
    if (register.jurisdiction !== 'qld' || !Object.values(register.buckets || {}).some(b => b.items?.length)) continue;
    const person = interestPerson(register, file.slice(0, -5), roster.people, index._by_name);
    const profileName = person?.name || (speakerNames.has(register.name) ? register.name : null);
    const expected = profileName ? '/subject/person/' + (slugIndex(roster.people).slugOf.get(profileName) || personSlug(profileName)) : register.source_url;
    const data = await searchCatalog(new URL('https://opax.test/api/search-all?' + new URLSearchParams({
      q: register.name, kind: 'interest', state: 'qld', per: '100',
    })), assets);
    const rows = data.results.filter(r => r.source === 'Register of interests'
      && r.title.startsWith(register.name + ' — ') && r.url === register.source_url);
    assert.ok(rows.length, file);
    assert.ok(rows.every(r => r.href === expected), file);
  }
});
