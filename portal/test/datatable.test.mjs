import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyQuery,dataTableHTML,formatCell,mountDataTable,parseQuery,serializeQuery,toCSV} from '../public/datatable.js';
import {workbenchConfig,workbenchRows as rows} from '../public/datatable-workbench-data.js';
import {cleanEvent} from '../analytics/privacy.mjs';
import {tableHarness} from './datatable-harness.mjs';
import {guardTableURL} from '../public/datatable.js';

const config={...workbenchConfig};
const all = query => applyQuery(rows,config,{...query,pageSize:100});
test('declared facet options retain empty choices without a donor matcher',()=>{
 const columns=[{key:'title',label:'Title',type:'text'},{key:'responses',label:'Responses',type:'category',facet:'multi',facetOptions:['Yes','No']}];
 const table={id:'facet-options-fixture',caption:'Fixture reports',pageType:'audit',columns};
 const rows=[{title:'Fixture public report',responses:'No'}];
 const page=applyQuery(rows,table,{filters:{responses:['Yes']}});
 assert.equal(page.total,0);assert.deepEqual(page.facets.responses,[{value:'No',count:1},{value:'Yes',count:0}]);
 assert.ok(dataTableHTML(table,page).includes('Yes'));
 assert.deepEqual(applyQuery([],table,{}).facets.responses,[{value:'No',count:0},{value:'Yes',count:0}]);
});
test('raw query guard keeps names and rejects duplicate table keys and length overflow',()=>{
 const table={id:'fixture',caption:'Fixture',columns:[],pageType:'money',urlKey:'receipts'};
 const name='EXAMPLE, ALEX';
 const valid=guardTableURL(table,new URL('https://fixture.test/?receipts.q='+encodeURIComponent(name)));
 assert.equal(valid.rejected,false);assert.equal(valid.query.q,name);
 for(const key of ['q','receipts.q']) {
  const url=new URL('https://fixture.test/');url.searchParams.append(key,'first');url.searchParams.append(key,'second');
  const result=guardTableURL(table,url);assert.equal(result.rejected,true);assert.equal(result.url.searchParams.has(key),false);
 }
 const large=guardTableURL(table,new URL('https://fixture.test/?future='+'x'.repeat(8193)));
 assert.equal(large.rejected,true);
});
test('query round trips namespaces, lists, ranges and a colon in the sort key',()=>{
  const query = {q:'Works & services',filters:{region:['Victoria','Queensland'],amount:{min:0,max:500000}},sort:{key:'total:amount',dir:'desc'},page:3,pageSize:25};
  const encoded = serializeQuery(query,'receipts');
  assert.deepEqual(parseQuery(new URLSearchParams(encoded),'receipts'),{...query,filters:{...query.filters,region:['Queensland','Victoria']}});
  assert.deepEqual(parseQuery(new URLSearchParams(encoded),'other'),{});
  assert.equal(serializeQuery({filters:{region:[]},page:1}), '');
  assert.equal(serializeQuery({filters:{region:['Victoria','Victoria']}}),serializeQuery({filters:{region:['Victoria']}}));
});
test('URL parsing ignores malformed, inherited and invalid numeric state',()=>{
  const params = new URLSearchParams('t.page=-2&t.pageSize=0&t.sort=name:sideways&t.f.amount=nope&t.f.__proto__=%7B%22min%22%3A1%7D');
  assert.deepEqual(parseQuery(params,'t'),{});
  assert.equal({}.min,undefined);
  assert.deepEqual(parseQuery(new URLSearchParams('f.amount=%7B%22min%22%3A0%2C%22max%22%3Anull%7D')), {filters:{amount:{min:0}}});
});
test('search, multi-value facets and inclusive ranges compose without mutation',()=>{
  const original = JSON.stringify(rows);
  const page = all({q:'works',filters:{region:['Victoria','Queensland'],amount:{min:100000,max:40000000}}});
  assert.equal(page.total,1);
  assert.equal(page.rows[0].id,'organisation-5');
  assert.equal(JSON.stringify(rows),original);
  assert.equal(all({filters:{amount:{min:10,max:0}}}).total,0);
});
test('facets exclude their own filter and respect every other filter',()=>{
  const page = all({filters:{region:['Victoria'],industry:['Infrastructure']}});
  assert.deepEqual(page.facets.region,[{value:'Victoria',count:2}]);
  assert.deepEqual(page.facets.industry.map(f=>f.value),['Housing','Infrastructure','Services']);
  assert.deepEqual(page.facets.amount,{min:21450000,max:35400000000});
});
test('sorting is numeric, natural, stable and puts missing values last in either direction',()=>{
  const input = [{id:'a',name:'Item 10',amount:10},{id:'b',name:'Item 2',amount:2},{id:'c',name:'Item 2',amount:2},{id:'d',name:'Item 1',amount:null}];
  assert.deepEqual(applyQuery(input,{...config,privacy:undefined},{sort:{key:'amount',dir:'asc'}}).rows.map(r=>r.id),['b','c','a','d']);
  assert.deepEqual(applyQuery(input,{...config,privacy:undefined},{sort:{key:'amount',dir:'desc'}}).rows.map(r=>r.id),['a','b','c','d']);
  assert.deepEqual(applyQuery(input,{...config,privacy:undefined},{sort:{key:'name',dir:'asc'}}).rows.map(r=>r.id),['d','b','c','a']);
});
test('paging clamps invalid and out-of-range pages; empty results have page one',()=>{
  assert.deepEqual(applyQuery(rows,config,{page:200}).rows.map(r=>r.id),rows.slice(5).map(r=>r.id));
  assert.equal(applyQuery(rows,config,{page:0,pageSize:-1}).pageSize,5);
  const page = applyQuery(rows,config,{q:'zero matches',page:4});
  assert.equal(page.total,0); assert.equal(page.page,1); assert.deepEqual(page.rows,[]);
});
test('formatting keeps compact money, exact decimals, grouped counts and UTC dates',()=>{
  assert.equal(formatCell(35400000000,{type:'money'}),'$35.4bn');
  assert.equal(formatCell(12450.75,{type:'money',format:'exact'}),'$12,450.75');
  assert.equal(formatCell(-1250000,{type:'money'}),'−$1.3m');
  assert.equal(formatCell(21450000,{type:'money'}),'$21.5m');
  assert.equal(formatCell(1159,{type:'count'}),'1,159');
  assert.equal(formatCell(2026,{type:'year'}),'2026');
  assert.equal(formatCell('2026-08-19',{type:'date'}),'19 Aug 2026');
  assert.equal(formatCell('2026-09-19',{type:'date'}),'19 Sep 2026');
  assert.equal(formatCell('invalid',{type:'date'}),'');
  assert.equal(formatCell(null,{type:'money'}),'');
});
test('CSV quotes delimiters and newlines, disarms formulas and exports exact underlying amounts',()=>{
  const small = {columns:[{key:'name',label:'Name'},{key:'amount',label:'Amount',type:'money'}]};
  const csv = toCSV([{name:'A, "B"\nC',amount:35400000000},{name:'=SUM(A1)',amount:-12.75}],small);
  assert.equal(csv,'Name,Amount\r\n"A, ""B""\nC",35400000000\r\n\'=SUM(A1),-12.75');
  assert.ok(!csv.includes('$35.4bn'));
});
test('SSR snapshot is deterministic without a DOM and contains a real table and toolbar',()=>{
  const html = dataTableHTML(config,applyQuery(rows,config,{}));
  assert.equal(`${html}\n`,readFileSync(new URL('./fixtures/datatable.html',import.meta.url),'utf8'));
  assert.match(html,/<caption>Disclosed receipts<\/caption>/);
  assert.match(html,/aria-sort="descending"/); assert.match(html,/title="\$35,400,000,000.00"/);
  assert.match(html,/Showing 1–5 of 9/); assert.match(html,/Jurisdiction: Federal/);
  assert.ok(!html.includes('data-label="Jurisdiction"')); assert.ok(!html.includes('Loading'));
});
test('SSR escapes record text, links and its hydration JSON; empty state is explicit',()=>{
  const unsafe = {...config,privacy:undefined,rows:[{id:'safe',name:'</script><img src=x onerror=alert(1)>',amount:1}],primaryLink:()=> 'javascript:alert(1)'};
  const html = dataTableHTML(unsafe,applyQuery(unsafe.rows,unsafe,{}));
  assert.ok(!html.includes('<img')); assert.ok(!html.includes('href="javascript:'));
  assert.match(html,/\\u003c\/script>/);
  assert.match(dataTableHTML(config,applyQuery(rows,config,{q:'zero matches'})),/No results/);
});
test('server numeric constants rely on the full facet range and keep exact chip titles',()=>{
  const server = {...config,rows:undefined,source:{endpoint:'/__fixtures/table/receipts'},columns:config.columns.map(c=>c.key === 'amount' ? {...c,hideWhenConstant:true} : c)};
  const page = {rows:[rows[0]],total:50,page:1,pageSize:5,facets:{amount:{min:35400000000,max:35400000000}}};
  const html = dataTableHTML(server,page);
  assert.ok(!html.includes('data-label="Amount"'));
  assert.match(html,/data-show-constant="amount" title="\$35,400,000,000.00"/);
  assert.match(html,/Amount: \$35.4bn/);
});
test('hydration preserves unrelated URL state and removes only its default table state',async ()=>{
  const harness = tableHarness('http://localhost/table?campaign=fixture&t.sort=amount%3Adesc&t.page=1#records');
  const mounted = mountDataTable(harness.root,config);
  await new Promise(setImmediate);
  const url = new URL(harness.win.location.href);
  assert.equal(url.searchParams.get('campaign'),'fixture'); assert.equal(url.hash,'#records');
  assert.equal(url.searchParams.has('t.sort'),false); assert.equal(url.searchParams.has('t.page'),false);
  assert.match(harness.html(),/Showing 1–5 of 9/);
  mounted.destroy();
});
test('analytics allow only the contracted table and page identifiers',()=>{
  for (const event of ['table_sort','table_filter','table_export']) assert.deepEqual(cleanEvent(event,{table_id:'workbench-money',page_type:'workbench',q:'private input',row:'private input'}),{table_id:'workbench-money',page_type:'workbench'});
});


test('unprefixed hydration and popstate preserve unrelated and unrecognised prefixed state',async ()=>{
  const harness=tableHarness('http://localhost/table?q=works&page=2&campaign=fixture&f.unrelated=%5B%22keep%22%5D&t.other=keep');
  const mounted=mountDataTable(harness.root,{...config,urlKey:undefined}); await new Promise(setImmediate);
  assert.match(harness.html(),/Showing 1–2 of 2/);
  let url=new URL(harness.win.location.href);
  assert.equal(url.searchParams.get('q'),'works'); assert.equal(url.searchParams.get('campaign'),'fixture');
  assert.ok(url.searchParams.has('f.unrelated')); assert.equal(url.searchParams.get('t.other'),'keep');
  harness.win.history.replaceState(null,'','http://localhost/table?q=zero%20matches&campaign=fixture');
  harness.win.dispatchEvent(new Event('popstate')); await new Promise(setImmediate);
  assert.match(harness.html(),/Showing 0–0 of 0/); mounted.destroy();
});

test('server SSR discards unknown payload fields and malformed range facet text',()=>{
  const server={...config,rows:undefined,source:{endpoint:'/__fixtures/table/receipts'}};
  const page={rows:[rows[0]],total:1,page:1,pageSize:5,echo:'untrusted metadata',facets:{amount:{min:'untrusted range',max:1}}};
  const html=dataTableHTML(server,page);
  assert.ok(!html.includes('untrusted metadata'));assert.ok(!html.includes('untrusted range'));
});

test('row menus have deterministic distinct identities even with duplicate names and IDs',()=>{
  const input=[{...rows[0],amount:1},{...rows[0],amount:2},{...rows[0],amount:2}];
  const fixture={...config,rows:input};
  const html=dataTableHTML(fixture,applyQuery(input,fixture,{}));
  const identities=[...html.matchAll(/data-panel="(action-[^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(identities).size,3);
  const clone=structuredClone(input);
  assert.equal(html,dataTableHTML({...fixture,rows:clone},applyQuery(clone,fixture,{})));
});

test('query engine uses its row argument for server facet options and isolates configuration caches',()=>{
  const server={...config,rows:undefined,source:{endpoint:'/__fixtures/table/receipts'}};
  assert.equal(applyQuery(rows,server,{filters:{region:['Victoria']}}).total,4);
  assert.equal(applyQuery(rows,config,{}).rows[0].id,'organisation-1');
  assert.equal(applyQuery(rows,{...config,defaultSort:{key:'name',dir:'asc'}},{}).rows[0].id,'organisation-2');
  const reverse=rows.slice().reverse();
  assert.equal(applyQuery(reverse,config,{}).rows[0].id,'organisation-1');
  const unsorted={...config,columns:config.columns.map(c=>c.key === 'amount' ? {...c,sortable:false} : c)};
  assert.equal(applyQuery(reverse,unsorted,{}).rows[0].id,'organisation-9');
});

test('server hydration preserves selected facets without a validation POST',async()=>{
  const h=tableHarness('http://localhost/table?t.f.region='+encodeURIComponent(JSON.stringify(['Victoria'])));
  const page={rows:[rows[0]],total:9,page:1,pageSize:5,facets:{region:[{value:'Victoria',count:4}]}};
  h.root.querySelector=selector=>selector==='[data-dt-page]'?{textContent:JSON.stringify(page)}:null;
  let request;
  h.win.fetch=async input=>{request=new URL(input);return Response.json(page);};
  const mounted=mountDataTable(h.root,{...config,rows:undefined,source:{endpoint:'/__fixtures/table/receipts'}});
  await new Promise(setImmediate);
  assert.equal(request.searchParams.get('f.region'),JSON.stringify(['Victoria']));
  assert.equal(new URL(h.win.location.href).searchParams.get('t.f.region'),JSON.stringify(['Victoria']));
  mounted.destroy();
});

test('legacy query adapters remove keys only after the shared raw URL guard',async()=>{
  for (const repeated of [false,true]) {
    const h=tableHarness('http://localhost/table?q=accepted&year=2025&campaign=fixture'+(repeated?'&q=second':''));
    const mounted=mountDataTable(h.root,{...config,initialQuery:{q:'accepted'},initialQueryKeys:['q','year']});
    await new Promise(setImmediate);
    const url=new URL(h.win.location.href);
    assert.equal(url.searchParams.has('q'),false);
    assert.equal(url.searchParams.has('year'),false);
    assert.equal(url.searchParams.get('campaign'),'fixture');
    if (repeated) {
      assert.equal(url.searchParams.has('t.q'),false);
      assert.match(h.html(),/Showing 0–0 of 0/);
      assert.match(h.html(),/data-export disabled/);
    } else assert.equal(url.searchParams.get('t.q'),'accepted');
    mounted.destroy();
  }
});
