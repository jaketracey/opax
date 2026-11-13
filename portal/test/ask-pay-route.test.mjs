import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {MockLanguageModelV4} from 'ai/test';

// Route-mode Ask: a set-rate pay question is answered by the paid_answer calculator before any model
// turn; reported pay ("total remuneration in 2024-25") goes on to the loop and annual_reports. Every
// fixture reads the stored public data (pay.json, pay-offices.json, the annual-report projection) and
// the mock model fails the test if a set-rate question reaches it.
const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/research-credit';export {groundAnswerPayload} from './src/research-grounding';export {calculatedPayAnswer} from './src/research-response';export {routedPayAnswer} from './src/ask-pay-route';export {extractAskConstraints} from './src/ask-constraints';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const asset=async path=>{try{return JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))}catch{return null}};
const emptyScope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]});
const call=(name,args)=>({type:'tool-call',toolName:name,toolCallId:'fixture',input:JSON.stringify(args)});
function routed(responses=()=>{throw new Error('a set-rate pay question reached the model')}){
 const model=new MockLanguageModelV4({doGenerate:responses});
 const research=Object.assign(api.createResearch({inputPrice:0.1,outputPrice:0.3,model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown()}),{write:undefined});
 const deps={asset,origin:'https://opax.com.au',kb:async()=>({}),generate:async()=>{throw new Error('planner called')},research,onResearchFailure:async()=>{}};
 return {model,run:q=>api.runAgentic(q,deps,async()=>{},40_000,api.inferPeriod(q),{},emptyScope)};
}
// What the reader gets in route mode, as index.ts finishes it: a calculated pay answer is shown as the calculator wrote it.
const shown=(run,q)=>{const p=api.agenticAskPayload(run,q);assert.equal(api.calculatedPayAnswer(p),true);return p};
const sentences=text=>text.replace(/\*\*/g,'').split('\n\n')[0].match(/[^.!?]+[.!?]+(?=\s|$)/g).slice(0,2).map(s=>s.trim());
const bounds=p=>{for(const ranges of Object.values(p.citations))for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(p.answer).length,`${a}-${b}`)};

test('"Who is the highest paid agency head?" leads with the set rate, then one line on what the annual reports published',async()=>{
 const f=routed(),q='Who is the highest paid agency head?',run=await f.run(q);
 assert.equal(f.model.doGenerateCalls.length,0);
 assert.deepEqual(run.steps.map(s=>s.tool),['paid_answer']);
 const p=shown(run,q);
 const [first,second]=sentences(p.answer);
 assert.equal(first,'The Secretary of the Department of the Prime Minister and Cabinet is the highest paid agency head: $1,035,690 a year in total remuneration.');
 assert.match(second,/^Next are the Secretary to the Treasury \(\$1,009,790\)/);
 // The one line: reported pay can differ, with the top published agency-head figure and its annual report cited.
 const lead=p.answer.split('\n\n')[0];
 assert.match(lead,/Total remuneration reported in annual reports can differ from these set rates, and includes company heads the Tribunal does not pay: the highest an agency head’s annual report published for 2024-25 is \$3,302,619, for Paul Graham \(/);
 const report=p.sources.find(s=>/annual report 2024-25$/.test(s.title));
 assert.ok(report,'the annual report is a source');assert.match(report.snippet,/\$3,302,619/);
 assert.ok(p.citations[report.resource]?.length);
 // The set rates are cited to the Remuneration Tribunal determinations on the FRL.
 assert.ok(p.sources.some(s=>/legislation\.gov\.au\/F\d{4}L\d{5}/.test(s.url)&&s.cited));
 assert.match(p.answer,/\| 1 \| Secretary of the Department of the Prime Minister and Cabinet \| Level 1 \| \$1,035,690 \|/);
 bounds(p);
});

test('"How much is a federal backbencher paid?" answers in full sentences from the determination',async()=>{
 const f=routed(),q='How much is a federal backbencher paid?',run=await f.run(q);
 assert.equal(f.model.doGenerateCalls.length,0);
 const p=shown(run,q);
 assert.deepEqual(sentences(p.answer),['A federal backbencher’s base salary is $239,270 a year, for senators and members alike, since 1 July 2025.','Ministers and other office holders receive an additional percentage of base on top, from 3% to 160% for the Prime Minister.']);
 // Each source snippet stands as a sentence on its own: no "Base salary $239,270 (section 7)." fragments.
 const determination=p.sources.find(s=>/section 7/.test(s.snippet));
 assert.equal(determination.snippet,'A federal backbencher’s base salary is $239,270 a year, since 1 July 2025 (Remuneration Tribunal determination, section 7).');
 assert.ok(p.sources.some(s=>s.snippet==='Ministers and other office holders receive an additional salary on top of the base, set as a percentage of the base salary.'));
 for(const s of p.sources)assert.doesNotMatch(s.snippet,/^Base salary \$|^The additional salary of each/);
 bounds(p);
});

test('"What is the Commonwealth Ombudsman\'s salary?" is the office\'s set rate, with the possessive read as the name',async()=>{
 const f=routed(),q="What is the Commonwealth Ombudsman's salary?",run=await f.run(q);
 assert.equal(f.model.doGenerateCalls.length,0);
 const p=shown(run,q);
 const [first,second]=sentences(p.answer);
 assert.equal(first,'The Commonwealth Ombudsman is paid $533,550 a year in total remuneration, as at 22 October 2026.');
 assert.match(second,/^The determination names Iain Anderson as the holder \(s 15, Table 3B item \d+\)\.$/);
 assert.ok(p.sources.some(s=>/^Commonwealth Ombudsman: \$533,550 a year in total remuneration, s 10/.test(s.snippet)&&/legislation\.gov\.au/.test(s.url)));
 bounds(p);
});

test('"Highest paid public servant in 2024-25 by total remuneration?" is reported pay: the loop reads annual_reports first',async()=>{
 const q='Highest paid public servant in 2024-25 by total remuneration?';
 assert.equal(await api.routedPayAnswer({question:q},{asset,origin:'https://opax.com.au'}),null);
 const c=api.extractAskConstraints(q,api.inferPeriod(q),emptyScope,{});
 assert.equal(c.agencyHeadRanking,true);assert.equal(c.remunerationYear,'2024-25');
 // The mock model declines at once; what matters is what research ran before it.
 const f=routed(()=>reply([call('decline',{reason:'out_of_scope'})])),run=await f.run(q);
 assert.ok(f.model.doGenerateCalls.length>=1);
 const prompt=JSON.stringify(f.model.doGenerateCalls[0].prompt);
 assert.match(prompt,/prior_records/);assert.match(prompt,/agency-head remuneration rows for 2024-25/);assert.match(prompt,/Paul Graham/);
 assert.ok(!run.steps.some(s=>s.tool==='paid_answer'));
 // The prompt names both sources and when each fits.
 assert.match(prompt,/Pay has two sources\. paid_answer gives the rate the Remuneration Tribunal sets/);
 assert.match(prompt,/annual_reports gives the total remuneration each body reported for a reporting year/);
 assert.doesNotMatch(prompt,/For departmental secretaries use annual_reports/);
});

test('set-rate wording versus reported wording',async()=>{
 const set=['Who is the highest paid public servant?','What is the Secretary of the Department of Finance paid?','How much are Principal Executive Offices paid?','Compare the Treasury Secretary\'s pay with the Prime Minister\'s'];
 for(const q of set)assert.ok(await api.routedPayAnswer({question:q},{asset,origin:'https://opax.com.au'}),q);
 const reported=['What was the Secretary of the Department of Finance paid in 2023-24?','What is the Ombudsman\'s total remuneration?','Which agency head was actually paid the most according to annual reports?'];
 for(const q of reported)assert.equal(await api.routedPayAnswer({question:q},{asset,origin:'https://opax.com.au'}),null,q);
 // A secretaries-only ranking is not given an agency-head figure that may not be a secretary.
 const secretaries=await api.routedPayAnswer({question:'Top 10 highest paid departmental secretaries'},{asset,origin:'https://opax.com.au'});
 assert.doesNotMatch(secretaries.answer,/annual reports can differ/);
});
