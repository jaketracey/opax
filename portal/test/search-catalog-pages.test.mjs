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
test('tax and advertising matches preserve accepted table filter parameter names', () => {
 const tax=rows.find(r=>r.key.startsWith('tax:'));
 const url=new URL(tax.href,'https://opax.com.au');
 assert.ok(url.searchParams.has('tax.q'));
 assert.ok(url.searchParams.has('tax.f.measure_year'));
 const advertising=rows.find(r=>r.key.startsWith('advertising:'));
 assert.ok(new URL(advertising.href,'https://opax.com.au').searchParams.has('advertising.q'));
 assert.ok(rows.filter(r=>r.key.startsWith('sa-budget:')).every(r=>r.href==='/budget#sa-budget'));
});
test('incomplete instruments and closed optional pages remain absent from search', async () => {
 const hidden=await collect(async path=>path==='instruments/manifest.json'?{complete:false}:read(path),{reports:false,vicElection:false});
 assert.ok(!hidden.some(r=>r.kind==='instrument' || r.href==='/instruments'));
 assert.ok(!hidden.some(r=>r.href.startsWith('/reports') || r.href.startsWith('/vic-election-2026')));
});
test('financial register rows fail closed when their source document clearance is removed', async () => {
 const held=await collect(async path=>{
  const value=await read(path);
  if(['tax-expenditures/data.json','government-finance/data.json','gov-advertising/data.json','budget/data.json','sa-budget/data.json','sa-grants/data.json'].includes(path))value.documents=[];
  if(path==='vic-gifts/data.json')value.registers=[];
  return value;
 });
 assert.equal(held.filter(r=>r.kind==='register').length,0);
 assert.ok(!held.some(r=>r.key.startsWith('sa-grant:')));
});
