import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {loadWorker,offline} from './worker-harness.mjs';
import {ordinaryQuestions} from './fixtures/agentic-ordinary.mjs';
import {build} from 'esbuild';

// Retired as a RESEARCH_LOOP route gate by Jake, 14 Oct 04:00.
// This pin now proves the rollback path only, with the new flag explicitly off.
test('RESEARCH_LOOP=off: legacy fields remain byte-identical; stepped research metadata is additive',async t=>{
 // Freeze the rollback fixture to B's assigned main baseline; origin/main may advance independently.
 const baseline='6b021dc84'
 const root=new URL('../../',import.meta.url).pathname,scratch=mkdtempSync(join(tmpdir(),'opax-agentic-parity-'));
 let goldMode=false;const realNow=Date.now;
 const restore=offline(),pending=[],ctx={waitUntil(p){pending.push(p)},passThroughOnException(){}};
 try{
  const files=execFileSync('git',['ls-tree','-r','--name-only',baseline,'portal/src','portal/graph','portal/public','parli/ingest/user-agent.json'],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}).trim().split('\n').filter(f=>f.startsWith('portal/src/')||f.startsWith('portal/graph/')||/^portal\/public\/[^/]+\.js$/.test(f)||f==='parli/ingest/user-agent.json');
  for(const f of files){const target=join(scratch,f);mkdirSync(dirname(target),{recursive:true});const content=execFileSync('git',['show',`${baseline}:${f}`],{cwd:root,maxBuffer:20*1024*1024});writeFileSync(target,f.startsWith('portal/src/')?content.toString().replaceAll('party_donations','party_receipts'):content);}
  symlinkSync(join(root,'portal/node_modules'),join(scratch,'portal/node_modules'));
  const current=await loadWorker(root+'portal/src/index.ts',root+'portal/public',ctx),main=await loadWorker(join(scratch,'portal/src/index.ts'),root+'portal/public',ctx);
  for(const h of [current,main]){
   h.env.RESEARCH_LOOP='off';
   const assets=h.env.ASSETS;h.env.ASSETS={fetch(req){const p=new URL(req.url).pathname;if(!goldMode&&p.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});if(!goldMode&&p==='/parliamentarians.json')return Response.json({people:[]});return assets.fetch(req)}};
   h.env.AGENTIC_ASK_MODE='route';h.env.ASK_LIMITER={limit:async()=>({success:true})};
  }
  main.env.AGENTIC_ASK_MODE='off';
  let plannerCalls=0;globalThis.fetch=async(input,init)=>{
   const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const b=JSON.parse(init?.body??'{}');
   if(u.pathname.endsWith('/ask')){
    if(b.prompt?.user?.includes('Plan the record')){plannerCalls++;return Response.json({answer:'junk'})}
    const reply={answer:'The retrieved speech called for parliamentary scrutiny.',retrieval_results:{resources:{}}};
    if(init.headers?.['x-synchronous']==='true')return Response.json(reply);
    return new Response([{type:'answer',text:reply.answer},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
   }
   if(u.pathname.endsWith('/catalog'))return Response.json({fulltext:{total:147,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':60}}},resources:{}});
   if(u.pathname.endsWith('/find'))return Response.json({resources:{}});
   if(u.pathname.endsWith('/search'))return Response.json({fulltext:{total:87},resources:{}});
   throw Error('unexpected offline fixture route');
  };
  let bodies=0;
  for(const state of [undefined,'federal'])for(const q of ordinaryQuestions)for(const stream of [false,true]){
   const post=h=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:q,kind:'speech',...(state?{state}:{})})});
   const a=await post(main),b=await post(current);assert.equal(b.status,a.status,q);
   assert.equal(await b.text(),await a.text(),`${q} (${stream?'SSE':'JSON'}, ${state || 'unscoped'})`);bodies++;
  }
  assert.equal(bodies,192,'96 ordinary bodies plus 96 explicitly non-SA bodies');
  assert.equal(plannerCalls,0,'ordinary questions cannot silently execute a planner and then fall back');
  while(pending.length)await Promise.all(pending.splice(0));
  t.diagnostic('192 ordinary bodies: 0 differences (96 unscoped, 96 federal).');
  goldMode=true;main.env.AGENTIC_ASK_MODE='route';
  const compiled=await build({entryPoints:[root+'portal/src/agentic-ask.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const {fallbackPlan}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const gold=JSON.parse(readFileSync(root+'portal/test/fixtures/agentic-ask-gold.json')).questions;
  let expected={};
  // 14 Oct: origin/main read lowercase words as surname-only people ("speakers on defence" -> "On",
  // "than last term" -> "Last"). Only questions whose named scope differs between the two trees may differ.
  const scopeOf=async entry=>{const out=await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false});return (await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'))).extractNamedScope};
  const roster=JSON.parse(readFileSync(root+'portal/public/parliamentarians.json')),[scopeNow,scopeMain]=await Promise.all([scopeOf(root+'portal/src/agentic-ask.ts'),scopeOf(join(scratch,'portal/src/agentic-ask.ts'))]);
  // Current-party inference is now allowed only in the four unqualified donor
  // forms. The computed owner in M04 must ask for the party explicitly.
  const PARTY_CLARIFY=new Set(gold.filter(q=>scopeNow(q.question,roster,{bills:[]}).partyClarification).map(q=>q.id));
  assert.deepEqual([...PARTY_CLARIFY],['M04']);
  const SURNAME_FIX=new Set(gold.filter(q=>!PARTY_CLARIFY.has(q.id)&&JSON.stringify(scopeNow(q.question,roster,{bills:[]}))!==JSON.stringify(scopeMain(q.question,roster,{bills:[]}))).map(q=>q.id));
  // Empty once origin/main carries the fix (deployed 14 Oct); while it differs, R07 must be among at most six.
  assert.ok(SURNAME_FIX.size<=6&&(!SURNAME_FIX.size||SURNAME_FIX.has('R07')),[...SURNAME_FIX].join());
  for(const q of gold)if(SURNAME_FIX.has(q.id))assert.ok(scopeNow(q.question,roster,{bills:[]}).people.every(name=>name.includes(' ')),q.id);
  globalThis.fetch=async(input,init)=>{
   const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const b=JSON.parse(init?.body??'{}');
   if(u.pathname.endsWith('/ask')) {
    if(b.prompt?.user?.includes('Plan the record'))return Response.json({answer:JSON.stringify(fallbackPlan(b.query))});
    return Response.json({answer:'Fixture composition.',retrieval_results:{resources:{}}});
   }
   const top=expected.top || expected.party_ranking?.top || expected.speaker_ranking?.top || [{name:'Taylor Example',count:87}];
   if(u.pathname.endsWith('/catalog')||u.pathname.endsWith('/search'))return Response.json({fulltext:{total:expected.total || 147,facets:{'/u/o':Object.fromEntries(top.map(row=>['/u/o/'+row.name,row.count])),'/l/party':{'/l/party/Labor':87,'/l/party/Greens':60},'/l/year':{'/l/year/2023':87,'/l/year/2024':60}}},resources:{}});
   return Response.json({resources:{}});
  };
  // Response bodies include runtime milliseconds. Freeze the fixture clock,
  // rather than deleting or normalising any fields from the comparison.
  Date.now=()=>Date.UTC(2026,9,13,10,0,0);
  const legacyBody = (text, stream) => {
   const legacy = data => { const payload = JSON.parse(data); delete payload.research; return JSON.stringify(payload) };
   return stream ? text.replace(/(event: done\r?\ndata: )([^\r\n]+)/g, (_all, frame, data) => frame + legacy(data)) : legacy(text);
  };
  // 19 Oct plain-language sweep: count answers say "recorded under <party>", not "indexed under".
  // origin/main's body gets the same wording (with its citation spans moved to match) before
  // the byte comparison, so every other byte is still pinned. Drop once main carries the copy.
  const COPY=[[' indexed under ',' recorded under ']];
  const recopy=value=>typeof value==='string'?COPY.reduce((text,[from,to])=>text.split(from).join(to),value)
   :Array.isArray(value)?value.map(recopy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,recopy(v)])):value;
  const shift=(answer,at)=>COPY.reduce((n,[from,to])=>n+(answer.slice(0,at).split(from).length-1)*(to.length-from.length),at);
  const recopyPayload=payload=>{
   const out=recopy(payload);
   if(typeof payload.answer==='string'&&payload.citations&&typeof payload.citations==='object')
    out.citations=Object.fromEntries(Object.entries(payload.citations).map(([k,spans])=>[recopy(k),spans.map(([from,to])=>[shift(payload.answer,from),shift(payload.answer,to)])]));
   return out;
  };
  const mainCopy=(text,stream)=>!COPY.some(([from])=>text.includes(from))?text:stream
   ?text.replace(/^(data: )(\{.*\})$/gm,(all,frame,data)=>COPY.some(([from])=>data.includes(from))?frame+JSON.stringify(recopyPayload(JSON.parse(data))):all)
   :JSON.stringify(recopyPayload(JSON.parse(text)));
  for(const q of gold)for(const stream of [false,true]) {
   expected=q.expected;
   const post=h=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json','x-opax-nocache':'1',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:q.question,kind:'speech',period:'all'})});
   const a=await post(main),b=await post(current);assert.equal(b.status,a.status,q.id);
   const [after,before]=[legacyBody(await b.text(),stream),mainCopy(legacyBody(await a.text(),stream),stream)];
   // 14 Oct: origin/main read lowercase words as surname-only people ("speakers on defence" -> "On") and
   // declined these; the capitalised-surname rule now answers them from tool rows. Every other body stays byte-identical.
   if(PARTY_CLARIFY.has(q.id)){assert.match(after,/"answer_decision":"clarification"/);assert.match(after,/Which party do you mean/);assert.doesNotMatch(after,/"tool":"(?:party_receipts|count_speeches)"/);}
   else if(q.category==='money'){
    // The authorised receipt wording and tool name differ. Keep the recorded amounts and result schema pinned.
    const done=text=>JSON.parse(stream?text.match(/event: done\ndata: (.+)/)[1]:text)
    const a=done(after),b=done(before),amounts=p=>(p.answer.match(/\$\d[\d,]*(?:\.\d+)?/g)??[]).sort()
    assert.deepEqual(amounts(a),amounts(b),`gold ${q.id}: receipt amounts`)
    assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),`gold ${q.id}: response fields`)
    assert.doesNotMatch(a.answer,/\bgave\b|\bdonated\b|\bfunded\b/)
   }
   else if(q.id==='R07'){assert.match(after,/"answered":true/,`gold R07 (${stream?'SSE':'JSON'})`);assert.match(after,/Scott Morrison: 133/);}
   else if(SURNAME_FIX.has(q.id))assert.match(after,/"answer":/,`gold ${q.id} (${stream?'SSE':'JSON'})`);
   else assert.equal(after,before,`gold ${q.id} (${stream?'SSE':'JSON'})`);
   while(pending.length)await Promise.all(pending.splice(0));
  }
  assert.equal(gold.length,34);t.diagnostic('34 agentic gold questions, 68 JSON/SSE bodies: unaffected legacy fields pinned; M04 now clarifies under the party ownership allowlist.');
 }finally{Date.now=realNow;restore();rmSync(scratch,{recursive:true,force:true})}
});
