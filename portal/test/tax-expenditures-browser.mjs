import {root,port,close,holdData} from '../../scripts/tax_expenditures/preview.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const toolRoot=process.env.OPAX_TAX_BROWSER_TOOLS||'/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node';
const {chromium}=createRequire(resolve(toolRoot,'package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=`http://[::1]:${port}`,results=[],errors=[];
const context=await browser.newContext({acceptDownloads:true});
await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const geometry=page=>page.evaluate(()=>{
 const table=document.getElementById('tax-expenditures-table'),container=table.closest('.dt-scroll'),bounds=container.getBoundingClientRect();
 const amounts=[...table.querySelectorAll('tbody td[data-label="Estimate (AUD)"]')];
 return {containerWidth:container.clientWidth,containerScrollWidth:container.scrollWidth,tableWidth:table.getBoundingClientRect().width,
  amountCells:amounts.length,amountsInsideContainer:amounts.every(cell=>{const r=cell.getBoundingClientRect();return r.width>0&&r.left>=bounds.left-1&&r.right<=bounds.right+1})};
});
const assertPhone=g=>{
 if(g.tableWidth>g.containerWidth+1 || g.containerScrollWidth>g.containerWidth+1)throw Error('Tax table overflows its phone container: '+JSON.stringify(g));
 if(!g.amountCells || !g.amountsInsideContainer)throw Error('Tax estimates need sideways scrolling: '+JSON.stringify(g));
};
try{
 const staged=await readFile(resolve(root,'data/staged/tax-expenditures/hub.json'));
 const response=await context.request.get(base+'/tax-expenditures/data.json');
 if(!(await response.body()).equals(staged))throw Error('Preview does not serve the staged data fixture');
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/tax-expenditures');
  if(response.status()!==200)throw Error('Page HTTP '+response.status());
  await page.waitForSelector('[data-datatable]');await page.waitForFunction(()=>!document.querySelector('[data-register-config]'));await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Page overflow at '+width);
  const table=await geometry(page);if(width===390)assertPhone(table);
  await page.screenshot({path:resolve(root,`portal/private/tax-expenditures/tax-expenditures-${width}-top.png`),fullPage:false});
  await page.evaluate(()=>scrollTo(0,scrollY+document.querySelector('.dt-scroll').getBoundingClientRect().top-160));
  await page.screenshot({path:resolve(root,`portal/private/tax-expenditures/tax-expenditures-${width}-table.png`),fullPage:false});
  results.push({width,status:response.status(),horizontalOverflow:overflow,table,headlineItems:await page.locator('#tax-largest + p + .tax-items .tax-item').count(),rows:JSON.parse(await page.locator('[data-dt-page]').textContent()).total});
 }
 const before=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;
 await page.locator('[data-search]').fill('Main residence');await page.waitForFunction(total=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total<total,before);
 const after=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;
 const download=page.waitForEvent('download');await page.locator('[data-export]').click();const csv=await readFile(await(await download).path(),'utf8');
 for(const field of ['Statement year','Estimate basis','Original published value or code','Benchmark','SHA-256','CC BY 4.0'])if(!csv.includes(field))throw Error('CSV missing '+field);
 const staticContext=await browser.newContext({javaScriptEnabled:false});
 await staticContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const staticPage=await staticContext.newPage();await staticPage.setViewportSize({width:390,height:1000});await staticPage.goto(base+'/register/tax-expenditures');
 if(await staticPage.locator('.tax-item').count()!==8 || await staticPage.locator('[data-datatable] tbody tr').count()!==25)throw Error('Estimates require JavaScript');
 const staticPhone=await geometry(staticPage);assertPhone(staticPhone);await staticContext.close();
 const ready=await(await context.request.get(base+'/tax-expenditures/ready.json')).json();if(!ready.ready||ready.count!==2448)throw Error('Data readiness gate remains closed');
 await page.getByRole('button',{name:'Money',exact:true}).click();
 if(!await page.getByRole('link',{name:'Tax expenditures',exact:true}).isVisible())throw Error('Populated data is absent from Money menu');
 holdData();
 const heldContext=await browser.newContext();
 await heldContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const heldPage=await heldContext.newPage();await heldPage.setViewportSize({width:1440,height:1000});
 const heldResponse=await heldPage.goto(base+'/register/tax-expenditures');
 await heldPage.evaluate(()=>globalThis.OpaxNavigation.taxExpendituresReady);
 if(heldResponse.status()!==503 || await heldPage.locator('#tax-expenditures-table').count()!==0)throw Error('Unpromoted snapshot did not fail closed');
 await heldPage.getByRole('button',{name:'Money',exact:true}).click();
 if(await heldPage.getByRole('link',{name:'Tax expenditures',exact:true}).count()!==0)throw Error('Unpromoted data appears in Money menu');
 await heldContext.close();
 if(errors.length)throw Error(errors.join('; '));
 const result={preview:'Local Worker; staged hub injected in ASSETS memory only; no public asset/promotion; external browser requests blocked',
  stagedSha256:createHash('sha256').update(staged).digest('hex'),results,search:{before,after},csvReceipts:true,ssr:true,staticPhone,unpromoted:{status:503,table:false,moneyLink:false},populatedMoneyLink:true,pageErrors:errors};
 await writeFile(resolve(root,'portal/private/tax-expenditures/browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();await close()}
