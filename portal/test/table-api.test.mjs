import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TABLE_DATASETS} from '../public/table-datasets.js';
import {MONEY_GRAPHS, isOrganisationDonor, withheldPhrases, namesWithheldPhrase} from '../public/donor-entity.js';
import {tablePrivacyCheck} from '../src/table-privacy.mjs';
import {tableApi} from '../src/table-api.ts';
import {buildTableIndexes, interestTableRows, TABLE_BUDGET} from '../../scripts/build_table_indexes.mjs';
import {loadWorker, offline} from './worker-harness.mjs';

const pub = new URL('../public/', import.meta.url).pathname;
const root = await mkdtemp(join(tmpdir(), 'opax-table-api-'));
test.after(() => rm(root, {recursive: true, force: true}));
function entries(config, count = 260) {
  return Array.from({length: count}, (_, i) => {
    const row = Object.fromEntries(config.columns.map(c => [c.key,
      c.type === 'category' ? `Group ${i % 2}` : c.type === 'date' ? '2024-01-01' : c.type === 'year' ? 2000 + i : ['count', 'money'].includes(c.type) ? i + 0.25 : `Record ${i}`]));
    row.id = `item-${i}`;
    const primary = config.columns.find(c => c.type === 'text' && c.key !== 'id');
    row[primary.key] = i === 3 ? 'Needle record' : `Record ${i}`;
    if (config === TABLE_DATASETS['money-connections'] || config === TABLE_DATASETS['party-money']) {
      row.from += ' Services Pty Ltd'; row.type = 'receipts';
      return {row, donors: [{label: row.from, aliases: []}]};
    }
    return {row};
  });
}
const datasets = Object.fromEntries(Object.entries(TABLE_DATASETS).map(([name, config]) => [name, entries(config)]));
const built = await buildTableIndexes(root, datasets);
const paths = [];
const pending = [];
const cacheEntries = new Map();
globalThis.caches = {default: {async match(req) { return cacheEntries.get(req.url)?.clone(); }, async put(req, response) { cacheEntries.set(req.url, response); }}};
const env = {CACHE_EPOCH: 'fixture', ASSETS: {async fetch(req) {
  const path = new URL(req.url).pathname;
  paths.push(path);
  if (MONEY_GRAPHS.includes(path)) return Response.json({nodes: []});
  try { return new Response(await readFile(join(root, path.slice(1)))); }
  catch { return new Response('missing', {status: 404}); }
}}};
const ctx = {waitUntil(promise) {pending.push(promise);}};
const call = (name, query = '', init) => tableApi(new Request(`https://opax.com.au/api/table/${name}${query ? '?' + query : ''}`, init), env, ctx);
const uncached = () => {cacheEntries.clear(); paths.length = 0;};

for (const [name, config] of Object.entries(TABLE_DATASETS)) test(`${name}: paging, sorts, search, categorical and numeric facets, CSV and page cap`, async () => {
  uncached();
  const numeric = config.columns.find(c => ['money', 'count', 'year'].includes(c.type));
  const category = config.columns.find(c => c.type === 'category' && c.key !== 'type');
  const firstResponse = await call(name, `sort=${numeric.key}:asc&pageSize=2`);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.total, 260);
  assert.equal(first.page, 1);
  assert.deepEqual(first.rows.map(r => r.id), ['item-0', 'item-1']);
  assert.deepEqual(first.facets[category.key], [{value: 'Group 0', count: 130}, {value: 'Group 1', count: 130}]);
  assert.deepEqual(first.facets[numeric.key], {min: datasets[name][0].row[numeric.key], max: datasets[name][259].row[numeric.key]});
  const second = await (await call(name, `sort=${numeric.key}:asc&pageSize=2&page=2`)).json();
  assert.deepEqual(second.rows.map(r => r.id), ['item-2', 'item-3']);
  const desc = await (await call(name, `sort=${numeric.key}:desc&pageSize=2`)).json();
  assert.deepEqual(desc.rows.map(r => r.id), ['item-259', 'item-258']);
  const cap = await (await call(name, 'pageSize=99999&page=99999')).json();
  assert.equal(cap.pageSize, 200);
  assert.equal(cap.page, 2);
  assert.equal(cap.rows.length, 60);
  const filter = new URLSearchParams({[`f.${category.key}`]: 'Group 1', [`f.${numeric.key}.min`]: String(datasets[name][2].row[numeric.key]), [`f.${numeric.key}.max`]: String(datasets[name][5].row[numeric.key]), sort: `${numeric.key}:asc`});
  const filtered = await (await call(name, filter.toString())).json();
  assert.equal(filtered.total, 2);
  assert.deepEqual(filtered.rows.map(r => r.id), ['item-3', 'item-5']);
  assert.deepEqual(filtered.facets[category.key], [{value: 'Group 1', count: 2}]);
  const found = await (await call(name, 'q=NEED&pageSize=1')).json();
  assert.equal(found.total, 1, 'free text supports partial terms and case folding');
  assert.equal(found.rows[0].id, 'item-3');
  const textSort = config.columns.find(c => c.type === 'text' && c.key !== 'id');
  const sortedText = await (await call(name, `sort=${textSort.key}:asc&pageSize=1`)).json();
  assert.equal(sortedText.rows[0].id, 'item-3');
  const csvResponse = await call(name, `format=csv&${filter}&pageSize=1&page=2`);
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type'), /^text\/csv/);
  const csv = await csvResponse.text();
  assert.equal(csv.split('\r\n').filter(Boolean).length, 3, 'exports the entire filtered set');
  assert.ok(csv.includes('"' + datasets[name][3].row[numeric.key] + '"'), 'exact unformatted numeric value');
  assert.equal(csvResponse.headers.get('x-table-exported'), '2');
  const empty = await (await call(name, 'q=absentterm')).json();
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.page, 1);
  const unknown = await (await call(name, `f.${category.key}=__proto__`)).json();
  assert.equal(unknown.total, 0, 'unknown category values cannot use inherited properties');
});

test('normalized queries share an edge cache key, CSV ignores paging, and conditional GET works', async () => {
  uncached();
  const a = await call('votes', 'pageSize=2&q=%20RECORD%20&f.party=Group+1&f.party=Group+0&f.party=Group+1');
  assert.equal(a.status, 200);
  await Promise.all(pending.splice(0));
  const previous = paths.length;
  const b = await call('votes', 'f.party=Group+0&f.party=Group+1&q=record&pageSize=2&page=1&sort=divisions_total:desc');
  assert.equal(b.headers.get('etag'), a.headers.get('etag'));
  assert.equal(paths.length, previous, 'cache hit does not re-read data');
  const conditional = await call('votes', 'f.party=Group+1&f.party=Group+0&q=record&pageSize=2', {headers: {'if-none-match': a.headers.get('etag')}});
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), '');
  const prefixed = await call('votes', 't.q=record&t.pageSize=2&t.f.party=Group+0&t.f.party=Group+1');
  assert.equal(prefixed.headers.get('etag'), a.headers.get('etag'));
  const csvA = await call('votes', 'format=csv&page=1&pageSize=1');
  const csvB = await call('votes', 'page=99&pageSize=200&format=csv');
  assert.equal(csvA.headers.get('etag'), csvB.headers.get('etag'));
  assert.match(a.headers.get('cache-control'), /max-age=60/);
});

test('requests use index postings and fetch only page shards', async () => {
  uncached();
  assert.equal((await call('votes', 'q=needle&pageSize=1')).status, 200);
  assert.equal(paths.filter(p => /\/rows-/.test(p)).length, 1);
  assert.ok(paths.some(p => /\/terms-/.test(p)));
  assert.ok(paths.every(p => p.startsWith('/table-index/')));
  uncached();
  assert.equal((await call('grants', 'pageSize=1')).status, 200);
  assert.ok(paths.some(p => p.endsWith('/summary.json')));
  assert.ok(paths.every(p => !p.endsWith('/index.json') && !p.includes('/terms-')), 'unfiltered pages use the small facet summary');
});

test('CSV parts share the normalized cache key and a missing part regenerates the export', async () => {
  uncached();
  const first = await call('votes', 'format=csv&pageSize=1');
  const expected = await first.text();
  await Promise.all(pending.splice(0));
  const previous = paths.length;
  const hit = await call('votes', 'page=99&format=csv&pageSize=200');
  assert.equal(await hit.text(), expected);
  assert.equal(paths.length, previous, 'cached CSV does not re-read row shards');
  const part = [...cacheEntries.keys()].find(key => key.includes('__csvPart='));
  assert.ok(part);
  cacheEntries.delete(part);
  const repaired = await call('votes', 'format=csv');
  assert.equal(repaired.status, 200);
  assert.equal(await repaired.text(), expected);
  assert.ok(paths.length > previous, 'an evicted part uses a fresh complete export');
});

test('category values round-trip exactly through facets, URL state and CSV', async () => {
  const facetRoot = await mkdtemp(join(tmpdir(), 'opax-table-facet-'));
  const value = 'Group\u00a01 🌱 ';
  try {
    const rows = entries(TABLE_DATASETS.grants, 3);
    for (const entry of rows) entry.row.agency = value;
    await buildTableIndexes(facetRoot, {grants: rows});
    const facetEnv = {ASSETS: {async fetch(req) {
      const path = new URL(req.url).pathname;
      return MONEY_GRAPHS.includes(path) ? Response.json({nodes: []}) : new Response(await readFile(join(facetRoot, path.slice(1))));
    }}};
    const query = new URLSearchParams({'f.agency': value});
    const response = await tableApi(new Request('https://opax.com.au/api/table/grants?' + query), facetEnv, ctx);
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.total, 3);
    assert.deepEqual(page.facets.agency, [{value, count: 3}]);
    assert.equal(new URL(response.headers.get('content-location'), 'https://opax.com.au').searchParams.get('f.agency'), value);
    const download = await tableApi(new Request('https://opax.com.au/api/table/grants?' + query + '&format=csv'), facetEnv, ctx);
    assert.ok((await download.text()).includes('"' + value + '"'));
  } finally {await rm(facetRoot, {recursive: true, force: true});}
});

test('repeated pages, filtered queries and exports leave shared asset snapshots unchanged', async () => {
  uncached();
  const snapshots = new Map();
  const sharedEnv = {ASSETS: {async fetch(req) {
    const path = new URL(req.url).pathname;
    if (!snapshots.has(path)) snapshots.set(path, MONEY_GRAPHS.includes(path) ? {nodes: []} : JSON.parse(await readFile(join(root, path.slice(1)), 'utf8')));
    const response = Response.json(snapshots.get(path));
    response.json = async () => snapshots.get(path);
    return response;
  }}};
  const request = query => tableApi(new Request('https://opax.com.au/api/table/grants?' + query), sharedEnv, ctx);
  const expected = JSON.stringify((await (await request('pageSize=2')).json()).rows);
  const csv = await request('format=csv');
  assert.equal(csv.status, 200);
  assert.ok((await csv.text()).split('\r\n')[1].startsWith('"item-259",'));
  uncached();
  assert.equal(JSON.stringify((await (await request('pageSize=2')).json()).rows), expected);
  for (let i = 0; i < 2; i++) {
    uncached();
    const page = await (await request('f.agency=Group+1')).json();
    assert.equal(page.total, 130);
    assert.equal(page.rows[0].id, 'item-259');
  }
});

test('unknown datasets, unsupported methods, invalid queries and asset failures return detail-free JSON', async () => {
  assert.equal((await call('missing')).status, 404);
  const method = await call('votes', '', {method: 'POST'});
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET');
  for (const query of ['page=0', 'page=-1', 'page=1.2', 'pageSize=0', 'sort=absent:asc', 'sort=name:sideways', 'f.absent=x', 'f.ayes.min=NaN', 'f.ayes.min=3&f.ayes.max=1', 'format=json', 'q=a&q=b', 't.q=a&page=1', 'f.party.min=1']) {
    const response = await call('votes', query);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), {error: 'invalid_query'});
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await tableApi(new Request('https://opax.com.au/api/table/votes'), {ASSETS: {fetch() {throw new Error('private implementation detail');}}}, ctx);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {error: 'unavailable'});
});

test('CSV quotes commas, embedded quotes and newlines, preserving exact numeric values', async () => {
  const {tableCSV} = await import('../src/table-api.ts');
  const value = 'Quoted "record", with\na newline, café and a 🌱';
  const csv = tableCSV([{title: value, amount: 123456789.125}], [{key: 'title', label: 'Title', type: 'text'}, {key: 'amount', label: 'Value', type: 'money'}]);
  assert.equal(csv, '"Title","Value"\r\n"Quoted ""record"", with\na newline, café and a 🌱","123456789.125"\r\n');
});

test('CSV exports stop at 50,000 rows and report the full filtered total', async () => {
  const largeRoot = await mkdtemp(join(tmpdir(), 'opax-table-cap-'));
  try {
    await buildTableIndexes(largeRoot, {votes: entries(TABLE_DATASETS.votes, 50_001)});
    const largeEnv = {ASSETS: {async fetch(req) {return new Response(await readFile(join(largeRoot, new URL(req.url).pathname.slice(1))));}}};
    const response = await tableApi(new Request('https://opax.com.au/api/table/votes?format=csv'), largeEnv, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-table-total'), '50001');
    assert.equal(response.headers.get('x-table-exported'), '50000');
    assert.equal((await response.text()).split('\r\n').filter(Boolean).length, 50_001);
  } finally {await rm(largeRoot, {recursive: true, force: true});}
});

test('server refuses a row with withheld donor evidence even in a corrupted generated shard', async () => {
  uncached();
  const graph = JSON.parse(await readFile(join(pub, 'graph/money.json'), 'utf8'));
  const withheld = graph.nodes.find(n => n.kind === 'donor' && !isOrganisationDonor(n));
  const path = join(root, built.datasets['party-money'].path.slice(1), 'rows-0.json');
  const original = await readFile(path, 'utf8');
  const shard = JSON.parse(original);
  shard.rows[259].donors = [{label: withheld.label, aliases: withheld.aliases}];
  await writeFile(path, JSON.stringify(shard));
  try {
    const response = await call('party-money', 'pageSize=1');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error: 'unavailable'});
  } finally {await writeFile(path, original);}
});

test('indexed privacy checks preserve the shared policy for derived donor labels, aliases and organization spans', async () => {
  const graphs = await Promise.all(MONEY_GRAPHS.map(async path => JSON.parse(await readFile(join(pub, path.slice(1)), 'utf8'))));
  const phrases = withheldPhrases(graphs, []), check = tablePrivacyCheck(phrases);
  const labels = graphs.flatMap(graph => graph.nodes.filter(n => n.kind === 'donor').flatMap(n => [n.label, ...(n.aliases || [])]));
  for (const [i, label] of labels.entries()) for (const value of [label, 'donor ' + label, 'Records for ' + label]) assert.equal(check(value), namesWithheldPhrase(phrases, value), `derived phrase ${i}`);
});

test('interest entries preserve public register roles when the same members appear in the money graphs', async () => {
  const graphs = await Promise.all(MONEY_GRAPHS.map(async path => JSON.parse(await readFile(join(pub, path.slice(1)), 'utf8'))));
  const donorContext = tablePrivacyCheck(withheldPhrases(graphs, []));
  const entries = await interestTableRows(pub, graphs);
  let registers = 0;
  for (const file of (await readdir(join(pub, 'interests'))).filter(f => f.endsWith('.json') && !['index.json', 'recent.json', 'ties-by-donor.json'].includes(f))) {
    const register = JSON.parse(await readFile(join(pub, 'interests', file), 'utf8'));
    if (!donorContext('donor ' + register.name)) continue;
    assert.ok(entries.some(entry => entry.row.id.startsWith(file.slice(0, -5) + ':')), `public register role ${registers}`);
    registers++;
  }
  assert.ok(registers > 0);
});

test('the real Worker routes tables locally before general and staging API dispatch', async () => {
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, pub);
    worker.env.STAGING_API = {fetch() {throw new Error('staging proxy must not run');}};
    const response = await worker.fetch('/api/table/missing');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {error: 'not_found'});
    assert.ok(response.headers.has('content-security-policy'));
  } finally {restore();}
});

test('the build reports asset totals within its additive budget', async () => {
  assert.ok(built.files <= TABLE_BUDGET.files);
  assert.ok(built.bytes <= TABLE_BUDGET.bytes);
  assert.ok(built.indexFiles > 10);
  assert.ok(built.indexBytes < built.bytes);
  const saved = JSON.parse(await readFile(join(root, 'table-index/manifest.json'), 'utf8'));
  assert.equal(saved.files, built.files);
  assert.equal(saved.bytes, built.bytes);
});
