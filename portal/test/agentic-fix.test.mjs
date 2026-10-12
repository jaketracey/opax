import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fixtureDeps} from './fixtures/agentic-route.mjs';
import {ordinaryQuestions} from './fixtures/agentic-ordinary.mjs';
const load=async file=>{const out=await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'))};
const {classifyAgentic,runAgentic,verifyComposition,agenticCacheKey,inferPeriod}=await load('../src/agentic-ask.ts');
const {agenticAskPayload}=await load('../src/agentic-response.ts');

test('P1 classifier: reviewer questions and twenty more ordinary questions must not route',()=>{
 assert.equal(ordinaryQuestions.length,28);
 for(const q of ordinaryQuestions)assert.equal(classifyAgentic(q).route,'ask',q);
});
test('P1 entity figures: swapped counts fail verification and comparison renders tool rows',async()=>{
 const facts=[{id:1,text:'Taylor Example: 87 chamber speeches labelled housing',cite:{}},{id:2,text:'Pat Example: 60 chamber speeches labelled housing',cite:{}}];
 const swap='Pat Example made 87 speeches [1]. Taylor Example made 60 speeches [2].';
 assert.equal(verifyComposition(swap,facts).dropped,2);
 assert.equal(verifyComposition('Pat Example made 87 speeches and Taylor Example made 60 speeches [1][2].',facts).dropped,1);
 const r=await runAgentic('Compare how many speeches Taylor Example and Pat Example made about housing',{...fixtureDeps,
  generate:async(_q,p)=>({text:p.user.includes('Plan the record')?JSON.stringify({shape:'comparison',steps:['Taylor Example','Pat Example'].map(speaker=>({tool:'count_speeches',args:{topic:'housing',speaker,group_by:'none'}}))}):swap}),
  kb:async(_p,b)=>({fulltext:{total:JSON.stringify(b).includes('Pat Example')?60:87,facets:{}}})});
 assert.equal(r.answered,true);assert.equal(r.answer_source,'template');
 assert.match(r.answer,/87 chamber speeches labelled housing by Taylor Example/);assert.match(r.answer,/60 chamber speeches labelled housing by Pat Example/);
});
test('P1 unknown subject: an unscoped valid planner must never answer quantum dragons',async()=>{
 let tools=0;const r=await runAgentic('Who has spoken most about quantum dragons?',{...fixtureDeps,
  generate:async()=>({text:'{"shape":"ranking","steps":[{"tool":"count_speeches","args":{"group_by":"speaker"}}]}'}),kb:async(...a)=>{tools++;return fixtureDeps.kb(...a)}});
 assert.equal(r.answered,false);assert.equal(r.reason,'declined');assert.equal(tools,0);
});
test('P1 planner junk: malformed plans decline without starting tools',async()=>{
 for(const text of ['junk','{}','{"shape":"ranking","steps":[]}']){
  let tools=0;const r=await runAgentic('Who has spoken most about gambling?',{...fixtureDeps,generate:async()=>({text}),kb:async(...a)=>{tools++;return fixtureDeps.kb(...a)}});
  assert.equal(r.answered,false,text);assert.equal(r.reason,'declined');assert.equal(tools,0);
 }
});
test('P1 cache: classification and keys share punctuation normalization and include shape and period',async()=>{
 const a='Which MPs have spoken most about housing over time?',b='Which MPs have spoken most about housing over-time?';
 assert.equal(classifyAgentic(a).shape,'trend');assert.deepEqual(classifyAgentic(a),classifyAgentic(b));
 assert.equal(await agenticCacheKey(a,'epoch','model'),await agenticCacheKey(b,'epoch','model'));
 assert.notEqual(await agenticCacheKey(a,'epoch','model'),await agenticCacheKey(a,'epoch','model',inferPeriod(a,'current')));
 // A classifier revision resolving the same text to another shape cannot
 // read a cached answer produced by the previous shape.
 assert.notEqual(await agenticCacheKey(a,'epoch','model',inferPeriod(a),'tools',{},'trend'),await agenticCacheKey(a,'epoch','model',inferPeriod(a),'tools',{},'ranking'));
});
test('P2 other-period follow-up preserves speaker, party, parliament and chamber',async()=>{
 const r=await runAgentic('How many speeches has Taylor Example made about housing?',{...fixtureDeps,
 generate:async()=>({text:'{"shape":"trend","steps":[{"tool":"count_speeches","args":{"topic":"housing","speaker":"Taylor Example","party":"Greens","state":"federal","chamber":"senate","group_by":"none"}}]}'})});
 const p=agenticAskPayload(r,'fixture');assert.match(p.followups[0].question,/Taylor Example.*housing.*Greens.*federal parliament.*senate.*current parliament/);
});
