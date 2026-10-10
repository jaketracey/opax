// Render the client modules over the derived test's export. This supplies local
// assets and a small DOM, not another privacy policy or another name scan.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import * as modules from '../public/growth-modules.js';
import {supplierRecordsHTML,agencyGrantsHTML,publishedSupplierIndex} from '../public/supplier-growth.js';
import {sourceLineHTML} from '../public/labels.js';
import * as divisionMarkdown from '../public/division-markdown.js';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const questionsIn=html=>[
 ...[...html.matchAll(/<textarea[^>]*>([^<]*)<\/textarea>/g)].map(m=>decode(m[1])).filter(Boolean),
 ...[...html.matchAll(/href="(\/ask\?[^"<>]+)"/g)].map(m=>new URL(decode(m[1]),'https://fixture.test').searchParams.get('q')).filter(Boolean),
];
const region=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
export async function* moduleOutputs(root,withheld,readAsset) {
 const cache=new Map();
 const read=async path=>{
  path=path.replace(/^\//,'');
  if(!cache.has(path))cache.set(path,readAsset ? await readAsset('/'+path) : JSON.parse(readFileSync(join(root,path),'utf8')));
  return cache.get(path);
 };
 const fetchAsset=async url=>{
  if(typeof url!=='string'||!url.startsWith('/'))throw Error('Only local module assets');
  try {return {ok:true,json:()=>read(url)}}catch{return {ok:false,json:async()=>null}}
 };
 // SSR enriches its cached roster with historical speakers. Module approvals
 // belong to the published roster, so use the fixture file as that authority.
 const roster=JSON.parse(readFileSync(join(root,'parliamentarians.json'),'utf8'));
 const localModules={...modules,loadModulePrivacy:async(kind,id)=>modules.approvedModulePrivacy(await read(await modules.growthSummaryPath('privacy/'+kind,id)))};
 const context={growthModules:localModules,esc,safeUrl:v=>v || '',fmtDate:v=>v || '',fmtMoney:String,industryLabel:String,partyDotHTML:()=>'',
  sourceLineHTML,entityHrefAttr:href=>`href="${esc(href)}"`,subjectHash:(kind,name)=>`/subject/${kind}/${encodeURIComponent(name)}`,fetch:fetchAsset,currentSubjectKey:'fixture',
  document:{createElement:()=>({dataset:{},isConnected:true,remove(){},querySelectorAll:()=>[]})},searchHash:q=>'/ask?view=search&'+new URLSearchParams({q}),STATE_NAMES:{},billQuestion:v=>v,
  machineLabelHTML:({note=''})=>`<span>${esc(note)}</span>`,partyChipHTML:esc,
 };
 const interestVM=runInNewContext(region('async function renderPersonInterests(','let interestsTiesPromise')+';({renderPersonInterests})',context);
 const tiesVM=runInNewContext(region('function declaredTieHTML(','function declaredRowHTML(')+';({declaredTieHTML})',context);
 const votesData=await read('votes.json'),bills=await read('bills/index.json');
 const billRecords=await Promise.all(bills.bills.map(b=>read('bills/'+b.key+'.json')));
 const speechesBySpeaker=new Map();
 for(const bill of billRecords)for(const speech of bill.speeches || []){
  const key=modules.normalisedName(speech.speaker);if(!key)continue;
  if(!speechesBySpeaker.has(key))speechesBySpeaker.set(key,[]);
  speechesBySpeaker.get(key).push({...speech,title:bill.title,snippet:speech.brief || '',resource:speech.slug});
 }
 let number=0;
 for(const person of roster.people){
  const approved=await localModules.loadModulePrivacy('person',modules.normalisedName(person.name));
  const slots=[];
  await interestVM.renderPersonInterests(person.name,person.pid,{appendChild:slot=>slots.push(slot)});
  const speeches=[...new Set([person.name,person.full].filter(Boolean))].flatMap(name=>speechesBySpeaker.get(modules.normalisedName(name)) || []).sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,8);
  const {renderPersonSpeeches}=runInNewContext(region('async function renderPersonSpeeches(','function splitSpeechSearch(')+';({renderPersonSpeeches})',{
   ...context,api:async()=>({results:speeches}),titleSubject:r=>r.title,cleanPassage:v=>v,refreshEntryRail(){},fetchBriefMap:async()=>({}),
  });
  await renderPersonSpeeches(person.name,[],[],{appendChild:slot=>slots.push(slot)},{privacy:approved});
  const voteSlot={dataset:{},isConnected:true,innerHTML:'',remove(){}};
  const votesVM=runInNewContext(region('async function renderPersonVotes(','async function renderPersonTopics')+';({renderPersonVotes})',{
   ...context,votesData,loadVotes:async()=>{},loadBillsIndex:async()=>bills,$:()=>voteSlot,decoratePersonVoteBills(){},
  });
  let record={};
  await votesVM.renderPersonVotes(person.name,person.pid,{insertAdjacentHTML(){}},r=>record=r);
  const name=person.full || person.name;
  const questionRows=modules.personQuestions({name,...record,privacy:approved});
  const html=modules.askBlockHTML({name,pageType:'person',seed:`What has ${name} said in parliament?`,questions:questionRows,privacy:approved})+slots.map(s=>s.innerHTML || '').join('')+voteSlot.innerHTML;
  yield {where:`person module ${number++}`,html,questions:questionsIn(html)};
  // Entries injected into the same actual reused renderer use this record's approvals.
  const ties=withheld.map((name,i)=>({organisation:name,kind:'donor',donor_id:'donor:fixture-'+i,register:{description:name},flows:[{party:'Fixture Party',total:1}]}));
  yield {where:`person ties ${number}`,html:tiesVM.declaredTieHTML(ties,approved),questions:[]};
 }
 number=0;
 for(const original of billRecords){
  const bill={...original};
  const approved=await localModules.loadModulePrivacy('bill',bill.key);
  bill.modulePrivacy=approved;
  const html=modules.askBlockHTML({bill,pageType:'bill',questions:modules.billQuestions(bill,roster.people,approved),privacy:approved});
  yield {where:`bill Ask module ${number}`,html,questions:questionsIn(html)};
  const billVM=runInNewContext(region('const BILL_SPLIT_DRAWN =','function billRelatedHTML(')+';({billDivisionsHTML,billSpeechesHTML,billSummaryHTML})',{
   ...context,divisionMarkdown,hasEntityId:v=>Boolean(v),billStage:v=>v || '',billHouse:v=>v || '',billPartyName:v=>v || '',billOutcomeLabelHTML:esc,
   billOriginals:sources=>(sources || []).map(s=>({label:s.kind,href:s.url})),billLicence:()=>'',BILL_SOURCE_NAMES:{},
  });
  const reused=billVM.billDivisionsHTML(bill)+billVM.billSpeechesHTML(bill)+billVM.billSummaryHTML(bill);
  const peek={isConnected:true,innerHTML:''};
  const {fillBillPeek}=runInNewContext(region('async function fillBillPeek(','/* --- bills on the party page')+';({fillBillPeek})',{
   ...context,loadBill:async()=>bill,billHash:k=>'/bill/'+k,iconSvg:()=>'',billStatusLine:()=>'',
  });
  await fillBillPeek({querySelector:()=>peek},{key:bill.key,has_summary:Boolean(bill.summary)});
  yield {where:`bill reused modules ${number}`,html:reused+peek.innerHTML,questions:questionsIn(reused+peek.innerHTML),
   partyNames:(bill.divisions || []).flatMap(d=>Object.keys(d.party_splits || {})),approved};
  const slot={isConnected:true,innerHTML:'',remove(){this.innerHTML=''}};
  const {renderOtherSponsorBills}=runInNewContext(region('function renderOtherSponsorBills(','/* --- bills on the person page')+';({renderOtherSponsorBills})',{
   ...context,billView:'fixture',billTextGeneration:1,loadSponsorSummary:async b=>{const p=await modules.sponsorSummaryPath(b);return p ? read(p).catch(()=>null) : null},
   billHash:key=>'/bill/'+encodeURIComponent(key),billName:b=>b.title,sentenceCase:v=>v || '',addEventListener(){},
  });
  renderOtherSponsorBills(bill,{querySelector:()=>slot},'fixture',1);
  await new Promise(resolve=>setImmediate(resolve));
  yield {where:`bill sponsor module ${number++}`,html:slot.innerHTML,questions:questionsIn(slot.innerHTML)};
 }
 const directory=await read('suppliers.json'),published=publishedSupplierIndex(directory.suppliers);
 const donorIndex=await read('growth/organisation-donors.json'),donorPrivacy=modules.approvedModulePrivacy(donorIndex);
 const moneyData=await read('graph/money.json');
 const {partyFlows}=runInNewContext(region('function barList(','const fmtIndustries')+';async function partyFlows(node){const key="fixture";const isParty=true;'+
  region('const donorPrivacy = growthModules.approvedModulePrivacy(await growthModules.loadModuleDonors());','// Identity once (principle 3)')+
  ';return barList(flowRows,{heading:"Disclosed gifts",linkTo:name=>subjectHash("donor",name)});} ;({partyFlows})',{
   ...context,moneyData,growthModules:{...localModules,loadModuleDonors:async()=>donorIndex},
  });
 for(const [i,node] of moneyData.nodes.filter(n=>n.kind==='party').entries())yield {where:`party flow module ${i}`,html:await partyFlows(node),questions:[]};
 number=0;
 for(const entry of directory.suppliers){
  const profile=(await read(entry.profile_path)).profiles[entry.id];
  const top=[...(profile.agencies || [])].sort((a,b)=>Number(b.total)-Number(a.total))[0];
  const summary=top ? await read(await modules.growthSummaryPath('agencies',modules.normalisedName(top.name))).catch(()=>null) : null;
  const html=(summary ? supplierRecordsHTML(summary.agency,profile.id,summary.contracts_updated,published)+agencyGrantsHTML(top.name,summary.grants,summary.meta) : '')
   +modules.donationRegisterHTML(profile,donorIndex.donors,donorPrivacy);
  yield {where:`supplier modules ${number++}`,html,questions:[]};
 }
 // All derived names are also tried in record-backed seeds and donor matches.
 for(const [i,name] of withheld.entries()){
  const approved=await localModules.loadModulePrivacy('person',modules.normalisedName(roster.people[0].name));
  const person=roster.people[0].full || roster.people[0].name;
  const title=`Donations from ${name} Bill`;
  const questions=modules.personQuestions({name:person,topics:[{name:`${name} donations`,count:1}],votes:[{name:title,date:'2026-10-10'}],privacy:approved});
  const bill={key:'fixture',title,divisions:[{}]};
  const html=modules.questionsHTML(questions,'person','',approved)+modules.askBlockHTML({bill,pageType:'bill',questions:modules.billQuestions(bill,[],approved),privacy:approved})
   +modules.donationRegisterHTML({name},[{kind:'donor',label:name}],donorPrivacy);
  yield {where:`withheld record fixture ${i}`,html,questions:questionsIn(html)};
 }
}
