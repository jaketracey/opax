import test from 'node:test';
import assert from 'node:assert/strict';
import {mountDataTable,dataTableHTML,applyQuery} from '../public/datatable.js';
import {tableHarness} from './datatable-harness.mjs';

test('client tables show source names without validation requests',async()=>{
 const h=tableHarness();let calls=0;h.win.fetch=async()=>{calls++;throw Error('unexpected request');};
 const rows=[{name:'EXAMPLE, ALEX',value:42.5},{name:'Fixture Organisation Pty Ltd',value:70}];
 const config={id:'names',caption:'Disclosures',pageType:'money',rows,columns:[{key:'name',label:'Name',type:'text',primary:true},{key:'value',label:'Value',type:'money'}]};
 const mounted=mountDataTable(h.root,config);
 await new Promise(setImmediate);
 assert.ok(h.html().includes('EXAMPLE, ALEX'));assert.ok(h.html().includes('Showing 1–2 of 2'));assert.equal(calls,0);mounted.destroy();
});
test('input length and type validation survive removal of matcher callbacks',()=>{
 const config={id:'input',caption:'Names',pageType:'money',columns:[{key:'name',label:'Name',type:'text'}]};
 const rows=[{name:'EXAMPLE, ALEX'}];
 for(const q of ['x'.repeat(1001),42,{}])assert.equal(applyQuery(rows,config,{q}).total,0);
 assert.equal(applyQuery(rows,config,{q:'EXAMPLE'}).total,1);
});
test('a delegated invalid URL disables SSR and hydration export until cleared',async()=>{
 const h=tableHarness(),config={id:'guarded',caption:'Connections',pageType:'money',initialRejected:true,rows:[{to:'Fixture organisation Pty Ltd'}],columns:[{key:'to',label:'To',type:'text',primary:true}]};
 const ssr=dataTableHTML(config,{rows:config.rows,total:1,page:1,pageSize:50,facets:{}});
 assert.ok(ssr.includes('Showing 0–0 of 0') && ssr.includes('data-export disabled'));
 const mounted=mountDataTable(h.root,config);await new Promise(setImmediate);
 assert.ok(h.html().includes('Showing 0–0 of 0'));assert.ok(h.html().includes('data-export disabled'));mounted.destroy();
});
