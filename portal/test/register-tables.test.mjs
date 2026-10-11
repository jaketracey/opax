import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {tableApi} from '../src/table-api.ts';
import {tableDatabase} from './table-d1-harness.mjs';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {tableIdentityIndex as registryIdentityIndex} from '../../scripts/load_tables.mjs';
import {instrumentTableConfig,auditTableConfig,registerTableQuery,interestTableConfig,interestTableData,partyMoneyData,partyMoneyTableConfig,registerTableHTML} from '../public/register-tables.js';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {applyQuery,dataTableHTML,toCSV} from '../public/datatable.js';
import {queryValues} from '../public/datatable-query.js';
import {tablePrivacyIndex} from './datatable-privacy.mjs';
import {instrumentPage} from '../src/instruments.ts';
import {auditPage} from '../src/audit.ts';
import {unpack,instrumentTableRows} from '../public/instruments.js';
const root = new URL('../public/',import.meta.url);
const read = async path=>JSON.parse(readFileSync(new URL(path.replace(/^\//,''),root),'utf8'));

test('interest publication placeholders keep the whole-entry omission rule',()=>{
  const register={source_url:'https://fixture.test/register',buckets:{gifts:{items:[
    {description:'Gift from Donor 1 (name withheld)',holder:'Self'},
    {description:'Unchanged source entry',holder:'Self'},
  ]}}};
  const projected=interestTableData(register,()=>false,()=>true);
  assert.equal(projected.omitted,1);
  assert.deepEqual(projected.rows.map(row=>row.item),['Unchanged source entry']);
  assert.equal(projected.rows[0].source,register.source_url);
});

test('instrument server rows use as-made registration dates and do not transfer the catalogue to the browser',async()=>{
  const manifest = await read('/instruments/manifest.json'), index = await read(manifest.index_url);
  const rows = await instrumentTableRows(read,manifest,index.records);
  assert.equal(rows.length,manifest.exported ?? manifest.count);
  const dates = new Map(rows.map(row=>[row.id,row.registered]));
  for (const chunk of manifest.chunks) for (const packed of (await read(chunk.path)).records) {
    const {source} = unpack(packed,manifest.schemas,manifest.strings);
    assert.equal(dates.get(source.id),source.asMadeRegisteredAt?.slice(0,10) || null,'date follows source registration metadata');
  }
  const config = instrumentTableConfig();
  assert.equal(config.rows,undefined);assert.equal(config.source.endpoint,'/api/table/instruments');
  assert.deepEqual(config.columns.filter(c=>config.columnsVisible.includes(c.key)).map(c=>c.label),['Title','Type','Portfolio','Registered','Status']);

});

test('audit client mode contains the complete small catalogue and the required column types',async()=>{
  const manifest = await read('/audit/manifest.json'), index = await read(manifest.index_url);
  const config = auditTableConfig(index.records,(await tablePrivacyIndex()).safe);
  assert.equal(config.rows.length,manifest.count);assert.equal(config.source,undefined);
  assert.deepEqual(config.columns.filter(c=>config.columnsVisible.includes(c.key)).map(c=>[c.label,c.type]),[['Title','text'],['Tabled','date'],['Sector','category'],['Entities','text']]);
  for (const row of config.rows) assert.equal(config.primaryLink(row),`/audit/${row.id}`);
});

test('interest dates distinguish notification dates from the snapshot and source text stays exact',()=>{
  const register = {as_at:'2026-09-19',source_url:'https://register.example/statement.pdf',buckets:{gifts:{items:[{description:'An organisation-provided item',date:'2026-08-03',page:2},{description:'An item in the latest statement'}]}}};
  const {rows,omitted} = interestTableData(register,()=>false), config = interestTableConfig(rows,()=>true);
  assert.equal(omitted,0);assert.deepEqual(rows.map(row=>row.date),['2026-08-03','2026-09-19']);
  assert.equal(rows[0].item,register.buckets.gifts.items[0].description);
  assert.equal(config.primaryLink(rows[0]),register.source_url+'#page=2');
  assert.equal(applyQuery(rows,config,{q:'organisation'}).total,1);
  assert.equal(applyQuery(rows,config,{q:'absent text'}).total,0);
});

test('organisation aliases retain evidence and repeated withheld receipts count one donor',()=>{
  const graph = {nodes:[{id:'donor:organisation-fixture',kind:'donor',label:'Register fixture',aliases:['Register Fixture Organisation Pty Ltd','Withheld donor']},{id:'donor:withheld-fixture',kind:'donor',label:'Withheld donor'}],edges:[
    {source:'donor:organisation-fixture',target:'party:fixture',total:10,count:2},
    {source:'donor:withheld-fixture',target:'party:fixture',total:3,count:1},
    {source:'donor:withheld-fixture',target:'party:fixture',total:4,count:1},
  ]};
  const {rows,aggregate} = partyMoneyData(graph,'party:fixture',label=>label !== 'Register fixture');
  assert.equal(rows.length,1);assert.equal(isOrganisationDonor(rows[0]),true);
  assert.deepEqual(rows[0].aliases,['Register Fixture Organisation Pty Ltd']);
  assert.deepEqual(aggregate,{donors:1,total:7,count:2});
});

test('protected row policies are fail closed and cached independently',()=>{
  const rows=[{item:'A source entry',category:'Gifts'}];
  const config=interestTableConfig(rows,()=>true);
  assert.equal(applyQuery(rows,config,{}).total,1);
  for(const rowPrivacyCheck of [()=>false,()=>undefined,()=>{throw new Error('unavailable');}]) {
    assert.equal(applyQuery(rows,{...config,rowPrivacyCheck},{}).total,0);
    assert.equal(toCSV(rows,{...config,rowPrivacyCheck}).split('\r\n').length,1);
  }
});

test('every interest register omits entries rejected by the shared table index without losing the whole table',async()=>{
  const index=await tablePrivacyIndex();
  const withheld=(...texts)=>texts.some(text=>!index.safe(String(text)));
  let extraOmitted=0,registers=0;
  for(const file of readdirSync(new URL('interests/',root)).filter(file=>file !== 'index.json' && file.endsWith('.json'))) {
    const register=await read('/interests/'+file);
    if(!register.buckets)continue;
    const before=interestTableData(register,()=>false),projected=interestTableData(register,withheld,index.safe);
    const config=interestTableConfig(projected.rows,index.safe),page=applyQuery(config.rows,config,{pageSize:50000});
    assert.ok(index.safe(JSON.stringify(page)),`register ${registers}: rows and facets`);
    assert.ok(index.safe(toCSV(page.rows,config)),`register ${registers}: CSV`);
    assert.equal(projected.omitted-before.omitted,before.rows.length-projected.rows.length);
    extraOmitted+=projected.omitted-before.omitted;registers++;
  }
  assert.ok(registers>300);assert.ok(extraOmitted>0,'derived entries exercise the stricter core check');
});

test('real D1 instruments project registration dates and accept date sorting, numeric year filters and CSV',async()=>{
 const policy=await registryIdentityIndex();
 const publicRow=row=>!Object.values(row).flat().some(policy.rowCheck);
 const manifest=await read('/instruments/manifest.json'),rows=(await instrumentTableRows(read,manifest,(await read(manifest.index_url)).records)).filter(publicRow);
 const audit=auditTableConfig((await read('/audit/index.json')).records,()=>true);
 const datasets=Object.fromEntries(Object.keys(TABLE_DATASETS).map(key=>[key,[]]));
 const auditRows=audit.rows.filter(row=>!row.entities.some(policy.rowCheck));
 datasets.instruments=rows.map(row=>({row}));datasets['audit-reports']=auditRows.map(row=>({row}));
 const local=await tableDatabase({datasets,policy});
 try {
  const request=path=>tableApi(new Request('https://opax.test/api/table/'+path),{TABLE_DB:local.db});
  const response=await request('instruments?sort=registered:desc'),page=await response.json();
  assert.equal(response.status,200);assert.equal(page.total,rows.length);assert.equal(page.rows.length,50);
  assert.ok(page.rows.every(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.registered)),'registered cells are populated');
  assert.deepEqual(page.rows.map(row=>row.registered),page.rows.map(row=>row.registered).sort().reverse());
  const year=rows.find(row=>row.year)?.year,filter=new URLSearchParams({'f.year':JSON.stringify({min:year,max:year})});
  const filtered=await request('instruments?'+filter);assert.equal(filtered.status,200);
  assert.equal((await filtered.json()).total,rows.filter(row=>row.year===year).length);
  const csv=await request('instruments?q=airport&format=csv'),text=await csv.text();
  assert.equal(csv.status,200);assert.ok(text.split('\r\n')[0].split(',').includes('Registered'));
  assert.ok(text.includes(rows.find(row=>row.title.toLowerCase().includes('airport'))?.registered),'CSV retains source registration date');
  const all=await (await request('audit-reports')).json();assert.equal(all.total,296);assert.ok(all.facets.year.min);assert.ok(all.facets.year.max);
  const auditCSV=await (await request('audit-reports?format=csv')).text();assert.ok(auditCSV.includes('qao-2015-16-14'),'institutional report is restored to D1 CSV');
  const reportYear=audit.rows[0].year,auditFilter=new URLSearchParams({'f.year':JSON.stringify({min:reportYear,max:reportYear})});
  const reports=await request('audit-reports?'+auditFilter);assert.equal(reports.status,200);
  assert.equal((await reports.json()).total,auditRows.filter(row=>row.year===reportYear).length);
  const health=await (await request('audit-reports?'+new URLSearchParams({'f.sectors':'["Health"]'}))).json();assert.equal(health.total,48);
 }finally{await local.close();}
});

test('category facets count each audit sector and each instrument portfolio once',async()=>{
 const {safe,safeRows}=await tablePrivacyIndex(),records=(await read('/audit/index.json')).records,config=auditTableConfig(records,safe,safeRows);
 const all=applyQuery(config.rows,config,{});
 assert.equal(records.length,296);assert.equal(all.total,296);assert.equal(all.facets.sectors.find(f=>f.value==='Health').count,48);
 assert.equal(applyQuery(config.rows,config,{filters:{sectors:['Health']}}).total,48);
 assert.equal(applyQuery(config.rows,config,{filters:{sectors:['Housing']}}).total,7);
 const m=await read('/instruments/manifest.json'),rows=await instrumentTableRows(read,m,(await read(m.index_url)).records),instruments=instrumentTableConfig(safe,safeRows);
 const approved=rows.filter(row=>[...queryValues(row)].every(safeRows));
 for(const portfolio of new Set(rows.flatMap(r=>r.portfolios)))assert.equal(applyQuery(rows,instruments,{filters:{portfolios:[portfolio]}}).total,approved.filter(r=>r.portfolios.includes(portfolio)).length,'portfolio membership');
});
test('legacy query state uses complete catalogues and filtered SSR remains noindex',async()=>{
 const {safe,safeRows}=await tablePrivacyIndex(),block=(title,text)=>`<h1>${title}</h1><p>${text}</p>`;
 const instruments=await instrumentPage(null,new URL('https://opax.test/instruments?q=airport'),read,block,safe);
 assert.equal(instruments.noindex,true);assert.ok(instruments.prerender.includes('of 51'));
 assert.deepEqual(registerTableQuery(new URLSearchParams('q=airport'),instrumentTableConfig(safe)),{q:'airport'});
 const audit=await auditPage(null,new URL('https://opax.test/audit?sector=Health'),read,block,safe,safeRows);
 assert.equal(audit.noindex,true);assert.ok(audit.prerender.includes('of 48'));
 const config=auditTableConfig((await read('/audit/index.json')).records,safe,safeRows);
 assert.equal(applyQuery(config.rows,config,{}).total,296);
 assert.deepEqual(registerTableQuery(new URLSearchParams('year=2025-26'),config),{filters:{year:{min:2025,max:2025}}});
});

test('audit publication guards entity fields without hiding institutional titles or slugs',async()=>{
 const index=await tablePrivacyIndex(),records=(await read('/audit/index.json')).records;
 const config=auditTableConfig(records,index.safe,index.safeRows);
 const restored=config.rows.find(row=>row.id==='qao-2015-16-14');
 assert.ok(restored,'institutional report exists');
 assert.equal(applyQuery(config.rows,config,{}).total,296);
 assert.ok(toCSV(config.rows,config).includes(restored.title),'institutional report survives CSV');
 const probe=index.probes.find(value=>!index.safeRows(value));
 assert.equal(typeof probe,'string','person-bearing field probe available');
 const unsafe={...restored,entities:[probe]};
 assert.equal(applyQuery([unsafe],{...config,rows:[unsafe]},{}).total,0,'private entity field omits the whole row');
 assert.equal(toCSV([unsafe],config).split('\r\n').length,1,'private entity field cannot export');
});

test('party SSR validates the raw query before discarding duplicate or future properties',async()=>{
 const index=await tablePrivacyIndex(),probe=index.probes[0];
 const config=partyMoneyTableConfig([{label:'Fixture organisation Pty Ltd',industry:'Fixture',total:1,count:1}],undefined,undefined,undefined,undefined,index.safe,index.safeRows);
 for(const kind of ['duplicate','unknown','discarded']){
  const url=new URL('https://fixture.test/subject/party/fixture');
  if(kind==='duplicate'){url.searchParams.append('partyMoney.q','fixture');url.searchParams.append('partyMoney.q',probe);}
  else if(kind==='unknown')url.searchParams.set('partyMoney.future',probe);
  else url.searchParams.set('partyMoney.f.total',JSON.stringify({min:0,discarded:probe}));
  const html=registerTableHTML(config,undefined,url);
  assert.ok(html.includes('Showing 0–0 of 0'),'SSR has no rows');
  assert.ok(html.includes('data-export disabled'),'SSR cannot export');
  assert.ok(index.safe(html),'SSR has no private echo');
  assert.ok(index.safe(decodeURIComponent(url.href)),'raw URL is scrubbed');
 }
 const url=new URL('https://fixture.test/subject/party/fixture?partyMoney.q=fixture');
 assert.ok(registerTableHTML(config,undefined,url).includes('Showing 1–1 of 1'),'valid raw query is retained');
});
