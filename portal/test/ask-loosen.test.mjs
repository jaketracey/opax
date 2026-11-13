// The minimum-checks Ask contract (13 Nov): every drafted point is kept. A point citing a retrieved passage stays
// cited; one without stands uncited. Only quote marks around words the passage lacks come off.
// Invented people and passages only; mock models, no live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {MockLanguageModelV4} from 'ai/test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/research-types';export * from './src/research-evidence';export * from './src/research-credit';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

const roster={people:[{name:'Robin Example'},{name:'Casey Sample'}]};
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const id='f'.repeat(32)+'/t/body/0-200',other='e'.repeat(32)+'/t/body/0-200';
const speech='We must cap poker machine losses at one dollar a spin. Mandatory precommitment will protect families from gambling harm.';
const passage={id,resource:id.split('/')[0],slug:'speech-31',title:'Gambling debate',url:'https://opax.com.au/doc/speech-31',text:speech,kind:'speech',speaker:'Robin Example',party:'Australian Labor Party',date:'2012-05-10',query:'poker machine reform'};
const passages=new Map([[id,passage],[other,{...passage,id:other,resource:other.split('/')[0],slug:'speech-32',speaker:undefined,party:undefined}]]);
const question='What has been said about poker machine reform?';
const verify=(points,q=question,named=scope)=>{const why=[],tally=api.emptyTally();const out=api.verifyResearchPoints(points,passages,q,named,undefined,roster,r=>why.push(r),tally);return {out,why,tally,lines:out?.answer.split('\n').map(l=>l.slice(2))??[]};};

// A research loop over one verified passage, the roster served as an asset.
const call=(name,args,callId='fixture')=>({type:'tool-call',toolName:name,toolCallId:callId,input:JSON.stringify(args)});
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]});
function loop(responses,{named=scope,q=question,wallMs,rosterDelay=0,money=null}={}){
 const failures=[],model=new MockLanguageModelV4({doGenerate:responses});
 const deps={
  asset:async path=>{if(path==='/graph/money.json')return money;if(path!=='/parliamentarians.json')return null;if(rosterDelay)await new Promise(r=>setTimeout(r,rosterDelay));return roster;},
  kb:async()=>({resources:{[passage.resource]:{slug:passage.slug,title:passage.title,fields:{body:{paragraphs:{[id]:{text:speech}}}}}}}),
  generate:async()=>{throw Error('the old planner must not run')},
  research:api.createResearch({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown(),
   readRecord:async()=>({text:speech,speaker:'Robin Example',metadata:{party_on_day:'Australian Labor Party',date:'2012-05-10'}}),...(wallMs?{wallMs}:{})}),
  onResearchFailure:async e=>failures.push(e)};
 return {model,failures,run:()=>api.runAgentic(q,deps,async()=>{},40_000,api.inferPeriod(q),{},named)};
}
const softPoints=[
 {claim:'Robin Example said the reform would help struggling communities.'},
 {claim:'Robin Example warned about online betting advertising.'}];

test('points with no passage id: an uncited answer, answered, with no repair turn',async()=>{
 const f=loop([reply([call('search',{query:'poker machine reform'})]),reply([call('answer',{points:softPoints})]),reply([call('answer',{points:softPoints})])]);
 const run=await f.run(),body=api.agenticAskPayload(run,question);
 assert.equal(run.answered,true);assert.equal(f.model.doGenerateCalls.length,2,'no repair turn');assert.equal(f.failures.length,0);
 assert.equal(body.answer,'- Robin Example said the reform would help struggling communities.\n- Robin Example warned about online betting advertising.');
 assert.equal(body.answer_status,'uncited');assert.deepEqual(body.citations,{});assert.ok(body.sources.every(s=>s.cited===false));
 assert.equal(body.research.mode,'loop');assert.equal(body.research.answer_stats.mode,'uncited');assert.equal(body.research.answer_stats.points_uncited,2);
});

test('a misquote becomes a paraphrase and stays cited to its passage',()=>{
 const a=verify([{claim:'Robin Example said “poker machine losses must be capped at a dollar a spin”.',id,quote:'cap poker machine losses at one dollar a spin'}]);
 assert.equal(a.lines[0],'Robin Example said poker machine losses must be capped at a dollar a spin.');assert.ok(a.out.citations[id]);assert.equal(a.out.answer_status,undefined);assert.equal(a.tally.repairs.unquoted,1);
 const b=verify([{claim:'Robin Example said “online betting advertising should be banned outright”.',id,quote:'online betting advertising should be banned'}]);
 assert.equal(b.lines[0],'Robin Example said online betting advertising should be banned outright.');assert.doesNotMatch(b.out.answer,/[“”"]/);assert.equal(b.out.answer_status,undefined);assert.ok(b.out.citations[id]);
 // A quotation the cited passage does hold keeps its marks, even on an uncited line.
 const c=verify([{claim:'Robin Example on online betting: “Mandatory precommitment will protect families”.',id,quote:'not in the passage at all'}]);
 assert.match(c.out.answer,/“Mandatory precommitment will protect families”/);
});

test('speaker, named-person, ambiguous-name, causal and figure checks no longer cut points',async()=>{
 // Minimum checks: each of these points used to be dropped; each now stands as written, cited to its passage.
 const wrong=verify([
  {claim:'Casey Sample said “Mandatory precommitment will protect families from gambling harm.”',id,quote:'Mandatory precommitment will protect families'},
  {claim:'Robin Example said losses should be capped at one dollar a spin.',id,quote:'cap poker machine losses at one dollar a spin'},
  {claim:'Robin Example also raised online betting.',id,quote:'not in the passage'}]);
 assert.deepEqual(wrong.lines,['Casey Sample said “Mandatory precommitment will protect families from gambling harm.”','Robin Example said losses should be capped at one dollar a spin.','Robin Example also raised online betting.']);
 assert.deepEqual(wrong.tally.drops,{});assert.equal(wrong.out.answer_status,undefined);assert.ok(wrong.out.citations[id]);
 // A question about one person may answer from another speaker's passage.
 const named=verify([{claim:'Robin Example said losses should be capped at one dollar a spin.',id,quote:'cap poker machine losses at one dollar a spin'}],'What has Casey Sample said about poker machines?',{...scope,people:['Casey Sample']});
 assert.deepEqual(named.lines,['Robin Example said losses should be capped at one dollar a spin.']);
 // An ambiguous or unresolved name no longer blocks the answer.
 for(const [named,q] of [[{...scope,ambiguous:true},question],[{...scope,unresolved:true},'What has Zed Nobody said about poker machines?']]){
  assert.equal(verify(softPoints,q,named).lines.length,2);
  const f=loop([reply([call('search',{query:'poker machine reform'})]),reply([call('answer',{points:softPoints})]),reply([call('answer',{points:softPoints})])],{named,q});
  const run=await f.run();assert.equal(run.answered,true);assert.equal(run.research.mode,'loop');assert.equal(f.model.doGenerateCalls.length,2);assert.equal(f.failures.length,0);
  assert.equal(run.answer,'- Robin Example said the reform would help struggling communities.\n- Robin Example warned about online betting advertising.');assert.equal(run.qualitative.answer_decision,'answer');
 }
 // Causal claims stand, including one from a passage with no speaker.
 const causal=verify([{claim:'Industry donations influenced the poker machine reform vote.',id:other,quote:'Mandatory precommitment will protect families'},{claim:'Robin Example said losses should be capped at one dollar a spin.',id,quote:'cap poker machine losses at one dollar a spin'}]);
 assert.deepEqual(causal.lines,['Industry donations influenced the poker machine reform vote.','Robin Example said losses should be capped at one dollar a spin.']);assert.ok(causal.out.citations[other]&&causal.out.citations[id]);
 // Figures the passage lacks stay in the point.
 for(const claim of ['Robin Example said losses should be capped at one dollar a spin, saving families $4 billion a year.','Robin Example backed mandatory precommitment (first proposed in 1998) to protect families.','Robin Example said 40 per cent of losses come from problem gamblers.']){
  const v=verify([{claim,id,quote:'cap poker machine losses'}]);assert.deepEqual(v.lines,[claim]);assert.ok(v.out.citations[id]);
 }
});

test('a loop timeout after the model has answered returns that draft, not the old pipeline',async()=>{
 // The roster arrives after the wall clock: the answer call is mid-check when the run stops.
 const f=loop([reply([call('search',{query:'poker machine reform'})]),reply([call('answer',{points:[{claim:'Robin Example said losses should be capped at one dollar a spin.',id,quote:'cap poker machine losses at one dollar a spin'}]})])],{wallMs:250,rosterDelay:400});
 const run=await f.run();
 assert.equal(run.answered,true);assert.equal(run.research.mode,'loop');assert.equal(run.answer,'- Robin Example said losses should be capped at one dollar a spin.');assert.ok(run.qualitative.citations[id]);
 assert.equal(run.research.answer_stats.salvaged,'timeout');assert.equal(f.failures.length,0);
});

test('a loop timeout with only record facts in hand answers from those facts, carrying their structure',async()=>{
 let n=0;
 const money={nodes:[{id:'party:Labor',label:'Labor',kind:'party'},{id:'d1',label:'Tabcorp Holdings Limited',kind:'donor',industry:'gambling'}],edges:[{source:'d1',target:'party:Labor',total:2371237,count:3}]};
 const q='How much did Labor disclose from gambling sources?',f=loop(async()=>++n===1?reply([call('party_receipts',{party:'Labor',industry:'gambling'})]):new Promise(()=>{}),{wallMs:250,money,q});
 const run=await f.run();
 assert.equal(run.answered,true);assert.match(run.answer,/Labor disclosed \$2,371,237 in receipts from Tabcorp Holdings Limited/);
 assert.equal(run.research.answer_stats.mode,'facts');assert.equal(run.research.answer_stats.salvaged,'timeout');
 assert.deepEqual(run.qualitative.sources[0].receipt,{party:'Labor',source:'Tabcorp Holdings Limited',amount:2371237,period:'1998-99 to 2025-26',jurisdiction:'federal',industry:'gambling',filter:'gambling'});
});

test('a loop timeout before any draft answers from the passages it holds, cited, with no further model call',async()=>{
 let n=0;
 const f=loop(async()=>++n===1?reply([call('search',{query:'poker machine reform'})]):new Promise(()=>{}),{wallMs:250});
 const run=await f.run();
 assert.equal(run.answered,true);assert.equal(run.research.mode,'loop');assert.deepEqual(f.failures,[]);assert.equal(n,2)
 assert.match(run.answer,/said “/);assert.ok(Object.keys(run.qualitative.citations).length)
});

// The page: the exact renderer, plus the kicker expression from the Ask result view.
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const kickerLine=app.split('\n').find(line=>line.includes('querySelector(".kicker").textContent = noAnswer ?'));
const kicker=data=>vm.runInNewContext(kickerLine.slice(kickerLine.indexOf('= noAnswer')+2).replace(/;\s*$/,''),{noAnswer:data.answered===false,needsClarification:false,data});
test('the client renders an uncited agentic answer with the uncited kicker and a one-line note',async()=>{
 const f=loop([reply([call('search',{query:'poker machine reform'})]),reply([call('answer',{points:softPoints})])]);
 const payload=api.agenticAskPayload(await f.run(),question);
 const dom=new JSDOM('<main id="ask-result"><div id="a"></div><div id="b"></div></main>',{url:'https://opax.com.au'});
 const context={document:dom.window.document,NodeFilter:dom.window.NodeFilter,URL,Node:dom.window.Node,tableFit:{observe(){}},displayTitle:s=>s.title,renderEvidenceAnswer(){throw Error('ordinary renderer required')}};
 vm.createContext(context);
 vm.runInContext(slice('function normaliseAnswerBullets','function safeAnswerLink')+slice('function safeAnswerLink','function renderEvidenceAnswer')+slice('function renderAnswer(container','function renderAskDateRuler'),context);
 const a=context.document.querySelector('#a');a.askEvidence=payload.sources;context.renderAnswer(a,payload.answer,payload);
 assert.equal(kicker(payload),'Answer, without citations');
 assert.equal(a.querySelectorAll('li').length,2);assert.equal(a.querySelectorAll('button.ask-citation').length,0);
 const note=a.querySelector('p.answer-uncited-note');assert.ok(note);assert.equal(note.textContent,'Some of this answer could not be matched to a source passage.');assert.equal(a.lastElementChild,note);
 // Partly cited: the ordinary kicker, the same note. Fully cited: no note.
 const b=context.document.querySelector('#b');b.askEvidence=[];context.renderAnswer(b,'- One point.',{answer_status:'partly_cited'});
 assert.equal(kicker({answer_status:'partly_cited'}),'Answer');assert.ok(b.querySelector('p.answer-uncited-note'));
 context.renderAnswer(b,'- One point.',{});assert.equal(b.querySelector('p.answer-uncited-note'),null);assert.equal(kicker({}),'Answer');
 // Real nothing still renders as no answer.
 assert.equal(kicker({answered:false}),'Records found');
});
