import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { searchFind, SEMANTIC_SEARCH_MS, KEYWORD_SEARCH_MS } from '../src/search-find.ts';
import { cacheKeyParams } from '../src/cache-key.ts';
import { compareSearchResults } from '../src/search-sort.ts';
import { normalizePassage, passageWindow } from '../src/passage-text.ts';
import { speechPresentation, joinMixedSpeakers } from '../src/mixed-speakers.ts';
import { pressTitle } from '../src/press-title.ts';
import { isWitness } from '../public/speech-attribution.js';
import { CATALOG_KINDS } from '../src/catalog-search.ts';
import { tokens as catalogTokens } from '../src/catalog-query.mjs';

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

function fixture(upstream = answer) {
  const calls = [], writes = [], cache = new Map(), pendingWrites = [];
  const ctx = { waitUntil: work => pendingWrites.push(work) };
  const env = { CACHE_EPOCH: 'fixture', ARAG_KB_TOKEN: 'fixture' };
  const context = {
    URL, URLSearchParams, Request, Response, AbortSignal, searchFind, cacheKeyParams, compareSearchResults,
    normalizePassage, passageWindow, speechPresentation, joinMixedSpeakers, pressTitle, isWitness,
    CATALOG_KINDS, catalogTokens, validateSearchQuery: () => null,
    searchCatalogPaged: async () => ({ stubs: [], total: 0, truncated: false }),
    loadPeople: async () => ({ byFold: new Map() }), speakerAttribution: async () => null,
    filterExpression: () => filters, speakerPrints: async () => null,
    stripListingBoilerplate: text => text, foldName: text => text.toLowerCase(), personScope: () => null,
    SLUG_RE: /^(speech|legal)-(\d+)$/, DIVISION_SLUG_RE: /^division-/,
    SEARCH_PER_DEFAULT: 20, SEARCH_PER_MAX: 200, SEARCH_WINDOW_TOPK: 200, SEARCH_TOPK_MAX: 200,
    SEARCH_WINDOW_CACHE_TTL: 3600, SEARCH_CACHE_TTL: 600,
    sha256Hex: async text => text, cacheRequest: (kind, key) => new Request('https://cache.test/' + kind + '/' + encodeURIComponent(key)),
    cacheBypass: () => false, rateLimited: async () => null,
    caches: { default: {
      match: async key => cache.get(key.url)?.clone(),
      put: async (key, response) => { writes.push({ key: key.url, response: response.clone() }); cache.set(key.url, response); },
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
  return { calls, writes, worker,
    window: (mode = 'hybrid', signal) => worker.searchWindow(env, { q: 'housing', mode, kind: 'speech', topK: 2, url: new URL('https://local.test/api/search?state=federal'), signal }),
    run: async (params = {}, { unified = false, signal } = {}) => {
      const url = new URL('https://local.test/api/' + (unified ? 'search-all' : 'search') + '?' + new URLSearchParams({ q: 'housing', kind: 'speech', top_k: '2', state: 'federal', ...params }));
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

for (const mode of ['hybrid', 'semantic']) test(`${mode} deadline aborts the upstream and returns marked keyword results without caching`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(call => call.body.features.includes('semantic') ? hang() : answer());
  const work = f.run({ mode });
  await setImmediate();
  assert.equal(f.calls.length, 1);
  t.mock.timers.tick(SEMANTIC_SEARCH_MS - 1);
  await setImmediate();
  assert.equal(f.calls[0].signal.aborted, false);
  assert.equal(f.calls.length, 1);
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
  assert.equal(f.writes.length, 0, 'neither the window nor its page is cached');
});

for (const [failure, fail] of [
  ['HTTP error', () => new Response('', { status: 502 })],
  ['network error', () => { throw new Error('Fixture connection lost'); }],
  ['invalid JSON', () => new Response('{')],
]) test(`${failure} recovers from semantic to keyword`, async () => {
  const f = fixture(call => call.body.features.includes('semantic') ? fail() : answer());
  const { response, data } = await f.run({ mode: 'semantic' });
  assert.equal(response.status, 200);
  assert.equal(data.mode, 'semantic');
  assert.equal(data.mode_used, 'keyword');
  assert.equal(data.fallback, 'semantic_error');
  assertSameWindow(f.calls);
  assert.equal(f.writes.length, 0);
});

test('keyword failure recovers through semantic with the same window', async () => {
  const f = fixture(call => call.body.features[0] === 'keyword' ? new Response('', { status: 503 }) : answer());
  const { response, data } = await f.run({ mode: 'keyword' });
  assert.equal(response.status, 200);
  assert.equal(data.mode, 'keyword');
  assert.equal(data.mode_used, 'semantic');
  assert.equal(data.fallback, 'keyword_error');
  assert.deepEqual(assertSameWindow(f.calls).nextFeatures, ['semantic']);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(f.writes.length, 0);
});

test('hybrid recovers through semantic when the keyword service fails', async () => {
  const f = fixture(call => call.body.features.includes('keyword') ? new Response('', { status: 503 }) : answer());
  const { response, data } = await f.run();
  assert.equal(response.status, 200);
  assert.equal(data.mode, 'hybrid');
  assert.equal(data.mode_used, 'semantic');
  assert.equal(data.fallback, 'hybrid_error');
  assert.deepEqual(f.calls.map(call => call.body.features), [['keyword', 'semantic'], ['keyword'], ['semantic']]);
  const bodies = f.calls.map(({ body: { features, reranker, ...body } }) => body);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[2], bodies[0]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(f.writes.length, 0);
});

test('both failed modes produce a retryable, uncached 503', async () => {
  const f = fixture(() => new Response('', { status: 503 }));
  const { response, data } = await f.run();
  assert.equal(response.status, 503);
  assert.deepEqual(data, { error: 'find failed' });
  assert.equal(response.headers.get('retry-after'), '5');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(f.calls.length, 3);
  assert.equal(f.writes.length, 0);
  assert.equal(await f.window(), null, 'direct searchWindow callers retain their failure shape');
});

test('both hanging modes finish after their combined 10 second budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(hang);
  const work = f.run();
  await setImmediate();
  t.mock.timers.tick(SEMANTIC_SEARCH_MS);
  await setImmediate();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].signal.aborted, false);
  t.mock.timers.tick(KEYWORD_SEARCH_MS);
  const { response } = await work;
  assert.equal(response.status, 503);
  assert.equal(f.calls[1].signal.aborted, true);
  assert.equal(SEMANTIC_SEARCH_MS + KEYWORD_SEARCH_MS, 10_000);
});

test('a stalled response body also reaches the semantic deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture((_call, number) => number === 1 ? { ok: true, json: hang } : answer());
  const work = f.run();
  await setImmediate();
  t.mock.timers.tick(SEMANTIC_SEARCH_MS);
  const { data } = await work;
  assert.equal(data.fallback, 'hybrid_timeout');
  assert.equal(data.mode_used, 'keyword');
});

test('semantic recovery after a keyword error uses only the remaining total budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture((_call, number) => number === 2 ? new Response('', { status: 503 }) : hang());
  const work = f.run();
  await setImmediate();
  t.mock.timers.tick(SEMANTIC_SEARCH_MS);
  await setImmediate();
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2].signal.aborted, false);
  t.mock.timers.tick(KEYWORD_SEARCH_MS);
  const { response } = await work;
  assert.equal(response.status, 503);
  assert.equal(f.calls[2].signal.aborted, true);
});

test('caller cancellation stops the current attempt without a recovery call', async () => {
  const f = fixture(hang), parent = new AbortController();
  const work = f.window('hybrid', parent.signal);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  await setImmediate();
  parent.abort();
  await rejected;
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].signal.aborted, true);
  await assert.rejects(f.window('hybrid', parent.signal), { name: 'AbortError' });
  assert.equal(f.calls.length, 1);
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

test('a fallback does not hide a recovered hybrid on the next request', async () => {
  let recovered = false;
  const f = fixture(call => !recovered && call.body.features.includes('semantic') ? new Response('', { status: 500 }) : answer());
  assert.equal((await f.run()).data.fallback, 'hybrid_error');
  recovered = true;
  const { data } = await f.run();
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
  assert.equal(f.writes.length, 0);
});

test('unified document search returns no-store and Retry-After when both modes fail', async () => {
  const f = fixture(() => new Response('', { status: 500 }));
  const { response } = await f.run({}, { unified: true });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
