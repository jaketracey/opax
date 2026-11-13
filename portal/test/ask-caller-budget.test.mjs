// x-opax-ask-budget-ms is honoured only for internal callers, and a shortened run never fills the shared answer cache.
// The real Worker over fixture Census data: these questions are answered with no model, KB or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { loadWorker, offline } from './worker-harness.mjs';

crypto.subtle.timingSafeEqual ??= timingSafeEqual;
const restore = offline(), pending = [];
const assets = JSON.parse(await readFile(new URL('./fixtures/agentic-electorates.json', import.meta.url), 'utf8')).assets;
const ctx = { waitUntil(p) { pending.push(p); }, passThroughOnException() {} };
const h = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname, ctx);
h.env.ASSETS = { async fetch(req) {
  const path = new URL(req.url).pathname;
  if (path.startsWith('/graph/money')) return Response.json({ nodes: [], edges: [] });
  if (path === '/parliamentarians.json') return Response.json({ people: [] });
  if (path === '/access.json') return Response.json({ ministers: {} });
  return assets[path] ? Response.json(assets[path]) : new Response('fixture missing', { status: 404 });
} };
h.env.AGENTIC_ASK_MODE = 'route';
h.env.COMMUNITY_DB = { prepare() { return { bind() { return { run: async () => ({ success: true }) }; } }; } };
h.env.GENERATION_CACHE = { get: async () => null, put: async () => {} };
const SECRET = 's'.repeat(40);
h.env.ASK_INTERNAL_SECRET = SECRET;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw Error('No Ask, KB or generation calls permitted for these fixture data questions'); };
const cached = new Map();
globalThis.caches = { default: { match: async req => cached.get(req.url)?.clone(), put: async (req, response) => { cached.set(req.url, response.clone()); } } };
const flush = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
const ask = (question, headers = {}) => h.fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ question, kind: 'speech' }) });

test.after(() => restore());

test('a public request carrying the budget header is answered and cached as if the header were absent', async () => {
  cached.clear();
  for (const headers of [
    { 'x-opax-ask-budget-ms': '25000' },
    { 'x-opax-ask-budget-ms': '25000', 'cf-connecting-ip': 'voice-ask:pretend' },
    { 'x-opax-ask-budget-ms': '25000', 'x-opax-ask-internal': 'not-the-secret-but-long-enough-to-try-it-on' },
  ]) {
    cached.clear();
    const response = await ask('What is the median age in Sample Bay?', headers);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answered, true);
    await flush();
    assert.equal(cached.size, 1, JSON.stringify(headers));
  }
  assert.equal(outbound, 0);
});

test('an internal shortened run answers but is not cached, and the next reader still misses', async () => {
  cached.clear();
  const response = await ask('What is the median age in Sample Bay?', { 'x-opax-ask-budget-ms': '25000', 'x-opax-ask-internal': SECRET, 'cf-connecting-ip': 'voice-ask:session' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answered, true);
  await flush();
  assert.equal(cached.size, 0, 'a shortened run must not fill the shared cache');
  const reader = await ask('What is the median age in Sample Bay?');
  assert.equal(reader.headers.get('x-opax-cache'), 'MISS');
  await reader.json(); await flush();
  assert.equal(cached.size, 1, 'the full run is cached as usual');
  // The internal caller still reads the shared cache.
  const again = await ask('What is the median age in Sample Bay?', { 'x-opax-ask-budget-ms': '25000', 'x-opax-ask-internal': SECRET });
  assert.equal(again.headers.get('x-opax-cache'), 'HIT');
  assert.equal(outbound, 0);
});

test('without ASK_INTERNAL_SECRET configured no budget header is honoured', async () => {
  cached.clear();
  const saved = h.env.ASK_INTERNAL_SECRET;
  delete h.env.ASK_INTERNAL_SECRET;
  try {
    const response = await ask('What is the median age in Sample Bay?', { 'x-opax-ask-budget-ms': '25000', 'x-opax-ask-internal': SECRET });
    assert.equal((await response.json()).answered, true);
    await flush();
    assert.equal(cached.size, 1);
  } finally { h.env.ASK_INTERNAL_SECRET = saved; }
});
