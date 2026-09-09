import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
// Execute the actual metadata/route functions, without booting unrelated RAG
// and image-rendering dependencies. TypeScript's parser supplies the boundaries.
const names = new Set(['DIRECTORY_KINDS', 'isDirectoryKind', 'STATIC_PAGES', 'SUBJECT_NAME_MAX', 'CAMPAIGNER_NAME_MAX', 'SUPPLIER_NAME_MAX', 'BILL_KEY_MAX', 'BILL_KEY_RE',
  'matchSeoRoute', 'supplierNameKey', 'suppliersMemo', 'loadSuppliers', 'supplierMeta', 'buildMeta',
  'escHtml', 'escXml', 'clip', 'withTail', 'num', 'money', 'years', 'indexLinks', 'prerenderBlock', 'canonicalFor', 'publisher', 'sitemapXml']);
const statements = parsed.statements.filter((node) => {
  if (ts.isFunctionDeclaration(node)) return names.has(node.name?.text);
  return ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.has(d.name.getText(parsed)));
});
const code = ts.transpileModule(statements.map((node) => node.getText(parsed)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const id = 's-0123456789abcdef0123';
const otherId = 's-abcdef0123456789abcd';
const supplier = (overrides = {}) => ({ id, name: 'Acme Pty Ltd', abn: '12345678901', aliases: ['Acme Corporation'], lookup_names: ['Acme Funding Identity'], total: 12000000, count: 24, agency_count: 3, first_year: 2018, last_year: 2025, ...overrides });

function harness(rows = [supplier()], loader) {
  let requests = 0;
  const context = {
    URL, Request, Response, SITE_ORIGIN: 'https://opax.com.au', SITE_TITLE: 'OPAX', SITE_DESCRIPTION: 'Parliamentary records', TOPIC_NAMES: {},
    assetJson: async (_env, path) => { assert.equal(path, '/suppliers.json'); requests++; return loader ? loader() : { meta: { generated_at: '2026-09-07T00:00:00Z' }, suppliers: rows }; },
    cachedJson: async (_key, fn) => fn(),
    loadPeople: async () => ({ people: [] }), loadMoney: async () => ({ parties: new Map(), donors: new Map() }),
    loadAgencies: async () => null, loadElectorates: async () => null,
    loadReports: async () => ({ reports: [] }), loadCampaigners: async () => null,
  };
  runInNewContext(code, context);
  return { context, requests: () => requests, meta: (name) => context.supplierMeta(name, new URL(`https://opax.com.au/subject/supplier/${encodeURIComponent(name)}?tracking=1`), {}) };
}

test('supplier directory and encoded name routes match, malformed and extra paths do not', () => {
  const { context } = harness();
  const route = (path) => context.matchSeoRoute(new URL(`https://opax.com.au${path}`));
  assert.equal(route('/subject/supplier').kind, 'index');
  assert.equal(route('/subject/supplier').dir, 'supplier');
  assert.equal(route('/subject/supplier/Acme%20Pty%20Ltd').name, 'Acme Pty Ltd');
  assert.equal(route(`/subject/supplier/${id}/`).name, id);
  assert.equal(route('/subject/supplier/%ZZ'), null);
  assert.equal(route('/subject/supplier/name/extra'), null);
  assert.equal(route(`/subject/supplier/${'x'.repeat(501)}`), null);
});

test('known identity and exact source alias produce the same canonical profile and award facts', async () => {
  const h = harness();
  const canonical = `https://opax.com.au/subject/supplier/${id}`;
  for (const name of [id, ' acme pty ltd ', 'ACME CORPORATION', 'Acme Funding Identity']) {
    const meta = await h.meta(name);
    assert.equal(meta.status, 200);
    assert.equal(meta.canonical, canonical);
    assert.match(meta.prerender, /24 contracts and 3 agencies/);
    assert.match(meta.prerender, /2018 to 2025/);
    assert.match(meta.prerender, /Award values are not expenditure/);
    assert.equal(meta.jsonLd.mainEntity.identifier.value, '12345678901');
  }
  assert.equal(h.requests(), 1, 'index is reused within an isolate');
});

test('unknown and prefix names produce genuine 404s without fabricated profile data', async () => {
  const h = harness();
  for (const name of ['Acme', 'Completely unknown', otherId]) {
    const meta = await h.meta(name);
    assert.equal(meta.status, 404);
    assert.equal(meta.jsonLd, null);
    assert.equal(meta.card, null);
  }
});

test('ambiguous names and aliases never merge suppliers with distinct identities', async () => {
  const h = harness([supplier(), supplier({ id: otherId, abn: '98765432101' })]);
  const chooser = await h.meta('Acme Pty Ltd');
  assert.equal(chooser.status, 200);
  assert.equal(chooser.jsonLd, null);
  assert.equal(chooser.card, null);
  assert.match(chooser.title, /Choose a supplier/);
  assert.ok(chooser.prerender.includes(id) && chooser.prerender.includes(otherId));
  assert.equal((await h.meta('Acme Corporation')).status, 200);
  assert.match((await h.meta('Acme Funding Identity')).title, /Choose a supplier/);
  assert.equal((await h.meta(id)).status, 200);
  assert.equal((await h.meta(otherId)).jsonLd.mainEntity.identifier.value, '98765432101');
});

test('duplicate alias spellings within one supplier remain resolvable', async () => {
  const h = harness([supplier({ aliases: ['ACME PTY LTD', 'Acme Pty Ltd'] })]);
  assert.equal((await h.meta('acme pty ltd')).status, 200);
});

test('missing or malformed export yields 503 and a failed load can recover', async () => {
  let fail = true;
  const h = harness([], () => { if (fail) throw new Error('offline'); return { suppliers: [supplier()] }; });
  assert.equal((await h.meta(id)).status, 503);
  fail = false;
  assert.equal((await h.meta(id)).status, 200);
  assert.equal((await harness([], () => ({})).meta(id)).status, 503);
  assert.equal((await harness([supplier({ total: Infinity })]).meta(id)).status, 503);
});

test('metadata escapes supplier text and links to the new directory', async () => {
  const meta = await harness([supplier({ name: '<script>alert("x")</script> & Co' })]).meta(id);
  assert.doesNotMatch(meta.prerender, /<script>/);
  assert.match(meta.prerender, /&lt;script&gt;/);
  assert.match(meta.prerender, /href="\/subject\/supplier"/);
  assert.equal(meta.canonical, `https://opax.com.au/subject/supplier/${id}`);
});

test('directory metadata reports real coverage and unavailable status', async () => {
  const h = harness();
  const url = new URL('https://opax.com.au/subject/supplier');
  const meta = await h.context.buildMeta({ kind: 'index', dir: 'supplier' }, url, new Request(url), {}, {});
  assert.equal(meta.status, 200);
  assert.match(meta.description, /1 suppliers/);
  assert.match(meta.description, /Commonwealth/);
  assert.equal(meta.jsonLd['@type'], 'CollectionPage');
  const offline = harness([], () => { throw new Error('offline'); });
  assert.equal((await offline.context.buildMeta({ kind: 'index', dir: 'supplier' }, url, new Request(url), {}, {})).status, 503);
});

test('sitemap publishes stable supplier IDs, not ambiguous name aliases', async () => {
  const h = harness([supplier(), supplier({ id: otherId })]);
  const xml = await (await h.context.sitemapXml({})).text();
  assert.match(xml, /\/subject\/supplier<\/loc>/);
  assert.ok(xml.includes(`/subject/supplier/${id}</loc>`));
  assert.ok(xml.includes(`/subject/supplier/${otherId}</loc>`));
  assert.ok(!xml.includes('Acme'));
});

test('published supplier index is accepted and canonicalizes a real profile', async () => {
  const raw = JSON.parse(readFileSync(new URL('../public/suppliers.json', import.meta.url), 'utf8'));
  const h = harness([], () => raw);
  assert.ok(raw.suppliers.length > 0);
  const first = raw.suppliers[0];
  const meta = await h.meta(first.id);
  assert.equal(meta.status, 200);
  assert.equal(meta.jsonLd.mainEntity.name, first.name);
  assert.equal(meta.canonical, `https://opax.com.au/subject/supplier/${first.id}`);
  assert.equal((await h.context.loadSuppliers({})).byId.size, raw.suppliers.length);
});
