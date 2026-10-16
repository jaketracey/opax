import {root,port,close} from '../../scripts/abs_gfs/preview.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const toolRoot=process.env.OPAX_GFS_BROWSER_TOOLS||'/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node';
const {chromium}=createRequire(resolve(toolRoot,'package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.OPAX_GFS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=`http://[::1]:${port}`,results=[],errors=[];
const context=await browser.newContext();
await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/government-finance');
  if(response.status()!==200)throw Error('Page HTTP '+response.status());
  await page.waitForSelector('[data-datatable]');await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Page overflow at '+width);
  await page.screenshot({path:resolve(root,`portal/private/abs-gfs/government-finance-${width}.png`),fullPage:true});
  await page.screenshot({path:resolve(root,`portal/private/abs-gfs/government-finance-${width}-viewport.png`),fullPage:false});
  results.push({width,status:response.status(),horizontalOverflow:overflow,jurisdictions:await page.locator('.gfs-jurisdiction').count()});
 }
 const before=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;
 await page.locator('[data-search]').fill('Net worth');
 await page.waitForFunction(total=>JSON.parse(document.querySelector('[data-dt-page]').textContent).total<total,before);
 const after=JSON.parse(await page.locator('[data-dt-page]').textContent()).total;
 const download=page.waitForEvent('download');await page.locator('[data-export]').click();
 const csv=await readFile(await(await download).path(),'utf8');
 for(const field of ['SHA-256','Snapshot','Published value (AUD million)','ABS consolidation group'])if(!csv.includes(field))throw Error('CSV missing '+field);
 await page.selectOption('select[name="level"]','Commonwealth');await page.locator('.gfs-filters button').click();
 await page.waitForURL(/level=Commonwealth/);await page.waitForSelector('.gfs-jurisdiction');
 if(await page.locator('.gfs-jurisdiction').count()!==1)throw Error('Commonwealth selector mixed jurisdictions');
 const staticContext=await browser.newContext({javaScriptEnabled:false});
 await staticContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const staticPage=await staticContext.newPage();await staticPage.goto(base+'/register/government-finance');
 if(await staticPage.locator('.gfs-jurisdiction').count()!==9)throw Error('Jurisdiction headlines require JS');
 if(await staticPage.locator('[data-datatable] tbody tr').count()!==25)throw Error('Series requires JS');
 await staticContext.close();
 if(errors.length)throw Error(errors.join('; '));
 await writeFile(resolve(root,'portal/private/abs-gfs/browser-results.json'),JSON.stringify({preview:'Local Worker; staged asset binding; external requests blocked',results,search:{before,after},csvReceipts:true,ssr:true,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify({results,search:{before,after},csvReceipts:true,ssr:true}));
}finally{await browser.close();await close();}
