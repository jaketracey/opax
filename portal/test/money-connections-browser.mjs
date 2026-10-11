// Run in an isolated network namespace. Every donor probe is derived at runtime.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,extname,join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {MONEY_GRAPHS,withholdIndividualDonors,isOrganisationDonor} from '../public/donor-entity.js';
import {moneyConnectionsConfig,filterMoneyConnectionView} from '../public/money-connections.js';
import {moneyTotals} from '../public/money-records.js';
import {applyQuery,dataTableHTML,toCSV,parseQuery} from '../public/datatable.js';
import {registerTablePrivacy,tablePrivacyIndex} from './datatable-privacy.mjs';
const pub=resolve('public'),output=resolve('private/dt-money');
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || join(output,'browser-tools'),'package.json'))('playwright-core');
await mkdir(output,{recursive:true});
const index=await tablePrivacyIndex(),graphs=new Map();
for(const path of MONEY_GRAPHS){const graph=withholdIndividualDonors(JSON.parse(await readFile(pub+path,'utf8')));assert.ok(index.safe(JSON.stringify(graph.nodes.map(({label,aliases})=>({label,aliases})))),'anonymous fixture labels and aliases are public');graphs.set(path,graph);}
const read=async path=>graphs.get(path),graph=graphs.get(MONEY_GRAPHS[0]);
const temporary=await mkdtemp(join(tmpdir(),'opax-money-table-'));
await build({entryPoints:['src/money-connections-table.ts'],outfile:join(temporary,'ssr.mjs'),bundle:true,platform:'node',format:'esm'});
const {renderMoneyConnectionsTable}=await import(join(temporary,'ssr.mjs'));
const fixtureModule=`import {moneyConnectionsConfig,filterMoneyConnectionView} from '/money-connections.js';
import {mountDataTable} from '/datatable.js';
const graph=await (await fetch('/graph/money.json')).json();
export const tableConfig=moneyConnectionsConfig(graph),tableRows=tableConfig.rows;
window.mounted=mountDataTable(document.querySelector('.money-connections-table'),tableConfig);
const serverButton=document.querySelector('[data-example="server"]');
serverButton.onclick=()=>{window.mounted.destroy();window.mounted=mountDataTable(document.querySelector('.money-connections-table'),{...tableConfig,rows:undefined,source:{endpoint:'/__fixtures/table/money'}});};serverButton.disabled=false;`;
const contentTypes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/table/privacy') {
      let text='';for await(const chunk of req)text+=chunk;
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({safe:index.safe(JSON.parse(text).text)}));return;
    }
    if(graphs.has(url.pathname)){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(graphs.get(url.pathname)));return;}
    if(url.pathname==='/__fixtures/money-input.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(fixtureModule);return;}
    if(url.pathname==='/__fixtures/table/money') {
      const config=moneyConnectionsConfig(graph,index.safe),query=parseQuery(url.searchParams);
      const page=applyQuery(config.rows,config,{...query,...(url.searchParams.get('format')==='csv'?{pageSize:2000,page:1}:{})});
      res.writeHead(200,{'content-type':url.searchParams.get('format')==='csv'?'text/csv':'application/json'});
      res.end(url.searchParams.get('format')==='csv'?toCSV(page.rows,config):JSON.stringify(page));return;
    }
    if(url.pathname==='/__fixtures/money-table') {
      const config=moneyConnectionsConfig(graph,index.safe),page=applyQuery(config.rows,config,parseQuery(url.searchParams,'c'));
      res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><meta name="robots" content="index, follow"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/datatable.css"><button data-example="server" disabled>Server fixture</button><main class="money-connections-table" aria-busy="true">${dataTableHTML(config,page)}</main><script type="module" src="/__fixtures/money-input.js"></script>`);return;
    }
    if(url.pathname==='/__fixtures/money-ssr') {
      res.writeHead(200,{'content-type':'text/html'});res.end(await renderMoneyConnectionsTable(url,read,index.safe));return;
    }
    if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
    const path=extname(url.pathname)?url.pathname:'/index.html',file=resolve(pub,'.'+path);
    if(!file.startsWith(pub+'/'))throw Error('path');
    res.writeHead(200,{'content-type':contentTypes[extname(file)] || 'application/octet-stream'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Local fixture unavailable');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port,errors=[],blocked=[],registrations=[];
registerTablePrivacy(registrations,{id:'money-connections',path:'/__fixtures/money-table',module:'/__fixtures/money-input.js',configExport:'tableConfig',rowsExport:'tableRows',host:'.money-connections-table',facet:'from',urlKey:'c',serverExample:'server',endpoint:'/__fixtures/table/money'});
let browser;
const parseCSV=text=>{
  const rows=[],row=[];let field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(ch==='"'){if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(ch===',' && !quoted){row.push(field);field='';}
    else if(ch==='\r' && text[i+1]==='\n' && !quoted){row.push(field);rows.push([...row]);row.length=0;field='';i++;}
    else field+=ch;
  }
  row.push(field);rows.push(row);return rows;
};
try {
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(blocked.push('external'),route.abort()));
  const page=await context.newPage();page.on('pageerror',()=>errors.push('page error'));
  const host=page.locator('.money-connections-table');
  const settled=()=>page.waitForFunction(()=>document.querySelector('.money-connections-table')?.dataset.datatable === 'money-connections' && document.querySelector('.money-connections-table .dt-count') && !document.querySelector('.money-connections-table').hasAttribute('aria-busy'));
  const load=async path=>{await page.goto(base+path);await settled();};
  const download=async()=>{const pending=page.waitForEvent('download');await host.locator('[data-export]').click();return readFile(await (await pending).path(),'utf8');};
  const csv=await (async()=>{await load('/__fixtures/money-table');return download();})();
  const config=moneyConnectionsConfig(graph,index.safe),all=applyQuery(config.rows,config,{pageSize:2000});
  assert.equal(csv,toCSV(all.rows,config),'download matches the full exact core export');
  const records=parseCSV(csv),totals=moneyTotals(graph);
  for(const key of ['receipts','contracts','grants']) {
    const position=config.columns.findIndex(c=>c.key===key);
    assert.ok(Math.abs(records.slice(1).reduce((sum,row)=>sum+Number(row[position]),0)-totals[key])<0.01,`${key}: downloaded totals reconcile`);
  }
  const neutral=host.locator('tbody tr').filter({hasText:/Donors not named/});
  if(await neutral.count())assert.equal(await neutral.locator('a,summary').count(),0);
  // Same column-wide maximum on both pages, supplied by the real core facets.
  const scale=await host.locator('th:has([data-sort="contracts"]) .dt-scale').textContent();
  await host.locator('[data-page="2"]').click();await settled();
  assert.equal(await host.locator('th:has([data-sort="contracts"]) .dt-scale').textContent(),scale);
  await load('/__fixtures/money-table');
  await host.locator('[data-panel="filters"] > summary').click();
  await host.locator('[data-panel="facet-to"] > summary').click();
  const values=await host.locator('[data-facet="to"]').evaluateAll(els=>els.slice(0,2).map(el=>el.value));assert.equal(values.length,2);
  for(const value of values){await host.locator('[data-facet="to"]').evaluateAll((els,v)=>els.find(el=>el.value===v).click(),value);await settled();}
  assert.equal(await host.locator('[data-remove="to"]').count(),2);
  await host.locator('[data-remove="to"]').first().click();await settled();
  assert.equal(await host.locator('[data-remove="to"]').count(),1);
  assert.equal(parseQuery(new URL(page.url()).searchParams,'c').filters.to.length,1);
  await host.locator('[data-clear]').last().click();await settled();
  // A live organisation query is accepted and restores through URL state.
  const publicRow=all.rows.find(row=>!row.aggregate && row.to),query={q:publicRow.to};
  await host.locator('[data-search]').fill(query.q);await host.locator('form').evaluate(el=>el.requestSubmit());await settled();
  assert.ok(await host.locator('tbody a').count()>0);
  assert.equal(new URL(page.url()).searchParams.get('c.q'),query.q);
  assert.equal(await download(),toCSV(applyQuery(config.rows,config,{...query,pageSize:2000}).rows,config));
  await page.reload();await settled();assert.equal(await host.locator('[data-search]').inputValue(),query.q);
  const privacy=[];for(const run of registrations)privacy.push(await run({page,base,index,outputDir:output}));
  // Actual /money map controller, anonymised served inputs, and real hydrated core.
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.goto(base+'/money?type=contracts&min=1000000');
    await page.locator('[data-records]').waitFor();await page.waitForFunction(()=>/List \([1-9]/.test(document.querySelector('[data-records]')?.textContent));
    await page.locator('[data-records]').click();await settled();
    assert.ok(await host.locator('tbody a').count()>0);
    assert.equal(await host.locator('[data-sort="type"],[data-sort="from"]').count(),0);
    await page.evaluate(async()=>{await document.fonts.ready;const el=document.querySelector('.research-records');scrollTo(0,el.getBoundingClientRect().top+scrollY-130);});
    await page.screenshot({path:join(output,`after-${width}.png`)});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
    assert.ok(index.safe(await host.innerHTML()));
    const csv=await download();assert.ok(index.safe(csv));assert.ok(csv.includes('Donors not named'));
    if(width===1280){const action=host.locator('.dt-actions details').first();await action.locator('summary').click();await action.locator('a').click();await page.waitForFunction(()=>document.querySelector('.mm-card')?.textContent.trim());assert.ok(index.safe(await page.locator('.mm-card').innerHTML()));}
    const probes=[];
    for(const path of MONEY_GRAPHS){const original=JSON.parse(await readFile(pub+path,'utf8'));probes.push(original.nodes.find(n=>n.kind==='donor' && !isOrganisationDonor(n)).label);}
    for(const value of probes) {
      await page.goto(base+'/money?type=contracts&min=1000000');await page.locator('[data-records]').waitFor();await page.locator('[data-records]').click();await settled();
      await host.locator('[data-search]').fill(value);await host.locator('form').evaluate(el=>el.requestSubmit());await settled();
      assert.equal(await host.locator('[data-search]').inputValue(),'');assert.equal(new URL(page.url()).searchParams.has('c.q'),false);
      assert.ok(index.safe(await host.innerHTML()));assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
      assert.equal(await download(),toCSV([],moneyConnectionsConfig(filterMoneyConnectionView(graph,new URLSearchParams({type:'contracts',min:'1000000'})),index.safe)));
      await host.locator('[data-clear]').last().click();await settled();assert.ok(await host.locator('tbody a').count()>0);
      const panel=page.locator('.research-filters');await panel.evaluate(el=>el.open=true);
      await page.locator('.research-controls [name="query"]').fill(value);
      await page.waitForTimeout(350);await settled();
      assert.equal(await page.locator('.research-controls [name="query"]').inputValue(),'');
      assert.equal(new URL(page.url()).searchParams.has('q'),false);assert.ok(index.safe(await page.locator('.research-controls').innerHTML()));
      await page.locator('.research-controls [type="reset"]').click();await page.waitForTimeout(100);await settled();
    }
  }
  // An older approved map response cannot overwrite a newer rejected input.
  await page.goto(base+'/money?type=contracts');await page.locator('[data-records]').waitFor();await page.locator('[data-records]').click();await settled();
  await page.locator('.research-filters').evaluate(el=>el.open=true);
  await page.route('**/api/table/privacy',async route=>{if(route.request().postDataJSON()?.text === publicRow.to)await new Promise(done=>setTimeout(done,80));await route.continue();});
  const pending=page.waitForRequest(request=>new URL(request.url()).pathname === '/api/table/privacy' && request.postDataJSON()?.text === publicRow.to);
  await page.locator('.research-controls [name="query"]').fill(publicRow.to);await pending;
  await page.locator('.research-controls [name="query"]').fill(index.values[0]);await page.waitForTimeout(500);await settled();
  assert.equal(await page.locator('.research-controls [name="query"]').inputValue(),'');
  assert.equal(new URL(page.url()).searchParams.has('q'),false);
  assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
  await page.unroute('**/api/table/privacy');
  const privateURL=new URL(base+'/money?type=contracts');privateURL.searchParams.set('c.q',index.values[0]);
  await page.goto(privateURL.href);await page.locator('[data-records]').waitFor();
  await page.waitForFunction(()=>!new URLSearchParams(location.search).has('c.q'));await settled();
  await page.locator('[data-records]').click();await settled();
  assert.equal(await host.locator('[data-search]').inputValue(),'');
  assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
  await host.locator('[data-clear]').last().click();await settled();assert.ok(await host.locator('tbody a').count()>0);
  // SSR executes the production renderer over the same anonymous graph fixture.
  const ssr=await fetch(base+'/__fixtures/money-ssr?type=contracts').then(r=>r.text());
  assert.ok(index.safe(ssr));assert.match(ssr,/Donors not named \(\d+\)/);assert.match(ssr,/<a href=/);
  for(const value of index.values.slice(0,4)) {
    const html=await fetch(base+'/__fixtures/money-ssr?c.q='+encodeURIComponent(value)).then(r=>r.text());
    assert.ok(index.safe(html));assert.match(html,/Showing 0–0 of 0/);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const result={core:'7a57261b4',viewports:[390,1280],privacy,exactCSV:true,reconciledRecordTypes:3,anonymousGraphs:4,liveProbes:8,ssr:true,chipRemoval:true,columnWideBars:true,pageErrors:errors,blockedExternalRequests:blocked.length};
  await writeFile(join(output,'browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(done=>server.close(done));await rm(temporary,{recursive:true,force:true});}
