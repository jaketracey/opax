import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';

const read = file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const app = read('app.js');

test('route helpers wait for a consumer and share one load across concurrent consumers', async () => {
  const start = app.indexOf('function lazyReady(');
  assert.ok(start >= 0);
  const end = app.indexOf('\n}', start) + 2;
  const lazyReady = runInNewContext(app.slice(start, end) + ';lazyReady');
  let loads = 0, finish;
  const ready = lazyReady(() => { loads++; return new Promise(resolve => { finish = resolve; }); });
  await Promise.resolve();
  assert.equal(loads, 0, 'an unused helper must make no request');
  const consumers = Promise.all([ready, ready]);
  await Promise.resolve();
  assert.equal(loads, 1);
  finish('loaded');
  assert.deepEqual(await consumers, ['loaded', 'loaded']);
  assert.equal(await ready, 'loaded');
  assert.equal(loads, 1);
});

test('a failed route helper stays a rejected promise for all consumers', async () => {
  const start = app.indexOf('function lazyReady(');
  const end = app.indexOf('\n}', start) + 2;
  const lazyReady = runInNewContext(app.slice(start, end) + ';lazyReady');
  let loads = 0;
  const ready = lazyReady(() => { loads++; return Promise.reject(new Error('Offline fixture')); });
  await assert.rejects(Promise.resolve(ready), /Offline fixture/);
  await assert.rejects(Promise.resolve(ready), /Offline fixture/);
  assert.equal(loads, 1);
});

test('initialising the app makes no optional helper or historical-policy requests', () => {
  const start = app.indexOf('function lazyReady('), end = app.indexOf('\n}', start) + 2;
  const imports = [], requests = [];
  const initialisers = app.slice(app.indexOf('let voteTables;'), app.indexOf('const $ ='));
  runInNewContext(app.slice(start, end) + '\n' + initialisers.replace(/\bimport\(/g, 'load('), {
    load(path) { imports.push(path); return new Promise(() => {}); },
    fetch(path) { requests.push(path); return new Promise(() => {}); },
  });
  assert.ok(imports.length > 0, 'core helpers still start at boot');
  assert.ok(!imports.some(path => /\/(vote-tables|register-tables|growth-modules|ask-person|held-back-transcripts|sa-hansard)\.js/.test(path)));
  assert.deepEqual(requests, []);
});

test('the homepage does not fetch a donor identity index it never uses', () => {
  assert.doesNotMatch(read('home.js'), /loadDonorViewIndex|donorIndex|donor-views\.js/);
});

test('party and donor skeletons reserve their map before waiting for route helpers', async () => {
  const start = app.indexOf('\n  const body = $("subject-body");', app.indexOf('async function openSubject(')) + 1;
  const end = app.indexOf('\n  if (kind === "electorate") {', start);
  assert.ok(start >= 0 && end > start);
  for (const kind of ['donor','party','person']) {
    const events = [];
    const element = {classList:{toggle(){},add(){}},set innerHTML(value){events.push('skeleton');}};
    let release;
    const gate = new Promise(resolve => {release = resolve;});
    const pending = runInNewContext(`(async()=>{${app.slice(start,end)}})()`, {
      kind, name:'Fixture Entity', params:new URLSearchParams(), manageFocus:false,
      currentSubjectKey:'fixture',key:'fixture', growthModulesReady:gate,voteTablesReady:gate,
      $:id=>id === 'subject-body' ? element : {classList:{add(){}}},
      subjectSkeleton:()=>'<fixture>',reserveSubjectMap:()=>events.push('map-space'),
    });
    assert.deepEqual(events,kind === 'person' ? ['skeleton'] : ['skeleton','map-space']);
    release();
    await pending;
  }
});

test('verified profile metadata starts before the speech read, and unknown scopes do not prefetch it', async () => {
  const start = app.indexOf('  // Static profile reads do not depend');
  const end = app.indexOf('  let speeches =', start);
  assert.ok(start >= 0 && end > start);
  for (const roster of [null, {name:'Fixture Member',party:'Fixture Party'}]) {
    const calls = [];
    const reads = runInNewContext(app.slice(start,end) + ';({earlyFits,earlyElectorate,earlyMoney})', {
      roster, name:'Fixture Member',
      loadFits:async()=>{calls.push('fits');return {};},
      loadMoneyData:async()=>{calls.push('money');return {};},
      loadElectorateModule:async()=>{calls.push('electorate');return {loadIndex:async()=>({}),loadPeople:async()=>({people:[]}),findPerson:()=>null};},
    });
    assert.deepEqual(calls,roster ? ['fits','electorate','money'] : []);
    await Promise.all(Object.values(reads));
  }
});

function tableEntry(pathname, {app = true, votes = false} = {}) {
  const source = read('register-tables-entry.js');
  const imports = [];
  let hydrated = 0;
  // Stub module IO while running the entry's real route and DOM decisions.
  runInNewContext(source.replace(/\bimport\(/g, 'load('), {
    location: {pathname},
    document: {querySelector: selector => selector === '[data-vote-table]' ? (votes ? {} : null) : (app ? {} : null)},
    async load(path) { imports.push(path.split('?')[0]); return {hydrateRegisterTables() { hydrated++; }}; },
  });
  return {imports, hydrated: () => hydrated};
}

test('table entry makes no import on unrelated app pages', () => {
  for (const pathname of ['/ask', '/money', '/connections']) {
    assert.deepEqual(tableEntry(pathname).imports, [], pathname);
  }
  assert.doesNotMatch(read('index.html'), /<script[^>]+src="\/vote-tables\.js/);
});

test('needed app tables start early and standalone tables retain hydration', async () => {
  assert.deepEqual(tableEntry('/bill/example').imports, ['./vote-tables.js']);
  const person = tableEntry('/subject/person/example');
  assert.deepEqual(person.imports.sort(), ['./register-tables.js', './vote-tables.js']);
  const hub = tableEntry('/sitting/example', {app: false, votes: true});
  assert.deepEqual(hub.imports, ['./vote-tables.js']);
  const register = tableEntry('/instruments', {app: false});
  await Promise.resolve();
  assert.deepEqual(register.imports, ['./register-tables.js']);
  assert.equal(register.hydrated(), 1);
  assert.equal(person.hydrated(), 0, 'the SPA renderer owns its table hydration');
});

test('the money renderer gives the map its already loaded graph', () => {
  assert.match(app, /mountMoneyMap\(root, data, \{/);
  assert.doesNotMatch(app, /mountMoneyMap\(root, cfg\.file, \{/);
});

test('live counts start only on the stats route, once, while scheduled retries still run', () => {
  assert.doesNotMatch(app, /^loadLiveStats\(\);/m);
  const start = app.indexOf('function loadLiveStats(');
  const end = app.indexOf('\n}', start) + 2;
  let requests = 0;
  const load = runInNewContext(app.slice(start, end) + ';loadLiveStats', {
    liveStatsStarted: false, aggregateApi() { requests++; return new Promise(() => {}); },
  });
  load(); load();
  assert.equal(requests, 1);
  load(1);
  assert.equal(requests, 2);
});

test('the audit rejects a production origin before loading any browser tooling', () => {
  const result = spawnSync(process.execPath, [new URL('../../scripts/audit_web_vitals.mjs', import.meta.url).pathname], {
    env: {...process.env, OPAX_PERF_BASE: 'https://opax.com.au'}, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production audits are forbidden/);
});
