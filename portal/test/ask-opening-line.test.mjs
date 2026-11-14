// The opening line of a streamed research answer (src/research-opening-line.ts): what it is written from, the
// ASK_OPENING_LINE kill switch in both states, the skip on a provider error or a late call, the stream invariant
// (joined deltas equal done.answer) and the cost record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {MockLanguageModelV4} from 'ai/test';
import {scriptedResearchModel} from './fixtures/research-scripted-model.mjs';
import {importBundle} from './fixtures/import-bundle.mjs';
import {loadWorker,offline} from './worker-harness.mjs';
import {AskStream} from './fixtures/research-app-decoders.mjs';
import {budgetDatabase} from './fixtures/research-budget.mjs';

const bundled=await build({stdin:{contents:"export * from './src/research-opening-line'; export {checkedAnswerPayload,withAnswerLanguage} from './src/research-response'; export {writingPrompt,OPENING_LINE_WRITING_RULE} from './src/research-writing'; export {unmeteredResearchBudget} from './src/research-budget'; export {runAgentic,inferPeriod} from './src/agentic-ask'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await importBundle(bundled.outputFiles[0].text,'ask-opening-line');
const LINE='Looking at the housing report in the public record.';
const usage={inputTokens:{total:300,noCache:300,cacheRead:0,cacheWrite:0},outputTokens:{total:14,text:14,reasoning:0}};
const lineReply=(text=LINE,finish='stop')=>({content:[{type:'text',text}],finishReason:{unified:finish,raw:finish},usage,providerMetadata:{openrouter:{usage:{cost:0.0001}}},warnings:[]});
const isOpening=options=>JSON.stringify(options.prompt).includes('has just started reading its records');
const aborted=signal=>new Promise(resolve=>signal?.aborted?resolve():signal?.addEventListener('abort',resolve,{once:true}));

// ---- the module on its own ----
test('only "on" enables the line; unset, off and anything else leave it off',()=>{
 for(const value of ['on',' ON '])assert.equal(api.openingLineEnabled(value),true);
 for(const value of [undefined,null,'','off','0','false','true','1',true])assert.equal(api.openingLineEnabled(value),false);
});
test('the model is given the question and the fixed lookup labels, and nothing else',()=>{
 assert.deepEqual(JSON.parse(api.openingLinePrompt('What did the housing report find?',['Searching the record'])),{question:'What did the housing report find?',reading:['Searching the record']});
 // Framing is asked for at the source: the instructions keep facts for the answer, and no runtime check reads the line.
 assert.match(api.OPENING_LINE_INSTRUCTIONS,/No record has been read yet/);
 assert.match(api.OPENING_LINE_INSTRUCTIONS,/Every figure, date, year, outcome, cause, finding, description and judgement is left for the answer/);
});
test('a shown line becomes the first paragraph: citation ranges move with the text and come back exactly',()=>{
 const answer='Ley said 😀 nuclear power was needed.',payload={answer,citations:{'a/t/body/0':[[0,8],[9,36]]},sources:[],research:{mode:'loop'}};
 const led=api.withOpeningLine(payload,LINE,{ms:700,cost_usd:0.0001,shown:true}),lead=LINE+'\n\n';
 assert.equal(led.answer,lead+answer);assert.equal(led.opening_line,LINE);
 const points=Array.from(led.answer);
 assert.deepEqual(led.citations['a/t/body/0'].map(([a,b])=>points.slice(a,b).join('')),[[0,8],[9,36]].map(([a,b])=>Array.from(answer).slice(a,b).join('')));
 assert.deepEqual(led.research,{mode:'loop',opening_line:{ms:700,cost_usd:0.0001}});
 assert.equal(api.openingLineOf(led),LINE);assert.equal(api.openingLineOf(payload),'');
 const {research:_r,...back}=api.withoutOpeningLine(led),{research:_p,...plain}=payload;
 assert.deepEqual(back,plain);
 assert.equal(api.withOpeningLine(payload,''),payload,'no line shown leaves the payload untouched');
 assert.equal(api.openingLineOf({answer:'Something else.',opening_line:LINE}),'','a field without the text in front is not a shown line');
});
test('the answer checks never read the line: the answer is checked as if it stood alone and the line goes back in front',()=>{
 const question='What did the housing report find?',first='The housing report found planning rules slowed approvals.';
 const source={resource:'r1',slug:'',title:'Housing report',href:'https://example.org/r',url:'https://example.org/r',snippet:first,cited:true,kind:'record'};
 const plain={answered:true,answer:first,answer_decision:'answer',citations:{'r1/t/body/0':[[0,first.length]]},sources:[source],research:{mode:'loop'}};
 const alone=api.checkedAnswerPayload(plain,question),led=api.checkedAnswerPayload(api.withOpeningLine(plain,LINE),question,false,LINE+'\n\n');
 assert.deepEqual(led,api.withOpeningLine(alone,LINE));
 assert.ok(led.answer.startsWith(LINE+'\n\n'));
});
test('an error after a shown line withdraws the line first; an error with no text shown passes through untouched',async()=>{
 const sse=frames=>new Response(frames.map(([event,data])=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 const failure=['error',{error:'The answer took too long. Please try again.',final:true}];
 const shown=await(await api.withAnswerLanguage(sse([['status',{phase:'searching'}],['research_sentences',{}],['research_sentence',{text:LINE+'\n\n'}],failure]),'What did the housing report find?')).text();
 assert.equal(shown,await sse([['status',{phase:'searching'}],['delta',{text:LINE+'\n\n'}],['retry',{reason:'opening_line'}],failure]).text());
 const bare=sse([['status',{phase:'searching'}],failure]),before=await bare.clone().text();
 assert.equal(await(await api.withAnswerLanguage(bare,'What did the housing report find?')).text(),before);
});
test('the hook shows one line, only before answer text, and stops a call in flight when closed',async()=>{
 const sent=[],calls=[],hook=api.openingLineHook(async text=>{sent.push(text)},call=>calls.push(call));
 assert.equal(await hook.release(''),false);
 assert.equal(await hook.release(LINE),true);assert.equal(await hook.release('Another line.'),false);
 assert.deepEqual(sent,[LINE+'\n\n']);assert.equal(hook.text,LINE);
 hook.spent({ms:5,cost_usd:0.0001,shown:true});assert.deepEqual(calls,[{ms:5,cost_usd:0.0001,shown:true}]);assert.deepEqual(hook.call,calls[0]);
 const late=api.openingLineHook(async text=>{sent.push(text)});late.close();
 assert.equal(late.signal.aborted,true);assert.equal(await late.release(LINE),false);assert.equal(late.text,'');assert.equal(sent.length,1);
});
const ask=async(model,{hook,wallMs,budget=api.unmeteredResearchBudget,stats={}}={})=>{
 const sent=[],calls=[];hook??=api.openingLineHook(async text=>{sent.push(text)},call=>calls.push(call));
 await api.requestOpeningLine({model,question:'What did the housing report find?',reading:['Searching the record'],hook,stats,dailyBudget:budget,inputPrice:0.3,outputPrice:1.2,wallMs});
 return {sent,calls,hook,stats};
};
test('a complete line is shown as written, with its latency and receipt recorded and its reservation settled',async()=>{
 const settled=[],budget={available:async()=>true,reserve:async max=>({settle:async actual=>{settled.push([max,actual])}})};
 const model=new MockLanguageModelV4({doGenerate:async()=>lineReply('  '+LINE+'\n')});
 const {sent,calls,hook,stats}=await ask(model,{budget});
 assert.deepEqual(sent,[LINE+'\n\n']);assert.equal(hook.text,LINE);
 assert.equal(calls.length,1);assert.equal(calls[0].shown,true);assert.equal(calls[0].cost_usd,0.0001);assert.ok(calls[0].ms>=0);
 assert.equal(settled.length,1);assert.equal(settled[0][1],0.0001);assert.ok(settled[0][0]>0&&settled[0][0]<0.0015,'the ceiling reserved for the call is under the per-ask limit');
 assert.equal(stats.reservedCostUsd,0.0001,'the question is charged the receipt, not the ceiling');
 const prompt=JSON.stringify(model.doGenerateCalls[0].prompt);
 assert.match(prompt,/What did the housing report find\?/);assert.match(prompt,/Searching the record/);
 assert.equal(model.doGenerateCalls[0].maxOutputTokens,api.OPENING_LINE_OUTPUT_TOKENS);
});
test('a provider error, a cut-off line, an empty line, a slow call and a spent budget each show nothing and never throw',async()=>{
 const failed=await ask(new MockLanguageModelV4({doGenerate:async()=>{throw Error('provider unavailable')}}));
 assert.deepEqual(failed.sent,[]);assert.deepEqual(failed.calls.map(c=>[c.shown,c.cost_usd]),[[false,null]]);
 const cut=await ask(new MockLanguageModelV4({doGenerate:async()=>lineReply('Looking at the housing report in the','length')}));
 assert.deepEqual(cut.sent,[]);assert.equal(cut.calls[0].shown,false);assert.equal(cut.calls[0].cost_usd,0.0001,'a call that was billed is still recorded');
 const empty=await ask(new MockLanguageModelV4({doGenerate:async()=>lineReply('  ')}));
 assert.deepEqual(empty.sent,[]);
 let signal;const slow=await ask(new MockLanguageModelV4({doGenerate:async options=>{signal=options.abortSignal;await aborted(signal);throw signal.reason}}),{wallMs:20});
 assert.deepEqual(slow.sent,[]);assert.equal(signal.aborted,true);assert.equal(slow.calls[0].shown,false);
 const unasked=new MockLanguageModelV4({doGenerate:async()=>lineReply()});
 const refused=await ask(unasked,{budget:{available:async()=>false,reserve:async()=>null}});
 assert.deepEqual(refused.sent,[]);assert.equal(unasked.doGenerateCalls.length,0);assert.deepEqual(refused.calls,[]);
 const closed=api.openingLineHook(async()=>{});closed.close();
 await ask(unasked,{hook:closed});assert.equal(unasked.doGenerateCalls.length,0,'no call once answer text is out');
 const dead=await ask(new MockLanguageModelV4({doGenerate:async()=>lineReply()}),{hook:api.openingLineHook(async()=>{throw Error('reader gone')})});
 assert.deepEqual(dead.sent,[],'a closed stream is not an error for research');
});
test('the writer is told the shown line; without one its prompt is unchanged',()=>{
 const input={question:'How much?',period:{kind:'all',label:''},facts:[]};
 const base=api.writingPrompt(input),told=JSON.parse(api.writingPrompt({...input,opening:LINE}));
 assert.doesNotMatch(base,/opening/);
 assert.equal(told.opening,LINE);assert.ok(told.contract.endsWith(api.OPENING_LINE_WRITING_RULE));
 const {opening:_o,...rest}=told;
 assert.deepEqual({...rest,contract:rest.contract.slice(0,-api.OPENING_LINE_WRITING_RULE.length)},JSON.parse(base));
});
test('the cost table applies twice and holds only a hash, a fixed label, a latency and a cost',()=>{
 const sql=readFileSync(new URL('../migrations/0019_ask_call_costs.sql',import.meta.url),'utf8');
 const script=`import sqlite3,sys\ndb=sqlite3.connect(':memory:')\nsql=sys.stdin.read()\ndb.executescript(sql)\ndb.executescript(sql)\nassert [r[1] for r in db.execute('PRAGMA table_info(ask_call_costs)')]==['question_hash','label','latency_ms','cost_usd','created_at']\ndb.execute('INSERT INTO ask_call_costs (question_hash,label,latency_ms,cost_usd) VALUES (?,?,?,?)',('a'*64,'opening_line',700,0.0001))\ndb.execute('INSERT INTO ask_call_costs (question_hash,label,latency_ms,cost_usd) VALUES (?,?,?,?)',('a'*64,'opening_line',700,None))\nassert db.execute('SELECT COUNT(*) FROM ask_call_costs').fetchone()[0]==2\nfor values in [('question text','opening_line',1,0),('a'*64,'Looking at the record',1,0),('a'*64,'opening_line',-1,0),('a'*64,'opening_line',1,-1)]:\n try: db.execute('INSERT INTO ask_call_costs (question_hash,label,latency_ms,cost_usd) VALUES (?,?,?,?)',values)\n except sqlite3.IntegrityError: pass\n else: raise AssertionError('invalid cost row accepted')\n`;
 const r=spawnSync('python3',['-c',script],{input:sql,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});

// ---- the route, offline ----
const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}};
const plugin={name:'fake-openrouter-only',setup(b){b.onResolve({filter:/^@openrouter\/ai-sdk-provider$/},()=>({path:'fake',namespace:'research-test'}));b.onLoad({filter:/.*/,namespace:'research-test'},()=>({contents:'export const createOpenRouter=()=>()=>globalThis.__researchModel;',loader:'js'}));}};
// Simulate the rare research-to-planner transition after text has been shown.
const fallbackPlugin={name:'offline-fallback-after-preview',setup(b){b.onLoad({filter:/\/index\.ts$/},args=>({contents:readFileSync(args.path,'utf8').replace('closeSentences()\n            if (gone', 'closeSentences()\n            if ((globalThis as typeof globalThis & {__askTestFallbackAfterPreview?:boolean}).__askTestFallbackAfterPreview) run.answered=false\n            if (gone'),loader:'ts'}))}};
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx,{plugins:[plugin,fallbackPlugin]});
const id='a'.repeat(32)+'/t/body/0-90',resource=id.split('/')[0],passage='The committee called for stronger housing affordability safeguards.';
h.env.OPENROUTER_API_KEY='test-only-placeholder';h.env.AGENTIC_ASK_MODE='route';h.env.RESEARCH_LOOP='route';h.env.AGENTIC_INPUT_USD_PER_MILLION='0.66';h.env.AGENTIC_OUTPUT_USD_PER_MILLION='1.98';h.env.SA_HANSARD_FULL_TEXT='true';h.env.RESEARCH_LOOP_SHADOW_RATE='0';
const daily=budgetDatabase();h.env.COMMUNITY_DB=daily.db;
h.env.ASK_LIMITER={limit:async()=>({success:true})};h.env.MODEL_LIMITER={limit:async()=>({success:true})};
const realAssets=h.env.ASSETS;h.env.ASSETS={fetch:req=>['/parliamentarians.json','/bills/index.json'].includes(new URL(req.url).pathname)?Response.json({people:[],bills:[]}):new URL(req.url).pathname.startsWith('/graph/money')?Response.json({nodes:[],edges:[]}):realAssets.fetch(req)};
globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
let askDown=false;
globalThis.fetch=async(input,init)=>{
 const url=new URL(input);assert.ok(url.hostname.startsWith('offline.'),'all service reads must be offline fixtures');
 if(url.pathname.endsWith('/ask')){
  if(askDown)return new Response('fixture unavailable',{status:503});
  const raw={answer:'The record supports parliamentary scrutiny.',retrieval_results:{resources:{}},metadata:{tokens:{input:13,output:7}}};
  return init.headers?.['x-synchronous']==='true'?Response.json(raw):new Response([{type:'answer',text:raw.answer},{type:'metadata',tokens:raw.metadata.tokens},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
 }
 if(url.pathname.endsWith('/catalog')||url.pathname.endsWith('/search'))return Response.json({fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}},resources:{}});
 if(url.pathname.endsWith('/find'))return Response.json({resources:{[resource]:{slug:'speech-1',title:'Housing debate',fields:{body:{paragraphs:{[id]:{text:passage}}}}}}});
 if(url.pathname.includes('/slug/speech-1'))return Response.json({id:resource,title:'Housing debate',extra:{metadata:{date:'2023-05-01'}},data:{texts:{body:{value:{body:passage}}}},usermetadata:{classifications:[{labelset:'kind',label:'speech'}]}});
 throw Error('unexpected fixture service path');
};
const Q='What did the housing report find?';
const post=(question=Q,stream=true)=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json','x-opax-nocache':'1'},body:JSON.stringify({question,kind:'speech'})});
const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0))};
const oldLog=console.log;console.log=value=>{try{JSON.parse(value)}catch{oldLog(value)}};
test.beforeEach(async()=>{await flush();daily.sqlite.exec('DELETE FROM research_daily_spend');daily.sqlite.exec('DELETE FROM ask_call_costs');daily.sqlite.exec('DELETE FROM agentic_shadow');askDown=false;delete h.env.ASK_OPENING_LINE;delete globalThis.__askTestFallbackAfterPreview});
test.after(async()=>{await flush();console.log=oldLog;restore?.()});
const events=wire=>wire.trim().split(/\n\n/).map(block=>({event:/^event: (.+)$/m.exec(block)?.[1],data:JSON.parse(/^data: (.+)$/m.exec(block)?.[1]??'null')}));
/** What a client holds at the end: text joined from the deltas, cleared by each retry. The app decoder reads the same wire. */
const shownText=wire=>events(wire).reduce((text,e)=>e.event==='retry'?'':e.event==='delta'?text+e.data.text:text,'');
const decodeStream=raw=>{const parser=new AskStream({stage(){},delta(){},retry(){}});for(let i=0;i<raw.length;i+=17)parser.push(raw.slice(i,i+17));parser.push('',true);return parser.result();};
const first='The housing report found planning rules slowed approvals.',second='The housing report recommended simpler planning rules.';
/** A research model whose opening-line call is answered apart from its scripted research turns (the two run side by side). */
const withOpening=(model,opening)=>{
 const generate=model.doGenerate.bind(model);model.openingCalls=[];
 model.doGenerate=async options=>{if(!isOpening(options))return generate(options);model.openingCalls.push(options);return opening(options)};
 return model;
};
/** Research that searches, then answers in two points; `hold` keeps the answer back until the test lets it go. */
const housing=(hold=async()=>{})=>{let raw='';return scriptedResearchModel([{tool_calls:[{name:'search',id:'s',args:{query:'housing report'}}]},{text:JSON.stringify({points:[{claim:first},{claim:second}]})}],{onPiece:async piece=>{raw+=piece;if(raw.includes('points'))await hold()}})};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
/** Reads the stream, resolving `seen` once any answer text has reached the client. */
const read=async(response,seen)=>{
 const reader=response.body.getReader(),decoder=new TextDecoder();let wire='';
 for(;;){const {value,done}=await reader.read();if(done)break;wire+=decoder.decode(value,{stream:true});if(/event: delta/.test(wire))seen?.resolve()}
 return wire;
};

test('ASK_OPENING_LINE on: the line is the first text, the joined deltas equal done.answer, and its cost is recorded apart from the run',async()=>{
 h.env.ASK_OPENING_LINE='on';
 const seen=deferred(),model=withOpening(housing(()=>seen.promise),async()=>lineReply());globalThis.__researchModel=model;
 const wire=await read(await post(),seen),all=events(wire),done=all.at(-1).data;await flush();
 assert.equal(all.at(-1).event,'done');assert.doesNotMatch(wire,/event: (?:error|retry|research_sentence)/);
 const deltas=all.filter(e=>e.event==='delta').map(e=>e.data.text);
 assert.equal(deltas[0],LINE+'\n\n','the line is shown first, as its own paragraph');
 assert.equal(deltas.join(''),done.answer,'the client-side text equals done.answer');
 assert.equal(done.answer,LINE+'\n\n'+first+'\n'+second);
 assert.equal(done.opening_line,LINE);assert.equal(decodeStream(wire).answer,done.answer,'the app decoder reads the same answer');
 // What the line was written from: the question and the lookup's fixed label, never the passage research read.
 assert.equal(model.openingCalls.length,1);
 const said=model.openingCalls[0].prompt.find(m=>m.role==='user').content.map(part=>part.text).join('');
 assert.deepEqual(JSON.parse(said),{question:Q,reading:['Searching the record']},'no passage, tool argument or record id reaches the line');
 // Its cost is its own row and its own field; the run's cost and turns are the research calls alone.
 const rows=daily.sqlite.prepare('SELECT label,latency_ms,cost_usd FROM ask_call_costs').all();
 assert.equal(rows.length,1);assert.equal(rows[0].label,'opening_line');assert.equal(rows[0].cost_usd,0.0001);
 assert.deepEqual(Object.keys(done.research.opening_line).sort(),['cost_usd','ms']);assert.equal(done.research.opening_line.cost_usd,0.0001);
 assert.equal(done.research.turns.length,2,'the opening call is not a research turn');
 assert.equal(model.calls.length,2);
});
test('ASK_OPENING_LINE off or unset: no opening call, no line, and the two streams are byte-identical',async()=>{
 const wires=[];
 for(const value of [undefined,'off']){
  if(value===undefined)delete h.env.ASK_OPENING_LINE;else h.env.ASK_OPENING_LINE=value;
  const model=withOpening(housing(),async()=>lineReply());globalThis.__researchModel=model;
  const oldNow=Date.now;Date.now=()=>1791900000000;
  let wire;try{wire=await(await post()).text();await flush()}finally{Date.now=oldNow}
  const all=events(wire),done=all.at(-1).data;
  assert.equal(model.openingCalls.length,0,'the kill switch makes no opening call');
  assert.equal(done.answer,first+'\n'+second);assert.equal(shownText(wire),done.answer);
  assert.equal('opening_line' in done,false);assert.equal('opening_line' in done.research,false);
  assert.equal(daily.sqlite.prepare('SELECT COUNT(*) AS n FROM ask_call_costs').get().n,0);
  wires.push(wire);
 }
 assert.equal(wires[0],wires[1]);
});
test('a provider error in the opening call is skipped: the answer streams as it does with the line off',async()=>{
 h.env.ASK_OPENING_LINE='on';
 const model=withOpening(housing(),async()=>{throw Error('provider unavailable')});globalThis.__researchModel=model;
 const wire=await(await post()).text(),done=events(wire).at(-1).data;await flush();
 assert.equal(model.openingCalls.length,1);
 assert.doesNotMatch(wire,/event: (?:error|retry)/);
 assert.equal(done.answer,first+'\n'+second);assert.equal(shownText(wire),done.answer);assert.equal('opening_line' in done,false);
 assert.deepEqual(daily.sqlite.prepare('SELECT label,cost_usd FROM ask_call_costs').all().map(r=>({...r})),[{label:'opening_line',cost_usd:null}]);
});
test('a line that is not ready when answer text starts is dropped and its call stopped: first text is never later than without it',async()=>{
 h.env.ASK_OPENING_LINE='on';
 const seen=deferred();let signal;
 // The opening call hangs until the first answer text is on the reader's screen, then returns its line too late.
 const model=withOpening(housing(),async options=>{signal=options.abortSignal;await Promise.race([seen.promise,aborted(signal)]);return lineReply()});globalThis.__researchModel=model;
 const wire=await read(await post(),seen),all=events(wire),done=all.at(-1).data;await flush();
 assert.equal(signal.aborted,true,'answer text stops the opening call');
 assert.equal(all.find(e=>e.event==='delta').data.text.startsWith(first.slice(0,10)),true);
 assert.equal(done.answer,first+'\n'+second);assert.equal(shownText(wire),done.answer);assert.equal('opening_line' in done,false);
 assert.doesNotMatch(wire,/event: (?:error|retry)/);
});
test('a first turn that answers without a lookup has no research to frame, so no line is asked for',async()=>{
 h.env.ASK_OPENING_LINE='on';
 const model=withOpening(scriptedResearchModel([{tool_calls:[{name:'decline',id:'d',args:{reason:'out_of_scope'}}]}]),async()=>lineReply());globalThis.__researchModel=model;
 const wire=await(await post('Write me a poem about my cat.')).text();await flush();
 assert.equal(model.openingCalls.length,0);
 assert.doesNotMatch(wire,/Looking at/);
});
test('the run hands its writer the line the reader was shown, and nothing when none was shown',async()=>{
 const question='What did the housing report find?',recorded='The housing report recorded delays across several councils.',written='The housing report found planning rules slowed approvals.';
 const source={resource:'housing',slug:'',title:'Housing report',href:'https://example.org/report',url:'https://example.org/report',snippet:recorded,cited:true,kind:'record'};
 const qa={answer:recorded,sources:[source],citations:{'housing/t/body/0':[[0,recorded.length]]},answer_decision:'answer'};
 const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
 for(const shown of [true,false]){
  const inputs=[],progress=async()=>{};
  if(shown){progress.opening=api.openingLineHook(async()=>{});await progress.opening.release(LINE)}
  const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative:qa}),{writingWallMs:8000,
   write:async input=>{inputs.push(input);return {...qa,answer:written,citations:{'housing/t/body/0':[[0,written.length]]}}}});
  const run=await api.runAgentic(question,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},scope);
  assert.equal(run.answer,written);assert.equal(inputs.length,1);
  if(shown)assert.equal(inputs[0].opening,LINE);else assert.equal('opening' in inputs[0],false);
 }
});
test('the stored answer is kept without the line, so a cached replay is the answer alone',async()=>{
 h.env.ASK_OPENING_LINE='on';
 const previousCaches=globalThis.caches,edge=new Map(),shared=new Map();globalThis.caches={default:{match:async k=>edge.get(k.url)?.clone(),put:async(k,r)=>edge.set(k.url,new Response(await r.text(),r))}};
 h.env.GENERATION_CACHE={get:async k=>shared.get(k)??null,put:async(k,v)=>shared.set(k,JSON.parse(v))};
 const question='Who speaks most about gambling in NSW across the whole record?';
 const cached=()=>h.fetch('/api/ask?stream=1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question,kind:'speech'})});
 try{
  const seen=deferred();let raw='';
  const model=withOpening(scriptedResearchModel([{tool_calls:[{name:'count_speeches',id:'c',args:{topic:'gambling',state:'nsw',group_by:'speaker'}}]},{tool_calls:[{name:'finish',id:'f',args:{facts:[1]}}]},{text:JSON.stringify({sentences:[{text:'Taylor Example recorded 87 chamber speeches labelled gambling in NSW.',facts:[1]}]})}],{onPiece:async piece=>{raw+=piece;if(raw.includes('"facts"'))await seen.promise}}),async()=>lineReply());
  globalThis.__researchModel=model;
  const fresh=await cached(),wire=await read(fresh,seen),done=events(wire).at(-1).data;await flush();
  assert.equal(fresh.headers.get('x-opax-cache'),'MISS');assert.ok(done.answer.startsWith(LINE+'\n\n'));assert.equal(shownText(wire),done.answer);
  const plain=done.answer.slice(LINE.length+2),lead=Array.from(LINE).length+2;
  assert.match(plain,/^Taylor Example/);
  const hit=await cached(),replay=await hit.text(),again=events(replay).at(-1).data;await flush();
  assert.equal(hit.headers.get('x-opax-cache'),'HIT');
  assert.equal(again.answer,plain);assert.equal('opening_line' in again,false);assert.equal(shownText(replay),again.answer);
  // Every citation range sits the line's length further on in the fresh answer, over the same text.
  assert.ok(Object.keys(again.citations).length>0);
  assert.deepEqual(done.citations,Object.fromEntries(Object.entries(again.citations).map(([key,ranges])=>[key,ranges.map(([x,y])=>[x+lead,y+lead])])));
  assert.equal(model.openingCalls.length,1,'the replay asks for no line');
 }finally{globalThis.caches=previousCaches;delete h.env.GENERATION_CACHE}
});
test('a fallback answer after a shown line resets the text first, so the client still ends on done.answer',async()=>{
 h.env.ASK_OPENING_LINE='on';globalThis.__askTestFallbackAfterPreview=true;
 const seen=deferred(),model=withOpening(housing(()=>seen.promise),async()=>lineReply());globalThis.__researchModel=model;
 const wire=await read(await post(),seen),all=events(wire),done=all.at(-1).data;await flush();
 assert.equal(all.at(-1).event,'done');
 assert.equal(all.find(e=>e.event==='delta').data.text,LINE+'\n\n');
 assert.equal(shownText(wire),done.answer);
});
test('a shown line with no answer after it is gone from the client by the time the error arrives',async t=>{
 h.env.ASK_OPENING_LINE='on';askDown=true;globalThis.__askTestFallbackAfterPreview=true;t.mock.method(console,'error',()=>{});
 const seen=deferred(),model=withOpening(scriptedResearchModel([{tool_calls:[{name:'search',id:'s',args:{query:'housing report'}}]},{error:'provider unavailable'}],{onPiece:async()=>{}}),async()=>lineReply());
 // Hold round 2 until the line is on the wire, then let it fail.
 const stream=model.doStream.bind(model);let turn=0;model.doStream=async options=>{if(++turn===2)await seen.promise;return stream(options)};
 globalThis.__researchModel=model;
 const wire=await read(await post(),seen),all=events(wire).filter(e=>['delta','retry','error','done'].includes(e.event));await flush();
 assert.equal(all[0].event,'delta');assert.equal(all[0].data.text,LINE+'\n\n');
 assert.deepEqual(all.slice(-2).map(e=>e.event),['retry','error']);assert.equal(all.at(-1).data.final,true);
 assert.equal(shownText(wire),'');
});
