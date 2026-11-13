import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {withoutSaLabel} from './fixtures/ask-attribution.mjs';
import {saEvidenceText,saEvidenceRecord,saGenerationContext,saConversationInput} from './sa-evidence-harness.mjs';
import {saDisplayPayload,saExcerpt} from '../public/sa-hansard.js';
import {saPublicResponse,saEventPayload} from '../src/sa-hansard.ts';
const built=await build({entryPoints:[new URL('../src/research-evidence.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {verifyResearchAnswer,verifyResearchPoints}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const roster={people:[{name:'Jacqui Lambie'},{name:'Kerrynne Liddle'},{name:'Pat Lee'},{name:'Taylor Lee'},{name:'Liddle'},{name:'On'},{name:'David'}]},id='r1/t/body/0-200',quote='I am proud to call Alice Springs home. Housing safeguards are needed.';
const passage={id,resource:'r1',slug:'speech-1',title:'Housing debate',url:'https://opax.com.au/doc/speech-1',text:quote,kind:'speech',speaker:'Kerrynne Liddle'};
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const draft=who=>{const text=`${who} said: “${quote}”`;return {text,citations:[{id,quote,start:0,end:Array.from(text).length}]}};
const oldPayload=text=>({answer:text,citations:{[id]:[[Array.from(text).length-1,Array.from(text).length]]},sources:[{...passage,href:passage.url,cited:true}]});
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
 // The verifier keeps the draft; the SA label cleanup removes the placeholder before display and storage.
 assert.doesNotMatch(JSON.stringify(withoutSaLabel(verifyResearchAnswer(poisoned,new Map([[id,{...passage,text:omitted}]]),'housing',scope,undefined,roster))),/Excerpt omitted/);
});
test('SA placeholder quotes and their citations disappear at JSON, stream done and cache-storage boundaries',async()=>{
 const answer='😀 “'+omitted+'” '+quote,start=2,end=2+Array.from('“'+omitted+'”').length;
 const payload={answer,citations:{[id]:[[start,end]]},sources:[{...passage,state:'sa',url:'https://www.parliament.sa.gov.au/hansard/record',snippet:omitted,cited:true,answer_ranges:[[start,end]]}]};
 for(const flag of ['false','true']){
  const publicPayload=await(await saPublicResponse(Response.json(payload),flag,async()=>null)).json();assert.doesNotMatch(JSON.stringify(publicPayload),/Excerpt omitted/);assert.deepEqual(publicPayload.citations,{});assert.equal(publicPayload.sources[0].cited,false);assert.deepEqual(publicPayload.sources[0].answer_ranges,[]);
  const streamed=await saEventPayload('done',payload,flag,async()=>null);assert.doesNotMatch(JSON.stringify(streamed),/Excerpt omitted/);assert.deepEqual(streamed.citations,{});
 }
 assert.doesNotMatch(JSON.stringify(withoutSaLabel(payload)),/Excerpt omitted/);
 const limited=saDisplayPayload({answer:'“'+quote+'”',sources:[{...payload.sources[0],url:'https://example.test/not-official'}]},'false');assert.doesNotMatch(limited.answer,/Excerpt omitted|“”/);
});

test('a named speaker\'s bare surname is written in full; other names are kept as written',()=>{
 const pat={...passage,speaker:'Pat Lee',text:quote},passages=new Map([[id,pat]]),named={...scope,people:['Pat Lee']};
 const out=verifyResearchPoints([{claim:'Lee said housing safeguards are needed.',id,quote:'Housing safeguards are needed.'}],passages,'What has Pat Lee said about housing?',named,undefined,roster);
 assert.ok(out);assert.match(out.answer,/^- Pat Lee said housing/);
 // Minimum checks: attribution is no longer rewritten or cut; the point is kept as drafted.
 assert.match(verifyResearchPoints([{claim:'Lee said housing safeguards are needed.',id,quote:'Housing safeguards are needed.'}],passages,'What has been said about housing?',scope,undefined,roster).answer,/^- Lee said housing safeguards are needed\.$/);
 assert.match(verifyResearchPoints([{claim:'Taylor Lee said housing safeguards are needed.',id,quote:'Housing safeguards are needed.'}],passages,'What has Pat Lee said about housing?',named,undefined,roster).answer,/^- Taylor Lee said housing safeguards are needed\.$/);
});
