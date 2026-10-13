import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/catalog-swr.json', import.meta.url), 'utf8'));
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = new Set(['cachedJson', 'cachedJsonRefreshes', 'catalogWarmup', 'CACHED_JSON_HARD_TTL',
  'AGGREGATE_UPSTREAM_TIMEOUT_MS', 'aggregateFetch', 'aggregateBatch', 'warmCatalog', 'withCacheStatus',
  'apiStats', 'apiTopics', 'apiTopic', 'apiParties', 'apiTide', 'apiPersonTopics', 'apiMatrix',
  'TOPIC_SLUGS', 'STATS_CACHE_TTL', 'TOPIC_FILTER_PREFIX', 'PARTY_FACET', 'STATE_FACET',
  'KIND_FACET', 'SPEECH_FILTER', 'DECADE_FILTER_PREFIX', 'TIDE_DECADES', 'MATRIX_PARTY_CAP']);
const selected = parsed.statements.filter(node => ts.isFunctionDeclaration(node)
  ? names.has(node.name?.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(parsed))));
// Execute the actual scheduled handler with unrelated external jobs stubbed.
const exported = parsed.statements.find(ts.isExportAssignment).expression.expression;
const scheduled = exported.properties.find(p => p.name?.getText(parsed) === 'scheduled');
const code = ts.transpileModule(selected.map(n => n.getText(parsed)).join('\n')
  + '\nconst worker = {' + scheduled.getText(parsed) + '};'
  + '\nglobalThis.api = {cachedJson, apiStats, apiTopics, apiTopic, apiParties, apiTide, apiPersonTopics, apiMatrix, warmCatalog, worker, TOPIC_SLUGS};',
  {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;

const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

function harness({upstream, timeout = AbortSignal.timeout.bind(AbortSignal)} = {}) {
  const rows = new Map(), waits = [], writes = [], calls = [], jobs = [];
  const env = {ARAG_KB_ID: 'fixture-kb', ARAG_KB_TOKEN: 'fixture-token'};
  let now = Date.parse('2026-10-13T10:00:00Z');
  class Clock extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;}}
  const keyOf = key => typeof key === 'string' ? key : key.url;
  const context = {
    Request, Response, URL, Date: Clock, console: {log() {}, error() {}},
    AbortSignal: {timeout},
    caches: {default: {
      async match(key) {return rows.get(keyOf(key))?.clone();},
      async put(key, response) {writes.push(keyOf(key)); rows.set(keyOf(key), response.clone());},
    }},
    sanitiseStoredResponse: async response => response,
    json: (value, status = 200) => Response.json(value, {status}),
    kbFetch: async (_env, path, init) => {
      calls.push({path, init});
      return upstream ? upstream(path, init) : Response.json(path === '/counters' ? fixture.counters : fixture.catalog);
    },
    INDEXNOW_CRON: '*/5 * * * *', REPLY_EMAIL_CRON: '*/5 * * * *',
    runIndexNow: async () => {jobs.push('indexnow');},
    expireVoiceSessions: async () => {jobs.push('expiry');},
    deliverReplyEmails: async () => {jobs.push('email');},
    runSocialPublication: async () => {jobs.push('social');},
    MAX_SPEAKER_CHARS: 160, NAME_RE: /^[\w ]+$/,
    canonicalSpeaker: name => name, speakerAttribution: async () => null,
  };
  runInNewContext(code, context);
  const ctx = {waitUntil(promise) {waits.push(promise);}};
  const seed = (path, value = {count: 10}, age = 601, headers = {}) => rows.set('https://opax.com.au' + path,
    Response.json(value, {headers: {'cache-control': 'public, max-age=604800',
      'x-opax-cached-at': new Clock(now - age * 1000).toISOString(), ...headers}}));
  return {api: context.api, rows, calls, writes, waits, jobs, ctx, env, seed,
    advance: ms => {now += ms;}, drain: async () => {await Promise.all(waits.splice(0));}};
}

test('fresh hit returns identical data and browser TTL without rebuilding or exposing storage TTL', async () => {
  const h = harness(); h.seed('/api/stats', {resources: 10}, 299);
  const out = await h.api.apiStats(h.env, h.ctx);
  assert.equal(out.headers.get('x-opax-cache'), 'HIT');
  assert.equal(out.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(await out.json(), {resources: 10});
  assert.equal(h.calls.length, 0); assert.equal(h.waits.length, 0); assert.equal(h.writes.length, 0);
});

test('stale hit returns before a successful background rebuild lands with a seven-day storage TTL', async () => {
  const gate = deferred(), h = harness(); h.seed('/api/topics');
  let builds = 0;
  const build = async () => {builds++; await gate.promise; return Response.json({count: 20});};
  const out = await h.api.cachedJson('/api/topics', build, h.ctx);
  assert.equal(out.headers.get('x-opax-cache'), 'STALE');
  assert.equal(out.headers.get('cache-control'), 'public, max-age=600');
  assert.deepEqual(await out.json(), {count: 10});
  assert.equal(builds, 1); assert.equal(h.writes.length, 0); assert.equal(h.waits.length, 1);
  gate.resolve(); await h.drain();
  const stored = h.rows.get('https://opax.com.au/api/topics');
  assert.equal(stored.headers.get('cache-control'), 'public, max-age=604800');
  assert.equal(stored.headers.get('x-opax-cached-at'), '2026-10-13T10:00:00.000Z');
  assert.deepEqual(await stored.clone().json(), {count: 20});
  const hit = await h.api.cachedJson('/api/topics', build, h.ctx);
  assert.equal(hit.headers.get('x-opax-cache'), 'HIT'); assert.equal(builds, 1);
});

test('non-OK and thrown background rebuilds keep the stale body and original timestamp, and allow retries', async () => {
  for (const failure of [() => Response.json({error: 'catalog failed'}, {status: 502}), () => {throw Error('offline');}]) {
    const h = harness(); h.seed('/api/topics');
    const previous = h.rows.get('https://opax.com.au/api/topics');
    const out = await h.api.cachedJson('/api/topics', async () => failure(), h.ctx);
    assert.equal(out.headers.get('x-opax-cache'), 'STALE'); assert.deepEqual(await out.json(), {count: 10});
    await h.drain(); assert.equal(h.writes.length, 0);
    assert.equal(h.rows.get('https://opax.com.au/api/topics'), previous);
    await h.api.cachedJson('/api/topics', async () => Response.json({count: 30}), h.ctx);
    await h.drain(); assert.deepEqual(await h.rows.get('https://opax.com.au/api/topics').clone().json(), {count: 30});
  }
});

test('cold upstream non-OK and exceptions return the existing 502 JSON and are not cached', async () => {
  for (const upstream of [async () => new Response(null, {status: 503}), async () => {throw Error('offline');}]) {
    const h = harness({upstream});
    const out = await h.api.apiTopic('housing', h.env, h.ctx);
    assert.equal(out.status, 502); assert.deepEqual(await out.json(), {error: 'catalog failed'});
    assert.equal(out.headers.get('x-opax-cache'), 'MISS'); assert.equal(h.writes.length, 0);
  }
});

test('cold aggregate timeout is set to 25 seconds and an abort becomes 502', async () => {
  const controller = new AbortController(), deadlines = [], started = deferred();
  const h = harness({timeout: ms => {deadlines.push(ms); return controller.signal;},
    upstream: (_path, {signal}) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once: true}); started.resolve();
    })});
  const request = h.api.apiTopic('housing', h.env, h.ctx);
  await started.promise; controller.abort(new DOMException('Timed out', 'TimeoutError'));
  const out = await request;
  assert.deepEqual(deadlines, [25000, 25000, 25000, 25000]);
  assert.equal(out.status, 502); assert.deepEqual(await out.json(), {error: 'catalog failed'});
  assert.equal(h.writes.length, 0);
});

test('concurrent stale requests share one four-call topic rebuild per key, and a different key rebuilds independently', async () => {
  const gate = deferred(); let active = 0;
  const h = harness({upstream: async () => {active++; await gate.promise; return Response.json(fixture.catalog);}});
  h.seed('/api/topic/housing'); h.seed('/api/topic/health');
  const responses = await Promise.all(Array.from({length: 8}, () => h.api.apiTopic('housing', h.env, h.ctx)));
  assert.equal(h.calls.length, 4); assert.equal(active, 4); assert.equal(h.waits.length, 8);
  for (const out of responses) {assert.equal(out.headers.get('x-opax-cache'), 'STALE'); assert.deepEqual(await out.json(), {count: 10});}
  await h.api.apiTopic('health', h.env, h.ctx); assert.equal(h.calls.length, 8);
  gate.resolve(); await h.drain(); assert.equal(h.writes.length, 2);
  h.advance(601000); await h.api.apiTopic('housing', h.env, h.ctx); await h.drain();
  assert.equal(h.calls.length, 12, 'completed work leaves no lock behind');
});

test('legacy entries without a timestamp are served stale and migrated in the background', async () => {
  const h = harness(); h.seed('/api/topics', {count: 10}, 0, {'x-opax-cached-at': ''});
  const out = await h.api.apiTopics(h.env, h.ctx);
  assert.equal(out.headers.get('x-opax-cache'), 'STALE'); await h.drain();
  assert.equal(h.writes.length, 1);
});

test('all other cachedJson callers retain their browser TTL and schedule stale rebuilds', async () => {
  const h = harness();
  const cases = [
    ['/api/parties', () => h.api.apiParties(h.env, h.ctx), 600],
    ['/api/tide?scope=federal', () => h.api.apiTide(new URL('https://opax.com.au/api/tide'), h.env, h.ctx), 600],
    ['/api/person-topics?name=Example%20Member&scope=split-speakers-v2', () => h.api.apiPersonTopics(new URL('https://opax.com.au/api/person-topics?name=Example%20Member'), h.env, h.ctx), 600],
    ['/api/matrix', () => h.api.apiMatrix(h.env, h.ctx), 900],
  ];
  for (const [path, invoke, ttl] of cases) {
    h.seed(path, {saved: path}, ttl + 1);
    const out = await invoke();
    assert.equal(out.headers.get('x-opax-cache'), 'STALE');
    assert.equal(out.headers.get('cache-control'), 'public, max-age=' + ttl);
    assert.deepEqual(await out.json(), {saved: path}); await h.drain();
  }
  assert.equal(h.writes.length, 4);
});

test('successful cold stats, topics and topic responses keep the current payload shapes', async () => {
  const h = harness();
  assert.deepEqual(await (await h.api.apiStats(h.env, h.ctx)).json(), {
    resources: 120, paragraphs: 480, kinds: {speech: 100}, speeches_by_state: {federal: 30},
  });
  const topics = await (await h.api.apiTopics(h.env, h.ctx)).json();
  assert.equal(topics.labelled, 100); assert.equal(topics.topics.length, 21);
  assert.deepEqual(topics.topics.find(t => t.slug === 'housing'), {slug: 'housing', count: 30});
  assert.deepEqual(await (await h.api.apiTopic('housing', h.env, h.ctx)).json(), {
    slug: 'housing', count: 100, labelled: 100, parties: [['Example Party', 30]], states: [['federal', 30, 1]],
  });
});

test('stats keeps its partial cold response but never overwrites complete stale stats with a failed facet', async () => {
  const h = harness({upstream: async path => path.includes('faceted=') ? new Response(null, {status: 503}) : Response.json(fixture.counters)});
  const partial = await h.api.apiStats(h.env, h.ctx);
  assert.equal(partial.status, 200);
  assert.deepEqual(await partial.json(), {...fixture.counters, kinds: null, speeches_by_state: null});
  assert.equal(h.writes.length, 0);
  h.seed('/api/stats', {resources: 120, kinds: {speech: 100}}, 301);
  const previous = h.rows.get('https://opax.com.au/api/stats');
  const stale = await h.api.apiStats(h.env, h.ctx);
  assert.equal(stale.headers.get('x-opax-cache'), 'STALE'); await h.drain();
  assert.equal(h.rows.get('https://opax.com.au/api/stats'), previous);
});

test('existing five-minute scheduled handler warms every stale or missing aggregate with at most four upstream calls; fresh entries cost nothing', async () => {
  let active = 0, peak = 0;
  // Keep connections counted until the response body is consumed, as Workers does.
  const tracked = harness({upstream: async path => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    const bytes = new TextEncoder().encode(JSON.stringify(path === '/counters' ? fixture.counters : fixture.catalog));
    return new Response(new ReadableStream({type: 'bytes', pull(controller) {
      controller.enqueue(bytes); controller.close(); active--;
    }}), {headers: {'content-type': 'application/json'}});
  }});
  tracked.seed('/api/stats', {old: true}, 0); tracked.seed('/api/topics', {old: true}, 0);
  await tracked.api.worker.scheduled({cron: '*/5 * * * *', scheduledTime: Date.now()}, tracked.env, tracked.ctx);
  assert.equal(peak, 4); assert.equal(active, 0);
  // Stats and topics were seeded fresh (age 0), so only the 21 missing topic pages are built.
  assert.equal(tracked.calls.length, 21 * 4); assert.equal(tracked.writes.length, 21);
  assert.deepEqual(await tracked.rows.get('https://opax.com.au/api/stats').clone().json(), {old: true});
  assert.deepEqual(tracked.jobs, ['indexnow', 'expiry', 'email']);
  assert.equal(tracked.waits.length, 0, 'cron awaits the whole warm-up');
  for (const slug of tracked.api.TOPIC_SLUGS) assert.ok(tracked.rows.has('https://opax.com.au/api/topic/' + slug));
});

test('warm-up waits for sibling reads after an early rejection and consumes non-OK bodies before advancing', async () => {
  let active = 0, peak = 0, failures = 0;
  const h = harness({upstream: async path => {
    active++; peak = Math.max(peak, active);
    if (path === '/counters') {active--; throw Error('early network failure');}
    await new Promise(resolve => setTimeout(resolve, 2));
    const status = path.includes('/housing') ? 503 : 200;
    failures += status === 503 ? 1 : 0;
    const bytes = new TextEncoder().encode(JSON.stringify(fixture.catalog));
    return new Response(new ReadableStream({type: 'bytes', pull(controller) {
      controller.enqueue(bytes); controller.close(); active--;
    }}), {status, headers: {'content-type': 'application/json'}});
  }});
  h.seed('/api/stats', {resources: 10}); h.seed('/api/topic/housing');
  await h.api.worker.scheduled({cron: '*/5 * * * *'}, h.env, h.ctx);
  assert.equal(peak, 4); assert.equal(active, 0); assert.equal(failures, 2);
  assert.equal(h.calls.length, 89); assert.equal(h.writes.length, 21);
  assert.deepEqual(await h.rows.get('https://opax.com.au/api/topic/housing').clone().json(), {count: 10});
});

test('scheduled warming continues after one endpoint fails and stays out of the social schedule', async () => {
  const h = harness({upstream: async path => path === '/counters' ? new Response(null, {status: 503}) : Response.json(fixture.catalog)});
  h.seed('/api/stats', {resources: 10}, 301);
  await h.api.worker.scheduled({cron: '*/5 * * * *'}, h.env, h.ctx);
  assert.equal(h.writes.length, 22);
  assert.deepEqual(await h.rows.get('https://opax.com.au/api/stats').clone().json(), {resources: 10});
  const social = harness();
  await social.api.worker.scheduled({cron: '0,5,10 22 * * *'}, social.env, social.ctx);
  assert.deepEqual(social.jobs, ['social']); assert.equal(social.calls.length, 0);
});

test('overlapping warm-up ticks share one run per isolate and release the lock when complete', async () => {
  const gate = deferred();
  const h = harness({upstream: async path => {await gate.promise; return Response.json(path === '/counters' ? fixture.counters : fixture.catalog);}});
  const first = h.api.warmCatalog(h.env, h.ctx);
  const second = h.api.warmCatalog(h.env, h.ctx);
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(h.calls.length, 89); assert.equal(h.writes.length, 23);
  // A later tick finds every entry fresh and makes no upstream calls.
  await h.api.warmCatalog(h.env, h.ctx);
  assert.equal(h.calls.length, 89); assert.equal(h.writes.length, 23);
});
