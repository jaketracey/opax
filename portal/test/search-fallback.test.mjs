import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { searchFind, SEARCH_RETRIEVAL_MS, KEYWORD_HEDGE_MS, KEYWORD_SEARCH_MS } from '../src/search-find.ts';
import { cacheKeyParams } from '../src/cache-key.ts';
import { compareSearchResults } from '../src/search-sort.ts';
import { normalizePassage, passageWindow } from '../src/passage-text.ts';
import { speechPresentation, joinMixedSpeakers } from '../src/mixed-speakers.ts';
import { pressTitle } from '../src/press-title.ts';
import { isWitness } from '../public/speech-attribution.js';
import { CATALOG_KINDS } from '../src/catalog-search.ts';
import { tokens as catalogTokens } from '../src/catalog-query.mjs';
import { noRecordMentions } from '../src/search-mention.ts';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['apiSearch', 'apiUnifiedSearch', 'searchWindow', 'kbFetch', 'json', 'cacheStore', 'withCacheStatus', 'label', 'calibrate'];
const code = ts.transpileModule(source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const payload = { resources: { fixture: {
  slug: 'speech-123', title: 'Housing debate', origin: { collaborators: ['Robin Example'], url: 'https://example.test/speech' },
  extra: { metadata: { date: '2026-10-01' } }, usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }] },
  fields: { body: { paragraphs: { passage: { text: 'Housing supply in the public record.', score: 0.9, score_type: 'VECTOR' } } } },
} }, best_matches: [1, 2] };
const answer = () => Response.json(payload);
const hang = () => new Promise(() => {});
const filters = { field: { and: [{ prop: 'label', labelset: 'state', label: 'federal' }] } };

function fixture(upstream = answer, extra = {}) {
  const calls = [], writes = [], cache = new Map(), pendingWrites = [], limits = [];
  const ctx = { waitUntil: work => pendingWrites.push(work) };
  const env = { CACHE_EPOCH: 'fixture', ARAG_KB_TOKEN: 'fixture', ...extra };
  const context = {
    URL, URLSearchParams, Request, Response, AbortSignal, searchFind, cacheKeyParams, compareSearchResults,
    normalizePassage, passageWindow, speechPresentation, joinMixedSpeakers, pressTitle, isWitness,
    CATALOG_KINDS, catalogTokens, validateSearchQuery: () => null,
    searchCatalogPaged: async () => ({ stubs: [], total: 0, truncated: false }),
    loadPeople: async () => ({ byFold: new Map() }), speakerAttribution: async () => null,
    filterExpression: () => filters, speakerPrints: async () => null,
    stripListingBoilerplate: text => text, foldName: text => text.toLowerCase(), personScope: () => null, noRecordMentions,
    SLUG_RE: /^(speech|legal)-(\d+)$/, DIVISION_SLUG_RE: /^division-/,
    SEARCH_PER_DEFAULT: 20, SEARCH_PER_MAX: 200, SEARCH_WINDOW_TOPK: 200, SEARCH_TOPK_MAX: 200,
    SEARCH_WINDOW_CACHE_TTL: 3600, SEARCH_FALLBACK_CACHE_TTL: 60, SEARCH_CACHE_TTL: 600,
    sha256Hex: async text => text, cacheRequest: (kind, key) => new Request('https://cache.test/' + kind + '/' + encodeURIComponent(key)),
    cacheBypass: () => false, rateLimited: async () => { limits.push(1); return null; },
    caches: { default: {
      match: async key => {
        const entry = cache.get(key.url);
        return entry && Date.now() < entry.expires ? entry.response.clone() : undefined;
      },
      put: async (key, response) => {
        writes.push({ key: key.url, response: response.clone() });
        const seconds = Number(response.headers.get('cache-control').match(/max-age=(\d+)/)[1]);
        cache.set(key.url, { response, expires: Date.now() + seconds * 1000 });
      },
    } },
    ragBase: () => 'https://fake-upstream.test', sourceIdentity: { user_agent: 'opax-test' },
    fetch: async (input, init) => {
      assert.equal(new URL(input).pathname, '/find');
      const call = { body: JSON.parse(init.body), signal: init.signal };
      calls.push(call);
      return upstream(call, calls.length);
    },
  };
  const worker = runInNewContext(code + ';({apiSearch,apiUnifiedSearch,searchWindow})', context);
  return { calls, writes, worker, limits,
    window: (mode = 'hybrid', signal) => worker.searchWindow(env, { q: 'housing', mode, kind: 'speech', topK: 2, url: new URL('https://local.test/api/search?state=federal'), signal }),
    run: async (params = {}, { unified = false, signal } = {}) => {
      const url = new URL('https://local.test/api/' + (unified ? 'search-all' : 'search') + '?' + new URLSearchParams(Object.entries({ q: 'housing', kind: 'speech', top_k: '2', state: 'federal', ...params }).filter(([, value]) => value !== undefined)));
      const response = await worker[unified ? 'apiUnifiedSearch' : 'apiSearch'](new Request(url, { signal }), url, env, ctx);
      await Promise.all(pendingWrites);
      return { response, data: await response.json() };
    },
  };
}

function assertSameWindow(calls) {
  assert.equal(calls.length, 2);
  const { features: firstFeatures, reranker: firstReranker, ...first } = calls[0].body;
  const { features: nextFeatures, reranker: nextReranker, ...next } = calls[1].body;
  assert.deepEqual(next, first, 'query, depth, show and filters survive recovery');
  assert.deepEqual(next.filter_expression, filters);
  return { firstFeatures, nextFeatures, firstReranker, nextReranker };
}

for (const mode of ['hybrid', 'semantic']) test(`${mode} at 7 seconds wins over an already answered keyword hedge`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const log = t.mock.method(console, 'info', () => {});
  const f = fixture(call => call.body.features.includes('semantic') ? new Promise(resolve => setTimeout(() => resolve(answer()), 7000)) : answer());
  let completed = false;
  const work = f.run({ mode }).then(result => { completed = true; return result; });
  await setImmediate();
  t.mock.timers.tick(KEYWORD_HEDGE_MS - 1);
  await setImmediate();
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].signal.aborted, false, 'the hedge does not cancel the primary');
  assert.equal(completed, false, 'keyword waits while the preferred mode can still answer');
  assert.equal(assertSameWindow(f.calls).nextReranker, 'noop');
  t.mock.timers.tick(2000);
  const { response, data } = await work;
  assert.equal(response.status, 200);
  assert.equal(data.mode_used, mode);
  assert.equal(data.fallback, undefined);
  assert.equal(log.mock.callCount(), 0);
});

test('normal fast hybrid starts no keyword call, even after the hedge time passes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(() => new Promise(resolve => setTimeout(() => resolve(answer()), 3580)));
  const work = f.run();
  await setImmediate();
  t.mock.timers.tick(3580);
  const { data } = await work;
  assert.equal(data.mode_used, 'hybrid');
  t.mock.timers.tick(SEARCH_RETRIEVAL_MS);
  await setImmediate();
  assert.equal(f.calls.length, 1);
});

for (const mode of ['hybrid', 'semantic']) test(`${mode} hanging returns its keyword hedge at the 10 second cap`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(call => call.body.features.includes('semantic') ? hang() : answer());
  let completed = false;
  const work = f.run({ mode }).then(result => { completed = true; return result; });
  await setImmediate();
  t.mock.timers.tick(KEYWORD_HEDGE_MS);
  await setImmediate();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].signal.aborted, false);
  assert.equal(completed, false);
  t.mock.timers.tick(SEARCH_RETRIEVAL_MS - KEYWORD_HEDGE_MS - 1);
  await setImmediate();
  assert.equal(completed, false);
  t.mock.timers.tick(1);
  const { response, data } = await work;
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.mode, mode);
  assert.equal(data.mode_used, 'keyword');
  assert.equal(data.fallback, mode + '_timeout');
  assert.equal(data.results[0].slug, 'speech-123');
  assert.equal(data.truncated, true);
  const { nextFeatures, nextReranker } = assertSameWindow(f.calls);
  assert.deepEqual(nextFeatures, ['keyword']);
  assert.equal(nextReranker, 'noop');
  assert.equal(f.writes.length, 1, 'only the retrieval window is cached');
  assert.equal(f.writes[0].response.headers.get('cache-control'), 'public, max-age=60');
});

for (const [failure, fail] of [
  ['HTTP error', () => new Response('', { status: 502 })],
  ['network error', () => { throw new Error('Fixture connection lost'); }],
  ['invalid JSON', () => new Response('{')],
]) test(`${failure} recovers immediately from semantic to keyword`, async () => {
  const f = fixture(call => call.body.features.includes('semantic') ? fail() : answer());
  const { response, data } = await f.run({ mode: 'semantic' });
  assert.equal(response.status, 200);
  assert.equal(data.mode, 'semantic');
  assert.equal(data.mode_used, 'keyword');
  assert.equal(data.fallback, 'semantic_error');
  assertSameWindow(f.calls);
  assert.equal(f.writes.length, 1);
});

test('failed keyword hedge never discards a working semantic primary', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(call => call.body.features.includes('semantic')
    ? new Promise(resolve => setTimeout(() => resolve(answer()), 7000)) : new Response('', { status: 503 }));
  const work = f.run({ mode: 'semantic' });
  await setImmediate();
  t.mock.timers.tick(KEYWORD_HEDGE_MS);
  await setImmediate();
  assert.equal(f.calls.length, 2);
  t.mock.timers.tick(2000);
  const { response, data } = await work;
  assert.equal(response.status, 200);
  assert.equal(data.mode_used, 'semantic');
  assert.equal(data.fallback, undefined);
});

for (const params of [
  { mode: 'keyword' },
  { q: '*', mode: 'keyword', speaker: 'Robin Example', sort: 'newest', page: '1', per: '8', top_k: undefined },
  { q: '*', mode: 'hybrid' },
  { q: '*', mode: 'semantic' },
]) test(`keyword-only intent never recovers semantically: ${JSON.stringify(params)}`, async () => {
  const f = fixture(call => call.body.features.includes('semantic') ? answer() : new Response('', { status: 503 }));
  const { response, data } = await f.run(params);
  assert.equal(response.status, 503);
  assert.deepEqual(data, { error: 'find failed' });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].body.features, ['keyword']);
  assert.equal(f.writes.length, 0);
  if (params.speaker) {
    assert.equal(f.calls[0].body.query, '*');
    assert.equal(f.calls[0].body.top_k, 200);
  }
});

test('person latest-speeches keyword request gets six seconds and no semantic recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(hang);
  const work = f.run({ q: '*', mode: 'keyword', speaker: 'Robin Example', page: '1', per: '8', sort: 'newest', top_k: undefined });
  await setImmediate();
  t.mock.timers.tick(KEYWORD_SEARCH_MS - 1);
  await setImmediate();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].signal.aborted, false);
  t.mock.timers.tick(1);
  const { response } = await work;
  assert.equal(response.status, 503);
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.calls.length, 1);
});

test('both failed modes produce a retryable, uncached 503', async () => {
  const f = fixture(() => new Response('', { status: 503 }));
  const { response, data } = await f.run();
  assert.equal(response.status, 503);
  assert.deepEqual(data, { error: 'find failed' });
  assert.equal(response.headers.get('retry-after'), '5');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(f.calls.length, 2);
  assert.equal(f.writes.length, 0);
  assert.equal(await f.window(), null, 'direct searchWindow callers retain their failure shape');
});

test('both hanging modes stop at the shared 10 second cap', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(hang);
  const work = f.run();
  await setImmediate();
  t.mock.timers.tick(KEYWORD_HEDGE_MS);
  await setImmediate();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].signal.aborted, false);
  t.mock.timers.tick(SEARCH_RETRIEVAL_MS - KEYWORD_HEDGE_MS);
  const { response } = await work;
  assert.equal(response.status, 503);
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.calls[1].signal.aborted, true);
});

test('a stalled response body also reaches the 10 second deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture((_call, number) => number === 1 ? { ok: true, json: hang } : answer());
  const work = f.run();
  await setImmediate();
  t.mock.timers.tick(KEYWORD_HEDGE_MS);
  await setImmediate();
  t.mock.timers.tick(SEARCH_RETRIEVAL_MS - KEYWORD_HEDGE_MS);
  const { data } = await work;
  assert.equal(data.fallback, 'hybrid_timeout');
  assert.equal(data.mode_used, 'keyword');
});

for (const afterHedge of [false, true]) test(`caller cancellation aborts retrieval without a fallback, after hedge: ${afterHedge}`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const log = t.mock.method(console, 'info', () => {});
  const f = fixture(hang), parent = new AbortController();
  const work = f.window('hybrid', parent.signal);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  await setImmediate();
  if (afterHedge) { t.mock.timers.tick(KEYWORD_HEDGE_MS); await setImmediate(); }
  parent.abort();
  await rejected;
  assert.equal(f.calls.length, afterHedge ? 2 : 1);
  assert.ok(f.calls.every(call => call.signal.aborted));
  await assert.rejects(f.window('hybrid', parent.signal), { name: 'AbortError' });
  assert.equal(log.mock.callCount(), 0);
});

test('one structured fallback log contains modes, reason and elapsed time without query or filter values', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const logs = [];
  t.mock.method(console, 'info', value => logs.push(value));
  const query = 'PRIVATE_QUERY_SENTINEL', speaker = 'Private Fixture Speaker', topic = 'PRIVATE_TOPIC_SENTINEL';
  const f = fixture(call => call.body.features.includes('semantic')
    ? new Promise((_, reject) => setTimeout(() => reject(new Error(query + speaker + topic)), 800)) : answer());
  const params = { q: query, speaker, topic, per: '1', page: '1' };
  const work = f.run(params);
  await setImmediate();
  t.mock.timers.tick(800);
  await work;
  await f.run({ ...params, page: '2' });
  assert.equal(logs.length, 1, 'cached window reuse does not emit another upstream fallback');
  assert.equal(typeof logs[0], 'string');
  assert.deepEqual(JSON.parse(logs[0]), { event: 'search_fallback', requested_mode: 'hybrid', mode_used: 'keyword', reason: 'hybrid_error', elapsed_ms: 800 });
  for (const value of [query, speaker, topic]) assert.equal(logs[0].includes(value), false);
});

test('normal hybrid preserves result and page fields, reranking and normal caches', async () => {
  const f = fixture();
  const { response, data } = await f.run();
  assert.equal(response.status, 200);
  assert.deepEqual(data, {
    query: 'housing', mode: 'hybrid', mode_used: 'hybrid', kind: 'speech', sort: 'relevance',
    page: 1, per_page: 20, page_count: 1, total: 1, truncated: true, years: { 2026: 1 }, count: 1,
    results: [{
      kind: 'speech', id: 123, slug: 'speech-123', resource: 'fixture', title: 'Housing debate',
      speaker: 'Robin Example', party: null, state: null, chamber: null, person_id: null,
      speaker_type: null, speaker_attribution: null, role: null, organisation: null,
      date: '2026-10-01', url: 'https://example.test/speech', snippet: 'Housing supply in the public record.', topics: [], score: 0.9,
    }],
  });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].body.features, ['keyword', 'semantic']);
  assert.equal(f.calls[0].body.reranker, 'predict');
  assert.deepEqual(f.writes.map(w => w.response.headers.get('cache-control')), ['public, max-age=3600', 'public, max-age=600']);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=600');
  assert.equal((await f.run()).response.headers.get('x-opax-cache'), 'HIT');
  assert.equal((await f.run({ sort: 'newest' })).data.mode_used, 'hybrid');
  assert.equal(f.calls.length, 1, 'normal pages and windows are reused');
});

test('fallback pages share one 60 second window and retry hybrid only after it expires', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let recovered = false;
  const set = { ...payload, resources: Object.fromEntries([123, 124, 125].map((id, index) => [String(id), { ...payload.resources.fixture, slug: 'speech-' + id,
    fields: { body: { paragraphs: { passage: { text: 'Housing public record.', score: 0.9 - index / 10, score_type: 'VECTOR' } } } } }])) };
  const f = fixture(call => !recovered && call.body.features.includes('semantic') ? new Response('', { status: 500 }) : Response.json(set));
  const first = await f.run({ page: '1', per: '1', top_k: '3' });
  recovered = true;
  const second = await f.run({ page: '2', per: '1', top_k: '3' });
  for (const page of [first, second]) {
    assert.equal(page.data.mode_used, 'keyword');
    assert.equal(page.data.fallback, 'hybrid_error');
    assert.equal(page.response.headers.get('cache-control'), 'no-store');
    assert.equal(page.data.total, 3);
  }
  assert.equal(first.data.results[0].slug, 'speech-123');
  assert.equal(second.data.results[0].slug, 'speech-124');
  assert.equal(f.calls.length, 2, 'paging reuses the original fallback set');
  assert.equal(f.limits.length, 1, 'paging uses no further retrieval quota');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].response.headers.get('cache-control'), 'public, max-age=60');
  assert.match(f.writes[0].key, /-bounded-v1/);
  t.mock.timers.tick(60_001);
  const { data } = await f.run({ page: '1', per: '1', top_k: '3' });
  assert.equal(data.mode_used, 'hybrid');
  assert.equal(data.fallback, undefined);
  assert.equal(f.calls.length, 3);
});

test('web, voice and MCP unified search retain their rows and expose fallback metadata', async () => {
  const f = fixture(call => call.body.features.includes('semantic') ? new Response('', { status: 500 }) : answer());
  const { response, data } = await f.run({}, { unified: true });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.mode_used, 'keyword');
  assert.equal(data.fallback, 'hybrid_error');
  assert.equal(data.results[0].slug, 'speech-123');
  assert.equal(data.count, 1);
  assert.deepEqual(data.warnings, []);
  assert.equal(data.catalog_matches, 0);
  assert.equal(f.writes.length, 1);
});

test('unified document search returns no-store and Retry-After when both modes fail', async () => {
  const f = fixture(() => new Response('', { status: 500 }));
  const { response } = await f.run({}, { unified: true });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('each Progress query passes the request meter first, the keyword retry marked; a cached window passes none', async () => {
  const seen = [];
  const f = fixture(call => call.body.features.includes('semantic') ? Response.json({}, { status: 500 }) : answer(), { KB_METER: async (path, hedge) => { seen.push([path, hedge]); } });
  const first = await f.run();
  assert.equal(first.data.mode_used, 'keyword');
  assert.equal(f.calls.length, 2);
  assert.deepEqual(seen, [['/find', false], ['/find', true]]);
  await f.run();
  assert.equal(f.calls.length, 2, 'served from the window cache');
  assert.equal(seen.length, 2, 'a cached answer spends nothing');
  // A refused query is never sent, and the search gives up rather than retrying past the refusal.
  const refused = fixture(answer, { KB_METER: async () => { throw new Error('allowance spent'); } });
  const { response } = await refused.run();
  assert.equal(response.status, 503);
  assert.equal(refused.calls.length, 0);
});
