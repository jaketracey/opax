import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fixtureDeps} from './fixtures/agentic-route.mjs';
import {loadWorker,offline} from './worker-harness.mjs';

const root=new URL('../../',import.meta.url).pathname;
const out=await build({entryPoints:[new URL('../src/agentic-ask.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const ask=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const gold=JSON.parse(readFileSync(new URL('./fixtures/agentic-ask-gold.json',import.meta.url))).questions.filter(q=>/^R\d+$/.test(q.id));
const rankingQuestions=[
 gold.find(q=>q.id==='R07').question,
 'Who are the top ten members with the most speeches about housing?',
 'Which three senators have made the most speeches about housing?',
 'Who are the top 5 speakers on defence and security since 2020?',
 'Who are the first five speakers with the most speeches about housing?',
 'Who are the top twenty-one speakers with the most speeches about housing?',
];
const planner=q=>JSON.stringify(ask.fallbackPlan(q));

test('P2 R07 and five ranking phrasings resolve collective scope and answer from tool rows',async()=>{
 const roster=await fixtureDeps.asset('/parliamentarians.json');
 for(const q of rankingQuestions){
  assert.equal(ask.classifyAgentic(q).route,'agentic',q);
  assert.deepEqual(ask.extractNamedScope(q,roster,{bills:[]}),{people:[],parties:[],bills:[],ambiguous:false,unresolved:false},q);
  const r=await ask.runAgentic(q,{...fixtureDeps,generate:async()=>({text:planner(q)})});
  assert.equal(r.answered,true,q);assert.match(r.answer,/Taylor Example: 87/);assert.ok(r.steps.length);
 }
 // Explicit collective slots exercise the separate person-grammar guard.
 for(const group of ['top five speakers','ten members','three senators','most speakers','the fifth member','the 5th member','the top 5 speakers']){
  const q=`How many housing speeches have ${group} made?`;
  assert.equal(ask.extractNamedScope(q,roster,{bills:[]}).unresolved,false,q);
 }
});

test('P2 the complete ten-question ranking gold sample answers with scoped synthetic tools',async()=>{
 assert.equal(gold.length,10);
 for(const {id,question:q} of gold){
  const r=await ask.runAgentic(q,{...fixtureDeps,generate:async()=>({text:planner(q)})});
  assert.equal(r.answered,true,`${id}: ${q}`);assert.ok(r.facts.length,id);
 }
});

test('P2 actual JSON and SSE answer the ten gold questions and six ranking phrasings without fallback',async()=>{
 const restore=offline(),originalCache=globalThis.caches,pending=[];
 try{
  const h=await loadWorker(root+'portal/src/index.ts',root+'portal/public',{waitUntil(p){pending.push(p)},passThroughOnException(){}});
  const assets=h.env.ASSETS;
  h.env.ASSETS={async fetch(req){const path=new URL(req.url).pathname;if(path==='/parliamentarians.json'||path==='/bills/index.json')return Response.json(await fixtureDeps.asset(path));if(path.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});return assets.fetch(req)}};
  h.env.AGENTIC_ASK_MODE='route';h.env.ASK_LIMITER={limit:async()=>({success:true})};h.env.SA_HANSARD_FULL_TEXT='true';
  h.env.COMMUNITY_DB={prepare(){return{bind(){return{run:async()=>({success:true})}}}}};
  globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
  let models=0,normal=0;
  globalThis.fetch=async(input,init)=>{
   const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const body=JSON.parse(init?.body??'{}');
   if(u.pathname.endsWith('/ask')){
    if(body.prompt?.user?.includes('Plan the record')){models++;return Response.json({answer:planner(body.query)})}
    normal++;return Response.json({answer:'Normal fallback fixture.',retrieval_results:{resources:{}}});
   }
   if(u.pathname.endsWith('/catalog')||u.pathname.endsWith('/search'))return Response.json(await fixtureDeps.kb(u.pathname,body));
   return Response.json({resources:{}});
  };
  const questions=[...new Set([...gold.map(q=>q.question),...rankingQuestions])];
  for(const q of questions)for(const stream of [false,true]){
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:q,kind:'speech'})});
   assert.equal(response.status,200,q);const text=await response.text();
   const done=stream?JSON.parse(text.split('\n\n').find(frame=>frame.startsWith('event: done\n')).split('\ndata: ')[1]):JSON.parse(text);
   assert.equal(done.answered,true,q);assert.ok(done.agentic,q);assert.match(done.answer,/Taylor Example: 87/);
   if(stream)assert.match(text,/"phase":"step"/);
   while(pending.length)await Promise.all(pending.splice(0));
  }
  assert.equal(normal,0);assert.equal(models,questions.length*2);
 }finally{restore();globalThis.caches=originalCache}
});

test('P2 parsed index preserves every main script, including the analytics loader',()=>{
 const main=execFileSync('git',['show','origin/main:portal/public/index.html'],{cwd:root,encoding:'utf8'});
 const current=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const scripts=html=>{
  const dom=new JSDOM(html,{url:'https://offline.invalid'});
  try{return [...dom.window.document.scripts].map(script=>({
   attributes:[...script.attributes].map(a=>[a.name,a.name==='src'?a.value.replace(/\?v=[a-f0-9]+$/,''):a.value]).sort(([a],[b])=>a.localeCompare(b)),
   text:script.textContent,
  }))}finally{dom.window.close()}
 };
 assert.deepEqual(scripts(current),scripts(main),'content stamps may differ; every parsed script, its attributes and inline body must remain');
 const dom=new JSDOM(current);
 try{
  assert.equal(dom.window.document.querySelectorAll('script[src^="/analytics.js?"]').length,1);
  assert.equal(dom.window.document.querySelector('script[src^="/app.js?"]').textContent,'');
 }finally{dom.window.close()}
 // Preserve main's shell alongside the approved table entry points, loader containers and stamps.
 const normalise=html=>html
  .replace(/^\s*<div id="ask-steps(?:-live)?" hidden><\/div>\n/gm,'')
  .replace(/^<link rel="stylesheet" href="\/datatable.css">\n/gm,'')
  .replace(/^\s*<section class="supplier-section" id="contracts-hub-table" data-contracts-table><\/section>\n/gm,'')
  .replace(/\?v=[a-f0-9]+/g,'?v=STAMP');
 assert.equal(normalise(current),normalise(main));
});
