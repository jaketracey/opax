import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageSearchRecords } from '../../scripts/search_catalog_pages.mjs';
import { CATALOG_KINDS } from '../src/catalog-search.ts';
const read = async p => JSON.parse(await readFile(new URL('../public/'+p,import.meta.url),'utf8'));
const config = async p => JSON.parse(await readFile(new URL('../../scripts/hubs/'+p,import.meta.url),'utf8'));
const collect = async (reader=read,options) => { const rows=[];for await(const row of pageSearchRecords(reader,config,options))rows.push(row);return rows; };
const rows = await collect();
test('every new published collection has searchable metadata with recognised kinds', () => {
 for(const kind of ['topic','electorate','instrument','bill','division','sitting','estimates','video','register','page']) {
  assert.ok(rows.some(r=>r.kind===kind),kind);
  assert.ok(CATALOG_KINDS.has(kind),kind);
 }
 const ids=rows.map(r=>r.key);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(rows.every(r=>r.title && r.href.startsWith('/')));
});
test('instrument and division metadata reconcile to their exported page indexes', async () => {
 const instruments=await read('instruments/manifest.json');
 assert.equal(rows.filter(r=>r.kind==='instrument').length,instruments.exported);
 assert.equal(rows.filter(r=>r.kind==='division').length,(await read('divisions/index.json')).count);
 assert.ok(rows.filter(r=>r.kind==='division').every(r=>r.href.startsWith('/doc/division-')));
 assert.ok(rows.filter(r=>r.kind==='instrument').every(r=>r.snippet.includes('Metadata only')));
});
test('topics, electorate names and committee names lead to real collection addresses', () => {
 assert.ok(rows.some(r=>r.kind==='topic' && r.title==='Housing' && r.href==='/subject/topic/housing'));
 assert.ok(rows.some(r=>r.kind==='electorate' && r.title==='Kooyong' && r.href.startsWith('/subject/electorate/')));
 assert.ok(rows.some(r=>r.kind==='estimates' && r.title.includes('Community Affairs') && r.href.endsWith('#group-B')));
 assert.ok(rows.some(r=>r.kind==='page' && r.href==='/register/act-invoices'));
 assert.ok(rows.some(r=>r.kind==='page' && r.href==='/register/tax-expenditures'));
});
test('GFS observations and SA grant awards remain confined to their register tables', () => {
 assert.ok(!rows.some(r=>r.key.startsWith('gfs:') || r.key.startsWith('sa-grant:')));
 for(const href of ['/register/government-finance','/register/sa-grants']) {
  const matches=rows.filter(r=>r.href.split(/[?#]/)[0]===href);
  assert.equal(matches.length,1);
  assert.equal(matches[0].kind,'page');
  assert.equal(matches[0].href,href);
  assert.equal(matches[0].extra.source,'OPAX published pages');
  assert.equal(matches[0].extra.record_id,undefined);
  assert.equal(matches[0].extra.url,undefined);
 }
});

test('tax and advertising matches preserve accepted table filter parameter names', () => {
 const tax=rows.find(r=>r.key.startsWith('tax:'));
 const url=new URL(tax.href,'https://opax.com.au');
 assert.ok(url.searchParams.has('tax.q'));
 assert.ok(url.searchParams.has('tax.f.measure_year'));
 const advertising=rows.find(r=>r.key.startsWith('advertising:'));
 assert.ok(new URL(advertising.href,'https://opax.com.au').searchParams.has('advertising.q'));
 assert.ok(rows.filter(r=>r.key.startsWith('sa-budget:')).every(r=>r.href==='/budget#sa-budget'));
});
test('advertising search preserves source amounts in dollars, reporting year and GST basis', async () => {
 const hub=await read('gov-advertising/data.json');
 const matches=rows.filter(r=>r.key.startsWith('advertising:'));
 assert.ok(matches.length>0);
 for(const record of matches){
  const source=hub.rows.find(r=>'advertising:'+r.id===record.key);
  if(source.total_cents!==null){
   const amount=(source.total_cents/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
   assert.ok(record.snippet.startsWith(amount+' AUD.'),record.key);
  }else{
   assert.match(record.snippet,/^Amount not separately published/);
   assert.doesNotMatch(record.snippet,/\$0\.00/);
  }
  assert.ok(record.snippet.includes(source.financial_year));
  assert.equal(record.extra.dateLabel,source.financial_year);
  assert.equal(record.extra.url,source.source_url);
  assert.equal(record.extra.state,'vic');
  assert.doesNotMatch(record.snippet,/\$\s*\(excluding GST\)/);
 }
 const safeScript=matches.find(r=>r.title==='SafeScript — Department of Health and Human Services' && r.extra.dateLabel==='2018-19');
 assert.match(safeScript.snippet,/^\$802,200\.00 AUD\. 2018-19\. \(excluding GST\)/);
 // The amount and its basis must survive find_records' 200-character summary limit.
 assert.match(safeScript.snippet.slice(0,200),/\$802,200\.00.*2018-19.*excluding GST/);
 const million=matches.find(r=>r.key==='advertising:vic-3a3b7b7702e19482:t1:r2:c2');
 assert.match(million.snippet,/^\$76,300,000\.00 AUD/);
});
test('budget and tax register search preserves amounts with the published units and signs',async()=>{
 const sa=await read('sa-budget/data.json');
 const source=sa.rows[0],record=rows.find(r=>r.key==='sa-budget:0');
 assert.match(record.snippet,/^-1,071 AUD million\./);
 assert.equal(record.extra.dateLabel,source.fiscal_year);
 assert.equal(record.extra.url,source.source_url);
 assert.ok(rows.find(r=>r.key==='tax:A1:2021-22').snippet.startsWith('3 AUD million.'));
 const federal=rows.find(r=>r.key==='budget:0');
 assert.ok(federal.snippet.startsWith('15.8 AUD billion.'));
});
test('gift register mapping preserves supplied values and leaves absent values absent',async()=>{
 const hub=await read('vic-gifts/data.json');
 const item=hub.registers[0].rows[0];
 const original=rows.find(r=>r.key==='gift:'+item.id);
 assert.equal(item.estimated_value,null);
 assert.ok(!original.snippet.includes('Estimated value'));
 assert.equal(original.extra.dateLabel,item.period);
 item.estimated_value='$2,500 (approximate)';
 const changed=await collect(async path=>path==='vic-gifts/data.json'?hub:read(path));
 assert.match(changed.find(r=>r.key===original.key).snippet,/Estimated value as published: \$2,500 \(approximate\)/);
});
test('incomplete instruments and closed optional pages remain absent from search', async () => {
 const hidden=await collect(async path=>path==='instruments/manifest.json'?{complete:false}:read(path),{reports:false,vicElection:false});
 assert.ok(!hidden.some(r=>r.kind==='instrument' || r.href==='/instruments'));
 assert.ok(!hidden.some(r=>r.href.startsWith('/reports') || r.href.startsWith('/vic-election-2026')));
});
test('financial register rows fail closed when their source document clearance is removed', async () => {
 const held=await collect(async path=>{
  const value=await read(path);
  if(['tax-expenditures/data.json','gov-advertising/data.json','budget/data.json','sa-budget/data.json'].includes(path))value.documents=[];
  if(path==='vic-gifts/data.json')value.registers=[];
  return value;
 });
 assert.equal(held.filter(r=>r.kind==='register').length,0);
 assert.ok(!held.some(r=>r.key.startsWith('sa-grant:')));
});
test('an SA budget line the source prints twice is one search result; both rows stay in the data (search-hubs-015)', async () => {
 const sa = await read('sa-budget/data.json');
 const records = rows.filter(r => r.key.startsWith('sa-budget:'));
 const seen = records.map(r => r.title + '\u0000' + r.snippet);
 assert.equal(new Set(seen).size, seen.length);
 assert.ok(records.length < sa.rows.length, 'the published table keeps the repeated source cells');
});
