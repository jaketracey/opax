import test from 'node:test';
import ts from 'typescript';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,relative} from 'node:path';
import {privacyBaselineFiles,privacySourceGraphs,privacySourceDonorRecords,assetDonorRecords,PRIVACY_BASELINE,readPublicationContext,publicationContext,sanitiseDonorAsset,sanitiseGrantDonors} from '../../scripts/withhold_donor_assets.mjs';
import {donorPrivacyIndex,donorNameWithheld,withholdIndividualDonors,MONEY_GRAPHS,foldDonorName,isOrganisationDonor} from '../public/donor-entity.js';
import {donorRows,withheldDonorTotals,donorRouteWithheld} from '../public/donor-views.js';
import {buildFlows} from '../public/ledger.js';
import {withholdStoredDonors} from '../src/donor-sanitise.mjs';
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
const organisationIds=new Set(original.flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&!donorNameWithheld(index,n.label)).map(n=>n.id)));
function hasHiddenIdentity(value,donor=false,nameField=false){
 if(typeof value==='string'){
  if(donor&&context.registry.ids[context.hash(value)]&&!organisationIds.has(value)&&!/^donor:withheld-/.test(value))return true;
  const key=foldDonorName(value),entry=context.registry.names[context.hash(key)];
  if(blocked.has(key)&&!organisationAliases.has(key)&&(!isOrganisationDonor({label:value}) || (donor||nameField) && !isOrganisationDonor({label:value.toLowerCase()}))&&(donor||!entry?.exempt)&&(donor||nameField||/[a-z].*\s+.*[a-z]/i.test(value)))return true;
  for(const match of value.matchAll(/\/subject\/donor\/([^\s"<>?#]+)/g)){let label;try{label=decodeURIComponent(match[1])}catch{continue}if(blocked.has(foldDonorName(label))&&!index.organisations.has(foldDonorName(label)))return true;}
  return false;
 }
 if(Array.isArray(value)){if(typeof value[0]==='string'&&/(?:^|:)(?:grant(?:-|:)|grant-program|grant-recipient)/.test(value[0]))return false;return value.some(x=>hasHiddenIdentity(x,donor,nameField));}
 if(!value||typeof value!=='object')return false;
 if(value.kind==='grant')return assetDonorRecords(value).some(n=>hasHiddenIdentity(n,true));
 const isDonor=donor||value.kind==='donor';
 return Object.entries(value).some(([key,v])=>{
  if(['recipient','rn','rid','recipientId','recipient_id','recipient_label'].includes(key)||/^\/money\/grants\//.test(key)||/(?:^|:)(?:grant(?:-|:)|grant-program|grant-recipient)/.test(key))return false;
  if(key==='grants')return assetDonorRecords(v).some(n=>hasHiddenIdentity(n,true));
  if(key==='donors'&&v&&typeof v==='object'&&!Array.isArray(v))return Object.entries(v).some(([label,entry])=>hasHiddenIdentity(label,true)||hasHiddenIdentity(entry));
  return hasHiddenIdentity(v,isDonor||key==='top_donors'||key==='donor'||key==='donor_label'||key==='donor_links',['name','label','n','aliases'].includes(key));
 });
}
function hiddenLookupKey(value){
 if(!value||typeof value!=='object')return false;
 return Object.entries(value).some(([key,row])=>{
  const entry=context.registry.names[context.hash(foldDonorName(key))];
  return Boolean(entry&&!entry.exempt&&entry.sourceKnown!==false&&!organisationAliases.has(foldDonorName(key)))||hiddenLookupKey(row);
 });
}


test('every served JSON and client module passes the runtime export privacy set',t=>{
 let json=0,modules=0;
 for(const path of walk(pub)) {
  const file=relative(pub,path);
  if(path.endsWith('.json')) {
   const value=JSON.parse(readFileSync(path,'utf8'));
   assert.ok(!hiddenLookupKey(value),`${file}: withheld dictionary key`);
   const grant=file.startsWith('grants/') || /^graph\/grants\./.test(file) || file==='social/grants-largest.json';
   if(file.startsWith('electorates/')){json++;continue;}
   const scope=grant?assetDonorRecords(value):value;
   // Official office-holder roles remain named; donor contexts are withheld.
   assert.ok(assetDonorRecords(value).every(n=>!donorNameWithheld(index,n.label)),`${file}: donor record lacks organisation evidence`);
   assert.ok(!hasHiddenIdentity(scope),`${file}: derived donor label, alias or profile URL`);
   assert.ok(JSON.stringify((grant?sanitiseGrantDonors:sanitiseDonorAsset)(value,context))===JSON.stringify(value),`${file}: withheld donor data`);json++;
  } else if(/\.(?:js|html|txt|xml)$/.test(path)) {
   const value=readFileSync(path,'utf8');
   if(path.endsWith('.js')){
    // Code identifiers and encoded library payloads are not donor labels.
    // Check actual text literals/comments; runtime view outputs are also swept.
    const ast=ts.createSourceFile(file,value,ts.ScriptTarget.Latest,true);
    const checkText=s=>{if(/^data:/.test(s)||s.length>200&&/^[a-z0-9+/=]+$/i.test(s))return;assert.ok(sanitiseDonorAsset(s,context)===s,`${file}: withheld donor literal`);};
    const scan=node=>{if(ts.isStringLiteralLike(node)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(node.kind))checkText(node.text);ts.forEachChild(node,scan)};scan(ast);
    const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,value);
    for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan())if([ts.SyntaxKind.SingleLineCommentTrivia,ts.SyntaxKind.MultiLineCommentTrivia].includes(kind))checkText(scanner.getTokenText());
   }else assert.ok(sanitiseDonorAsset(value,context)===value,`${file}: withheld donor text`);
   modules++;

  }
 }
 t.diagnostic(`${json} served JSON files; ${modules} client and crawl files`);
});

test('public lookups are rebuilt from sanitised labels without changing record joins',()=>{
 const n=original.flatMap(g=>g.nodes).find(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)&&!context.registry.names[context.hash(foldDonorName(n.label))]?.exempt);
 assert.ok(n);const id='n-'+foldDonorName(n.label).replace(/[^a-z0-9]+/g,'-');
 const fixture={people:{[id]:{id,name:n.label}},_by_name:{[foldDonorName(n.label)]:id},ties:{[id]:Array.from({length:21},()=>({record_id:id,description:'record fixture'}))},nested:{aliases:{[n.label]:[n.id]}},donor_links:[{id:n.id,label:n.label}]};
 for(const safe of [sanitiseDonorAsset(fixture,context),withholdStoredDonors(fixture,context.registry)]){
  assert.ok(!hiddenLookupKey(safe));assert.ok(safe.people[id].id===id);assert.ok(Object.values(safe._by_name)[0]===id);assert.ok(Object.keys(safe._by_name)[0]===safe.people[id].name.toLowerCase());assert.equal(safe.ties[id].length,21);assert.ok(safe.ties[id].every(r=>r.record_id===id));
  assert.ok(/^donor:withheld-/.test(safe.donor_links[0].id),'donor link identity retained');
 }
});

test('interest lookup references and ties retain every source record and row',()=>{
 for(const file of ['interests/index.json','interests/ties-by-donor.json']){
  const before=JSON.parse(execFileSync('git',['show',`${PRIVACY_BASELINE}:portal/public/${file}`],{maxBuffer:30*1024*1024}).toString()),after=read(file);
  if(file.endsWith('index.json')){
   assert.ok(JSON.stringify(Object.values(before._by_name).sort())===JSON.stringify(Object.values(after._by_name).sort()),'interest lookup references differ');
   assert.ok(JSON.stringify(Object.keys(before.people).sort())===JSON.stringify(Object.keys(after.people).sort()),'interest record keys differ');
  }else{
   const ids=x=>Object.values(x.donors).flatMap(rows=>rows.map(r=>r.id)).sort();
   assert.equal(Object.keys(after.donors).length,Object.keys(before.donors).length);assert.ok(JSON.stringify(ids(after))===JSON.stringify(ids(before)),'ties record references or rows differ');
  }
 }
});

test('unknown donor fallbacks cannot rename unrelated schema fields',()=>{
 const code='unregistered-schema-code',entry={id:'donor:withheld-99999',label:'Donor 99999 (name withheld)',sourceKnown:false,exempt:false};
 const donorId='donor:'+code,local={...context,registry:{...context.registry,names:{...context.registry.names,[context.hash(code)]:entry},ids:{...context.registry.ids,[context.hash(donorId)]:entry}}};
 const fixture={meta:{[code]:code},nodes:[{kind:'donor',id:donorId,label:code,aliases:[]}],_by_name:{[code]:entry.id}};
 for(const safe of [sanitiseDonorAsset(fixture,local),withholdStoredDonors(fixture,local.registry)]){
  assert.deepEqual(safe.meta,fixture.meta);assert.equal(safe.nodes[0].label,entry.label);assert.deepEqual(Object.keys(safe._by_name),[entry.label.toLowerCase()]);
 }
});

test('current organisation evidence overrides historical anonymous identity entries',()=>{
 const nodes=original.flatMap(g=>g.nodes).filter(n=>n.kind==='donor'&&!donorNameWithheld(index,n.label)&&context.registry.ids[context.hash(n.id)]);
 assert.ok(nodes.length>0);
 for(const node of nodes){assert.ok(JSON.stringify(withholdStoredDonors(node,context.registry))===JSON.stringify(node),'approved organisation changed');}
 const hidden=original.flatMap(g=>g.nodes).find(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)&&!context.registry.names[context.hash(foldDonorName(n.label))]?.exempt);
 assert.ok(hidden);const fixture={...hidden,id:nodes[0].id},safe=withholdStoredDonors(fixture,context.registry);
 assert.ok(/^donor:withheld-/.test(safe.id));assert.equal(safe.label,`Donor ${safe.id.split('-').at(-1)} (name withheld)`);
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
  const aggregate=rows.filter(r=>/^Donors not named \(\d+\)$/.test(r[0]));assert.equal(aggregate.length,1);
  assert.equal(aggregate[0][1],hidden.reduce((sum,n)=>sum+n.total,0));assert.ok(rows.filter(r=>r!==aggregate[0]).every(r=>!donorNameWithheld(index,r[0])));
  const graph=withholdIndividualDonors(g,index);const flows=buildFlows(graph);const totals=withheldDonorTotals(graph.nodes,graph.edges);
  assert.ok(totals.count>0);assert.equal(flows.reduce((sum,e)=>sum+e.total,0),g.edges.filter(e=>!e.grant&&!e.flow).reduce((sum,e)=>sum+e.total,0));
 }
});

test('all donor client surfaces consume the common policy and neutral routes',()=>{
 const app=readFileSync(join(pub,'app.js'),'utf8');assert.ok(app.includes('This donor is not named in OPAX.'));assert.ok(app.includes('donorViewReady'));assert.ok(app.includes('meta[name="twitter:image"]'));
 for(const path of ['app.js','ledger.js','money-map.js','money-journeys-data.js','growth-modules.js','supplier-growth.js','quiz.js','home.js','map-research.js','wordsdollars.js','explain.js','agencies.js','grants.js','grant-recipient.js'])assert.ok(/donorNameWithheld|isOrganisationDonor|donorRows|donor-views|exactOrganisationDonors|donor:withheld|Donor.*withheld|Donors not named/.test(readFileSync(path==='money-map.js'?new URL('../graph/index.ts',import.meta.url):path==='explain.js'?new URL('../graph/explain.ts',import.meta.url):join(pub,path),'utf8')),path);
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

// Failure messages contain counts, paths and field names only.
test('registered export labels and aliases are replaced regardless of following words',()=>{
 const records=[...privacySourceDonorRecords(),...original.flatMap(g=>g.nodes)];let checks=0;
 for(const n of records)if(n.kind==='donor'&&donorNameWithheld(index,n.label))for(const label of [n.label,...n.aliases||[]]){
  const entry=context.registry.names[context.hash(foldDonorName(label))];if(!entry||entry.exempt)continue;
  for(const suffix of [' to the party',' to a council',' to a foundation',' gave a recorded amount.']){
   const result=sanitiseDonorAsset(`Recorded: ${label}${suffix}`,context);
   assert.ok(!result.toLowerCase().includes(label.toLowerCase()),'registered identity remains in narrative');
   assert.ok(result.includes(entry.label),'neutral narrative replacement missing');checks++;
  }
 }
 assert.ok(checks>0);
});
const baselinePaths=execFileSync('git',['ls-tree','--full-tree','-r','--name-only',PRIVACY_BASELINE,'--','portal/public/grants','portal/public/graph/grants.federal.json','portal/public/graph/grants.qld.json','portal/public/social/grants-largest.json']).toString().trim().split('\n');
const baselineBytes=new Map(privacyBaselineFiles(baselinePaths));
const source=p=>JSON.parse(baselineBytes.get('portal/public/'+p).toString());
const withoutDonor=x=>!x||typeof x!=='object'?x:Array.isArray(x)?x.map(withoutDonor):Object.fromEntries(Object.entries(x).filter(([k])=>k!=='d').map(([k,v])=>[k,withoutDonor(v)]));
test('grant recipient references match the source and anonymous donor identifiers are empty',t=>{
 const files=walk(join(pub,'grants')).filter(p=>p.endsWith('.json')).map(p=>relative(pub,p)).concat(['graph/grants.federal.json','graph/grants.qld.json','social/grants-largest.json']);
 let blocks=0;const ids=new Set();
 for(const file of files){const before=source(file),after=read(file);
  assert.ok(JSON.stringify(withoutDonor(before))===JSON.stringify(withoutDonor(after)),`${file}: recipient data or references changed`);
  const check=(a,b)=>{if(!a||typeof a!=='object')return;
   if(a.d?.e&&typeof a.d.n==='string'&&typeof a.d.aec==='number'&&donorNameWithheld(index,a.d.n)){
    blocks++;ids.add(context.hash(a.d.e));assert.equal(fields(a.d),fields(b.d),`${file}: donor fields/types`);
    assert.ok(/^donor:withheld-\d+$/.test(b.d.e),`${file}: donor identifier`);
    for(const key of ['on','abn','acn','arbn','tfn','profileUrl','url','aliases','alias','identifier'])if(Object.hasOwn(b.d,key))assert.ok(b.d[key]===null||b.d[key]===''||Array.isArray(b.d[key])&&b.d[key].length===0,`${file}: donor identifier field`);
    for(const key of Object.keys(a.d).filter(k=>!['n','e','on','abn','acn','arbn','tfn','profileUrl','url','aliases','alias','identifier'].includes(k)))assert.ok(JSON.stringify(a.d[key])===JSON.stringify(b.d[key]),`${file}: donor amount or metadata changed`);
   }
   for(const[k,v]of Object.entries(a))if(k!=='d'&&v&&typeof v==='object')check(v,b[k]);
  };check(before,after);
 }
 assert.ok(blocks>=94);assert.ok(ids.size>=81);t.diagnostic(`${blocks} anonymous donor blocks; ${ids.size} donor IDs; recipient data unchanged in ${files.length} files`);
});
test('electorates and votes stay byte-identical and release hashes stay consistent',()=>{
 const files=execFileSync('git',['ls-tree','--full-tree','-r','--name-only',PRIVACY_BASELINE,'--','portal/public/electorates','portal/public/votes.json']).toString().trim().split('\n');
 for(const [file,raw] of privacyBaselineFiles(files)){assert.ok(raw.equals(readFileSync(new URL('../../'+file,import.meta.url))),`${file}: original bytes changed`);}
 const manifest=read('electorates/manifest.json');
 for(const[file,digest]of Object.entries(manifest.files))assert.equal(context.hash(readFileSync(join(pub,'electorates/releases',manifest.release_id,file))),digest,`${file}: manifest digest`);
});

test('nested grant summaries preserve recipient references while donor blocks stay anonymous',()=>{
 const data=source('grants/federal/shard-00.json');const nested={grants:Object.values(data),recipient:'recipient route metadata'};
 const result=sanitiseDonorAsset(nested,context);
 assert.ok(JSON.stringify(withoutDonor(nested))===JSON.stringify(withoutDonor(result)),'grant summary recipient data changed');
});

test('exact indexed organisation identities are preserved without narrative guesses',()=>{
 let checks=0;
 for(const n of original.flatMap(g=>g.nodes).filter(n=>n.kind==='donor'&&!donorNameWithheld(index,n.label))){
  for(const label of [n.label,...n.aliases||[]]){
   assert.equal(sanitiseDonorAsset(label,context),label,'indexed organisation identity changed');assert.equal(sanitiseDonorAsset(`Recorded: ${label} to a recipient`,context),`Recorded: ${label} to a recipient`,'indexed organisation span changed');checks++;
  }
 }
 assert.ok(checks>0);
});
test('grant catalog records and path tuples keep their recipient identity',()=>{
 const shard=source('grants/federal/shard-00.json'),record=Object.values(shard).find(x=>x&&typeof x==='object');
 const fixtures=[{kind:'grant',href:'/money/grants/recipient/fixture',resource:'grant:fixture',date:'2026-10-10',label:record.rn,grants:shard},['grant:fixture',record.rn,'/grants/recipient/fixture'],{'/money/grants/federal/recipient/fixture':record.rn}];
 for(const fixture of fixtures){const result=sanitiseDonorAsset(fixture,context);assert.ok(JSON.stringify(withoutDonor(result))===JSON.stringify(withoutDonor(fixture)),'grant catalog recipient identity changed');}
});

test('stored editions with grant kind still withhold donor narratives on read',async()=>{
 const {withholdStoredDonors}=await import('../src/donor-sanitise.mjs');
 const n=original.flatMap(g=>g.nodes).find(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)&&!context.registry.names[context.hash(foldDonorName(n.label))]?.exempt);
 assert.ok(n);const post={kind:'grant',date:'2026-10-10',subject:'grant:fixture',title:`${n.label} to the party`,text:`${n.label} to a council`,recipient:'recipient field'};
 const result=withholdStoredDonors(post,context.registry);
 assert.ok(!JSON.stringify(result).includes(n.label),'grant-kind edition bypassed withholding');
 assert.equal(result.recipient,post.recipient);
});

test('registry labels and phrases follow current evidence while anonymous source IDs stay stable',()=>{
 const idHash=context.hash('donor:retired-field'),nameHash=context.hash('schema:retired-value'),entry={id:'donor:withheld-9000',label:'Donor 9000 (name withheld)',exempt:false};
 const prior={names:{[nameHash]:entry},ids:{[idHash]:entry},phrases:[{hash:nameHash,words:2,first:context.hash('schema'),replacement:entry.label}],organisations:[]};
 const fresh=publicationContext(original,[],prior);
 assert.equal(fresh.registry.names[nameHash],undefined);assert.ok(!fresh.registry.phrases.some(p=>p.hash===nameHash));assert.deepEqual(fresh.registry.ids[idHash],entry);
});
