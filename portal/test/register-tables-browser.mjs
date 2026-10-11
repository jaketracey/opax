// Run inside unshare -rn with loopback enabled. This runner owns Wrangler and Chrome.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {personIndex} from '../src/person-slug.ts';
import {partyUrl} from '../public/canonical-urls.js';
import {registerTablePrivacy,tablePrivacyIndex} from './datatable-privacy.mjs';
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const pub=fileURLToPath(new URL('../public/',import.meta.url)),outputDir=fileURLToPath(new URL('../private/dt-registers/',import.meta.url));
const json=async file=>JSON.parse(await readFile(resolve(pub,file),'utf8'));
const people=(await json('parliamentarians.json')).people,interestIndex=await json('interests/index.json');
const member=people.find(p=>p.pid && !p.speech_scope && interestIndex.people[p.pid] && existsSync(resolve(pub,`interests/${p.pid}.json`)));
const graph=await json('graph/money.json'),totals=new Map();
for(const e of graph.edges)if(!e.flow && !e.grant)totals.set(e.target,(totals.get(e.target)||0)+e.total);
const party=graph.nodes.find(n=>n.id===[...totals].sort((a,b)=>b[1]-a[1])[0][0]);
const personPath=`/subject/person/${personIndex(people).slugOf.get(member.name)}`,partyPath=partyUrl(party.label);
await mkdir(outputDir,{recursive:true});
const base='http://127.0.0.1:9754';
const dev=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port','9754','--inspector-port','9755','--log-level','error','--show-interactive-dev-session=false','--var','INDEXNOW_ENABLED:false','--var','INDEXNOW_DRY_RUN:true'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
let devLog='',browser;
await writeFile(resolve(outputDir,'round2-wrangler-dev.log'),'');
dev.stdout.on('data',value=>{devLog+=value;void writeFile(resolve(outputDir,'round2-wrangler-dev.log'),devLog);});dev.stderr.on('data',value=>{devLog+=value;void writeFile(resolve(outputDir,'round2-wrangler-dev.log'),devLog);});
const errors=[],blocked=[],privacyRollouts=[];
registerTablePrivacy(privacyRollouts,{id:'interests',path:personPath,host:'[data-register-table="interests-table"]',facet:'category',urlKey:'interests',endpoint:`/api/register/interests?pid=${encodeURIComponent(member.pid)}`,modes:['client'],readInput:page=>page.evaluate(async ({pid,name})=>{
  const core=await import('/datatable.js'),tables=await import('/register-tables.js');
  const projected=await fetch(`/api/register/interests?pid=${encodeURIComponent(pid)}`).then(r=>r.json()),config=tables.interestTableConfig(projected.rows);
  return {clientInput:{rows:config.rows,facets:core.applyQuery(config.rows,config,{}).facets},donorContext:false};
},{pid:member.pid,name:member.name})});
registerTablePrivacy(privacyRollouts,{id:'party-money',path:partyPath,host:'[data-register-table="party-money-table"]',facet:'industry',urlKey:'partyMoney',endpoint:partyPath,responseType:'text',modes:['client'],readInput:page=>page.evaluate(async partyId=>{
  const tables=await import('/register-tables.js'),growth=await import('/growth-modules.js'),core=await import('/datatable.js');
  const graph=await fetch('/graph/money.json').then(r=>r.json()),privacy=growth.approvedModulePrivacy(await growth.loadModuleDonors());
  const projected=tables.partyMoneyData(graph,partyId,privacy),config=tables.partyMoneyTableConfig(projected.rows,projected.aggregate);
  return {clientInput:{rows:core.applyQuery(config.rows,config,{pageSize:2000}).rows,facets:core.applyQuery(config.rows,config,{}).facets},donorContext:true};
},party.id)});
try{
 let ready=false;
 for(let i=0;i<240;i++){
  if(dev.exitCode != null)throw new Error('Wrangler stopped before readiness');
  try{if((await fetch(base+'/fonts.css',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}
  await new Promise(done=>setTimeout(done,250));
 }
 assert.ok(ready,'Wrangler readiness timed out');
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin !== base){blocked.push('external');return route.abort();}
  if(url.pathname.startsWith('/api/') && !['/api/table/instruments','/api/table/privacy','/api/register/interests','/api/person-slugs'].includes(url.pathname))return route.fulfill({contentType:'application/json',body:'{"results":[],"topics":[],"people":[]}'});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const settled=host=>page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),host);
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:1000});
  for(const [name,path,id] of [['instruments','/instruments','instruments-table'],['audit','/audit','audit-table'],['interests',personPath,'interests-table'],['party-money',partyPath,'party-money-table']]){
   await page.goto(base+path);const selector=`[data-register-table="${id}"]`;await settled(selector);await page.evaluate(()=>document.fonts.ready);
   const host=page.locator(selector);
   await host.scrollIntoViewIfNeeded();
   await page.evaluate(selector=>window.scrollTo(0,document.querySelector(selector).getBoundingClientRect().top+scrollY-120),selector);
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),`${name} ${width}: fits the viewport`);
   assert.ok(await host.locator('tbody tr').count(),`${name}: rows loaded`);
   await page.screenshot({path:resolve(outputDir,`round2-${name}-${width}.png`)});
   console.log(`round2-${name}-${width}.png`);
   const download=page.waitForEvent('download');await host.locator('[data-export]').click();
   const csv=await readFile(await (await download).path(),'utf8');
   assert.ok(csv.includes(name === 'interests' ? 'Category,Item,Date' : name === 'party-money' ? 'Donor,Industry,Given' : 'Title,'),`${name}: CSV headers`);
   if(name === 'party-money'){
    assert.ok(csv.includes('Donors not named ('),'neutral aggregate survives real CSV');
    if(width === 1280){
     assert.ok(await host.locator('.dt-scale').count(),'column scale is rendered');
     const scale=await host.locator('.dt-scale').textContent();
     await host.locator('[data-page="2"]').click();await settled(selector);
     assert.equal(await host.locator('.dt-scale').textContent(),scale,'bar scale remains constant across pages');
    }
   }
   if(name === 'instruments'){
    if(width < 600)await host.locator('[data-sort-select]').selectOption('registered:desc');
    else await host.locator('[data-sort="registered"]').click();
    await settled(selector);await host.locator('[data-page="2"]').click();await settled(selector);
    assert.ok((await host.locator('.dt-count').textContent()).startsWith('Showing 51–100'));
   }
  }
 }
 await page.setViewportSize({width:1280,height:1000});
 const index=await tablePrivacyIndex(),privacy=[];
 for(const run of privacyRollouts)privacy.push(await run({page,base,index,outputDir}));
 // Real initial SSR query state, before hydration, must never echo withheld text.
 for(const [path,key,selector,donorContext] of [[personPath,'interests','[data-register-table="interests-table"]',false],[partyPath,'partyMoney','[data-register-table="party-money-table"]',true]]){
  const check=await tablePrivacyIndex({donorContext});
  for(const kind of ['q','facet']){
   const value=check.values[0],params=new URLSearchParams({[key+(kind === 'q' ? '.q' : '.f.'+(key === 'interests' ? 'category' : 'industry'))]:kind === 'q' ? value : JSON.stringify([value])});
   const response=await page.goto(base+path+'?'+params);assert.ok(check.safe(await response.text()),'initial SSR query has no private echo');await settled(selector);
   assert.ok(check.safe(decodeURIComponent(page.url())),'initial query URL scrubbed');
   assert.ok(check.safe(await page.locator(selector).ariaSnapshot()),'initial accessible text safe');
  }
 }
 assert.equal(errors.length,0,'browser script error count');
 const result={server:'wrangler dev --local',core:'7a57261b4',screenshots:8,viewports:[390,1280],privacy,pageErrors:errors.length,blockedExternalRequests:blocked.length,checks:['rows and facets','actual CSV download','URL and initial SSR state','rendered and accessible text','analytics','neutral aggregate','column-wide bar scale across pages','server dates and pagination','viewport fit']};
 await writeFile(resolve(outputDir,'round2-browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 await browser?.close();dev.kill('SIGTERM');await Promise.race([new Promise(done=>dev.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);if(dev.exitCode == null && dev.signalCode == null)dev.kill('SIGKILL');await writeFile(resolve(outputDir,'round2-wrangler-dev.log'),devLog);
}
