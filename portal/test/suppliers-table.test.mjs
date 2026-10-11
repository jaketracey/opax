import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tableApi} from '../src/table-api.ts';
import {suppliersTableConfig, mountSuppliersTable} from '../public/suppliers-table.js';
import {isOrganisationRecipient} from '../public/recipient-entity.js';
import {tableIdentityIndex} from '../../scripts/load_tables.mjs';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {tableHarness} from './datatable-harness.mjs';
import {loadWorker,offline} from './worker-harness.mjs';

const pub=new URL('../public/',import.meta.url).pathname;
const directory=JSON.parse(readFileSync(pub+'suppliers.json'));
const policy=await tableIdentityIndex(pub);
const publicRow=row=>isOrganisationRecipient(row) && !policy.check(JSON.stringify(row));
const nodes=JSON.parse(readFileSync(pub+'graph/money.json')).nodes;
// Both cases come from the snapshot; identifying values never enter fixtures.
const donor=nodes.find(node=>node.kind==='donor' && !policy.check(node.id)
  && directory.suppliers.filter(row=>row.money_node_ids?.includes(node.id)).length===1
  && directory.suppliers.some(row=>row.money_node_ids?.includes(node.id) && publicRow(row)));
const linked=directory.suppliers.filter(row=>row.money_node_ids?.includes(donor?.id));
const other=directory.suppliers.find(row=>publicRow(row) && !row.money_node_ids?.includes(donor?.id));
const withheld=sourceTableDonorIdentities().entities.find(node=>node.id && policy.check(node.id));
assert.ok(donor && linked.length===1 && other && withheld,'derived scope and privacy coverage');
const local=await tableDatabase({datasets:{suppliers:[...linked,other].map(row=>({row:{...row,recipient_kind:'organisation',jurisdiction:'federal'}}))}});
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
  assert.ok(!policy.recipientCheck(text));
  const nextPage=await (await request(donor.id,{page:'2',pageSize:'1'})).json();
  assert.equal(nextPage.total,1);assert.deepEqual(nextPage.rows,[]);
  assert.equal((await (await request(donor.id,{'f.id':JSON.stringify([other.id])})).json()).total,0,'filters intersect the fixed scope');
  assert.equal((await (await request('donor:missing-fixture')).json()).total,0,'unknown scopes stay empty');
  assert.notEqual((await request(donor.id)).headers.get('etag'),(await tableApi(new Request('https://local.invalid/api/table/suppliers'),env)).headers.get('etag'));
});

test('withheld funding-profile scope rejects before asset or data reads and exports no records',async()=>{
  let reads=0;
  const db={prepare(sql){if(/FROM\s+table_(?!meta\b|private_identity\b)/i.test(sql))reads++;return local.db.prepare(sql);},batch:local.db.batch.bind(local.db)};
  const guardedEnv={TABLE_DB:db,ASSETS:{fetch(){reads++;throw Error('Scope must be guarded first');}}};
  for(const csv of [false,true]) {
    const params=new URLSearchParams({donor:withheld.id,...(csv?{format:'csv'}:{})});
    const response=await tableApi(new Request('https://local.invalid/api/table/suppliers?'+params),guardedEnv);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('link'),null);
    assert.ok(!policy.check(JSON.stringify([...response.headers])));
    if(csv) {assert.equal(response.headers.get('x-table-exported'),'0');assert.equal((await response.text()).split('\r\n').length,2);}
    else {const page=await response.json();assert.equal(page.total,0);assert.deepEqual(page.rows,[]);assert.deepEqual(page.facets,{});}
  }
  assert.equal(reads,0);
});

test('funding-profile scope reaches the SSR seed and a withheld arrival remains rejected',async()=>{
  const restore=offline();
  try {
    const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,pub);
    worker.env.TABLE_DB=local.db;
    for(const [id,rejected] of [[donor.id,false],[withheld.id,true]]) {
      const response=await worker.fetch('/subject/supplier?'+new URLSearchParams({donor:id}));
      assert.equal(response.status,200);
      const html=await response.text();
      const seed=JSON.parse(html.match(/<script type="application\/json" data-suppliers-seed>(.*?)<\/script>/s)[1]);
      assert.equal(seed.stateRejected,rejected);
      assert.equal(seed.page.total,rejected?0:1);
      assert.deepEqual(seed.page.rows.map(row=>row.id),rejected?[]:linked.map(row=>row.id));
      assert.ok(!policy.recipientCheck(JSON.stringify(seed)));
      if(rejected) {assert.ok(!policy.check(html));assert.match(html,/data-dt-rejected/);}
    }
  } finally {restore();}
});

test('hydration carries the fixed donor scope and keeps an SSR rejection latched',async()=>{
  const saved={fetch:globalThis.fetch,location:globalThis.location,history:globalThis.history};
  try {
    for(const [id,rejected] of [[donor.id,false],[withheld.id,true]]) {
      const harness=tableHarness('http://localhost/subject/supplier?'+new URLSearchParams({donor:id}));
      const requests=[];
      const fetch=async(input,init)=>{
        const url=new URL(typeof input==='string'?input:input.url,'http://localhost');
        if(url.pathname==='/api/table/privacy') {
          const {text,surface}=JSON.parse(init.body);
          return Response.json({safe:surface==='data'?!policy.recipientCheck(text):!policy.check(text)});
        }
        requests.push(url);
        return tableApi(new Request(url),env);
      };
      harness.win.fetch=fetch;globalThis.fetch=fetch;
      globalThis.location={pathname:'/subject/supplier',search:new URL(harness.win.location.href).search,hash:''};
      globalThis.history={state:null,replaceState(_state,_title,path){harness.win.location.href=new URL(path,'http://localhost').href;}};
      const page=rejected?{rows:[],total:0,page:1,pageSize:50,facets:{}}:await (await request(donor.id)).json();
      const node={textContent:JSON.stringify({page,stateRejected:rejected}),closest:()=>({remove(){}})};
      harness.root.ownerDocument.querySelector=()=>node;
      const el={ownerDocument:harness.root.ownerDocument,querySelector:()=>harness.root,innerHTML:''};
      const handle=await mountSuppliersTable(el,{params:new URLSearchParams({donor:id})});
      const count=rejected?'Showing 0–0 of 0':'Showing 1–1 of 1';
      for(let i=0;i<300 && (!harness.html().includes(count) || harness.root.hasAttribute('aria-busy'));i++)await new Promise(done=>setTimeout(done,10));
      assert.ok(harness.html().includes(rejected?'Showing 0–0 of 0':'Showing 1–1 of 1'));
      if(rejected) {assert.equal(requests.length,0);assert.ok(!new URL(harness.win.location.href).searchParams.has('donor'));assert.ok(!policy.check(harness.win.location.href));}
      else {assert.ok(requests.length>0);assert.ok(requests.every(url=>url.searchParams.get('donor')===donor.id));}
      handle.destroy();
    }
    assert.equal(suppliersTableConfig({donor:donor.id}).source.params.donor,donor.id);
  } finally {for(const [key,value] of Object.entries(saved))globalThis[key]=value;}
});

test('supplier CSV continuation retains the funding-profile scope',async()=>{
  const scopedIds=Array.from({length:10001},(_,i)=>'s-'+(i+1).toString(16).padStart(20,'0'));
  await local.db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO table_suppliers (id,name,recipient_kind,total,count,search) SELECT 's-'||printf('%020x',x),'Fixture supplier Pty Ltd','organisation',x,1,'Fixture supplier' FROM n").run();
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
