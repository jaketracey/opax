import test from 'node:test';
import assert from 'node:assert/strict';
import {pageCacheKey, pageForStorage, pageFromStorage, PAGE_CACHE_TTL} from '../src/page-cache.ts';

const base = {epoch:'2026-10-13-fixture', workerVersion:'fixture-version-a', assets:'W/"fixture-shell"'};
const person = new URL('https://opax.com.au/subject/person/fixture-member');
const key = async (over = {}, url = person) => (await pageCacheKey({...base, ...over, url})).url;

test('the person page key moves with CACHE_EPOCH, the deployed version, the asset stamp', async () => {
  const original = await key();
  assert.match(original, /^https:\/\/cache\.opax\.internal\/page\/[a-f0-9]{64}$/);
  for (const over of [{epoch:'2026-10-14-fixture'}, {workerVersion:'fixture-version-b'}, {assets:'W/"fixture-shell-2"'}])
    assert.notEqual(await key(over), original, JSON.stringify(over));
  assert.equal(await key(), original, 'the key is deterministic');
});

test('the key carries the table state but not the cache bypass or parameter order', async () => {
  const plain = await key();
  const state = new URL(person); state.searchParams.set('vr.page', '2'); state.searchParams.set('vr.sort', 'date:asc');
  const reordered = new URL(person); reordered.searchParams.set('vr.sort', 'date:asc'); reordered.searchParams.set('vr.page', '2');
  const bypass = new URL(person); bypass.searchParams.set('nocache', '1');
  assert.notEqual(await key({}, state), plain);
  assert.equal(await key({}, reordered), await key({}, state));
  assert.equal(await key({}, bypass), plain);
  assert.notEqual(await key({}, new URL('https://opax.com.au/subject/person/other-member')), plain);
});

test('a stored page preserves its body and browser cache headers', async () => {
  const html = '<!doctype html><title>Fixture member · OPAX</title><main data-server-rendered>Fixture</main>';
  const rendered = new Response(html, {headers:{'content-type':'text/html; charset=utf-8', 'cache-control':'public, max-age=0, must-revalidate', etag:'W/"h-fixture"', 'x-robots-tag':'all', 'server-timing':'total;dur=1', 'x-opax-cache':'MISS'}});
  const now = Date.parse('2026-10-13T00:00:00Z');
  const stored = await pageForStorage(rendered, now);
  assert.equal(stored.headers.get('cache-control'), `public, max-age=${PAGE_CACHE_TTL + 3600}`);
  assert.equal(stored.headers.get('server-timing'), null);
  assert.equal(stored.headers.get('x-opax-cache'), null);
  const fresh = await pageFromStorage(stored.clone(), now + 1000);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.response.status, 200);
  assert.equal(fresh.response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(fresh.response.headers.get('etag'), 'W/"h-fixture"');
  assert.equal(fresh.response.headers.get('x-opax-cache'), 'HIT');
  assert.equal(fresh.response.headers.get('x-opax-cached-at'), null);
  assert.equal(fresh.response.headers.get('x-opax-browser-cache-control'), null);
  assert.equal(await fresh.response.text(), html);
  assert.equal((await pageFromStorage(stored.clone(), now + PAGE_CACHE_TTL * 1000 + 1)).stale, true, 'past six hours a hit is served stale and re-rendered');
});
