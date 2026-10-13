// Run in an isolated network namespace. Graphs and APIs are local fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {createRequire} from 'node:module';

const pub=resolve('public'),output=resolve('private/dt-money');
const {chromium}=createRequire(resolve(process.env.DT_BROWSER_TOOLS || join(output,'browser-tools'),'package.json'))('playwright-core');
await mkdir(output,{recursive:true});
const graph=jur=>{
  const total=jur==='qld'?2000000:1000000,figures={total,count:1,firstYear:2023,lastYear:2023,byYear:{2023:[total,1]}};
  return {meta:{jurisdiction:jur,commission:'Fixture commission',sourceShort:'Fixture register',coverage:'2023',licence:'Fixture licence'},
    nodes:[{id:'agency:fixture',kind:'grantor',flow:'contracts',label:'Public fixture authority',group:'public money',industry:'public money',...figures},
      {id:'supplier:fixture',kind:'supplier',label:'Public fixture organisation Pty Ltd',group:'services',industry:'services',...figures}],
    edges:[{source:'agency:fixture',target:'supplier:fixture',...figures}]};
};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const json=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(/^\/graph\/money(?:\.qld)?\.json$/.test(url.pathname))return json(graph(url.pathname.includes('.qld.')?'qld':'federal'));
    // The fixture contains only invented organisation labels. This test checks
    // setup ownership; the shared registry/privacy suites check the policy.
    if(url.pathname==='/api/table/privacy')return json({safe:true});
    if(url.pathname.startsWith('/api/'))return json({});
    const path=extname(url.pathname)?url.pathname:'/index.html',file=resolve(pub,'.'+path);
    assert.ok(file.startsWith(pub+'/'));
    res.writeHead(200,{'content-type':types[extname(file)] || 'application/octet-stream'});res.end(await readFile(file));
  } catch {res.writeHead(404);res.end('Local fixture unavailable');}
});
let browser;
try {
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base='http://127.0.0.1:'+server.address().port,errors=[],external=[];
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(external.push('external'),route.abort()));
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>errors.push('page error'));
  let release,started,delayed=false;
  const released=new Promise(done=>{release=done}),validationStarted=new Promise(done=>{started=done});
  await page.route('**/api/table/privacy',async route=>{
    if(!delayed && route.request().postDataJSON()?.text.includes('public fixture')){delayed=true;started();await released;}
    await route.continue();
  });
  await page.goto(base+'/money?q=public+fixture');await validationStarted;
  await page.locator('#money-jur select').selectOption('qld');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('jur')==='qld' && document.querySelector('#money-map-root.mm-root :is(canvas,.mm-connections)'));
  await page.evaluate(()=>{window.newerMap=document.querySelector('#money-map-root :is(canvas,.mm-connections)');});
  const newerURL=page.url(),fineprint=await page.locator('#money-fineprint').innerHTML();
  release();await page.waitForLoadState('networkidle');
  assert.equal(page.url(),newerURL);
  assert.equal(new URL(page.url()).searchParams.get('jur'),'qld');
  assert.equal(await page.locator('#money-jur select').inputValue(),'qld');
  assert.equal(await page.locator('#money-fineprint').innerHTML(),fineprint);
  assert.equal(await page.evaluate(()=>document.querySelector('#money-map-root').classList.contains('mm-root') && document.querySelector('#money-map-root :is(canvas,.mm-connections)')===window.newerMap),true);
  assert.equal(await page.locator('.research-controls [name="query"]').inputValue(),'public fixture');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const result={delayedJurisdiction:'federal',currentJurisdiction:'qld',urlPreserved:true,activeMapPreserved:true,controlsPreserved:true,pageErrors:0,externalRequests:0};
  await writeFile(join(output,'lifecycle-browser-round4.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {await browser?.close();await new Promise(done=>server.close(done));}
