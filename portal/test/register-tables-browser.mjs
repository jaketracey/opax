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
let devLog=0,devMessages='',browser;
await writeFile(resolve(outputDir,'revision-wrangler-dev.log'),'');
dev.stdout.on('data',value=>{devLog+=value.length;devMessages+=value;});dev.stderr.on('data',value=>{devLog+=value.length;devMessages+=value;});
const errors=[],blocked=[],privacyRollouts=[];
const privacyIndex=await tablePrivacyIndex();
registerTablePrivacy(privacyRollouts,{id:'interests',path:personPath,host:'[data-register-table="interests-table"]',facet:'category',urlKey:'interests',fullPrivacy:true,endpoint:`/api/register/interests?pid=${encodeURIComponent(member.pid)}`,modes:['client'],readInput:page=>page.evaluate(async ({pid})=>{
  const core=await import('/datatable.js'),tables=await import('/register-tables.js');
  const projected=await fetch(`/api/register/interests?pid=${encodeURIComponent(pid)}`).then(r=>r.json()),config=tables.interestTableConfig(projected.rows);
  return {clientInput:{rows:config.rows,facets:core.applyQuery(config.rows,config,{}).facets},donorContext:true};
},{pid:member.pid})});
registerTablePrivacy(privacyRollouts,{id:'party-money',path:partyPath,host:'[data-register-table="party-money-table"]',facet:'industry',urlKey:'partyMoney',fullPrivacy:true,endpoint:`/api/register/party-money?${new URLSearchParams({partyId:party.id})}`,modes:['client'],readInput:page=>page.evaluate(async partyId=>{
  const tables=await import('/register-tables.js'),core=await import('/datatable.js');
  const projected=await fetch(`/api/register/party-money?${new URLSearchParams({partyId})}`).then(r=>r.json()),config=tables.partyMoneyTableConfig(projected.rows,projected.aggregate);
  return {clientInput:{rows:core.applyQuery(config.rows,config,{pageSize:2000}).rows,facets:core.applyQuery(config.rows,config,{}).facets},donorContext:true};
},party.id)});
registerTablePrivacy(privacyRollouts,{id:'instruments',path:'/instruments',host:'[data-register-table="instruments-table"]',facet:'portfolios',urlKey:'instruments',fullPrivacy:true,endpoint:'/api/table/instruments',modes:['server'],readInput:page=>page.evaluate(async()=>{
 const page=await fetch('/api/table/instruments').then(r=>r.json());return {clientInput:page,donorContext:true};
})});
registerTablePrivacy(privacyRollouts,{id:'audit',path:'/audit',host:'[data-register-table="audit-table"]',facet:'sectors',urlKey:'audit',fullPrivacy:true,endpoint:'/audit',responseType:'table',modes:['client'],readInput:page=>page.evaluate(async()=>{
 const records=await fetch('/audit/index.json').then(r=>r.json()),tables=await import('/register-tables.js'),core=await import('/datatable.js'),complete=tables.auditTableConfig(records.records);
 return {clientInput:{rows:complete.rows,facets:core.applyQuery(complete.rows,complete,{}).facets},donorContext:true};
})});
try{
 let ready=false;
 for(let i=0;i<240;i++){
  if(dev.exitCode != null)throw new Error('Wrangler stopped before readiness');
  try{if((await fetch(base+'/fonts.css',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}
  await new Promise(done=>setTimeout(done,250));
 }
 assert.ok(ready,'Wrangler readiness timed out');
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu','--disable-webgl','--disable-software-rasterizer','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin !== base){blocked.push('external');return route.abort();}
  if(url.pathname.startsWith('/api/') && !['/api/table/instruments','/api/table/privacy','/api/register/interests','/api/register/party-money','/api/person-slugs'].includes(url.pathname))return route.fulfill({contentType:'application/json',body:'{"results":[],"topics":[],"people":[]}'});
  return route.continue();
 });
 await writeFile(resolve(outputDir,'revision-runner.pid'),String(process.pid)+'\n');
 const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
 const settled=host=>page.waitForFunction(host=>document.querySelector(host)?.querySelector('.dt-count') && !document.querySelector(host).hasAttribute('aria-busy'),host);
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:1000});
  for(const [name,path,id] of [['instruments','/instruments','instruments-table'],['audit','/audit','audit-table'],['interests',personPath,'interests-table'],['party-money',partyPath,'party-money-table']]){
   await page.goto(base+path);const selector=`[data-register-table="${id}"]`;await settled(selector);await page.evaluate(()=>document.fonts.ready);
   const host=page.locator(selector);
   await host.scrollIntoViewIfNeeded();
   await page.evaluate(selector=>window.scrollTo(0,document.querySelector(selector).getBoundingClientRect().top+scrollY-120),selector);
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   const layout=await page.evaluate(()=>({width:innerWidth,total:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({tag:el.tagName,className:el.className,right:Math.round(el.getBoundingClientRect().right)}))}));
   if(layout.total>width+1)console.log(JSON.stringify({table:name,layout}));
   assert.ok(layout.total<=width+1,`${name} ${width}: fits the viewport`);
   assert.ok(await host.locator('tbody [data-primary]').count(),`${name}: rows loaded`);
   await page.screenshot({path:resolve(outputDir,`revision-${name}-${width}.png`)});
   console.log(`revision-${name}-${width}.png`);
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
    const count=await host.locator('.dt-count').textContent();
    if(!count.startsWith('Showing 51–100'))console.log(JSON.stringify({table:name,stage:'pagination',status:privacyIndex.safe(count)?count:'suppressed'}));
    assert.ok(count.startsWith('Showing 51–100'));
   }
  }
 }
 await page.setViewportSize({width:1280,height:1000});
 const index=privacyIndex,privacy=[];
 for(const run of privacyRollouts)privacy.push(await run({page,base,index,outputDir}));
 // Initial URL rejection must survive SSR, hydration and legacy normalisation.
 const initialCases=[[personPath,'interests','interests-table','category'],[partyPath,'partyMoney','party-money-table','industry'],['/instruments','instruments','instruments-table','portfolios'],['/audit','audit','audit-table','sectors']];
 const initialValues=[index.probes[0],index.officeProbes[0],index.grantProbes.find(v=>/^\d{11}$/.test(v)),index.grantProbes.find(v=>!/^\d{11}$/.test(v))];
 for(const [path,key,id,facet] of initialCases)for(const value of initialValues)for(const kind of ['q','facet']){
  const selector=`[data-register-table="${id}"]`,params=new URLSearchParams({[key+(kind==='q'?'.q':'.f.'+facet)]:kind==='q'?value:JSON.stringify([value])});
  const response=await page.goto(base+path+'?'+params),html=await response.text();
  const ssr=await page.evaluate(html=>{
   const document=new DOMParser().parseFromString(html,'text/html');
   return [...document.querySelectorAll('[data-register-table]')].map(el=>el.outerHTML).join('');
  },html);
  assert.ok(index.safe(ssr),'initial SSR tables have no private echo');await settled(selector);
  const host=page.locator(selector);
  assert.ok(index.safe(decodeURIComponent(page.url())),'initial query URL scrubbed');
  assert.ok(index.safe(await host.innerHTML()),'initial DOM safe');assert.ok(index.safe(await host.ariaSnapshot()),'initial accessible text safe');
  assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0','initial rejection remains empty');
  assert.equal(await host.locator('[data-export]').isDisabled(),true,'initial rejection offers no CSV');
 }
 for(const [path,key,id] of initialCases.slice(2)){
  await page.goto(base+path+'?'+new URLSearchParams({q:initialValues[2]}));await settled(`[data-register-table="${id}"]`);
  assert.ok(index.safe(decodeURIComponent(page.url())),'legacy ABN URL scrubbed');
  assert.equal(await page.locator(`[data-register-table="${id}"] .dt-count`).textContent(),'Showing 0–0 of 0');
 }
 const airportResponse=await page.goto(base+'/instruments?q=airport');
 assert.ok((await airportResponse.text()).includes('of 51'),'airport SSR count');assert.equal(airportResponse.headers()['x-robots-tag'],'noindex');
 await settled('[data-register-table="instruments-table"]');
 assert.equal(await page.locator('[data-register-table="instruments-table"] .dt-count').textContent(),'Showing 1–50 of 51','airport hydration count');
 assert.equal(new URL(page.url()).searchParams.get('instruments.q'),'airport');
 assert.equal(new URL(await page.locator('link[rel=canonical]').getAttribute('href')).pathname,'/instruments');
 await page.goto(base+'/audit?sector=Health');await settled('[data-register-table="audit-table"]');
 const auditHost=page.locator('[data-register-table="audit-table"]');assert.equal(await auditHost.locator('.dt-count').textContent(),'Showing 1–48 of 48');
 await auditHost.getByRole('button',{name:'Clear all',exact:true}).click();await settled('[data-register-table="audit-table"]');
 assert.equal(await auditHost.locator('.dt-count').textContent(),'Showing 1–50 of 296','legacy Clear all restores full catalogue');
 assert.equal(errors.length,0,'browser script error count');
 const result={server:'wrangler dev --local',core:'7a57261b4',screenshots:8,viewports:[390,1280],privacy,pageErrors:errors.length,blockedExternalRequests:blocked.length,checks:['rows and facets','actual CSV download','URL and initial SSR state','rendered and accessible text','analytics','neutral aggregate','column-wide bar scale across pages','server dates and pagination','viewport fit']};
 await writeFile(resolve(outputDir,'revision-browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 await browser?.close();dev.kill('SIGTERM');await Promise.race([new Promise(done=>dev.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);if(dev.exitCode == null && dev.signalCode == null)dev.kill('SIGKILL');await writeFile(resolve(outputDir,'revision-wrangler-dev.log'),JSON.stringify({diagnosticBytes:devLog,exitCode:dev.exitCode,signal:dev.signalCode,lines:devMessages.split('\n').filter(line=>/Error|ERROR|Failed|failed|memory|OOM|EADDR/.test(line)).map(line=>privacyIndex.safe(line) && !/(?:\d[\s-]*){11}/.test(line) ? line : '[withheld diagnostic suppressed]')})+'\n');
}
