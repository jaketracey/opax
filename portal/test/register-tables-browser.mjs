// Offline screenshots and interaction checks. OPAX_DT_CORE_DIR optionally previews
// the frozen interface against DT-core before that lane is merged.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {offline,loadWorker} from './worker-harness.mjs';
import {personIndex} from '../src/person-slug.ts';
import {partyUrl} from '../public/canonical-urls.js';
import {isOrganisationDonor,MONEY_GRAPHS,donorPrivacyIndex,donorNameWithheld} from '../public/donor-entity.js';
const {chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const pub=fileURLToPath(new URL('../public/',import.meta.url)).replace(/\/$/,''),output=fileURLToPath(new URL('../private/dt-registers/',import.meta.url));
const core=process.env.OPAX_DT_CORE_DIR && resolve(process.env.OPAX_DT_CORE_DIR);
const json=file=>JSON.parse(readFileSync(resolve(pub,file),'utf8'));
const people=json('parliamentarians.json').people,index=json('interests/index.json');
const member=people.find(p=>p.pid && !p.speech_scope && index.people[p.pid] && existsSync(resolve(pub,`interests/${p.pid}.json`)));
const graph=json('graph/money.json'),totals=new Map();
for(const e of graph.edges)if(!e.flow && !e.grant)totals.set(e.target,(totals.get(e.target)||0)+e.total);
const party=graph.nodes.find(n=>n.id===[...totals].sort((a,b)=>b[1]-a[1])[0][0]);
const privacy=donorPrivacyIndex(MONEY_GRAPHS.map(path=>json(path.slice(1))));
const withheld=graph.nodes.find(n=>n.kind === 'donor' && !isOrganisationDonor(n) && donorNameWithheld(privacy,n.label) && /\S\s+\S/.test(n.label));
mkdirSync(output,{recursive:true});offline();
const plugins=core ? [{name:'preview-dt-core',setup(b){b.onResolve({filter:/(?:^|\/)datatable\.js(?:\?.*)?$/},()=>({path:resolve(core,'datatable.js')}));}}] : [];
const {fetch:worker}=await loadWorker(resolve(pub,'../src/index.ts'),pub,{plugins});
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.html':'text/html'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/') && !['/api/table/instruments','/api/person-slugs'].includes(url.pathname)){
   res.writeHead(200,{'content-type':'application/json'});res.end('{"results":[],"topics":[],"people":[]}');return;
  }
  const file=core && ['/datatable.js','/datatable.css'].includes(url.pathname) ? resolve(core,url.pathname.slice(1)) : resolve(pub,'.'+url.pathname);
  if(types[extname(file)] && existsSync(file) && (file.startsWith(pub+'/') || core && file.startsWith(core+'/'))){res.writeHead(200,{'content-type':types[extname(file)]});res.end(readFileSync(file));return;}
  const response=await worker(url.pathname+url.search);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Offline preview unavailable');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;const errors=[],blocked=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin === base)return route.continue();blocked.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const [name,path,selector] of [['instruments','/instruments','#instruments-table'],['audit','/audit','#audit-table'],['interests',`/subject/person/${personIndex(people).slugOf.get(member.name)}`,'#interests-table'],['party-money',partyUrl(party.label),'#party-money-table']]){
   await page.goto(base+path,{waitUntil:'networkidle'});await page.locator(selector).waitFor();
   const host=page.locator('[data-register-table]').filter({has:page.locator(selector)});
   await host.locator('[data-search]').waitFor();
   await page.evaluate(selector=>{
    const table=document.querySelector(selector),heading=selector === '#interests-table' ? document.querySelector('#person-register') : selector === '#party-money-table' ? document.querySelector('#entry-flows') : document.querySelector('#prerender');
    window.scrollTo(0,(heading || table).getBoundingClientRect().top+window.scrollY-110);
   },selector);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),`${name} ${width}: fits the viewport`);
   await page.screenshot({path:resolve(output,`after-${name}-${width}.png`)});console.log(`after-${name}-${width}.png`);
   const download=page.waitForEvent('download',{timeout:30000});await host.locator('[data-export]').click();
   const csv=readFileSync(await (await download).path(),'utf8');assert.ok(csv.includes(name === 'interests' ? 'Category,Item,Date' : name === 'party-money' ? 'Donor,Industry,Given' : 'Title,'),`${name}: CSV headers`);
   if(name === 'instruments'){
    if(width < 600)await host.locator('[data-sort-select]').selectOption('registered:desc');
    else await host.locator('[data-sort="registered"]').click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('instruments.sort')?.startsWith('registered:'));
    await host.locator('[data-page="2"]').click();
    await page.waitForFunction(()=>document.querySelector('.dt-count')?.textContent.startsWith('Showing 51–100'));
   }
   if(name === 'instruments' || name === 'audit'){
    await host.locator('[data-search]').fill('No matching register fixture');
    await page.waitForFunction(()=>document.querySelector('.dt-count')?.textContent === 'Showing 0–0 of 0');
   }else{
    const key=name === 'interests' ? 'interests' : 'partyMoney';
    await host.locator('[data-search]').fill(withheld.label);await page.waitForTimeout(300);
    assert.ok(!decodeURIComponent(new URL(page.url()).search).includes(withheld.label),`${name}: withheld URL search removed`);
    assert.ok((await host.locator('.dt-count').textContent()).includes('0–0 of 0'),`${name}: withheld search has no rows`);
    const emptyDownload=page.waitForEvent('download');await host.locator('[data-export]').click();assert.ok(!readFileSync(await (await emptyDownload).path(),'utf8').includes(withheld.label),`${name}: withheld CSV search`);
    await host.locator('[data-clear]').click();
    await page.goto(base+path+'?'+new URLSearchParams({[key+'.q']:withheld.label}),{waitUntil:'networkidle'});await page.locator(selector).waitFor();
    assert.ok(!decodeURIComponent(new URL(page.url()).search).includes(withheld.label),`${name}: initial URL search removed`);
   }
  }
  await context.close();
 }
 assert.equal(errors.length,0,'browser script error count');console.log(`Browser checks passed at 390 and 1280; ${blocked.length} non-local requests blocked.`);
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
