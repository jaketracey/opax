import test from 'node:test';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,relative} from 'node:path';
import {privacySourceGraphs,privacySourceDonorRecords,assetDonorRecords,PRIVACY_BASELINE,readPublicationContext,sanitiseDonorAsset} from '../../scripts/withhold_donor_assets.mjs';
import {donorPrivacyIndex,donorNameWithheld,withholdIndividualDonors,MONEY_GRAPHS,foldDonorName,isOrganisationDonor} from '../public/donor-entity.js';
import {donorRows,withheldDonorTotals,donorRouteWithheld} from '../public/donor-views.js';
import {buildFlows} from '../public/ledger.js';
const pub=new URL('../public/',import.meta.url).pathname;
const original=privacySourceGraphs(),index=donorPrivacyIndex(original),context=readPublicationContext(pub,original);
const read=p=>JSON.parse(readFileSync(join(pub,p),'utf8'));
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const shape=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const fields=o=>Object.entries(o).map(([k,v])=>`${k}:${shape(v)}`).sort().join('|');
// Independent equality/URL guard: derive identities from the raw export, rather
// than relying only on the publication transformation being idempotent.
const blocked=new Set([...privacySourceDonorRecords().filter(n=>donorNameWithheld(index,n.label)).flatMap(n=>[n.label,...n.aliases||[]]),...original.flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)).flatMap(n=>[n.label,...n.aliases||[]]))].map(foldDonorName));
const organisationAliases=new Set(original.flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&!donorNameWithheld(index,n.label)).flatMap(n=>[n.label,...n.aliases||[]])).map(foldDonorName));
function hasHiddenIdentity(value,donor=false,nameField=false){
 if(typeof value==='string'){
  const key=foldDonorName(value),entry=context.registry.names[context.hash(key)];
  if(blocked.has(key)&&!organisationAliases.has(key)&&(!isOrganisationDonor({label:value}) || (donor||nameField) && !isOrganisationDonor({label:value.toLowerCase()}))&&(donor||!entry?.exempt)&&(donor||nameField||/[a-z].*\s+.*[a-z]/i.test(value)))return true;
  for(const match of value.matchAll(/\/subject\/donor\/([^\s"<>?#]+)/g)){let label;try{label=decodeURIComponent(match[1])}catch{continue}if(blocked.has(foldDonorName(label))&&!index.organisations.has(foldDonorName(label)))return true;}
  return false;
 }
 if(Array.isArray(value))return value.some(x=>hasHiddenIdentity(x,donor,nameField));
 if(!value||typeof value!=='object')return false;
 const isDonor=donor||value.kind==='donor';
 return Object.entries(value).some(([key,v])=>{
  if(key==='donors'&&v&&typeof v==='object'&&!Array.isArray(v))return Object.entries(v).some(([label,entry])=>hasHiddenIdentity(label,true)||hasHiddenIdentity(entry));
  return hasHiddenIdentity(v,isDonor||key==='top_donors'||key==='donor'||key==='donor_label',['name','label','n','aliases'].includes(key));
 });
}


test('every served JSON and client module passes the runtime export privacy set',t=>{
 let json=0,modules=0;
 for(const path of walk(pub)) {
  const file=relative(pub,path);
  if(path.endsWith('.json')) {
   const value=JSON.parse(readFileSync(path,'utf8'));
   // Official office-holder roles remain named; donor contexts are withheld.
   assert.ok(assetDonorRecords(value).every(n=>!donorNameWithheld(index,n.label)),`${file}: donor record lacks organisation evidence`);
   assert.ok(!hasHiddenIdentity(value),`${file}: derived donor label, alias or profile URL`);
   assert.ok(JSON.stringify(sanitiseDonorAsset(value,context))===JSON.stringify(value),`${file}: withheld donor data`);json++;
  } else if(/\.(?:js|html|txt|xml)$/.test(path)) {
   const value=readFileSync(path,'utf8');
   assert.ok(sanitiseDonorAsset(value,context)===value,`${file}: withheld donor text`);modules++;
  }
 }
 t.diagnostic(`${json} served JSON files; ${modules} client and crawl files`);
});

test('native graph schemas, groups, amounts and year cells are unchanged',()=>{
 for(let i=0;i<MONEY_GRAPHS.length;i++){
  const before=original[i],after=read(MONEY_GRAPHS[i]);
  assert.equal(after.nodes.length,before.nodes.length,`graph ${i} node count`);
  assert.equal(after.edges.length,before.edges.length,`graph ${i} edge count`);
  for(let j=0;j<before.nodes.length;j++){
   const a=before.nodes[j],b=after.nodes[j];assert.equal(fields(a),fields(b),`graph ${i} node ${j} fields/types`);
   for(const key of Object.keys(a).filter(k=>!['id','label','aliases','profileUrl'].includes(k)))assert.ok(JSON.stringify(a[key])===JSON.stringify(b[key]),`graph ${i} node ${j} ${key}`);
   if(a.kind==='donor'&&donorNameWithheld(index,a.label)){
    assert.match(b.id,/^donor:withheld-\d+$/);assert.match(b.label,/^Donor \d+ \(name withheld\)$/);assert.equal(b.aliases.length,0);assert.equal(b.profileUrl,undefined);
   }else assert.ok(JSON.stringify(a)===JSON.stringify(b),`graph ${i} organisation ${j}`);
  }
  for(let j=0;j<before.edges.length;j++){
   assert.equal(fields(before.edges[j]),fields(after.edges[j]),`graph ${i} edge ${j} fields/types`);
   for(const k of Object.keys(before.edges[j]).filter(k=>!['source','target'].includes(k)))assert.ok(JSON.stringify(before.edges[j][k])===JSON.stringify(after.edges[j][k]),`graph ${i} edge ${j} ${k}`);
  }
  assert.equal(new Set(after.nodes.filter(n=>n.kind==='donor').map(n=>n.id)).size,new Set(before.nodes.filter(n=>n.kind==='donor').map(n=>n.id)).size,`graph ${i} donor groups`);
 }
});

test('native access entry fields and types survive anonymous key replacement',()=>{
 const before=JSON.parse(execFileSync('git',['show',`${PRIVACY_BASELINE}:portal/public/access.json`],{maxBuffer:20*1024*1024}).toString()),after=read('access.json');
 assert.equal(fields(after),fields(before));
 const entryShape=d=>Object.values(d).map(fields).sort().join('\n');
 assert.equal(entryShape(after.donors),entryShape(before.donors));assert.equal(entryShape(after.ministers),entryShape(before.ministers));
 for(const key of ['meetings','lobbyists']){
  const rows=d=>Object.values(d.donors).flatMap(v=>v[key]||[]).map(fields).sort().join('\n');assert.equal(rows(after),rows(before),`${key} fields/types`);
 }
});

test('client lists contain organisations and one summed aggregate while map totals stay true',()=>{
 for(let i=0;i<original.length;i++){
  const g=original[i],hidden=g.nodes.filter(n=>n.kind==='donor'&&donorNameWithheld(index,n.label));
  const rows=donorRows(g.nodes.filter(n=>n.kind==='donor').map(n=>[n.label,n.total]),index,5);
  const aggregate=rows.filter(r=>/^Individual donors \(\d+\)$/.test(r[0]));assert.equal(aggregate.length,1);
  assert.equal(aggregate[0][1],hidden.reduce((sum,n)=>sum+n.total,0));assert.ok(rows.filter(r=>r!==aggregate[0]).every(r=>!donorNameWithheld(index,r[0])));
  const graph=withholdIndividualDonors(g,index);const flows=buildFlows(graph);const totals=withheldDonorTotals(graph.nodes,graph.edges);
  assert.ok(totals.count>0);assert.equal(flows.reduce((sum,e)=>sum+e.total,0),g.edges.filter(e=>!e.grant&&!e.flow).reduce((sum,e)=>sum+e.total,0));
 }
});

test('all donor client surfaces consume the common policy and neutral routes',()=>{
 const app=readFileSync(join(pub,'app.js'),'utf8');assert.ok(app.includes('This donor is not named in OPAX.'));assert.ok(app.includes('donorViewReady'));assert.ok(app.includes('meta[name="twitter:image"]'));
 for(const path of ['app.js','ledger.js','money-map.js','money-journeys-data.js','growth-modules.js','supplier-growth.js','quiz.js','home.js','map-research.js','wordsdollars.js','explain.js','agencies.js','grants.js','grant-recipient.js'])assert.ok(/donorNameWithheld|isOrganisationDonor|donorRows|donor-views|exactOrganisationDonors|donor:withheld|Donor.*withheld|Individual donors/.test(readFileSync(path==='money-map.js'?new URL('../graph/index.ts',import.meta.url):path==='explain.js'?new URL('../graph/explain.ts',import.meta.url):join(pub,path),'utf8')),path);
});

test('the independent served-file guard rejects exported identities and profile URLs',()=>{
 const n=original.flatMap(g=>g.nodes).find(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)&&!organisationAliases.has(foldDonorName(n.label)));
 assert.ok(hasHiddenIdentity({kind:'donor',label:n.label,aliases:n.aliases}));
 assert.ok(hasHiddenIdentity({profileUrl:'/subject/donor/'+encodeURIComponent(n.label)}));
 assert.ok(!hasHiddenIdentity(withholdIndividualDonors({nodes:[n],edges:[]},index)));
});

test('the donor client policy boots in the classic app script',()=>{
 const app=readFileSync(join(pub,'app.js'),'utf8');
 assert.doesNotThrow(()=>new Script(app));
 assert.ok(app.includes("import('/donor-views.js"));
});

test('withheld acronym aliases keep their owner privacy on publication',()=>{
 const aliases=original.flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)).flatMap(n=>n.aliases||[])).filter(a=>isOrganisationDonor({label:a})&&!isOrganisationDonor({label:a.toLowerCase()})&&!organisationAliases.has(foldDonorName(a)));
 assert.ok(aliases.length>0);
 for(const alias of aliases){
  assert.ok(hasHiddenIdentity({kind:'donor',aliases:[alias]}));
  const result=sanitiseDonorAsset({top_donors:[[alias,1]]},context);
  assert.match(result.top_donors[0][0],/^Donor \d+ \(name withheld\)$/);
  const mutated={nodes:[{id:'donor:withheld-1',label:'Donor 1 (name withheld)',kind:'donor',aliases:[alias],profileUrl:'/subject/donor/'+encodeURIComponent(alias)}],edges:[]};
  const fixed=sanitiseDonorAsset(mutated,context);assert.equal(fixed.nodes[0].aliases.length,0);assert.equal(fixed.nodes[0].profileUrl,undefined);
 }
});

test('the client fails closed on unknown acronym profile metadata without calling an API',async()=>{
 const alias=original.flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)).flatMap(n=>n.aliases||[])).find(a=>isOrganisationDonor({label:a})&&!isOrganisationDonor({label:a.toLowerCase()})&&!organisationAliases.has(foldDonorName(a)));
 assert.ok(alias);
 const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async(path,options)=>{calls++;assert.ok(path.startsWith('/subject/donor/'));assert.equal(options.method,'HEAD');return new Response(null,{headers:{'x-robots-tag':'noindex'}})};
 try{assert.equal(await donorRouteWithheld(alias,index),true);assert.equal(calls,1)}finally{globalThis.fetch=prior}
});

test('compact metadata cannot change the shared publication and query decision',()=>{
 const affected=privacySourceDonorRecords().filter(n=>donorNameWithheld(index,n.label)&&isOrganisationDonor(n));
 assert.ok(affected.length>0);
 const phrases=new Set(context.registry.phrases.map(p=>p.hash));
 const normalise=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 for(const node of affected){
  const entry=context.registry.names[context.hash(foldDonorName(node.label))];
  assert.ok(entry);
  if(!entry.exempt)assert.ok(phrases.has(context.hash(normalise(node.label))),'withheld compact label missing from query guard');
 }
 const refresh=readFileSync(new URL('../../scripts/weekly_refresh.sh',import.meta.url),'utf8');
 assert.ok(refresh.includes('scripts/export_access.py "$donor_stage/graph/money.json"'),'access joins must retain the private source identities');
});
