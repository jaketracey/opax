import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {offline, loadWorker, outbound} from './worker-harness.mjs';
import {files, paths} from './fixtures/server-html.mjs';
import {grantCoreBody} from '../src/seo-record-content.ts';

offline();
const cache = new Map();
globalThis.caches.default = {
  async match(request) { return cache.get(request.url)?.clone(); },
  async put(request,response) { cache.set(request.url,response.clone()); },
};
const {env,fetch:worker} = await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname);
const assets = env.ASSETS;
const reads = new Map();
env.ASSETS = {async fetch(request) {
  const path = new URL(request.url).pathname;
  reads.set(path,(reads.get(path)||0)+1);
  return Object.hasOwn(files,path) ? Response.json(files[path]) : assets.fetch(request);
}};
const {seedTopicCache} = await import('./server-html-cache.mjs');
await seedTopicCache(env,globalThis.caches.default);
for(const path of paths) test(`server HTML contains the complete fixture core: ${path}`, async()=>{
  const response = await worker(path);
  assert.equal(response.status,200,path);
  const doc = new JSDOM(await response.text()).window.document;
  const core = doc.querySelector('#prerender');
  assert.ok(core.hasAttribute('data-record-core'));
  const canonical = new URL(path,'https://opax.com.au').href;
  assert.equal(doc.querySelector('link[rel="canonical"]').href,canonical);
  const name = path.includes('/recipient/') ? 'Example Community Ltd' : path.includes('/agency/') ? `Department of Example ${path.endsWith('1') ? '1' : '2'}` : path.includes('GO-FIXTURE') ? 'Example Community Programme' : path.includes('example-recovery') ? 'Example Queensland Recovery' : path.endsWith('housing') ? 'Housing' : 'Climate & environment';
  assert.equal(core.querySelector('h1').textContent,name);
  const kind = path.includes('/recipient/') ? 'Grant recipient' : path.includes('/agency/') ? 'Government agency' : path.includes('program=') ? 'Grant program' : 'Topics';
  assert.equal(doc.title,`${name} · ${kind} · OPAX`);
  const summary = core.querySelector('h1 + p').textContent;
  const expected = path.includes('/recipient/') ? `${name}: $25.0k in ${path.includes('/qld/') ? 'recorded Queensland expenditure across 25 expenditure rows. A multi-year funding agreement can appear in several financial years; rows are not distinct grants.' : 'published Commonwealth grant award values across 25 award records. Published award values do not establish payments received.'}`
    : path.includes('/agency/') ? `${name}: $50.0k in recorded contract commitments across 25 contracts and 25 suppliers.`
    : path.includes('program=') ? `${name}: $25.0k in 25 ${path.includes('jur=qld') ? 'recorded Queensland expenditure rows' : 'published Commonwealth grant awards'} to 1 recipient, financial years 2025-26.`
    : `${name}: 43 speeches carry this label so far, of 500 speeches labelled to date. Not every speech has a topic label yet, so this count is a floor.`;
  assert.equal(summary,expected);
  assert.equal(doc.querySelector('meta[name="description"]').content,path.includes('/recipient/') ? expected.slice(0,expected.indexOf(path.includes('/qld/') ? ' A multi-year' : ' Published award values')) : expected);
  assert.match(core.querySelector('dl').textContent,/25,000|50,000|43/);
  for(const table of core.querySelectorAll('table')) assert.equal(table.querySelectorAll('tbody tr').length,20);
  assert.match(core.querySelector('tbody tr').textContent,/Example|GA100/);
  if(path.includes('/agency/')) assert.equal(core.querySelector('tbody tr td').textContent,'Example Supplier 1 Pty Ltd','Agency previews use the client value/name order, even for reversed exports');
  assert.ok(core.querySelector('a[href*="example.org"], a[href*="grants.gov.au"], a[href*="data.qld.gov.au"], a[href*="tenders.gov.au"]'));
  assert.match(core.textContent,/Source:/);
  const graph = JSON.parse(doc.querySelector('#ld-page').textContent)['@graph'];
  assert.ok(graph.some(node=>node.url === canonical));
  assert.equal(outbound.length,0,'No upstream request, even for topic data');
});
test('repeat renders reuse exported detail files and topic cache entries', async()=>{
  for(const path of paths) await worker(path);
  for(const path of ['/agencies/a-00000000000000000001.json','/agencies/a-00000000000000000002.json','/graph/grants.federal.json','/graph/grants.qld.json']) assert.equal(reads.get(path),1,path);
  assert.equal(outbound.length,0);
});
test('unsafe sources and individual program recipients cannot leak into a preview',()=>{
  const html = grantCoreBody({id:'test',n:'Example',t:0,c:1,grants:[{id:'GA1',rn:'Casey Fixture',rid:'person:casey-fixture',k:'individual',v:0,guid:'<script>'}]},'federal','/money/grants',true);
  assert.doesNotMatch(html,/Casey Fixture|\/recipient\/person/);
  assert.match(html,/Recipient not publicly named/);
  assert.match(html,/\$0/);
});

test('unavailable topic records return a retryable page without invented zero counts',async()=>{
  const key = 'https://opax.com.au/api/topic/housing';
  const previous = cache.get(key);
  cache.set(key,Response.json({error:'fixture unavailable'},{status:503,headers:{'x-opax-cached-at':new Date().toISOString()}}));
  try {
    const response = await worker('/subject/topic/housing');
    assert.equal(response.status,503);
    const doc = new JSDOM(await response.text()).window.document;
    assert.match(doc.querySelector('#prerender').textContent,/could not be loaded/);
    assert.equal(doc.querySelectorAll('#prerender tbody tr').length,0);
    assert.doesNotMatch(doc.querySelector('#prerender').textContent,/0 speeches/);
    assert.equal(outbound.length,0);
  } finally {cache.set(key,previous)}
});
test('a missing grant value remains missing, while a published zero remains zero',()=>{
  const html = grantCoreBody({id:'fixture',n:'Example',t:0,c:2,grants:[{id:'GA1'},{id:'GA2',v:0}]},'federal','/money/grants');
  const doc = new JSDOM(html).window.document;
  const values = [...doc.querySelectorAll('tbody tr')].map(row=>row.cells[2].textContent);
  assert.deepEqual(values,['Value not recorded','$0.00']);
});
