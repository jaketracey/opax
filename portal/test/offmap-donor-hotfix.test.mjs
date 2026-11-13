import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {workerFetch} from './helpers/worker-fetch.mjs';
import * as receipts from '../public/donor-disclosure.js';
import {donorRecordsHTML} from '../src/subject-figures.ts';

const read = name => JSON.parse(readFileSync(new URL('../public/graph/'+name,import.meta.url),'utf8'));
const retained=read('donor-disclosures.json'),index=read('donor-index.json'),drawing=read('money.json');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const fn=name=>{const start=app.indexOf(`function ${name}(`);assert.ok(start>=0,name);return app.slice(start,app.indexOf('\n}',start)+2);};
const fmtMoney=runInNewContext(fn('fmtMoney')+';fmtMoney'),yearSpan=runInNewContext(fn('yearSpan')+';yearSpan');
const pins=[
  {label:'Linc Energy',total:357799,count:9,types:{donation_received:294999,other_receipt:62800},
   line:'Donation Received: $294,999 (5 receipts); Other Receipt: $62,800 (4 receipts)'},
  {label:'Nimrod Resources Limited',total:500000,count:1,types:{donation_received:500000},
   line:'Donation Received: $500,000 (1 receipt)'},
];
const browser=runInNewContext(fn('donorRecordHTML')+';donorRecordHTML',{
  ...receipts,fmtMoney,yearSpan,esc:String,safeUrl:v=>v,
  tile:(value,label)=>`<p>${value} ${label}</p>`,sourceLineHTML:()=>'',
  AEC_NOTE:'',AEC_LICENCE:'',MONEY_JURISDICTIONS:{},
});
test('retained donor h2 headings distinguish receipt totals from source records',()=>{
  const source={kind:'donor',jurisdiction:'federal',total:100,count:1};
  const typed={...source,by_type:{donation_received:100},by_type_year:{'2024-25':{donation_received:[100,1]}}};
  for(const [record,title] of [[source,'Source records'],[typed,'Disclosed receipts']]){
    const dom=new JSDOM(browser(record,{}));
    assert.equal(dom.window.document.querySelector('#donor-record > h2.subject-section-title').textContent,title);
    assert.doesNotMatch(dom.window.document.body.textContent,/disclosed gifts/i);
    dom.window.close();
  }
});
test('retained exports count Linc and Nimrod recipient receipts once after they leave the drawing cap',()=>{
  for(const pin of pins){
    assert.equal(drawing.nodes.some(n=>n.label===pin.label),false);
    for(const data of [retained,index]){
      const record=data.donors.find(n=>n.label===pin.label&&n.jurisdiction==='federal');
      assert.deepEqual([record.total,record.count,record.by_type],[pin.total,pin.count,pin.types]);
      assert.equal(receipts.receiptTypeLine(record),pin.line);
    }
  }
});
test('server and browser retained blocks use typed cells and name their types despite poisoned legacy totals',()=>{
  for(const pin of pins){
    const record={...retained.donors.find(n=>n.label===pin.label),total:999999999,count:9999};
    for(const html of [browser(record,{}),donorRecordsHTML([record])]){
      const dom=new JSDOM(html),text=dom.window.document.body.textContent;
      assert.ok(text.includes(fmtMoney(pin.total)),text);
      assert.match(text,new RegExp(`${pin.count} receipt`));assert.ok(text.includes(pin.line));
      assert.doesNotMatch(text,/999,999,999|9,999|disclosed gifts|both donor and party/i);
      dom.window.close();
    }
  }
});
test('actual off-map Worker pages use the corrected figures without an uncapped graph asset',async()=>{
  for(const pin of pins){
    const response=await workerFetch('/subject/donor/'+encodeURIComponent(pin.label));
    assert.equal(response.status,200);
    const dom=new JSDOM(await response.text()),text=dom.window.document.querySelector('#prerender').textContent;
    assert.ok(text.includes(fmtMoney(pin.total)),text);assert.ok(text.includes(pin.line),text);
    assert.match(text,new RegExp(`${pin.count} receipt`));
    assert.doesNotMatch(text,/671,498|1,000,000|18 records|2 records/);dom.window.close();
  }
});
test('type labels keep loans and Other Receipts separate from donations and exclude public funding',()=>{
  const record={by_type:{donation_received:100,other_receipt:200,loan:300,public_funding:400},
    by_type_year:{'2024-25':{donation_received:[100,1],other_receipt:[200,1],loan:[300,1],public_funding:[400,1]}}};
  assert.equal(receipts.receiptFigures(record).total,600);
  assert.equal(receipts.receiptTypeLine(record),'Donation Received: $100 (1 receipt); Other Receipt: $200 (1 receipt); Loan: $300 (1 receipt)');
});
