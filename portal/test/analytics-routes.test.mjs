// Every real page must be named in web analytics, never counted as "/other".
// The route table is the Worker's matchSeoRoute (src/index.ts), so a route added
// there without a pattern in analytics/privacy.mjs fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { safePath } from '../analytics/privacy.mjs';
import { REPORT_COLLECTIONS } from '../public/official-reports-model.js';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const compiled = await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false,
  external: ['node:*'], logLevel: 'error',
  footer: { js: 'export {matchSeoRoute as __match, STATIC_PAGES as __static}' },
  plugins: [{ name: 'omit-images', setup(b) {
    b.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'images', namespace: 'routes-test' }));
    b.onLoad({ filter: /.*/, namespace: 'routes-test' }, () => ({ contents: 'export const renderOgPng=()=>{};export const renderOgJpeg=()=>{};', loader: 'js' }));
  } }],
});
const { __match: matchSeoRoute, __static: STATIC_PAGES } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
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

test('record routes are counted by template and never carry the real slug or id', () => {
  const expected = {
    '/sitting/2026-10-14': '/sitting/[id]', '/estimates/round-1': '/estimates/[id]', '/vic-election-2026/some-seat': '/vic-election-2026/[id]',
    '/audit/some-report': '/audit/[id]', '/instrument/f2026l00001': '/instrument/[id]', '/report/some-report': '/report/[slug]',
    '/official-reports/royal-commissions': '/official-reports/[collection]', '/reports/some-report': '/reports/[slug]',
    '/reports/some-report/s/2': '/reports/[slug]/s/[n]', '/video/senate': '/video/senate', '/register/vic-gifts': '/register/vic-gifts',
  };
  for (const [path, template] of Object.entries(expected)) {
    assert.equal(safePath(path), template);
    assert.equal(safePath(template), template, 'a template passes through unchanged');
  }
  for (const path of ['/register', '/register/private', '/video', '/video/private', '/sitting/a/b', '/report', '/reports/a/b', '/private-input'])
    assert.equal(safePath(path), '/other', path);
});
