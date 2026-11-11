import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {build} from 'esbuild';

// A person page read the electorate manifest, its release index and the interests register index
// twice in one cold render: once behind the roster and register checks, once for the body
// (12 Nov 2026). Each isolate now reads each of them once.
const root = new URL('../public/', import.meta.url);
const compiled = await build({entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
  plugins: [{name: 'omit-renderer', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'shared-test'})); b.onLoad({filter: /.*/, namespace: 'shared-test'}, () => ({contents: 'export const renderOgPng = async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
const {default: worker} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
globalThis.HTMLRewriter ??= class { on() { return this; } transform(res) { return res; } };
const reads = [];
let failNext = null;
const env = {COMMUNITY_ORIGIN: 'https://opax.com.au', ASSETS: {async fetch(req) {
  const path = new URL(req.url).pathname;
  reads.push(path);
  if (path === failNext) { failNext = null; return new Response('unavailable', {status: 503}); }
  const file = new URL(path === '/' ? 'index.html' : path.slice(1), root);
  return existsSync(file) ? new Response(readFileSync(file), {headers: {'content-type': path.endsWith('.json') ? 'application/json' : 'text/html'}}) : new Response('Not found', {status: 404});
}}};
const get = path => worker.fetch(new Request('https://opax.com.au' + path, {headers: {'x-opax-nocache': '1'}}), env, {waitUntil() {}, passThroughOnException() {}});
const SHARED = /^\/(?:electorates\/(?:manifest\.json|releases\/[^/]+\/(?:index|people)\.json)|interests\/index\.json)$/;

test('person page: the electorate and interests files are read once on a cold isolate', async () => {
  reads.length = 0;
  const slugs = await (await get('/api/person-slugs')).json();
  const interests = JSON.parse(readFileSync(new URL('interests/index.json', root), 'utf8'));
  const slug = Object.keys(slugs.slugs).find(s => Object.hasOwn(interests._by_name ?? {}, slugs.slugs[s].toLowerCase()));
  assert.ok(slug, 'a roster member on the interests register');
  const page = await get(`/subject/person/${slug}`);
  assert.equal(page.status, 200);
  await page.text();
  const shared = reads.filter(p => SHARED.test(p));
  assert.ok(shared.includes('/electorates/manifest.json'));
  assert.ok(shared.includes('/interests/index.json'));
  assert.deepEqual(shared, [...new Set(shared)], `each shared file once: ${shared.join(', ')}`);
  reads.length = 0;
  await (await get(`/subject/person/${slug}`)).text();
  assert.deepEqual(reads.filter(p => SHARED.test(p)), []);
});
