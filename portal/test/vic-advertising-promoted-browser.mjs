/** Verify an already-running local Wrangler against the real promoted asset. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const base=new URL(process.env.OPAX_ADVERTISING_LOCAL_URL||'http://127.0.0.1:8990');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&Number(base.port)>=8990,'Local Wrangler on port 8990+ required');
const {chromium}=createRequire(process.env.OPAX_BROWSER_TOOLS||'/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright-core');
const out=resolve(root,'portal/private/vic-advertising');await mkdir(out,{recursive:true});
const bytes=await readFile(resolve(root,'portal/public/gov-advertising/data.json')),hub=JSON.parse(bytes);
assert.equal(hub.promotion.reviewed_commit,'961e07ac91cf5fc9ba21c5f6588f96170f715886');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],errors=[];
const safeRoute=route=>{
 const url=new URL(route.request().url());
 return url.origin===base.origin&&!/^\/(?:api|ask|chat|auth|voice|generate|ingest|mcp)(?:\/|$)/.test(url.pathname)?route.continue():route.abort();
};
const geometry=page=>page.evaluate(()=>{
 const table=document.getElementById('gov-advertising-table'),container=table.closest('.dt-scroll'),bounds=container.getBoundingClientRect();
 const amounts=[...table.querySelectorAll('tbody td[data-label="Reported expenditure (AUD)"]')];
 return {containerWidth:container.clientWidth,containerScrollWidth:container.scrollWidth,tableWidth:table.getBoundingClientRect().width,amountCells:amounts.length,
  amountsInsideContainer:amounts.every(cell=>{const r=cell.getBoundingClientRect();return r.width>0&&r.left>=bounds.left-1&&r.right<=bounds.right+1;})};
});
const phone=g=>{assert.ok(g.tableWidth<=g.containerWidth+1);assert.ok(g.containerScrollWidth<=g.containerWidth+1);assert.ok(g.amountCells>0&&g.amountsInsideContainer)};
try{
 const context=await browser.newContext({acceptDownloads:true});await context.route('**/*',safeRoute);
 const served=await context.request.get(base.origin+'/gov-advertising/data.json');assert.equal(served.status(),200);assert.ok((await served.body()).equals(bytes));
 const readiness=await(await context.request.get(base.origin+'/gov-advertising/ready.json')).json();assert.deepEqual(readiness,{ready:true,count:hub.rows.length});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base.origin+'/register/gov-advertising');assert.equal(response.status(),200);
  await page.waitForSelector('[data-datatable]');await page.waitForFunction(()=>!document.querySelector('[data-register-config]'));
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(!/Local staged preview|pending review; not promoted/.test(await page.locator('main').textContent()));
  assert.equal(JSON.parse(await page.locator('[data-dt-page]').textContent()).total,hub.rows.length);
  const menu=page.locator('#primary-nav a[href="/register/gov-advertising"]');assert.equal(await menu.count(),1);
  assert.equal((await menu.locator('xpath=ancestor::div[contains(@class,"nav-col")]').locator('.nav-col-h').textContent()).trim(),'Public money');
  if(width===1440){await page.locator('#primary-nav [data-nav-trigger="money"]').click();assert.equal(await menu.isVisible(),true);await page.keyboard.press('Escape')}
  else{await page.locator('#nav-open').click();const link=page.locator('#nav-drawer a[href="/register/gov-advertising"]');assert.equal(await link.count(),1);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('nav-drawer').open)}
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  const table=await geometry(page);if(width===390)phone(table);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`advertising-${width}-top.png`)});
  await page.evaluate(()=>scrollTo(0,scrollY+document.querySelector('.dt-scroll').getBoundingClientRect().top-160));
  await page.screenshot({path:resolve(out,`advertising-${width}-table.png`)});
  results.push({width,status:response.status(),horizontalOverflow:overflow,table,rows:hub.rows.length,publicMoneyLink:true,stagedBanner:false});
 }
 await page.locator('[data-search]').fill('campaign cost');await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total===990);
 const download=page.waitForEvent('download');await page.locator('[data-export]').click();const csv=await readFile(await(await download).path(),'utf8');assert.ok(csv.includes('Document SHA-256'));assert.ok(csv.includes('$ (excluding GST)'));
 const staticContext=await browser.newContext({javaScriptEnabled:false});await staticContext.route('**/*',safeRoute);
 const staticPage=await staticContext.newPage();await staticPage.setViewportSize({width:390,height:1000});assert.equal((await staticPage.goto(base.origin+'/register/gov-advertising')).status(),200);
 assert.equal(await staticPage.locator('[data-datatable] tbody tr').count(),25);const staticPhoneTable=await geometry(staticPage);phone(staticPhoneTable);await staticContext.close();
 assert.deepEqual(errors,[]);
 const receipt={preview:'Actual local Wrangler, promoted public asset; deploy pending; no staged injection or preview banner',base:base.origin,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,readiness,results,csv:true,search:{before:hub.rows.length,after:990},javaScriptDisabled:true,staticPhoneTable,pageErrors:errors};
 await writeFile(resolve(out,'promoted-browser-results.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser.close()}
