/** Programs & places starting card in a real browser, offline, on fixture
 *  evidence (invented names). 1440: the card fills the detail column, stays in
 *  view under the masthead while the list scrolls, and nothing overflows; a
 *  quick pick opens its connection and focus lands on its heading. 390: the
 *  phone shows the list alone, as before. Writes before (origin/main's
 *  connections.js, app.js and style.css) and after shots to
 *  portal/private/connections-empty/. */
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(root,'portal/package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {chromium}=createRequire(process.env.OPAX_BROWSER_TOOLS || '/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/package.json')('playwright-core');
const bundle=await build({entryPoints:[resolve(root,'portal/src/index.ts')],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],logLevel:'silent',plugins:[{name:'no-images',setup(b){
 b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'preview'}));
 b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));
}}]});
const scratch=await mkdtemp(resolve(tmpdir(),'opax-connections-empty-')),previous=process.cwd();
const out=resolve(root,'portal/private/connections-empty');await mkdir(out,{recursive:true});

// Invented connections, most-recorded first; enough rows that the list outruns a 1440 viewport.
const WORDS=['Harbour','Ridge','Valley','Freight','Coastal','Rail','Water','Schools','Bushfire','Roads','Health','Ports'];
const KINDS=['program','organisation','electorate','place'];
const ENTITIES=Array.from({length:60},(_,i)=>({
 id:(i%3===0?'aa':i%3===1?'bb':'cc')+String(i).padStart(22,'0'),
 name:`Example ${WORDS[i%WORDS.length]} ${['Program','Co','Division','Area'][i%4]} ${i+1}`,
 kind:KINDS[i%4],records:900-i*13,
}));
const recordOf=e=>({id:e.id,records:e.records,kind:e.kind,years:{2021:4,2022:9,2023:6,2024:12,2025:8},excerpts:[
 {source_kind:'Speech',date:'2025-03-12',text:`A fixture excerpt naming ${e.name}.`,matched_text:e.name,source_id:'fixture-1',start:20,end:20+e.name.length},
 {source_kind:'Official release',date:'2024-11-02',text:`A second fixture excerpt about ${e.name}.`,matched_text:e.name,source_id:'fixture-2',start:27,end:27+e.name.length},
]});
const evidence=path=>{
 if(path==='/evidence/index.json')return {entities:ENTITIES};
 const shard=path.match(/^\/evidence\/([a-f0-9]{2})\.json$/)?.[1];
 return shard?{entries:Object.fromEntries(ENTITIES.filter(e=>e.id.startsWith(shard)).map(e=>[e.id,recordOf(e)]))}:null;
};
// "before": the three files this lane changes, as origin/main has them.
const BEFORE=['connections.js','app.js','style.css'];
const beforeFiles=Object.fromEntries(BEFORE.map(f=>[f,execFileSync('git',['-C',root,'show',`origin/main:portal/public/${f}`],{maxBuffer:64<<20})]));
let mode='after',browser;
process.chdir(scratch);
const mime=p=>p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'text/html';
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],script:bundle.outputFiles[0].text,
 outboundService:async()=>{throw Error('External network disabled');},
 serviceBindings:{ASSETS:async req=>{
  const path=new URL(req.url).pathname;
  if(path.startsWith('/evidence/')){const body=evidence(path);return body?Response.json(body):new Response('',{status:404});}
  const name=path.slice(1);
  if(mode==='before' && beforeFiles[name])return new Response(beforeFiles[name],{headers:{'content-type':mime(path)}});
  const file=resolve(root,'portal/public',path==='/'?'index.html':'.'+path);
  if(!file.startsWith(resolve(root,'portal/public')+'/'))return new Response('',{status:404});
  try{return new Response(await readFile(file),{headers:{'content-type':mime(path)}});}catch{return new Response('',{status:404});}
 }},bindings:{INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true'}}));
const server=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/api/')){res.writeHead(404);res.end('{}');return;}
  const response=await mf.dispatchFetch('https://opax.com.au'+req.url);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local preview unavailable');}
});
try{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:process.env.OPAX_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const results=[],errors=[];
 const open=async(width)=>{
  const context=await browser.newContext({viewport:{width,height:width>700?1000:844},deviceScaleFactor:2});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(`${mode} ${width}: ${e.message}`));
  assert.equal((await page.goto(base+'/connections')).status(),200);
  await page.waitForSelector('#connection-list .connection-choice');
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
  return {context,page};
 };
 const overflowing=page=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);

 for(mode of ['before','after']){
  for(const width of [1440,390]){
   const {context,page}=await open(width);
   if(mode==='after')await page.waitForSelector('.connection-detail-art .wb-wrap',{state:'attached'});
   await page.screenshot({path:resolve(out,`${mode}-${width}.png`)});
   const overflow=await overflowing(page);assert.equal(overflow,false,`${mode} ${width} overflows sideways`);
   const result={mode,width,horizontalOverflow:overflow};
   if(mode==='after' && width===1440){
    const card=page.locator('#connection-detail > .connection-detail-empty');
    assert.ok(await card.isVisible(),'the starting card shows beside the list');
    assert.equal(await card.locator('h2').textContent(),'Pick a connection');
    assert.deepEqual(await card.locator('.connection-picks > button').allTextContents(),ENTITIES.slice(0,3).map(e=>e.name));
    const fit=await page.evaluate(()=>{
     const column=document.getElementById('connection-detail').getBoundingClientRect(),card=document.querySelector('.connection-detail-empty').getBoundingClientRect();
     const inside=[...document.querySelectorAll('.connection-detail-empty *')].every(el=>{const r=el.getBoundingClientRect();return r.width===0 || (r.left>=card.left-0.5 && r.right<=card.right+0.5);});
     return {fills:Math.abs(card.width-column.width)<1,inside,still:!!document.querySelector('.connection-detail-art .wb-wrap.wb-still'),label:getComputedStyle(document.querySelector('.connection-detail-art .wb-label')).display};
    });
    assert.ok(fit.fills,'the card fills the detail column');assert.ok(fit.inside,'nothing spills out of the card');
    assert.ok(fit.still,'the animal stands still');assert.equal(fit.label,'none');
    // Sticky: scroll the list well past the card's first place; the card stays under the masthead.
    const start=await card.boundingBox();
    await page.mouse.wheel(0,1400);await page.waitForTimeout(300);
    const held=await page.evaluate(()=>{
     const header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')),card=document.querySelector('.connection-detail-empty').getBoundingClientRect();
     return {scrollY,top:card.top,header,position:getComputedStyle(document.getElementById('connection-detail')).position};
    });
    assert.ok(held.scrollY>1000,'the page scrolled');
    assert.equal(held.position,'sticky');
    assert.ok(Math.abs(held.top-(held.header+16))<2,`the card holds under the masthead (top ${held.top}, header ${held.header})`);
    assert.equal(await overflowing(page),false);
    await page.screenshot({path:resolve(out,'after-1440-scrolled.png')});
    // A quick pick opens its connection as its row does; focus lands on the heading; the card is gone.
    await page.evaluate(()=>scrollTo(0,0));
    await page.locator('.connection-picks > button').nth(1).click();
    await page.waitForSelector('#connection-detail > h2');
    const picked=await page.evaluate(()=>({heading:document.querySelector('#connection-detail > h2').textContent,focused:document.activeElement===document.querySelector('#connection-detail > h2'),card:!!document.querySelector('.connection-detail-empty'),current:document.querySelector('.connection-choice[aria-current="true"]')?.dataset.entity,position:getComputedStyle(document.getElementById('connection-detail')).position,address:location.search}));
    assert.deepEqual({heading:picked.heading,focused:picked.focused,card:picked.card,current:picked.current,position:picked.position},{heading:ENTITIES[1].name,focused:true,card:false,current:ENTITIES[1].id,position:'static'});
    assert.match(picked.address,new RegExp(`entity=${ENTITIES[1].id}`));
    await page.screenshot({path:resolve(out,'after-1440-picked.png')});
    Object.assign(result,{fillsColumn:fit.fills,stickyTop:held.top,headerHeight:held.header,pickedFocus:picked.focused});
   }
   if(mode==='after' && width===390){
    // The phone keeps the list alone until a pick: no card above or below it.
    assert.equal(await page.locator('.connection-detail-empty').isVisible(),false,'no starting card on a phone');
    assert.ok(await page.locator('#connection-list').isVisible());
    await page.locator('.connection-choice').first().click();
    await page.waitForSelector('#connection-detail > h2');
    assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#connection-detail > h2')),true,'a row pick on a phone moves focus to the heading');
    assert.equal(await overflowing(page),false);
    Object.assign(result,{cardShown:false,pickedFocus:true});
   }
   results.push(result);
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
 const receipt={preview:'Local Worker only; fixture evidence with invented names; no external network or production bindings',results,pageErrors:errors};
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{
 await browser?.close();await new Promise(done=>server.close(done));await mf.dispose();process.chdir(previous);await rm(scratch,{recursive:true,force:true});
}
