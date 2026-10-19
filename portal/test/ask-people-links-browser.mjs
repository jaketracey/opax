// "Whose words this draws on" beside an Ask answer (Jake, 20 Oct): a person row opened
// /https://opax.com.au/doc/speech-… because the hidden quote card over it took the click and
// routed a source's full URL as a path. Every API request is intercepted; the answer is the
// shared person fixture with production-style absolute source hrefs.
//
//   OPAX_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node test/ask-people-links-browser.mjs
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {speaker,speeches,bills,catalogueCounts,stubModel} from './fixtures/ask-person.mjs';

const compiled=await build({stdin:{contents:"export * from './src/ask-person-overview'; export * from './src/ask-records'; export * from './src/ask-evidence';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent'});
const {buildPersonOverview,recordContext,recordSources,normaliseFootnotes}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const pack=await buildPersonOverview({name:speaker,party:'Greens',representation:[{electorate:'New South Wales'}]},'2026-10-10','/subject/person/david-shoebridge',{
 catalogue:async page=>({total:speeches.length,counts:catalogueCounts,speeches:speeches.slice(page*200,(page+1)*200)}),
 find:async theme=>speeches.filter(s=>s.topics.includes(theme)).slice(0,2),
 original:async s=>s.text.split('\n\n')[0],bills:async()=>bills,peer:async()=>'David Pocock',safe:()=>true,belongs:s=>s.speaker===speaker,
});
const draft=stubModel({extra_context:recordContext(pack.records.records)});
const normalized=normaliseFootnotes(draft.answer,draft.citation_footnote_to_context,new Set(pack.records.records.map((_,i)=>'USER_CONTEXT_'+i)));
// Production sources carry absolute hrefs on the site's own origin.
const sources=recordSources(pack.records.records,normalized.citations).map((s,i)=>({...s,speaker:s.speaker||speaker,href:`https://opax.com.au/doc/speech-${235370+i}`,slug:`speech-${235370+i}`}));
const payload={...normalized,sources,scope:{kind:'all'}};

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  const file=resolve(publicDir,(path==='/ask'||path.startsWith('/subject/')||path.startsWith('/doc/'))?'index.html':'.'+path);
  if(!file.startsWith(publicDir)){res.writeHead(403);res.end();return}
  const bytes=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Missing local fixture asset')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.OPAX_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.OPAX_BROWSER_EXECUTABLE?undefined:'chrome',executablePath:process.env.OPAX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}} /* no reducedMotion: the people state is skipped under it */);
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.abort('blockedbyclient');
  if(url.pathname==='/api/ask'){
   const body='event: status\ndata: {"phase":"searching"}\n\nevent: status\ndata: {"phase":"writing"}\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n';
   return route.fulfill({status:200,contentType:'text/event-stream',body});
  }
  if(url.pathname==='/api/speakers')return route.fulfill({json:[[speaker,1649]]});
  if(url.pathname==='/api/stats')return route.fulfill({json:{total:1649,kinds:{speech:1649},states:{federal:1649}}});
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/community/'))return route.fulfill({status:200,json:{account:null,user:null,enabled:false,items:[],chats:[],questions:[]}});
  return route.continue();
 });
 await page.goto(origin+'/ask?q='+encodeURIComponent('What has parliament said about health?'),{waitUntil:'networkidle'});
 await page.locator('#people-card.shown .people-row').first().waitFor({timeout:20000});
 // The row itself takes the click: nothing (the hidden quote card) sits on top of it.
 const row=page.locator('#people-card .people-row').first();
 const hit=await row.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return el.contains(top)});
 assert.equal(hit,true,'the person row is the element under the pointer');
 const href=await row.getAttribute('href');
 assert.match(href,/^\/subject\/person/);
 await row.click();
 await page.waitForFunction(()=>location.pathname.startsWith('/subject/person'));
 assert.ok(!/https?:/.test(await page.evaluate(()=>location.pathname)),'no origin joined into the path');
 // The quote card's route (and any goRoute of a source href) keeps a full site URL as its path.
 await page.evaluate(()=>goRoute('https://opax.com.au/doc/speech-235372'));
 assert.equal(await page.evaluate(()=>location.pathname),'/doc/speech-235372');
 assert.deepEqual(errors.filter(e=>!/Failed to fetch|NetworkError|aborted/i.test(e)),[]);
 console.log('ask-people-links-browser: ok',JSON.stringify({href}));
}finally{await browser.close();await new Promise(done=>server.close(done))}
