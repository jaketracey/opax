import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceHTML,nameKey,mountEvidence} from '../public/evidence.js';

test('names normalize punctuation and spacing consistently',()=>{
  assert.equal(nameKey('  ACME & Sons, Pty Ltd '),'acme sons pty ltd');
});
test('source excerpts are escaped and unsafe links never rendered',()=>{
 const html=evidenceHTML({records:1,kind:'organisation',years:{2025:1},excerpts:[{
  text:'<script>bad()</script>',matched_text:'ACME',source_kind:'Official release',
  source_url:'javascript:alert(1)',source_id:'123',start:0,end:4
 }]});
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes('href="javascript:'));
 assert.ok(html.includes('Text positions 0–4'));
});
test('ambiguous identities do not show a panel',async()=>{
 const prior=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({'acme holdings':['a','b']})});
 try {
  const root={hidden:true,innerHTML:''};
  assert.equal(await mountEvidence(root,{name:'Acme Holdings'}),false);
  assert.equal(root.innerHTML,'');
 }finally{globalThis.fetch=prior;}
});
test('mismatched name and ABN cannot attach another identity evidence',async()=>{
 const prior=globalThis.fetch; let requests=0;
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=> ++requests===1 ? {'abn:51824753556':['a'.repeat(24)]} : {'wrong company':['b'.repeat(24)]}});
 try {
  const root={hidden:true,innerHTML:''};
  assert.equal(await mountEvidence(root,{name:'Wrong Company',abn:'51824753556'}),false);
  assert.equal(root.innerHTML,'');
 }finally{globalThis.fetch=prior;}
});

test('incomplete enrichment is never shown as completed corpus coverage',async()=>{
 const {evidenceStatsHTML}=await import('../public/evidence.js');
 assert.equal(evidenceStatsHTML({complete:false,published_record_matches:900}), '');
 const html=evidenceStatsHTML({complete:true,source_records:{speeches:100,ext_press_releases:20,government_grants:30},published_record_matches:200,entities_with_connections:10,identity_decisions:{accepted:3}});
 assert.ok(html.includes('150'));
 assert.ok(html.includes('not searchable yet'));
 assert.ok(html.includes('One record can connect to several entries'));
});

// When the connections data is from: one date, read from the export's own
// metadata (generated_at), said once per block. Fixture names are invented.
const META={generated_at:'2026-09-08T09:21:53.082961+00:00',source_records:{speeches:1310477,ext_press_releases:21234,government_grants:230007}};
const ENTRY={records:2,kind:'organisation',years:{2025:2},excerpts:[{text:'Example Freight Co was named.',matched_text:'Example Freight Co',source_kind:'Official release',source_id:'1',start:0,end:18}]};
const count=(html,needle)=>html.split(needle).length-1;

test('the as-at day is the Sydney calendar day of the export build, or nothing',async()=>{
 const {evidenceAsAt}=await import('../public/evidence-date.js');
 assert.equal(evidenceAsAt(META),'2026-09-08');
 assert.equal(evidenceAsAt({generated_at:'2026-09-08T15:30:00Z'}),'2026-09-09','after 1:30 am in Sydney the day has turned');
 for(const meta of [null,undefined,'2026-09-08',{},{generated_at:'old'},{generated_at:42}])assert.equal(evidenceAsAt(meta),'');
});

test('the dated line is the house source line, with the long date, the counts and the figures file',async()=>{
 const {evidenceDateHTML}=await import('../public/evidence-date.js');
 const html=evidenceDateHTML(META);
 assert.equal(count(html,'class="ui-pop ui-source"'),1);
 assert.ok(html.includes('As at 8 Sep 2026'),html);
 assert.ok(html.includes('Speeches, official releases and grant records'));
 assert.ok(html.includes('Connections from records collected to 8 September 2026.'));
 for(const figure of ['1,310,477','21,234','230,007'])assert.ok(html.includes(figure),figure);
 assert.ok(html.includes('href="/evidence/stats.json"'));
 assert.ok(!html.includes('—'),'no em dashes in page text');
 assert.equal(evidenceDateHTML(META,{plain:true}),'<p class="evidence-as-at">As at 8 Sep 2026 · Speeches, official releases and grant records</p>');
 assert.equal(evidenceDateHTML({generated_at:'old'}),'');
 assert.equal(evidenceDateHTML(null,{plain:true}),'');
});

test('a connection panel says its date once at its foot, and not at all without metadata',()=>{
 const dated=evidenceHTML(ENTRY,{meta:META});
 assert.equal(count(dated,'As at 8 Sep 2026'),1);
 assert.ok(dated.indexOf('As at 8 Sep 2026')>dated.indexOf('They do not establish influence'),'the date follows the fine print');
 assert.equal(count(evidenceHTML(ENTRY,{meta:META,plain:true}),'class="evidence-as-at"'),1);
 for(const html of [evidenceHTML(ENTRY),evidenceHTML(ENTRY,{meta:null})])assert.ok(!html.includes('As at'));
});

async function routed(module,{stats=META}={}){
 const {nameKey:key}=module;
 const id='ab'+'0'.repeat(22),name='Example Freight Co';
 const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const lookupShard=(await digest(key(name))).slice(0,2);
 const requests=[];
 const prior=globalThis.fetch;
 globalThis.fetch=async url=>{
  requests.push(url);
  const reply=body=>({ok:true,status:200,json:async()=>body});
  if(url===`/evidence/lookup/${lookupShard}.json`)return reply({[key(name)]:[id]});
  if(url==='/evidence/stats.json')return stats?reply(stats):{ok:false,status:503,json:async()=>({})};
  if(url==='/evidence/ab.json')return reply({entries:{[id]:{...ENTRY,id}}});
  return {ok:false,status:404,json:async()=>null};
 };
 return {name,requests,restore(){globalThis.fetch=prior;}};
}

test('a mounted panel reads the export date once a page and shows it at its foot',async()=>{
 const module=await import('../public/evidence.js?dated=1');
 const {name,requests,restore}=await routed(module);
 try{
  const first={hidden:true,innerHTML:''},second={hidden:true,innerHTML:''},compact={hidden:true,innerHTML:''};
  assert.equal(await module.mountEvidence(first,{name}),true);
  assert.equal(await module.mountEvidence(second,{name}),true);
  assert.equal(await module.mountEvidence(compact,{name},{compact:true}),true);
  for(const root of [first,second])assert.equal(count(root.innerHTML,'As at 8 Sep 2026'),1);
  assert.equal(count(compact.innerHTML,'<p class="evidence-as-at">As at 8 Sep 2026'),1,'the money map card takes the plain line');
  assert.equal(requests.filter(url=>url==='/evidence/stats.json').length,1,'the panels on a page share one read');
 }finally{restore();}
});

test('a panel still shows, undated, when the export date cannot be read',async()=>{
 const module=await import('../public/evidence.js?undated=1');
 const {name,requests,restore}=await routed(module,{stats:null});
 try{
  const root={hidden:true,innerHTML:''};
  assert.equal(await module.mountEvidence(root,{name}),true);
  assert.equal(root.hidden,false);
  assert.ok(root.innerHTML.includes('Example Freight Co'));
  assert.ok(!root.innerHTML.includes('As at'));
  assert.equal(await module.mountEvidence({hidden:true,innerHTML:''},{name}),true);
  assert.equal(requests.filter(url=>url==='/evidence/stats.json').length,2,'a failed read is tried again');
 }finally{restore();}
});
