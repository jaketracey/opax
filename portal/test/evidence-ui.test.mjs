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
