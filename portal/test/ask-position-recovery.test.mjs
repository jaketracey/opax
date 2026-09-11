import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';

const bundle=await build({entryPoints:[new URL('../src/search-summary.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const helpers=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function recoverPositionAnswer(');
const code=source.slice(start,source.indexOf('/** A short overview grounded',start));
const quote='I propose a five-year moratorium on GST for essential building materials for homes up to $1 million.';
const payload={answer:'An uncited draft.',citations:{},scope:{speaker:'Example MP',kind:'speech'},sources:[{resource:'rid',slug:'speech-1',title:'Example MP — 2025-02-11',href:'/doc/speech-1',kind:'speech',speaker:'Example MP',snippet:quote,cited:false}]};
const draft=(excerpt=quote)=>JSON.stringify({points:[{text:'Example MP proposed a five-year GST moratorium for essential building materials for homes up to $1 million.',citations:[{id:'s1',quote:excerpt}]}]});
function harness(answer){let calls=0;const recover=runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';recoverPositionAnswer',{...helpers,AbortSignal,Intl,Date,kbFetch:async()=>{calls++;return Response.json({answer})}});return {recover,get calls(){return calls}};}

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
