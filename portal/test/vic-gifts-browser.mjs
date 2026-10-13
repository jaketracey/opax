import {root,port,close} from '../../scripts/vic_gifts/preview.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const {chromium}=createRequire(resolve(process.env.OPAX_VIC_GIFTS_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const base=`http://[::1]:${port}`,out=resolve(root,'docs/coverage/vic-gifts');
await mkdir(out,{recursive:true});
const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
const total=()=>page.locator('[data-dt-page]').evaluate(el=>JSON.parse(el.textContent).total);
try{
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/vic-gifts');
  assert.equal(response.status(),200);await page.waitForSelector('[data-datatable]');await page.waitForTimeout(300);
  assert.equal(await total(),282);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await page.screenshot({path:resolve(out,`vic-gifts-${width}.png`),fullPage:true});
  await page.screenshot({path:resolve(out,`vic-gifts-${width}-viewport.png`)});
  results.push({width,status:response.status(),horizontalOverflow:overflow,total:await total(),holderTotals:await page.locator('.vic-gifts-totals li').count()});
 }
 for(const [period,count] of [['2025-02-01_2025-06-30',84],['2025-07-01_2026-01-31',135],['2026-02-01_2026-06-30',63]]){
  await page.goto(base+'/register/vic-gifts?period='+period);assert.equal(await total(),count);
 }
 await page.goto(base+'/register/vic-gifts');await page.locator('[data-search]').fill('Jacinta Allan');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total<282);
 const officialSearch=await total();assert.ok(officialSearch>0);
 // Organisational givers are excluded too: only the public official fields are searchable.
 await page.locator('[data-search]').fill('Mushroom Group');await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total===0);
 await page.locator('[data-clear]').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total===282);
 await page.locator('[data-page="2"]').click();await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-dt-page]').textContent).page===2);
 const download=page.waitForEvent('download');await page.locator('[data-export]').click();const csv=await readFile(await(await download).path(),'utf8');
 for(const value of ['SHA-256','Snapshot','Source row','Licence','Not published'])assert.ok(csv.includes(value));
 const staticContext=await browser.newContext({javaScriptEnabled:false});await staticContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const staticPage=await staticContext.newPage();await staticPage.goto(base+'/register/vic-gifts');assert.ok(await staticPage.locator('[data-datatable] tbody tr').count()>0);assert.ok(await staticPage.locator('.vic-gifts-totals li').count()>0);
 const personResponse=await staticPage.goto(base+'/subject/person/jacinta-allan');assert.equal(personResponse.status(),200);assert.equal(await staticPage.locator('#subject-vic-gifts').count(),1);
 assert.match(await staticPage.locator('#subject-vic-gifts').textContent(),/CC BY 4.0/);await staticContext.close();
 const html=await(await fetch(base+'/register/vic-gifts')).text();assert.ok(!html.includes('src="/app.js'));assert.equal(errors.length,0);
 const hash=async p=>createHash('sha256').update(await readFile(resolve(root,p))).digest('hex');
 const codeHashes=Object.fromEntries(await Promise.all(['portal/src/index.ts','portal/src/vic-gifts.ts','portal/public/register-tables.js','portal/public/register-tables-entry.js','portal/public/app.js','portal/public/vic-gifts.css'].map(async p=>[p,await hash(p)])));
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify({preview:'Local Worker; staged in-memory asset binding; no production bindings',stagedSha256:await hash('data/staged/vic-gifts/hub.json'),codeHashes,results,officialSearch,giverSearchHits:0,csvReceipts:true,ssr:true,personSSR:true,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify({results,officialSearch,giverSearchHits:0,csvReceipts:true,personSSR:true,pageErrors:errors}));
}finally{await browser.close();await close();}
