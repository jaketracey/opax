import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { canonicalRecordPath, recordPathShard, recordPathIndex, lookupRecordPath, RECORD_PATH_SHARDS } from '../public/record-paths.js';

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
const index = catalog ?? { version: '0123456789abcdef', shards: recordPathIndex(SYNTHETIC) };
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
  // Every path the build indexed comes back with its title.
  let indexed = 0;
  for (const shard of catalog.shards) {
    for (const [path, title] of Object.entries(shard)) {
      indexed++;
      assert.deepEqual(await lookupRecordPath(path, fetchIndex), { path, title }, path);
      // The decoded form an address bar shows finds the same record.
      assert.deepEqual(await lookupRecordPath(path.split('/').map(decodeURIComponent).join('/'), fetchIndex), { path, title }, path);
    }
  }
  // And every plain path a catalog record links to names one of that page's
  // own records, or nothing when no single record owns it.
  const titles = new Map();
  for (const r of catalog.records) {
    if (!String(r.href).startsWith('/') || String(r.href).startsWith('//') || /[?#]/.test(r.href)) continue;
    const path = canonicalRecordPath(r.href);
    if (path) titles.set(path, (titles.get(path) ?? new Set()).add(r.title.trim()));
  }
  const unnamed = [];
  for (const [path, own] of titles) {
    const found = await lookupRecordPath(path, fetchIndex);
    if (found) assert.ok(own.has(found.title), path); else unnamed.push(path);
  }
  t.diagnostic(`${indexed} record pages indexed; ${titles.size - unnamed.length} of ${titles.size} catalog paths name a record; ${unnamed.length} have no single owner (${unnamed.slice(0, 3).join(' | ')})`);
  assert.equal(indexed, titles.size - unnamed.length);
  assert.ok(unnamed.length / titles.size < 0.005, `${unnamed.length} unnamed`);
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
