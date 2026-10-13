import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tableApi} from '../src/table-api.ts';
import {suppliersTableConfig, mountSuppliersTable} from '../public/suppliers-table.js';
import {tableDatabase} from './table-d1-harness.mjs';
import {tableHarness} from './datatable-harness.mjs';
import {loadWorker,offline} from './worker-harness.mjs';

const pub=new URL('../public/',import.meta.url).pathname;
const directory=JSON.parse(readFileSync(pub+'suppliers.json'));
const nodes=JSON.parse(readFileSync(pub+'graph/money.json')).nodes;
// Scope identities are derived from the snapshot; fixtures store IDs only.
const donor=nodes.find(node=>node.kind==='donor' && directory.suppliers.filter(row=>row.money_node_ids?.includes(node.id)).length===1);
const linked=directory.suppliers.filter(row=>row.money_node_ids?.includes(donor?.id));
const other=directory.suppliers.find(row=> !row.money_node_ids?.includes(donor?.id));
assert.ok(donor && linked.length===1 && other,'derived scope coverage');
const local=await tableDatabase({datasets:{suppliers:[...linked,other].map(row=>({row:{...row,jurisdiction:'federal'}}))}});
test.after(()=>local.close());
const assets={fetch:async()=>Response.json(directory)};
const env={TABLE_DB:local.db,ASSETS:assets};
const request=(id,extra={})=>tableApi(new Request('https://local.invalid/api/table/suppliers?'+new URLSearchParams({donor:id,...extra})),env);

test('funding-profile supplier scope covers D1 rows, facets, sorting and CSV',async()=>{
  const response=await request(donor.id,{sort:'total:asc',pageSize:'1'});
  assert.equal(response.status,200);
  const page=await response.json();
  assert.equal(page.total,1);
  assert.deepEqual(page.rows.map(row=>row.id),linked.map(row=>row.id));
  assert.deepEqual(page.facets.total,{min:linked[0].total,max:linked[0].total});
  assert.equal(page.facets.jurisdiction.reduce((sum,row)=>sum+row.count,0),1);
  const csv=await request(donor.id,{format:'csv'});
  assert.equal(csv.headers.get('x-table-total'),'1');
  assert.equal(csv.headers.get('x-table-exported'),'1');
  const text=await csv.text();
  assert.ok(text.includes(linked[0].id));
  assert.ok(!text.includes(other.id));
  const nextPage=await (await request(donor.id,{page:'2',pageSize:'1'})).json();
  assert.equal(nextPage.total,1);assert.deepEqual(nextPage.rows,[]);
  assert.equal((await (await request(donor.id,{'f.id':JSON.stringify([other.id])})).json()).total,0,'filters intersect the fixed scope');
  assert.equal((await (await request('donor:missing-fixture')).json()).total,0,'unknown scopes stay empty');
  assert.notEqual((await request(donor.id)).headers.get('etag'),(await tableApi(new Request('https://local.invalid/api/table/suppliers'),env)).headers.get('etag'));
});

test('funding-profile scope reaches the SSR seed',async()=>{
  const restore=offline();
  try {
    const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,pub);
    worker.env.TABLE_DB=local.db;
    for(const id of [donor.id]) {
      const response=await worker.fetch('/subject/supplier?'+new URLSearchParams({donor:id}));
      assert.equal(response.status,200);
      const html=await response.text();
      const seed=JSON.parse(html.match(/<script type="application\/json" data-suppliers-seed>(.*?)<\/script>/s)[1]);
      assert.equal(seed.page.total,1);
      assert.deepEqual(seed.page.rows.map(row=>row.id),linked.map(row=>row.id));
    }
  } finally {restore();}
});

test('hydration carries the fixed donor scope',async()=>{
  const saved={fetch:globalThis.fetch,location:globalThis.location,history:globalThis.history};
  try {
    for(const id of [donor.id]) {
      const harness=tableHarness('http://localhost/subject/supplier?'+new URLSearchParams({donor:id}));
      const requests=[];
      const fetch=async(input,init)=>{
        const url=new URL(typeof input==='string'?input:input.url,'http://localhost');
        requests.push(url);
        return tableApi(new Request(url),env);
      };
      harness.win.fetch=fetch;globalThis.fetch=fetch;
      globalThis.location={pathname:'/subject/supplier',search:new URL(harness.win.location.href).search,hash:''};
      globalThis.history={state:null,replaceState(_state,_title,path){harness.win.location.href=new URL(path,'http://localhost').href;}};
      const page=await (await request(donor.id)).json();
      const node={textContent:JSON.stringify({page}),closest:()=>({remove(){}})};
      harness.root.ownerDocument.querySelector=()=>node;
      const el={ownerDocument:harness.root.ownerDocument,querySelector:()=>harness.root,innerHTML:''};
      const handle=await mountSuppliersTable(el,{params:new URLSearchParams({donor:id})});
      const count='Showing 1–1 of 1';
      for(let i=0;i<300 && (!harness.html().includes(count) || harness.root.hasAttribute('aria-busy'));i++)await new Promise(done=>setTimeout(done,10));
      assert.ok(harness.html().includes('Showing 1–1 of 1'));
      {assert.ok(requests.length>0);assert.ok(requests.every(url=>url.searchParams.get('donor')===donor.id));}
      handle.destroy();
    }
    assert.equal(suppliersTableConfig({donor:donor.id}).source.params.donor,donor.id);
  } finally {for(const [key,value] of Object.entries(saved))globalThis[key]=value;}
});

test('supplier CSV continuation retains the funding-profile scope',async()=>{
  const scopedIds=Array.from({length:10001},(_,i)=>'s-'+(i+1).toString(16).padStart(20,'0'));
  await local.db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO table_suppliers (id,name,total,count,search) SELECT 's-'||printf('%020x',x),'Fixture supplier Pty Ltd',x,1,'Fixture supplier' FROM n").run();
  const scopedEnv={TABLE_DB:local.db,ASSETS:{fetch:async()=>Response.json({suppliers:scopedIds.map(id=>({id,money_node_ids:[donor.id]}))})}};
  const first=await tableApi(new Request('https://local.invalid/api/table/suppliers?'+new URLSearchParams({donor:donor.id,format:'csv',sort:'total:asc'})),scopedEnv);
  assert.equal(first.headers.get('x-table-total'),'10001');
  assert.equal(first.headers.get('x-table-exported'),'10000');
  const next=/<([^>]+)>; rel="next"/.exec(first.headers.get('link'))[1];
  assert.equal(new URL(next,'https://local.invalid').searchParams.get('donor'),donor.id);
  const firstCSV=await first.text();
  assert.ok(!firstCSV.includes(other.id));
  const last=await tableApi(new Request(new URL(next,'https://local.invalid')),scopedEnv);
  assert.equal(last.headers.get('x-table-total'),'10001');
  assert.equal(last.headers.get('x-table-exported'),'1');
  const lastCSV=await last.text();
  assert.ok(lastCSV.includes(scopedIds.at(-1)));
  assert.ok(!lastCSV.includes(other.id));
});
