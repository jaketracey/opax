import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {build} from 'esbuild';

// A /doc/division-* request read its division file twice: once to settle the canonical path
// and once for the page (12 Nov 2026). Both now share one bounded per-isolate read.
const root = new URL('../public/', import.meta.url);
const compiled = await build({entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
  plugins: [{name: 'omit-renderer', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'division-test'})); b.onLoad({filter: /.*/, namespace: 'division-test'}, () => ({contents: 'export const renderOgPng = async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
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
const slugs = JSON.parse(readFileSync(new URL('divisions/index.json', root), 'utf8')).divisions.map(d => d.slug).filter(s => /^division-federal-/.test(s) && existsSync(new URL(`divisions/${s}.json`, root)));

test('division page: its file is read once across the canonical check and renders', async () => {
  const slug = slugs[0];
  assert.ok(slug, 'a federal division in the published data');
  const file = `/divisions/${slug}.json`;
  reads.length = 0;
  const first = await get(`/doc/${slug}`);
  const second = await get(`/doc/${slug}`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(await first.text(), await second.text());
  assert.equal(reads.filter(p => p === file).length, 1);
});

test('division page: a failed read of the division file is not kept', async () => {
  const slug = slugs[1];
  const file = `/divisions/${slug}.json`;
  reads.length = 0;
  failNext = file;
  await (await get(`/doc/${slug}`)).text();
  const again = await get(`/doc/${slug}`);
  assert.equal(again.status, 200);
  await again.text();
  assert.ok(reads.filter(p => p === file).length >= 2);
});
