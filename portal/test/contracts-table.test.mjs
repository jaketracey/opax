import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractsFixture} from './contracts-table-fixture.mjs';
import {contractTitle, placeholderContract, ausTenderURL, contractsTableConfig, supplierContractsHTML, compileContractGuard, publicContractQuery} from '../public/contracts-table.js';
import {MONEY_GRAPHS, withheldPhrases} from '../public/donor-entity.js';
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
