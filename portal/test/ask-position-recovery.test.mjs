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
 const h=harness(draft());const rows=Array.from({length:8},(_,i)=>({...payload.sources[0],href:'/doc/speech-'+(i+1),snippet:quote+' More original evidence.'.repeat(255)}));
 await h.recover({...payload,sources:rows},{query:'housing'},{});
 assert.equal(h.calls,1);assert.ok(h.request.body.query.length<=19500);assert.ok(h.request.body.query.includes(quote));assert.ok(!h.request.body.query.includes('"id":"s8"'));
});
test('a record title alone cannot serve as a verified position quotation',async()=>{
 const h=harness(draft());assert.equal(await h.recover({...payload,sources:[{...payload.sources[0],title:quote,snippet:'This speech contains only a discussion of parliamentary procedure and no housing proposal.'}]},{query:'housing'},{}),null);
});
test('an irrelevant policy point cannot discard or contaminate the verified housing proposal',async()=>{
 const unrelated='I called for an inquiry into the NDIS and its support coordination costs.';
 const answer=JSON.stringify({points:[...JSON.parse(draft()).points,{text:'Example MP called for an inquiry into the NDIS and support coordination costs, but did not tie this to housing affordability.',citations:[{id:'s2',quote:unrelated}]}]});
 const h=harness(answer);const out=await h.recover({...payload,sources:[...payload.sources,{...payload.sources[0],href:'/doc/speech-2',snippet:unrelated}]},{query:'housing affordability'},{});
 assert.match(out.answer,/five-year/);assert.doesNotMatch(out.answer,/NDIS/);assert.equal(out.sources.length,1);assert.equal(Object.keys(out.citations).length,1);
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
