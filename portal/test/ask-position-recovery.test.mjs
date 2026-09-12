import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';

const bundle=await build({entryPoints:[new URL('../src/search-summary.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const helpers=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const evidenceBundle=await build({entryPoints:[new URL('../src/position-evidence.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const evidenceHelpers=await import('data:text/javascript;base64,'+Buffer.from(evidenceBundle.outputFiles[0].text).toString('base64'));
const source=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function recoverPositionAnswer(');
const code=source.slice(start,source.indexOf('/** A short overview grounded',start));
const quote='I propose a five-year moratorium on GST for essential building materials for homes up to $1 million.';
const payload={answer:'An uncited draft.',citations:{},scope:{speaker:'Example MP',kind:'speech'},sources:[{resource:'rid',slug:'speech-1',title:'Example MP — 2025-02-11',href:'/doc/speech-1',kind:'speech',speaker:'Example MP',snippet:quote,cited:false}]};
const draft=(excerpt=quote)=>JSON.stringify({points:[{text:'Example MP proposed a five-year GST moratorium for essential building materials for homes up to $1 million.',citations:[{id:'s1',quote:excerpt}]}]});
function harness(answer){let calls=0,request;const recover=runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';recoverPositionAnswer',{...helpers,...evidenceHelpers,POSITION_GROUNDING:'Ground positions.',AbortSignal,Intl,Date,kbFetch:async(e,p,r)=>{calls++;request=r;return Response.json({answer})}});return {recover,get calls(){return calls},get request(){return request}};}

test('position recovery binds every displayed point to a verified original excerpt and dated record',async()=>{
 const h=harness(draft());const out=await h.recover(payload,{query:'housing'},{});
 assert.equal(h.calls,1);assert.match(out.answer,/11 Feb 2025/);assert.match(out.answer,/five-year/);
 assert.equal(out.sources[0].href,'/doc/speech-1');assert.equal(out.sources[0].snippet,quote);assert.equal(out.sources[0].cited,true);
 for(const [id,ranges] of Object.entries(out.citations)){assert.ok(out.sources.some(s=>s.resource===id));for(const [start,end] of ranges)assert.ok(start>=0&&end<=Array.from(out.answer).length);}
});
test('unverifiable position recovery does not turn fabricated excerpts into citations',async()=>{
 const h=harness(draft('This fabricated sentence does not exist in the speech.'));
 assert.equal(await h.recover(payload,{query:'housing'},{}),null);assert.equal(h.calls,1);
});
test('position recovery does not invent a dated answer from empty sources',async()=>{
 const h=harness(draft());assert.equal(await h.recover({...payload,sources:[]},{query:'housing'},{}),null);assert.equal(h.calls,0);
});
test('the first ranked sources fit the provider query limit without removing their policy conditions',async()=>{
 const h=harness(draft());const rows=Array.from({length:12},(_,i)=>({...payload.sources[0],href:'/doc/speech-'+(i+1),snippet:quote+' More original evidence.'.repeat(255)}));
 await h.recover({...payload,sources:rows},{query:'housing'},{});
 const user=h.request.body.prompt.user;
 assert.equal(h.calls,1);assert.ok(h.request.body.query.length<=2000);assert.ok(user.length<=60000+40);assert.ok(user.includes(quote));assert.ok(user.includes('"id":"s8"'));assert.ok(!user.includes('"id":"s10"'));
 assert.ok(user.endsWith('{question}'));const body=user.slice(0,user.lastIndexOf('{question}'));assert.ok(!/(^|[^{])\{(?!\{)/.test(body)&&!/(^|[^}])\}(?!\})/.test(body),'literal braces are doubled for the format-style template');
});
test('a record title alone cannot serve as a verified position quotation',async()=>{
 const h=harness(draft());assert.equal(await h.recover({...payload,sources:[{...payload.sources[0],title:quote,snippet:'This speech contains only a discussion of parliamentary procedure and no housing proposal.'}]},{query:'housing'},{}),null);
});
test('an irrelevant policy point cannot discard or contaminate the verified housing proposal',async()=>{
 const unrelated='I called for an inquiry into the NDIS and its support coordination costs.';
 const answer=JSON.stringify({points:[...JSON.parse(draft()).points,{text:'Example MP called for an inquiry into the NDIS and support coordination costs, but did not tie this to housing affordability.',citations:[{id:'s2',quote:unrelated}]}]});
 const h=harness(answer);const out=await h.recover({...payload,sources:[...payload.sources,{...payload.sources[0],href:'/doc/speech-2',snippet:unrelated}]},{query:'housing affordability'},{});
 assert.match(out.answer,/five-year/);assert.doesNotMatch(out.answer,/NDIS/);assert.equal(out.sources.filter(s=>s.cited).length,1);assert.equal(out.sources.length,2);assert.equal(out.sources[1].cited,false);assert.equal(Object.keys(out.citations).length,1);
});

const fallbackStart=source.indexOf('function quotedPositionAnswer(');
const fallbackCode=source.slice(fallbackStart,source.indexOf('/** Recover a position',fallbackStart));
const fallback=runInNewContext(ts.transpileModule(fallbackCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';quotedPositionAnswer',{...helpers,...evidenceHelpers,Intl,Date});
test('failed generation can still show a dated verbatim proposal with valid citations',()=>{
 const out=fallback(payload,'housing affordability');assert.equal(out.answer_status,'evidence_only');assert.equal(out.evidence_kind,'original_position_proposal');assert.match(out.answer,/11 Feb 2025/);assert.ok(out.answer.includes('> '+quote));
 assert.equal(out.sources[0].snippet,quote);assert.equal(out.sources[0].href,'/doc/speech-1');
 for(const ranges of Object.values(out.citations))for(const [start,end] of ranges)assert.ok(start>=0&&end<=Array.from(out.answer).length);
 assert.equal(fallback({...payload,sources:[{...payload.sources[0],snippet:'I proposed an inquiry into the NDIS and the cost of support coordination.'}]},'housing affordability'),null);
});

test('generation receives the current follow-up separately from its resolved retrieval topic',async()=>{
 const h=harness(draft());await h.recover(payload,{query:'housing',position_question:'When did she propose it?'},{});
 assert.equal(h.request.body.query,'When did she propose it?');
 assert.ok(h.request.body.prompt.user.includes('Latest reader question: "When did she propose it?"'));
 assert.match(h.request.body.prompt.user,/Answer that latest question specifically/);
});
test('a summary cannot merge proposal conditions from different dated speeches',async()=>{
 const h=harness(JSON.stringify({points:[{text:'Example MP proposed a five-year GST moratorium for homes up to $1 million.',citations:[{id:'s1',quote},{id:'s2',quote}]}]}));
 assert.equal(await h.recover({...payload,sources:[...payload.sources,{...payload.sources[0],resource:'other',href:'/doc/speech-2',date:'2026-01-01'}]},{query:'housing'},{}),null);
});

test('a missing cost or reason never falls back to a generic policy quote',()=>{
 for(const q of ['What did it cost?','Why did she propose it?','How long would it last?','And how long would it last?'])assert.equal(fallback(payload,'housing',q),null);
 assert.equal(fallback(payload,'housing','What cap did she propose?').answer_status,'evidence_only');
});

test('a cap follow-up cannot borrow an unquoted waiting period or substitute another immigration policy',async()=>{
 const cap="One Nation's policy is to cap immigration at approximately 130,000 per year, numbers we can actually accommodate.";
 const other='Under our policy, immigration from nations known to foster extremism will be prohibited.';
 const h=harness(JSON.stringify({points:[
  {text:'Example MP proposed capping immigration at 130,000 per year, with an eight-year waiting period for citizenship.',citations:[{id:'s1',quote:cap}]},
  {text:'Example MP proposed prohibiting immigration from nations known to foster extremism.',citations:[{id:'s2',quote:other}]}
 ]}));
 const rows=[{...payload.sources[0],snippet:cap+' A separate eight-year proposal was discussed.'},{...payload.sources[0],href:'/doc/speech-2',snippet:other}];
 assert.equal(await h.recover({...payload,sources:rows},{query:'immigration cap',position_question:'What cap did she propose?'},{}),null);
});

test('a supported cap survives while unrelated immigration policies are omitted',async()=>{
 const cap='We propose an immigration cap of 130,000 per year.';
 const other='We propose stricter immigration screening to exclude security threats.';
 const h=harness(JSON.stringify({points:[
  {text:'Example MP proposed an immigration cap of 130,000 per year.',citations:[{id:'s1',quote:cap}]},
  {text:'Example MP proposed stricter immigration screening.',citations:[{id:'s2',quote:other}]}
 ]}));
 const out=await h.recover({...payload,sources:[{...payload.sources[0],snippet:cap},{...payload.sources[0],href:'/doc/speech-2',snippet:other}]},{query:'immigration cap',position_question:'What cap did she propose?'},{});
 assert.match(out.answer,/130,000/);assert.doesNotMatch(out.answer,/screening/);assert.equal(out.sources.filter(s=>s.cited).length,1);assert.equal(out.sources.length,2);assert.ok(!out.sources[1].cited && !(out.sources[1].resource in out.citations));
});

test('rent definitions retain both quoted percentages and their lower-of condition',()=>{
 const evidence='Affordable rent is a maximum of 75% of market rent or 30% of household income, if that is lower.';
 assert.equal(evidenceHelpers.positionPointSupported('Rent would be capped at 75% of market rent or 30% of household income.',evidence,'What rent limit did he propose?'),false);
 assert.equal(evidenceHelpers.positionPointSupported('In 2026 he proposed rent capped at 75% of market rent or 30% of household income, whichever is lower.',evidence,'What rent limit did he propose?','2026-07-02'),true);
 assert.equal(evidenceHelpers.positionPointSupported('Rent would be capped at 80% of market rent.',evidence,'What rent limit did he propose?'),false);
});

test('two points citing the same speech cannot borrow each others excerpts',async()=>{
 const cap='We propose an immigration cap of 130,000 per year.';
 const other='We propose stricter immigration screening to exclude security threats.';
 const h=harness(JSON.stringify({points:[
  {text:'Example MP proposed an immigration cap of 130,000 per year, with an eight-year waiting period.',citations:[{id:'s1',quote:cap}]},
  {text:'Example MP proposed stricter immigration screening.',citations:[{id:'s1',quote:other}]}
 ]}));
 const rows=[{...payload.sources[0],snippet:cap+' '+other+' An eight-year period was mentioned elsewhere.'}];
 assert.equal(await h.recover({...payload,sources:rows},{query:'immigration cap',position_question:'What cap did she propose?'},{}),null);
});

test('discarded points do not leave their excerpts in the surviving source citation',async()=>{
 const cap='We propose an immigration cap of 130,000 per year.';
 const other='We propose stricter immigration screening to exclude security threats.';
 const h=harness(JSON.stringify({points:[
  {text:'Example MP proposed an immigration cap of 130,000 per year.',citations:[{id:'s1',quote:cap}]},
  {text:'Example MP proposed stricter immigration screening.',citations:[{id:'s1',quote:other}]}
 ]}));
 const out=await h.recover({...payload,sources:[{...payload.sources[0],snippet:cap+' '+other}]},{query:'immigration cap',position_question:'What cap did she propose?'},{});
 assert.match(out.answer,/130,000/);assert.doesNotMatch(out.answer,/screening/);assert.equal(out.sources[0].snippet,cap);
});

test('a source month cannot support an unquoted eight-year policy duration',async()=>{
 const cap="One Nation's policy is to cap immigration at approximately 130,000 per year, numbers we can actually accommodate.";
 const h=harness(JSON.stringify({points:[{text:'Example MP proposed capping immigration at approximately 130,000 per year, with an eight-year waiting period for citizenship.',citations:[{id:'s1',quote:cap}]}]}));
 const rows=[{...payload.sources[0],date:'2025-08-26',snippet:cap}];
 assert.equal(await h.recover({...payload,sources:rows},{query:'immigration cap',position_question:'What cap did she propose?'},{}),null);
 assert.equal(evidenceHelpers.positionPointSupported('The immigration cap would be 2025 per year.',cap,'What cap did she propose?','2025-08-26'),false);
});

test('the speech year is accepted as a date phrase but never as a policy quantity',()=>{
 const quote='This bill, the Coal Prohibition (Quit Coal) Bill 2019, will do what the science demands.';
 assert.equal(evidenceHelpers.positionPointSupported('He introduced the Quit Coal Bill 2019 to prohibit thermal coal exports after 2030.',quote,'What has he said about coal?','2019-02-18'),false,'a figure outside the excerpt is unsupported');
 const budget='The budget smashes the universality of Medicare by adding a $7 co-payment.';
 assert.equal(evidenceHelpers.positionPointSupported('Albanese criticised the 2014 Abbott budget for adding a $7 co-payment to see a doctor.',budget,'What has he said about Medicare?','2014-05-27'),true);
 assert.equal(evidenceHelpers.positionPointSupported('The immigration cap would be 2014 per year.','We will cap arrivals.','What cap did he propose?','2014-05-27'),false);
});
