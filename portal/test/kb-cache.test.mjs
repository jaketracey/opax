import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({ stdin: { contents: "export * from './src/kb-cache';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm' });
const { cachedKbLookup, KB_CACHE_TTL } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
function fakeCache() {
  const store = new Map();
  return { store, async match(req) { const hit = store.get(req.url); return hit ? new Response(hit.body, { headers: hit.headers }) : undefined; },
    async put(req, res) { store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); } };
}
test('repeated KB searches and counts are served from the edge cache, keyed by body and epoch', async () => {
  const cache = fakeCache(); let reads = 0;
  const read = async () => { reads++; return { resources: { a: { slug: 'speech-1' } } }; };
  const body = { query: 'poker machine reform', top_k: 4 };
  assert.deepEqual(await cachedKbLookup('/find', body, 'epoch-1', read, undefined, cache), { resources: { a: { slug: 'speech-1' } } });
  assert.deepEqual(await cachedKbLookup('/find', body, 'epoch-1', read, undefined, cache), { resources: { a: { slug: 'speech-1' } } });
  assert.equal(reads, 1);
  await cachedKbLookup('/find', body, 'epoch-2', read, undefined, cache); assert.equal(reads, 2, 'a new index epoch reads afresh');
  await cachedKbLookup('/find', { ...body, top_k: 5 }, 'epoch-2', read, undefined, cache); assert.equal(reads, 3, 'another request body reads afresh');
  assert.match([...cache.store.values()][0].headers['cache-control'], new RegExp(`max-age=${KB_CACHE_TTL}`));
  for (const path of ['/catalog', '/search']) { await cachedKbLookup(path, body, 'epoch-2', read, undefined, cache); await cachedKbLookup(path, body, 'epoch-2', read, undefined, cache); }
  assert.equal(reads, 5);
});
test('other paths, a missing epoch (operator evals) and failed reads are never cached', async () => {
  const cache = fakeCache(); let reads = 0;
  const read = async () => { reads++; return { ok: true }; };
  for (let i = 0; i < 2; i++) { await cachedKbLookup('/ask', { q: 1 }, 'e', read, undefined, cache); await cachedKbLookup('/find', { q: 1 }, undefined, read, undefined, cache); }
  assert.equal(reads, 4); assert.equal(cache.store.size, 0);
  await assert.rejects(cachedKbLookup('/find', { q: 2 }, 'e', async () => { throw Error('unavailable'); }, undefined, cache));
  assert.equal(cache.store.size, 0);
});
