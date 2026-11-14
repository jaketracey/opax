// Every real page must be named in web analytics, never counted as "/other".
// The route table is the Worker's matchSeoRoute (src/index.ts), so a route added
// there without a pattern in analytics/privacy.mjs fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { safePath } from '../analytics/privacy.mjs';
import { REPORT_COLLECTIONS } from '../public/official-reports-model.js';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const compiled = await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false,
  external: ['node:*'], logLevel: 'error',
  footer: { js: 'export {matchSeoRoute as __match, STATIC_PAGES as __static, DIRECTORY_KINDS as __dirs}' },
  plugins: [{ name: 'omit-images', setup(b) {
    b.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'images', namespace: 'routes-test' }));
    b.onLoad({ filter: /.*/, namespace: 'routes-test' }, () => ({ contents: 'export const renderOgPng=()=>{};export const renderOgJpeg=()=>{};', loader: 'js' }));
  } }],
});
const { __match: matchSeoRoute, __static: STATIC_PAGES, __dirs: DIRECTORY_KINDS } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const kindOf = (path) => matchSeoRoute(new URL(path, 'https://opax.com.au'))?.kind;

// One example address for each kind in the Worker's SeoRoute union.
const SAMPLES = {
  hub: ['/sitting', '/sitting/2026-10-14', '/estimates', '/estimates/round-1', '/vic-election-2026', '/vic-election-2026/seat', '/video/senate'],
  instruments: ['/instruments', '/instrument', '/instrument/f2026l00001'],
  budget: ['/budget'],
  'vic-gifts': ['/register/vic-gifts'],
  'state-bills': ['/register/state-bills'],
  'government-finance': ['/register/government-finance'],
  'tax-expenditures': ['/register/tax-expenditures'],
  'gov-advertising': ['/register/gov-advertising'],
  'sa-grants': ['/register/sa-grants'],
  'act-invoices': ['/register/act-invoices'],
  audit: ['/audit', '/audit/some-report'],
  'source-report': ['/report/some-report'],
  'official-reports': ['/official-reports', ...Object.values(REPORT_COLLECTIONS).map((c) => `/official-reports/${c.path}`)],
  static: Object.keys(STATIC_PAGES).map((k) => `/${k}`),
  report: ['/reports/some-report', '/reports/some-report/s/2'],
  index: ['/subject/person', '/subject/party', '/subject/electorate'],
  topics: ['/subject/topic'],
  topic: ['/subject/topic/housing'],
  subject: ['/subject/person/some-name', '/subject/electorate/some-seat'],
  doc: ['/doc/some-speech'],
  bill: ['/bill/au-federal-r1'],
  'grant-recipient': ['/money/grants/federal/recipient/abn:12345678901', '/money/grants/qld/recipient/abn:12345678901'],
};

test('every kind in the Worker route table has sample addresses, and each sample is a real route of that kind', () => {
  const kinds = [...source.match(/type SeoRoute =([\s\S]*?)\n\n/)[1].matchAll(/kind: '([a-z-]+)'/g)].map((m) => m[1]).filter((k) => k !== 'notfound');
  assert.ok(kinds.length > 15, 'the union was found');
  for (const kind of kinds) assert.ok(SAMPLES[kind]?.length, `add sample addresses for the ${kind} route`);
  for (const [kind, paths] of Object.entries(SAMPLES)) for (const path of paths) assert.equal(kindOf(path), kind, path);
});

test('every route in the Worker table, and every app view, is named in page_path rather than /other', () => {
  const paths = Object.values(SAMPLES).flat();
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const titles = app.match(/^const TITLES = \{([\s\S]*?)\n\};/m)[1];
  for (const [, view] of titles.matchAll(/^\s+([a-z]+):/gm)) paths.push(`/${view}`, `/${view}/`);
  paths.push('/connections.html', '/map', '/discover', '/today', '/press', '/community', '/home');
  for (const path of paths) {
    assert.notEqual(safePath(path), '/other', `${path} must not be counted as /other`);
    assert.notEqual(safePath(`https://opax.com.au${path}?q=private#private`), '/other', path);
    assert.notEqual(safePath(`https://opax.com.au/#${path}`), '/other', `${path} from an older hash link`);
  }
});

// Variants inside a kind come from the real sources, not from this file.
const body = source.slice(source.indexOf('function matchSeoRoute'), source.indexOf('\n}\n', source.indexOf('function matchSeoRoute')));
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const servedFirst = JSON.parse(wrangler.match(/"run_worker_first": (\[[^\]]*\])/)[1]);

test('every address the route table spells out, every directory kind and grant jurisdiction, and every page file is named', () => {
  const paths = [];
  for (const [, lit] of body.matchAll(/path === '(\/[^']*)'/g)) paths.push(lit);
  // (/official-reports/<collection> takes only the REPORT_COLLECTIONS paths, sampled above.)
  for (const [, lit] of body.matchAll(/path\.startsWith\('(\/[^']*)'\)/g)) if (lit !== '/official-reports/') paths.push(`${lit}some-record`);
  assert.ok(paths.length > 20, 'address literals found in matchSeoRoute');
  for (const kind of Object.keys(DIRECTORY_KINDS)) paths.push(`/subject/${kind}`, `/subject/${kind}/some-name`);
  const jurisdictions = [...body.matchAll(/dec\[2\] === '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(jurisdictions.length >= 2);
  for (const j of jurisdictions) paths.push(`/money/grants/${j}/recipient/abn:12345678901`);
  // Pages served from a file: the Worker-first list and the html files in public.
  const plain = servedFirst.filter((p) => !/[*]|^\/(?:api|ingest|og|mcp|table-index|datatable-workbench)|\.(?:json|txt|xml|html)\/?$|-test/.test(p));
  for (const file of readdirSync(new URL('../public/', import.meta.url))) {
    const m = file.match(/^([a-z-]+)\.html$/);
    if (m && !/-test$|workbench|^index$/.test(m[1])) plain.push(`/${m[1]}`);
  }
  assert.ok(plain.length >= 4, 'plain page files found');
  paths.push(...plain);
  for (const path of paths) assert.notEqual(safePath(path), '/other', `${path} must not be counted as /other`);
});

test('a bare page matches only itself; text after it is /other, in the address and in a hash route', () => {
  for (const page of ['ask', 'chat', 'search', 'map', 'discover', 'explore', 'declared', 'about', 'methods', 'stats', 'expenses']) {
    for (const tail of ['private-question', 'a/b']) {
      assert.equal(safePath(`/${page}/${tail}`), '/other', page);
      assert.equal(safePath(`https://opax.com.au/#/${page}/${tail}#more`), '/other', page);
    }
    assert.equal(safePath(`/${page}/`), `/${page}`);
    assert.equal(safePath(`https://opax.com.au/#/${page}?q=private#more`), `/${page}`);
    assert.equal(safePath(`https://opax.com.au/#/${page}#private`), `/${page}`);
  }
  assert.equal(safePath('/terms/'), '/terms');
  assert.equal(safePath('/official-reports/private-collection'), '/other');
});

test('record routes are counted by template and never carry the real slug or id', () => {
  const expected = {
    '/sitting/2026-10-14': '/sitting/[id]', '/estimates/round-1': '/estimates/[id]', '/vic-election-2026/some-seat': '/vic-election-2026/[id]',
    '/audit/some-report': '/audit/[id]', '/instrument/f2026l00001': '/instrument/[id]', '/report/some-report': '/report/[slug]',
    '/official-reports/royal-commissions': '/official-reports/royal-commissions', '/reports/some-report': '/reports/[slug]',
    '/reports/some-report/s/2': '/reports/[slug]/s/[n]', '/video/senate': '/video/senate', '/register/vic-gifts': '/register/vic-gifts',
  };
  for (const [path, template] of Object.entries(expected)) {
    assert.equal(safePath(path), template);
    assert.equal(safePath(template), template, 'a template passes through unchanged');
  }
  for (const path of ['/register', '/register/private', '/video', '/video/private', '/sitting/a/b', '/report', '/reports/a/b', '/private-input'])
    assert.equal(safePath(path), '/other', path);
});
