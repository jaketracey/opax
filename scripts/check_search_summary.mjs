import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.OPAX_PREVIEW_URL || 'http://localhost:8803';
const summary=q=>({status:'ready',reviewed_count:2,points:[{text:`The matching records discuss ${q} research and a grant award for local facilities.`,source_ids:['s1','s2']}],sources:[{id:'s1',title:'Agricultural research',href:'/doc/speech-1',evidence:['The speaker discussed agricultural research and development.']},{id:'s2',title:'Local facilities',href:'/money/grants?open=award-2#record',evidence:['A published grant award supported local facilities.']}]});
for(const [name,type,executablePath] of [['chromium',chromium,process.env.OPAX_CHROMIUM_PATH],['webkit',webkit,process.env.OPAX_WEBKIT_PATH]]){
 const browser=await type.launch({headless:true,executablePath});
 try {
 for(const width of [390,768,1440]){
  const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];let mode='loading',summaryRequests=0,releases=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),q=url.searchParams.get('q');
   if(url.pathname==='/api/search-summary'){
    summaryRequests++;if(mode==='loading')await new Promise(r=>releases.push(r));
    if(mode==='fail')return route.fulfill({status:503,json:{error:'Temporary failure'}});
    return route.fulfill({json:summary(q)});
   }
   if(url.pathname==='/api/search-all')return route.fulfill({json:{count:q==='empty'?0:2,total:q==='empty'?0:21,page:Number(url.searchParams.get('page')||1),per_page:20,page_count:2,years:{'2000':21},results:q==='empty'?[]:[{slug:'speech-1',title:'Agricultural research',kind:'speech',date:'2000-10-04',speaker:'Warren Truss',party:'Nationals',snippet:'Agricultural research improved rural production. The full listing can be found at http://www.dpmc.gov.au/accountability/grants/index.cfm'},{slug:'catalog-1',title:'Local facilities',kind:'grant',href:'/money/grants?open=award-2#record',snippet:'A published grant award supported local facilities.'}]}});
   if(url.pathname==='/api/voice/status')return route.fulfill({json:{enabled:false,signed_in:false}});
   return route.fulfill({json:{}});
  });
  await p.goto(base+'/search?q=agriculture&party=Nationals&topic=agriculture&from=1998&to=2002');
  await p.locator('#search-results > li').first().waitFor();
  await p.locator('#search-answer.is-loading').waitFor();
  assert.equal(await p.locator('#search-results > li').count(),2,'Results available while summary loads');
  assert.doesNotMatch(await p.locator('#search-results').textContent(),/full listing|dpmc/);
  let card=await p.locator('#search-answer').boundingBox(),list=await p.locator('#search-results').boundingBox();assert.ok(card.y<list.y);
  mode='ready';releases.splice(0).forEach(r=>r());
  await p.locator('.search-summary-citation').first().waitFor();
  assert.equal(await p.locator('.search-summary-citation').nth(1).getAttribute('href'),'/money/grants?open=award-2#record');
  await p.locator('#search-answer-sum').click();assert.equal(await p.locator('#search-answer-sources blockquote').count(),2);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:`/tmp/opax-search-summary-${name}-${width}.png`,fullPage:false});
  await p.locator('#pager-next').click();await p.waitForFunction(()=>document.querySelector('#pager-where').textContent==='Page 2 of 2');
  assert.equal(summaryRequests,1,'Paging reuses the summary');
  await p.locator('#search-answer-dismiss').click();assert.equal(await p.locator('#search-answer').isVisible(),false);
  if(width===390){
   mode='fail';await p.locator('#search-input').fill('housing');await p.locator('#search-form button[type=submit]').click();
   await p.locator('#search-answer-retry').waitFor();assert.equal(await p.locator('#search-results > li').count(),2);
   mode='ready';await p.locator('#search-answer-retry').click();await p.locator('.search-summary-citation').first().waitFor();
   assert.match(await p.locator('#search-answer-body').textContent(),/housing/);
   mode='loading';await p.locator('#search-input').fill('old query');await p.locator('#search-form button[type=submit]').click();await p.locator('#search-answer.is-loading').waitFor();
   await p.locator('#search-input').fill('new query');await p.locator('#search-form button[type=submit]').click();
   await p.waitForFunction(()=>document.querySelector('#results-bar').hidden===false && document.querySelector('#search-form button[type=submit]').disabled===false);
   mode='ready';releases.splice(0).forEach(r=>r());
   await p.waitForFunction(()=>document.querySelector('#search-answer-body').textContent.includes('new query'));
   assert.doesNotMatch(await p.locator('#search-answer-body').textContent(),/old query/);
   await p.locator('#search-input').fill('empty');await p.locator('#search-form button[type=submit]').click();await p.locator('#search-empty').waitFor();assert.equal(await p.locator('#search-answer').isVisible(),false);
  }
  assert.deepEqual(errors,[]);await p.close();console.log(`${name} ${width}: summary placement, citations, loading and result controls passed`);
 }
 }finally{await browser.close()}
}
