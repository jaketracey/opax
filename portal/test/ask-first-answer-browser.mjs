// Run inside the required network namespace. Every API and external request is
// intercepted; all record/retrieval/model evidence comes from the shared fixture.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {speaker,themes,speeches,bills,catalogueCounts,stubModel} from './fixtures/ask-person.mjs';
import {personFollowups} from '../public/ask-person.js';

const compiled=await build({stdin:{contents:"export * from './src/ask-person-overview'; export * from './src/ask-records'; export * from './src/ask-evidence';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {buildPersonOverview,recordContext,recordSources,normaliseFootnotes}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const pack=await buildPersonOverview({name:speaker,party:'Greens',representation:[{electorate:'New South Wales'}]},'2026-10-10','/subject/person/david-shoebridge',{
 catalogue:async page=>({total:speeches.length,counts:catalogueCounts,speeches:speeches.slice(page*200,(page+1)*200)}),
 find:async theme=>speeches.filter(s=>s.topics.includes(theme)).slice(0,2),
 original:async s=>s.text.split('\n\n')[0],bills:async()=>bills,peer:async()=> 'David Pocock',safe:()=>true,belongs:s=>s.speaker===speaker,
});
const draft=stubModel({extra_context:recordContext(pack.records.records)});
const normalized=normaliseFootnotes(draft.answer,draft.citation_footnote_to_context,new Set(pack.records.records.map((_,i)=>'USER_CONTEXT_'+i)));
const sources=recordSources(pack.records.records,normalized.citations);
const payload={...normalized,sources,scope:{speaker,kind:'speech'},is_overview_intent:true,subject_context:pack.context,followups:personFollowups(normalized.answer,sources,pack.context,()=>true)};
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const output=fileURLToPath(new URL('../private/ask-first-answer/',import.meta.url));
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'fixture-answer.json'),JSON.stringify(payload,null,2));
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  const file=resolve(publicDir,path==='/chat'?'index.html':'.'+path);
  if(!file.startsWith(publicDir)){res.writeHead(403);res.end();return}
  const bytes=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)] || 'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Missing local fixture asset')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.OPAX_BROWSER_EXECUTABLE || undefined,args:['--no-sandbox']});
const proof=[];
try{
 for(const width of [390,1280,1440]){
  const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});
  const errors=[],requests=[],events=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.exposeFunction('recordAskEvent',detail=>events.push(detail));
  await page.addInitScript(()=>addEventListener('opax:analytics',event=>window.recordAskEvent(event.detail)));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort('blockedbyclient');
   if(url.pathname==='/api/ask'){
    requests.push(JSON.parse(route.request().postData()));
    const body='event: status\ndata: {"phase":"searching"}\n\nevent: status\ndata: {"phase":"writing"}\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n';
    return route.fulfill({status:200,contentType:'text/event-stream',body});
   }
   if(url.pathname==='/api/followups')return route.fulfill({json:{questions:payload.followups}});
   if(url.pathname==='/api/speakers')return route.fulfill({json:[[speaker,1649]]});
   if(url.pathname==='/api/stats')return route.fulfill({json:{total:1649,kinds:{speech:1649},states:{federal:1649}}});
   if(url.pathname==='/api/recent')return route.fulfill({json:{items:[]}});
   if(url.pathname.startsWith('/api/') || url.pathname.startsWith('/community/'))return route.fulfill({status:200,json:{account:null,user:null,enabled:false,items:[],chats:[]}});
   return route.continue();
  });
  await page.goto(origin+'/chat',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof askSpeakerInConversation==='function');
  await page.evaluate(name=>askSpeakerInConversation(name,`What has ${name} said in parliament?`),speaker);
  await page.locator('.chat-turn-answer .chat-next-btn').first().waitFor();
  await page.waitForFunction(()=>!document.getElementById('chat-person-context').hidden);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>scrollTo(0,0));
  assert.equal(await page.locator('.chat-turn-answer .chat-next-btn').count(),4);
  assert.equal(await page.locator('.chat-turn-answer .chat-next h3').count(),0);
  const panel=await page.locator('#chat-person-context').evaluate(el=>({display:getComputedStyle(el).display,width:el.getBoundingClientRect().width}));
  assert.equal(panel.display,width===390?'none':'block');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,`chat-${width}.png`),fullPage:true});
  const started=events.find(e=>e.event==='opax_ask_started');const completed=events.find(e=>e.event==='opax_ask_completed');
  assert.equal(started.properties.page_type,'chat');assert.equal(completed.properties.is_overview_intent,true);
  if(width===1440){
   const vote=page.locator('.chat-turn-answer .chat-next-btn').filter({hasText:'Votes on'});await vote.click();
   await page.waitForFunction(()=>document.querySelectorAll('.chat-turn-answer').length===2);
   assert.equal(requests.length,2);assert.equal(requests[1].kind,'all');assert.equal(requests[1].speaker,undefined);
   assert.match(requests[1].question,/How did David Shoebridge vote/);
   const clicked=events.find(e=>e.event==='opax_ask_followup_click');assert.deepEqual(clicked.properties,{position:2,kind:'vote'});
   assert.equal(await page.locator('.chat-turn-answer').first().locator('.chat-next-btn').count(),4);
  }
  assert.deepEqual(errors,[]);
  proof.push({width,panel,ask_requests:requests.length,events:events.map(e=>({event:e.event,properties:e.properties})),errors});
  await page.close();
 }
 await writeFile(resolve(output,'browser-proof.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify(proof.map(({width,panel,ask_requests,errors})=>({width,panel,ask_requests,errors}))));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
