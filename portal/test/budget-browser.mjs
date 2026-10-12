import {root,port,close} from '../../scripts/budget_registry/preview.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
{
 const {chromium}=createRequire(resolve(process.env.OPAX_BUDGET_BROWSER_TOOLS || '/tmp/opax-dt-tools','package.json'))('playwright-core');
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const base=`http://[::1]:${port}`;
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const out=resolve(root,'docs/coverage/budget');await mkdir(out,{recursive:true});
 const results=[];
 try{
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/budget');
   if(response.status()!==200)throw Error(`Budget preview HTTP ${response.status()}`);
   await page.waitForSelector('[data-datatable]');await page.waitForTimeout(300);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error(`Horizontal overflow at ${width}`);
   await page.screenshot({path:resolve(out,`budget-${width}.png`),fullPage:true});
   await page.screenshot({path:resolve(out,`budget-${width}-viewport.png`),fullPage:false});
   results.push({width,status:response.status(),horizontalOverflow:overflow,headlineCards:await page.locator('.budget-cards article').count(),cashYears:await page.locator('.budget-chart tbody tr').count()});
   await page.goto(base+'/budget?year=2015-16');await page.waitForSelector('[data-datatable]');
   if((await page.locator('body').textContent()).includes('Publisher document link unavailable'))throw Error('Unlinked portfolio filler rendered');
   if(await page.locator('[aria-labelledby="budget-portfolios"] > ul > li:not(:has(a))').count())throw Error('Unlinked portfolio row rendered');
   await page.screenshot({path:resolve(out,`budget-2015-16-${width}.png`),fullPage:true});
   results.at(-1).archivedPortfolioLinks=await page.locator('[aria-labelledby="budget-portfolios"] > ul > li').count();
   results.at(-1).archivedFillerRows=0;
  }
  for(const metric of ['receipts','payments','underlying_cash_balance','net_debt']){await page.goto(base+'/budget?metric='+metric);if(await page.locator('.budget-chart tbody tr').count()!==12)throw Error('Incomplete metric chart');}
  await page.goto(base+'/budget?year=2025-26');await page.waitForSelector('[data-datatable]');
  const before=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;
  await page.locator('[data-search]').fill('Receipts');
  await page.waitForFunction(total=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total<total,before);
  const after=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;if(!(after<before))throw Error('DataTable search did not narrow total matches');
  const download=page.waitForEvent('download');await page.locator('[data-export]').click();const file=await(await download).path();const csv=await readFile(file,'utf8');if(!csv.includes('SHA-256')||!csv.includes('Snapshot'))throw Error('CSV lost receipts');
  const staticContext=await browser.newContext({javaScriptEnabled:false});
  const staticPage=await staticContext.newPage();await staticPage.goto(base+'/budget');
  if(await staticPage.locator('.budget-cards article').count()!==4)throw Error('Figures require JavaScript');await staticContext.close();
  const html=await(await fetch(base+'/budget')).text();if(!html.includes('budget-aggregates')||html.includes('src="/app.js'))throw Error('SSR source unavailable');
  if(errors.length)throw Error(errors.join('; '));
  const snapshotSha256=createHash('sha256').update(await readFile(resolve(root,'data/staged/budget/hub.json'))).digest('hex');
  const codeHashes=Object.fromEntries(await Promise.all(['portal/src/index.ts','portal/src/budget.ts','portal/public/budget.css','portal/public/budget.js','portal/public/budget-table.js'].map(async p=>[p,createHash('sha256').update(await readFile(resolve(root,p))).digest('hex')])));
  await writeFile(resolve(out,'browser-results.json'),JSON.stringify({snapshotSha256,codeHashes,preview:'Local Worker, in-memory staged asset binding; no production bindings',results,search:{before,after},csvReceipts:true,ssr:true,pageErrors:errors},null,2)+'\n');
 }finally{await browser.close();await close();}
}
