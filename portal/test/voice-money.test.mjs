import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {typedMoney,untypedMoney,moneyAsset,moneyAssets} from './money-graph-data.mjs';
const dir=mkdtempSync(join(tmpdir(),'opax-voice-money-'));
await build({entryPoints:[new URL('../src/voice-money.ts',import.meta.url).pathname,new URL('../src/voice-tools.ts',import.meta.url).pathname],outdir:dir,bundle:true,platform:'node',format:'esm'});
const {receiptAnswer,receiptJurisdiction,receiptGraphForQuestion}=await import(pathToFileURL(join(dir,'voice-money.js')));
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
test('graph selection masks exact donor names only when resolving conflicting region words',async()=>{
 const reads=[];
 const read=moneyAsset('typed'),load=async file=>{reads.push(file);return read(file)};
 const query='money from The Federal Group in Tasmania';
 const selection=await receiptGraphForQuestion(query,load);
 assert.equal(selection.jurisdiction,'tas');assert.equal(selection.file,'/graph/money.tas.json');
 assert.deepEqual(reads,['/graph/money.json','/graph/money.tas.json']);
 // A region word is first checked against the federal donors' names (one extra read), then decides.
 reads.length=0;assert.equal((await receiptGraphForQuestion('gambling in Queensland',load)).jurisdiction,'qld');assert.ok(reads.length<=2);
 // Inside a complete donor name it is part of the name, and the federal default stands.
 assert.equal((await receiptGraphForQuestion('Who receives the most funding from Queensland Nickel Pty Ltd?',load)).jurisdiction,'federal');
 assert.equal((await receiptGraphForQuestion('Who receives the most funding from Queensland Nickel Pty Ltd in Queensland?',load)).jurisdiction,'qld');
 reads.length=0;assert.equal((await receiptGraphForQuestion(query,load,'tas')).jurisdiction,'tas');assert.deepEqual(reads,['/graph/money.tas.json']);
 for(const q of ['money from The Federal Group in federal and Tasmania records','gambling in federal and Tasmania','gambling in NSW']) {
  reads.length=0;assert.equal(await receiptGraphForQuestion(q,load),null,q);assert.ok(reads.length<=2);
 }
 // A donor withheld for want of organisation evidence no longer masks a region word.
 reads.length=0;assert.equal((await receiptGraphForQuestion('money from Queensland Nickel Pty Ltd and Federal Secretariat',load)).jurisdiction,'federal');
 const ambiguous={nodes:[{id:'a',kind:'donor',label:'A Pty Ltd',aliases:['The Federal Group']},{id:'b',kind:'donor',label:'B Pty Ltd',aliases:['The Federal Group']}],edges:[]};
 assert.equal(await receiptGraphForQuestion(query,async()=>ambiguous),null);
});

test('voice receipt tools calculate the same named Tasmanian donor without speech retrieval',async()=>{
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:moneyAssets('typed')};
 for(const [tool,args] of [['search_records',{query:'How much funding from The Federal Group in Tasmania in 2025–26?'}],['find_connections',{query:'The Federal Group in Tasmania in 2025–26'}]]) {
  const out=await runVoiceTool(tool,args,env,async()=>{throw Error('Unexpected speech retrieval')});
  assert.equal(out.data.total_aud,10142);assert.equal(out.data.receipts,2);assert.equal(out.data.jurisdiction,'tas');
  assert.match(out.sources[0].url,/jur=tas/);assert.match(out.sources[0].url,/focus=donor%3Afederal\+group/);
 }
});
test('industry totals sum receipt edges once and exclude public money and node totals',()=>{
 const result=answer('How much money flowed from the gambling industry to government?');
 assert.equal(result.total_aud,350);assert.equal(result.receipts,5);
 assert.deepEqual(result.by_party.map(p=>[p.name,p.total_aud]),[['Liberal',250],['Labor',100]]);
 assert.match(result.answer,/disclosed receipts, all types/);
 assert.match(result.scope,/Party-level totals/);
 assert.match(result.sources[0].url,/industry=gambling/);
});
test('year and party filters resummate dated receipts without lifetime or undated amounts',()=>{
 assert.equal(answer('gambling in 2020').total_aud,260);
 assert.equal(answer('gambling to Labor in 2020').total_aud,60);
 // "since 2021" starts at the financial year that includes January 2021 (2020–21);
 // a labelled financial year starts at that year.
 assert.equal(answer('gambling since 2021').total_aud,300);
 assert.deepEqual(answer('gambling since 2021').requested_years,{from:2020,to:2021});
 assert.match(answer('gambling since 2021').period_reading,/^Reading “since 2021” as the 2020–21 to 2021–22 disclosure years/);
 assert.equal(answer('gambling since 2021–22').total_aud,40);
 assert.equal(answer('gambling before 2021').total_aud,260);
 assert.equal(answer('gambling in 2019').total_aud,0);
 assert.match(answer('gambling in 2019').answer,/choose a held period/);
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
 const twenty=answer('gambling over the last 20 years');
 assert.equal(twenty.needs_period,undefined);assert.deepEqual(twenty.requested_years,{from:2002,to:2021});
 assert.match(twenty.period_reading,/last 20 published disclosure years, 2002–03 to 2021–22/);
 assert.ok(twenty.period_options.some(o=>o.label==='All years'&&o.from===null&&o.to===null));
});
test('money tools distinguish donation limitations from mixed receipt exploration before speech search',async()=>{
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:{fetch:async()=>Response.json(graph)}};
 for(const [tool,args] of [['search_records',{query:'gambling donations'}],['find_connections',{query:'gambling'}]]){
  const out=await runVoiceTool(tool,args,env,async()=>{throw Error('Unrelated speech retrieval')});
  if(tool==='search_records'){
   assert.equal(out.data.answer_status,'calculated');assert.match(out.data.answer,/disclosed receipts, all types/);assert.match(out.data.answer,/\$250/);assert.ok(out.sources.every(s=>s.kind==='receipt'));
  }else{
   assert.equal(out.data.total_aud,350);assert.equal(out.sources.length,1);assert.match(out.data.answer,/disclosed receipts, all types/);
  }
 }
 let reads=0;
 await runVoiceTool('search_records',{query:'health grant funding'},env,async()=>{reads++;return Response.json({results:[]})});assert.equal(reads,1);
 await runVoiceTool('search_records',{query:'gambling donations',kind:'speech'},env,async()=>{reads++;return Response.json({results:[]})});assert.equal(reads,2);
});
test('published (typed) gambling data yields a bounded answer with the right map filters',()=>{
 const real=typedMoney();
 const result=receiptAnswer(real,'gambling','federal','https://opax.test');
 assert.equal(result.typed,true);assert.equal(result.measure,'donations');assert.ok(result.total_aud>0);assert.ok(result.by_party.length>1);
 assert.ok(JSON.stringify(result).length<15000);assert.equal(new URL(result.sources[0].url).searchParams.get('industry'),'gambling');
});
test.after(()=>rmSync(dir,{recursive:true,force:true}));

test('voice period labels and separate years cannot become a wider total',()=>{
 const real=typedMoney();
 // Typed (published): gambling donations to Labor in 2020–21 are one $1,000 Donation Received cell.
 const one=receiptAnswer(real,'gambling in financial year ending 2021','federal','https://opax.test');
 assert.equal(one.measure,'donations');assert.equal(one.period,'2020–21');
 assert.equal(one.by_party.find(x=>x.name==='Labor').total_aud,1000);assert.equal(one.by_party.find(x=>x.name==='Labor').all_types_aud,206620);
 // Untyped fallback: the same question over a file without receipt types sums every legacy 2020–21 receipt.
 const legacy=receiptAnswer(untypedMoney(),'gambling in financial year ending 2021','federal','https://opax.test');
 assert.equal(legacy.typed,false);assert.equal(legacy.measure,'receipts_all');assert.equal(legacy.by_party.find(x=>x.name==='Labor').total_aud,445573);
 // Calendar periods and separate years are read as the financial years that
 // contain them; the answer states the reading and keeps figures.
 for(const [q,from,to] of [['gambling in 2019–20 and 2021–22',2019,2021],['gambling in January to June 2020',2019,2019],['gambling on 2020-1-1',2019,2019],['gambling in calendar year 2020',2019,2020],['gambling on 1/1/2020',2019,2019],['gambling on 30/06/2021',2020,2020],['gambling on 2020.01.01',2019,2019],['gambling in H1 2020',2019,2019],['gambling in the 1st half of 2020',2019,2019]]) {
  const r=receiptAnswer(real,q,'federal','https://opax.test')
  assert.equal(r.needs_period,undefined,q);assert.deepEqual(r.requested_years,{from,to},q);assert.match(r.period_reading,/^(?:Reading|These records are grouped by financial year)/,q);assert.ok(r.all_types_aud>0,q)
 }
});


test('overlapping aliases cannot combine separate organisations',()=>{
 const real=typedMoney();
 const full=real.nodes.find(n=>n.kind==='donor' && /Crown Resorts Limited/.test(n.label));
 const selected=receiptAnswer(real,`money from ${full.label}`,'federal','https://opax.test');
 assert.deepEqual(selected.selected_donors,[full.label]);
 for(const alias of ['Macquarie']){const r=receiptAnswer(real,`money from ${alias}`,'federal','https://opax.test');assert.equal(r.needs_scope,true);assert.equal(r.total_aud,undefined);assert.deepEqual(r.sources,[]);}
 const shared={...graph,nodes:[...graph.nodes,{id:'x',kind:'donor',label:'Example Trust',aliases:['Example Casino']}]};
 assert.equal(receiptAnswer(shared,'money from Example Casino','federal','https://opax.test').needs_scope,true);
});

test('complete party names mask only nested mentions, not another party in the question',()=>{
 const parties={...graph,nodes:[...graph.nodes,{id:'nationals',kind:'party',label:'Nationals'},
  {id:'clp',kind:'party',label:'Country Liberal Party'}],edges:[...graph.edges,{source:'a',target:'lnp',total:50,count:1},{source:'a',target:'clp',total:25,count:1}]};
 const select=q=>receiptAnswer(parties,q,'federal','https://opax.test');
 for(const name of ['LNP','Liberal National Party']) {
  assert.deepEqual(select(`${name} and Labor donations`).selected_parties,['Labor','LNP']);
  assert.equal(select(`${name} and Labor donations`).total_aud,650);
  assert.deepEqual(select(`${name} donations`).selected_parties,['LNP']);
  assert.deepEqual(select(`${name} versus Liberal donations`).selected_parties,['Liberal','LNP']);
 }
 assert.deepEqual(select('Country Liberal Party donations').selected_parties,['Country Liberal Party']);
 assert.deepEqual(select('Country Liberal Party versus Liberal donations').selected_parties,['Liberal','Country Liberal Party']);
 assert.deepEqual(select('Liberal versus Country Liberal Party donations').selected_parties,['Liberal','Country Liberal Party']);
 assert.deepEqual(select('Liberal National Party and National Party donations').selected_parties,['LNP','Nationals']);
 assert.deepEqual(select('ALP and LNP donations').selected_parties,['Labor','LNP']);
 assert.deepEqual(select('LNP and LNP donations').selected_parties,['LNP']);
});

test('missing compound party identities never become shorter parties or all recipients',()=>{
 const missing={...graph,nodes:graph.nodes.filter(n=>n.id!=='lnp')};
 for(const name of ['LNP','Liberal National Party','Country Liberal Party']) {
  for(const q of [`${name} donations`,`gambling money to ${name}`,`Labor or ${name} donations`]) {
   const r=receiptAnswer(missing,q,'vic','https://opax.test');
   assert.equal(r.needs_scope,true,q);assert.equal(r.total_aud,undefined);assert.deepEqual(r.sources,[]);
  }
 }
 const controlled=receiptAnswer(missing,'LNP donations','vic','https://opax.test',{party:'Liberal'});
 assert.deepEqual(controlled.selected_parties,['Liberal']);assert.equal(controlled.total_aud,250);
});

test('a party alias shared by distinct identities answers for one party, says which, and offers the other',()=>{
 const shared={...graph,nodes:[...graph.nodes.map(n=>n.id==='labor'?{...n,aliases:['Example Party']}:n),{id:'new',kind:'party',label:'New Party',aliases:['Example Party']}]};
 const r=receiptAnswer(shared,'Example Party donations','federal','https://opax.test');
 assert.equal(r.needs_scope,undefined);assert.deepEqual(r.selected_parties,['Labor']);
 assert.match(r.scope_reading,/matches Labor and New Party in this map; this answer is for Labor, the party with the most disclosed receipts/);
 assert.deepEqual(r.scope_options,[{label:'New Party',party:'New Party'}]);assert.match(r.answer,/this answer is for Labor/);
 assert.deepEqual(receiptAnswer(shared,'New Party donations','federal','https://opax.test').selected_parties,['New Party']);
});

test('party words inside a resolved donor name are not recipient selections',()=>{
 for(const label of ['LNP Holdings Pty Ltd','Country Liberal Party Services Ltd']) {
  const named={meta:{},nodes:[{id:'company',kind:'donor',label},...graph.nodes.filter(n=>n.kind==='party'&&n.id!=='lnp')],edges:[
   {source:'company',target:'labor',total:60,count:1},{source:'company',target:'liberal',total:40,count:1}]};
  for(const query of [`money from ${label}`,`money from ${label.replace(/ Pty Ltd$| Ltd$/,'')}`]) {
   const all=receiptAnswer(named,query,'vic','https://opax.test');assert.equal(all.total_aud,100);assert.deepEqual(all.selected_parties,[]);
   const recipient=receiptAnswer(named,query+' to Liberal','vic','https://opax.test');assert.equal(recipient.total_aud,40);assert.deepEqual(recipient.selected_parties,['Liberal']);
  }
  const missing=receiptAnswer(named,`money from ${label} to LNP`,'vic','https://opax.test');assert.equal(missing.needs_scope,true);
 }
});

test('voice lending questions cannot reuse mixed receipt totals',async()=>{
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:moneyAssets('typed')};
 for(const query of ['Who loaned the most money to Labor?','How much money did Westpac Banking Corporation lend to Labor?','Which banks lent money to Labor?','How much money was loaned to Labor by Westpac Banking Corporation?',...['lent','loan','loaned','borrowed','borrowing','owe','owes','owed','debt'].map(verb=>'How much money '+verb+' to Labor by Westpac Banking Corporation?')])for(const tool of ['search_records','find_connections']){
  const out=await runVoiceTool(tool,{query},env,async()=>{throw Error('Unexpected network retrieval')});
  assert.match(out.data.answer,/cannot establish how much was lent/);
  assert.match(out.data.answer,/balances owed at 30 June/);
  assert.match(out.data.answer,/latest year/);
  assert.equal(out.data.total_aud,undefined);
  assert.doesNotMatch(out.data.answer,/42,540,985/);
  assert.match(out.sources[0].url,/graph\/aec-extras.json$/);
 }
 // Typed (published): the receipt question leads with Westpac's donations only.
 const receipt=await runVoiceTool('search_records',{query:'How much money from Westpac Banking Corporation to Labor?'},env,async()=>{throw Error('Unexpected network retrieval')});
 assert.equal(receipt.data.measure,'donations');assert.equal(receipt.data.total_aud,875018);assert.equal(receipt.data.all_types_aud,47331887);
 assert.match(receipt.data.answer,/^Westpac Banking Corporation: \$875,018 in donations received \(AEC receipt type: Donation Received\), financial years 1998–99 to 2024–25, across 35 records\./);
 // Untyped fallback: without receipt types the same question shows the mixed total, labelled as including loans.
 const legacy=await runVoiceTool('search_records',{query:'How much money from Westpac Banking Corporation to Labor?'},{...env,ASSETS:moneyAssets('untyped')},async()=>{throw Error('Unexpected network retrieval')});
 assert.equal(legacy.data.measure,'receipts_all');assert.equal(legacy.data.total_aud,42540985);
 assert.match(legacy.data.answer,/disclosed receipts, all types, including bank loans to the party/);
});

test('voice uses the shared family calculator, with its entire table and citations',async()=>{
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:moneyAssets('typed')};
 for(const query of ['Who bankrolls Labor?','Who props up Labor?','Who has donated the most to the Greens?','Who is giving the most money to Labor?'])for(const [tool,kind]of [['search_records','all'],['search_records','receipt'],['search_records','speech'],['find_connections',undefined]]){
  const out=await runVoiceTool(tool,{query,kind},env,async()=>{throw Error('A family question reached generic retrieval')});
  assert.equal(out.data.money_route,'federal-party-ranking-v1');assert.equal(out.data.answer_status,'calculated');
  assert.match(out.data.answer,/largest source/);assert.match(out.data.answer.split('\n')[0],/donations received \(AEC receipt type: Donation Received\)/);
  assert.match(out.data.answer,/\| Source \| Donations \| Share \| All receipt types \|/);
  assert.equal(out.data.answer.split('\n').filter(s=>/^\| /.test(s)).length,9);
  assert.ok(Object.keys(out.data.citations).length>=6);assert.equal('money_facts' in out.data,false);
 }
});

test('voice recognises plural, contracted, misspelled and uncertain family requests',async()=>{
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:moneyAssets('typed')};
 for(const query of ["Who are the Greens' top donors?","Who's been giving the most money to the Greens?",'who donates teh most to labor','Who Labor top donors?'])for(const tool of ['search_records','find_connections']){
  const out=await runVoiceTool(tool,{query},env,async()=>{throw Error('Long-tail family reached generic retrieval')});
  assert.equal(out.data.money_route,'federal-party-ranking-v1');assert.ok(['calculated','needs_scope'].includes(out.data.answer_status));
 }
});

test('donation-led calculator results also carry the Donation-only map link for the same selection',()=>{
 const result=receiptAnswer(typedMoney(),'gambling to Labor in 2021','federal','https://opax.test');
 assert.equal(result.measure,'donations');assert.equal(result.sources.length,2);
 const all=new URL(result.sources[0].url),donations=new URL(result.sources[1].url);
 assert.equal(all.searchParams.get('receipt'),null);assert.equal(donations.searchParams.get('receipt'),'donations');
 for(const key of ['jur','type','industry','party','from','to'])assert.equal(donations.searchParams.get(key),all.searchParams.get(key),key);
 assert.equal(donations.searchParams.get('industry'),'gambling');assert.equal(donations.searchParams.get('party'),'party:Labor');assert.equal(donations.searchParams.get('from'),'2021');
 // Untyped data has no Donation-only view to link.
 assert.equal(receiptAnswer(untypedMoney(),'gambling','federal','https://opax.test').sources.length,1);
});

test('pairs without receipt types fall back to their legacy total only when every matching pair lacks them',()=>{
 const real=typedMoney(),clp=real.edges.filter(e=>e.target==='party:Country Liberal Party'&&!e.flow&&!e.grant);
 assert.ok(clp.length&&clp.every(e=>!Object.keys(e.by_type??{}).length));
 const result=receiptAnswer(real,'Who donates the most to Country Liberal Party?','federal','https://opax.test');
 assert.equal(result.typed,false);assert.equal(result.type_breakdown,false);assert.equal(result.measure,'receipts_all');
 assert.equal(result.measure_label,'all receipt types (no type breakdown in the AEC data OPAX holds)');
 assert.equal(result.total_aud,Math.round(clp.reduce((s,e)=>s+e.total,0)*100)/100);assert.equal(result.sources.length,1);
 assert.match(result.answer,/all receipt types \(no type breakdown in the AEC data OPAX holds\)/);
 // A selection with typed pairs leaves the untyped pair out, as before.
 const mixed={meta:{receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:[
  {id:'d1',kind:'donor',label:'Example Quarry'},{id:'d2',kind:'donor',label:'Example Ferry'},{id:'p',kind:'party',label:'Labor'}],edges:[
  {source:'d1',target:'p',total:500,count:2,by_type:{donation_received:300},by_type_year:{'2020-21':{donation_received:[300,1]}}},
  {source:'d2',target:'p',total:900,count:3,by_type:{},by_type_year:{}}]};
 const typed=receiptAnswer(mixed,'Labor','federal','https://opax.test');
 assert.equal(typed.typed,true);assert.equal('type_breakdown' in typed,false);assert.equal(typed.total_aud,300);assert.equal(typed.all_types_aud,300);
});

test('an all-years question with no matching receipts does not point to other financial years',()=>{
 const none=answer('Example Casino Liberal');
 assert.equal(none.receipts,0);assert.doesNotMatch(none.answer,/other financial years/);assert.match(none.answer,/OPAX holds no matching Example Casino receipts in its published records/);
 assert.match(answer('Example Casino Liberal 2025').answer,/receipts in other financial years/);
});

test('merged donor-to-party flows are rounded to the cent like the other groupings',()=>{
 const noisy={meta:{},nodes:[{id:'d',kind:'donor',label:'Example Quarry'},{id:'p',kind:'party',label:'Labor'}],
  edges:[{source:'d',target:'p',total:1234.5600000001,count:1,firstYear:2020,lastYear:2020,byYear:{2020:[1234.5600000001,1]}}]};
 const result=receiptAnswer(noisy,'Example Quarry','federal','https://opax.test');
 assert.deepEqual(result.flows.map(f=>[f.total_aud,f.all_types_aud,f.other_receipts_aud]),[[1234.56,1234.56,0]]);
 assert.equal(result.by_donor[0].total_aud,1234.56);
 // Two typed cells for one pair merge into one flow, still on the cent.
 const typed={meta:{receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:noisy.nodes,
  edges:[{source:'d',target:'p',total:0,count:0,by_type:{donation_received:0.1,other_receipt:0.2},by_type_year:{'2020-21':{donation_received:[0.1,1],other_receipt:[0.2,1]}}}]};
 const merged=receiptAnswer(typed,'Example Quarry','federal','https://opax.test');
 assert.equal(merged.flows.length,1);assert.equal(merged.flows[0].all_types_aud,0.3);
});

test('voice find_connections says the day the connections run to, and claims none for an undated export',async()=>{
 const entities=[{id:'ab'+'0'.repeat(22),name:'Example Harbour Program',kind:'program',records:12}];
 let index={meta:{generated_at:'2026-09-08T09:21:53+00:00'},entities};
 const env={COMMUNITY_ORIGIN:'https://opax.test',ASSETS:{fetch:async request=>new URL(request.url).pathname==='/evidence/index.json'?Response.json(index):Response.json(graph)}};
 const unrelated=async()=>{throw Error('Unrelated speech retrieval')};
 let out=await runVoiceTool('find_connections',{query:'harbour'},env,unrelated);
 assert.equal(out.data.as_at,'2026-09-08');
 assert.deepEqual(out.data.coverage,index.meta,'the coverage block is unchanged');
 assert.equal(out.data.connections[0].opax_url,'https://opax.test/connections?entity='+entities[0].id);
 index={entities};
 out=await runVoiceTool('find_connections',{query:'harbour'},env,unrelated);
 assert.equal('as_at' in out.data,false);
 assert.equal(out.data.connections.length,1);
});

// A donor whose flows only its own donor return declares (typed cells, no receipt on the
// party's returns: hasPartyReceipts is false) is given to voice as that declaration, worded
// as Ask's money_totals words it, never as receipts or "no type breakdown".
test('voice gives a donor-declared-only donor as its declaration, never as receipts',async()=>{
 const meta={receipt_types:{available:true,schema:1,donation_type:'donation_received'},generated:'2026-11-13'};
 const declared={meta,nodes:[
  {id:'donor:quill',kind:'donor',label:'Example Quill Holdings Pty Ltd',industry:'finance',total:64250,count:3,by_type:{},by_type_year:{}},
  {id:'donor:ferry',kind:'donor',label:'Example Ferry Co',industry:'transport',total:900,count:1,by_type:{donation_received:900},by_type_year:{'2021-22':{donation_received:[900,1]}}},
  {id:'party:Labor',kind:'party',label:'Labor'},{id:'party:Liberal',kind:'party',label:'Liberal'}],edges:[
  {source:'donor:quill',target:'party:Labor',total:64250,count:3,firstYear:2018,lastYear:2019,byYear:{2018:[40000,2],2019:[24250,1]},by_type:{},by_type_year:{}},
  {source:'donor:ferry',target:'party:Liberal',total:900,count:1,firstYear:2021,lastYear:2021,byYear:{2021:[900,1]},by_type:{donation_received:900},by_type_year:{'2021-22':{donation_received:[900,1]}}}]};
 const {voiceReceiptData,DONOR_DECLARED_LABEL}=await import(pathToFileURL(join(dir,'voice-money.js')));
 assert.equal(DONOR_DECLARED_LABEL,"declared by the donor; the party's returns show no matching receipt");
 const question='How much has Example Quill Holdings given to Labor?';
 const found=receiptAnswer(declared,question,'federal','https://opax.test');
 assert.equal(found.type_breakdown,false,'the shared calculator still falls back (Ask reads it unchanged)');
 const data=voiceReceiptData(declared,found);
 assert.equal(data.donor_declared_only,true);assert.equal(data.measure_label,DONOR_DECLARED_LABEL);
 assert.equal(data.donor_declared_aud,64250);assert.equal(data.records,3);
 assert.equal(data.answer,"Example Quill Holdings Pty Ltd declared $64,250 to Labor on its own donor returns (financial years 2018–19 to 2019–20), across 3 records. Labor's returns show no matching receipt, so OPAX's money figures, which count each gift once from the party's own return, do not include these amounts.");
 for(const key of ['total_aud','receipts','all_types_aud','other_receipts_aud','type_breakdown','by_party','by_donor'])assert.equal(key in data,false,key);
 // Through the voice tool: every word voice can read, links aside, says declaration and never receipts.
 const assets={fetch:async request=>Response.json(new URL(request.url).pathname==='/graph/money.json'?declared:{meta:{},nodes:[],edges:[]})};
 const voice=await runVoiceTool('search_records',{query:question,kind:'receipt'},{ASSETS:assets,COMMUNITY_ORIGIN:'https://opax.test'},async()=>{throw Error('No speech retrieval')});
 assert.equal(voice.data.answer,data.answer);assert.equal(voice.data.measure_label,DONOR_DECLARED_LABEL);
 const words=JSON.stringify(voice,(key,value)=>typeof value==='string'&&/^https?:/.test(value)?undefined:value);
 assert.doesNotMatch(words,/receipts|no type breakdown|receipt types/i);
 assert.match(words,/declared/);
 // A donor with receipts on the party's returns is unchanged.
 const typed=receiptAnswer(declared,'How much has Example Ferry Co given to Liberal?','federal','https://opax.test');
 assert.equal(voiceReceiptData(declared,typed),typed);assert.equal(typed.total_aud,900);
 // A pair the export holds with no typed cells at all keeps the older fallback label: it is not a declaration.
 const untyped={...declared,edges:declared.edges.map(({by_type,by_type_year,...e})=>e)};
 const old=receiptAnswer(untyped,question,'federal','https://opax.test');
 assert.equal(voiceReceiptData(untyped,old),old);
});
