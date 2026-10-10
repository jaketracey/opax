// Real Chrome gate; install playwright-core outside the worktree. Run with:
// unshare -rn sh -c 'ip link set lo up; DT_BROWSER_TOOLS=/tmp/opax-dt-tools node test/datatable-browser.mjs'
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const {chromium} = createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const publicDir = fileURLToPath(new URL('../public/',import.meta.url));
const outputDir = fileURLToPath(new URL('../private/dt-core/',import.meta.url));
await mkdir(outputDir,{recursive:true});
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const server = createServer(async (req,res)=>{
  try {
    const path = new URL(req.url,'http://localhost').pathname;
    if (path === '/__fixtures/document') {
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><meta name="robots" content="index, follow"><link rel="canonical" href="/money?campaign=fixture&a.q=old&b.q=old"><main><div id="one"></div><div id="two"></div></main>'); return;
    }
    const file = resolve(publicDir,`.${path}`);
    if (!file.startsWith(publicDir)) throw new Error('Outside public');
    res.writeHead(200,{'content-type':types[extname(file)] || 'application/octet-stream'}); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Fixture not found'); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [], blocked = [];
try {
  browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context = await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  await context.route('**/*',route=>{
    if (new URL(route.request().url()).origin !== base) { blocked.push('external'); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const load = async example => {
    await page.goto(`${base}/datatable-workbench.html`);
    await page.locator('.dt-root > .dt-toolbar').waitFor();
    if (example !== 'default') await page.locator(`[data-example="${example}"]`).click();
    await page.waitForFunction(()=>!document.querySelector('#table-example').hasAttribute('aria-busy'));
    await page.evaluate(()=>document.fonts.ready);
  };
  for (const width of [390,1280]) {
    await page.setViewportSize({width,height:1000});
    for (const example of ['default','filtered','empty','server']) {
      await load(example);
      assert.equal(await page.locator('.dt-count').textContent(),example === 'filtered' ? 'Showing 1–4 of 4' : example === 'empty' ? 'Showing 0–0 of 0' : 'Showing 1–5 of 9');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${width}: page overflow`);
      await page.screenshot({path:resolve(outputDir,`${example}-${width}.png`),fullPage:true});
    }
  }
  await page.setViewportSize({width:1280,height:1000}); await load('default');
  await page.evaluate(()=>{
    window.tableEvents = []; addEventListener('opax:analytics',e=>window.tableEvents.push(e.detail));
    window.liveRegion = document.querySelector('.dt-count');
    const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = `${location.origin}/money?t.q=old`; document.head.append(canonical);
    // The workbench's baseline robots directive remains in place.
  });
  await page.locator('[data-sort="amount"]').click();
  assert.equal(await page.locator('th:has([data-sort="amount"])').getAttribute('aria-sort'),'ascending');
  assert.equal(await page.locator('tbody tr').first().locator('[data-label="Amount"]').getAttribute('title'),'$12,450.75');
  assert.ok(await page.evaluate(()=>document.querySelector('.dt-count') === window.liveRegion));
  assert.equal(await page.locator('[data-sort="amount"]').evaluate(el=>el === document.activeElement),true);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, nofollow');
  // The workbench has an explicit noindex baseline. General noindex/canonical
  // ownership is tested using a separate mounted document below.
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),`${base}/money`);
  await page.locator('[data-page="2"]').click();
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 6–9 of 9');
  await page.locator('[data-search]').fill('works');
  await page.waitForFunction(()=>document.querySelector('.dt-count').textContent === 'Showing 1–2 of 2');
  assert.equal(await page.locator('[data-search]').evaluate(el=>el === document.activeElement),true);
  assert.equal(new URL(page.url()).searchParams.get('t.q'),'works');
  const download = page.waitForEvent('download'); await page.locator('[data-export]').click();
  const csv = await readFile(await (await download).path(),'utf8');
  assert.equal(csv.split('\r\n').length,3); assert.ok(csv.includes('35400000000')); assert.ok(!csv.includes('$35.4bn'));
  await page.locator('[data-clear]').click(); await page.locator('[data-density-toggle]').click();
  assert.equal(await page.locator('#table-example').getAttribute('data-density'),'compact');
  await page.locator('[data-panel="columns"] > summary').click(); await page.locator('[data-column="date"]').uncheck();
  assert.equal(await page.locator('td[data-label="Updated"]').count(),0);
  await page.locator('[data-panel="columns"] > summary').click();
  await page.locator('[data-panel="facet-region"] > summary').click(); await page.locator('[data-facet="region"][value="Victoria"]').click();
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–4 of 4');
  await page.locator('[data-remove="region"]').click();
  await page.locator('[data-panel="facet-industry"] > summary').click(); await page.locator('[data-facet="industry"][data-value="Health"]').click();
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–2 of 2');
  await page.locator('[data-clear]').click();
  await page.locator('[data-panel="facet-amount"] > summary').click();
  await page.locator('[data-range="amount"][data-bound="min"]').fill('50000000'); await page.locator('[data-range="amount"][data-bound="min"]').press('Tab');
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–3 of 3');
  await page.locator('[data-clear]').click(); await page.locator('[data-page-size]').selectOption('10');
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–9 of 9');
  await page.evaluate(()=>{ history.replaceState(null,'',`${location.pathname}?t.q=works`); dispatchEvent(new PopStateEvent('popstate')); });
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–2 of 2');
  const events = await page.evaluate(()=>window.tableEvents);
  for (const e of events) assert.deepEqual(e.properties,{table_id:'workbench-money',page_type:'workbench'});
  for (const event of ['table_sort','table_filter','table_export']) assert.ok(events.some(e=>e.event === event));
  await load('server');
  await page.evaluate(()=>{ const fetch = window.fetch; window.serverRequests = []; window.fetch = (url,options)=>{ window.serverRequests.push(String(url)); return fetch(url,options); }; });
  await page.locator('[data-panel="facet-region"] > summary').click(); await page.locator('[data-facet="region"][value="Victoria"]').click();
  await page.waitForFunction(()=>document.querySelector('.dt-count').textContent === 'Showing 1–4 of 4');
  assert.equal(await page.locator('td[data-label="State"]').count(),0);
  const serverDownload = page.waitForEvent('download'); await page.locator('[data-export]').click();
  assert.equal((await readFile(await (await serverDownload).path(),'utf8')).split('\r\n').length,5);
  const requests = await page.evaluate(()=>window.serverRequests);
  assert.ok(requests.some(u=>new URL(u).searchParams.get('format') === 'csv'));
  for (const request of requests) {
    const params = new URL(request).searchParams;
    assert.equal(params.get('dataset'),'fixture'); assert.equal(params.has('t.f.region'),false);
    assert.equal(params.get('sort'),'amount:desc');
    assert.equal(params.get('pageSize'),params.get('format') === 'csv' ? null : '5');
    assert.deepEqual(JSON.parse(params.get('f.region')),['Victoria']);
  }
  await page.evaluate(()=>{ window.stubFetch = window.fetch; window.fetch = async ()=>new Response('',{status:503}); });
  await page.locator('[data-clear]').click(); await page.locator('[role="alert"]').waitFor();
  assert.equal(await page.locator('.dt-count').textContent(),'Table unavailable');
  await page.screenshot({path:resolve(outputDir,'error-1280.png'),fullPage:true});
  await page.evaluate(()=>{ window.fetch = window.stubFetch; }); await page.locator('[data-retry]').click();
  await page.waitForFunction(()=>document.querySelector('.dt-count').textContent === 'Showing 1–5 of 9');
  await page.locator('[data-search]').fill('No matching records');
  await page.waitForFunction(()=>document.querySelector('.dt-count').textContent === 'Showing 0–0 of 0');
  assert.equal(new URL(page.url()).searchParams.has('t.q'),false);
  assert.equal(await page.locator('[data-remove="q"]').textContent(),'Search applied ×');
  await page.locator('[data-clear]').click();
  await page.waitForFunction(()=>document.querySelector('.dt-count').textContent === 'Showing 1–5 of 9');
  await page.evaluate(async()=>{
    const {mountDataTable} = await import('/datatable.js');
    const {workbenchConfig,workbenchRows} = await import('/datatable-workbench-data.js');
    const host = document.createElement('div'); document.body.append(host); const pending = [];
    window.fetch = (url,options)=>new Promise(resolve=>pending.push({url,options,resolve}));
    const mounted = mountDataTable(host,{...workbenchConfig,id:'race-table',rows:undefined,urlKey:'race',source:{endpoint:'/__fixtures/table/race'}});
    const search = host.querySelector('[data-search]'); search.value = 'Harbour Works Pty Ltd'; search.dispatchEvent(new Event('input',{bubbles:true}));
    host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    if (!pending[0].options.signal.aborted) throw new Error('Previous request was not aborted');
    pending[1].resolve(Response.json({rows:[workbenchRows[0]],total:1,page:1,pageSize:5})); await new Promise(resolve=>setTimeout(resolve,0));
    pending[0].resolve(Response.json({rows:workbenchRows.slice(0,5),total:9,page:1,pageSize:5})); await new Promise(resolve=>setTimeout(resolve,0));
    if (host.querySelector('.dt-count').textContent !== 'Showing 1–1 of 1') throw new Error('Stale response overwrote query');
    mounted.destroy(); host.remove();
  });
  await page.goto(`${base}/__fixtures/document`);
  await page.evaluate(async()=>{
    const {mountDataTable} = await import('/datatable.js');
    const {workbenchConfig} = await import('/datatable-workbench-data.js');
    window.firstMount = mountDataTable(document.querySelector('#one'),{...workbenchConfig,id:'first',urlKey:'a'});
    window.secondMount = mountDataTable(document.querySelector('#two'),{...workbenchConfig,id:'second',urlKey:'b'});
  });
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'index, follow');
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),`${base}/money?campaign=fixture`);
  await page.locator('#one [data-search]').fill('works'); await page.locator('#one form').evaluate(el=>el.requestSubmit());
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, follow');
  await page.locator('#two [data-search]').fill('housing'); await page.locator('#two form').evaluate(el=>el.requestSubmit());
  await page.locator('#one [data-clear]').click();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, follow');
  await page.locator('#two [data-clear]').click();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'index, follow');
  await page.evaluate(()=>{ window.firstMount.destroy(); window.secondMount.destroy(); });
  await page.setViewportSize({width:390,height:1000}); await load('default');
  await page.locator('[data-sort-select]').selectOption('amount:asc');
  assert.equal(await page.locator('tbody tr').first().locator('[data-label="Amount"]').getAttribute('title'),'$12,450.75');
  assert.equal(await page.locator('td[data-primary]').first().evaluate(el=>getComputedStyle(el).gridRow),'1');
  assert.equal(await page.locator('.dt-number').first().evaluate(el=>getComputedStyle(el).fontVariantNumeric),'tabular-nums');
  assert.deepEqual(errors,[]); assert.deepEqual(blocked,[]);
  const result = {screenshots:8,viewports:[390,1280],checks:['hydration','sort','search','facets','ranges','removable chips','paging/live region','density','visibility','URL/noindex/canonical/multiple tables','client/server CSV','events','server failures/retry','aborted requests/races','phone cards'],pageErrors:errors,blockedExternalRequests:blocked.length};
  await writeFile(resolve(outputDir,'browser-results.json'),`${JSON.stringify(result,null,2)}\n`); console.log(JSON.stringify(result));
} finally { await browser?.close(); await new Promise(done=>server.close(done)); }
