// Run inside unshare -rn, with loopback enabled. Own only these local processes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {readFile,mkdir,writeFile,symlink,readlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {registerTablePrivacy,tablePrivacyIndex} from './datatable-privacy.mjs';
import {recipientIdentityIndex} from '../src/recipient-index.mjs';
import {isOrganisationDonor,namesWithheldPhrase} from '../public/donor-entity.js';
import {isOrganisationRecipient} from '../public/recipient-entity.js';

const portal=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const outputDir=resolve(portal,'private/dt-contracts');
await mkdir(outputDir,{recursive:true});
const discardLog=resolve(outputDir,'wrangler-discard.log');
try {await symlink('/dev/null',discardLog)} catch(error) {assert.equal(error.code,'EEXIST');assert.equal(await readlink(discardLog),'/dev/null')}
await writeFile(resolve(outputDir,'review-browser.pid'),String(process.pid)+'\n');
const base='http://127.0.0.1:9767',workerBase=base;
const read=path=>readFile(resolve(portal,'public'+path),'utf8').then(JSON.parse);
const recipientPolicy=await recipientIdentityIndex(read);
const index=await tablePrivacyIndex({recipients:true});
const suppliers=JSON.parse(await readFile(resolve(portal,'public/suppliers.json'),'utf8')).suppliers;
const supplier=suppliers.find(entry=>entry.count>=50 && entry.count<=2000 && !recipientPolicy.suppliers.has(entry.id) && index.dataSafe(entry.name));
assert.ok(supplier,'the snapshot must exercise client paging');
const clientPath=`/subject/supplier/${supplier.id}`;
const modes={client:{path:clientPath,host:'#supplier-contracts [data-datatable]'},server:{path:'/discover',host:'#contracts-hub-table [data-datatable]'}};
const modulePath='/'+(await readFile(resolve(portal,'public/suppliers.js'),'utf8')).match(/contracts-table\.js\?v=[a-f0-9]+/)[0];
const privacyRollouts=[];
const supplierModule='/'+(await readFile(resolve(portal,'public/suppliers.js'),'utf8')).match(/suppliers-table\.js\?v=[a-f0-9]+/)[0];
registerTablePrivacy(privacyRollouts,{id:'suppliers',path:'/subject/supplier',host:'#subject-body [data-datatable]',module:supplierModule,configExport:'suppliersTableConfig',rowsExport:'suppliersClientRows',facet:'jurisdiction',urlKey:'t',endpoint:'/api/table/suppliers',clientRequired:false,modes:{client:{},server:{}}});
registerTablePrivacy(privacyRollouts,{id:'contracts',...modes.client,module:modulePath,configExport:'contractsTableConfig',rowsExport:'contractsClientRows',facet:'agency',urlKey:'t',endpoint:'/api/table/contracts',modes});

const dev=spawn(process.execPath,['--no-warnings','node_modules/wrangler/wrangler-dist/cli.js','dev','--local',...(process.env.DT_D1_PERSIST ? ['--persist-to',process.env.DT_D1_PERSIST] : []),'--ip','127.0.0.1','--port','9767','--inspector-port','9768','--log-level',process.env.DT_DEV_LOG_LEVEL || 'error','--show-interactive-dev-session=false','--var','INDEXNOW_ENABLED:false','--var','INDEXNOW_DRY_RUN:true','--var','VOICE_ENABLED:false','--var','COMMUNITY_ENABLED:false','--var','DAILY_POST_ENABLED:false'],{cwd:portal,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:discardLog,GOMAXPROCS:'2'},stdio:['ignore','pipe','pipe']});
dev.on('exit',(code,signal)=>console.log(JSON.stringify({wranglerExit:code,signal})));
await writeFile(resolve(outputDir,'review-wrangler.pid'),String(dev.pid)+'\n');
let devLog='',browser,page;
await writeFile(resolve(outputDir,'review-wrangler-dev.log'),'');
const log=line=>{
  const safe=index.safe(line) && !/\b(?:node|workerd|sh|zsh|npm|npx)\b.*(?:--|cli\.js)|"args":|"argv":|spawn|command line|API_KEY|TOKEN|AUTH/i.test(line) ? line : '[diagnostic omitted]';
  devLog+=safe+'\n';appendFileSync(resolve(outputDir,'review-wrangler-dev.log'),safe+'\n');
};
for(const stream of [dev.stdout,dev.stderr]) {
  let pending='';
  stream.on('data',value=>{pending+=value;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)log(line)});
  stream.on('end',()=>{if(pending)log(pending)});
}
const errors=[],blocked=[],requests=[];
try {
  let ready=false;
  for(let i=0;i<720;i++) {
    if(dev.exitCode != null) throw Error('Wrangler stopped before readiness');
    try {const probe=await fetch(workerBase+'/fonts.css',{signal:AbortSignal.timeout(30000)});await probe.arrayBuffer();if(probe.ok) {ready=true;break;}} catch {}
    await new Promise(done=>setTimeout(done,250));
  }
  assert.ok(ready,'Wrangler readiness timed out');console.log('Local Wrangler ready');
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin !== base) {blocked.push('external');return route.abort();}
    if(url.pathname.startsWith('/api/') && !['/api/table/contracts','/api/table/suppliers','/api/table/privacy'].includes(url.pathname)) return route.abort();
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
      const filename=`review-${mode==='server' ? 'hub' : 'supplier'}-${width}.png`;
      await page.screenshot({path:resolve(outputDir,filename)});shots.push(filename);console.log(`Captured ${filename}`);
    }
  }
  await page.setViewportSize({width:1280,height:1000});
  for(const mode of ['client','server']) {
    const host=await load(mode),scale=await host.locator('.dt-scale').textContent();
    await host.locator('[data-page="2"]').click();await settled(modes[mode].host);
    assert.equal(await host.locator('.dt-scale').textContent(),scale,'paging must retain the column-wide scale');
  }
  const privacy=[];
  console.log('Running shared contracts privacy hook');
  for(const run of privacyRollouts) privacy.push(await run({page,base,index,outputDir,onProgress:progress=>console.log(JSON.stringify(progress))}));
  const csv=await readFile(resolve(outputDir,'contracts-server.csv'),'utf8');
  assert.ok(index.dataSafe(csv),'recipient-safe actual D1 export');
  assert.ok(csv.includes('Showing rows 1-10,000 of '),'actual server CSV continuation note');
  // Fresh arrivals also validate SSR seed consumption and legacy query migration.
  const privateValue=index.values[0];
  const encoded=[...new TextEncoder().encode(privateValue)].map(n=>'%'+n.toString(16).padStart(2,'0')).join('');
  for(const mode of ['client','server']) for(const key of ['t.q','t.f.agency','t.f.id','contract']) for(const value of [privateValue,'5% '+encoded,'%FF'+encoded]) {
    const params=new URLSearchParams({[key]:key.startsWith('t.f.') ? JSON.stringify([value]) : value,campaign:'fixture'});
    const response=await page.goto(base+modes[mode].path+'?'+params);
    const ssr=await response.text();
    const seed=ssr.match(/<script type="application\/json" data-contracts-seed>(.*?)<\/script>/s);
    assert.ok(seed,'the arrival must include a real SSR table seed');
    assert.ok(index.dataSafe(seed[1]),'unsafe fresh-arrival SSR input');
    await settled(modes[mode].host);
    const host=page.locator(modes[mode].host);
    assert.ok(index.dataSafe(await host.innerHTML()),'unsafe fresh-arrival table HTML');
    assert.ok(index.dataSafe(await host.ariaSnapshot()),'unsafe fresh-arrival accessible text');
    assert.ok(index.safe(decodeURIComponent(page.url())),'unsafe fresh-arrival URL');
    assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0');
    assert.equal(new URL(page.url()).searchParams.get('campaign'),'fixture');
    const download=page.waitForEvent('download');await host.locator('[data-export]').click();
    assert.equal((await readFile(await (await download).path(),'utf8')).split('\r\n').length,1,'initial rejection exports no data');
  }
  // Inspect complete profiles, including the public organisations the donor policy withholds.
  const matched = suppliers.filter(entry => {
    const profile = recipientPolicy.profiles.get(entry.id);
    const fields = [entry.name, ...(entry.aliases || []), ...(entry.lookup_names || []),
      profile?.identity?.legal_name, ...(profile?.aliases || []), ...(profile?.lookup_names || [])];
    return namesWithheldPhrase(index.phrases, 'donor receipts '+JSON.stringify(fields));
  });
  assert.ok(matched.length > 0, 'derived donor-matched supplier coverage');
  let publicProfiles=0, withheldProfiles=0;
  for (const entity of matched) {
    const source = recipientPolicy.profiles.get(entity.id);
    const visible = source && isOrganisationRecipient(source) && index.dataSafe(entity.name)
      && index.dataSafe(String(source.abn || ''));
    const response = await page.goto(base+'/subject/supplier/'+entity.id);
    const html = await response.text();
    assert.equal(response.status(), visible ? 200 : 404, 'supplier publication status');
    assert.ok(index.dataSafe(html), 'whole supplier SSR recipient privacy');
    if (!visible) {
      withheldProfiles++;
      await page.waitForTimeout(100);
      assert.ok(index.dataSafe(await page.locator('body').ariaSnapshot()), 'withheld supplier accessible text');
      continue;
    }
    publicProfiles++;
    await settled(modes.client.host);
    const profile = page.locator('#subject-body');
    await page.waitForTimeout(150);
    const dom = await profile.innerHTML(), accessible = await profile.ariaSnapshot();
    assert.ok(index.dataSafe(dom), 'whole supplier hydrated recipient privacy');
    assert.ok(index.dataSafe(accessible), 'whole supplier accessible recipient privacy');
    assert.ok(!/\/subject\/donor\/|also a donor|donation register|disclosed receipts/i.test(dom), 'withheld political-money DOM');
    const ssr = html.slice(html.indexOf('id="prerender"'),html.indexOf('</main>'));
    assert.ok(!/\/subject\/donor\/|also a donor|donation register|disclosed receipts/i.test(ssr), 'withheld political-money SSR');
    assert.ok((await profile.textContent()).includes(entity.name), 'organisation procurement survives hydration');
    if (publicProfiles % 10 === 0) console.log(JSON.stringify({profileAudit:publicProfiles, withheldProfiles}));
  }
  console.log(JSON.stringify({profileAudit:matched.length, publicProfiles, withheldProfiles}));
    assert.deepEqual(errors,[]);
  const result={server:'wrangler dev --local',contractsEndpoint:'D1 /api/table/contracts',suppliersEndpoint:'D1 /api/table/suppliers',core:'7a57261b4',profiles:{matched:matched.length,publicProfiles,withheldProfiles},screenshots:shots,privacy,checks:['client and server rows/facets','actual client CSV and D1 CSV continuation','rejected header-only CSV','URL and fresh SSR arrivals','rendered and accessible text','analytics','hidden CN id','column-wide bars across pages','phone bars hidden','no page overflow'],pageErrors:errors,blockedExternalRequests:blocked.length};
  await writeFile(resolve(outputDir,'review-browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} catch(error) {
  if(page) {
    await writeFile(resolve(outputDir,'review-requests.json'),JSON.stringify(requests,null,2)+'\n');
    const content=await page.content().catch(()=> '');
    await writeFile(resolve(outputDir,'review-failure-summary.json'),JSON.stringify({recipientSafe:index.dataSafe(content),htmlBytes:content.length}));
    console.log(JSON.stringify({pageState:await page.evaluate(()=>({tables:document.querySelectorAll('[data-datatable]').length,hub:!!document.querySelector('#contracts-hub-table'),prerender:!!document.querySelector('#prerender [data-contracts-table]'),busy:[...document.querySelectorAll('[data-datatable]')].map(el=>el.hasAttribute('aria-busy')),counts:document.querySelectorAll('.dt-count').length,scripts:[...document.querySelectorAll('script[src]')].map(el=>new URL(el.src).pathname)}))}));
    console.log(JSON.stringify({error:error.name,message:index.safe(error.message) ? error.message : 'privacy assertion rejected',stack:index.safe(error.stack) ? error.stack : undefined,pageErrors:errors.map(value=>index.safe(value) ? value : 'unsafe error text')}));
  }
  throw Error('Local contracts browser gate failed; see private capture');
} finally {
  await browser?.close();
  if(dev.exitCode==null && dev.signalCode==null) {
    dev.kill('SIGTERM');await Promise.race([new Promise(done=>dev.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);
    if(dev.exitCode==null && dev.signalCode==null) dev.kill('SIGKILL');
  }
  await writeFile(resolve(outputDir,'review-wrangler-dev.log'),devLog);
}
