// Programs & places before a pick: the detail column is a starting card (the
// house animal, "Pick a connection", one line, the top of the current list as
// quick picks). A quick pick opens its connection as its list row does, focus
// lands on the opened connection's heading, and the card is gone once a
// connection is shown. Fixture names are invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const shell=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const panel=shell.match(/<section id="panel-connections"[\s\S]*?<\/section>\s*<!-- =+ REPORTS/)[0].replace(/<!-- =+ REPORTS$/,'');

const ENTITIES=[
 {id:'aa0000000000000000000001',name:'Example Harbour Program',kind:'program',records:420},
 {id:'bb0000000000000000000002',name:'Sample Freight Co',kind:'organisation',records:310},
 {id:'aa0000000000000000000003',name:'Fictional Ridge',kind:'electorate',records:205},
 {id:'cc0000000000000000000004',name:'Placeholder Valley',kind:'place',records:12},
];
const record=entity=>({id:entity.id,records:entity.records,kind:entity.kind,years:{2024:3,2025:5},excerpts:[]});

async function mount({drawn=[]}={}){
 const dom=new JSDOM(`<!doctype html><html><body><main>${panel}</main></body></html>`,{url:'https://opax.test/connections'});
 const saved={document:globalThis.document,fetch:globalThis.fetch,matchMedia:globalThis.matchMedia};
 globalThis.document=dom.window.document;
 globalThis.matchMedia=()=>({matches:false});
 const requests=[];
 globalThis.fetch=async url=>{
  requests.push(url);
  if(url==='/evidence/index.json')return {ok:true,json:async()=>({entities:ENTITIES.map(e=>({...e}))})};
  const shard=url.match(/^\/evidence\/([a-f0-9]{2})\.json$/)?.[1];
  const entries=Object.fromEntries(ENTITIES.filter(e=>e.id.startsWith(shard)).map(e=>[e.id,record(e)]));
  return {ok:true,json:async()=>({entries})};
 };
 const doc=dom.window.document;
 doc.getElementById('panel-connections').hidden=false;
 const {mountConnections}=await import('../public/connections.js');
 const page=mountConnections(doc.getElementById('connections-body'),{params:new URLSearchParams(),drawAnimal:slot=>drawn.push(slot)});
 const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
 await settle();
 return {dom,doc,page,requests,settle,restore(){page.destroy();Object.assign(globalThis,saved);dom.window.close();}};
}

test('with nothing selected the detail column is the starting card, its picks the top of the list',async()=>{
 const drawn=[];
 const {doc,restore}=await mount({drawn});
 try{
  const detail=doc.getElementById('connection-detail');
  assert.equal(detail.hidden,false);
  const card=detail.querySelector(':scope > .ui-card.connection-detail-empty');
  assert.ok(card,'a ui-card fills the column');
  const heading=card.querySelector('h2');
  assert.equal(heading.textContent,'Pick a connection');
  assert.equal(doc.querySelector('#connections-title').tagName,'H1','the card heading sits one level under the page title');
  assert.equal(card.querySelector('.ui-card-text').textContent,'See the speeches, releases and grant records that name it.');
  assert.equal(drawn.length,1,'the page draws the animal into the card');
  assert.ok(card.contains(drawn[0]));
  const picks=[...card.querySelectorAll('.connection-picks > button.ui-chip')];
  assert.deepEqual(picks.map(b=>b.textContent),['Example Harbour Program','Sample Freight Co','Fictional Ridge']);
  for(const pick of picks)assert.equal(pick.type,'button');
  const group=card.querySelector('.connection-picks');
  assert.equal(group.getAttribute('role'),'group');
  assert.ok(group.getAttribute('aria-label'));
  assert.equal(card.querySelectorAll('[aria-live],[role="status"],[role="alert"]').length,0,'the list count is the page\'s one live line');
 }finally{restore();}
});

test('the quick picks follow the filtered list',async()=>{
 const {dom,doc,restore}=await mount();
 try{
  const kind=doc.getElementById('connection-kind');
  kind.value='place';kind.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual([...doc.querySelectorAll('.connection-picks > button')].map(b=>b.textContent),['Placeholder Valley']);
  const query=doc.getElementById('connection-search');
  kind.value='';kind.dispatchEvent(new dom.window.Event('change'));
  query.value='nothing matches this';query.dispatchEvent(new dom.window.Event('input'));
  assert.equal(doc.querySelectorAll('.connection-picks > button').length,0);
 }finally{restore();}
});

test('a quick pick opens its connection as the list row does, and focus lands on its heading',async()=>{
 const {doc,settle,requests,restore}=await mount();
 try{
  const pick=[...doc.querySelectorAll('.connection-picks > button')].find(b=>b.textContent==='Sample Freight Co');
  pick.focus();pick.click();
  await settle();
  assert.ok(requests.includes('/evidence/bb.json'),'the picked connection\'s records load');
  const detail=doc.getElementById('connection-detail');
  assert.equal(detail.querySelector('.connection-detail-empty'),null,'the card is gone once a connection is shown');
  const heading=detail.querySelector(':scope > h2');
  assert.equal(heading.textContent,'Sample Freight Co');
  assert.equal(doc.activeElement,heading,'focus moves to the opened connection\'s heading');
  const current=doc.querySelector('.connection-choice[aria-current="true"]');
  assert.equal(current?.dataset.entity,'bb0000000000000000000002','the list marks the same row as a click on it');

  // A row in the list opens the same way.
  const row=doc.querySelector('.connection-choice[data-entity="aa0000000000000000000003"]');
  row.focus();row.click();
  await settle();
  assert.equal(detail.querySelector(':scope > h2').textContent,'Fictional Ridge');
  assert.equal(doc.activeElement,detail.querySelector(':scope > h2'));
 }finally{restore();}
});
