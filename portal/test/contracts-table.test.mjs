import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractsFixture} from './contracts-table-fixture.mjs';
import {contractTitle, contractRows, placeholderContract, ausTenderURL, contractsTableConfig, supplierContractsHTML, compileContractGuard, publicContractQuery} from '../public/contracts-table.js';
import {MONEY_GRAPHS, withheldPhrases} from '../public/donor-entity.js';
import {renderSupplierAnswer} from '../src/seo-content.ts';
import {tablePrivacyGuard} from '../src/table-privacy.ts';
import {applyQuery,toCSV} from '../public/datatable.js';
import {offline, loadWorker} from './worker-harness.mjs';

const pub = new URL('../public/', import.meta.url).pathname;
const index = JSON.parse(readFileSync(pub + 'suppliers.json'));

test('escaped JSON facets cannot preserve a withheld donor in URL state', () => {
  const graphs=MONEY_GRAPHS.map(path=>JSON.parse(readFileSync(pub+path)));
  const guard=compileContractGuard(withheldPhrases(graphs,[]));
  const value=graphs.flatMap(g=>g.nodes).find(n=>n.kind==='donor' && /\s/.test(n.label) && guard(n.label)).label;
  const escaped=JSON.stringify([value]).replace(/[a-z]/gi,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  const params=new URLSearchParams({'t.f.agency':escaped});
  assert.deepEqual(publicContractQuery(params,guard),{});
});

test('readable procurement titles retain descriptions and avoid agency references', () => {
  assert.equal(contractTitle({title:'460001', description:'Building maintenance', agency:'Example agency'}),'Building maintenance');
  assert.equal(contractTitle({title:'460001', agency:'Example agency'}),'Contract with Example agency');
  assert.equal(contractTitle({title:'Building maintenance'}),'Building maintenance');
  assert.equal(placeholderContract({start_date:'1900-01-01',amount:0}),true);
  assert.equal(placeholderContract({start_date:'1900-01-01',amount:10}),false);
  assert.equal(placeholderContract({start_date:'2026-01-01',amount:0}),false);
});

test('the hub uses the table endpoint and suppliers switch modes at the row limit', () => {
  assert.equal(contractsTableConfig({rows:[]}).source.endpoint,'/api/table/contracts');
  const rows = Array.from({length:2000},(_,i)=>({id:`CN${i+1}`}));
  assert.equal(contractsTableConfig({supplierId:'s-fixture',rows,count:2000}).rows,rows);
  const config=contractsTableConfig({supplierId:'s-fixture',rows,count:2001});
  assert.equal(config.rows,undefined);
  assert.deepEqual(config.source,{endpoint:'/api/table/contracts',params:{supplier:'s-fixture'}});
  assert.equal(config.columnsVisible.includes('id'),false);
  assert.equal(config.actions[0].href({id:'CN1',url:'javascript:alert(1)'}),ausTenderURL({id:'CN1'}));
  assert.equal(ausTenderURL({id:'CN1',url:'https://foreign.invalid/'}),ausTenderURL({id:'CN1'}));
  assert.equal(ausTenderURL({id:'invalid'}),null);
});

test('the fixture searches hidden CN ids, combines facets with ranges, pages, and exports the full filtered view', async () => {
  const fixture=contractsFixture(pub);
  const supplier=index.suppliers.find(s=>s.count>=50 && s.count<=2000);
  const base=new URL('https://fixture.invalid/api/table/contracts');base.searchParams.set('supplier',supplier.id);
  const first=await (await fixture(base)).json();
  assert.ok(first.total>first.rows.length);
  base.searchParams.set('q',first.rows[0].id);
  const found=await (await fixture(base)).json();assert.ok(found.rows.some(r=>r.id===first.rows[0].id));
  base.searchParams.delete('q');base.searchParams.set('f.agency',JSON.stringify([first.rows[0].agency]));
  base.searchParams.set('f.amount',JSON.stringify({min:first.rows[0].amount}));
  const filtered=await (await fixture(base)).json();
  assert.ok(filtered.total>0);assert.ok(filtered.rows.every(r=>r.agency===first.rows[0].agency && r.amount>=first.rows[0].amount));
  base.searchParams.set('format','csv');
  const csv=await (await fixture(base)).text();assert.ok(csv.includes(first.rows[0].id));assert.ok(csv.includes(String(first.rows[0].amount)));
  base.searchParams.delete('format');base.searchParams.delete('f.agency');base.searchParams.delete('f.amount');base.searchParams.set('page','2');
  const second=await (await fixture(base)).json();assert.equal(second.page,2);assert.notEqual(second.rows[0].id,first.rows[0].id);
});

test('supplier SSR preserves facts, renders a real first page, and ignores table state in its canonical', async () => {
  const restore=offline();
  try {
    const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,pub);
    const supplier=index.suppliers.find(s=>s.count>=50 && s.count<=2000);
    const path=`/subject/supplier/${supplier.id}`;
    const response=await worker.fetch(path+'?t.sort=amount:asc&t.page=2');
    assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'noindex');
    const html=await response.text();
    assert.ok(html.includes(`href="https://opax.com.au${path}"`));
    assert.match(html,/<table\b/);assert.match(html,/<caption>Contracts<\/caption>/);
    assert.match(html,/Award values are not expenditure/);assert.match(html,/amendments are not added together/);
    assert.doesNotMatch(html,/Loading contracts|Opening the contract/);
    const payload=JSON.parse(html.match(/<script type="application\/json" data-contracts-seed>(.*?)<\/script>/s)[1]);
    assert.equal(payload.supplierId,supplier.id);assert.ok(payload.rows.length<=2000);
    const guarded=supplierContractsHTML([{id:'CN1',title:'</script><script>bad()</script>',amount:10,start_date:'2026-01-01'}],supplier.id,new URLSearchParams(),()=>false);
    assert.doesNotMatch(guarded,/<script>bad\(\)/);
  } finally {restore();}
});


test('the shared privacy guard retains a deduplicated neutral value and no identifying fields', async () => {
  const guard=await tablePrivacyGuard({fetch:async request=>Response.json(JSON.parse(readFileSync(pub+new URL(request.url).pathname)))});
  const graphs=MONEY_GRAPHS.map(path=>JSON.parse(readFileSync(pub+path)));
  const node=graphs.flatMap(graph=>graph.nodes).find(node=>node.kind==='donor' && guard(node.label) && guard.subjects(node.label).length===1);
  assert.ok(node,'a runtime-derived withheld identity is required');
  const rows=contractRows([25,75].map((amount,i)=>({id:`CN${i+1}`,title:node.label,agency:'Example agency',amount,start_date:'2026-01-01'})),guard);
  assert.equal(rows.length,1);assert.equal(rows[0].aggregate.count,1);assert.equal(rows[0].amount,100);
  assert.deepEqual(Object.keys(rows[0]).sort(),['aggregate','amount']);
  const config=contractsTableConfig({supplierId:'s-fixture',rows,count:2,privacyCheck:text=>!guard(text)});
  const page=applyQuery(rows,config,{});
  assert.equal(page.rows[0].title,'Donors not named (1)');
  assert.ok(!guard(JSON.stringify(page)));assert.ok(!guard(toCSV(rows,config)));
  assert.equal(config.actions[0].href(page.rows[0]),null);
});


test('supplier SSR related-award totals use the shared guard and retain anonymous values', async () => {
  const guard=await tablePrivacyGuard({fetch:async request=>Response.json(JSON.parse(readFileSync(pub+new URL(request.url).pathname)))});
  const graphs=MONEY_GRAPHS.map(path=>JSON.parse(readFileSync(pub+path)));
  const node=graphs.flatMap(graph=>graph.nodes).find(node=>node.kind==='donor' && guard(node.label) && guard.subjects(node.label).length===1);
  const assets={
    '/suppliers.json':{meta:{generated_at:'2026-10-01',source:'Fixture register'},suppliers:[{id:'s-fixture',profile_path:'/supplier-fixture.json'}]},
    '/supplier-fixture.json':{profiles:{'s-fixture':{id:'s-fixture',name:'Fixture supplier Pty Ltd',total:10,count:1,agencies:[{name:'Fixture agency',count:1,total:10}],contracts:[]}}},
    '/agencies.json':{agencies:[{id:'a-fixture',name:'Fixture agency',profile_path:'/agency-fixture.json'}]},
    '/agency-fixture.json':{suppliers:[{id:'s-other',name:node.label,total:100}]},
  };
  const result=await renderSupplierAnswer('s-fixture',async path=>assets[path],new URLSearchParams(),guard);
  assert.ok(!guard(result.html),'related awards must not name an indexed donor');
  assert.match(result.html,/Donors not named \(1\) — \$100/);
  assert.ok(!result.html.includes('/subject/supplier/s-other'));
});
