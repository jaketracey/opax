/** Local candidate only. The real staged approval and public asset stay untouched. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const repository=fileURLToPath(new URL('../../',import.meta.url));
const fixture=JSON.parse(execFileSync('python3',['-m','scripts.abs_gfs.function_preview'],{cwd:repository,encoding:'utf8'}));
assert.equal(fixture.test_only,true);
process.env.OPAX_GFS_PREVIEW_ASSET=fixture.path;
process.env.OPAX_GFS_PORT='0';
const {root,port,close}=await import('../../scripts/abs_gfs/preview.mjs');
const toolRoot=process.env.OPAX_GFS_BROWSER_TOOLS||resolve(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node');
const {chromium}=createRequire(resolve(toolRoot,'package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.OPAX_GFS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=`http://[::1]:${port}`,results=[],errors=[],output=resolve(root,'portal/private/abs-gfs-function');
const geometry=(page,id)=>page.evaluate(id=>{
 const table=document.getElementById(id),container=table.closest('.dt-scroll'),bounds=container.getBoundingClientRect();
 const amounts=[...table.querySelectorAll('tbody td[data-label="Amount (AUD)"]')];
 return {containerWidth:container.clientWidth,containerScrollWidth:container.scrollWidth,
  tableWidth:table.getBoundingClientRect().width,tableScrollWidth:table.scrollWidth,
  amountCells:amounts.length,amountsInsideContainer:amounts.every(cell=>{const r=cell.getBoundingClientRect();return r.width>0 && r.left>=bounds.left-1 && r.right<=bounds.right+1;})};
},id);
function fits(g){assert.ok(g.tableWidth<=g.containerWidth+1 && g.containerScrollWidth<=g.containerWidth+1 && g.tableScrollWidth<=g.containerWidth+1,JSON.stringify(g));assert.ok(g.amountCells>0 && g.amountsInsideContainer,JSON.stringify(g));}
async function context(options={}){
 const c=await browser.newContext(options);
 await c.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 return c;
}
const total=(page,id)=>page.locator(`[data-register-table="${id}"] [data-dt-page]`).textContent().then(t=>JSON.parse(t).total);
try{
 const c=await context(),page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
 const asset=await c.request.get(base+'/government-finance/data.json');assert.equal(asset.status(),200);
 assert.ok((await asset.body()).equals(await readFile(fixture.path)));
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/government-finance');assert.equal(response.status(),200);
  await page.waitForSelector('#government-function-table tbody tr');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const core=await geometry(page,'government-finance-table'),functions=await geometry(page,'government-function-table');
  if(width===390){fits(core);fits(functions);}
  assert.equal(await page.locator('.gfs-function-jurisdiction').count(),9);
  const headings=await page.locator('.gfs-function-jurisdiction h3').allTextContents();
  assert.equal(headings[0],'Total state governments');
  assert.deepEqual(headings,await page.locator('.gfs-jurisdiction h3').allTextContents());
  await page.screenshot({path:resolve(output,`government-finance-${width}-top.png`)});
  await page.evaluate(()=>{const h=document.getElementById('gfs-functions');scrollTo(0,scrollY+h.getBoundingClientRect().top-96);});
  await page.screenshot({path:resolve(output,`government-finance-${width}-functions.png`)});
  await page.evaluate(()=>{const h=document.getElementById('gfs-function-series');scrollTo(0,scrollY+h.getBoundingClientRect().top-96);});
  await page.screenshot({path:resolve(output,`government-finance-${width}-function-table.png`)});
  results.push({width,status:response.status(),pageOverflow:false,core,functions,headings,headlineGroups:await page.locator('.gfs-jurisdiction').count(),functionGroups:await page.locator('.gfs-function-jurisdiction').count(),coreRows:await total(page,'government-finance-table'),functionRows:await total(page,'government-function-table')});
 }
 const table=page.locator('[data-register-table="government-function-table"]'),before=await total(page,'government-function-table');
 await table.locator('[data-search]').fill('Hospital');
 await page.waitForFunction(before=>JSON.parse(document.querySelector('[data-register-table="government-function-table"] [data-dt-page]').textContent).total<before,before);
 const after=await total(page,'government-function-table');assert.ok(after>0);assert.equal(await total(page,'government-finance-table'),451);
 const download=page.waitForEvent('download');await table.locator('[data-export]').click();const csv=await readFile(await(await download).path(),'utf8');
 for(const field of ['SHA-256','Snapshot','Published value (AUD million)','Division code as published','Group code as published','Hospital services'])assert.ok(csv.includes(field),field);
 await page.selectOption('[name="jurisdiction"]','New South Wales');await page.locator('.gfs-filters button').click();await page.waitForURL(/jurisdiction=New\+South\+Wales/);
 assert.equal(await page.locator('.gfs-function-jurisdiction h3').textContent(),'New South Wales');
 await page.selectOption('[name="level"]','Commonwealth');await page.locator('.gfs-filters button').click();await page.waitForURL(/level=Commonwealth/);
 assert.equal(await page.locator('[name="jurisdiction"]').inputValue(),'Australia');assert.equal(await page.locator('.gfs-function-jurisdiction').count(),1);
 const staticContext=await context({javaScriptEnabled:false}),staticPage=await staticContext.newPage();await staticPage.setViewportSize({width:390,height:1000});
 await staticPage.goto(base+'/register/government-finance');
 assert.equal(await staticPage.locator('.gfs-function-jurisdiction').count(),9);assert.equal(await staticPage.locator('#government-function-table tbody tr').count(),25);
 const staticFunctions=await geometry(staticPage,'government-function-table');fits(staticFunctions);
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'browser-results.json'),JSON.stringify({preview:'Local Worker; test-only promoter fixture; external browser requests blocked; real approval/public asset unchanged',fixture:{...fixture,path:relative(root,fixture.path)},results,search:{before,after},csvReceipts:true,ssr:true,staticFunctions,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify({results,search:{before,after},ssr:true,csvReceipts:true}));
 await staticContext.close();await c.close();
}finally{await browser.close();await close();}
