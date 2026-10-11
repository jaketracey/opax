// Run inside unshare -rn, with loopback enabled. Own only these local processes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {appendFileSync} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {contractsFixture} from './contracts-table-fixture.mjs';
import {registerTablePrivacy,tablePrivacyIndex} from './datatable-privacy.mjs';
import {assertServerCSVCap} from './datatable-endpoint-contract.mjs';

const portal=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const outputDir=resolve(portal,'private/dt-contracts');
await mkdir(outputDir,{recursive:true});
await writeFile(resolve(outputDir,'round2-browser.pid'),String(process.pid)+'\n');
const base='http://127.0.0.1:9766',workerBase='http://127.0.0.1:9767';
const fixture=contractsFixture(resolve(portal,'public'));
const suppliers=JSON.parse(await readFile(resolve(portal,'public/suppliers.json'),'utf8')).suppliers;
const supplier=suppliers.find(entry=>entry.count>=50 && entry.count<=2000);
assert.ok(supplier,'the snapshot must exercise client paging');
const clientPath=`/subject/supplier/${supplier.id}`;
const modes={client:{path:clientPath,host:'#supplier-contracts [data-datatable]'},server:{path:'/discover',host:'#contracts-hub-table [data-datatable]'}};
const modulePath='/'+(await readFile(resolve(portal,'public/suppliers.js'),'utf8')).match(/contracts-table\.js\?v=[a-f0-9]+/)[0];
const privacyRollouts=[];
registerTablePrivacy(privacyRollouts,{id:'contracts',...modes.client,module:modulePath,configExport:'contractsTableConfig',rowsExport:'contractsClientRows',facet:'agency',urlKey:'t',endpoint:'/api/table/contracts',modes});

// Only the pending contracts endpoint is a fixture. HTML, modules, fonts and the
// shared privacy endpoint are served by the real Wrangler Worker and assets.
const proxy=createServer(async (request,response)=>{
  try {
    const url=new URL(request.url,base);
    if(url.pathname.startsWith('/api/') && !['/api/table/contracts','/api/table/privacy'].includes(url.pathname)) {
      response.writeHead(404);response.end();return;
    }
    let result;
    if(url.pathname==='/api/table/contracts' && request.method==='GET') result=await fixture(url);
    else {
      const chunks=[];for await(const chunk of request) chunks.push(chunk);
      result=await fetch(workerBase+url.pathname+url.search,{method:request.method,headers:Object.fromEntries(Object.entries(request.headers).filter(([key])=>!['host','connection','content-length'].includes(key))),body:!['GET','HEAD'].includes(request.method) ? Buffer.concat(chunks) : undefined,redirect:'manual',signal:AbortSignal.timeout(60000)});
    }
    response.writeHead(result.status,Object.fromEntries([...result.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {response.writeHead(503);response.end('Local preview unavailable');}
});
await new Promise(done=>proxy.listen(9766,'127.0.0.1',done));
const dev=spawn(process.execPath,['--no-warnings','node_modules/wrangler/wrangler-dist/cli.js','dev','--local','--ip','127.0.0.1','--port','9767','--inspector-port','9768','--log-level','error','--show-interactive-dev-session=false','--var','INDEXNOW_ENABLED:false','--var','INDEXNOW_DRY_RUN:true','--var','VOICE_ENABLED:false','--var','COMMUNITY_ENABLED:false','--var','DAILY_POST_ENABLED:false'],{cwd:portal,env:{...process.env,WRANGLER_SEND_METRICS:'false',GOMAXPROCS:'2'},stdio:['ignore','pipe','pipe']});
await writeFile(resolve(outputDir,'round2-wrangler.pid'),String(dev.pid)+'\n');
let devLog='',browser,page;
await writeFile(resolve(outputDir,'round2-wrangler-dev.log'),'');
const log=value=>{devLog+=value;appendFileSync(resolve(outputDir,'round2-wrangler-dev.log'),value);};
dev.stdout.on('data',log);dev.stderr.on('data',log);
const errors=[],blocked=[],requests=[];
try {
  let ready=false;
  for(let i=0;i<720;i++) {
    if(dev.exitCode != null) throw Error('Wrangler stopped before readiness');
    try {if((await fetch(workerBase+'/fonts.css',{signal:AbortSignal.timeout(2000)})).ok) {ready=true;break;}} catch {}
    await new Promise(done=>setTimeout(done,250));
  }
  assert.ok(ready,'Wrangler readiness timed out');console.log('Local Wrangler ready');
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin !== base) {blocked.push('external');return route.abort();}
    if(url.pathname.startsWith('/api/') && !['/api/table/contracts','/api/table/privacy'].includes(url.pathname)) return route.abort();
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('requestfailed',request=>requests.push({path:new URL(request.url()).pathname,status:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400) requests.push({path:new URL(response.url()).pathname,status:response.status()});});page.on('pageerror',error=>errors.push(error.message));
  const settled=host=>page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),host);
  const load=async mode=>{
    console.log(`Loading ${mode} table`);
    await page.goto(base+modes[mode].path);await settled(modes[mode].host);
    await page.evaluate(()=>document.fonts.ready);
    const host=page.locator(modes[mode].host);
    assert.ok((await host.locator('tbody tr').count())>1,'the real core must render rows');
    assert.equal(await host.locator('td[data-label="CN id"]').count(),0);
    assert.ok(await host.locator('.dt-bar-track').count()>0,'value bars must be enabled');
    assert.ok(await host.locator('.dt-scale').textContent());
    return host;
  };
  const shots=[];
  for(const width of process.env.DT_PRIVACY_ONLY ? [] : [390,1280]) {
    await page.setViewportSize({width,height:1000});
    for(const mode of ['server','client']) {
      const host=await load(mode);
      await host.evaluate(el=>scrollTo({top:Math.max(0,el.getBoundingClientRect().top+scrollY-100),behavior:'instant'}));
      await page.waitForTimeout(1000);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: page overflow`);
      if(width===390) assert.equal(await host.locator('.dt-bar-track').first().evaluate(el=>getComputedStyle(el).display),'none');
      const filename=`round2-${mode==='server' ? 'hub' : 'supplier'}-${width}.png`;
      await page.screenshot({path:resolve(outputDir,filename)});shots.push(filename);console.log(`Captured ${filename}`);
    }
  }
  await page.setViewportSize({width:1280,height:1000});
  for(const mode of ['client','server']) {
    const host=await load(mode),scale=await host.locator('.dt-scale').textContent();
    await host.locator('[data-page="2"]').click();await settled(modes[mode].host);
    assert.equal(await host.locator('.dt-scale').textContent(),scale,'paging must retain the column-wide scale');
  }
  const index=await tablePrivacyIndex(),privacy=[];
  console.log('Running shared contracts privacy hook');
  for(const run of privacyRollouts) privacy.push(await run({page,base,index,outputDir,onProgress:progress=>console.log(JSON.stringify(progress))}));
  assertServerCSVCap(await readFile(resolve(outputDir,'contracts-server.csv'),'utf8'));
  // Fresh arrivals also validate SSR seed consumption and legacy query migration.
  for(const mode of ['client','server']) for(const key of ['t.q','t.f.agency','t.f.id','contract']) {
    const value=index.values[0],params=new URLSearchParams({[key]:key.startsWith('t.f.') ? JSON.stringify([value]) : value,campaign:'fixture'});
    const response=await page.goto(base+modes[mode].path+'?'+params);
    const ssr=await response.text();
    const seed=ssr.match(/<script type="application\/json" data-contracts-seed>(.*?)<\/script>/s);
    assert.ok(seed,'the arrival must include a real SSR table seed');
    assert.ok(index.safe(seed[1]),'unsafe fresh-arrival SSR input');
    await settled(modes[mode].host);
    const host=page.locator(modes[mode].host);
    assert.ok(index.safe(await host.innerHTML()),'unsafe fresh-arrival table HTML');
    assert.ok(index.safe(await host.ariaSnapshot()),'unsafe fresh-arrival accessible text');
    assert.ok(index.safe(decodeURIComponent(page.url())),'unsafe fresh-arrival URL');
    if(key !== 't.f.id') assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
    assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');
  }
  assert.deepEqual(errors,[]);
  const result={server:'wrangler dev --local',contractsEndpoint:'local fixture',core:'7a57261b4',screenshots:shots,privacy,checks:['client and server rows/facets','actual client and capped server CSV','rejected header-only CSV','URL and fresh SSR arrivals','rendered and accessible text','analytics','hidden CN id','column-wide bars across pages','phone bars hidden','no page overflow'],pageErrors:errors,blockedExternalRequests:blocked.length};
  await writeFile(resolve(outputDir,'round2-browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} catch(error) {
  if(page) {
    await writeFile(resolve(outputDir,'round2-requests.json'),JSON.stringify(requests,null,2)+'\n');
    await writeFile(resolve(outputDir,'round2-failure.html'),await page.content().catch(()=>''));
    await page.screenshot({path:resolve(outputDir,'round2-failure.png')}).catch(()=>{});
    const index=await tablePrivacyIndex();
    console.log(JSON.stringify({error:error.name,message:index.safe(error.message) ? error.message : 'privacy assertion rejected',stack:index.safe(error.stack) ? error.stack : undefined,pageErrors:errors.map(value=>index.safe(value) ? value : 'unsafe error text')}));
  }
  throw Error('Local contracts browser gate failed; see private capture');
} finally {
  await browser?.close();await new Promise(done=>proxy.close(done));
  if(dev.exitCode==null && dev.signalCode==null) {
    dev.kill('SIGTERM');await Promise.race([new Promise(done=>dev.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);
    if(dev.exitCode==null && dev.signalCode==null) dev.kill('SIGKILL');
  }
  await writeFile(resolve(outputDir,'round2-wrangler-dev.log'),devLog);
}
