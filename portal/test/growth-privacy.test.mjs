import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {isOrganisationDonor} from '../public/donor-entity.js';
import * as growthModules from '../public/growth-modules.js';
import {supplierDonations} from '../public/supplier-growth.js';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const app=read('../public/app.js');
const graphs=['money','money.qld','money.vic','money.tas'].map(name=>JSON.parse(read(`../public/graph/${name}.json`)));
const rejected=graphs.flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&!isOrganisationDonor(n)));
const company={kind:'donor',id:'donor:fixture',label:'Fixture Company Pty Ltd'};
const untyped={kind:'donor',id:'donor:untyped',label:'Alex Example',abn:'12345678901',industry:'media'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ties=nodes=>nodes.map(n=>({...n,organisation:n.label,donor_id:n.id,register:{description:n.label,category:'gifts'},flows:[{party:'Private flow fixture',total:100,from:2025,to:2026}]}));
const noNames=(html,nodes)=>{for(const n of nodes)assert.ok(!html.includes(esc(n.label)),`Rejected donor named: ${n.label}`)};

async function personHTML(nodes) {
 const code=app.slice(app.indexOf('async function renderPersonInterests('),app.indexOf('let interestsTiesPromise'));
 const slots=[];
 const {renderPersonInterests}=runInNewContext(code+';({renderPersonInterests})',{
  growthModules,currentSubjectKey:'fixture',document:{createElement:()=>({dataset:{},remove(){}})},
  fetch:async url=>({ok:true,json:async()=>url==='/interests/index.json'?{people:{fixture:{}}}:{total:1,buckets:{gifts:{count:1,items:[]}},ties:ties(nodes)}}),
  esc,safeUrl:()=>'',fmtDate:String,fmtMoney:String,industryLabel:String,partyDotHTML:()=>'',entityHrefAttr:href=>`href="${href}"`,subjectHash:(kind,name)=>`/subject/${kind}/${name}`,sourceLineHTML:()=>'<details class="ui-source"></details>',
 });
 await renderPersonInterests('Example','fixture',{appendChild:slot=>slots.push(slot)});
 return slots.map(s=>s.innerHTML).join('');
}

test('modules import main’s classifier and reject an untyped individual with an ABN',async()=>{
 assert.ok(!existsSync(new URL('../public/donor-privacy.js',import.meta.url)));
 assert.match(read('../public/growth-modules.js'),/import \{ isOrganisationDonor \} from '\.\/donor-entity\.js(?:\?v=[a-f0-9]+)?'/);
 for(const g of graphs)for(const n of g.nodes)assert.equal(growthModules.isOrganisationDonor(n),isOrganisationDonor(n));
 assert.equal(isOrganisationDonor(untyped),false);
 noNames(await personHTML([untyped]),[untyped]);
 assert.equal(growthModules.donationRegisterHTML({name:untyped.label,abn:untyped.abn},[untyped]),'');
 const prior=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({donors:[untyped,company]})}};
 try {
  const result=await supplierDonations({name:untyped.label,abn:untyped.abn,donor_links:[{id:untyped.id,method:'abn'}]},{signal:new AbortController().signal});
  assert.equal(result.html,'');assert.deepEqual(result.links,[]);assert.deepEqual(calls,['/growth/organisation-donors.json']);
 } finally {globalThis.fetch=prior}
});

test('every rejected donor in all four exports is absent from person modules, including party flows',async()=>{
 assert.ok(rejected.length>0,'derive the fixture from the whole export');
 const html=await personHTML(rejected);
 noNames(html,rejected);assert.doesNotMatch(html,/Private flow fixture|person-ties/);
 assert.match(await personHTML([company]),/Fixture Company Pty Ltd/);
});

test('every rejected export donor is absent from the reused declared-interest ties renderer',()=>{
 const code=app.slice(app.indexOf('function declaredTieHTML('),app.indexOf('function declaredRowHTML('));
 const {declaredTieHTML}=runInNewContext(code+';({declaredTieHTML})',{growthModules,esc,safeUrl:()=>'',industryLabel:String,entityHrefAttr:href=>`href="${href}"`,subjectHash:(kind,name)=>`/subject/${kind}/${name}`});
 const html=declaredTieHTML(ties(rejected));
 noNames(html,rejected);assert.equal(html,'');
 assert.match(declaredTieHTML(ties([company])),/Fixture Company Pty Ltd/);
});

test('every rejected export donor is absent from party flow module HTML before grouping or top-ten selection',()=>{
 const nodes=[...rejected,untyped,company];
 const party={id:'party:fixture',kind:'party',label:'Fixture Party'};
 const moneyData={nodes:[...nodes,party],edges:nodes.map((n,i)=>({source:n.id,target:party.id,total:n===company?1:10000+i}))};
 const start=app.indexOf('const flows = moneyData.edges.filter');
 const code=app.slice(start,app.indexOf('// Identity once',start));
 const bars=app.slice(app.indexOf('function barList('),app.indexOf('const fmtIndustries'));
 const {html,flowRows}=runInNewContext(code+bars+';({flowRows,html:barList(flowRows,{heading:"Where it came from",linkTo:name=>"/subject/donor/"+encodeURIComponent(name)})})',{growthModules,moneyData,node:party,isParty:true,esc});
 noNames(html,[...rejected,untyped]);assert.match(html,/Fixture Company Pty Ltd/);assert.equal(flowRows.length,1);
});

test('every rejected export donor is absent from supplier donor-line HTML, including matching ABNs',()=>{
 for(const donor of [...rejected,untyped]){
  const html=growthModules.donationRegisterHTML({name:donor.label,abn:donor.abn},[donor]);
  noNames(html,[donor]);assert.equal(html,'');
 }
 const donor={...company,abn:'12345678901'};
 assert.match(growthModules.donationRegisterHTML({name:donor.label,abn:donor.abn},[donor]),/Fixture Company Pty Ltd/);
 assert.equal(growthModules.donationRegisterHTML({name:donor.label,abn:'99999999999'},[donor]),'');
});

test('the bounded donor index preserves main’s name evidence and excludes its rejected records',()=>{
 const index=JSON.parse(read('../public/growth/organisation-donors.json'));
 assert.ok(Buffer.byteLength(JSON.stringify(index))<64000);
 const original=new Map(graphs[0].nodes.map(n=>[n.id,n]));
 assert.ok(index.donors.length>0);
 for(const n of index.donors){assert.ok(isOrganisationDonor(n));assert.ok(isOrganisationDonor(original.get(n.id)))}
 for(const n of graphs[0].nodes.filter(n=>n.kind==='donor'&&!isOrganisationDonor(n)))assert.ok(!index.donors.some(d=>d.id===n.id));
 for(const n of graphs[0].nodes.filter(n=>n.kind==='donor'&&isOrganisationDonor(n)))assert.ok(index.donors.some(d=>d.id===n.id));
});
