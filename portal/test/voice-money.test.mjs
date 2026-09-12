import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'opax-voice-money-'));
await build({entryPoints:[new URL('../src/voice-money.ts',import.meta.url).pathname,new URL('../src/voice-tools.ts',import.meta.url).pathname],outdir:dir,bundle:true,platform:'node',format:'esm'});
const {receiptAnswer,receiptJurisdiction}=await import(pathToFileURL(join(dir,'voice-money.js')));
const {runVoiceTool}=await import(pathToFileURL(join(dir,'voice-tools.js')));
const graph={meta:{coverage:'2020–2022',methodology:'Selected donors only'},nodes:[
 {id:'a',kind:'donor',label:'Example Casino',industry:'gambling',group:'gambling',total:99999},
 {id:'b',kind:'donor',label:'Example Betting',industry:'gambling',group:'gambling',total:99999},
 {id:'h',kind:'donor',label:'Health Company Pty Ltd',industry:'health',group:'health'},
 {id:'labor',kind:'party',label:'Labor'},{id:'liberal',kind:'party',label:'Liberal'},
 {id:'lnp',kind:'party',label:'LNP'},{id:'gov',kind:'grantor',label:'Government'},
],edges:[
 {source:'a',target:'labor',total:100,count:2,firstYear:2020,lastYear:2021,byYear:{2020:[60,1],2021:[40,1]}},
 {source:'b',target:'liberal',total:250,count:3,firstYear:2020,lastYear:2020,byYear:{2020:[200,2]},undated:[50,1]},
 {source:'h',target:'labor',total:500,count:1,firstYear:2020,lastYear:2020,byYear:{2020:[500,1]}},
 {source:'gov',target:'a',total:999999,count:1,firstYear:2020,lastYear:2020,byYear:{2020:[999999,1]}},
]};
const answer=q=>receiptAnswer(graph,q,'federal','https://opax.test');
test('industry totals sum receipt edges once and exclude public money and node totals',()=>{
 const result=answer('How much money flowed from the gambling industry to government?');
 assert.equal(result.total_aud,350);assert.equal(result.receipts,5);
 assert.deepEqual(result.by_party.map(p=>[p.name,p.total_aud]),[['Liberal',250],['Labor',100]]);
 assert.match(result.answer,/published map selection, not an exhaustive industry total/);
 assert.match(result.scope,/not present as.*payments to government/);
 assert.match(result.sources[0].url,/industry=gambling/);
});
test('year and party filters resummate dated receipts without lifetime or undated amounts',()=>{
 assert.equal(answer('gambling in 2020').total_aud,260);
 assert.equal(answer('gambling to Labor in 2020').total_aud,60);
 assert.equal(answer('gambling since 2021').total_aud,40);
 assert.equal(answer('gambling before 2021').total_aud,260);
 assert.equal(answer('gambling in 2019').total_aud,0);
 assert.match(answer('gambling in 2019').answer,/does not establish that no funding occurred/);
 assert.match(answer('gambling in 2020').sources[0].url,/from=2020&to=2020/);
});
test('known donors, parties, aliases and jurisdictions retain their scope',()=>{
 assert.equal(answer('money from Health Company Pty Ltd').total_aud,500);
 assert.equal(answer('casino donations').total_aud,350);
 assert.equal(answer('Liberal National Party donations').total_aud,0);
 assert.equal(answer('Unknown Company donations'),null);
 assert.equal(receiptJurisdiction('Queensland gambling'),'qld');
 assert.equal(receiptJurisdiction('Victoria gambling'),'vic');
 assert.equal(receiptJurisdiction('NSW gambling'),null);
 assert.equal(receiptJurisdiction('federal and Queensland gambling'),null);
 assert.equal(answer('gambling over the last 20 years').needs_period,true);
});
test('money tools return computed receipts before speech search without changing explicit grant or speech searches',async()=>{
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:{fetch:async()=>Response.json(graph)}};
 for(const [tool,args] of [['search_records',{query:'gambling donations'}],['find_connections',{query:'gambling'}]]){
  const out=await runVoiceTool(tool,args,env,async()=>{throw Error('Unrelated speech retrieval')});
  assert.equal(out.data.total_aud,350);assert.equal(out.sources.length,1);assert.match(out.data.answer,/disclosed party receipts/);
 }
 let reads=0;
 await runVoiceTool('search_records',{query:'health grant funding'},env,async()=>{reads++;return Response.json({results:[]})});assert.equal(reads,1);
 await runVoiceTool('search_records',{query:'gambling donations',kind:'speech'},env,async()=>{reads++;return Response.json({results:[]})});assert.equal(reads,2);
});
test('published gambling data yields a bounded answer with the right map filters',()=>{
 const real=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
 const result=receiptAnswer(real,'gambling','federal','https://opax.test');
 assert.ok(result.total_aud>0);assert.ok(result.by_party.length>1);
 assert.ok(JSON.stringify(result).length<15000);assert.equal(new URL(result.sources[0].url).searchParams.get('industry'),'gambling');
});
test.after(()=>rmSync(dir,{recursive:true,force:true}));

test('voice period labels and separate years cannot become a wider total',()=>{
 const real=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
 const one=receiptAnswer(real,'gambling in financial year ending 2021','federal','https://opax.test');
 assert.equal(one.by_party.find(x=>x.name==='Labor').total_aud,457673);
 for(const q of ['gambling in 2019–20 and 2021–22','gambling in January to June 2020','gambling on 2020-1-1','gambling in calendar year 2020','gambling on 1/1/2020','gambling on 30/06/2021','gambling on 2020.01.01','gambling in H1 2020','gambling in the 1st half of 2020']) assert.equal(receiptAnswer(real,q,'federal','https://opax.test').needs_period,true,q);
});


test('overlapping aliases cannot combine separate organisations',()=>{
 const real=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
 const castle=receiptAnswer(real,'money from Crown Castle Australia','federal','https://opax.test');
 assert.deepEqual(castle.selected_donors,['Crown Castle Australia']);assert.equal(castle.total_aud,27000);assert.equal(castle.receipts,8);
 for(const name of ['Crown','Macquarie','Tabcorp']){const r=receiptAnswer(real,`money from ${name}`,'federal','https://opax.test');assert.equal(r.needs_scope,true);assert.equal(r.total_aud,undefined);assert.deepEqual(r.sources,[]);}
 const shared={...graph,nodes:[...graph.nodes,{id:'x',kind:'donor',label:'Example Trust',aliases:['Example Casino']}]};
 assert.equal(receiptAnswer(shared,'money from Example Casino','federal','https://opax.test').needs_scope,true);
});
