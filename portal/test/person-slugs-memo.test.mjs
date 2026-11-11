import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {build} from 'esbuild';

// /api/person-slugs serialises the whole roster (~28 ms CPU a call on prod, 12 Nov 2026).
// The body depends only on the roster, so an isolate serialises it once per roster load.
const root = new URL('../public/', import.meta.url);
const compiled = await build({entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
  plugins: [{name: 'omit-renderer', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'renderer', namespace: 'slugs-test'})); b.onLoad({filter: /.*/, namespace: 'slugs-test'}, () => ({contents: 'export const renderOgPng = async()=>null; export const renderOgJpeg=renderOgPng;', loader: 'js'})); }}]});
const {default: worker} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const env = {COMMUNITY_ORIGIN: 'https://opax.com.au', ASSETS: {async fetch(req) {
  const path = new URL(req.url).pathname;
  const file = new URL(path === '/' ? 'index.html' : path.slice(1), root);
  return existsSync(file) ? new Response(readFileSync(file), {headers: {'content-type': path.endsWith('.json') ? 'application/json' : 'text/html'}}) : new Response('Not found', {status: 404});
}}};
const get = path => worker.fetch(new Request('https://opax.com.au' + path), env, {waitUntil() {}, passThroughOnException() {}});

test('person slugs: same body on every call, serialised once per roster', async () => {
  const stringify = JSON.stringify;
  let serialised = 0;
  JSON.stringify = function (value, ...rest) { if (value && typeof value === 'object' && 'slugs' in value) serialised++; return stringify.call(this, value, ...rest); };
  try {
    const first = await get('/api/person-slugs');
    const second = await get('/api/person-slugs');
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    for (const res of [first, second]) {
      assert.match(res.headers.get('content-type'), /^application\/json/);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    }
    const [a, b] = [await first.text(), await second.text()];
    assert.equal(a, b);
    assert.equal(serialised, 1);
    const body = JSON.parse(a);
    const roster = JSON.parse(readFileSync(new URL('parliamentarians.json', root), 'utf8'));
    assert.equal(body.generated, roster.meta?.generated ?? '');
    const names = new Set(Object.values(body.slugs));
    assert.ok(names.size > 100);
    for (const p of roster.people.slice(0, 50)) if (p.slug) assert.equal(body.slugs[p.slug], p.name);
  } finally {
    JSON.stringify = stringify;
  }
});
