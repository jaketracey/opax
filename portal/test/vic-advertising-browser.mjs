import {root,port,close,holdData,staged} from '../../scripts/gov_advertising/preview.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.OPAX_BROWSER_TOOLS||'/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright-core');
if(!staged){await close();throw Error('Explicit OPAX_ADVERTISING_PREVIEW=staged required; nothing is promoted');}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=`http://[::1]:${port}`,results=[],errors=[],out=resolve(root,'portal/private/vic-advertising');
const context=await browser.newContext({acceptDownloads:true});
await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const geometry=page=>page.evaluate(()=>{
 const table=document.getElementById('gov-advertising-table'),container=table.closest('.dt-scroll'),bounds=container.getBoundingClientRect();
 const amounts=[...table.querySelectorAll('tbody td[data-label="Reported expenditure (AUD)"]')];
 return {containerWidth:container.clientWidth,containerScrollWidth:container.scrollWidth,tableWidth:table.getBoundingClientRect().width,
  amountCells:amounts.length,amountsInsideContainer:amounts.every(cell=>{const r=cell.getBoundingClientRect();return r.width>0&&r.left>=bounds.left-1&&r.right<=bounds.right+1;})};
});
const assertPhone=g=>{
 assert.ok(g.tableWidth<=g.containerWidth+1,JSON.stringify(g));assert.ok(g.containerScrollWidth<=g.containerWidth+1,JSON.stringify(g));
 assert.ok(g.amountCells>0&&g.amountsInsideContainer,JSON.stringify(g));
};
try{
 const bytes=await readFile(resolve(root,'data/staged/vic-advertising/hub.json')),hub=JSON.parse(bytes);
 const served=await context.request.get(base+'/gov-advertising/data.json');assert.equal(served.status(),200);assert.ok((await served.body()).equals(bytes));
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/gov-advertising');assert.equal(response.status(),200);
  await page.waitForSelector('[data-datatable]');await page.waitForFunction(()=>!document.querySelector('[data-register-config]'));await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{const p=document.createElement('p');p.className='wrap gov-advertising-receipt';p.textContent='Local staged preview — pending review; not promoted or live.';document.querySelector('main').prepend(p);scrollTo(0,0);});
  assert.ok(JSON.parse(await page.locator('[data-dt-page]').textContent()).rows.every(r=>r.financial_year==='2024-25'),'Hydration lost the latest-year default order');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  const table=await geometry(page);if(width===390)assertPhone(table);
  await page.screenshot({path:resolve(out,`advertising-${width}-top.png`)});
  await page.evaluate(()=>scrollTo(0,scrollY+document.querySelector('.dt-scroll').getBoundingClientRect().top-160));
  await page.screenshot({path:resolve(out,`advertising-${width}-table.png`)});
  const descriptions=await page.locator('.gov-advertising-description').allTextContents();
  const latest=hub.rows.map(r=>r.financial_year).sort().at(-1);
  const published=hub.rows.filter(r=>r.financial_year===latest&&r.record_kind==='advertiser').map(r=>r.campaign);
  assert.deepEqual(descriptions,published);
  assert.equal(await page.locator('.gov-advertising-description a').count(),0);
  results.push({width,status:response.status(),horizontalOverflow:overflow,table,rows:JSON.parse(await page.locator('[data-dt-page]').textContent()).total,sourceDescriptions:descriptions.length,personLinksInDescriptions:0});
 }
 const before=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;
 await page.locator('[data-search]').fill('campaign cost');
 await page.waitForFunction(total=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total<total,before);
 const after=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;assert.equal(after,hub.rows.filter(r=>r.record_kind==='campaign cost').length);
 const download=page.waitForEvent('download');await page.locator('[data-export]').click();const csv=await readFile(await(await download).path(),'utf8');
 for(const label of ['GST basis','Published amount','Source unit','Campaign period as published','Document SHA-256','Table SHA-256','Attribution'])assert.ok(csv.includes(label),label);
 assert.ok(!csv.includes('PRIVATE SUPPLIER SENTINEL'));assert.ok(csv.includes('$ (excluding GST)'));
 const staticContext=await browser.newContext({javaScriptEnabled:false});await staticContext.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const staticPage=await staticContext.newPage();await staticPage.setViewportSize({width:390,height:1000});
 assert.equal((await staticPage.goto(base+'/register/gov-advertising')).status(),200);assert.equal(await staticPage.locator('[data-datatable] tbody tr').count(),25);
 const staticPhoneTable=await geometry(staticPage);assertPhone(staticPhoneTable);await staticContext.close();
 assert.equal((await context.request.get(base+'/register/gov-advertising?advertising.q=a&advertising.q=b')).status(),400);
 assert.equal((await context.request.get(base+'/gov-advertising/ready.json')).status(),200);
 assert.equal((await(await context.request.get(base+'/gov-advertising/ready.json')).json()).count,hub.rows.length);
 holdData();assert.deepEqual(await(await context.request.get(base+'/gov-advertising/ready.json')).json(),{ready:false,count:0});
 assert.deepEqual(errors,[]);
 const receipt={preview:'Explicit local staged asset through actual Worker; expanded source-record text pending orchestrator review; existing public asset unchanged; no external requests or production bindings',sha256:createHash('sha256').update(bytes).digest('hex'),results,search:{before,after},csv:true,javaScriptDisabled:true,staticPhoneTable,emptyReadinessWithoutAsset:true,pageErrors:errors};
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser.close();await close();}
