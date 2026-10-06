import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { canonicalRecordPath, recordPathShard, recordPathIndex, lookupRecordPath, RECORD_PATH_SHARDS } from '../public/record-paths.js';
import { personSlugPaths } from '../../scripts/build_search_catalog.mjs';
import { personSlug, slugIndex } from '../src/person-slug.ts';

// /support?record=<path> names a record, by its title, and puts its path in
// the public GitHub issue only when the path is exactly the page of a record
// OPAX publishes. Everything else, and any failure, leaves the report general.

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
// The record value as /support receives it: the outer query decoded once.
const received = (query) => new URLSearchParams(query).get('record');
// OPAX's own sign-in, session and deletion tokens (src/community-core.ts),
// from the real generator: 32 random bytes as base64url, 43 characters.
const core = readFileSync(new URL('../src/community-core.ts', import.meta.url), 'utf8');
const randomToken = runInNewContext(`(${core.match(/export const randomToken = (\(\) => \{[^\n]*\})/)[1]})`, { crypto, btoa, Uint8Array, String });

// A fetchJson over a version's index files, served from memory.
function served(version, shards) {
  return async (url) => {
    if (url === '/search-catalog/manifest.json') return { version };
    const m = new RegExp(`^/search-catalog/${version}/paths-(\\d+)\\.json$`).exec(url);
    if (!m || !shards[Number(m[1])]) throw new Error(`404 ${url}`);
    return shards[Number(m[1])];
  };
}
// The search catalog as `npm run build:search` wrote it (build output; the
// deploy workflow builds it before the tests), or null when it is not built.
function builtCatalog() {
  const root = new URL('../public/search-catalog/', import.meta.url);
  if (!existsSync(root)) return null;
  const dir = readdirSync(root, { withFileTypes: true }).find((d) => d.isDirectory() && existsSync(new URL(`${d.name}/paths-0.json`, root)));
  if (!dir) return null;
  const base = new URL(`${dir.name}/`, root);
  const read = (name) => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
  const shards = Array.from({ length: RECORD_PATH_SHARDS }, (_, i) => read(`paths-${i}.json`));
  const records = readdirSync(base).filter((f) => f.startsWith('records-')).flatMap((f) => read(f));
  return { version: dir.name, shards, records };
}
const catalog = builtCatalog();
const SYNTHETIC = [
  { kind: 'person', title: 'Tony Abbott', href: '/subject/person/Tony%20Abbott' },
  { title: 'Kim O’Keeffe', href: '/subject/person/Kim%20O%E2%80%99Keeffe' },
  { title: 'Example Supplier Pty Ltd', href: '/subject/supplier/s-f7cb920c42fc7e570eeb' },
  { title: 'An example bill', href: '/bill/au-federal-r5113' },
  { title: 'Gambling', href: '/reports/gambling' },
  { title: 'One receipt', href: '/money' }, { title: 'Another receipt', href: '/money' },
  { kind: 'expense', title: 'Tony Abbott — parliamentary expenses', href: '/subject/person/Tony%20Abbott' },
  { kind: 'grant', title: 'Surgery Connect — Gold Coast Private Hospital', href: '/money/grants/qld/recipient/abn%3A18908705810' },
  { kind: 'grant', title: 'Gold Coast Private Hospital', href: '/money/grants/qld/recipient/abn%3A18908705810', owner: true },
  { kind: 'grant', title: 'Screening — Gold Coast Private Hospital', href: '/money/grants/qld/recipient/abn%3A18908705810' },
  { title: 'A filtered view', href: '/money/grants?jur=federal&program=GO3141' },
  { title: 'Elsewhere', href: 'https://www.data.qld.gov.au/dataset/x' },
];
// The roster the build gives slugs to; for the synthetic index, its two people.
const roster = catalog ? JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8')).people
  : [{ name: 'Tony Abbott', speeches: 5878 }, { name: 'Kim O’Keeffe', speeches: 40 }];
const index = catalog ?? { version: '0123456789abcdef', shards: recordPathIndex(SYNTHETIC, personSlugPaths(roster)) };
const fetchIndex = served(index.version, index.shards);

test('the first filter: one decode, no query or fragment, no dot segments or encoded separators', () => {
  for (const [given, kept] of [
    ['/subject/person/Tony Abbott', '/subject/person/Tony%20Abbott'],
    ['/subject/person/Tony%20Abbott', '/subject/person/Tony%20Abbott'],
    ['/subject/person/Kim O’Keeffe', '/subject/person/Kim%20O%E2%80%99Keeffe'],
    ['/doc/abc?email=person%40example.invalid&token=synthetic-token#note', '/doc/abc'],
    ['/bills/', '/bills'],
  ]) assert.equal(canonicalRecordPath(given), kept, given);
  for (const bad of [
    '/doc/..', '/doc/.', '/doc/a/..', '/doc/../community', '/subject/person/../../community', '/doc/%2e%2e/community',
    '/doc/%2E%2E', '/doc/.%2e', '/doc/%2F..%2Fcommunity', '/doc/%2Fcommunity', '/doc/%5Cevil.example', '/doc/%2520',
    '/doc/%E0%A4%A', '/doc/abc%00', '//evil.example', '/\\evil.example', 'https://evil.example/doc', 'javascript:alert(1)',
    'doc/abc', '', null, undefined,
  ]) assert.equal(canonicalRecordPath(bad), '', String(bad));
  for (const query of ['record=%2Fdoc%2F..%2Fcommunity', 'record=%2Fdoc%2F%252e%252e%2Fcommunity', 'record=%252Fdoc%252F..%252Fcommunity']) {
    assert.equal(canonicalRecordPath(received(query)), '', query);
  }
});

test('the index holds plain record paths, each with the title of the record that owns the page', () => {
  const shards = recordPathIndex(SYNTHETIC);
  const all = Object.assign({}, ...shards);
  assert.equal(all['/subject/person/Tony%20Abbott'], 'Tony Abbott', 'the person record owns the page its expenses link to');
  assert.equal(all['/money/grants/qld/recipient/abn%3A18908705810'], 'Gold Coast Private Hospital', 'the recipient record owns its page');
  assert.equal(all['/subject/person/Kim%20O%E2%80%99Keeffe'], 'Kim O’Keeffe');
  assert.equal(shards[recordPathShard('/reports/gambling')]['/reports/gambling'], 'Gambling');
  assert.equal(all['/money'], undefined, 'a path several records share is a listing, not a record');
  assert.equal(all['/money/grants'], undefined, 'a link with a query names no record by its path');
  assert.equal(Object.keys(all).some((k) => k.includes('data.qld')), false);
});

test('every record page in the search catalog round-trips to a real title', { skip: !catalog && 'no search catalog built' }, async (t) => {
  // The plain paths catalog records link to, with their records' titles.
  const titles = new Map();
  for (const r of catalog.records) {
    if (!String(r.href).startsWith('/') || String(r.href).startsWith('//') || /[?#]/.test(r.href)) continue;
    const path = canonicalRecordPath(r.href);
    if (path) titles.set(path, (titles.get(path) ?? new Set()).add(r.title.trim()));
  }
  // Every path the build indexed comes back with its title. One no record
  // links to is a person's slug, with the title of their name path.
  const all = Object.assign({}, ...catalog.shards);
  const slugs = new Map(personSlugPaths(roster).map(([slug, name]) => [canonicalRecordPath(slug), canonicalRecordPath(name)]));
  let indexed = 0, slugged = 0;
  for (const shard of catalog.shards) {
    for (const [path, title] of Object.entries(shard)) {
      indexed++;
      assert.deepEqual(await lookupRecordPath(path, fetchIndex), { path, title }, path);
      // The decoded form an address bar shows finds the same record.
      assert.deepEqual(await lookupRecordPath(path.split('/').map(decodeURIComponent).join('/'), fetchIndex), { path, title }, path);
      if (titles.has(path)) continue;
      assert.ok(slugs.has(path), `${path} is neither a catalog path nor a person's slug`);
      assert.equal(title, all[slugs.get(path)], path);
      slugged++;
    }
  }
  // And every plain path a catalog record links to names one of that page's
  // own records, or nothing when no single record owns it.
  const unnamed = [];
  for (const [path, own] of titles) {
    const found = await lookupRecordPath(path, fetchIndex);
    if (found) assert.ok(own.has(found.title), path); else unnamed.push(path);
  }
  t.diagnostic(`${indexed} record pages indexed; ${titles.size - unnamed.length} of ${titles.size} catalog paths name a record; ${unnamed.length} have no single owner (${unnamed.slice(0, 3).join(' | ')}); ${slugged} person slugs`);
  assert.equal(indexed, titles.size - unnamed.length + slugged);
  assert.ok(unnamed.length / titles.size < 0.005, `${unnamed.length} unnamed`);
});

// Person pages have two addresses: the name the catalog links, and the slug the
// router settles on (src/person-slug.ts), which a report from the page carries.
test('a person page is named by its slug as well as its name, with one title for both', () => {
  // Two twin spellings: the fuller entry holds the shared slug, and the other
  // keeps its name as its only address, as the router has it.
  const people = [
    { name: 'Tony Abbott', speeches: 5878 }, { name: 'Kim O’Keeffe', speeches: 40 },
    { name: 'Stephen Smith', speeches: 1167 }, { name: 'Stephen-Smith', full: 'Rachel Stephen-Smith', speeches: 742 },
    { name: "Brendan O'Connor", speeches: 879 }, { name: 'Brendan O’Connor', speeches: 598 },
  ];
  const records = [...SYNTHETIC, ...people.slice(2).map((p) => ({ kind: 'person', title: p.full ?? p.name, href: `/subject/person/${encodeURIComponent(p.name)}` }))];
  const before = Object.assign({}, ...recordPathIndex(records));
  const after = Object.assign({}, ...recordPathIndex(records, personSlugPaths(people)));
  assert.equal(after['/subject/person/tony-abbott'], 'Tony Abbott');
  assert.equal(after['/subject/person/Tony%20Abbott'], 'Tony Abbott');
  assert.equal(after['/subject/person/kim-okeeffe'], 'Kim O’Keeffe');
  assert.equal(after['/subject/person/stephen-smith'], 'Stephen Smith', 'the fuller entry holds the slug');
  assert.equal(after['/subject/person/Stephen-Smith'], 'Rachel Stephen-Smith', 'the twin keeps its name address and title');
  assert.equal(after['/subject/person/brendan-oconnor'], "Brendan O'Connor");
  assert.equal(after['/subject/person/Brendan%20O%E2%80%99Connor'], 'Brendan O’Connor');
  // Only the slugs are new; every other path, person or not, is as it was.
  assert.deepEqual(Object.keys(after).filter((k) => !(k in before)).sort(),
    ['/subject/person/brendan-oconnor', '/subject/person/kim-okeeffe', '/subject/person/stephen-smith', '/subject/person/tony-abbott']);
  for (const [path, title] of Object.entries(before)) assert.equal(after[path], title, path);
  // Membership stays exact: a near spelling of a slug is no address.
  for (const near of ['/subject/person/Tony-Abbott', '/subject/person/TONY-ABBOTT', '/subject/person/tony', '/subject/person/tonyabbott',
    '/subject/person/tony-abbott-1', '/subject/person/tony-abbott/expenses']) assert.equal(after[canonicalRecordPath(near)], undefined, near);
});

test('a slug never displaces a path a record links to, and names nothing without one title', () => {
  const records = [
    { kind: 'person', title: 'Somebody', href: '/subject/person/somebody' },
    { kind: 'person', title: 'A Person', href: '/subject/person/A%20Person' },
    { kind: 'person', title: 'B Person', href: '/subject/person/B%20Person' },
    { title: 'One receipt', href: '/money' }, { title: 'Another receipt', href: '/money' },
  ];
  const all = Object.assign({}, ...recordPathIndex(records, [
    ['/subject/person/somebody', '/subject/person/A%20Person'], // a record's own path
    ['/money', '/subject/person/A%20Person'], // a listing: linked, with no single title
    ['/subject/person/nobody', '/subject/person/Nobody'], // a page no record names
    ['/subject/person/receipts', '/money'],
    ['/subject/person/twice', '/subject/person/A%20Person'], ['/subject/person/twice', '/subject/person/B%20Person'],
    ['/subject/person/../community', '/subject/person/A%20Person'], ['//evil.example', '/subject/person/A%20Person'],
    ['/subject/person/a-person', '/subject/person/A Person'],
  ]));
  assert.equal(all['/subject/person/somebody'], 'Somebody');
  for (const path of ['/money', '/subject/person/nobody', '/subject/person/receipts', '/subject/person/twice', '/community']) assert.equal(all[path], undefined, path);
  assert.equal(all['/subject/person/a-person'], 'A Person');
  assert.equal(Object.keys(all).length, 4);
});

test('the built index names each roster slug as the router resolves it, twin spellings included', { skip: !catalog && 'no search catalog built' }, async (t) => {
  assert.deepEqual(await lookupRecordPath('/subject/person/tony-abbott', fetchIndex), { path: '/subject/person/tony-abbott', title: 'Tony Abbott' });
  assert.deepEqual(await lookupRecordPath('/subject/person/Tony Abbott', fetchIndex), { path: '/subject/person/Tony%20Abbott', title: 'Tony Abbott' });
  // The Worker's own lookup (src/person-slug.ts): each slug opens one person,
  // and is named by the title of that person's name path.
  const { bySlug } = slugIndex(roster);
  const nameTitle = async (p) => (await lookupRecordPath(`/subject/person/${encodeURIComponent(p.name)}`, fetchIndex))?.title;
  for (const [slug, p] of bySlug) {
    const title = await nameTitle(p);
    assert.ok(title, p.name);
    assert.deepEqual(await lookupRecordPath(`/subject/person/${slug}`, fetchIndex), { path: `/subject/person/${slug}`, title }, slug);
  }
  // A twin spelling (two roster names, one slug) keeps its own name address
  // and title, and its slug names the fuller entry.
  let twins = 0;
  for (const p of roster) {
    const holder = bySlug.get(personSlug(p.name));
    if (!holder || holder === p) continue;
    twins++;
    assert.equal(await nameTitle(p), p.full || p.name, p.name);
    assert.equal((await lookupRecordPath(`/subject/person/${personSlug(p.name)}`, fetchIndex))?.title, await nameTitle(holder), p.name);
  }
  t.diagnostic(`${bySlug.size} slugs; ${twins} twin spellings keep their name address`);
  assert.ok(twins > 0, 'the roster still has twin spellings to check');
});

test('tokens never name a record: 10,000 real randomToken() values, raw, lowercased and hyphenated, in every route', async () => {
  const dirs = ['person', 'party', 'donor', 'supplier', 'agency', 'campaigner', 'electorate'];
  const positions = (t) => [
    `/doc/${t}`, `/bill/${t}`, `/reports/${t}`, `/subject/topic/${t}`, ...dirs.map((d) => `/subject/${d}/${t}`),
    `/subject/supplier/s-${t}`, `/subject/agency/a-${t}`,
    `/money/grants/federal/recipient/name:${t}`, `/money/grants/qld/recipient/person:${t}`, `/money/grants/federal/recipient/abn:${t}`,
  ];
  // The reviewer's examples: lowercase, hyphenated, 43 characters, in the slug routes and the id fallbacks.
  for (const t of ['abcdefghij-klmnopqrst-uvwxyzabcd-efghijklmk', 'q8zr3klmn0pxyt5vwb2cd7efgh1jk4sa9uq6io3we-x']) {
    for (const path of positions(t)) assert.equal(await lookupRecordPath(path, fetchIndex), null, path);
  }
  assert.equal(await lookupRecordPath(received('record=%2Fdoc%2FAbCdEfGhIj-KlMnOpQrSt-UvWxYzAbCd-EfGhIjKlMk'), fetchIndex), null);
  const known = new Set(index.shards.flatMap((s) => Object.keys(s)));
  // The index holds slug-shaped person addresses, so the person route is a live test.
  assert.ok([...known].some((k) => /^\/subject\/person\/[a-z0-9]+(?:-[a-z0-9]+)+$/.test(k)), 'no person slugs indexed');
  let tried = 0;
  const named = [];
  for (let i = 0; i < 10_000; i++) {
    const raw = randomToken();
    assert.equal(raw.length, 43);
    const lower = raw.toLowerCase();
    const hyphenated = lower.replace(/[_-]/g, '').replace(/(.{8})(?=.)/g, '$1-');
    for (const t of [raw, lower, hyphenated]) {
      for (const path of positions(t)) {
        tried++;
        // Membership is the whole rule: a path the index does not hold names nothing.
        if (known.has(canonicalRecordPath(path))) named.push(path);
      }
    }
  }
  assert.deepEqual(named, [], `${named.length} of ${tried} token paths matched a record`);
  // And through the real lookup, for a sample of them.
  for (let i = 0; i < 200; i++) {
    for (const path of positions(randomToken())) assert.equal(await lookupRecordPath(path, fetchIndex), null, path);
  }
});

test('a lookup failure, a bad manifest or an unknown path leaves the report general', async () => {
  const real = Object.keys(Object.assign({}, ...index.shards))[0];
  assert.ok(real);
  assert.notEqual(await lookupRecordPath(real, fetchIndex), null);
  const failing = async () => { throw new Error('offline'); };
  assert.equal(await lookupRecordPath(real, failing), null, 'offline');
  assert.equal(await lookupRecordPath(real, async (url) => (url.endsWith('manifest.json') ? { version: '../../etc' } : {})), null, 'bad version');
  // A malformed manifest falls back too, even when its version would stringify
  // to a real one (["0123456789abcdef"] is "0123456789abcdef" as a string).
  for (const manifest of [{ version: [index.version] }, { version: [[index.version]] }, { version: { toString: () => index.version } },
    { version: Number.parseInt(index.version.replace(/[a-f]/g, '1'), 10) }, { version: ` ${index.version}` }, { version: index.version.toUpperCase() },
    [index.version], [{ version: index.version }], index.version, null, 42, {}]) {
    const served = async (url) => (url.endsWith('manifest.json') ? manifest : index.shards[recordPathShard(canonicalRecordPath(real))]);
    assert.equal(await lookupRecordPath(real, served), null, `malformed manifest ${JSON.stringify(manifest)}`);
  }
  // The same index behind a well-formed manifest still names the record.
  assert.notEqual(await lookupRecordPath(real, async (url) => (url.endsWith('manifest.json') ? { version: index.version } : index.shards[recordPathShard(canonicalRecordPath(real))])), null);
  assert.equal(await lookupRecordPath(real, async (url) => { if (url.endsWith('manifest.json')) return { version: index.version }; throw new Error('404'); }), null, 'shard missing');
  assert.equal(await lookupRecordPath(real, async (url) => (url.endsWith('manifest.json') ? { version: index.version } : [real])), null, 'malformed shard');
  assert.equal(await lookupRecordPath(real, async (url) => (url.endsWith('manifest.json') ? { version: index.version } : { [real]: 42 })), null, 'non-string title');
  assert.equal(await lookupRecordPath('/doc/not-a-published-record-0000', fetchIndex), null, 'unknown');
  assert.equal(await lookupRecordPath('/subject/person/toString', fetchIndex), null, 'inherited key');
});

test('/support shows the general form first, then names a record only from the lookup', () => {
  const block = app.slice(app.indexOf('// --- /support: a report names its record'), app.indexOf('// --- expense categories'));
  assert.match(block, /import\("\/record-paths\.js\?v=[\w-]+"\)/);
  assert.match(block, /showSupportRecord\(null\);\n\s+const raw = params\.get\("record"\);/);
  assert.match(block, /textContent = record\.title/);
  assert.doesNotMatch(block, /params\.get\("record"\)[^\n]*(href|textContent|supportIssueUrl)/, 'the raw value is never shown or sent');
});

test('/support is a shell route with metadata and a sitemap entry', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(html, /<section id="panel-support" class="panel" hidden/);
  assert.match(app, /const PANELS = \[[^\]]*"support"/);
  assert.match(worker, /support: \{\n\s+title: 'Support · OPAX'/);
  assert.match(worker, /'privacy', 'support'\]\) add\(`\/\$\{page\}`\)/);
  for (const page of ['index.html', 'home.html', 'community.html']) {
    assert.match(readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8'), /href="\/support"/, page);
  }
});
