import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
const load=async file=>{const out=await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'))};
const {inferPeriod,fallbackPlan,runAgentic,agenticCacheKey,questionHash,bounded,parsePlan,stepEvent}=await load('../src/agentic-ask.ts');
const {agenticAskPayload}=await load('../src/agentic-response.ts');
const {recordAgenticRun}=await load('../src/agentic-monitor.ts');
const {partyDonations}=await load('../src/agentic-tools.ts');
import {question,fixtureDeps as deps} from './fixtures/agentic-route.mjs';

test('period defaults follow tense; explicit windows and whole record override it',()=>{
 for(const q of [question,'Is gambling debated more?','Who speaks most about health?','Who is debating housing most?'])assert.equal(inferPeriod(q).kind,'current',q);
 for(const q of ['Who has spoken most about housing?','Who spoke most about health?'])assert.equal(inferPeriod(q).kind,'all',q);
 assert.equal(inferPeriod(question+' across the whole record').kind,'all');
 assert.equal(inferPeriod(question+' since 2022').since,'2022-01-01');
 assert.equal(inferPeriod('Who spoke most in the 2010s?').until,'2019-12-31');
 assert.equal(inferPeriod('Is gambling debated more this term than last term?').since,'2022-07-26');
 assert.equal(inferPeriod(question,'all').kind,'all');
});
test('junk, timeouts and missing required args use a rule plan with the actual topic',async()=>{
 assert.equal(parsePlan('{"shape":"comparison","steps":[{"tool":"member_votes","args":{"person":"Alex Example"}}]}'),null);
 for(const generate of [async()=>{throw new Error('planner timeout')},async()=>({text:'junk'})]){
  const r=await runAgentic('Who in the ACT Legislative Assembly speaks most about health?',{...deps,generate});
  assert.equal(r.answered,true);assert.equal(r.steps[0].args.topic,'health');assert.equal(r.steps[0].args.state,'act');assert.equal(r.steps[0].args.since,'2025-07-22');
 }
 assert.equal(fallbackPlan('Who has spoken most about quantum dragons?'),null);
});
test('budgets reject providers that ignore abort, stop lookups and preserve the no-answer contract',async()=>{
 const start=Date.now();const r=await runAgentic(question,{...deps,generate:async()=>new Promise(()=>{})},undefined,35);
 assert.equal(r.answered,false);assert.equal(r.reason,'declined');assert.equal(r.over_budget,true);assert.ok(Date.now()-start<500);
 const controller=new AbortController();const pending=bounded(()=>new Promise(()=>{}),1000,controller.signal);controller.abort();await assert.rejects(pending);
});
test('cache varies with period, epoch, ASK_MODEL, tools version and scope; hash never holds the question',async()=>{
 const a=await agenticCacheKey(question,'e1','m1');
 assert.equal(a,await agenticCacheKey('  WHO is making the most speeches about gambling reform? ','e1','m1'));
 for(const b of [await agenticCacheKey(question,'e2','m1'),await agenticCacheKey(question,'e1','m2'),await agenticCacheKey(question,'e1','m1',inferPeriod(question,'all')),await agenticCacheKey(question,'e1','m1',inferPeriod(question),'v3'),await agenticCacheKey(question,'e1','m1',inferPeriod(question),'agentic-tools-2',{state:'nsw'})])assert.notEqual(a,b);
 assert.match(await questionHash('private@example.invalid 123'),/^[a-f0-9]{64}$/);
});
test('monitoring inserts only a hash, shape, latency and dollars, never any text or tool arguments',async()=>{
 const inserts=[];const db={prepare(sql){return{bind(...values){inserts.push({sql,values});return{run:async()=>({success:true})}}}}};
 const r=await runAgentic(question,deps);await recordAgenticRun(db,'private@example.invalid 123',r);
 assert.equal(inserts[0].values.length,4);assert.match(inserts[0].values[0],/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(inserts),/private|example.invalid|gambling|topic|answer|steps/);
});
test('steps are real-time, fixed text and escaped/bounded args; the answer keeps period and committee counts as sentences',async()=>{
 const events=[];let toolStarted=false;
 const r=await runAgentic(question,{...deps,kb:async(...a)=>{assert.equal(events.at(-1)[1].step.state,'running');toolStarted=true;return deps.kb(...a)}},async(e,d)=>events.push([e,d]));
 assert.equal(toolStarted,true);assert.ok(events.some(([,d])=>d.step?.label==='Checking committee hearings'));
 assert.ok(events.every(([,d])=>['step','writing'].includes(d.phase)));
 assert.ok(r.events.every(s=>['done','failed'].includes(s.state)&&s.ms>=0));
 assert.match(r.answer,/Counting speeches in the current parliament since July 2025\./);
 assert.match(r.answer,/Including committee hearings: Alex Example: 130 \[\d+\], Sam Sample: 94 \[\d+\], Casey Sample: 65/);
 const safe=stepEvent({tool:'party_donations',args:{party:'<script>'+('x'.repeat(80))}},1);assert.ok(safe.arg.length<=40);assert.doesNotMatch(safe.arg,/[<>]/);
});
test('confident exact-name individuals are named; alias merges and placeholders are aggregated without names',async()=>{
 const nodes=[{id:'party:Example',label:'Example',kind:'party'},
 {id:'donor:jordan quill',label:'Jordan Quill',kind:'donor',aliases:[' jordan  quill '],industry:'individual'},
 {id:'donor:merged',label:'Merged Private Name',kind:'donor',aliases:['Another Spelling']},
 {id:'donor:withheld-7',label:'Donor 7 (name withheld)',kind:'donor'}];
 const edges=nodes.slice(1).map((n,i)=>({source:n.id,target:'party:Example',total:(i+1)*100,count:1}));
 const r=await partyDonations({asset:async()=>({nodes,edges}),kb:async()=>({})},{party:'Example'});
 assert.deepEqual(r.data.rows.map(r=>r.donor),['Jordan Quill']);assert.equal(r.data.donors_not_named.donors,2);
 assert.doesNotMatch(JSON.stringify(r),/Merged Private Name|Another Spelling|name withheld/);
});

// The exact existing renderer and its source-range wiring, without editing app.js.
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
test('a routed done payload renders exactly like a normal Ask payload, with the existing citation buttons and source links',async()=>{
 const run=await runAgentic(question,deps),payload=agenticAskPayload(run,question);
 const dom=new JSDOM('<main id="ask-result"><div id="a"></div><div id="b"></div></main>',{url:'https://opax.com.au'});
 const context={document:dom.window.document,NodeFilter:dom.window.NodeFilter,URL,Node:dom.window.Node,tableFit:{observe(){}},displayTitle:s=>s.title,renderEvidenceAnswer(){throw Error('ordinary renderer required')}};
 vm.createContext(context);
 vm.runInContext(slice('function normaliseAnswerBullets','function safeAnswerLink')+slice('function safeAnswerLink','function renderEvidenceAnswer')+slice('function renderAnswer(container','function renderAskDateRuler'),context);
 const ranges=s=>({...s,answerRanges:Object.entries(payload.citations).filter(([key])=>key.split('/')[0]===s.resource).flatMap(([,v])=>v)});
 const a=context.document.querySelector('#a'),b=context.document.querySelector('#b');a.askEvidence=payload.sources.map(ranges);b.askEvidence=payload.sources.map(ranges);
 context.renderAnswer(a,payload.answer,payload);const {agentic,...normal}=payload;context.renderAnswer(b,normal.answer,normal);
 assert.equal(a.innerHTML,b.innerHTML);assert.ok(a.querySelectorAll('button.ask-citation').length>=3);assert.doesNotMatch(a.textContent,/agentic|multi-step|working on it|\[\d+\]/i);
 assert.ok(payload.sources.some(s=>s.href.includes('/search?')));
 assert.equal(payload.agentic.steps.length,run.events.length);assert.match(a.textContent,/current parliament since July 2025/);
});

test('committee counts stay out of the answer when they leave the ranking unchanged',async()=>{
 const r=await runAgentic(question,{...deps,kb:async(path,body)=>{const replacement=JSON.parse(JSON.stringify(body).replaceAll('\"venue\":\"all\"','\"venue\":\"chamber\"'));if(path==='/catalog')return{fulltext:{total:199,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':60,'/u/o/Alex Example':52}}}};return{fulltext:{total:87}}}});
 assert.equal(r.answered,true);assert.doesNotMatch(r.answer,/Including committee hearings:/);
});

test('least-active rankings and malformed upstream totals fail closed, and bill-title years do not narrow speech history',async()=>{
 const least=await runAgentic('Who has made the fewest speeches about gambling?',{...deps,generate(){throw Error('must not start a planner')}});assert.equal(least.answered,false);assert.equal(least.reason,'declined');
 const malformed=await runAgentic(question,{...deps,kb:async()=>({fulltext:{total:'not a count'}})});assert.equal(malformed.answered,false);assert.equal(malformed.reason,'no_supported_claim');
 assert.equal(inferPeriod('How did Alex Example vote on the Gambling Reform Bill 2026, and how often has he spoken about gambling?').kind,'all');
 await assert.rejects(bounded(()=>Promise.resolve('unexpected'),0));
});

test('missing speaker facets never become an overall count presented as a ranking',async()=>{
 const r=await runAgentic(question,{...deps,kb:async()=>({fulltext:{total:300,facets:{}}})});assert.equal(r.answered,false);assert.equal(r.reason,'no_supported_claim');assert.equal(r.answer,'');
});
