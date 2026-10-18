/** Offline actual-Worker preview. Source data is held; fixture shots are labelled. */
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(root,'portal/package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {chromium}=createRequire(process.env.OPAX_BROWSER_TOOLS || '/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/package.json')('playwright-core');
const bundle=await build({entryPoints:[resolve(root,'portal/src/index.ts')],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'no-images',setup(b){
 b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'preview'}));
 b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));
}}]});
const scratch=await mkdtemp(resolve(tmpdir(),'opax-gov-advertising-')),previous=process.cwd();
const out=resolve(root,'portal/private/gov-advertising');await mkdir(out,{recursive:true});
const fixture=await readFile(resolve(root,'portal/test/fixtures/gov-advertising.json'));
let fixtureMode=false,browser;
process.chdir(scratch);
const mime=p=>p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.woff2')?'font/woff2':'text/html';
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],script:bundle.outputFiles[0].text,
 outboundService:async()=>{throw Error('External network disabled');},
 serviceBindings:{ASSETS:async req=>{
  const path=new URL(req.url).pathname;
  if(path==='/gov-advertising/data.json')return new Response(fixtureMode?fixture:null,{status:fixtureMode?200:404,headers:{'content-type':'application/json'}});
  if(path==='/agencies.json')return Response.json({agencies:[{id:'a-aaaaaaaaaaaaaaaaaaaa',name:'Department of Example Services',total:0,count:0,supplier_count:0}]});
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
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 for(const mode of ['page','fixture']){
  fixtureMode=mode==='fixture';
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/gov-advertising');assert.equal(response.status(),200);
   await page.waitForSelector('[data-datatable]');await page.waitForTimeout(150);
   if(fixtureMode){await page.evaluate(()=>{const label=document.createElement('p');label.textContent='Synthetic fixture preview — no official campaign data';label.style.fontWeight='bold';document.querySelector('main').prepend(label);});assert.match(await page.locator('main').textContent(),/row sum \$400\.00/);}
   else{assert.match(await page.locator('main').textContent(),/Source verification pending/);assert.ok(await page.locator('meta[name="robots"][content="noindex"]').count()>0);}
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
   await page.screenshot({path:resolve(out,`${mode}-${width}.png`)});await page.screenshot({path:resolve(out,`${mode}-${width}-full.png`),fullPage:true});
   results.push({mode,width,status:response.status(),horizontalOverflow:overflow});
  }
 }
 const search=page.locator('[data-search]');await search.fill('awareness');await page.waitForTimeout(450);assert.equal(await page.locator('[data-datatable] tbody tr').count(),1);
 const download=page.waitForEvent('download');await page.locator('[data-export]').click();const csv=await download;await csv.saveAs(resolve(out,'fixture-filtered.csv'));
 assert.match(await readFile(resolve(out,'fixture-filtered.csv'),'utf8'),/Example service awareness/);
 const staticContext=await browser.newContext({javaScriptEnabled:false});await staticContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const staticPage=await staticContext.newPage();assert.equal((await staticPage.goto(base+'/register/gov-advertising')).status(),200);assert.equal(await staticPage.locator('[data-datatable] tbody tr').count(),2);
 assert.equal(await staticPage.locator('tbody a[href="/subject/agency/a-aaaaaaaaaaaaaaaaaaaa"]').count(),1);
 assert.equal((await staticPage.goto(base+'/register/gov-advertising?advertising.q=a&advertising.q=b')).status(),400);
 assert.equal((await staticPage.goto(base+'/register/gov-advertising/')).status(),200);assert.equal(await staticPage.locator('[data-datatable] tbody tr').count(),2);
 assert.deepEqual(errors,[]);
 const receipt={preview:'Local Worker only; official source held; synthetic fixture is separate; no external network or production bindings',results,javaScriptDisabled:true,search:true,csv:true,exactAgencyLink:true,pageErrors:errors};
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{
 await browser?.close();await new Promise(done=>server.close(done));await mf.dispose();process.chdir(previous);await rm(scratch,{recursive:true,force:true});
}
