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

async function mount({index=null,meta,wide=true,entities=ENTITIES}={}){
 const dom=new JSDOM(`<!doctype html><html><body><main>${panel}</main></body></html>`,{url:'https://opax.test/connections'});
 const saved={document:globalThis.document,fetch:globalThis.fetch,matchMedia:globalThis.matchMedia};
 globalThis.document=dom.window.document;
 globalThis.matchMedia=()=>({matches:!wide});
 const requests=[];
 globalThis.fetch=async url=>{
  requests.push(url);
  if(url==='/evidence/index.json'){await index;return {ok:true,json:async()=>({...(meta?{meta}:{}),entities:entities.map(e=>({...e}))})};}
  const shard=url.match(/^\/evidence\/([a-f0-9]{2})\.json$/)?.[1];
  const entries=Object.fromEntries(entities.filter(e=>e.id.startsWith(shard)).map(e=>[e.id,record(e)]));
  return {ok:true,json:async()=>({entries})};
 };
 const doc=dom.window.document;
 doc.getElementById('panel-connections').hidden=false;
 const {mountConnections}=await import('../public/connections.js');
 const page=mountConnections(doc.getElementById('connections-body'),{params:new URLSearchParams()});
 const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
 await settle();
 return {dom,doc,page,requests,settle,restore(){page.destroy();Object.assign(globalThis,saved);dom.window.close();}};
}

test('with nothing selected the detail column is the starting card, its picks the top of the list',async()=>{
 const {doc,restore}=await mount();
 try{
  const detail=doc.getElementById('connection-detail');
  assert.equal(detail.hidden,false);
  const card=detail.querySelector(':scope > .ui-card.connection-detail-empty');
  assert.ok(card,'a ui-card fills the column');
  const heading=card.querySelector('h2');
  assert.equal(heading.textContent,'Pick a connection');
  assert.equal(doc.querySelector('#connections-title').tagName,'H1','the card heading sits one level under the page title');
  assert.equal(card.querySelector('.ui-card-text').textContent,'See the speeches, releases and grant records that name it.');
  assert.ok(card.querySelector(':scope > .connection-detail-art'),'the card keeps a place for the animal');
  const picks=[...card.querySelectorAll('.connection-picks > button.ui-chip')];
  assert.deepEqual(picks.map(b=>b.textContent),['Example Harbour Program','Sample Freight Co','Fictional Ridge']);
  for(const pick of picks)assert.equal(pick.type,'button');
  const group=card.querySelector('.connection-picks');
  assert.equal(group.getAttribute('role'),'group');
  assert.ok(group.getAttribute('aria-label'));
  assert.equal(card.querySelectorAll('[aria-live],[role="status"],[role="alert"]').length,0,'the list count is the page\'s one live line');
 }finally{restore();}
});

test('while the index loads the card stands without picks, the list holds the loader, and no count shows',async()=>{
 let answer;const index=new Promise(resolve=>{answer=resolve;});
 const {doc,settle,restore}=await mount({index});
 try{
  assert.ok(doc.querySelector('#connection-detail > .connection-detail-empty'),'the starting card is up from the start');
  assert.equal(doc.querySelectorAll('.connection-picks > *').length,0,'no picks from a list that has not loaded');
  assert.ok(doc.querySelector('#connection-list > .connection-loader'),'the list column holds the loading animal');
  assert.equal(doc.getElementById('connection-status').textContent,'Opening the records…');
  answer();await settle();
  assert.equal(doc.querySelector('#connection-list > .connection-loader'),null);
  assert.deepEqual([...doc.querySelectorAll('.connection-picks > button')].map(b=>b.textContent),['Example Harbour Program','Sample Freight Co','Fictional Ridge'],'picks come from the loaded list');
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

test('the page says once, under its title, the day the connections run to, and an opened connection does not repeat it',async()=>{
 const meta={generated_at:'2026-09-08T09:21:53+00:00',source_records:{speeches:100,ext_press_releases:20,government_grants:30}};
 const {doc,page,settle,restore}=await mount({meta});
 try{
  const head=doc.querySelector('.connections-head');
  const lines=doc.querySelectorAll('.ui-source');
  assert.equal(lines.length,1,'one dated line on the page');
  assert.equal(lines[0].parentElement,head,'it sits in the page head');
  assert.equal(head.lastElementChild,lines[0],'at the foot of the head');
  assert.ok(lines[0].textContent.includes('As at 8 Sep 2026'),lines[0].textContent);
  assert.ok(lines[0].textContent.includes('Connections from records collected to 8 September 2026.'));
  doc.querySelector('.connection-choice[data-entity="bb0000000000000000000002"]').click();
  await settle();
  assert.equal(doc.querySelectorAll('.ui-source').length,1,'the opened connection adds no second date');
  assert.ok(!doc.getElementById('connection-detail').textContent.includes('As at'));
  page.destroy();
  assert.equal(head.querySelector('.ui-source'),null,'leaving the page takes the line with it');
 }finally{restore();}
});

test('without a dated index the page shows no date line',async()=>{
 const {doc,restore}=await mount();
 try{
  assert.ok(doc.querySelector('.connection-choice'),'the list still loads');
  assert.equal(doc.querySelectorAll('.ui-source').length,0);
 }finally{restore();}
});

// A phone: the list in the page's flow, twenty rows at a time, the starting card
// above it, and a connection opening as the next view with a way back.
const MANY=Array.from({length:45},(_,i)=>({id:`dd${String(i).padStart(22,'0')}`,name:i===1?'EXAMPLE WORK PROGRAM FOR NSW':`Example Place ${i}`,kind:i%2?'program':'place',records:1000-i}));

test('a phone lists twenty connections, then twenty more on request, and names filed in capitals read in title case',async()=>{
 const {doc,settle,restore}=await mount({wide:false,entities:MANY});
 try{
  const rows=()=>doc.querySelectorAll('#connection-list .connection-choice');
  assert.equal(rows().length,20);
  assert.match(doc.getElementById('connection-status').textContent,/^45 connections · Showing the first 20\./);
  const more=doc.querySelector('.connection-more');
  assert.equal(more.hidden,false);assert.equal(more.textContent,'Show 20 more');
  assert.equal(more.previousElementSibling.id,'connection-list','the button follows the list');
  more.click();await settle();
  assert.equal(rows().length,40);
  assert.equal(doc.activeElement,rows()[20],'focus moves to the first row added');
  assert.equal(more.textContent,'Show 5 more');
  more.click();await settle();
  assert.equal(rows().length,45);assert.equal(more.hidden,true);
  assert.equal(rows()[1].querySelector('.ui-row-name').textContent,'Example Work Program for NSW');
 }finally{restore();}
});

test('a phone opens a connection as the next view, and its back control returns to the same row',async()=>{
 const {doc,settle,restore}=await mount({wide:false});
 try{
  const root=doc.getElementById('connections-body');
  const row=doc.querySelector('.connection-choice[data-entity="aa0000000000000000000003"]');
  row.click();await settle();
  assert.ok(root.classList.contains('connections-reading'),'the list steps aside');
  const detail=doc.getElementById('connection-detail');
  const back=detail.querySelector(':scope > button.connection-back');
  assert.equal(back.textContent,'All connections');
  assert.equal(back.nextElementSibling.tagName,'H2');
  back.click();await settle();
  assert.equal(root.classList.contains('connections-reading'),false);
  assert.ok(detail.querySelector('.connection-detail-empty'),'the invitation returns');
  assert.equal(doc.activeElement.dataset.entity,'aa0000000000000000000003','focus returns to the row it came from');
 }finally{restore();}
});

test('a wide screen keeps the first forty and no paging control; the phone list never scrolls inside the page',async()=>{
 const {doc,restore}=await mount({entities:MANY});
 try{
  assert.equal(doc.querySelectorAll('#connection-list .connection-choice').length,40);
  assert.match(doc.getElementById('connection-status').textContent,/Showing the first 40\. Search to narrow the list\./);
  assert.equal(doc.querySelector('.connection-more').hidden,true);
 }finally{restore();}
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/#connection-list\s*\{[^}]*(?:max-height|overflow)/,'no inner scroller');
 assert.match(css,/#connection-detail:has\(> \.connection-detail-empty\) \{ position: static; order: -1; \}/,'the invitation sits above the list on a phone');
});

// Names filed in capitals, from the real evidence index (public records), in both directions:
// acronyms, codes and numerals keep their capitals; ordinary words, short ones included, do not.
test('names filed in capitals read in title case without breaking acronyms or short words', async () => {
 const {displayName}=await import('../public/connections.js');
 const cases=[
  ['FREE TAFE & FREE APPRENTICESHIPS','Free TAFE & Free Apprenticeships'],
  ['NAIDOC 2023','NAIDOC 2023'],
  ['RFDS - RRMBS','RFDS - RRMBS'],
  ['AURUKUN CCTV CONTRIBUTION','Aurukun CCTV Contribution'],
  ['AP2.0 FIFA WC 2023 INF','AP2.0 FIFA WC 2023 Inf'],
  ['RILIPO - ILUA','Rilipo - ILUA'],
  ['ANZPAA NIFS CONTRIBUTIONS','ANZPAA NIFS Contributions'],
  ['NEW MAPOON','New Mapoon'],
  ['ST GEORGE','St George'],
  ['MT COOLUM','Mt Coolum'],
  ['EMU PARK','Emu Park'],
  ['OLD TALGAI','Old Talgai'],
  ['FIG TREE POCKET','Fig Tree Pocket'],
  ['SOMERSET DAM','Somerset Dam'],
  ['MOUNT ISA DC','Mount Isa DC'],
  ['CLOSE THE GAP VET','Close the Gap VET'],
  ['EQUIPPING TAFE FOR OUR FUTURE','Equipping TAFE for Our Future'],
  ['NATIONAL PARTNERSHIP JOB TRAINER FUND','National Partnership Job Trainer Fund'],
  ['EYE HEALTH','Eye Health'],
  ['BACK TO WORK','Back to Work'],
  ['STAGE VIII WORKS','Stage VIII Works'],
  ['XIII COMMONWEALTH GAMES','XIII Commonwealth Games'],
  ['COVID-19 SUPPORT','COVID-19 Support'],
  ['SBP-BUS BOOST GRANTS','SBP-Bus Boost Grants'],
  ['BAUHINIA, QLD','Bauhinia, QLD'],
  ['VITAMIN D PROGRAM','Vitamin D Program'],
  ["O'CONNOR PARK","O'Connor Park"],
  ['MIX FM RADIO','Mix FM Radio'],
  // Mixed case is the record's own spelling and passes through.
  ['RILIPO Infrastructure - Torres Strait Island','RILIPO Infrastructure - Torres Strait Island'],
  ['Department of Finance','Department of Finance'],
  ['TAFE','TAFE'],
 ];
 for(const [from,to] of cases)assert.equal(displayName(from),to,from);
});
