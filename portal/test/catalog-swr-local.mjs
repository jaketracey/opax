// Reproducible local proof: actual Worker and Cache API, fixture-only upstream.
// Run from portal/: node test/catalog-swr-local.mjs
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';

const folder = mkdtempSync(join(tmpdir(), 'opax-catalog-swr-'));
const portal = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/catalog-swr.json', import.meta.url), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const available = port => new Promise(resolve => {
  const server = createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
let child, stopped;
try {
  let port = 8962;
  while (!(await available(port)) || !(await available(port + 1000))) port++;
  assert.ok(port < 9000, 'no free web fixture port');
  writeFileSync(join(folder, 'fixture.ts'), `
import worker from ${JSON.stringify(join(portal, 'src/index.ts'))};
const fixture = ${JSON.stringify(fixture)};
let mode = 'success', calls = 0, active = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== 'fixture.rag.progress.cloud') throw Error('External fetch blocked by local fixture');
  calls++; active++;
  try {
    await new Promise((resolve, reject) => {
      const timer = mode === 'hang' ? undefined : setTimeout(resolve, 2000);
      const abort = () => {clearTimeout(timer); reject(init.signal.reason);};
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener('abort', abort, {once: true});
    });
    if (mode === 'fail') return Response.json({error: 'fixture unavailable'}, {status: 503});
    return Response.json(url.pathname.endsWith('/counters') ? fixture.counters : fixture.catalog);
  } finally {active--;}
};
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/__fixture/state') return Response.json({mode, calls, active});
    if (url.pathname === '/__fixture/mode') {mode = url.searchParams.get('value'); return Response.json({mode});}
    if (url.pathname === '/__fixture/seed') {
      const path = url.searchParams.get('path');
      await caches.default.put(new Request('https://opax.com.au' + path), Response.json({count: 10}, {
        headers: {'cache-control': 'public, max-age=604800', 'x-opax-cached-at': '2026-01-01T00:00:00Z'},
      }));
      return Response.json({seeded: path});
    }
    if (!['/api/stats', '/api/topics', '/api/topic/housing', '/api/topic/health'].includes(url.pathname)) {
      return new Response('Fixture route unavailable', {status: 404});
    }
    return worker.fetch(request, {...env, ARAG_ZONE: 'fixture', ARAG_KB_ID: 'fixture-kb',
      ARAG_KB_TOKEN: 'fixture-token', COMMUNITY_ORIGIN: 'https://opax.com.au'}, ctx);
  },
};
`);
  writeFileSync(join(folder, 'wrangler.json'), JSON.stringify({name: 'opax-catalog-swr-local',
    main: './fixture.ts', compatibility_date: '2026-09-01', compatibility_flags: ['nodejs_compat']}));
  let logs = '';
  child = spawn(process.execPath, [join(portal, 'node_modules/wrangler/bin/wrangler.js'), 'dev',
    '--config', join(folder, 'wrangler.json'), '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(port + 1000), '--persist-to', join(folder, 'state'), '--log-level', 'error'],
    {cwd: folder, env: {...process.env, WRANGLER_SEND_METRICS: 'false'}, stdio: ['ignore', 'pipe', 'pipe']});
  stopped = new Promise(resolve => child.once('exit', resolve));
  child.stdout.on('data', data => {logs += data;}); child.stderr.on('data', data => {logs += data;});
  const origin = 'http://127.0.0.1:' + port;
  const get = path => fetch(origin + path);
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try {ready = (await get('/__fixture/state')).ok;} catch {}
    if (ready || child.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, 'Wrangler did not start: ' + logs);
  console.log('wrangler dev local fixture port=' + port + ' upstream_delay_ms=2000');
  const measure = async path => {
    const start = performance.now(), out = await get(path), body = await out.json();
    const result = {path, status: out.status, cache: out.headers.get('x-opax-cache'),
      milliseconds: Number((performance.now() - start).toFixed(2)), body};
    console.log(JSON.stringify({...result, body: undefined, count: body.count, resources: body.resources}));
    return result;
  };
  const awaitIdle = async () => {
    for (let i = 0; i < 100; i++) {
      if ((await (await get('/__fixture/state')).json()).active === 0) {await pause(50); return;}
      await pause(50);
    }
    throw Error('Fixture refresh did not finish');
  };
  for (const path of ['/api/topic/housing', '/api/stats', '/api/topics']) {
    await (await get('/__fixture/seed?path=' + encodeURIComponent(path))).json();
    const stale = await measure(path);
    assert.equal(stale.cache, 'STALE'); assert.deepEqual(stale.body, {count: 10});
    assert.ok(stale.milliseconds < 500, 'stale response must not wait for the 2-second upstream');
    if (path.endsWith('/housing')) {
      const burst = await Promise.all(Array.from({length: 8}, () => get(path).then(r => r.json())));
      assert.ok(burst.every(r => r.count === 10));
      assert.equal((await (await get('/__fixture/state')).json()).calls, 4);
      console.log('burst: 9 stale requests shared 4 upstream calls');
    }
    await awaitIdle();
    const hit = await measure(path);
    assert.equal(hit.cache, 'HIT');
    if (path.endsWith('/housing')) assert.equal(hit.body.count, 100);
    if (path === '/api/stats') assert.equal(hit.body.resources, 120);
    if (path === '/api/topics') assert.equal(hit.body.topics.length, 21);
  }
  await (await get('/__fixture/mode?value=fail')).json();
  await (await get('/__fixture/seed?path=/api/topic/housing')).json();
  const failedStale = await measure('/api/topic/housing'); assert.equal(failedStale.cache, 'STALE');
  await awaitIdle();
  const kept = await measure('/api/topic/housing');
  assert.equal(kept.cache, 'STALE'); assert.deepEqual(kept.body, {count: 10});
  await awaitIdle();
  await (await get('/__fixture/mode?value=hang')).json();
  const cold = await measure('/api/topic/health');
  assert.equal(cold.status, 502); assert.deepEqual(cold.body, {error: 'catalog failed'});
  assert.ok(cold.milliseconds >= 24000 && cold.milliseconds < 27000);
  console.log('local fixture proof passed; no production calls');
} finally {
  if (child && child.exitCode === null) {child.kill('SIGTERM'); await stopped;}
  rmSync(folder, {recursive: true, force: true});
}
