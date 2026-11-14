import {industryLabel as ledgerIndustryLabel} from '../public/ledger.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import {fy, financialYear, moneyScope, industryName} from '../public/money-scope.js';
import {donorLookup, receiptFigures, receiptScopeLabel, offMapDonorNote, receiptTypeLine, hasPartyReceipts, notListedLine, donorLabelHTML} from '../public/donor-disclosure.js';
import {shortMoney} from '../public/format.js';
import {formatCell, dataTableHTML, applyQuery, toCSV} from '../public/datatable.js';
import {partyMoneyTableConfig} from '../public/register-tables.js';
import {partyMembers, partyMembersHTML} from '../public/party-page.js';
import {renderMoneyConnectionsTable} from '../src/money-connections-table.ts';
import {receiptGraphView, moneyYearBounds} from '../graph/receipt-view.ts';
const app=ts.createSourceFile('app.js',readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const names=['donorRecordHTML','renderDonorStateMoney','partyReceiptsHTML','partyLatestYear','personPartyFigure','fillDatedMentionParties','metaHTML','renderPartyMembers'];
const code=app.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(app)).join('\n');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const helpers={esc,fy,moneyScope,receiptFigures,receiptScopeLabel, offMapDonorNote,receiptTypeLine,hasPartyReceipts,notListedLine,fmtMoney:shortMoney,fmtDollars:n=>'$'+n.toLocaleString('en-AU'),safeUrl:s=>s,
  tile:(n,label)=>`<div><b>${esc(n)}</b> ${esc(label)}</div>`,yearSpan:(a,b)=>a===b?String(a):`${a}–${b}`,
  sourceLineHTML:opts=>`<aside>${esc(opts.source)} ${opts.notes.map(esc).join(' ')}</aside>`,AEC_NOTE:'Check the original records.',AEC_LICENCE:'AEC licence',
  MONEY_JURISDICTIONS:{federal:{label:'Federal'},qld:{label:'Queensland'}},STATE_NOT_SUMMED:'Jurisdictions are not added together.',
  currentSubjectKey:'fixture',normName:s=>s.toLowerCase(),moneyHash:jur=>'/money?jur='+jur,subjectHash:()=>'/subject/party/fixture',entityHrefAttr:s=>`href="${s}"`};
const api=extra=>runInNewContext(code+';({'+names.join(',')+'})',{...helpers,...extra});

test('scope helper distinguishes the map slice and whole return without changing a figure',()=>{
 assert.equal(fy('2024-25'),'2024–25');assert.equal(fy('2024-11-13'),'2024-11-13');assert.equal(financialYear(1998),'1998–99');
 assert.equal(moneyScope('map',{year:'2024-25'}),'from named donors on the map, all receipt types from AEC federal returns, 2024–25');
 assert.equal(moneyScope('return',{year:'2024-25',branches:9}),'total receipts on the 2024–25 AEC federal return, all receipt types, 9 branches summed');
 const figures={typed:true,firstYear:1998,lastYear:2024};assert.doesNotMatch(receiptScopeLabel(figures),/\d{4}-\d{2}/);
});
test('party return and person row keep their separate figures and state their scope',()=>{
 const f=api(),node={by_type_year:{'2024-25':{donation_received:[120,2],other_receipt:[30,1]}}};
 const row=f.personPartyFigure(node);assert.equal(row.total,150);assert.equal(row.scope,'from named donors on the map, all receipt types from AEC federal returns, 2024–25');
 const text=new JSDOM(f.partyReceiptsHTML([['2024-25',900,0,0,3,200,100]],'https://fixture.test')).window.document.body.textContent;
 assert.match(text,/total receipts on the 2024–25 AEC federal return, all receipt types, 3 branches summed/);assert.match(text,/\$900/);assert.doesNotMatch(text,/2024-25/);
});
const federal={id:'federal:fern',source_name:'FERN EXAMPLE PTY LTD',label:'FERN EXAMPLE PTY LTD',jurisdiction:'federal',total:14320,count:7,firstYear:2020,lastYear:2024,returnReferences:[]};
const state={...federal,id:'qld:fern',jurisdiction:'qld',total:6700,count:2};
test('N03: index-only federal profile names mixed disclosure records, preserving total and count',()=>{
 const html=api().donorRecordHTML(federal),doc=new JSDOM(html).window.document;
 assert.equal(doc.querySelector('.subject-section-title').textContent,'Source records');assert.match(doc.body.textContent,/7 records/);assert.match(doc.body.textContent,/\$14.3k/);
 assert.equal(doc.querySelector('.entry-scope').textContent,receiptScopeLabel({typed:false}));assert.doesNotMatch(doc.body.textContent,/Disclosed gifts|7 gifts/);
});
test('typed off-map profiles keep the receipt figure, count and scope despite poisoned source totals',()=>{
 const record={...federal,total:999999,count:999,by_type:{donation_received:120,other_receipt:30},by_type_year:{'2024-25':{donation_received:[120,2],other_receipt:[30,1]}}};
 const doc=new JSDOM(api().donorRecordHTML(record)).window.document;
 assert.equal(doc.querySelector('.subject-section-title').textContent,'Disclosed receipts');
 assert.match(doc.body.textContent,/\$150.*3 receipts/s);assert.doesNotMatch(doc.body.textContent,/999|gift can appear twice|both donor and party/);
 assert.equal(doc.querySelector('.entry-scope').textContent,receiptScopeLabel(receiptFigures(record))+'. '+receiptTypeLine(record)+'.');
 assert.match(doc.querySelector('aside').textContent,/Receipts disclosed under this exact name\. This donor is not drawn on the money map, which shows a bounded selection of donors/);
});
test('N04: both lookup orders retain the federal record and profile jurisdictions separately',async()=>{
 for(const records of [[federal,state],[state,federal]]){
  const index=donorLookup(records),key=federal.label.toLowerCase();
  assert.equal(index.get('federal:'+key),federal);assert.equal(index.get('qld:'+key),state);assert.equal(index.get(key).records.length,2);
  const dom=new JSDOM('<main></main>'),sections=dom.window.document.querySelector('main');
  sections.innerHTML=api().donorRecordHTML(index.get('federal:'+key));
  await api({document:dom.window.document,loadMoneyFile:async()=>({meta:{sourceShort:'ECQ',jurisdictionLabel:'Queensland'},nodes:[{...state,kind:'donor'}],edges:[]})}).renderDonorStateMoney(federal.label,sections,{only:true});
  assert.match(sections.querySelector('#donor-record').textContent,/\$14.3k.*7 records/s);
  assert.match(sections.querySelector('#state-money').textContent,/Queensland.*\$6.7k.*2 disclosed gifts/s);
  assert.doesNotMatch(sections.textContent,/\$21.0k/);
 }
});
const graph={nodes:[{...federal,id:'donor:fern',kind:'donor',industry:'finance',group:'finance',by_type:{donation_received:120,other_receipt:80},by_type_year:{'2023-24':{donation_received:[20,1],other_receipt:[30,1]},'2024-25':{donation_received:[100,2],other_receipt:[50,1]}}},{id:'party:fern',label:'Fern Party',kind:'party',total:200,count:5,firstYear:2023,lastYear:2024}],edges:[{source:'donor:fern',target:'party:fern',total:999,count:99,firstYear:2023,lastYear:2024,by_type:{donation_received:120,other_receipt:80},by_type_year:{'2023-24':{donation_received:[20,1],other_receipt:[30,1]},'2024-25':{donation_received:[100,2],other_receipt:[50,1]}}}]};
for(const receipt of ['all','donations'])for(const window of ['', '&from=2024&to=2024'])test(`N05: SSR ${receipt}${window} uses exactly the map measure`,async()=>{
 const html=await renderMoneyConnectionsTable(new URL('https://fixture.test/money?receipt='+receipt+window),async()=>structuredClone(graph));
 const doc=new JSDOM(html).window.document,measure=receipt==='donations'?'donation_only':'all_types';
 const expected=receiptGraphView(graph,measure,window?2024:-Infinity,window?2024:Infinity).edges[0];
 const row=doc.querySelector('tbody tr');assert.ok(row.textContent.includes('$'+expected.total.toFixed(2)),row.textContent);assert.ok(row.textContent.includes(String(expected.count)));
 assert.match(doc.querySelector('.mc-explainer').textContent,receipt==='donations'?/Donations only/:/All receipt types/);
});
test('receipt year control ignores future public-money years',()=>{
 const raw={...graph,edges:[...graph.edges,{flow:'contracts',total:1,count:1,firstYear:2027,lastYear:2027}]};assert.deepEqual(moneyYearBounds(raw),{min:2023,max:2024});
});
test('money columns keep even decimals and use shared industry labels',()=>{
 assert.equal(formatCell(120e9,{type:'money'}),'$120bn');assert.equal(formatCell(22000000,{type:'money'}),'$22.0m');assert.equal(formatCell(9000000,{type:'money'}),'$9.0m');
 for(const [key,label] of Object.entries({media:'Media',telecom:'Telecom',legal:'Legal',lobbying:'Lobbying',mining:'Mining',fossil_fuels:'Fossil fuels',energy:'Energy',property:'Property',construction:'Construction','media & tech':'Media & tech','legal & lobbying':'Legal & lobbying','mining & energy':'Mining & energy','property & construction':'Property & construction'}))assert.equal(industryName(key),label);
 for(const key of ['media','telecom','legal','fossil_fuels'])assert.equal(ledgerIndustryLabel(key),industryName(key));
});
test('source names are display only, retain the original in title and CSV, and still link',()=>{
 const record={...federal,label:'FERN EXAMPLE PTY LTD'},doc=new JSDOM(donorLabelHTML(record)).window.document,a=doc.querySelector('a');
 assert.equal(a.textContent,'Fern Example Pty Ltd');assert.equal(a.title,record.label);assert.equal(a.getAttribute('href'),'/subject/donor/FERN%20EXAMPLE%20PTY%20LTD');
 const config=partyMoneyTableConfig([{label:record.label,href:a.href,total:22000000,industry:'telecom',count:2}]);
 const table=new JSDOM(dataTableHTML(config,applyQuery(config.rows,config,{}))).window.document;
 assert.equal(table.querySelector('[data-primary]').title,record.label);assert.match(table.body.textContent,/Fern Example Pty Ltd/);assert.match(toCSV(config.rows,config),/FERN EXAMPLE PTY LTD/);
});
test('Former requires recorded service end; unknown service and stale roster remain neutrally labelled',()=>{
 const roster={people:[{name:'Cora Example',party:'Fern Party',current:true},{name:'Rory Example',party:'Fern Party',current:false,last:2021},{name:'Lena Example',party:'Fern Party',current:false,affiliations:[{end:'2020-01-01'}]}]};
 const members=partyMembers('Fern Party',{roster}),h={...helpers,photoUrlFor:()=>null,personUrl:()=>'/subject/person',partyChipHTML:esc,stateName:s=>s,same:(a,b)=>a===b};
 const doc=new JSDOM(partyMembersHTML('Fern Party',members,h)).window.document;
 const former=[...doc.querySelectorAll('h3.entry-subhead')].find(n=>n.textContent.startsWith('Former'));
 assert.match(former.nextElementSibling.textContent,/Lena Example/);assert.doesNotMatch(former.nextElementSibling.textContent,/Rory|Cora/);
 assert.match(doc.body.textContent,/Sitting members across all parliaments/);assert.match(doc.body.textContent,/service end not recorded/);
});
test('without sitting members, recorded ends and unknown service share a flat neutral Members list',()=>{
 const roster={people:[{name:'Rory Example',party:'Fern Party',current:false,last:2021},{name:'Lena Example',party:'Fern Party',current:false,affiliations:[{end:'2020-01-01'}]}]};
 const h={...helpers,photoUrlFor:()=>null,personUrl:()=>'/subject/person',partyChipHTML:esc,stateName:s=>s,same:(a,b)=>a===b};
 const doc=new JSDOM(partyMembersHTML('Fern Party',partyMembers('Fern Party',{roster}),h)).window.document;
 assert.equal(doc.querySelector('h2').textContent,'Members');
 assert.equal(doc.querySelectorAll('h3.entry-subhead').length,0);
 assert.equal(doc.querySelectorAll('ul.party-member-list').length,1);
 assert.equal(doc.querySelectorAll('li.dir-row').length,2);
 assert.match(doc.body.textContent,/Rory Example/);assert.match(doc.body.textContent,/Lena Example/);
 assert.doesNotMatch(doc.body.textContent,/Former|Sitting|service end not recorded/);
});
test('short and unmatched mention speakers have a neutral display label',()=>{
 const f=api({splitPerson:()=>null,datedAffiliationParty:()=>null,isUnattributed:()=>false,isMultiSpeaker:()=>false,isWitness:()=>false,fmtDate:s=>s,partyChipHTML:esc,STATE_NAMES:{},speakerHref:()=>'/person'});
 const rows=[{speaker:'Ick',party:'Fern'},{speaker:'Unmatched Example'},{speaker:'Cora Example'}];
 f.fillDatedMentionParties(rows,{people:[{name:'Cora Example'}]});
 for(const row of rows.slice(0,2)){const html=f.metaHTML(row,{linkSpeaker:true});assert.match(html,/Speaker not named/);assert.doesNotMatch(html,/<a|Fern/);}
 assert.match(f.metaHTML(rows[2]),/Cora Example/);assert.equal(rows[0].speaker,'Ick');
});

test('directory and full party member counts explicitly name their different scopes',async()=>{
 const dom=new JSDOM('<div class="subject-tag"><span class="entry-active"></span></div><div id="entry-flows"><dl class="ui-sheet-facts"></dl></div>');
 const data={people:[{name:'Cora Example',pid:'f1',party:'Fern',current:true,states:['federal']},{name:'Lena Example',pid:'s1',party:'Fern',current:true,states:['vic']}]};
 const f=api({loadParliamentarians:async()=>data,loadPartyPage:async()=>({isIndependent:()=>false}),samePartyLabel:(a,b)=>a===b,directoryHash:()=>'/subject/person',fmtDate:s=>s});
 await f.renderPartyMembers('Fern',dom.window.document.body,'fixture');
 assert.match(dom.window.document.querySelector('.subject-tag').textContent,/2 marked current in the directory/);
 assert.doesNotMatch(dom.window.document.querySelector('.subject-tag').textContent,/federal/);
});
