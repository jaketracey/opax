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
 assert.ok(html.includes('not yet searchable'));
 assert.ok(html.includes('One record can connect to several entries'));
});

test('withheld supplier evidence retains procurement without political-money excerpts', async () => {
  const {tableIdentityIndex} = await import('../../scripts/load_tables.mjs');
  const policy = await tableIdentityIndex();
  const withheld = [...policy.phrases].find(value=>value.includes(' '));
  assert.ok(withheld, 'a derived identity is required');
  const id = 'a'.repeat(24), prior = globalThis.fetch;
  const entry = {id, kind:'organisation', records:2, years:{2025:2}, excerpts:[
    {source_kind:'Procurement', source_table:'government_contracts', text:'Maintenance award', matched_text:'Fixture organisation', source_id:'CN1'},
    {source_kind:'Political donations', source_table:'political_donations', text:withheld},
  ]};
  globalThis.fetch = async url => ({ok:true, status:200, json:async()=>url.includes('/lookup/') ? {'fixture organisation':[id]} : {entries:{[id]:entry}}});
  try {
    const root = {hidden:true, innerHTML:''};
    assert.equal(await mountEvidence(root, {name:'Fixture organisation'}, {allowPolitical:false, publicationCheck:text=>!policy.check(text)}), true);
    assert.ok(root.innerHTML.includes('Maintenance award'));
    assert.ok(root.innerHTML.includes('1 procurement excerpt'));
    assert.ok(!policy.check(root.innerHTML), 'the rendered projection is safe');
    assert.ok(!root.innerHTML.includes('Political donations'));
  } finally {globalThis.fetch = prior;}
});
