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
import {registerTablePrivacy,tablePrivacyIndex,institutionalPrivacyIndex} from './datatable-privacy.mjs';
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const pub=fileURLToPath(new URL('../public/',import.meta.url)),outputDir=fileURLToPath(new URL('../private/dt-registers/',import.meta.url));
const json=async file=>JSON.parse(await readFile(resolve(pub,file),'utf8'));
const privacyIndex=await tablePrivacyIndex();
const people=(await json('parliamentarians.json')).people,interestIndex=await json('interests/index.json');
const member=people.find(p=>p.pid && !p.speech_scope && privacyIndex.safe(p.name) && privacyIndex.safe(p.full || '') && interestIndex.people[p.pid] && existsSync(resolve(pub,`interests/${p.pid}.json`)));
assert.ok(member,'a public register is available for screenshots');
const graph=await json('graph/money.json'),totals=new Map();
for(const e of graph.edges)if(!e.flow && !e.grant)totals.set(e.target,(totals.get(e.target)||0)+e.total);
const party=graph.nodes.find(n=>n.id===[...totals].sort((a,b)=>b[1]-a[1])[0][0]);
const personPath=`/subject/person/${personIndex(people).slugOf.get(member.name)}`,partyPath=partyUrl(party.label);
await mkdir(outputDir,{recursive:true});
const base='http://127.0.0.1:9754';
const initialOnly=process.env.DT_REGISTER_INITIAL_ONLY==='true';
const selectedTables=process.env.DT_REGISTER_TABLES?.split(',').filter(Boolean);
const workerBundle=process.env.DT_REGISTER_WORKER;
const dev=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev',...workerBundle?[workerBundle,'--no-bundle']:[],'--local','--ip','127.0.0.1','--port','9754','--inspector-port','9755','--log-level','error','--show-interactive-dev-session=false','--var','INDEXNOW_ENABLED:false','--var','INDEXNOW_DRY_RUN:true'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
let devLog=0,devMessages='',browser;
await writeFile(resolve(outputDir,'round5-wrangler-dev.log'),'');
dev.stdout.on('data',value=>{devLog+=value.length;devMessages+=value;});dev.stderr.on('data',value=>{devLog+=value.length;devMessages+=value;});
const errors=[],blocked=[],privacyRollouts=[];
registerTablePrivacy(privacyRollouts,{id:'interests',path:personPath,host:'[data-register-table="interests-table"]',facet:'category',rangeFacet:'date',urlKey:'interests',fullPrivacy:true,endpoint:`/api/register/interests?pid=${encodeURIComponent(member.pid)}`,modes:['client'],readInput:page=>page.evaluate(async ({pid})=>{
  const tables=await import('/register-tables.js');
  const projected=await fetch(`/api/register/interests?pid=${encodeURIComponent(pid)}`).then(r=>r.json()),config=tables.interestTableConfig(projected.rows);
  return {clientInput:projected,donorContext:config.privacy==='donors'};
},{pid:member.pid})});
registerTablePrivacy(privacyRollouts,{id:'party-money',path:partyPath,host:'[data-register-table="party-money-table"]',facet:'industry',rangeFacet:'total',urlKey:'partyMoney',fullPrivacy:true,endpoint:`/api/register/party-money?${new URLSearchParams({partyId:party.id})}`,modes:['client'],readInput:page=>page.evaluate(async partyId=>{
  const tables=await import('/register-tables.js');
  const projected=await fetch(`/api/register/party-money?${new URLSearchParams({partyId})}`).then(r=>r.json()),config=tables.partyMoneyTableConfig(projected.rows,projected.aggregate);
  return {clientInput:projected,donorContext:config.privacy==='donors'};
},party.id)});
registerTablePrivacy(privacyRollouts,{id:'instruments',path:'/instruments',host:'[data-register-table="instruments-table"]',facet:'portfolios',rangeFacet:'year',urlKey:'instruments',fullPrivacy:true,endpoint:'/api/table/instruments',modes:['server'],readInput:page=>page.evaluate(async()=>{
 const page=await fetch('/api/table/instruments').then(r=>r.json());return {clientInput:page,donorContext:true};
})});
registerTablePrivacy(privacyRollouts,{id:'audit',institutionalFields:['id','title','tabled_date','sectors','year'],path:'/audit',host:'[data-register-table="audit-table"]',facet:'sectors',rangeFacet:'year',urlKey:'audit',fullPrivacy:true,endpoint:'/audit',responseType:'table',modes:['client'],readInput:page=>page.evaluate(async()=>{
 const response=await fetch('/audit'),doc=new DOMParser().parseFromString(await response.text(),'text/html');
 const {config}=JSON.parse(doc.querySelector('[data-register-table="audit-table"] [data-register-config]').textContent);
 return {clientInput:config,donorContext:config.privacy==='donors'};
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
 await context.addInitScript(()=>{window.initialPrivacyEvents=[];addEventListener('opax:analytics',event=>window.initialPrivacyEvents.push(event.detail));});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin !== base){blocked.push('external');return route.abort();}
  if(url.pathname.startsWith('/api/') && !['/api/table/instruments','/api/table/audit-reports','/api/table/privacy','/api/register/interests','/api/register/party-money','/api/person-slugs'].includes(url.pathname))return route.fulfill({contentType:'application/json',body:'{"results":[],"topics":[],"people":[]}'});
  return route.continue();
 });
 await writeFile(resolve(outputDir,'round5-runner.pid'),String(process.pid)+'\n');
 const page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
 const validationResults=[],moduleStatuses=[];
 page.on('response',async response=>{
  if(new URL(response.url()).pathname.endsWith('.js'))moduleStatuses.push({path:new URL(response.url()).pathname,status:response.status()});
  if(new URL(response.url()).pathname==='/api/table/privacy')validationResults.push({status:response.status(),safe:(await response.json().catch(()=>({}))).safe});
 });
 const settled=async host=>{
  try{await page.waitForFunction(host=>{const el=document.querySelector(host),table=el?.matches('[data-datatable]')?el:el?.querySelector('[data-datatable]');return table?.querySelector('.dt-count') && !el.hasAttribute('aria-busy') && !table.hasAttribute('aria-busy') && !el.querySelector('[data-register-config]')},host,{polling:100})}catch(error){
   const state=await page.locator(host).evaluate(el=>({outerBusy:el.hasAttribute('aria-busy'),innerBusy:el.querySelector('[data-datatable]')?.hasAttribute('aria-busy'),pendingScript:!!el.querySelector('[data-register-config]'),rowCount:el.querySelectorAll('tbody tr').length}));
   console.log(JSON.stringify({stage:'settle-timeout',state,validationCount:validationResults.length,lastValidation:validationResults.slice(-3),moduleStatuses,errorCount:errors.length}));throw error;
  }
 };
 for(const width of initialOnly ? [] : [390,1280]){
  await page.setViewportSize({width,height:1000});
  for(const [name,path,id] of [['instruments','/instruments','instruments-table'],['audit','/audit','audit-table'],['interests',personPath,'interests-table'],['party-money',partyPath,'party-money-table']]){
   if(selectedTables && !selectedTables.includes(name))continue;
   await page.goto(base+path);const selector=`[data-register-table="${id}"]`;await settled(selector);await page.evaluate(()=>document.fonts.ready);
   const host=page.locator(selector);
   await host.scrollIntoViewIfNeeded();
   await page.evaluate(selector=>window.scrollTo(0,document.querySelector(selector).getBoundingClientRect().top+scrollY-120),selector);
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   const layout=await page.evaluate(()=>({width:innerWidth,total:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({tag:el.tagName,className:el.className,right:Math.round(el.getBoundingClientRect().right)}))}));
   if(layout.total>width+1)console.log(JSON.stringify({table:name,layout}));
   assert.ok(layout.total<=width+1,`${name} ${width}: fits the viewport`);
   assert.ok(await host.locator('tbody [data-primary]').count(),`${name}: rows loaded`);
   await page.screenshot({path:resolve(outputDir,`round5-${name}-${width}.png`)});
   console.log(`round5-${name}-${width}.png`);
   const download=page.waitForEvent('download');await host.locator('[data-export]').click();
   const received=await download.catch(async error=>{
    const state=await host.evaluate(el=>({outerBusy:el.hasAttribute('aria-busy'),innerBusy:el.querySelector('[data-datatable]')?.hasAttribute('aria-busy'),disabled:el.querySelector('[data-export]')?.disabled,failed:el.querySelector('.dt-count')?.textContent.includes('Could not export'),pendingScript:!!el.querySelector('[data-register-config]')}));
    console.log(JSON.stringify({table:name,stage:'export-timeout',state,validations:validationResults.slice(-3)}));throw error;
   });
   const csv=await readFile(await received.path(),'utf8');
   assert.ok(csv.includes(name === 'interests' ? 'Category,Item,Date' : name === 'party-money' ? 'Donor,Industry,Given' : 'Title,'),`${name}: CSV headers`);
   if(name === 'party-money'){
    if(!csv.includes('Donors not named ('))console.log(JSON.stringify({table:name,stage:'aggregate-csv',rows:csv.split('\r\n').length,domAggregate:await host.locator('details.donor-aggregate').count(),validationCount:validationResults.length,lastValidation:validationResults.slice(-5)}));
    assert.ok(csv.includes('Donors not named ('),'neutral aggregate survives real CSV');
    if(width === 1280){
     const aggregate=host.locator('details.donor-aggregate');
     assert.equal(await aggregate.count(),1,'aggregate owns the policy disclosure');
     assert.equal(await aggregate.locator('p').isVisible(),false,'policy is initially inside the closed disclosure');
     await aggregate.locator('summary').click();
     assert.equal(await aggregate.locator('p').textContent(),"OPAX names organisations only. Donors it can't confirm are organisations are counted here, not named.");
     await aggregate.locator('summary').click();
     assert.ok(await host.locator('.dt-scale').count(),'column scale is rendered');
     const scale=await host.locator('.dt-scale').textContent();
     await host.locator('[data-page="2"]').click();await settled(selector);
     assert.equal(await host.locator('.dt-scale').textContent(),scale,'bar scale remains constant across pages');
    }
   }
   if(name === 'instruments'){
    assert.equal(await host.locator('tbody [data-label="Registered"] .dt-value').count(),50,'D1 projects 50 Registered cells');
    assert.equal(await host.locator('tbody [data-label="Registered"] .dt-value').filter({hasText:'—'}).count(),0,'Registered cells are populated');
    assert.ok(csv.split('\r\n')[0].split(',').includes('Registered'),'real D1 CSV includes Registered');
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
 for(const [i,run] of privacyRollouts.entries())if(!initialOnly && (!selectedTables || selectedTables.includes(['interests','party-money','instruments','audit'][i])))privacy.push(await run({page,base,index,outputDir}));
 // Initial URL rejection must survive SSR, hydration and legacy normalisation.
 const initialCases=[[personPath,'interests','interests-table','category'],[partyPath,'partyMoney','party-money-table','industry'],['/instruments','instruments','instruments-table','portfolios'],['/audit','audit','audit-table','sectors']];
 const initialValues=[index.probes[0],index.officeProbes[0],index.grantProbes.find(v=>/^\d{11}$/.test(v)),index.grantProbes.find(v=>!/^\d{11}$/.test(v))];
 let initialRangeCases=0;
 for(const [path,key,id,facet] of initialCases)for(const value of initialOnly ? initialValues.filter(value=>/^\d{11}$/.test(value)) : initialValues)for(const kind of initialOnly ? ['min','max'] : ['q','facet',...(/^\d{11}$/.test(value)?['min','max']:[])]){
  const range=kind==='min'||kind==='max',column=id==='party-money-table'?'total':id==='interests-table'?'date':'year';
  const selector=`[data-register-table="${id}"]`,params=new URLSearchParams({[key+(kind==='q'?'.q':'.f.'+(range?column:facet))]:kind==='q'?value:JSON.stringify(range?{[kind]:Number(value)}:[value])});
  const response=await page.goto(base+path+'?'+params),html=await response.text();
  assert.equal(response.headers()['x-robots-tag'],'noindex','rejected initial URL is noindex in SSR');
  assert.ok(await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelector('meta[name="robots"]')?.content.includes('noindex'),html),'rejected initial URL has SSR robots metadata');
  const ssr=await page.evaluate(html=>{
   const document=new DOMParser().parseFromString(html,'text/html');
   return [...document.querySelectorAll('[data-register-table]')].map(el=>el.outerHTML).join('');
  },html);
  const initialIndex=key==='audit'?institutionalPrivacyIndex(index,await page.evaluate(html=>JSON.parse(new DOMParser().parseFromString(html,'text/html').querySelector('[data-register-config]').textContent).config.rows,html),['id','title','tabled_date','sectors','year']):index;
  assert.ok((initialIndex.safeRows || initialIndex.safe)(ssr),'initial SSR tables have no private echo');await settled(selector);
  const host=page.locator(selector);
  assert.ok(index.safe(decodeURIComponent(page.url())),'initial query URL scrubbed');
  assert.ok(index.safe(await host.innerHTML()),'initial DOM safe');assert.ok(index.safe(await host.ariaSnapshot()),'initial accessible text safe');
  assert.equal(await host.locator('.dt-count').textContent(),'Showing 0–0 of 0','initial rejection remains empty');
  assert.equal(await host.locator('[data-export]').isDisabled(),true,'initial rejection offers no CSV');
  assert.ok(index.safe(JSON.stringify(await page.evaluate(()=>window.initialPrivacyEvents))),'initial analytics have no private echo');
  assert.ok((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'),'rejected initial URL stays noindex after hydration');
  if(range)initialRangeCases++;
 }
 let robotsRejectedCases=0;
 for(const [path,key,id] of initialCases.slice(0,2))for(const kind of ['duplicate','unknown','discarded','raw-query','raw-facet','raw-unknown','raw-duplicate']){
  const value=index.probes[0],params=new URLSearchParams();
  if(kind==='duplicate'){params.append(key+'.q','fixture');params.append(key+'.q',value);}
  else if(kind==='unknown')params.set(key+'.future',value);
  else if(kind==='discarded')params.set(key+'.f.'+(key==='partyMoney'?'total':'date'),JSON.stringify({min:0,discarded:value}));
  else if(kind==='raw-duplicate'){params.append('q','fixture');params.append('q',value);}
  else params.set(kind==='raw-query'?'q':kind==='raw-facet'?'f.future':'future',value);
  const response=await page.goto(base+path+'?'+params),html=await response.text();
  assert.equal(response.headers()['x-robots-tag'],'noindex','original rejected SSR state is noindex');
  const state=await page.evaluate(({html,key})=>{const doc=new DOMParser().parseFromString(html,'text/html'),host=doc.querySelector(key==='partyMoney'?'[data-register-table="ssr-party-money-table"]':'[data-register-table="ssr-interests-table"]');return {count:host.querySelector('.dt-count').textContent,disabled:host.querySelector('[data-export]').disabled,html:host.outerHTML,robots:doc.querySelector('meta[name="robots"]')?.content};},{html,key});
  assert.ok(state.robots?.includes('noindex'),'raw rejection has SSR robots metadata');
  assert.equal(state.count,'Showing 0–0 of 0','raw rejection is empty in SSR');assert.equal(state.disabled,true,'raw rejection cannot export in SSR');assert.ok(index.safe(state.html),'SSR rejection contains no private value');
  const selector=`[data-register-table="${id}"]`;await settled(selector);assert.equal(await page.locator(selector+' .dt-count').textContent(),'Showing 0–0 of 0','hydration retains raw rejection');assert.ok(index.safe(await page.locator(selector).innerHTML()),'hydrated rejection contains no private value');
  assert.ok((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'),'raw rejection stays noindex after hydration');robotsRejectedCases++;
 }
 let robotsFilteredCases=0;
 for(const [path,key,id] of initialCases.slice(0,2)) {
  const response=await page.goto(base+path),html=await response.text();
  assert.equal(response.headers()['x-robots-tag'],'all','ordinary unfiltered page is indexable in SSR');
  assert.equal(await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelector('meta[name="robots"]')?.content.includes('noindex') || false,html),false,'ordinary SSR metadata stays indexable');
  await settled(`[data-register-table="${id}"]`);
  assert.equal(await page.evaluate(()=>document.querySelector('meta[name="robots"]')?.content.includes('noindex') || false),false,'ordinary page stays indexable after hydration');
  for(const field of ['q',key+'.q']) {
   const response=await page.goto(base+path+'?'+new URLSearchParams({[field]:'fixture'})),html=await response.text();
   assert.equal(response.headers()['x-robots-tag'],'noindex','filtered page is noindex in SSR');
   assert.ok(await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelector('meta[name="robots"]')?.content.includes('noindex'),html),'filtered page has SSR robots metadata');
   await settled(`[data-register-table="${id}"]`);
   assert.ok((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'),'filtered page stays noindex after hydration');robotsFilteredCases++;
   await page.goto(base+path);await settled(`[data-register-table="${id}"]`);
   await page.evaluate(field=>{const url=new URL(location.href);url.searchParams.set(field,'fixture');history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate'));},field);
   await page.waitForFunction(()=>document.querySelector('meta[name="robots"]')?.content.includes('noindex'));
   await settled(`[data-register-table="${id}"]`);
   assert.ok((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'),'filtered popstate is noindex without SSR metadata');
  }
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
 const auditCatalogue=await page.evaluate(()=>fetch('/api/table/audit-reports').then(r=>r.json()));assert.equal(auditCatalogue.total,296,'all institutional reports are restored');
 assert.equal(await auditHost.locator('.dt-count').textContent(),`Showing 1–50 of ${auditCatalogue.total}`,'legacy Clear all restores the complete privacy-approved catalogue');
 // Match the UI's year range predicates to the loaded D1 API, including real CSV.
 for(const [path,key,id,dataset] of [['/instruments','instruments','instruments-table','instruments'],['/audit','audit','audit-table','audit-reports']]){
  const metadata=await page.evaluate(async dataset=>fetch('/api/table/'+dataset).then(r=>r.json()),dataset);
  assert.ok(metadata.facets.year.min && metadata.facets.year.max,'D1 has a year range facet');
  const year=metadata.facets.year.max,params=new URLSearchParams({'f.year':JSON.stringify({min:year,max:year})});
  const filtered=await page.evaluate(async ({dataset,query})=>{const r=await fetch('/api/table/'+dataset+'?'+query);return {status:r.status,page:await r.json()};},{dataset,query:params.toString()});
  assert.equal(filtered.status,200,'D1 accepts the API year predicate');assert.ok(filtered.page.total>0);
  await page.goto(base+path+'?year='+year);await settled(`[data-register-table="${id}"]`);
  const host=page.locator(`[data-register-table="${id}"]`);
  const total=Number((await host.locator('.dt-count').textContent()).split(' of ')[1].replaceAll(',',''));
  assert.equal(total,filtered.page.total,'legacy year links preserve the API predicate');
  assert.equal(new URL(page.url()).searchParams.get(key+'.f.year'),JSON.stringify({min:year,max:year}));
  const download=page.waitForEvent('download');await host.locator('[data-export]').click();
  const csv=await readFile(await (await download).path(),'utf8');if(dataset==='instruments')assert.ok(privacyIndex.safeRows(csv),'filtered real CSV is private');
  if(dataset==='instruments')assert.ok(csv.split('\r\n')[0].includes('Registered'),'filtered D1 CSV includes Registered');
  await host.getByRole('button',{name:'Clear all',exact:true}).click();await settled(`[data-register-table="${id}"]`);
  const full=Number((await host.locator('.dt-count').textContent()).split(' of ')[1].replaceAll(',',''));
  assert.equal(full,metadata.total,'Clear all restores the loaded catalogue');
 }
 assert.equal(errors.length,0,'browser script error count');
 const result={server:'wrangler dev --local',core:'merged main',screenshots:initialOnly?0:2*(selectedTables?.length||4),viewports:initialOnly?[1280]:[390,1280],privacy,initialRangeCases,robotsRejectedCases,robotsFilteredCases,pageErrors:errors.length,blockedExternalRequests:blocked.length,checks:initialOnly?['initial upper and lower numeric bounds','SSR and hydrated rejection','URL, DOM and accessible text','disabled CSV','analytics']:['rows and facets','actual CSV download','URL and initial SSR state','rendered and accessible text','analytics','neutral aggregate','column-wide bar scale across pages','server dates and pagination','viewport fit']};
 const resultName=initialOnly?'round5-initial-range-results.json':selectedTables?`round5-${selectedTables.join('-')}-browser-results.json`:'round5-browser-results.json';
 await writeFile(resolve(outputDir,resultName),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 await browser?.close();dev.kill('SIGTERM');await Promise.race([new Promise(done=>dev.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);if(dev.exitCode == null && dev.signalCode == null)dev.kill('SIGKILL');await writeFile(resolve(outputDir,'round5-wrangler-dev.log'),JSON.stringify({diagnosticBytes:devLog,exitCode:dev.exitCode,signal:dev.signalCode,lines:devMessages.split('\n').filter(Boolean).slice(-200).map(line=>privacyIndex.safe(line) && !/(?:\d[\s-]*){11}/.test(line) ? line : '[withheld diagnostic suppressed]')})+'\n');
}
