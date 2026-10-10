import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {isOrganisationDonor} from '../public/donor-entity.js';
import * as growthModules from '../public/growth-modules.js';
import {supplierDonations,mountSupplierGrowth} from '../public/supplier-growth.js';
import {cleanEvent,safePath} from '../analytics/privacy.mjs';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const app=read('../public/app.js');
const json=f=>JSON.parse(read(f));
const roslyn={id:'donor:fixture-person',kind:'donor',label:'Quillon Fixturewright',industry:'media'};
const company={id:'donor:acme',kind:'donor',label:'Acme Pty Ltd'};
test('donor privacy uses entity evidence, never industry, including ABN sole traders',()=>{
 assert.equal(isOrganisationDonor(roslyn),false);
 assert.equal(isOrganisationDonor({...roslyn,industry:'individual'}),false);
 assert.equal(isOrganisationDonor({label:'Alex Example',donor_type:'sole trader',abn:'12345678901'}),false);
 assert.equal(isOrganisationDonor({label:'Alex Example',donor_type:'individual',abn:'12345678901'}),false);
 for(const record of [company,{label:'United Workers Union'},{label:'Example Family Trust'},{label:'Example Association'},{label:'Example Council'},{label:'Example',aliases:['Example Services']}])assert.equal(isOrganisationDonor(record),true);
 assert.equal(isOrganisationDonor({label:'Unknown name',industry:'construction'}),false);
 assert.equal(isOrganisationDonor({label:'Alex Example',abn:'12345678901'}),false);
 assert.equal(isOrganisationDonor({label:'Alex Example',acn:'123456789'}),false);
});
test('individual donor fixture is absent from rendered person interests and supplier modules',async()=>{
 const code=app.slice(app.indexOf('async function renderPersonInterests('),app.indexOf('let interestsTiesPromise'));
 const slots=[];
 const ties=[roslyn,company].map(d=>({organisation:d.label,kind:'donor',donor_id:d.id,industry:d.industry,register:{description:d.label,category:'gifts'},flows:[{party:d===roslyn?'Private Party':'Labor',total:100,from:2025,to:2026}]}));
 const record={total:1,buckets:{gifts:{count:1,items:[]}},ties};
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
 const {renderPersonInterests}=runInNewContext(code+';({renderPersonInterests})',{
  growthModules:{...growthModules,loadModulePrivacy:async()=>()=>false},currentSubjectKey:'person',document:{createElement:()=>({dataset:{},remove(){}})},fetch:async url=>({ok:true,json:async()=>url==='/interests/index.json'?{people:{fixture:{}}}:record}),
  esc,safeUrl:()=>'',fmtDate:String,fmtMoney:String,industryLabel:String,partyDotHTML:()=>'',entityHrefAttr:href=>`href="${href}"`,subjectHash:(kind,name)=>`/subject/${kind}/${name}`,sourceLineHTML:()=>'<details class="ui-source"></details>',
 });
 await renderPersonInterests('Example','fixture',{appendChild:slot=>slots.push(slot)});
 assert.doesNotMatch(slots[0].innerHTML,/Quillon Fixturewright|Private Party/);
 assert.match(slots[0].innerHTML,/Acme Pty Ltd|Disclosed money records/);
 assert.ok(slots[0].innerHTML.includes(growthModules.ASSOCIATION_NOTE));
 const prior=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(url);assert.equal(url,'/growth/organisation-donors.json');return {ok:true,json:async()=>({donors:[roslyn,company]})}};
 try{
  const result=await supplierDonations({name:roslyn.label,donor_links:[{id:roslyn.id}]},{signal:new AbortController().signal});
  assert.equal(result.html,'');assert.deepEqual(result.links,[]);assert.equal(calls.length,1);
 }finally{globalThis.fetch=prior}
});
test('an enacted bill without divisions cannot be described as not yet voted',()=>{
 const bill=json('../public/bills/au-federal-r7539.json');
 assert.ok(bill.acts.length);assert.equal(growthModules.noDivisionsHeading(bill),'No formal divisions recorded');
 assert.equal(growthModules.noDivisionsHeading({status:'before_parliament'}),'Not yet voted');
 assert.equal(growthModules.noDivisionsHeading({status:'before_parliament',key_dates:[{stage:'third_reading'}]}),'No formal divisions recorded');
});
test('model previews expose the written date separately from bill status',async()=>{
 const code=app.slice(app.indexOf('async function fillBillPeek('),app.indexOf('/* --- bills on the party page'));
 const body={isConnected:true};
 const bill={summary:{generated_at:'2026-10-08T12:00:00Z',sentences:['Fixture model text.']}};
 const {fillBillPeek}=runInNewContext(code+';({fillBillPeek})',{growthModules:{...growthModules,loadModulePrivacy:async()=>()=>false},loadBill:async()=>bill,billHash:k=>'/bill/'+k,entityHrefAttr:h=>`href="${h}"`,iconSvg:()=>'',esc:String,billStatusLine:()=> 'Passed, status as at 9 Oct 2026',machineLabelHTML:()=>'<span>Machine-written</span>'});
 await fillBillPeek({querySelector:()=>body},{key:'test',has_summary:true});
 assert.match(body.innerHTML,/Machine-written/);assert.match(body.innerHTML,/Summary written <time datetime="2026-10-08">8 Oct 2026/);assert.match(body.innerHTML,/status as at 9 Oct 2026/);
});
test('typed generic bill question carries full bill title and key through the real form',()=>{
 const bill={title:'Example Bill 2026',key:'au-federal-example'};
 const field={value:'What does this bill change?',addEventListener(){}};
 const handlers={};
 const form={dataset:{recordTitle:bill.title,recordKey:bill.key},isConnected:true,querySelector:()=>field,addEventListener:(event,fn)=>handlers[event]=fn,closest:()=>({dataset:{pageType:'bill'}})};
 const urls=[],events=[];
 const code=app.slice(app.indexOf('function wireGrowthAsk('),app.indexOf('/** The ask field under'));
 const {wireGrowthAsk}=runInNewContext(code+';({wireGrowthAsk})',{growthModules,fitQueryField(){},ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),addEventListener(){},document:{fonts:{ready:Promise.resolve()}},trackOutcome:(event,properties)=>events.push({event,properties}),goRoute:url=>urls.push(url)});
 wireGrowthAsk({querySelector:()=>form});handlers.submit({preventDefault(){}});
 const url=new URL(urls[0],'https://fixture.test');
 assert.equal(url.searchParams.get('from'),'bill');
 for(const text of [field.value,bill.title,bill.key])assert.ok(url.searchParams.get('q').includes(text));
 assert.equal(events.length,1);assert.equal(events[0].event,'opax_module_click');
 assert.match(growthModules.askBlockHTML({bill,pageType:'bill',privacy:()=>false}),/data-record-key="au-federal-example"/);
});
test('related sponsor rows wait for visibility, never loading the bill index or roster',async()=>{
 const code=app.slice(app.indexOf('function renderOtherSponsorBills('),app.indexOf('/* --- bills on the person page'));
 let observe,reads=0;
 const slot={isConnected:true,innerHTML:'',remove(){this.removed=true}};
 const {renderOtherSponsorBills}=runInNewContext(code+';({renderOtherSponsorBills})',{
  growthModules,billView:'view',billTextGeneration:1,loadSponsorSummary:async()=>{reads++;return {person:{name:'Andrew Gee'},bills:[{key:'other',jurisdiction:'federal',title:'Other Bill'}]};},IntersectionObserver:class{constructor(fn){observe=fn}observe(){}disconnect(){}},addEventListener(){},sourceLineHTML:()=>'',billHash:k=>'/bill/'+k,billName:b=>b.title,fmtDate:()=>'',sentenceCase:()=>'',esc:String,
 });
 renderOtherSponsorBills({key:'current',jurisdiction:'federal',sponsor:'GEE, Andrew, MP'},{querySelector:()=>slot},'view',1);
 assert.equal(reads,0);observe([{isIntersecting:true}]);await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);assert.match(slot.innerHTML,/Other Bill/);
 assert.doesNotMatch(code,/loadBillsIndex|loadParliamentarians/);
});
test('supplier scroll fetches one bounded agency summary, never grants shards or money graph',async()=>{
 const prior=globalThis.fetch,priorObserver=globalThis.IntersectionObserver;
 let trigger;const calls=[];
 globalThis.IntersectionObserver=class{constructor(fn){trigger=fn}observe(){}disconnect(){}};
 globalThis.fetch=async url=>{calls.push(url);assert.match(url,/^\/growth\/agencies\/[a-f0-9]+\.json$/);return {ok:true,json:async()=>({agency:{name:'Agency',suppliers:[{id:'other',name:'Other',total:1}]},grants:[],meta:{}})}};
 const root={dataset:{},innerHTML:''};
 try{
  await mountSupplierGrowth(root,{id:'me',agencies:[{name:'Agency',total:1}]},{},{alive:()=>true,cleanup(){}},[{id:'other',name:'Published Other',profile_path:'/suppliers/01.json'}]);
  assert.equal(calls.length,0);trigger([{isIntersecting:true}]);
  for(let i=0;i<20&&!root.dataset.recordsReady;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(calls.length,1);assert.equal(root.dataset.recordsReady,'true');assert.match(root.innerHTML,/Published Other/);
 }finally{globalThis.fetch=prior;globalThis.IntersectionObserver=priorObserver}
});
test('published growth assets are bounded and the small donor index excludes individuals',()=>{
 for(const dir of ['sponsors','agencies'])for(const file of readdirSync(new URL('../public/growth/'+dir+'/',import.meta.url)))assert.ok(statSync(new URL('../public/growth/'+dir+'/'+file,import.meta.url)).size<=24000);
 const index=json('../public/growth/organisation-donors.json');assert.ok(Buffer.byteLength(JSON.stringify(index))<=64000);
 assert.ok(index.donors.every(growthModules.isOrganisationDonor));assert.ok(!index.donors.some(d=>d.label==='Quillon Fixturewright'));
});
test('primary, modified and middle module openings count once; right clicks do not count',()=>{
 const listeners=new Map(),measured=[];
 class Element{closest(selector){return selector==='a[href]'?this:selector==='[data-module]'?{dataset:{module:'agency_grants',pageType:'supplier',modulePosition:'2'}}:null}}
 const code=read('../analytics/events.js').replace(/^import .*;\s*/gm,'');
 runInNewContext(code,{cleanEvent,safePath,Element,navigator:{},window:{},location:{href:'https://fixture.test/subject/supplier/test',pathname:'/subject/supplier/test',hostname:'fixture.test'},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e);if(e.type==='opax:measured')measured.push(e.detail)}});
 const target=new Element();
 for(const e of [{type:'click',button:0},{type:'click',button:0,ctrlKey:true},{type:'click',button:1},{type:'auxclick',button:1},{type:'auxclick',button:2}])for(const fn of listeners.get(e.type)||[])fn({...e,target});
 const moduleEvents=measured.filter(e=>e.event==='opax_module_click');assert.equal(moduleEvents.length,3);
 for(const event of moduleEvents)assert.deepEqual({module:event.properties.module,page_type:event.properties.page_type,position:event.properties.position},{module:'agency_grants',page_type:'supplier',position:2});
});

test('parliamentary mentions beside procurement carry the association line',async()=>{
 const code=app.slice(app.indexOf('async function subjectMentions('),app.indexOf('/** Missing speech labels'));
 const {subjectMentions}=runInNewContext(code+';({subjectMentions})',{growthModules,api:async()=>({results:[{slug:'fixture',speaker:'Example Member'}]}),loadParliamentarians:async()=>({people:[]}),fillDatedMentionParties(){},displayTitle:()=> 'Fixture speech',metaHTML:()=> 'Example Member',esc:String,searchHash:()=> '/ask?view=search',URLSearchParams});
 let html='';await subjectMentions('Organisation',{insertAdjacentHTML:(position,value)=>html+=value},'In parliament',true);
 assert.match(html,/Example Member/);assert.ok(html.includes(growthModules.ASSOCIATION_NOTE));
});
