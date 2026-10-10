import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {latestBillVotes,recentSittingSpeeches,otherSponsorBills,askPageType,noDivisionsHeading,ASSOCIATION_NOTE} from '../public/growth-modules.js';
import {agencySuppliers,publishedSupplierIndex,agencyGrants,agencyGrantsHTML} from '../public/supplier-growth.js';
import * as core from '../public/growth-modules.js';
import {cleanEvent} from '../analytics/privacy.mjs';
const read = f=>readFileSync(new URL(f,import.meta.url),'utf8');
const app=read('../public/app.js');
const allow=()=>false;
const personQuestions=record=>core.personQuestions({...record,privacy:allow});
const billQuestions=(bill,people)=>core.billQuestions(bill,people,allow);
const askBlockHTML=record=>core.askBlockHTML({...record,privacy:allow});
const questionsHTML=(questions,type,seed)=>core.questionsHTML(questions,type,seed,allow);
const exactOrganisationDonors=(supplier,donors)=>core.exactOrganisationDonors(supplier,donors,allow);
const donationRegisterHTML=(supplier,donors)=>core.donationRegisterHTML(supplier,donors,allow);
const name='Alex Example';
const votes=[{name:'Old Bill',date:'2025-01-01'},{name:'New Bill',date:'2026-10-08'},{name:'New Bill',date:'2026-10-07'},{name:'Undated Bill'}];
test('missing and stale approvals suppress seeds and model text',()=>{
 const question=`What has ${name} said about Housing?`;
 const privacy=core.approvedModulePrivacy({approved:[name,question]});
 assert.equal(core.questionsHTML([question],'person','',privacy).includes('/ask?'),true);
 assert.equal(core.questionsHTML([question+' Updated'],'person','',privacy),'');
 assert.equal(core.questionsHTML([question],'person'),'');
 assert.equal(core.askBlockHTML({name,pageType:'person',seed:question}),'');
 assert.equal(core.approvedBillSummary({sentences:['Unapproved model text.']}),null);
 assert.deepEqual(core.approvedBillSummary({sentences:[question,'Unapproved model text.']},privacy).sentences,[question]);
});
test('person questions require counted topics, dated bill votes and actual interests',()=>{
 assert.deepEqual(personQuestions({name}),[]);
 assert.deepEqual(personQuestions({name,topics:[{name:'Housing',count:0}],votes:[{name:'No date'}],interests:{total:0,buckets:{}}}),[]);
 assert.deepEqual(personQuestions({name,topics:[{name:'Health',count:2},{name:'Housing',count:10}],votes,interests:{total:1,buckets:{gifts:{count:1}}}}).map(q=>q.question),[
  `What has ${name} said about Housing?`,`How did ${name} vote on New Bill?`,`What interests has ${name} declared?`]);
 assert.deepEqual(personQuestions({}),[]);
 assert.equal(personQuestions({name,interests:{total:2,buckets:{}}}).length,0);
});
test('bill questions need divisions or the resolved sponsor’s linked speeches, including zero',()=>{
 const roster=[{name:'Andrew Gee',pid:'1',speeches:10}];
 const bill={title:'A Bill',sponsor:'GEE, Andrew, MP'};
 assert.deepEqual(billQuestions(bill,roster),[]);
 assert.deepEqual(billQuestions({}),[]);
 // Source material alone supplies the placeholder, never a redundant chip.
 assert.deepEqual(billQuestions({...bill,sources:[{kind:'em',url:'https://example.gov/'}]},roster),[]);
 const complete={...bill,divisions:[{date:'2026-10-08'}],speeches:[{slug:'speech-1',speaker:'Andrew Gee'}]};
 assert.deepEqual(billQuestions(complete,roster).map(q=>q.question),['How did each party vote on the A Bill?','What has Andrew Gee said about the A Bill?']);
 for(const speeches of [[{slug:'speech-1',speaker:'Someone Else'}],[{speaker:'Andrew Gee'}],[{slug:'speech-1',speaker:'Gee'}]]) {
  assert.deepEqual(billQuestions({...bill,speeches},roster),[]);
 }
 assert.deepEqual(billQuestions({...complete,sponsor:'Gee'},roster).map(q=>q.question),['How did each party vote on the A Bill?']);
 assert.deepEqual(billQuestions({...complete,sponsor_person_id:'wrong'},roster).map(q=>q.question),['How did each party vote on the A Bill?']);
});
test('short vote labels use exact bill exports while Ask keeps the complete name',()=>{
 const full='The Extremely Long Official Name of a Bill About Housing and Other Matters Including Funding Across the Nation Bill 2026';
 const vote={name:full,date:'2026-10-08',jur:'federal'};
 for (const fields of [{title:'Housing Bill'},{short_title:'Housing Bill'}]) {
  const q=personQuestions({name,votes:[{...vote,...fields}]})[0];
  assert.equal(q.label,`How did ${name} vote on Housing Bill?`);
  assert.equal(q.question,`How did ${name} vote on ${full}?`);
 }
 const record={title:full,short_title:'Housing Bill',jurisdiction:'federal'};
 const q=personQuestions({name,votes:[vote],bills:[record]})[0];
 assert.equal(q.label,`How did ${name} vote on Housing Bill?`);
 const fallback=personQuestions({name,votes:[vote],bills:[{...record,jurisdiction:'nsw'}]})[0];
 assert.ok(fallback.label.endsWith('…'));
 assert.ok(fallback.label.length<=101);
 assert.ok(fallback.question.startsWith(fallback.label.slice(0,-1)+' '));
 const html=questionsHTML([fallback],'person');
 const href=html.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');
 assert.equal(new URL(href,'https://local.test').searchParams.get('q'),fallback.question);
 assert.match(html,/rel="nofollow"/);
});
test('Ask placeholders and suggestions never duplicate a seed or each other',()=>{
 const person=askBlockHTML({name,pageType:'person',seed:'What has Alex Example said about housing?',questions:['What has Alex Example said about housing?','What interests has Alex Example declared?','What interests has Alex Example declared?']});
 assert.equal((person.match(/<a /g)||[]).length,1);
 const bill=askBlockHTML({bill:{title:'A Bill'},pageType:'bill',seed:'A stale seed'});
 assert.match(bill,/placeholder="What does this bill change\?" required><\/textarea>/);
 assert.doesNotMatch(bill,/A stale seed/);
 assert.match(bill,/<ul class="growth-questions" role="list"><\/ul>/);
 const runtime=app.slice(app.indexOf('function appendGrowthQuestions('),app.indexOf('function wireGrowthAsk('));
 const links=[];
 const list={querySelectorAll:()=>links,insertAdjacentHTML:(_,html)=>{const href=html.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');links.push({href:new URL(href,'https://local.test').href});}};
 const root={querySelector:selector=>selector==='.growth-questions'?list:{value:'Seed question?'}};
 const {appendGrowthQuestions}=runInNewContext(runtime+';({appendGrowthQuestions})',{URL,growthModules:{questionsHTML}});
 const suggestions=['Seed question?','Other question?','Other question?'].map(question=>({question,label:question}));
 appendGrowthQuestions(root,suggestions,'person',allow);
 appendGrowthQuestions(root,suggestions,'person');
 assert.equal(links.length,1);
});
test('Ask module escapes record text, seeds the field and marks every question nofollow',()=>{
 const html=askBlockHTML({name:'Alex <Example>',pageType:'person',seed:'Alex "Example"',questions:['One & two?','Another?']});
 assert.match(html,/>Alex &quot;Example&quot;<\/textarea>/);
 assert.match(html,/Ask about Alex &lt;Example&gt;/);
 const links=[...html.matchAll(/<a [^>]+>/g)].map(m=>m[0]);
 assert.equal(links.length,2);
 for(const link of links){assert.match(link,/rel="nofollow"/);assert.match(link,/href="\/ask\?q=/);assert.match(link,/from=person/);}
});
test('latest bill rows combine both voting sides once per bill; sitting week uses latest dated records',()=>{
 assert.deepEqual(latestBillVotes(votes).map(v=>v.name),['New Bill','Old Bill']);
 assert.equal(latestBillVotes([{name:'Appropriation Bill',date:'2026-09-17',jur:'federal'},{name:'Appropriation Bill',date:'2026-09-10',jur:'nsw'}]).length,2);
 assert.match(app,/entry\.jurisdiction !== row\.dataset\.billJur/);
 const rows=[{date:'2026-09-17',slug:'one'},{date:'2026-09-14',slug:'two'},{date:'2026-09-10',slug:'old'},{slug:'undated'}];
 assert.deepEqual(recentSittingSpeeches(rows),{week:'2026-09-14',speeches:rows.slice(0,2)});
 assert.deepEqual(recentSittingSpeeches([]),{week:'',speeches:[]});
});
const supplier={name:'ACME Pty Ltd',abn:'12 345 678 901'};
const donor={kind:'donor',label:'Acme Pty. Ltd.',industry:'manufacturing',abn:'12345678901'};
test('donation matches require an organisation and exact normalised name, with ABN when both hold one',()=>{
 assert.equal(exactOrganisationDonors(supplier,[donor]).length,1);
 for(const d of [{kind:'donor',label:'Alex Example',abn:donor.abn},{kind:'donor',label:'Roslyn Packer',industry:'media'},{...donor,abn:'99999999999'},{...donor,label:'Acme Group Pty Ltd'}]) assert.equal(exactOrganisationDonors(supplier,[d]).length,0);
 assert.equal(exactOrganisationDonors({...supplier,abn:null},[donor]).length,1);
 assert.equal(exactOrganisationDonors(supplier,[{...donor,abn:null}]).length,1);
 assert.equal(donationRegisterHTML(supplier,[{kind:'donor',label:'Alex Example',abn:donor.abn}]),'');
 assert.equal(donationRegisterHTML(supplier,[donor,{...donor,id:'second'}]),'');
 assert.match(donationRegisterHTML(supplier,[donor]),/Also in the donations register/);
 assert.ok(donationRegisterHTML(supplier,[donor]).includes(ASSOCIATION_NOTE));
});
test('live individual-donor fixture cannot enter the supplier donations or funding path',async()=>{
 const {supplierDonations}=await import('../public/supplier-growth.js');
 const prior=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({donors:[{kind:'donor',label:'Alex Example',abn:donor.abn,id:'donor:alex'}]})});
 try {assert.deepEqual(await supplierDonations({...supplier,name:'Alex Example',donor_links:[{id:'donor:alex',url:'/subject/donor/Acme',method:'abn'}]},{signal:new AbortController().signal}),{html:'',links:[]});}finally{globalThis.fetch=prior;}
 const source=read('../public/suppliers.js');
 assert.match(source,/supplierDonations\(profile, life\).then\(donations =>/);
 assert.match(source,/const donorLinks = donations.links/);
 assert.doesNotMatch(source,/profile.donor_links[^\n]*filter/);
});
test('other bills use the shared sponsor-person identity rule, with no surname guesses',()=>{
 const roster=[{name:'Andrew Gee',pid:'1',speeches:1}];
 const bill={key:'one',jurisdiction:'federal',sponsor:'GEE, Andrew, MP'};
 assert.deepEqual(otherSponsorBills(bill,[bill,{...bill,key:'two',sponsor:'Andrew Gee'},{...bill,key:'three',sponsor:'Gee'},{...bill,key:'four',jurisdiction:'nsw'}],roster).map(b=>b.key),['two']);
 assert.deepEqual(otherSponsorBills({...bill,sponsor:'Gee'},[{...bill,key:'two'}],roster),[]);
});
test('agency suppliers exclude this supplier; grants rank exact agency awards once and exclude individuals',()=>{
 const published=publishedSupplierIndex([{id:'me',name:'Me',profile_path:'/suppliers/me.json'},{id:'other',name:'Other',profile_path:'/suppliers/other.json'}]);
 assert.deepEqual(agencySuppliers({suppliers:[{id:'me',total:20},{id:'other',total:10}]},'me',published).map(s=>s.id),['other']);
 const grants=[{id:'GA1',ag:'Agency',v:100},{id:'GA2',ag:'Other agency',v:1000}];
 const rows=agencyGrants([{org:{id:'abn:12345678901',n:'Org',k:'company',grants},person:{id:'person',k:'individual',grants:[{id:'GA3',ag:'Agency',v:2000}]}}],'Agency');
 assert.deepEqual(rows.map(r=>r.id),['GA1']);
 assert.match(agencyGrantsHTML('Agency',rows,{}),/published sample/);
 assert.match(agencyGrantsHTML('Agency',rows,{}),/award=GA1/);
});
test('events keep origin type and module categories without question text',()=>{
 assert.deepEqual(cleanEvent('opax_ask_started',{from_section:'ask',page_type:'person',question:'private'}),{from_section:'ask',page_type:'person'});
 assert.deepEqual(cleanEvent('opax_module_click',{module:'ask',page_type:'bill',position:1,q:'private'}),{module:'ask',page_type:'bill',position:1});
 assert.equal(askPageType('/subject/person/alex'),'person');
 assert.equal(askPageType('/ask?q=private&from=bill'),'bill');
 assert.equal(askPageType('/ask?q=private&from=arbitrary'),'ask');
 assert.equal(askPageType('/ask?q=private'),'ask');
 assert.match(app,/trackOutcome\("opax_ask_started", \{ from_section, page_type:/);
 const events=read('../analytics/events.js');
 assert.equal((events.match(/push\("opax_module_click"/g)||[]).length,1);
 assert.match(events,/closest\("a\[href\]"\)\?\.closest\("\[data-module\]"\)/);
});
test('the actual bill division renderer reuses one section and one SourceLine for voted or unvoted bills',()=>{
 const code=app.slice(app.indexOf('function billDivisionsHTML('),app.indexOf('const BILL_SPEECH_BRIEF_NOTE'));
 const {billDivisionsHTML}=runInNewContext(code+';({billDivisionsHTML})',{growthModules:{moduleAttrs:()=>'',associationHTML:()=>ASSOCIATION_NOTE,noDivisionsHeading},billDedupeDivisions:d=>({divisions:d||[],collapsed:0}),billDivisionHTML:()=>'<li>Division</li>',sourceLineHTML:()=>'<details class="ui-source"></details>',esc:String});
 for(const divisions of [[],[{date:'2026-10-08'}]]) {const html=billDivisionsHTML({divisions});assert.equal((html.match(/<section /g)||[]).length,1);assert.equal((html.match(/class="ui-source"/g)||[]).length,1);assert.match(html,divisions.length?/How each party voted/:/No formal divisions recorded/);}
});
test('person sections are reused once, and money/vote pairings carry the association line',()=>{
 const region=app.slice(app.indexOf('// person\n'),app.indexOf('/** The ask field under'));
 assert.equal((region.match(/renderPersonVotes\(/g)||[]).length,1);
 assert.equal((region.match(/renderPersonInterests\(/g)||[]).length,1);
 assert.equal((region.match(/renderPersonSpeeches\(speechSpeaker/g)||[]).length,1);
 const votesCode=app.slice(app.indexOf('async function renderPersonVotes'),app.indexOf('async function renderPersonTopics'));
 assert.match(votesCode,/Latest bills they voted on<\/h3>\n    \$\{growthModules.associationHTML\(\)\}/);
 const interestCode=app.slice(app.indexOf('async function renderPersonInterests'),app.indexOf('let interestsTiesPromise'));
 assert.match(interestCode,/Disclosed money records<\/h3>\n      \$\{growthModules.associationHTML\(\)\}/);
 assert.match(interestCode,/\$\{growthModules.associationHTML\(\)\}\n    \$\{sourceLineHTML/);
 assert.match(region,/Party disclosures, not this person’s finances[\s\S]*growthModules.associationHTML/);
 assert.match(region,/#person-pay, #person-expenses/);
});
