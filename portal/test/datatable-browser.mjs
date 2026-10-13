// Run inside unshare -rn, with loopback enabled. This runner owns Wrangler and Chrome.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SERVER_CSV_NOTE,assertServerCSVCap} from './datatable-endpoint-contract.mjs';
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const outputDir=fileURLToPath(new URL('../private/dt-core/',import.meta.url));
await mkdir(outputDir,{recursive:true});
const base='http://127.0.0.1:9754';
const dev=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port','9754','--inspector-port','9755','--log-level','error','--show-interactive-dev-session=false','--var','INDEXNOW_ENABLED:false','--var','INDEXNOW_DRY_RUN:true'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
let devLog='',browser;
dev.stdout.on('data',value=>{devLog+=value;});dev.stderr.on('data',value=>{devLog+=value;});
const errors=[],blocked=[];
try {
  let ready=false;
  for(let i=0;i<240;i++) {
    if(dev.exitCode != null) throw new Error('Wrangler stopped before readiness');
    try {if((await fetch(base+'/fonts.css')).ok) {ready=true;break;}} catch {}
    await new Promise(done=>setTimeout(done,250));
  }
  assert.ok(ready,'Wrangler readiness timed out');
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin !== base) {blocked.push('external');return route.abort();}
    if(new URL(route.request().url()).pathname === '/__fixtures/document') return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="robots" content="index, follow"><main></main>'});
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const settled=()=>page.waitForFunction(()=>document.querySelector('#table-example .dt-count') && !document.querySelector('#table-example').hasAttribute('aria-busy'));
  const load=async example=>{
    await page.goto(base+'/datatable-workbench.html');await settled();
    if(example !== 'default') {await page.locator(`[data-example="${example}"]`).click();await settled();}
    await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>['Public Sans','Merriweather'].every(name=>[...document.fonts].some(font=>font.family.replaceAll('"','') === name && font.status === 'loaded'))),'served fonts must load under Wrangler');
  };
  const filters=async()=>{const panel=page.locator('[data-panel="filters"]');if(!await panel.evaluate(el=>el.open)) await panel.locator(':scope > summary').click();};
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:1000});
    for(const example of ['default','filtered','empty','server']) {
      await load(example);
      assert.equal(await page.locator('.dt-count').textContent(),example === 'filtered' ? 'Showing 1–4 of 4' : example === 'empty' ? 'Showing 0–0 of 0' : 'Showing 1–5 of 9');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${width}: page overflow`);
      await page.screenshot({path:resolve(outputDir,`${example}-${width}.png`),fullPage:true});
    }
  }
  await page.setViewportSize({width:1280,height:1000});await load('default');
  await page.evaluate(()=>{window.tableEvents=[];addEventListener('opax:analytics',e=>window.tableEvents.push(e.detail));window.liveRegion=document.querySelector('.dt-count');});
  await page.locator('[data-sort="amount"]').click();await settled();
  assert.equal(await page.locator('th:has([data-sort="amount"])').getAttribute('aria-sort'),'ascending');
  assert.equal(await page.locator('tbody tr').first().locator('[data-label="Amount"]').getAttribute('title'),'$12,450.75');
  assert.ok(await page.evaluate(()=>document.querySelector('.dt-count') === window.liveRegion));
  assert.ok(await page.locator('[data-sort="amount"]').evaluate(el=>el === document.activeElement));
  const menu=page.locator('tbody .dt-actions details').first();await menu.locator('summary').click();await menu.locator('a').focus();await page.keyboard.press('Escape');
  assert.equal(await menu.evaluate(el=>el.open),false);assert.ok(await menu.locator('summary').evaluate(el=>el === document.activeElement));
  await menu.locator('summary').click();await page.locator('[data-sort="amount"]').click();await settled();assert.equal(await page.locator('tbody .dt-actions details[open]').count(),0);
  const identities=await page.locator('tbody .dt-actions details').evaluateAll(els=>els.map(el=>el.dataset.panel));assert.equal(new Set(identities).size,identities.length);
  await filters();await page.locator('[data-panel="facet-region"] > summary').click();
  const selected=page.locator('[data-facet="region"][value="Victoria"]');await selected.click();await settled();
  assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–4 of 4');assert.equal(await page.locator('td[data-label="State"]').count(),0);assert.ok(await selected.evaluate(el=>el === document.activeElement));
  await page.locator('[data-facet="region"][value="Queensland"]').click();await settled();assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–5 of 6');
  await page.locator('[data-clear]').click();await settled();await page.locator('[data-density-toggle]').click();assert.equal(await page.locator('#table-example').getAttribute('data-density'),'compact');
  await page.locator('[data-panel="columns"] > summary').click();await page.locator('[data-column="date"]').uncheck();assert.equal(await page.locator('td[data-label="Updated"]').count(),0);await page.locator('[data-panel="columns"] > summary').click();
  await page.locator('[data-panel="facet-amount"] > summary').click();await page.locator('[data-range="amount"][data-bound="min"]').fill('50000000');await page.locator('[data-range="amount"][data-bound="min"]').press('Tab');await settled();assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–3 of 3');
  await page.locator('[data-clear]').click();await settled();await page.locator('[data-panel="filters"] > summary').click();
  await page.locator('[data-page="2"]').click();await settled();assert.equal(await page.locator('.dt-count').textContent(),'Showing 6–9 of 9');
  await page.locator('[data-search]').fill('works');await page.locator('form').evaluate(el=>el.requestSubmit());await settled();assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–2 of 2');assert.equal(new URL(page.url()).searchParams.get('t.q'),'works');
  const download=page.waitForEvent('download');await page.locator('[data-export]').click();const csv=await readFile(await (await download).path(),'utf8');assert.equal(csv.split('\r\n').length,3);assert.ok(csv.includes('35400000000'));assert.ok(!csv.includes('$35.4bn'));
  const events=await page.evaluate(()=>window.tableEvents);for(const e of events) assert.deepEqual(e.properties,{table_id:'workbench-money',page_type:'workbench'});for(const event of ['table_sort','table_filter','table_export']) assert.ok(events.some(e=>e.event === event));
  await load('server');await filters();await page.locator('[data-panel="facet-region"] > summary').click();await page.locator('[data-facet="region"][value="Victoria"]').click();await settled();assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–4 of 4');
  const serverDownload=page.waitForEvent('download');await page.locator('[data-export]').click();assert.equal((await readFile(await (await serverDownload).path(),'utf8')).split('\r\n').length,5);
  await page.evaluate(()=>{window.fixtureFetch=window.fetch;window.fetch=async(input,options)=>new URL(input,location.href).pathname === '/__fixtures/table/receipts' ? new Response('',{status:503}) : window.fixtureFetch(input,options);});
  await page.locator('[data-clear]').click();await page.locator('[role="alert"]').waitFor();assert.equal(await page.locator('.dt-count').textContent(),'Table unavailable');await page.screenshot({path:resolve(outputDir,'error-1280.png'),fullPage:true});
  await page.evaluate(()=>{window.fetch=window.fixtureFetch;});await page.locator('[data-retry]').click();await settled();assert.equal(await page.locator('.dt-count').textContent(),'Showing 1–5 of 9');
  await page.evaluate(note=>{const original=window.fetch;window.fetch=async(input,options)=>new URL(input,location.href).searchParams.get('format') === 'csv' ? new Response('Organisation,Amount\r\n'+Array.from({length:50000},()=> 'Fixture organisation Pty Ltd,1.25').join('\r\n')+'\r\n'+note,{headers:{'x-table-export-truncated':'true'}}) : original(input,options);},SERVER_CSV_NOTE);
  const capped=page.waitForEvent('download');await page.locator('[data-export]').click();assertServerCSVCap(await readFile(await (await capped).path(),'utf8'));await page.waitForFunction(()=>document.querySelector('.dt-count').textContent.includes('Export limited to 50,000 rows.'));
  await page.goto(base+'/__fixtures/document');await page.evaluate(async()=>{
    document.querySelector('meta[name="robots"]').setAttribute('content','index, follow');const link=document.createElement('link');link.rel='canonical';link.href=location.origin+'/money?campaign=fixture&q=old&f.region=old&f.unrelated=keep';document.head.append(link);
    history.replaceState(null,'',location.pathname+'?q=works&f.unrelated=keep&campaign=fixture');
    const {mountDataTable}=await import('/datatable.js'),{workbenchConfig}=await import('/datatable-workbench-data.js');const host=document.createElement('div');host.id='unprefixed';document.body.append(host);window.unprefixed=mountDataTable(host,{...workbenchConfig,id:'optional-prefix',urlKey:undefined});
  });
  assert.equal(await page.locator('#unprefixed .dt-count').textContent(),'Showing 1–2 of 2');assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');assert.equal(new URL(page.url()).searchParams.get('f.unrelated'),'keep');assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),base+'/money?campaign=fixture&f.unrelated=keep');assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, follow');
  await page.evaluate(()=>{const u=new URL(location.href);u.searchParams.set('q','zero matches');history.replaceState(null,'',u);dispatchEvent(new PopStateEvent('popstate'));});assert.equal(await page.locator('#unprefixed .dt-count').textContent(),'Showing 0–0 of 0');await page.locator('#unprefixed [data-clear]').click();assert.equal(new URL(page.url()).searchParams.has('q'),false);
  await load('default');const timings=await page.evaluate(async()=>{
    const {mountDataTable,applyQuery}=await import('/datatable.js'),{workbenchConfig,workbenchRows}=await import('/datatable-workbench-data.js');const rows=Array.from({length:2000},(_,i)=>({...workbenchRows[i%workbenchRows.length],id:'bench-'+i}));const config={...workbenchConfig,id:'bench',rows,urlKey:'bench',pageSize:50};const host=document.createElement('div');document.body.append(host);
    const wait=async()=>{while(host.hasAttribute('aria-busy')) await new Promise(done=>setTimeout(done,0));};let start=performance.now();const mounted=mountDataTable(host,config);await wait();const hydration=performance.now()-start,pure=[],filter=[];
    for(let i=0;i<10;i++) {const q={q:i%2 ? 'works' : 'services',filters:{region:[i%2 ? 'Victoria' : 'Queensland']}};start=performance.now();applyQuery(rows,config,q);pure.push(performance.now()-start);const url=new URL(location.href);url.searchParams.set('bench.q',q.q);url.searchParams.set('bench.f.region',JSON.stringify(q.filters.region));history.replaceState(null,'',url);start=performance.now();dispatchEvent(new PopStateEvent('popstate'));await wait();await new Promise(done=>requestAnimationFrame(done));filter.push(performance.now()-start);}
    mounted.destroy();host.remove();return {rows:2000,hydration,pure,filter};
  });
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {min:sorted[0],median:(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2,max:sorted.at(-1)};};timings.pureStats=stats(timings.pure);timings.filterStats=stats(timings.filter);await writeFile(resolve(outputDir,'timings.json'),JSON.stringify(timings,null,2)+'\n');assert.ok(timings.filterStats.median < 150,'2,000-row filtering median must stay below 150ms');
  await page.setViewportSize({width:390,height:1000});await load('default');await page.locator('[data-sort-select]').selectOption('amount:asc');await settled();
  for(const label of ['Amount','Returns','Year']) assert.equal(await page.locator(`td[data-label="${label}"]`).first().evaluate(el=>getComputedStyle(el).textAlign),'start');assert.equal(await page.locator('.dt-bar-track').first().evaluate(el=>getComputedStyle(el).display),'none');assert.equal(await page.locator('.dt-number').first().evaluate(el=>getComputedStyle(el).fontVariantNumeric),'tabular-nums');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const result={server:'wrangler dev --local',screenshots:8,viewports:[390,1280],timings,checks:['served fonts','sort/icons','facet retention/focus','row menu Escape/identity','search','ranges/chips','paging/live region','density/visibility','unprefixed URL/popstate/canonical/noindex','actual client/server CSV','server cap/note','analytics','failure/retry','phone alignment/bars','2000-row performance'],pageErrors:errors,blockedExternalRequests:blocked.length};await writeFile(resolve(outputDir,'browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {
  await browser?.close();dev.kill('SIGTERM');await Promise.race([new Promise(done=>dev.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);if(dev.exitCode == null && dev.signalCode == null) dev.kill('SIGKILL');await writeFile(resolve(outputDir,'wrangler-dev.log'),devLog);
}
