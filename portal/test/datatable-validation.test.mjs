import test from 'node:test';
import assert from 'node:assert/strict';
import {mountDataTable,dataTableHTML} from '../public/datatable.js';
import {createTablePrivacyValidator} from '../public/datatable-privacy.js';
import {tableHarness} from './datatable-harness.mjs';

test('actual core bounds fallback validation, retries failures and keeps unrelated rows', async () => {
  const h=tableHarness(),attempts=new Map();
  let active=0,peak=0,overloads=0;
  h.win.fetch=async (_input,options) => {
    const value=JSON.parse(options.body).text,n=(attempts.get(value)||0)+1;
    attempts.set(value,n);active++;peak=Math.max(peak,active);
    try {
      if(active>8){overloads++;throw new Error('Overloaded fixture');}
      await new Promise(resolve=>setTimeout(resolve,1));
      if(value==='4' || value==='3' && n===1)return Response.json({}, {status:503});
      return Response.json({safe:!value.includes('\n') && !value.includes('restricted fixture')});
    } finally {active--;}
  };
  const rows=Array.from({length:12},(_,i)=>({to:`Fixture organisation ${i} Pty Ltd`,amount:i+1,donorEndpoints:[]}));
  rows.push({to:'Fixture organisation Pty Ltd',category:'restricted fixture',amount:99,donorEndpoints:[]});
  const config={id:'validation',caption:'Connections',pageType:'money',privacy:'donors',rows,pageSize:50,columns:[{key:'to',label:'To',type:'text',primary:true},{key:'amount',label:'Amount',type:'money',facet:'range'}]};
  const mounted=mountDataTable(h.root,config);
  try {
    for(let turn=0;turn<300 && !h.html().includes('Showing 1–11 of 11');turn++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(h.html().includes('Showing 1–11 of 11'),'one failed value and the private row are dropped; other rows survive');
    assert.equal(peak,8);assert.equal(overloads,0);
    assert.equal(attempts.get('3'),2,'transient failure retried');
    assert.equal(attempts.get('4'),2,'persistent failure retried once');
    assert.ok(!h.html().includes('restricted fixture'));
    assert.ok(!h.html().includes('data-export disabled'));
  } finally {mounted.destroy();}
});

test('a timeout aborts, retries once and rejects only its value',async () => {
  let attempts=0,aborts=0;
  const validator=createTablePrivacyValidator({timeout:15,fetch:(_input,{signal})=>{
    attempts++;signal.addEventListener('abort',()=>aborts++);
    return new Promise(()=>{});
  }});
  assert.equal(await validator.permit('timeout fixture'),false);
  assert.equal(attempts,2);assert.equal(aborts,2);
  const shared=createTablePrivacyValidator({privacyCheck:async value=>!value.includes('restricted fixture')});
  await shared.permitSet(['public fixture','restricted fixture']);
  assert.equal(shared.approved('public fixture'),true);
  assert.equal(shared.approved('restricted fixture'),false);
});

test('a delegated raw URL rejection disables SSR and hydration export until cleared',async()=>{
  const h=tableHarness(),config={id:'guarded',caption:'Connections',pageType:'money',privacy:'donors',privacyCheck:()=>true,initialRejected:true,rows:[{to:'Fixture organisation Pty Ltd',donorEndpoints:[]}],columns:[{key:'to',label:'To',type:'text',primary:true}]};
  const ssr=dataTableHTML(config,{rows:config.rows,total:1,page:1,pageSize:50,facets:{}});
  assert.ok(ssr.includes('Showing 0–0 of 0') && ssr.includes('data-export disabled'));
  const mounted=mountDataTable(h.root,config);
  await new Promise(setImmediate);
  assert.ok(h.html().includes('Showing 0–0 of 0'));
  assert.ok(h.html().includes('data-export disabled'));
  mounted.destroy();
});
