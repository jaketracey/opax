import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {workerFetch} from './helpers/worker-fetch.mjs';
import * as receipts from '../public/donor-disclosure.js';
import {donorRecordsHTML} from '../src/subject-figures.ts';
import {mountLedger} from '../public/ledger.js';

const read = name => JSON.parse(readFileSync(new URL('../public/graph/'+name,import.meta.url),'utf8'));
const full = read('money-receipts.json'), drawing = read('money.json');
const retained = read('donor-disclosures.json'), index = read('donor-index.json');
const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const fn = name => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0,name);
  return app.slice(start,app.indexOf('\n}',start)+2);
};
const fmtMoney = runInNewContext(fn('fmtMoney')+';fmtMoney');
const yearSpan = runInNewContext(fn('yearSpan')+';yearSpan');
const pins = [
  {label:'Linc Energy',total:357799,count:9,types:{donation_received:294999,other_receipt:62800},
    line:'Donation Received: $294,999 (5 receipts); Other Receipt: $62,800 (4 receipts)'},
  {label:'Nimrod Resources Limited',total:500000,count:1,types:{donation_received:500000},
    line:'Donation Received: $500,000 (1 receipt)'},
];
const browser = runInNewContext(fn('donorRecordHTML')+';donorRecordHTML',{
  ...receipts,fmtMoney,yearSpan,esc:String,safeUrl:v=>v,
  tile:(value,label)=>`<p>${value} ${label}</p>`,sourceLineHTML:()=>'',
  AEC_NOTE:'',AEC_LICENCE:'',MONEY_JURISDICTIONS:{},
});

test('receipt labels distinguish a typed loan and Other Receipt from donations and exclude Public Funding', () => {
  const record = {by_type:{donation_received:100,other_receipt:200,loan:300,public_funding:400},
    by_type_year:{'2024-25':{donation_received:[100,1],other_receipt:[200,1],loan:[300,1],public_funding:[400,1]}}};
  assert.equal(receipts.receiptFigures(record).total,600);
  assert.equal(receipts.receiptTypeLine(record),'Donation Received: $100 (1 receipt); Other Receipt: $200 (1 receipt); Loan: $300 (1 receipt)');
});

test('Linc and Nimrod retain the uncapped party-side figure in both public donor exports', () => {
  for (const pin of pins) {
    assert.equal(drawing.nodes.some(n=>n.label===pin.label),false,pin.label+' is past the cap');
    const selected = full.nodes.find(n=>n.label===pin.label);
    for (const file of [retained,index]) {
      const record = file.donors.find(n=>n.label===pin.label && n.jurisdiction==='federal');
      assert.deepEqual([record.total,record.count,record.by_type],[pin.total,pin.count,pin.types]);
      assert.deepEqual(record.by_type_year,selected.by_type_year);
      assert.equal(receipts.receiptTypeLine(record),pin.line);
    }
  }
});

test('off-map server and browser blocks use typed cells and name their types, even with poisoned legacy totals', () => {
  for (const pin of pins) {
    const record = {...retained.donors.find(n=>n.label===pin.label),total:999999999,count:9999};
    for (const html of [browser(record,{}),donorRecordsHTML([record])]) {
      const dom = new JSDOM(html), text = dom.window.document.body.textContent;
      assert.ok(text.includes(fmtMoney(pin.total)),pin.label);
      assert.match(text,new RegExp(`${pin.count} receipt${pin.count===1?'':'s'}`));
      assert.ok(text.includes(pin.line),pin.label);
      assert.doesNotMatch(text,/999,999,999|9,999|source records|disclosed gifts/i);
      dom.window.close();
    }
  }
});

test('live donor pages for Linc and Nimrod show the selected figure and receipt types without network calls', async () => {
  for (const pin of pins) {
    const response = await workerFetch('/subject/donor/'+encodeURIComponent(pin.label));
    assert.equal(response.status,200);
    const dom = new JSDOM(await response.text());
    const text = dom.window.document.querySelector('#prerender').textContent;
    assert.ok(text.includes(fmtMoney(pin.total)),text);
    assert.ok(text.includes(pin.line),text);
    assert.match(text,new RegExp(`${pin.count} receipts`));
    assert.doesNotMatch(text,/671,498|1,000,000|18 records|2 records/);
    dom.window.close();
  }
});

test('the donor directory reads uncapped federal receipts and never switches past-cap donors to raw records', async () => {
  const directory = runInNewContext('async '+fn('buildDonorsDirectory')+';buildDonorsDirectory',{
    ...receipts,donorViewReady:Promise.resolve(),donorViewIndex:new Map(),
    loadMoneyData:async()=>full,loadMoneyFile:async jur=>{
      assert.notEqual(jur,'federal','factual directory must not read capped map data');
      return {meta:{},nodes:[],edges:[]};
    },loadAccess:async()=>null,loadFits:async()=>null,
    normName:runInNewContext(fn('normName')+';normName'),
    fmtMoney,yearSpan,esc:String,industryLabel:String,donorGroupColour:()=>'',
    donorNameHTML:String,anyPartyDotHTML:()=>'',entityHrefAttr:()=>'',subjectHash:()=>'',
    moneyFor:()=>0,byNumDesc:()=>()=>0,byName:()=>0,AEC_NOTE:'',STATE_NOT_SUMMED:'',
  });
  const data = await directory();
  for (const pin of pins) {
    const row = data.items.find(d=>d.label===pin.label);
    assert.deepEqual([row.money.federal.total,row.money.federal.count],[pin.total,pin.count]);
    const html = data.row(row);
    assert.ok(html.includes(fmtMoney(pin.total)));
    assert.doesNotMatch(html,/AEC records/);
  }
});

test('a past-cap donor’s funding-record link and CSV use uncapped receipts', async () => {
  const dom = new JSDOM('<div id="ledger"></div>');
  const saved = {document:globalThis.document,fetch:globalThis.fetch,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
  let handle, download;
  try {
    globalThis.document = dom.window.document;
    globalThis.fetch = async path => {
      assert.equal(path,'/graph/money-receipts.json');
      return Response.json(full);
    };
    URL.createObjectURL = blob => {download=blob;return 'blob:offline-test';};
    URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    const linc = full.nodes.find(n=>n.label==='Linc Energy');
    handle = mountLedger(dom.window.document.querySelector('#ledger'),{params:new URLSearchParams({focus:linc.id})});
    // Settle the real asynchronous loader, without any production request.
    for(let i=0;i<100 && !dom.window.document.querySelector('#lg-export:not(:disabled)');i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    const exportButton = dom.window.document.querySelector('#lg-export');
    assert.equal(exportButton.disabled,false,dom.window.document.body.textContent);
    assert.match(dom.window.document.querySelector('tbody').textContent,/Linc Energy/);
    exportButton.click();
    const csv = await download.text();
    assert.match(csv,/uncapped selected party receipts/);
    assert.match(csv,/money-receipts\.json/);
    assert.match(csv,/208000/);
    assert.match(csv,/124999/);
    assert.match(csv,/24800/);
    assert.doesNotMatch(csv,/671498|top 250/);
  } finally {
    handle?.destroy();
    globalThis.document=saved.document;globalThis.fetch=saved.fetch;
    URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;
    dom.window.close();
  }
});
