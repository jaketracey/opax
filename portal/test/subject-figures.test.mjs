import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {workerFetch} from './helpers/worker-fetch.mjs';
import {donorRecordsHTML} from '../src/subject-figures.ts';
import {loadDonorRecordsIndex,donorRecordsForName} from '../src/donor-index.ts';
import {foldDonorName} from '../public/donor-entity.js';
import {shortMoney} from '../public/format.js';
import {receiptScopeLabel,offMapDonorNote} from '../public/donor-disclosure.js';
import {fy} from '../public/money-scope.js';

const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
// Evaluate the actual browser functions, with network-free rendering helpers.
const functionSource = name => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0,name);
  return app.slice(start,app.indexOf('\n}',start)+2);
};
const fmtMoney = runInNewContext(`${functionSource('fmtMoney')};fmtMoney`);
const yearSpan = runInNewContext(`${functionSource('yearSpan')};yearSpan`);
const columnsStart = app.indexOf('const CAMPAIGNER_COLUMNS =');
const campaignerColumns = runInNewContext(`${app.slice(columnsStart,app.indexOf('\n];',columnsStart)+3)};CAMPAIGNER_COLUMNS`);
const text = html => {
  const dom = new JSDOM(html);
  const value = dom.window.document.body.textContent.replace(/\s+/g,' ').trim();
  dom.window.close();
  return value;
};
const campaigner = {name:'Banksia Civic Example',kind:'third_party',years:[
  ['2020-21',1200050.25,850000,null,120.50,0],
  ['2021-22',null,0,3200,0,null],
  ['2022-23',null,null,null,null,null],
  ['2023-24',0,0,0,0,0],
]};
const donorName = 'Banksia Records Example Pty Ltd';
const record = (jurisdiction,total,count,firstYear,lastYear) => ({
  id:`donor:banksia:${jurisdiction}`,kind:'donor',source_name:donorName,label:donorName,
  jurisdiction,total,count,firstYear,lastYear,industry:'other',aliases:['Banksia Records Example'],
  returnReferences:[{return_type:`${jurisdiction} fixture return`,url:`https://example.test/${jurisdiction}`,year:'2024-25'}],
});
const federal = record('federal',123456.78,7,2020,2024);
const qld = record('qld',4490,1,2023,2023);
const reference = {id:'reference:banksia',kind:'reference',label:'Banksia Reference Example',total:500,
  source_note:'A source reference only',returnReferences:[]};
const mappedName = 'Wattle Records Example Pty Ltd';
const mappedFederal = {...federal,id:'donor:wattle:federal',source_name:mappedName,label:mappedName,aliases:[]};
const mappedState = {...qld,id:'donor:wattle:qld',source_name:mappedName,label:mappedName,aliases:[],group:'other',byYear:{2023:[4490,1]}};
const assets = {
  '/graph/campaigners.json':{meta:{register_url:'https://example.test/register'},entities:[campaigner]},
  '/graph/donor-index.json':{donors:[federal,qld,reference,mappedFederal,{...mappedState,total:undefined,count:undefined}]},
  ...Object.fromEntries(['/graph/money.json','/graph/money.qld.json','/graph/money.vic.json','/graph/money.tas.json'].map(path => [path,{meta:{},nodes:[],edges:[]}])),
  '/graph/money.qld.json':{meta:{sourceShort:'ECQ'},nodes:[mappedState],edges:[]},
};

test('the donor records index is built once across two calls, with no name reads during lookup',async()=>{
  let fetches=0,nameReads=0;
  const first={...federal,label:'Banksia Records Label Example',name:'Banksia Records Name Example',
    get source_name(){nameReads++;return donorName;},
    aliases:[donorName,donorName.toUpperCase(),'Banksia Records Alias Example'],lookup_names:['Banksia Records Lookup Example']};
  const records=[first,qld];
  const plainRecords=records.map(r=>({...r}));
  nameReads=0;
  const source={async fetch(){fetches++;const response=new Response();response.json=async()=>({donors:records});return response;}};
  const a=loadDonorRecordsIndex(source),b=loadDonorRecordsIndex(source);
  assert.equal(a,b,'concurrent calls share the build promise');
  const index=await a;
  assert.equal(await b,index);
  assert.equal(fetches,1);
  assert.equal(nameReads,1,'the record was visited by one index build');
  for(const name of [donorName,'BANKSIA RECORDS EXAMPLE PTY LTD',first.label,first.name,...first.aliases,...first.lookup_names,'Unknown Example']){
    const actual=donorRecordsForName(index,name);
    const expected=plainRecords.filter(r=>[r.source_name,r.label,r.name,...r.aliases || [],...r.lookup_names || []]
      .some(value=>value && foldDonorName(value)===foldDonorName(name)));
    assert.deepEqual(actual.map(r=>r.id),expected.map(r=>r.id),'same records in source order for '+name);
  }
  assert.equal(nameReads,1,'map lookups never reread record names');
  assert.deepEqual(donorRecordsForName(index,donorName).map(r=>r.id),[first.id,qld.id],'aliases do not duplicate records');
  assert.equal(donorRecordsForName(index,donorName)[0],first,'the original record is retained');
});

test('campaigner server HTML contains every annual row with the browser words and amounts',async()=>{
  const response = await workerFetch('/subject/campaigner/'+encodeURIComponent(campaigner.name),{},{},{assets});
  assert.equal(response.status,200);
  const dom = new JSDOM(await response.text());
  const table = dom.window.document.querySelector('#prerender table[data-campaigner-returns]');
  assert.ok(table);
  const rows = [...table.querySelectorAll('tbody tr')];
  assert.equal(rows.length,4);
  // Use the browser's own annual-row expression, including its missing-value rule.
  const start = app.indexOf('const yearRows = (e.years || [])');
  const end = app.indexOf('\n  const register =',start);
  const browserHTML = runInNewContext(`${app.slice(start,end)};yearRows`,{
    e:campaigner,fmtMoney,fy,esc:value=>String(value),
    CAMPAIGNER_COLUMNS:campaignerColumns,
  });
  const browserDOM = new JSDOM(`<ul>${browserHTML}</ul>`);
  const expected = [...browserDOM.window.document.querySelectorAll('li')].map(li=>li.textContent.replace(/\s+/g,' ').trim());
  assert.deepEqual(rows.map(row=>`${row.cells[0].textContent} ${row.cells[1].textContent}`),expected);
  assert.deepEqual(rows.map(row=>row.cells[0].textContent),['2023–24','2022–23','2021–22','2020–21']);
  assert.equal(rows[0].cells[1].textContent,'receipts $0 · payments $0 · debts $0 · electoral expenditure $0 · gifts received $0');
  assert.equal(rows[1].cells[1].textContent,'nothing itemised on the return');
  assert.doesNotMatch(rows[2].cells[1].textContent,/receipts|gifts received/);
  assert.match(table.parentElement.parentElement.textContent,/Debts are balances owed at 30 June, not new borrowing/);
  assert.ok(dom.window.document.querySelector('#prerender a[href="https://example.test/register"]'));
  browserDOM.window.close();dom.window.close();
});

test('off-map server HTML retains each jurisdiction and matches hydrated figures without summing them',async()=>{
  // Compare the numeric renderer on each retained source record with the server;
  // the N04 scope tests also pin collision lookup order.
  const browser = runInNewContext(`${functionSource('donorRecordHTML')};donorRecordHTML`,{
    fmtMoney,yearSpan,receiptScopeLabel,offMapDonorNote,esc:value=>String(value),safeUrl:value=>value,
    tile:(figure,label)=>`<p>${figure} ${label}</p>`,sourceLineHTML:()=>'',
    MONEY_JURISDICTIONS:{qld:{label:'Queensland'}},AEC_NOTE:'',AEC_LICENCE:'',
  });
  const response = await workerFetch('/subject/donor/'+encodeURIComponent(donorName),{},{},{assets});
  assert.equal(response.status,200);
  const dom = new JSDOM(await response.text());
  const blocks = [...dom.window.document.querySelectorAll('#prerender [data-donor-record]')];
  assert.equal(blocks.length,2);
  for (const [i,r] of [federal,qld].entries()) {
    const hydrated = text(browser(r,{}));
    for (const value of [fmtMoney(r.total),r.count.toLocaleString('en-AU'),yearSpan(r.firstYear,r.lastYear)]) {
      assert.ok(hydrated.includes(value),value);
      assert.ok(blocks[i].textContent.includes(value),value);
    }
    assert.equal(blocks[i].dataset.donorRecord,r.jurisdiction);
    assert.ok(blocks[i].querySelector(`a[href="https://example.test/${r.jurisdiction}"]`));
  }
  assert.ok(blocks[0].textContent.includes(receiptScopeLabel({typed:false})));
  assert.match(blocks[0].textContent,/7 records/);
  assert.match(blocks[1].textContent,/1 receipt/);
  assert.doesNotMatch(blocks[0].textContent,/7 gifts|Disclosed gifts/);
  assert.ok(!dom.window.document.querySelector('#prerender').textContent.includes(shortMoney(federal.total+qld.total)));
  assert.match(dom.window.document.querySelector('#prerender').textContent,/State and federal returns are not summed/);
  dom.window.close();
});

test('references and absent figures never acquire an invented zero total',async()=>{
  const response = await workerFetch('/subject/donor/'+encodeURIComponent(reference.label),{},{},{assets});
  assert.equal(response.status,200);
  const dom = new JSDOM(await response.text());
  assert.equal(dom.window.document.querySelectorAll('[data-donor-record]').length,0);
  assert.match(dom.window.document.querySelector('#prerender').textContent,/no matching electoral donation established/);
  assert.equal(donorRecordsHTML([{label:donorName,kind:'donor'}]),'');
  dom.window.close();
});

test('a state map node keeps its own figure alongside the off-map federal record',async()=>{
  const response = await workerFetch('/subject/donor/'+encodeURIComponent(mappedName),{},{},{assets});
  assert.equal(response.status,200);
  const dom = new JSDOM(await response.text());
  const body = dom.window.document.querySelector('#prerender');
  assert.ok(body.textContent.includes(fmtMoney(mappedState.total)));
  const blocks = body.querySelectorAll('[data-donor-record]');
  assert.equal(blocks.length,1);
  assert.equal(blocks[0].dataset.donorRecord,'federal');
  assert.ok(blocks[0].textContent.includes(fmtMoney(mappedFederal.total)));
  assert.ok(blocks[0].textContent.includes(receiptScopeLabel({typed:false})));
  dom.window.close();
});

test('figures escape source spellings and reject unsafe original links',()=>{
  const html = donorRecordsHTML([{...federal,label:'<img src=x>',source_name:'<img src=x>',returnReferences:[{url:'javascript:alert(1)'}]}]);
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.doesNotMatch(html,/<img|javascript:/);
});
