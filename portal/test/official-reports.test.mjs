import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shortDate } from '../public/format.js';
import { JSDOM } from 'jsdom';
import { projectReports, projectReportIndexes, buildReportCatalog } from '../../scripts/build_report_catalog.mjs';
import { officialReportsPage } from '../src/official-reports.ts';
import { REPORT_COLLECTIONS, queryReports, reportOptions, reportState, reportRoot, reportResultsHTML, PAGE_SIZE } from '../public/official-reports-model.js';
const publicRoot = new URL('../public/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path.replace(/^\//, ''), publicRoot), 'utf8'));
const projected = await projectReports(read);
const indexes = projectReportIndexes(projected);
const assets = { fetch: async request => {
  const path = new URL(request.url).pathname;
  assert.match(path, /^\/report-records\/index(?:-[a-z_]+)?\.json$/);
  return Response.json(path.endsWith('/index.json') ? { schema: 1, collections: Object.values(indexes).map(({rows, ...s}) => s) } : indexes[path.match(/index-(.+)\.json$/)[1]]);
} };
const state = (type, values = {}) => reportState(new URLSearchParams(values), type);

test('compact indexes reconcile all records, omit detail payloads and preserve transcript counts', async () => {
  for (const [type, index] of Object.entries(indexes)) {
    const held = projected.filter(p => p.detail.report_type === type);
    assert.equal(index.count, held.length);
    assert.deepEqual(index, await read(`/report-records/index-${type}.json`));
    assert.equal(index.type, type);
    assert.ok(index.from <= index.to);
    for (const row of index.rows) {
      for (const key of ['record','findings','recommendations','facts','tables','citation','items']) assert.ok(!(key in row));
      if (type === 'annual_report') {
        for (const y of row.years) assert.ok(held.some(p => p.detail.slug === y.slug && p.detail.year === y.year && (p.detail.publisher.portfolio || '') === y.portfolio));
      } else {
        const detail = held.find(p => p.detail.slug === row.slug).detail;
        if (type === 'royal_commission') assert.equal(row.transcripts, detail.record.transcripts.length);
        if (type === 'integrity_report') assert.equal(row.transcripts, detail.record.transcripts?.count || 0);
      }
    }
    assert.ok(Buffer.byteLength(JSON.stringify(index)) < 700000);
  }
  assert.equal(indexes.annual_report.rows.reduce((n, b) => n + b.years.length, 0), indexes.annual_report.count);
});
test('builder writes its compact indexes in an isolated public tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opax-report-index-'));
  try {
    for (const dir of ['royal-commissions','integrity-reports','annual-reports','agency-reports']) await cp(new URL(dir, publicRoot), join(root,dir), { recursive: true });
    await buildReportCatalog(root);
    const summary = JSON.parse(await readFile(join(root,'report-records/index.json'),'utf8'));
    assert.equal(summary.collections.length,4);
    assert.ok(summary.collections.every(c => !('rows' in c)));
    assert.deepEqual(JSON.parse(await readFile(join(root,'report-records/index-annual_report.json'),'utf8')), indexes.annual_report);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('queries match aliases, reporting years, combined filters and deterministic sorts with bounded pages', () => {
  for (const [type, q, pattern] of [['royal_commission','robodebt',/Robodebt/],['integrity_report','IBAC',/corruption/i],['annual_report','Defence 2024–25',/Defence/],['agency_report','APSC',/Public Service/]]) {
    const result = queryReports(indexes[type], state(type,{q}));
    assert.ok(result.total, q);
    assert.ok(result.rows.some(r => pattern.test(r.title) || pattern.test(r.body)),q);
    assert.ok(result.rows.length <= PAGE_SIZE);
  }
  const index = indexes.annual_report, body = index.rows.find(b=>b.title==='Department of Defence');
  const y = body.years[0];
  const found = queryReports(index,state('annual_report',{q:'Department of Defence',year:y.year,portfolio:y.portfolio,body_type:body.body_type}));
  assert.ok(found.rows.some(r=>r.title===body.title));
  assert.ok(found.rows.every(r=>r.years.every(v=>v.year===y.year && v.portfolio===y.portfolio)));
  const sorted = queryReports(index,state('annual_report',{sort:'title'}));
  assert.deepEqual(sorted.rows.map(r=>r.title),index.rows.map(r=>r.title).sort((a,b)=>a.localeCompare(b)).slice(0,PAGE_SIZE));
  const next = queryReports(index,state('annual_report',{sort:'title',page:'2'}));
  assert.ok(next.rows.every(r=>!sorted.rows.some(s=>s.id===r.id)));
  assert.equal(queryReports(index,state('annual_report',{page:'999999'})).page,Math.ceil(index.rows.length/PAGE_SIZE));
  for (const [type, value] of Object.entries(indexes)) for (const [key] of REPORT_COLLECTIONS[type].filters) assert.ok(reportOptions(value,key).length);
  for(const [type, keys] of [['integrity_report',{jurisdiction:'Vic',body:'Independent Broad-based Anti-corruption Commission'}],['agency_report',{jurisdiction:'Vic',year:'2025-26'}],['royal_commission',{jurisdiction:'Cth',status:'Final report held'}]]) {
    const result=queryReports(indexes[type],state(type,keys));assert.ok(result.total);
    assert.ok(result.rows.every(r=>Object.entries(keys).every(([k,v])=>r[k]===v)));
  }
});
test('each server page uses only its list index, contains record links and exposes GET controls and empty recovery', async () => {
  for(const type of [null,...Object.keys(REPORT_COLLECTIONS)]) {
    const path = type ? reportRoot(type) : '/official-reports';
    const page = await officialReportsPage(type,new URL('https://opax.com.au'+path),assets);
    assert.equal(page.status,200);assert.equal(page.noindex,false);assert.ok(page.card.title);
    assert.match(page.prerender,type ? /href="\/report\// : /or-collection/);
    if(type) {
      assert.match(page.prerender,/method="get"/);assert.match(page.prerender,/name="q"/);
      for(const [key] of REPORT_COLLECTIONS[type].filters) assert.ok(page.prerender.includes(`name="${key}"`));
      const filtered = await officialReportsPage(type,new URL('https://opax.com.au'+path+'?q=zzznomatchingreport'),assets);
      assert.equal(filtered.noindex,true);assert.match(filtered.prerender,/No matching/);assert.match(filtered.prerender,/Clear search and filters/);
    }
    assert.doesNotMatch(page.prerender,/An association does not prove influence|—/);
  }
});
test('row text and query state are escaped, pagination carries filters', () => {
  const index=structuredClone(indexes.agency_report);index.rows[0].title='<img src=x onerror=alert(1)>';
  const s=state('agency_report',{q:'',jurisdiction:index.rows[0].jurisdiction});
  const result=queryReports(index,s);const html=reportResultsHTML(result,'agency_report',s);
  assert.doesNotMatch(html,/<img/);
  const annual=queryReports(indexes.annual_report,state('annual_report',{sort:'title'}));
  assert.match(reportResultsHTML(annual,'annual_report',state('annual_report',{sort:'title'})),/sort=title&amp;page=2/);
});
test('browser enhancement filters instantly, updates URL, clears, paginates and restores history state', async () => {
  const type='annual_report';const page=await officialReportsPage(type,new URL('https://opax.com.au'+reportRoot(type)),assets);
  const dom=new JSDOM(page.prerender,{url:'https://opax.com.au'+reportRoot(type),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.shortDate=shortDate;w.fetch=async()=>Response.json(indexes[type]);w.HTMLElement.prototype.scrollIntoView=()=>{};
  const model=(await readFile(new URL('official-reports-model.js',publicRoot),'utf8')).replace(/^import .*\n/gm,'').replaceAll('export ','');
  const client=(await readFile(new URL('official-reports.js',publicRoot),'utf8')).replace(/^import .*\n/,'');
  w.eval(model+'\n'+client);await new Promise(r=>setTimeout(r,20));
  const input=w.document.querySelector('[name=q]');input.value='Defence 2024-25';input.dispatchEvent(new w.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,180));
  assert.match(w.location.search,/q=Defence/);assert.match(w.document.querySelector('[data-or-results]').textContent,/Department of Defence/);
  assert.ok(w.document.querySelector('meta[name=robots]'));
  w.document.querySelector('[data-or-clear]').click();assert.equal(w.location.search,'');assert.equal(input.value,'');
  w.document.querySelector('[data-or-page]').click();assert.match(w.location.search,/page=2/);
  assert.equal(w.document.activeElement.id,'or-results-title');
  w.history.replaceState(null,'','?q=zzznomatch');w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.equal(input.value,'zzznomatch');assert.match(w.document.querySelector('[data-or-results]').textContent,/No matching/);
  dom.window.close();
});

test('header data and generated footer HTML carry every ungated official collection link', async () => {
  await import('../public/navigation.js');
  const nav=globalThis.OpaxNavigation;
  const column=nav.groups.find(g=>g.id==='research').columns.find(c=>c.heading==='Official reports');
  assert.equal(column.section.href,'/official-reports');assert.equal(column.more,'All official reports');
  assert.deepEqual(column.links.map(l=>l.href),Object.keys(REPORT_COLLECTIONS).map(reportRoot));
  assert.ok(column.links.every(l=>!l.gate));assert.ok(!column.section.gate);
  for(const file of ['index.html','home.html','community.html','press.html']) {
    const html=await readFile(new URL(file,publicRoot),'utf8');
    const footer=html.split('<!-- nav:index:start -->')[1].split('<!-- nav:index:end -->')[0];
    for(const path of ['/official-reports',...Object.keys(REPORT_COLLECTIONS).map(reportRoot)]) assert.ok(footer.includes('href="'+path+'"'),file+path);
  }
});

test('crawl sitemaps and the search catalogue publish all five official report roots', async () => {
  const fs=await import('node:fs/promises');
  const files=await fs.readdir(new URL('crawl/sitemaps/',publicRoot));
  const staticFile=files.find(f=>/static.*xml/.test(f));
  const xml=await readFile(new URL('crawl/sitemaps/'+staticFile,publicRoot),'utf8');
  const {searchCatalog}=await import('../src/catalog-search.ts');
  const disk={fetch:async req=>{try{return new Response(await readFile(new URL(new URL(req.url).pathname.replace(/^\//,''),publicRoot)));}catch{return new Response('Missing',{status:404});}}};
  for(const path of ['/official-reports',...Object.keys(REPORT_COLLECTIONS).map(reportRoot)]) {
    assert.ok(xml.includes('https://opax.com.au'+path+'</loc>'),path);
    const title=path==='/official-reports'?'Official reports':Object.values(REPORT_COLLECTIONS).find(c=>path.endsWith('/'+c.path)).title;
    const results=await searchCatalog(new URL('https://opax.com.au/api/search-all?'+new URLSearchParams({q:title,kind:'page',per:'200'})),disk);
    assert.ok(results.results.some(r=>r.href===path),path);
  }
});
