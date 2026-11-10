import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {loadWorker, offline, outbound} from './worker-harness.mjs';
const built=await build({entryPoints:[new URL('../src/ask-identity.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {identityAnswer,identityResponse}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url)));
const deps=(people,extra={})=>({origin:'https://example.test',kb:async()=>{throw Error('Identity facts must not search speeches')},asset:async path=>path==='/parliamentarians.json'?{people}:extra[path]??null});
const lookup=(question,people=roster.people,extra={},input={})=>identityAnswer({question,...input},deps(people,extra));
const valid=payload=>{
 assert.ok(payload?.identity_fact);
 assert.notEqual(payload.answer,'This selection does not establish their position on that topic.');
 for(const [id,ranges] of Object.entries(payload.citations)){
  const source=payload.sources.find(s=>s.resource===id.split('/')[0]);assert.equal(source.kind,'person');assert.equal(source.cited,true);
  for(const [start,end] of ranges)assert.equal(Array.from(payload.answer).slice(start,end).join(''),source.snippet);
 }
};
test('party facts come from find_people current affiliation, with a person citation',async()=>{
 for(const [name,party] of [['Jacqui Lambie','JLN'],['Bob Katter',"Katter's Australian Party"],['Fatima Payman',"Australia's Voice"],['Stirling Griff','Centre Alliance']]){
  const answer=await lookup(`Which party is ${name} with?`);valid(answer);assert.ok(answer.answer.includes(party));assert.ok(answer.sources[0].url.endsWith(encodeURIComponent(name)));
 }
});
test('representation provides chamber and electorate, independently of speech venues',async()=>{
 const p={name:'Alex Example',party:'Independent',speeches:400,first:1990,last:2026,chambers:['senate_committee','representatives','joint_committee'],representation:[{electorate:'Tasmania',jurisdiction:'federal',chamber:'senate'}]};
 const chamber=await lookup('Which chamber does Alex Example sit in?',[p]);valid(chamber);assert.match(chamber.answer,/Senate/);assert.doesNotMatch(chamber.answer,/Representatives|committee/);
 const state=await lookup('Which state does Senator Alex Example represent?',[p]);valid(state);assert.match(state.answer,/Tasmania/);
 const compound=await lookup('Which state does Alex Example represent in the Senate, and which party is Alex Example with?',[p]);valid(compound);assert.match(compound.answer,/Tasmania/);assert.match(compound.answer,/Independent/);
});
test('unavailable metadata stays an identity gap and cannot become a policy gap',async()=>{
 const people=[{name:'Alex Example',party:'Labor',speeches:50,chambers:['senate_committee'],first:1990,last:2026}];
 for(const question of ['Alex Example electorate?','Which chamber does Alex Example sit in?','When was Alex Example first elected?']){
  const answer=await lookup(question,people);valid(answer);assert.match(answer.answer,/not (?:recorded|available)/);assert.doesNotMatch(answer.answer,/from 1990/);
 }
});
test('service dates come from published periods, never indexed speech years',async()=>{
 const p={name:'Alex Example',party:'Labor',speeches:10,first:2019,last:2026,chambers:['representatives']};
 const extra={'/electorates/manifest.json':{people_url:'/electorates/releases/abc123/people.json'},'/electorates/releases/abc123/people.json':{people:[{name:'Alex Example',electorates:[{name:'Sample',chamber:'representatives',jurisdiction:'federal',current:false,url:'/subject/electorate/sample',periods:[{start:'2001-11-10',end:'2016-05-09'}]}]}]}};
 const answer=await lookup('What years did Alex Example serve in parliament?',[p],extra);valid(answer);assert.match(answer.answer,/10 November 2001 to 9 May 2016/);assert.doesNotMatch(answer.answer,/2019/);
 const current=await lookup('Is Alex Example still in parliament?',[p],extra);valid(current);assert.match(current.answer,/no longer serving/);
});
test('a clipped pay record is not presented as first election or entry into parliament',async()=>{
 const people=[{name:'Alex Example',party:'Labor',speeches:5,chambers:['senate']}];
 const answer=await lookup('When did Alex Example enter the Senate?',people,{'/pay.json':{meta:{from:'1999-12-07'},people:{x:{name:'Alex Example',chamber:'senate',from:'1999-12-07',to:'2007-06-30',sitting:false}}}});
 valid(answer);assert.match(answer.answer,/covered by the published pay record from/);assert.doesNotMatch(answer.answer,/first elected|entered/);
});
test('pay service preserves interruptions and joins changes of office within a term',async()=>{
 const people=[{name:'Alex Example',party:'Labor',speeches:5,chambers:['senate']}];
 const answer=await lookup('What years did Alex Example serve in parliament?',people,{'/pay.json':{people:{x:{name:'Alex Example',chamber:'senate',from:'2010-07-01',to:null,sitting:true,spells:[['2010-07-01','2012-01-01','Senator'],['2012-01-01','2014-06-30','Minister'],['2019-07-01',null,'Senator']]}}}});
 valid(answer);assert.match(answer.answer,/1 July 2010 to 29 June 2014/);assert.match(answer.answer,/1 July 2019 and they are recorded as still serving/);assert.equal(answer.sources.length,2);
});
test('ambiguity, unknown names and policy questions remain with their own routes',async()=>{
 assert.equal(await lookup('Which party is Nobody Invented with?',[]),null);
 assert.equal(await lookup('Which party is Alex with?',[{name:'Alex Example',speeches:10},{name:'Alex Other',speeches:9}]),null);
 for(const question of ['What did Jacqui Lambie say about housing?','Which party did Jacqui Lambie support on the housing bill?','How did Jacqui Lambie vote?'])assert.equal(await lookup(question),null);
 assert.equal(await lookup('Which party is Jacqui Lambie with?',roster.people,{}, {speaker:'Bob Katter'}),null);
});
test('dated party questions do not turn current affiliation into historical evidence',async()=>{
 for(const question of ['Which party was Jacqui Lambie with in 2014?','Which party was Fatima Payman with as of 2022?','Which party was Fatima Payman with on 2022-07-01?']){
  const answer=await lookup(question);valid(answer);assert.match(answer.answer,/does not establish their party for the requested period/);
 }
});
test('service requests honour the named chamber and retain separate jurisdiction entries',async()=>{
 const people=[{name:'Alex Example',party:'Labor',speeches:20,chambers:['representatives','senate'],representation:[{electorate:'Victoria',jurisdiction:'federal',chamber:'senate'},{electorate:'Sample',jurisdiction:'federal',chamber:'representatives'}]}];
 const extra={'/electorates/manifest.json':{people_url:'/electorates/releases/abc123/people.json'},'/electorates/releases/abc123/people.json':{people:[{name:'Alex Example',electorates:[{name:'Sample',chamber:'representatives',jurisdiction:'federal',current:false,periods:[{start:'2010-07-01',end:'2014-06-30'}]}]},{name:'Alex Example',electorates:[{name:'Victoria',chamber:'senate',jurisdiction:'federal',current:true,periods:[]}]}]},'/pay.json':{people:{x:{name:'Alex Example',chamber:'senate',from:'2010-07-01',to:null,sitting:true}}}};
 const unknown=await lookup('When did Alex Example enter the Senate?',people,extra);valid(unknown);assert.match(unknown.answer,/dates.*not available/);assert.doesNotMatch(unknown.answer,/2010|Sample/);
 extra['/electorates/releases/abc123/people.json'].people[1].electorates[0].periods=[{start:'2019-07-01',end:null}];
 const senate=await lookup('When did Alex Example enter the Senate?',people,extra);valid(senate);assert.match(senate.answer,/1 July 2019/);assert.doesNotMatch(senate.answer,/2010|Sample/);
});
test('identity JSON and SSE contain the same cited payload',async()=>{
 const payload=await lookup('Jacqui Lambie party?');
 const json=identityResponse(payload,new Request('https://example.test/api/ask'));
 const sse=identityResponse(payload,new Request('https://example.test/api/ask?stream=1'));
 assert.deepEqual(await json.json(),JSON.parse((await sse.text()).match(/^data: (.+)$/m)[1]));
});
test('public JSON and SSE bypass models and stale position gaps in every routing mode',async()=>{
 const restore=offline();const pending=[];
 try{
  const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname,{waitUntil:p=>pending.push(p),passThroughOnException(){}});
  globalThis.caches={default:{match:async()=>Response.json({answer:'This selection does not establish their position on that topic.'}),put:async()=>{throw Error('Identity answers are not cached')}}};
  const calls=outbound.length;
  for(const mode of ['off','route'])for(const stream of [false,true])for(const [question,value] of [['Which party is Jacqui Lambie with?','JLN'],['Which house of federal parliament does James Paterson sit in?','Senate'],['Which electorate does Ged Kearney represent?','Cooper']]){
   h.env.RESEARCH_LOOP=mode;h.env.AGENTIC_ASK_MODE='route';
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})});
   assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-identity-route'),'roster-v1');
   const text=await response.text(),answer=stream?JSON.parse(text.match(/^data: (.+)$/m)[1]):JSON.parse(text);valid(answer);assert.ok(answer.answer.includes(value),answer.answer);
  }
  assert.equal(outbound.length,calls,'No model, search or KB requests for identity facts');
  await Promise.all(pending);
 }finally{restore();globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};}
});
