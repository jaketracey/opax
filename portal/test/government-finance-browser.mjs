import {root,port,close} from '../../scripts/abs_gfs/preview.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const toolRoot=process.env.OPAX_GFS_BROWSER_TOOLS||'/Users/jake/.cache/codex-runtimes/codex-primary-runtime/dependencies/node';
const {chromium}=createRequire(resolve(toolRoot,'package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.OPAX_GFS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=`http://[::1]:${port}`,results=[],errors=[];
const context=await browser.newContext();
await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const tableGeometry=page=>page.evaluate(()=>{
 const table=document.getElementById('government-finance-table'),container=table.closest('.dt-scroll');
 const bounds=container.getBoundingClientRect(),amounts=[...table.querySelectorAll('tbody td[data-label="Amount (AUD)"]')];
 return {containerWidth:container.clientWidth,containerScrollWidth:container.scrollWidth,tableWidth:table.getBoundingClientRect().width,
  amountCells:amounts.length,amountsInsideContainer:amounts.every(cell=>{const r=cell.getBoundingClientRect();return r.width>0 && r.left>=bounds.left-1 && r.right<=bounds.right+1;})};
});
const assertPhoneTable=geometry=>{
 if(geometry.tableWidth>geometry.containerWidth+1 || geometry.containerScrollWidth>geometry.containerWidth+1)throw Error('GFS table overflows its phone container: '+JSON.stringify(geometry));
 if(!geometry.amountCells || !geometry.amountsInsideContainer)throw Error('GFS amounts require sideways scrolling: '+JSON.stringify(geometry));
};
try{
 const assetPath='portal/public/government-finance/data.json',promotedBytes=await readFile(resolve(root,assetPath));
 const assetResponse=await context.request.get(base+'/government-finance/data.json');
 if(assetResponse.status()!==200)throw Error('Promoted asset HTTP '+assetResponse.status());
 if(!(await assetResponse.body()).equals(promotedBytes))throw Error('Preview does not serve the promoted public asset');
 const promoted=JSON.parse(promotedBytes),review=JSON.parse(await readFile(resolve(root,'data/staged/abs-gfs/review.json'),'utf8'));
 if(review.status!=='approved' || promoted.promotion?.reviewed_commit!==review.reviewed_commit)throw Error('Public asset does not match the approved review');
 const asset={path:assetPath,status:assetResponse.status(),bytes:promotedBytes.length,sha256:createHash('sha256').update(promotedBytes).digest('hex'),reviewedCommit:promoted.promotion.reviewed_commit,counts:promoted.promotion.counts};
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});const response=await page.goto(base+'/register/government-finance');
  if(response.status()!==200)throw Error('Page HTTP '+response.status());
  await page.waitForSelector('[data-datatable]');await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Page overflow at '+width);
  const table=await tableGeometry(page);if(width===390)assertPhoneTable(table);
  const ledeGap=await page.evaluate(()=>document.querySelector('.gfs-lede').getBoundingClientRect().top-document.querySelector('#prerender > p:last-child').getBoundingClientRect().bottom);
  if(ledeGap>33)throw Error('Summary-to-lede spacing exceeds two row tokens: '+ledeGap);
  await page.screenshot({path:resolve(root,`portal/private/abs-gfs/government-finance-${width}.png`),fullPage:true});
  await page.screenshot({path:resolve(root,`portal/private/abs-gfs/government-finance-${width}-viewport.png`),fullPage:false});
  await page.evaluate(()=>{const heading=document.getElementById('gfs-series');scrollTo(0,scrollY+heading.getBoundingClientRect().top-96);});
  await page.screenshot({path:resolve(root,`portal/private/abs-gfs/government-finance-${width}-table.png`),fullPage:false});
  results.push({width,status:response.status(),horizontalOverflow:overflow,table,ledeGap,jurisdictions:await page.locator('.gfs-jurisdiction').count(),headlineFigures:await page.locator('.gfs-jurisdiction dl > div').count(),seriesRows:JSON.parse(await page.locator('[data-register-table="government-finance-table"] [data-dt-page]').textContent()).total});
 }
 const before=JSON.parse(await page.locator('[data-register-table="government-finance-table"] [data-dt-page]').textContent()).total;
 await page.locator('[data-register-table="government-finance-table"] [data-search]').fill('Net worth');
 await page.waitForFunction(total=>JSON.parse(document.querySelector('[data-register-table="government-finance-table"] [data-dt-page]').textContent).total<total,before);
 const after=JSON.parse(await page.locator('[data-register-table="government-finance-table"] [data-dt-page]').textContent()).total;
 const download=page.waitForEvent('download');await page.locator('[data-register-table="government-finance-table"] [data-export]').click();
 const csv=await readFile(await(await download).path(),'utf8');
 for(const field of ['SHA-256','Snapshot','Published value (AUD million)','ABS consolidation group'])if(!csv.includes(field))throw Error('CSV missing '+field);
 await page.selectOption('select[name="jurisdiction"]','New South Wales');await page.locator('.gfs-filters button').click();
 await page.waitForURL(/jurisdiction=New\+South\+Wales/);await page.waitForSelector('.gfs-jurisdiction');
 if(await page.locator('.gfs-jurisdiction h3').textContent()!=='New South Wales')throw Error('NSW selector did not apply');
 await page.selectOption('select[name="level"]','Commonwealth');await page.locator('.gfs-filters button').click();
 await page.waitForURL(/level=Commonwealth/);await page.waitForSelector('.gfs-jurisdiction');
 if(await page.locator('.gfs-jurisdiction').count()!==1)throw Error('Commonwealth selector mixed jurisdictions');
 if(await page.locator('select[name="jurisdiction"]').inputValue()!=='Australia')throw Error('Stale NSW jurisdiction did not reset');
 await page.selectOption('select[name="level"]','National');await page.selectOption('select[name="sector"]','Total public sector');await page.locator('.gfs-filters button').click();
 await page.waitForURL(/level=National/);await page.waitForSelector('.gfs-jurisdiction');
 if(await page.locator('select[name="sector"]').inputValue()!=='General government')throw Error('National sector did not reset');
 if(await page.locator('.gfs-jurisdiction dl > div').count()!==1 || await page.locator('.gfs-jurisdiction dt').textContent()!=='Net debt (L2)')throw Error('National card includes absent measures');
 if(JSON.parse(await page.locator('[data-register-table="government-finance-table"] [data-dt-page]').textContent()).total!==1)throw Error('National selector rendered an empty combination');
 const staticContext=await browser.newContext({javaScriptEnabled:false});
 await staticContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const staticPage=await staticContext.newPage();await staticPage.setViewportSize({width:390,height:1000});await staticPage.goto(base+'/register/government-finance');
 if(await staticPage.locator('.gfs-jurisdiction').count()!==9)throw Error('Jurisdiction headlines require JS');
 if(await staticPage.locator('#government-finance-table tbody tr').count()!==25)throw Error('Series requires JS');
 const staticTable=await tableGeometry(staticPage);assertPhoneTable(staticTable);
 await staticContext.close();
 if(errors.length)throw Error(errors.join('; '));
 await writeFile(resolve(root,'portal/private/abs-gfs/browser-results.json'),JSON.stringify({preview:'Local Worker; promoted portal/public asset; external requests blocked',asset,results,search:{before,after},csvReceipts:true,ssr:true,staticPhoneTable:staticTable,selectorTransitions:{nswToCommonwealth:'Australia',nationalTotalPublicSector:'General government; one published L2 observation'},pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify({asset,results,search:{before,after},csvReceipts:true,ssr:true}));
}finally{await browser.close();await close();}
