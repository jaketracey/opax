import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shortDate } from '../public/format.js';
import { JSDOM } from 'jsdom';
import { projectReports, projectReportIndexes, buildReportCatalog } from '../../scripts/build_report_catalog.mjs';
import { officialReportsPage } from '../src/official-reports.ts';
import { REPORT_COLLECTIONS, queryReports, reportOptions, reportState, reportRoot, reportResultsHTML, reportCount, reportFilterCount, PAGE_SIZE } from '../public/official-reports-model.js';
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
        for (const y of row.years) assert.ok(held.some(p => p.detail.slug === y.slug && p.detail.year === y.year && String(p.detail.publisher.portfolio || '').replace(/\s*\[i\]/gi, '').trim() === y.portfolio));
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
      assert.equal(filtered.noindex,true);assert.match(filtered.prerender,/No (?:reports|inquiries) match/g);assert.match(filtered.prerender,/Clear search and filters/);
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
const tick = ms => new Promise(r => setTimeout(r,ms));
async function browserPage({type='annual_report',query='',mobile=true}={}) {
  const url=new URL('https://opax.com.au'+reportRoot(type)+query);
  const page=await officialReportsPage(type,url,assets);
  const dom=new JSDOM(page.prerender,{url:url.href,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, calls=[];
  w.matchMedia=()=>({matches:mobile});w.shortDate=shortDate;
  w.fetch=async href=>{calls.push(href);return Response.json(indexes[type]);};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  const model=(await readFile(new URL('official-reports-model.js',publicRoot),'utf8')).replace(/^import .*\n/gm,'').replaceAll('export ','');
  const client=(await readFile(new URL('official-reports.js',publicRoot),'utf8')).replace(/^import .*\n/,'');
  w.eval(model+'\n'+client);await tick(20);
  return {dom,w,calls,form:w.document.querySelector('form'),input:w.document.querySelector('[name=q]'),more:w.document.querySelector('.or-more')};
}
test('enhancement loads its index lazily, collapses unused mobile filters and counts active controls', async () => {
  const {dom,w,calls,input,more,form}=await browserPage();
  assert.equal(calls.length,0);assert.equal(more.open,false);
  assert.ok(w.document.querySelector('.or-live'));
  input.focus();await tick(20);assert.equal(calls.length,1);
  form.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));await tick(20);assert.equal(calls.length,1);
  const year=form.querySelector('[name=year]');year.value='2024-25';year.dispatchEvent(new w.Event('change',{bubbles:true}));await tick(20);
  const sort=form.querySelector('[name=sort]');sort.value='title';sort.dispatchEvent(new w.Event('change',{bubbles:true}));await tick(20);
  assert.equal(more.querySelector('summary').textContent,'Filters and sort (2)');assert.equal(more.open,true);
  dom.window.close();
  for(const query of ['?q=Defence','?year=2024-25']) {
    const b=await browserPage({query});assert.equal(b.calls.length,1);
    assert.equal(b.more.open,query.includes('year'));b.dom.window.close();
  }
  const desktop=await browserPage({mobile:false});assert.equal(desktop.more.open,true);desktop.dom.window.close();
});
test('typing replaces history; changes, submit and pagination push; Escape clears; popstate restores', async () => {
  const {dom,w,input,form,more}=await browserPage();
  const history=[];
  for(const method of ['pushState','replaceState']) {
    const original=w.history[method].bind(w.history);
    w.history[method]=(...args)=>{history.push(method);return original(...args);};
  }
  for(const q of ['Defence','Defence 2024-25']) {
    input.value=q;input.dispatchEvent(new w.Event('input',{bubbles:true}));await tick(180);
  }
  assert.deepEqual(history,['replaceState','replaceState']);
  assert.match(w.location.search,/q=Defence/);assert.match(w.document.querySelector('[data-or-results]').textContent,/Department of Defence/);
  assert.ok(w.document.querySelector('meta[name=robots]'));
  input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await tick(20);
  assert.equal(input.value,'');assert.equal(w.location.search,'');assert.equal(history.at(-1),'replaceState');
  form.querySelector('[name=year]').value='2024-25';form.querySelector('[name=year]').dispatchEvent(new w.Event('change',{bubbles:true}));await tick(20);
  assert.equal(history.at(-1),'pushState');assert.equal(more.querySelector('summary').textContent,'Filters and sort (1)');
  input.value='Defence';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick(20);assert.equal(history.at(-1),'pushState');
  w.document.querySelector('[data-or-clear]').click();await tick(20);assert.equal(w.location.search,'');assert.equal(input.value,'');assert.equal(more.open,false);
  w.document.querySelector('[data-or-page]').click();await tick(20);assert.match(w.location.search,/page=2/);assert.equal(history.at(-1),'pushState');
  assert.equal(w.document.activeElement.id,'or-results-title');
  w.history.replaceState(null,'','?q=zzznomatch');w.dispatchEvent(new w.PopStateEvent('popstate'));await tick(20);
  assert.equal(input.value,'zzznomatch');assert.match(w.document.querySelector('[data-or-results]').textContent,/No reports match "zzznomatch"/);
  dom.window.close();
});

test('header data and generated footer HTML carry every ungated official collection link', async () => {
  await import('../public/navigation.js');
  const nav=globalThis.OpaxNavigation;
  const column=nav.groups.find(g=>g.id==='research').columns.find(c=>c.heading==='Official reports');
  assert.equal(column.section.href,'/official-reports');assert.equal(column.more,'All official reports');
  assert.deepEqual(column.links.map(l=>l.href),[...Object.keys(REPORT_COLLECTIONS).map(reportRoot),'/audit']);
  assert.ok(!nav.groups.find(g=>g.id==='research').columns.find(c=>c.heading==='Reports').links.some(l=>l.href==='/audit'));
  assert.ok(column.links.every(l=>!l.gate));assert.ok(!column.section.gate);
  for(const file of ['index.html','home.html','community.html','press.html']) {
    const html=await readFile(new URL(file,publicRoot),'utf8');
    const footer=html.split('<!-- nav:index:start -->')[1].split('<!-- nav:index:end -->')[0];
    for(const path of ['/official-reports',...Object.keys(REPORT_COLLECTIONS).map(reportRoot),'/audit']) assert.ok(footer.includes('href="'+path+'"'),file+path);
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

test('r1 server markup uses shared controls, linked cards, disclosure, sections and short dates', async () => {
  const overview=await officialReportsPage(null,new URL('https://opax.com.au/official-reports'),assets);
  const home=new JSDOM(overview.prerender).window.document;
  assert.equal(home.querySelectorAll('a.ui-card.or-collection').length,4);
  assert.equal(home.querySelectorAll('.or-collection h2.ui-card-title').length,4);
  assert.equal(home.querySelectorAll('.or-collection a,.or-browse').length,0);
  assert.match(home.querySelector('.or-source time').textContent,/\d{1,2} [A-Z][a-z]{2} 2026/);
  for(const type of Object.keys(REPORT_COLLECTIONS)) {
    const page=await officialReportsPage(type,new URL('https://opax.com.au'+reportRoot(type)),assets);
    const d=new JSDOM(page.prerender).window.document;
    assert.ok(d.querySelector('input.ui-input'));
    assert.ok([...d.querySelectorAll('select')].every(s=>s.matches('.ui-input') && s.closest('label.ui-filter-field')?.querySelector('.ui-filter-key')));
    assert.ok(d.querySelector('button.ui-button[data-variant="primary"]'));
    assert.ok(d.querySelector('details.or-more[open] .or-filters'));
    assert.ok(d.querySelector('section[data-or-results][aria-labelledby] ul.ui-list'));
    assert.equal(d.querySelector('.or-head').nextElementSibling.className,'or-tabs');
    if(type==='royal_commission') assert.equal(d.querySelector('.or-pagination'),null);
    if(type==='annual_report') {
      assert.ok([...d.querySelectorAll('[name=year] option')].some(o=>o.textContent==='2025–26' && o.value==='2025-26'));
      assert.ok([...d.querySelectorAll('.or-years a')].every(a=>!a.hasAttribute('aria-label') && a.querySelector('.visually-hidden')?.textContent.endsWith('annual report ')));
    }
  }
});
test('r1 rows keep newest portfolio, compact metadata, escaped empty queries and filtered denominators', () => {
  const index=structuredClone(indexes.annual_report);
  index.rows=[{id:'example',title:'Example body',aliases:[],body_type:'Commonwealth Company',years:[{year:'2025-26',slug:'new',portfolio:'New portfolio'},{year:'2024-25',slug:'old',portfolio:'Old portfolio'}]}];index.count=2;
  const s=state('annual_report');const result=queryReports(index,s);
  const d=new JSDOM(reportResultsHTML(result,'annual_report',s)).window.document;
  assert.equal(d.querySelector('.or-row-meta').textContent,'New portfolio · Commonwealth Company');
  assert.equal(d.querySelector('.or-pagination'),null);
  const royal=state('royal_commission',{q:'robodebt'}),r=queryReports(indexes.royal_commission,royal);
  assert.equal(reportCount(r,'royal_commission'),'1 of 23 inquiries');
  const integrity=state('integrity_report',{q:'Gloucester'}),i=queryReports(indexes.integrity_report,integrity);
  assert.equal(reportCount(i,'integrity_report'),`${i.total} of 738 reports`);
  const rows=reportResultsHTML(queryReports(indexes.royal_commission,state('royal_commission')),'royal_commission',state('royal_commission'));
  assert.doesNotMatch(rows,/Jurisdiction:|Date:|Years:|Date not held/);assert.match(rows,/Commission of inquiry/);
  const none=state('royal_commission',{q:'<img src=x>"&'});
  const empty=reportResultsHTML(queryReports(indexes.royal_commission,none),'royal_commission',none);
  assert.match(empty,/No inquiries match &quot;&lt;img src=x&gt;&quot;&amp;&quot;/);assert.doesNotMatch(empty,/<img/);
  const middle=state('integrity_report',{page:'3',jurisdiction:'Vic'});
  const pager=new JSDOM(reportResultsHTML(queryReports(indexes.integrity_report,middle),'integrity_report',middle)).window.document.querySelector('.or-pagination');
  assert.deepEqual([...pager.querySelectorAll('a')].map(a=>a.textContent),['First','Previous','Next','Last']);
  assert.ok([...pager.querySelectorAll('a')].every(a=>a.href.includes('jurisdiction=Vic')));
  assert.equal(reportFilterCount(state('annual_report',{q:'Defence',year:'2024-25',sort:'title'}),'annual_report'),2);
});
test('r1 indexes remove footnote markers and slug aliases without changing source records', () => {
  const annual=structuredClone(projected.find(p=>p.detail.report_type==='annual_report'));
  annual.detail.publisher.portfolio='Defence [i]';annual.detail.body='Example [i]';
  const cleaned=projectReportIndexes([annual]).annual_report.rows[0];
  assert.equal(cleaned.title,'Example');assert.equal(cleaned.years[0].portfolio,'Defence');assert.equal(annual.detail.publisher.portfolio,'Defence [i]');
  for(const index of Object.values(indexes)) for(const row of index.rows) {
    const derived=row.slug?.replace(/^(?:royal-commission|integrity-report|agency-report)-/,'').replaceAll('-',' ');
    assert.ok(!derived || !row.aliases.map(s=>s.toLowerCase()).includes(derived));
    if(index.type==='annual_report') assert.ok(row.years.every(y=>!y.portfolio.includes('[i]')));
  }
});
test('r1 catalogue CSS uses shared controls and tokens with no local dark theme or detail stylesheet', async () => {
  const css=await readFile(new URL('official-reports.css',publicRoot),'utf8');
  assert.doesNotMatch(css,/prefers-color-scheme|data-colour-scheme|var\(--[^,)]+,/);
  assert.doesNotMatch(css,/(?:padding|margin|gap)(?:-[\w-]+)?\s*:[^;}]*\d(?:px|rem)/);
  for(const file of ['tokens.css','style.css']) assert.doesNotMatch(await readFile(new URL(file,publicRoot),'utf8'),/data-colour-scheme="system"/);
});
