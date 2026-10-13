import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadWorker, offline } from './worker-harness.mjs';

const restore = offline(), pending = [];
const assets = JSON.parse(await readFile(new URL('./fixtures/agentic-electorates.json', import.meta.url), 'utf8')).assets;
const ctx = { waitUntil(p) { pending.push(p); }, passThroughOnException() {} };
const h = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname, ctx);
let unavailable = false, outbound = 0;
h.env.ASSETS = { async fetch(req) {
  const path = new URL(req.url).pathname;
  if (path.startsWith('/graph/money')) return Response.json({ nodes: [], edges: [] });
  if (path === '/parliamentarians.json') return Response.json({ people: [] });
  if (path === '/access.json') return Response.json({ ministers: {} });
  return !unavailable && assets[path] ? Response.json(assets[path]) : new Response('fixture missing', { status: 404 });
} };
h.env.AGENTIC_ASK_MODE = 'route';
h.env.COMMUNITY_DB = { prepare() { return { bind() { return { run: async () => ({ success: true }) }; } }; } };
h.env.GENERATION_CACHE = { get: async () => null, put: async () => {} };
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.fetch = async () => { outbound++; throw Error('No Ask, KB or generation calls permitted for these fixture data questions'); };
const post = (question, stream, cache = false) => h.fetch(`/api/ask${stream ? '?stream=1' : ''}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(!cache ? { 'x-opax-nocache': '1' } : {}), ...(stream ? { accept: 'text/event-stream' } : {}) },
  body: JSON.stringify({ question, kind: 'speech' }),
});
const frames = (text) => text.trim().split('\n\n').map((frame) => {
  const lines = frame.split('\n');
  return { event: lines.find((s) => s.startsWith('event: '))?.slice(7), data: JSON.parse(lines.find((s) => s.startsWith('data: '))?.slice(6) ?? '{}') };
});
const done = async (r, streaming) => streaming ? frames(await r.text()).find((f) => f.event === 'done')?.data : r.json();
const flush = async () => { while (pending.length) await Promise.all(pending.splice(0)); };

test('live Ask routing answers Census questions with page citations, real steps and zero model calls', async () => {
  for (const streaming of [false, true]) {
    const r = await post('What electorate has the lowest median income', streaming);
    assert.equal(r.status, 200);
    const payload = await done(r, streaming);
    assert.equal(payload.answered, true, JSON.stringify(payload));
    assert.match(payload.answer, /Alpine.*\$500 per week.*2021 Census \(ABS\)/);
    assert.doesNotMatch(payload.answer, /Counting speeches/);
    assert.deepEqual(payload.followups, []);
    for (const source of payload.sources.filter((s) => s.resource.startsWith('fact-'))) {
      assert.match(source.href, /^https:\/\/opax.com.au\/subject\/electorate\//);
      assert.match(source.title, /2021 Census \(ABS\)/);
    }
    assert.ok(Object.keys(payload.citations).length);
    assert.equal(payload.agentic.steps[0].label, 'Checking electorate data');
    assert.equal(payload.agentic.steps[0].arg, 'median income');
    await flush();
  }
  assert.equal(outbound, 0);
});

test('missing state Census values remain an honest non-answer in JSON and SSE without speech fallback', async () => {
  for (const streaming of [false, true]) {
    const r = await post('Which NSW state electorate has the lowest median income?', streaming);
    const payload = await done(r, streaming);
    assert.equal(payload.answered, false, JSON.stringify(payload));
    assert.equal(payload.reason, 'no_supported_claim');
    assert.equal(payload.answer, '');
    assert.deepEqual(payload.sources, []);
    await flush();
  }
  assert.equal(outbound, 0);
});

test('invalid and unknown electorate names remain non-answers in JSON and SSE', async () => {
  for (const name of ['<script>alert(1)</script>', 'Unknown Electorate']) for (const streaming of [false, true]) {
    const payload = await done(await post('What is the median age in ' + name + '?', streaming), streaming);
    assert.equal(payload.answered, false, JSON.stringify(payload));
    assert.equal(payload.answer, '');
    assert.deepEqual(payload.sources, []);
    await flush();
  }
  assert.equal(outbound, 0);
});

test('a cached valid lookup cannot bypass invalid-name rejection in JSON or SSE', async () => {
  const previous = globalThis.caches, cached = new Map();
  globalThis.caches = { default: {
    match: async req => cached.get(req.url)?.clone(),
    put: async (req, response) => { cached.set(req.url, response.clone()); },
  } };
  try {
    const valid = 'What is the median age in Sample Bay?';
    assert.equal((await done(await post(valid, false, true), false)).answered, true);
    await flush();
    assert.ok(cached.size);
    const hit = await post(valid, false, true);
    assert.equal(hit.headers.get('x-opax-cache'), 'HIT');
    assert.equal((await hit.json()).answered, true);
    for (const streaming of [false, true]) {
      const response = await post('What is the median age in Sample Bay>?', streaming, true);
      assert.equal(response.headers.get('x-opax-cache'), 'MISS');
      assert.equal((await done(response, streaming)).answered, false);
      await flush();
    }
  } finally { globalThis.caches = previous; }
  assert.equal(outbound, 0);
});

test('complete ranking counts decline above twenty in JSON and SSE without partial answers', async () => {
  for (const phrase of ['twenty-five', 'twenty five', '25', 'ninety-nine']) for (const streaming of [false, true]) {
    const question = `Which ${phrase} federal electorates have the highest unemployment rate?`;
    const payload = await done(await post(question, streaming), streaming);
    assert.equal(payload.answered, false, JSON.stringify(payload));
    assert.equal(payload.answer, '');
    assert.deepEqual(payload.sources, []);
    assert.equal(payload.reason, 'declined');
    await flush();
  }
  for (const phrase of ['top twenty', 'top three']) for (const streaming of [false, true]) {
    const payload = await done(await post(`${phrase} federal electorates by unemployment rate`, streaming), streaming);
    assert.equal(payload.answered, true, JSON.stringify(payload));
    for (const name of ['Alpine', 'Coast', 'Sample Bay']) assert.ok(payload.answer.includes(name));
    await flush();
  }
  assert.equal(outbound, 0);
});

test('unavailable published assets yield a failed step and no speech fallback', async () => {
  unavailable = true;
  const payload = await done(await post('What is the median age in Sample Bay?', true), true);
  assert.equal(payload.answered, false);
  assert.equal(payload.agentic.steps[0].state, 'failed');
  assert.equal(outbound, 0);
  await flush();
});
test.after(() => restore());
