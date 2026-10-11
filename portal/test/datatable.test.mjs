import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyQuery,dataTableHTML,formatCell,mountDataTable,parseQuery,serializeQuery,toCSV} from '../public/datatable.js';
import {workbenchConfig,workbenchRows as rows} from '../public/datatable-workbench-data.js';
import {cleanEvent} from '../analytics/privacy.mjs';
import {tableHarness} from './datatable-harness.mjs';

const config={...workbenchConfig,privacyCheck:()=>true};
const all = query => applyQuery(rows,config,{...query,pageSize:100});
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

test('neutral individual aggregates carry only counts and numeric totals, without links',()=>{
  const aggregate={aggregate:{kind:'individual-donors',count:12},name:'untrusted label',id:'unsafe-id',aliases:['untrusted alias'],amount:12345.67,count:20,industry:'untrusted sector'};
  const page=applyQuery([rows[0],aggregate],config,{});
  const row=page.rows.find(r=>r.aggregate);
  assert.deepEqual(row,{aggregate:{kind:'individual-donors',count:12},name:'Donors not named (12)',amount:12345.67,count:20});
  const html=dataTableHTML(config,page);
  assert.match(html,/Donors not named \(12\)/); assert.ok(!html.includes('unsafe-id')); assert.ok(!html.includes('untrusted'));
  assert.ok(!html.includes('href="#undefined"'));
  assert.match(toCSV(page.rows,config),/Donors not named \(12\),,,12345.67,20/);
  assert.equal(toCSV([aggregate],{...config,privacy:undefined}),toCSV([aggregate],config));
  const numericPrimary={...config,columns:config.columns.map(c=>({...c,primary:c.key === 'amount'}))};
  assert.equal(toCSV([aggregate],numericPrimary),toCSV([aggregate],config));
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

test('multi-member facets count records once and callback policies keep distinct caches',()=>{
 const rows=[{name:'Fixture organisation Pty Ltd',sectors:['Health','Education','Health'],date:'2026-01-01',reportYear:'2025-26'}];
 const config={id:'category-members',caption:'Reports',pageType:'audit',columns:[{key:'sectors',label:'Sector',type:'category',facet:'multi'}],rows};
 assert.deepEqual(applyQuery(rows,config,{}).facets.sectors,[{value:'Education',count:1},{value:'Health',count:1}]);
 assert.equal(applyQuery(rows,config,{filters:{sectors:['Health','Education']}}).total,1);
 assert.ok(toCSV(rows,config).includes('Health; Education; Health'));
 const facetValues=value=>()=>[value];
 const first={...config,columns:[{key:'date',label:'Tabled',type:'date',facet:'multi',facetValues:facetValues('2025-26'),facetLabel:'Report year'}]};
 const second={...first,columns:[{...first.columns[0],facetValues:facetValues('2024-25')}]};
 assert.equal(applyQuery(rows,first,{}).facets.date[0].value,'2025-26');
 assert.equal(applyQuery(rows,second,{}).facets.date[0].value,'2024-25');
});
