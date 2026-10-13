import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountDataTable,toCSV} from '../public/datatable.js';
import {moneyConnectionsConfig} from '../public/money-connections.js';
import {mountMapResearch} from '../public/map-research.js';

const donor={id:'donor:fixture',kind:'donor',label:'Canonical fixture',source_name:'EXAMPLE, ALEX',group:'individuals',
  returnReferences:[{return_type:'AEC annual return',year:'2024-25',return_id:'RETURN-7'}],match:{confidence:0.7,method:'rule',href:'/subject/person/incorrect'}};
const data={nodes:[donor,{id:'party:fixture',kind:'party',label:'Fixture party'}],
  edges:[{source:donor.id,target:'party:fixture',total:120,count:1,firstYear:2024,lastYear:2024}]};
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
test('money table interactions search source names, filter, export and retain uncertain return evidence',async()=>{
 const dom=new JSDOM('<main id="table"></main>',{url:'https://local.invalid/money'});
 let requests=0;dom.window.fetch=async()=>{requests++;throw Error('unexpected request');};
 const host=dom.window.document.querySelector('#table'),config=moneyConnectionsConfig(data),handle=mountDataTable(host,config);
 try{
  await settle();assert.ok(host.textContent.includes(donor.source_name));assert.ok(host.textContent.includes('RETURN-7'));
  assert.equal(host.querySelector('a[href="/subject/person/incorrect"]'),null);
  const input=host.querySelector('[data-search]');input.value='EXAMPLE';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,220));await settle();
  assert.ok(host.textContent.includes('Showing 1–1 of 1'));assert.equal(new URL(dom.window.location.href).searchParams.get('c.q'),'EXAMPLE');
  const clear=host.querySelector('[data-clear]');clear.click();await settle();assert.equal(new URL(dom.window.location.href).searchParams.has('c.q'),false);
  assert.ok(toCSV(config.rows,config).includes('RETURN-7'));assert.equal(requests,0);
 }finally{handle.destroy();dom.window.close();}
});
test('actual map research uses the shared table and source-name filters without a privacy POST',async()=>{
 const dom=new JSDOM('<div id="research"></div>',{url:'https://local.invalid/money'});
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const names=['document','location','history','FormData','fetch'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 let requests=0,changed;
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='fetch'?async()=>{requests++;throw Error('unexpected request');}:dom.window[name]});
 const host=dom.window.document.querySelector('#research');let handle;
 try{
  handle=await mountMapResearch(host,data,{onChange:filters=>{changed=filters;handle?.update(data,filters);}});
  host.querySelector('[data-records]').click();await settle();assert.ok(host.textContent.includes(donor.source_name));assert.ok(host.textContent.includes('RETURN-7'));
  const input=host.querySelector('[name="query"]');input.value=donor.source_name;
  host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(changed.query,donor.source_name);assert.equal(new URL(dom.window.location.href).searchParams.get('q'),donor.source_name);assert.equal(requests,0);
  assert.equal(host.querySelector('a[href="/subject/person/incorrect"]'),null);
 }finally{
  handle?.destroy();for(const name of names){const descriptor=saved.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  dom.window.close();
 }
});
