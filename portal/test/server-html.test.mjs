import test from 'node:test';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {offline, loadWorker, outbound} from './worker-harness.mjs';
import {files, paths} from './fixtures/server-html.mjs';
import {grantCoreBody, topicCoreBody} from '../src/seo-record-content.ts';

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
  // A recipient's meta line sits under its title, as the client's own header draws it.
  if (path.includes('/recipient/')) assert.equal(core.querySelector('h1 + p.grant-recipient-meta')?.textContent,`${path.includes('/qld/') ? 'Queensland' : 'Commonwealth'} · Company`);
  const summary = core.querySelector('h1 ~ p:not(.grant-recipient-meta)').textContent;
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

test('topic rows link recorded sources and accurately label absent or unsafe sources',()=>{
  const doc = new JSDOM(topicCoreBody('housing',{count:4,labelled:4},[
    {slug:'example-one',title:'Example one',source_url:'https://example.org/official-one'},
    {slug:'example-two',title:'Example two',url:'https://example.org/official-two'},
    {slug:'example-three',title:'Example three'},
    {slug:'example-four',title:'Example four',source_url:'javascript:alert(1)'},
  ])).window.document;
  const sources = [...doc.querySelectorAll('tbody tr')].map(row=>row.cells[3]);
  assert.equal(sources[0].querySelector('a').href,'https://example.org/official-one');
  assert.equal(sources[1].querySelector('a').href,'https://example.org/official-two');
  for(const source of sources.slice(2)) {
    assert.equal(source.textContent,'Source link not recorded');
    assert.equal(source.querySelector('a'),null);
  }
});

// Run the actual app entry and its browser modules over the Worker's HTML.
// The fixture transport rejects external requests and never uses the network.
for(const path of paths) test(`hydration keeps exactly one visible record tree: ${path}`,{timeout:20000},async()=>{
  const document = await (await worker(path)).text();
  const {counts,speeches} = await import('./fixtures/server-html.mjs');
  const result = await new Promise((resolve,reject)=>{
    const child = new Worker(new URL('./helpers/directory-shell.mjs',import.meta.url),{
      execArgv:['--experimental-vm-modules','--disable-warning=ExperimentalWarning'],
      workerData:{path,document,files,recordCore:true,html:true,settleMs:150,
        selector:'#prerender[data-record-hydrated]',panel:path.startsWith('/money/') ? 'panel-money-records' : 'panel-subject',
        apiFixtures:{'/api/search':speeches,'/api/topic/housing':counts,'/api/topic/climate-environment':counts}},
    });
    const timeout = setTimeout(()=>{child.terminate();reject(Error('Hydration timed out'));},15000);
    let message;
    child.on('message',value=>{message=value;});
    child.on('error',reject);
    child.on('exit',code=>{clearTimeout(timeout);code || message?.error ? reject(Error(message?.error || `Exit ${code}`)) : resolve(message);});
  });
  assert.deepEqual(result.errors,[],path);
  assert.equal(result.rows,1,'The real renderer adopted the server table');
  assert.equal(result.emptiedCore,false,'Painted server rows never become empty');
  const before = new JSDOM(document).window.document;
  const after = new JSDOM(result.html).window.document;
  const core = after.querySelector('#prerender');
  assert.ok(core.dataset.recordHydrated);
  for(const original of before.querySelectorAll('[data-record-title]')) {
    const title = original.textContent;
    const matches = [...after.querySelectorAll('*')].filter(el=>!el.children.length && el.textContent === title);
    assert.equal(matches.length,1,`Exactly one title across the whole page: ${title}`);
    assert.ok(matches[0].closest('[data-record-list]'));
  }
  assert.equal([...after.querySelectorAll('h1')].filter(el=>el.textContent === core.querySelector('h1').textContent).length,1,'One record page title in the DOM');
  assert.equal(core.querySelector('h1').textContent,before.querySelector('#prerender h1').textContent);
  assert.deepEqual([...core.querySelectorAll('tbody')].map(el=>el.innerHTML),[...before.querySelectorAll('#prerender tbody')].map(el=>el.innerHTML),'Hydration retains the original rows');
  assert.equal(after.querySelectorAll('.grant-recipient-records,.agency-suppliers,.supplier-contract-list,.gr-pgrants,.topic-arc-list').length,0,'No second record list');
});
