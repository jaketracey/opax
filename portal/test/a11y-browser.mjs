// Local Worker browser regression: OPAX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
// A11Y_BASE=http://localhost:8945 npm run test:a11y
// --audit covers the complete page matrix; the default covers six representative pages.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {personUrl} from '../public/canonical-urls.js';
import {donorDisclosure} from '../public/donor-disclosure.js';
const require=createRequire(import.meta.url);
const {chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.A11Y_BASE || 'http://localhost:8945';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Use a local Worker');
const pub=new URL('../public/',import.meta.url),output=new URL('../private/web-a11y/',import.meta.url);
const read=async file=>JSON.parse(await readFile(new URL(file,pub),'utf8'));
const axeSource=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const person=personUrl((await read('speakers.json'))[0][0]);
const billKey=(await read('bills/index.json')).bills.find(b=>b.divisions>0).key;
const division='/doc/'+(await read('divisions/index.json')).divisions[0].slug;
const representative=[['Home','/'],['Money','/money'],['Person',person],['Search results','/ask?view=search&q=housing'],['Budget','/budget'],['Ask idle','/ask']];
const audit=process.argv.includes('--audit');
const keyboardOnly=process.argv.includes('--keyboard-only');
const receiptName=keyboardOnly?'keyboard-results.json':audit?'audit-after.json':'browser-results.json';
let pages=representative;
if(audit) {
 const graph=await read('graph/money.json'),manifest=await read('electorates/manifest.json');
 const seats=(await read(manifest.index_url.slice(1))).electorates;
 pages=[...representative,['Money map','/map'],['Bill','/bill/'+billKey],['Division',division],['Donor',donorDisclosure(graph.nodes.find(n=>n.kind==='donor')).href],['Labor','/subject/party/labor'],['Electorate','/subject/electorate/'+seats.find(s=>s.jurisdiction==='federal'&&s.representatives.length).slug],['Search empty','/ask?view=search&q=zzqxnonexistentaccessibilityterm'],['Connections','/connections'],['Budget year','/budget?year=2024-25'],['Time machine year','/explore?game=tm'],['404','/this-page-does-not-exist'],['Menu open','/']];
}
const browser=await chromium.launch({executablePath:process.env.OPAX_BROWSER_EXECUTABLE || '/usr/bin/google-chrome',headless:true,args:['--mute-audio','--disable-dev-shm-usage']});
const evidence=[],focusChecks=[],blocked=new Set();
await mkdir(output,{recursive:true});
async function context(width,theme='light',zoom=false) {
 const c=await browser.newContext({viewport:{width,height:zoom?480:960},deviceScaleFactor:zoom?2:1,colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block',bypassCSP:true});
 await c.route('**/*',route=>{
  const r=route.request(),url=new URL(r.url());
  if(url.origin!==base || r.method()!=='GET' || /^\/(ingest|og\/|api\/(ask|voice|chat|research|community|search-summary|followups|journey-story|money-overview))/.test(url.pathname)) {blocked.add(url.origin===base?url.pathname:url.origin);return route.abort();}
  return route.continue();
 });return c;
}
async function load(page,path) {
 const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:60000});
 assert.equal(response.status(),path==='/this-page-does-not-exist'?404:200,path);
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
 if(path===person) await page.locator('#growth-ask-title').waitFor();
 if(path.startsWith('/bill/')) await page.locator('#bill-summary-head').waitFor();
 if(path==='/money'||path==='/map') await page.locator('.mm-canvas').waitFor();
 if(path.startsWith('/ask?view=search&q=housing')) await page.locator('#search-results > li').first().waitFor();
 if(path.startsWith('/explore?game=tm')) await page.locator('.tm-year').waitFor();
 await page.evaluate(()=>document.fonts.ready);
}
async function typography(page,width,theme) {
 const checks=[];
 async function heading(name,path,selector,expected) {
  const node=page.locator(selector);await node.waitFor();await page.evaluate(()=>document.fonts.ready);
  const actual=await node.evaluate(e=>{
   const s=getComputedStyle(e);
   return {tag:e.tagName,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,margin:s.margin};
  });
  evidence.push({kind:'typography',name,path,width,theme,...actual});checks.push({name,actual,expected});
 }
 await load(page,division);
 await heading('Who voted which way',division,'#division-members-head',{tag:'H2',fontFamily:'Merriweather, Georgia, "Times New Roman", serif',fontSize:'24px',fontWeight:'600',lineHeight:'30px',margin:'0px 0px 16px'});
 // Serve synthetic enriched text locally, then open the real bill reader. No KB is needed.
 const prefix=`/bill-texts/${billKey}/`;
 const version={id:'first-reps',status:'complete',text_url:prefix+'first-reps.json'};
 const text='Synthetic provision for the local browser typography test.';
 const fixture=route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base||!url.pathname.startsWith(prefix))return route.fallback();
  return route.fulfill({json:url.pathname===prefix+'index.json'
   ?{bill_key:billKey,default_version_id:version.id,versions:[version]}
   :{bill_key:billKey,version,complete:true,text,sections:[{id:'one',title:'Example provision',text}],enrichment:{brief:'Synthetic overview for the local browser test.',topics:[],evidence:[]}}});
 };
 await page.route('**/bill-texts/**',fixture);
 try {
  const path='/bill/'+billKey;await load(page,path);
  await page.locator('.bill-text-read').click();
  await heading('In this version',path,'.bill-text-overview h3',{tag:'H3',fontFamily:'"Public Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',fontSize:'16px',fontWeight:'700',lineHeight:'23.2px',margin:'0px 0px 8px'});
 } finally {await page.unroute('**/bill-texts/**',fixture);}
 await writeFile(new URL(receiptName,output),JSON.stringify(evidence,null,2)+'\n');
 for(const {name,actual,expected} of checks) for(const [property,value] of Object.entries(expected)) {
  assert.equal(actual[property],value,`${name} ${theme} ${width}: ${property}`);
 }
 console.log(`PASS typography ${theme} ${width} Division and bill reader`);
}
async function resetTabs(page) {await page.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();document.body.removeAttribute('tabindex');});}
async function ring(page) {
 const focus=await page.evaluate(()=>{
  const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();
  const rgb=value=>{const hex=/^#([0-9a-f]{6})$/i.exec(value.trim());return hex?[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)):value.match(/[\d.]+/g)?.map(Number);};
  let bg;
  for(let p=parseFloat(s.outlineOffset)<0?e:e.parentElement;p;p=p.parentElement) {
   const colour=rgb(getComputedStyle(p).backgroundColor);
   if(colour&&colour.length>=3&&(colour.length===3||colour[3]===1)){bg=colour;break;}
  }
  bg ||= rgb(getComputedStyle(document.documentElement).getPropertyValue('--paper'));
  const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const fg=rgb(s.outlineColor),a=fg&&luminance(fg),b=bg&&luminance(bg);
  return {width:innerWidth,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',id:e.id,tag:e.tagName,outline:s.outlineColor,background:bg,visible:r.width>0&&r.height>0&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2,contrast:fg&&bg?(Math.max(a,b)+.05)/(Math.min(a,b)+.05):0};
 });
 focusChecks.push(focus);
 assert.ok(focus.visible,'Keyboard focus is visible: '+JSON.stringify(focus));
 assert.ok(focus.contrast>=3,'Focus ring clears 3:1: '+JSON.stringify(focus));
}

async function tabTo(page,selector,max=160) {
 for(let i=0;i<max;i++) {await page.keyboard.press('Tab');if(await page.evaluate(s=>document.activeElement.matches(s),selector)) {await ring(page);return;}}
 assert.fail('Tab did not reach '+selector);
}
async function keyboard(page,width,theme) {
 await load(page,'/');await resetTabs(page);
 if(width===390) {
  await tabTo(page,'#nav-open');await page.keyboard.press('Enter');
  assert.ok(await page.locator('#nav-drawer').evaluate(e=>e.open));
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'drawer-close');await ring(page);
  await tabTo(page,'#drawer-q');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(()=>!!document.activeElement.closest('#nav-drawer')),'Reverse Tab stays in the menu');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#nav-drawer').open);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'nav-open');await ring(page);
 } else {
  await tabTo(page,'[data-nav-trigger]');const key=await page.evaluate(()=>document.activeElement.dataset.navTrigger);
  await page.keyboard.press('ArrowDown');assert.equal(await page.locator(`[data-nav-trigger="${key}"]`).getAttribute('aria-expanded'),'true');await ring(page);
  assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.nav-panel')));
  await page.keyboard.press('Escape');assert.equal(await page.locator(`[data-nav-trigger="${key}"]`).getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.navTrigger),key);await ring(page);
 }
 await resetTabs(page);await tabTo(page,'#header-search-open');await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'mast-q');await ring(page);
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'header-search-open');
 await load(page,'/budget');await resetTabs(page);
 await tabTo(page,'.budget-receipt > summary');await page.keyboard.press('Enter');await page.keyboard.press('Tab');
 assert.ok(await page.evaluate(()=>document.activeElement.matches('.budget-receipt a')&&document.activeElement.textContent==='Open the original paper'),'Source disclosure and its link have separate keyboard stops');await ring(page);
 await resetTabs(page);
 if(width===1440) {
  await tabTo(page,'#budget-table [data-sort]');
  const key=await page.evaluate(()=>document.activeElement.dataset.sort),sort=page.locator(`#budget-table [data-sort="${key}"]`);
  await page.keyboard.press('Enter');await page.waitForFunction(k=>document.querySelector(`#budget-table [data-sort="${k}"]`).parentElement.getAttribute('aria-sort')==='ascending',key);
  assert.ok(await sort.evaluate(e=>e===document.activeElement),'Sort keeps focus after redraw');await ring(page);
  await page.keyboard.press('Space');assert.equal(await sort.locator('..').getAttribute('aria-sort'),'descending');assert.ok(await sort.evaluate(e=>e===document.activeElement));
 } else {
  await tabTo(page,'#budget-table [data-sort-select]');
  const before=await page.locator('#budget-table [data-sort-select]').inputValue();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('#budget-table [data-sort-select]').inputValue(),before);
  assert.ok(await page.locator('#budget-table [data-sort-select]').evaluate(e=>e===document.activeElement));await ring(page);
 }
 await load(page,'/money');await resetTabs(page);await tabTo(page,'.mm-canvas');
 const canvas=page.locator('.mm-canvas');await page.keyboard.press('ArrowRight');await page.keyboard.press('+');
 await tabTo(page,'.mm-root button[aria-label="Zoom in"]');await page.keyboard.press('Enter');
 await tabTo(page,'.mm-root button[aria-label="Zoom out"]');await page.keyboard.press('Enter');await ring(page);
 assert.equal(await canvas.getAttribute('tabindex'),'0');
 evidence.push({kind:'keyboard',width,theme,menu:true,search:true,sort:true,map:true});
}
try {
 for(const theme of ['light','dark']) for(const width of [390,1440]) {
  const c=await context(width,theme),page=await c.newPage();
  for(const [name,path] of keyboardOnly?[]:pages) {
   await load(page,path);
   if(name==='Menu open') await page.locator(width===390?'#nav-open':'[data-nav-trigger]').first().click();
   await page.addScriptTag({content:axeSource});
   const result=await page.evaluate(async()=>{
    const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});
    const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(e=>({level:Number(e.tagName[1]),text:e.textContent.trim().slice(0,100)}));
    return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),headings,h1:headings.filter(h=>h.level===1).length,skips:headings.filter((h,i)=>i&&h.level>headings[i-1].level+1),main:[...document.querySelectorAll('main')].filter(visible).length,bareLinks:[...document.querySelectorAll('a')].filter(visible).filter(e=>/^(read more|more|click here)$/i.test(e.getAttribute('aria-label')||e.textContent.trim())).map(e=>e.outerHTML),animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName),palette:{paper:getComputedStyle(document.documentElement).getPropertyValue('--paper'),scheme:getComputedStyle(document.documentElement).colorScheme}};
   });
   evidence.push({kind:'axe',name,path,theme,width,...result});
   await writeFile(new URL(receiptName,output),JSON.stringify(evidence,null,2)+'\n');
   assert.deepEqual(result.violations.filter(v=>['serious','critical'].includes(v.impact)),[],`${name} ${theme} ${width}: serious/critical axe findings`);
   assert.equal(result.h1,1,`${name}: one h1`);assert.deepEqual(result.skips,[],`${name}: heading order`);assert.equal(result.main,1,`${name}: main landmark`);assert.deepEqual(result.bareLinks,[],`${name}: link names`);assert.deepEqual(result.animations,[],`${name}: reduced motion`);
   console.log(`PASS axe ${theme} ${width} ${name}`);
  }
  if(!keyboardOnly) await typography(page,width,theme);
  if(theme==='light'||keyboardOnly) await keyboard(page,width,theme);
  await c.close();
 }
 // Browser zoom to 200% at 1440 physical pixels has a 720 CSS-pixel layout viewport.
 for(const theme of keyboardOnly?[]:['light','dark']) {
  const c=await context(720,theme,true),page=await c.newPage();
  for(const [name,path] of keyboardOnly?[]:pages) {
   await load(page,path);if(name==='Menu open')await page.locator('#nav-open').click();
   const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
   evidence.push({kind:'zoom',name,path,theme,physicalWidth:1440,zoomPercent:200,...layout});
   assert.ok(layout.document<=layout.viewport&&layout.body<=layout.viewport,`${name} ${theme}: 200% zoom: ${JSON.stringify(layout)}`);
  }await c.close();
 }
 await writeFile(new URL(receiptName,output),JSON.stringify({evidence,focusChecks,blocked:[...blocked]},null,2)+'\n');
 console.log(`a11y-browser: ${keyboardOnly?0:pages.length*4} axe checks, ${keyboardOnly?4:2} keyboard journeys, ${keyboardOnly?0:8} typography checks and ${keyboardOnly?0:pages.length*2} zoom checks passed`);
} finally {await browser.close();}
