import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {personQuestions,billQuestions,askBlockHTML,latestBillVotes,recentSittingSpeeches,exactOrganisationDonors,donationRegisterHTML,otherSponsorBills,askPageType,ASSOCIATION_NOTE} from '../public/growth-modules.js';
import {agencySuppliers,agencyGrants,agencyGrantsHTML} from '../public/supplier-growth.js';
import {cleanEvent} from '../analytics/privacy.mjs';
const read = f=>readFileSync(new URL(f,import.meta.url),'utf8');
const app=read('../public/app.js');
const name='Alex Example';
const votes=[{name:'Old Bill',date:'2025-01-01'},{name:'New Bill',date:'2026-10-08'},{name:'New Bill',date:'2026-10-07'},{name:'Undated Bill'}];
test('person questions require counted topics, dated bill votes and actual interests',()=>{
 assert.deepEqual(personQuestions({name}),[]);
 assert.deepEqual(personQuestions({name,topics:[{name:'Housing',count:0}],votes:[{name:'No date'}],interests:{total:0,buckets:{}}}),[]);
 assert.deepEqual(personQuestions({name,topics:[{name:'Health',count:2},{name:'Housing',count:10}],votes,interests:{total:1,buckets:{gifts:{count:1}}}}),[
  `What has ${name} said about Housing?`,`How did ${name} vote on New Bill?`,`What interests has ${name} declared?`]);
 assert.deepEqual(personQuestions({}),[]);
 assert.equal(personQuestions({name,interests:{total:2,buckets:{}}}).length,0);
});
test('bill questions are supported by source material, speeches or divisions, including zero',()=>{
 assert.deepEqual(billQuestions({title:'A Bill'}),[]);
 assert.deepEqual(billQuestions({}),[]);
 assert.deepEqual(billQuestions({title:'A Bill',sources:[{kind:'em',url:'javascript:bad'}]}),[]);
 assert.deepEqual(billQuestions({title:'A Bill',sources:[{kind:'em',url:'https://example.gov/'}],divisions:[{date:'2026-10-08'}]}),['What changes does the A Bill propose?','How did each party vote on the A Bill?']);
 assert.equal(billQuestions({title:'A Bill',speeches:[{slug:'speech-1'}]}).length,1);
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
 for(const d of [{...donor,industry:'individual'},{...donor,industry:' INDIVIDUAL '},{...donor,industry:'individuals'},{...donor,industry:'other'},{...donor,industry:'unknown'},{...donor,industry:''},{...donor,industry:undefined},{...donor,abn:'99999999999'},{...donor,label:'Acme Group Pty Ltd'}]) assert.equal(exactOrganisationDonors(supplier,[d]).length,0);
 assert.equal(exactOrganisationDonors({...supplier,abn:null},[donor]).length,1);
 assert.equal(exactOrganisationDonors(supplier,[{...donor,abn:null}]).length,1);
 assert.equal(donationRegisterHTML(supplier,[{...donor,industry:'individual'}]),'');
 assert.equal(donationRegisterHTML(supplier,[donor,{...donor,id:'second'}]),'');
 assert.match(donationRegisterHTML(supplier,[donor]),/Also in the donations register/);
 assert.ok(donationRegisterHTML(supplier,[donor]).includes(ASSOCIATION_NOTE));
});
test('live individual-donor fixture cannot enter the supplier donations or funding path',async()=>{
 const {supplierDonations}=await import('../public/supplier-growth.js');
 const prior=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({nodes:[{...donor,industry:'individual',id:'donor:acme'}]})});
 try {assert.deepEqual(await supplierDonations({...supplier,donor_links:[{id:'donor:acme',url:'/subject/donor/Acme',method:'abn'}]},{signal:new AbortController().signal}),{html:'',links:[]});}finally{globalThis.fetch=prior;}
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
 assert.deepEqual(agencySuppliers({suppliers:[{id:'me',total:20},{id:'other',total:10}]},'me').map(s=>s.id),['other']);
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
 const {billDivisionsHTML}=runInNewContext(code+';({billDivisionsHTML})',{growthModules:{moduleAttrs:()=>'',associationHTML:()=>ASSOCIATION_NOTE},billDedupeDivisions:d=>({divisions:d||[],collapsed:0}),billDivisionHTML:()=>'<li>Division</li>',sourceLineHTML:()=>'<details class="ui-source"></details>',esc:String});
 for(const divisions of [[],[{date:'2026-10-08'}]]) {const html=billDivisionsHTML({divisions});assert.equal((html.match(/<section /g)||[]).length,1);assert.equal((html.match(/class="ui-source"/g)||[]).length,1);assert.match(html,divisions.length?/How each party voted/:/Not yet voted/);}
});
test('person sections are reused once, and money/vote pairings carry the association line',()=>{
 const region=app.slice(app.indexOf('// person\n'),app.indexOf('/** The ask field under'));
 assert.equal((region.match(/renderPersonVotes\(/g)||[]).length,1);
 assert.equal((region.match(/renderPersonInterests\(/g)||[]).length,1);
 assert.equal((region.match(/renderPersonSpeeches\(speechSpeaker/g)||[]).length,1);
 const votesCode=app.slice(app.indexOf('async function renderPersonVotes'),app.indexOf('async function renderPersonTopics'));
 assert.match(votesCode,/Latest bills they voted on<\/h3>\n    \$\{growthModules.associationHTML\(\)\}/);
 const interestCode=app.slice(app.indexOf('async function renderPersonInterests'),app.indexOf('let interestsTiesPromise'));
 assert.match(interestCode,/Organisations in the registers<\/h3>\n      \$\{growthModules.associationHTML\(\)\}/);
 assert.match(interestCode,/\$\{growthModules.associationHTML\(\)\}\n    \$\{sourceLineHTML/);
 assert.match(region,/Party disclosures, not this person’s finances[\s\S]*growthModules.associationHTML/);
 assert.match(region,/#person-pay, #person-expenses/);
});
