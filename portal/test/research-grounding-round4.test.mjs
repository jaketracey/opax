import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {claimMatchesSpeaker,guardAnswerAttribution} from './fixtures/ask-attribution.mjs';
import {saEvidenceText,saEvidenceRecord,saGenerationContext,saConversationInput} from './sa-evidence-harness.mjs';
import {saDisplayPayload,saExcerpt} from '../public/sa-hansard.js';
import {saPublicResponse,saEventPayload} from '../src/sa-hansard.ts';
const built=await build({entryPoints:[new URL('../src/research-evidence.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {verifyResearchAnswer}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const roster={people:[{name:'Jacqui Lambie'},{name:'Kerrynne Liddle'},{name:'Pat Lee'},{name:'Taylor Lee'},{name:'Liddle'},{name:'On'},{name:'David'}]},id='r1/t/body/0-200',quote='I am proud to call Alice Springs home. Housing safeguards are needed.';
const passage={id,resource:'r1',slug:'speech-1',title:'Housing debate',url:'https://opax.com.au/doc/speech-1',text:quote,kind:'speech',speaker:'Kerrynne Liddle'};
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const draft=who=>{const text=`${who} said: “${quote}”`;return {text,citations:[{id,quote,start:0,end:Array.from(text).length}]}};
const oldPayload=text=>({answer:text,citations:{[id]:[[Array.from(text).length-1,Array.from(text).length]]},sources:[{...passage,href:passage.url,cited:true}]});
test('H04 full names, surnames and possessives cannot attribute Liddle’s home remarks to Lambie, in either engine',()=>{
 for(const who of ['Jacqui Lambie','Lambie','Lambie’s','Lambie\'s']){
  const claim=draft(who);assert.equal(verifyResearchAnswer(claim,new Map([[id,passage]]),'housing',scope,undefined,roster),null);
  const old=guardAnswerAttribution(oldPayload(claim.text),roster);assert.equal(old.answer_status,'evidence_gap');assert.deepEqual(old.citations,{});assert.equal(old.sources[0].cited,false);
 }
 for(const who of ['Kerrynne Liddle','Liddle','Liddle’s']){const claim=draft(who);assert.ok(verifyResearchAnswer(claim,new Map([[id,passage]]),'housing',scope,undefined,roster));assert.equal(guardAnswerAttribution(oldPayload(claim.text),roster).answer,claim.text);}
 assert.equal(claimMatchesSpeaker('Lee said housing needs safeguards.','Pat Lee',roster),false,'an ambiguous surname is insufficient');
 assert.equal(claimMatchesSpeaker('On housing, Liddle called for safeguards.','Kerrynne Liddle',roster),true,'fragments are aliases, not additional people');
 assert.equal(claimMatchesSpeaker('Pat Lee said housing needs safeguards.','Pat Lee',roster),true,'a full name resolves shared surnames');
});
test('ordinary Ask cannot leave a person named outside the citation range unbound',()=>{
 const text='Lambie said housing needs safeguards.\n\n'+quote;
 const old=oldPayload(text);old.citations[id]=[[Array.from(text).length-quote.length,Array.from(text).length]];
 assert.equal(guardAnswerAttribution(old,roster).answer_status,'evidence_gap');
});
test('ordinary Ask keeps a valid two-speaker paragraph when each claim has its own citation',()=>{
 const first='Liddle argued for housing safeguards.',second=' Lambie discussed parliamentary scrutiny.',answer=first+second;
 const payload={answer,citations:{[id]:[[first.length-1,first.length]],'r2/t/body/0-100':[[answer.length-1,answer.length]]},sources:[{...passage},{...passage,resource:'r2',speaker:'Jacqui Lambie'}]};
 assert.equal(guardAnswerAttribution(payload,roster).answer,answer);assert.equal(Object.keys(guardAnswerAttribution(payload,roster).citations).length,2);
});
const omitted='Excerpt omitted; see the official record.',raw='The House heard “'+omitted+'” and discussed housing.';
test('SA placeholders are removed from evidence before either model, with or without full-text permission',()=>{
 for(const flag of ['false','true'])for(const record of [{kind:'speech',state:'sa',url:'https://www.parliament.sa.gov.au/hansard/record'},{kind:'speech',state:'federal'}]){
  assert.doesNotMatch(saEvidenceText(record,raw,flag),/Excerpt omitted/);
  const source=saEvidenceRecord({...record,text:raw,quote:omitted,evidence:[omitted],quotes:[omitted]},flag);assert.doesNotMatch(JSON.stringify(source),/Excerpt omitted/);
  const prepared=saGenerationContext({query:'housing',extra_context:[JSON.stringify({...record,text:raw})],chat_history:[{author:'NUCLIA',text:raw}]},{retrieval_results:{resources:{r1:{...record,fields:{body:{paragraphs:{[id]:{text:raw}}}}}}}},flag);
  assert.doesNotMatch(JSON.stringify(prepared),/Excerpt omitted/);assert.doesNotThrow(()=>JSON.parse(prepared.request.query_context.USER_CONTEXT_0));
  assert.doesNotMatch(JSON.stringify(saConversationInput({context:[{author:'answer',text:raw,sources:[record]}]},flag)),/Excerpt omitted/);
 }
 assert.equal(saExcerpt(omitted),'');
 assert.equal(saExcerpt('[SA Hansard excerpt omitted; see the official record]'),'');
 const poisoned={...draft('Liddle'),text:omitted,citations:[{id,quote:omitted,start:0,end:omitted.length}]};
 assert.equal(verifyResearchAnswer(poisoned,new Map([[id,{...passage,text:omitted}]]),'housing',scope,undefined,roster),null);
});
test('SA placeholder quotes and their citations disappear at JSON, stream done and cache-storage boundaries',async()=>{
 const answer='😀 “'+omitted+'” '+quote,start=2,end=2+Array.from('“'+omitted+'”').length;
 const payload={answer,citations:{[id]:[[start,end]]},sources:[{...passage,state:'sa',url:'https://www.parliament.sa.gov.au/hansard/record',snippet:omitted,cited:true,answer_ranges:[[start,end]]}]};
 for(const flag of ['false','true']){
  const publicPayload=await(await saPublicResponse(Response.json(payload),flag,async()=>null)).json();assert.doesNotMatch(JSON.stringify(publicPayload),/Excerpt omitted/);assert.deepEqual(publicPayload.citations,{});assert.equal(publicPayload.sources[0].cited,false);assert.deepEqual(publicPayload.sources[0].answer_ranges,[]);
  const streamed=await saEventPayload('done',payload,flag,async()=>null);assert.doesNotMatch(JSON.stringify(streamed),/Excerpt omitted/);assert.deepEqual(streamed.citations,{});
 }
 assert.doesNotMatch(JSON.stringify(guardAnswerAttribution(payload,roster)),/Excerpt omitted/);
 const limited=saDisplayPayload({answer:'“'+quote+'”',sources:[{...payload.sources[0],url:'https://example.test/not-official'}]},'false');assert.doesNotMatch(limited.answer,/Excerpt omitted|“”/);
});
