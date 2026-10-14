/** Actual local Worker/browser receipts; public assets, no external requests. */
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(resolve(root,'portal/package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {chromium}=createRequire(resolve(process.env.OPAX_HUB_BROWSER_TOOLS||'/tmp/opax-dt-tools','package.json'))('playwright-core');
const code=await build({entryPoints:[resolve(root,'portal/src/index.ts')],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'no-images',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'preview'}));b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
const scratch=await mkdtemp(resolve(tmpdir(),'opax-state-bills-browser-')),previous=process.cwd();process.chdir(scratch);
const mime=p=>p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.woff2')?'font/woff2':'text/html';
const mf=new Miniflare(convertV4MiniflareOptions({host:'::1',modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],script:code.outputFiles[0].text,
 outboundService:async()=>{throw Error('External network disabled')},serviceBindings:{ASSETS:async req=>{
  const path=new URL(req.url).pathname,file=resolve(root,'portal/public',path==='/'?'index.html':'.'+path);
  if(!file.startsWith(resolve(root,'portal/public')+'/'))return new Response('',{status:404});
  try{return new Response(await readFile(file),{headers:{'content-type':mime(path)}})}catch{return new Response('',{status:404})}
 }},bindings:{INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true'}}));
const server=createServer(async(req,res)=>{
 try{if(req.url.startsWith('/api/')){res.writeHead(404);res.end('{}');return}
  const response=await mf.dispatchFetch('https://opax.com.au'+req.url);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Preview unavailable')}
});
let browser;
try{
 await new Promise(done=>server.listen(0,'::1',done));const base=`http://[::1]:${server.address().port}`;
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await context.newPage(),errors=[],results=[],out=resolve(root,'docs/coverage/bills-tas-act');page.on('pageerror',e=>errors.push(e.message));await mkdir(out,{recursive:true});
 const act=JSON.parse(await readFile(resolve(root,'portal/public/bills-act/data.json'))),tas=JSON.parse(await readFile(resolve(root,'portal/public/bills-tas/data.json')));
 const routes=[['register','/register/state-bills'],['tas','/register/state-bills?jurisdiction=tas&parliament=52'],['act','/register/state-bills?jurisdiction=act&parliament=11'],['tas-detail','/register/state-bills?bill='+tas.bills[0].key],['act-detail','/register/state-bills?bill='+act.bills.find(b=>b.title==='Statute Law Amendment Bill 2025').key]];
 for(const [name,route] of routes){
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});const response=await page.goto(base+route);assert.equal(response.status(),200);await page.waitForSelector(route.includes('bill=')?'.state-bill':'[data-datatable] tbody tr');
   assert.match(await page.locator('main').textContent(),/ACT Legislative Assembly|Parliament of Tasmania/);
   if(route.includes('bill='))assert.match(await page.locator('.state-bill').textContent(),/Snapshot.*SHA-256/s);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
   await page.screenshot({path:resolve(out,`${name}-${width}.png`)});results.push({route,width,status:response.status(),horizontalOverflow:overflow});
  }
 }
 const staticContext=await browser.newContext({javaScriptEnabled:false});await staticContext.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const staticPage=await staticContext.newPage();assert.equal((await staticPage.goto(base+'/register/state-bills')).status(),200);
 await staticPage.goto(base+'/register/state-bills?jurisdiction=tas&parliament=52&q=Appropriation');
 assert.ok(await staticPage.locator('[data-datatable] tbody a[href*="bill=au-tas"]').count()>0);
 await staticPage.locator('[data-datatable] tbody a[href*="bill=au-tas"]').first().click();await staticPage.waitForURL(/bill=au-tas/);assert.match(await staticPage.locator('main').textContent(),/Versions and explanatory material/);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/register/state-bills');
 await page.locator('[data-search]').fill('COAG');await page.waitForTimeout(450);
 assert.equal(await page.locator('[data-dt-page]').evaluate(el=>JSON.parse(el.textContent).total),2);
 await page.locator('[data-sort="title"]').click();
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-export]').click();const download=await downloadPromise;
 const csv=await readFile(await download.path(),'utf8');assert.match(csv,/ACT Legislative Assembly/);assert.match(csv,/Lapsed on expiry of Assembly/);assert.match(csv,/2024-10-19/);
 await page.locator('main a[href*="bill=au-act"]').filter({hasText:'COAG Legislation Amendment Bill 2021'}).click();
 assert.match(await page.locator('.state-bill').textContent(),/2024-10-19.*Lapsed on expiry of Assembly/s);
 assert.deepEqual(errors,[]);const assets={};
 for(const j of ['tas','act']){const bytes=await readFile(resolve(root,`portal/public/bills-${j}/data.json`));assets[j]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),promotion:JSON.parse(bytes).promotion}}
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify({preview:'Local Miniflare Worker with disk-backed promoted assets; external requests disabled',results,javaScriptDisabled:true,sharedTableSearchSortCSV:true,serverFilteredNoJSDetail:true,pageErrors:errors,assets},null,2)+'\n');
 console.log(JSON.stringify({results,javaScriptDisabled:true,sharedTableSearchSortCSV:true,serverFilteredNoJSDetail:true,pageErrors:errors}));
}finally{await browser?.close();await new Promise(done=>server.close(done));await mf.dispose();process.chdir(previous);await rm(scratch,{recursive:true,force:true})}
