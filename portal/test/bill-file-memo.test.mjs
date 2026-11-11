import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {build} from 'esbuild';

// A bill page read its own /bills/<key>.json twice per render: once for the head's summary
// line and once for the body (12 Nov 2026). Both now share one bounded per-isolate read.
const root = new URL('../public/', import.meta.url);
const compiled = await build({entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
  plugins: [{name: 'omit-renderer', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'bill-test'})); b.onLoad({filter: /.*/, namespace: 'bill-test'}, () => ({contents: 'export const renderOgPng = async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
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
const index = JSON.parse(readFileSync(new URL('bills/index.json', root), 'utf8'));
const withSummary = index.bills.filter(b => b.has_summary && existsSync(new URL(`bills/${b.key}.json`, root)));

test('bill page: its file is read once across renders, same page each time', async () => {
  const bill = withSummary[0];
  assert.ok(bill, 'a bill with a summary in the published data');
  const file = `/bills/${bill.key}.json`;
  reads.length = 0;
  const first = await get(`/bill/${bill.key}`);
  const second = await get(`/bill/${bill.key}`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const [a, b] = [await first.text(), await second.text()];
  assert.equal(a, b);
  assert.equal(reads.filter(p => p === file).length, 1);
});

test('bill page: a failed read of the bill file is not kept', async () => {
  const bill = withSummary[1];
  const file = `/bills/${bill.key}.json`;
  reads.length = 0;
  failNext = file;
  await (await get(`/bill/${bill.key}`)).text();
  const again = await get(`/bill/${bill.key}`);
  assert.equal(again.status, 200);
  await again.text();
  assert.ok(reads.filter(p => p === file).length >= 2);
});
