// Pages the Worker assembles from a shell carry their own validator, so a
// revisit is a 304 rather than the whole page, and never the shell's ETag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlValidator, notModified } from '../src/html-etag.ts';
import { pageEntry } from '../src/page-entry.ts';

test('the validator follows every input of the rewrite', async () => {
  const a = await htmlValidator(['"shell-1"', 'subject', { title: 'A', prerender: '<p>x</p>' }]);
  assert.match(a, /^W\/"h-[0-9a-f]{24}"$/);
  assert.equal(a, await htmlValidator(['"shell-1"', 'subject', { title: 'A', prerender: '<p>x</p>' }]));
  assert.notEqual(a, await htmlValidator(['"shell-2"', 'subject', { title: 'A', prerender: '<p>x</p>' }]));
  assert.notEqual(a, await htmlValidator(['"shell-1"', 'subject', { title: 'A', prerender: '<p>y</p>' }]));
});

test('a matching If-None-Match is a bodiless 304 keeping the cache policy', async () => {
  const etag = await htmlValidator(['x']);
  const headers = new Headers({ 'cache-control': 'public, max-age=0, must-revalidate', 'content-type': 'text/html', 'content-length': '10' });
  for (const sent of [etag, etag.replace('W/', ''), `"other", ${etag}`, '*']) {
    const res = notModified(new Request('https://opax.com.au/bill/x', { headers: { 'if-none-match': sent } }), etag, headers);
    assert.equal(res?.status, 304, sent);
    assert.equal(res.headers.get('etag'), etag);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(res.headers.get('content-length'), null);
  }
  assert.equal(notModified(new Request('https://opax.com.au/bill/x', { headers: { 'if-none-match': '"other"' } }), etag, headers), null);
  assert.equal(notModified(new Request('https://opax.com.au/bill/x'), etag, headers), null);
});

test('the homepage shell is read unconditionally, so its rewrite is never answered by the shell ETag', async () => {
  const seen = [];
  const assets = { async fetch(req) { seen.push(req.headers.get('if-none-match')); return new Response('home'); } };
  await pageEntry(new Request('https://opax.com.au/', { headers: { 'if-none-match': '"shell"' } }), assets);
  assert.deepEqual(seen, [null]);
});

test('every Worker-assembled page folds the deployed version into its validator', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const calls = [...source.matchAll(/htmlValidator\(\[([^\]]*)\]/g)].map((m) => m[1]);
  assert.equal(calls.length, 3, 'record/hub pages, /map and the home page');
  for (const parts of calls) assert.match(parts, /^env\.CF_VERSION_METADATA\?\.id \?\? ''/, parts);
  // A Worker-only change (same shell, same data) is a new validator.
  const page = ['"shell"', 'subject', { title: 'A' }];
  assert.notEqual(await htmlValidator(['version-a', ...page]), await htmlValidator(['version-b', ...page]));
});
