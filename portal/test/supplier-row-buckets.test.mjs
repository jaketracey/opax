import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSupplierAnswer} from '../src/seo-content.ts';
import {SUPPLIER_ID_RE,supplierRowsPath} from '../public/supplier-row-buckets.js';

const id='s-0123456789abcdef0123', other='s-ab0000000000000000cd';
const index={meta:{generated_at:'2026-11-08T16:38:07Z',source:'AusTender',caveats:['x']},suppliers:[id,other].map(s=>({id:s,name:'Supplier '+s,profile_path:'/suppliers/'+s.slice(2,4)+'.json'}))};
const profile=s=>({id:s,name:'Supplier '+s,total:1000,count:2,agencies:[{name:'Agency A',total:1000,count:2}],contracts:[{id:'CN1',title:'Work',amount:600,agency:'Agency A',start_date:'2025-01-01',published:'2025-01-02',url:'https://example.invalid/CN1'},{id:'CN2',title:'More work',amount:400,agency:'Agency A'}]});
const fixed={'/suppliers.json':index,'/agencies.json':{agencies:[{id:'a-1',name:'Agency A',profile_path:'/agencies/a-1.json'}]},'/agencies/a-1.json':{suppliers:[{id:other,name:'Supplier '+other,total:5,count:1}]},'/suppliers/01.json':{profiles:{[id]:profile(id)}},'/suppliers/ab.json':{profiles:{[other]:profile(other)}}};
// The buckets as scripts/build_growth_modules.mjs writes them.
const buckets={};
for(const row of index.suppliers)(buckets[supplierRowsPath(row.id)]??={meta:{generated_at:index.meta.generated_at,source:index.meta.source},suppliers:[]}).suppliers.push(row);

const render=async(files,supplier)=>{
 const reads=[];
 const read=async path=>{reads.push(path);if(files[path])return files[path];throw Error('asset 404 '+path)};
 return {html:(await renderSupplierAnswer(supplier,read))?.html ?? null,reads};
};

test('bucket paths follow the profile shard of the id',()=>{
 assert.ok(SUPPLIER_ID_RE.test(id) && !SUPPLIER_ID_RE.test('S-0123456789ABCDEF0123') && !SUPPLIER_ID_RE.test('acme'));
 assert.equal(supplierRowsPath(id),'/growth/supplier-rows/01.json');
 assert.equal(supplierRowsPath('ab'),'/growth/supplier-rows/ab.json');
});

test('a supplier page reads its bucket, not the whole index, and renders the same page',async()=>{
 for(const supplier of [id,other,'s-ffffffffffffffffffff','acme']){
  const split=await render({...fixed,...buckets},supplier), whole=await render(fixed,supplier);
  assert.equal(split.html,whole.html,supplier);
  if(split.html)assert.ok(!split.reads.includes('/suppliers.json'),supplier);
 }
 assert.match((await render({...fixed,...buckets},id)).html,/Updated 2026-11-08\. Source: AusTender\./);
 // A bucket without the id, or without the index's dates, defers to the whole index.
 const stale=await render({...fixed,[supplierRowsPath(id)]:{meta:buckets[supplierRowsPath(id)].meta,suppliers:[]},[supplierRowsPath(other)]:{suppliers:buckets[supplierRowsPath(other)].suppliers}},id);
 assert.equal(stale.html,(await render(fixed,id)).html);assert.ok(stale.reads.includes('/suppliers.json'));
 const noMeta=await render({...fixed,[supplierRowsPath(other)]:{suppliers:buckets[supplierRowsPath(other)].suppliers}},other);
 assert.equal(noMeta.html,(await render(fixed,other)).html);assert.ok(noMeta.reads.includes('/suppliers.json'));
});
