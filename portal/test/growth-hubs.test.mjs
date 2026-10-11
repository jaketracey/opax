import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {deriveWeek,orderedWeeks,currentSittingPath,recentWindow,recentRecords,sydneyDay,latest} from '../public/hubs-data.js';
import {shortDate} from '../public/format.js';
import {buildHubs} from '../../scripts/build_hubs.mjs';
import {sitemapFiles} from '../../scripts/build_crawl_catalog.mjs';
const root = new URL('../public/',import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const records = JSON.parse(await readFile(new URL('./fixtures/hubs-records.json',import.meta.url),'utf8'));
const calendar = JSON.parse(await readFile(new URL('../../scripts/hubs/sitting-2026.json',import.meta.url),'utf8'));
const compile = async entry => {
  const compiled = await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-og',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'hub-test'}));b.onLoad({filter:/.*/,namespace:'hub-test'},()=>({contents:'export const renderOgPng=async()=>null; export const renderOgJpeg=renderOgPng;',loader:'js'}));}}]});
  return import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
};
const {renderSittingWeek,renderSittingIndex,renderEstimates,hubPage} = await compile('../src/hubs.ts');
const period = calendar.periods.find(w => w.start === '2026-10-12');
const fixtureWeek = deriveWeek(period,records.bills,records.divisions,calendar.updated);
const data = {...calendar,snapshotDate:calendar.updated,latestFederalDivision:'2026-08-20',weeks:[fixtureWeek]};
const people = [{name:'Faruqi',pid:'10912'},{name:'Mehreen Faruqi',pid:'10912',speeches:30}];
const slugs = new Map([['Mehreen Faruqi','mehreen-faruqi']]);

test('week fixtures use introduction dates and division dates, exclude states, and respect either sitting house',()=>{
  assert.deepEqual(fixtureWeek.bills.map(b => b.key),['au-federal-house','au-federal-senate']);
  assert.deepEqual(fixtureWeek.divisions.map(d => d.key),['federal-senate-example','federal-reps-example']);
  assert.equal(fixtureWeek.lastmod,'2026-10-15');
  for (const house of ['senate','representatives']) {
    const week = deriveWeek({...period,houses:[house]},records.bills,records.divisions,calendar.updated);
    assert.equal(week.bills.length,1);assert.equal(week.bills[0].originating_house,house);
    assert.equal(week.divisions.length,1);assert.equal(week.divisions[0].house,house);
  }
});
test('SSR week uses the validated sponsor, dated Machine-written label and 2D title with outcome and tally',()=>{
  const page = renderSittingWeek(data,fixtureWeek,people,slugs);
  assert.match(page.html,/href="\/subject\/person\/mehreen-faruqi">Mehreen Faruqi/);
  for (const text of ['Machine-written','Written 13 Oct 2026','A model summary.','The 2D division title','Agreed · 40 ayes · 20 noes','Not agreed · 50 ayes · 80 noes','Senate two-thirds cut-off','14 Oct 2026']) assert.ok(page.html.includes(text),text);
  assert.doesNotMatch(page.html,/Fallback title/);
  assert.equal(page.jsonLd['@graph'][0]['@type'],'Event');
  assert.equal(page.jsonLd['@graph'][1].numberOfItems,4);
  assert.equal(page.jsonLd['@graph'][0].endDate,'2026-10-15');
  const undated = structuredClone(fixtureWeek); delete undated.bills[0].summary.generated_at;
  assert.doesNotMatch(renderSittingWeek(data,undated,people,slugs).html,/A model summary\./);
  const malicious = structuredClone(fixtureWeek);
  malicious.bills[0].title='<img src=x onerror=bad>';
  malicious.bills[0].sources=[{kind:'billhome',url:'javascript:alert(1)'}];
  malicious.divisions[0].ayes='<script>bad</script>';
  assert.doesNotMatch(renderSittingWeek(data,malicious,people,slugs).html,/<img|<script|javascript:/);
});
test('empty week has calendar facts and arrival text, with no loading text or empty record sections',()=>{
  const week = deriveWeek(period,[],[],calendar.updated);
  const page = renderSittingWeek({...data,weeks:[week]},week,[],new Map(),'2026-10-10');
  for (const fact of ['12 Oct 2026','15 Oct 2026','House of Representatives','Senate','14 Oct 2026','Bills and divisions appear here the morning after each sitting day']) assert.ok(page.html.includes(fact),fact);
  assert.doesNotMatch(page.html,/loading|opening|placeholder|<h2>Bills introduced|<h2>Divisions held|<ul class="hub-records">/i);
  assert.equal(week.lastmod,calendar.updated);
});
test('bill rows have one introduction meta line, portfolio fallback and no missing-summary placeholder',()=>{
  const week = structuredClone(fixtureWeek);
  week.bills[1].portfolio = 'Health, Disability and Ageing';
  const html = renderSittingWeek(data,week,people,slugs).html;
  assert.match(html,/Introduced 12 Oct 2026 · House of Representatives · <a[^>]+>Mehreen Faruqi/);
  assert.match(html,/Introduced 14 Oct 2026 · Senate · Health, Disability and Ageing/);
  const billSection = html.match(/<h2>Bills introduced[\s\S]*?<\/section>/)[0];
  assert.equal((billSection.match(/12 Oct 2026/g)||[]).length,1);
  assert.equal((billSection.match(/14 Oct 2026/g)||[]).length,1);
  assert.doesNotMatch(billSection,/Sponsor not recorded|No dated machine-written summary/);
  delete week.bills[1].portfolio;
  assert.match(renderSittingWeek(data,week,people,slugs).html,/Sponsor not recorded/);
});
test('missing divisions state actual federal export coverage rather than an upstream publication delay',async()=>{
  const index = await json('hubs/index.json');
  const week = {...index.weeks.find(w => w.start === '2026-09-14'),divisions:[]};
  for (const coverage of ['2026-08-20','2026-09-11']) {
    const page = await hubPage('sitting',week.start,async()=>({...index,snapshotDate:'2026-10-10',latestFederalDivision:coverage,weeks:[week]}),[],new Map(),'2026-10-10');
    assert.ok(page.html.includes(`Federal divisions in OPAX&#39;s published record currently run to ${shortDate(coverage)}; divisions held after that date will appear here once the record is updated.`));
    assert.match(page.html,/Published snapshot 10 Oct 2026/);
    assert.doesNotMatch(page.html,/aren't in the published record yet|No divisions|<h2>Divisions held|Divisions[^<]*<span class="hub-count">0/);
  }
  assert.match(renderSittingWeek({...index,latestFederalDivision:''},week,[],new Map(),'2026-10-10').html,/Federal divisions are not available in this OPAX export/);
  const upcoming = deriveWeek(period,[],[],calendar.updated);
  assert.doesNotMatch(renderSittingWeek(data,upcoming,[],new Map(),'2026-10-10').html,/currently run to|aren't in the published record yet/);
});
test('every hub and hub 404 omits the pending correction contact and response commitment',async()=>{
  const index=await json('hubs/index.json');const estimates=await json('hubs/estimates-2026-10.json');
  const pages=[renderSittingIndex(index,'2026-10-10'),renderEstimates(estimates),...index.weeks.map(w=>renderSittingWeek(index,w,[],new Map(),'2026-10-10')),
    await hubPage('sitting','bad-week',async()=>index,[],new Map()),await hubPage('estimates','unknown',async()=>estimates,[],new Map())];
  for (const page of pages) assert.doesNotMatch(page.html,/Report a correction|48 hours|hub-corrections/);
});
test('calendar is the bills guard source of truth for the four remaining periods',()=>{
  const result = execFileSync('python3',['-c','import sys,json; sys.path.insert(0,"../scripts/vm"); import bills_guard; print(json.dumps(bills_guard.SITTING_RANGES))'],{encoding:'utf8'});
  assert.deepEqual(JSON.parse(result),calendar.periods.filter(w => w.refresh_bills).map(w => [w.start,w.end]));
  assert.deepEqual(calendar.periods.filter(w => w.refresh_bills).map(w => w.houses),[['representatives','senate'],['representatives'],['senate'],['representatives','senate']]);
  assert.deepEqual(calendar.periods.map(w => w.senate_cutoff).filter(Boolean),['2026-10-14','2026-11-24']);
  for (const w of calendar.periods) assert.equal(new Date(w.start+'T00:00:00Z').getUTCDay(),1);
});
test('index puts current first, then upcoming and most recent past; bills entry uses Sydney time',()=>{
  const weeks = calendar.periods.map(w => deriveWeek(w,[],[],calendar.updated));
  assert.equal(orderedWeeks(weeks,'2026-10-14')[0].start,'2026-10-12');
  assert.equal(orderedWeeks(weeks,'2026-10-30')[0].start,'2026-11-16');
  assert.equal(orderedWeeks(weeks,'2026-12-01')[0].start,'2026-11-23');
  assert.equal(currentSittingPath(weeks,'2026-10-14'),'/sitting/2026-10-12');
  assert.equal(sydneyDay(new Date('2026-10-11T14:00:00Z')),'2026-10-12');
  const page = renderSittingIndex({...calendar,weeks},'2026-10-14');
  assert.ok(page.html.indexOf('/sitting/2026-10-12') < page.html.indexOf('/sitting/2026-09-14'));
});
test('recent money windows exclude undated, future and duplicate notices, and keep the largest three',()=>{
  const window = recentWindow('2026-10-03T10:00:00Z');
  assert.deepEqual(window,{start:'2025-10-04',end:'2026-10-03'});
  const rows = [1,2,3,4].map(n => ({id:String(n),date:'2026-10-03',value:n}));
  const kept = recentRecords([...rows,rows[0],{id:'future',date:'2026-10-04',value:100},{id:'old',date:'2025-10-03',value:100},{id:'missing',value:100}],window,'date','value');
  assert.equal(kept.count,4);assert.equal(kept.total,10);assert.deepEqual(kept.largest.map(r => r.id),['4','3','2']);
});
test('estimates config renders all committees, dates, portfolio fallback, agency links and sourced money',async()=>{
  const config = JSON.parse(await readFile(new URL('../../scripts/hubs/estimates-2026-10.json',import.meta.url),'utf8'));
  const estimates = await json('hubs/estimates-2026-10.json');
  const page = renderEstimates(estimates);
  assert.equal(config.fetch.status,200);assert.equal(config.committees.length,8);
  for (const text of ['26 Oct 2026','27 Oct 2026','28 Oct 2026','29 Oct 2026','Group A','Group B','Environment and Communications','Finance and Public Administration','Economics','Portfolio agencies (program not yet published)','AusTender','GrantConnect']) assert.ok(page.html.includes(text),text);
  assert.match(page.html,/href="\/subject\/agency\/a-[a-f0-9]{20}"/);
  assert.match(page.html,/Published \d+ \w+ 2026/);assert.match(page.html,/Agreement \d+ \w+ 2026/);
  assert.equal(page.jsonLd['@graph'][0]['@type'],'Event');
  assert.equal(page.jsonLd['@graph'][1].numberOfItems,estimates.agencies.length);
  assert.match(page.html,/<summary>Largest recorded awards, by value<\/summary>/);
  assert.doesNotMatch(page.html,/<summary>[^<]*\b(top|best)\b/i);
  const published = structuredClone(estimates);published.committees[0].program={source_url:config.source_url,agencies:[published.agencies[0].name]};
  assert.ok(renderEstimates(published).html.includes('Published hearing program'));
});
test('estimates defines both financial windows once and reports zero grants as a period count',async()=>{
  const estimates = await json('hubs/estimates-2026-10.json');
  const html = renderEstimates(estimates).html;
  assert.equal((html.match(/Period covered:/g)||[]).length,1);
  assert.ok(html.includes(`contracts published ${shortDate(estimates.contractWindow.start)} – ${shortDate(estimates.contractWindow.end)}; grants agreed ${shortDate(estimates.grantWindow.start)} – ${shortDate(estimates.grantWindow.end)}`));
  const empty = estimates.agencies.find(a=>a.grants.count===0);
  assert.ok(empty);
  const row = html.slice(html.indexOf(`<h4><a href="/subject/agency/${empty.id}"`)).split('</article>')[0];
  assert.match(row,/<dt>Grants<\/dt><dd>No grants in this period<\/dd>/);
  assert.doesNotMatch(html,/<dt>Grants<\/dt><dd>0 · \$0|<dt>Recent /);
  for (const a of estimates.agencies) {
    for (const r of a.contracts.largest) assert.ok(r.published.slice(0,10)>=estimates.contractWindow.start && r.published.slice(0,10)<=estimates.contractWindow.end);
    for (const r of a.grants.largest) assert.ok(r.date.slice(0,10)>=estimates.grantWindow.start && r.date.slice(0,10)<=estimates.grantWindow.end);
  }
});
test('hubs have their own sitemap type, record lastmods, canonical links and llms entries',async()=>{
  const index = await json('hubs/index.json');const manifest=await json('crawl/manifest.json');
  const estimates = await json('hubs/estimates-2026-10.json');
  assert.equal(index.pages.find(p=>p.path==='/estimates/2026-10').lastmod,latest([estimates.updated,estimates.contractUpdated,estimates.grantUpdated]));
  assert.equal(manifest.counts.hubs,7);assert.equal(manifest.lastmodFallbacks.hubs,0);
  const body=await readFile(new URL('crawl/sitemaps/hubs-1.xml',root),'utf8');
  for (const p of index.pages) assert.ok(body.includes(`<loc>https://opax.com.au${p.path}</loc><lastmod>${p.lastmod}</lastmod>`));
  assert.match(sitemapFiles({hubs:[{path:'/sitting/2026-10-12',lastmod:fixtureWeek.lastmod}]}).files[0].body,/<lastmod>2026-10-15/);
  const llms=await readFile(new URL('crawl/llms.txt',root),'utf8');assert.match(llms,/https:\/\/opax.com.au\/sitting\)/);assert.match(llms,/https:\/\/opax.com.au\/estimates\/2026-10/);
});
test('offline build drops individual donor and politician fields even when source fixtures contain them',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'opax-hubs-'));const configs=join(dir,'config');
  const sentinels={donor_links:[{name:'Private Donor Sentinel',party:'Named Politician Sentinel'}]};
  const cfg={id:'2026-10',updated:'2026-10-10',committees:[{program:null,portfolios:[{name:'Finance',agencies:['Fixture Agency']}]}]};
  const files={
    'config/sitting-2026.json':calendar,'config/estimates-2026-10.json':cfg,
    'corpus.json':{version:'2026-10-10'},
    'bills/index.json':{bills:records.bills},...Object.fromEntries(records.bills.map(b=>[`bills/${b.key}.json`,structuredClone(b)])),
    'divisions/index.json':{divisions:records.divisions},...Object.fromEntries(records.divisions.map(d=>[`divisions/${d.slug}.json`,{...d,title:null} ])),
    'agencies.json':{meta:{generated_at:'2026-10-03'},agencies:[{id:'a-fixture',name:'Fixture Agency',profile_path:'/agencies/fixture.json'}]},
    'agencies/fixture.json':{...sentinels,contracts:[{id:'CN1',title:'Fixture contract',supplier:'Organisation',amount:20,published:'2026-10-02',...sentinels}]},
    'graph/grants.federal.json':{meta:{generated:'2026-10-03'}},
    'grants/federal/shard-00.json':{fixture:{id:'person:private-recipient',k:'individual',n:'Private Recipient Sentinel',...sentinels,grants:[{id:'GA1',ag:'Fixture Agency',s:'2026-10-01',v:10,n:'Award',...sentinels}]}},
  };
  files['bills/au-federal-senate.json'].portfolio='Fixture portfolio';
  files['bills/au-federal-senate.json'].introduced='2026-10-15T23:59:00+11:00';
  files['divisions/index.json'].divisions=structuredClone(records.divisions);
  files['divisions/index.json'].divisions[1].date='2026-10-15T23:59:00+11:00';
  files['divisions/index.json'].divisions.push({key:'federal-senate-outside-calendar',date:'2026-12-01'},{key:'nsw-outside-calendar',date:'2026-12-02'});
  files['divisions/division-federal-reps-example.json'].date='2026-10-15T23:59:00+11:00';
  try {
    for (const [path,value] of Object.entries(files)) {await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),JSON.stringify(value));}
    await buildHubs(dir,configs);
    const output=await readFile(join(dir,'hubs/estimates-2026-10.json'),'utf8');
    assert.doesNotMatch(output,/Private Donor Sentinel|Named Politician Sentinel|Private Recipient Sentinel|donor_links/);
    const e=JSON.parse(output);assert.equal(e.agencies[0].grants.total,10);assert.equal(e.agencies[0].grants.largest[0].recipient,'Recipient name withheld');
    const index=JSON.parse(await readFile(join(dir,'hubs/index.json'),'utf8'));
    assert.equal(index.snapshotDate,'2026-10-10');
    assert.equal(index.latestFederalDivision,'2026-12-01');
    assert.equal(index.pages.find(p=>p.path==='/estimates/2026-10').lastmod,'2026-10-10');
    const w=index.weeks.find(w=>w.start==='2026-10-12');
    assert.equal(w.divisions[0].title,'The 2D division title');
    assert.equal(w.divisions.length,2);assert.equal(w.bills[1].portfolio,'Fixture portfolio');
    for (const [file,value,expected] of [['agencies.json',{...files['agencies.json'],meta:{generated_at:'2026-10-12T18:00:00Z'}},'2026-10-12'],['graph/grants.federal.json',{meta:{generated:'2026-10-13T02:00:00Z'}},'2026-10-13']]) {
      await writeFile(join(dir,file),JSON.stringify(value));await buildHubs(dir,configs);
      const refreshed=JSON.parse(await readFile(join(dir,'hubs/index.json'),'utf8'));
      assert.equal(refreshed.pages.find(p=>p.path==='/estimates/2026-10').lastmod,expected);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('bad weeks return a real 404 with noindex; hubs keep SSR and remove SPA startup scripts',async()=>{
  const {default:worker}=await compile('../src/index.ts');
  const previous=globalThis.HTMLRewriter;
  globalThis.HTMLRewriter=class {on(){return this;} transform(r){return r;}};
  const env={COMMUNITY_ORIGIN:'https://opax.com.au',ASSETS:{async fetch(req){const p=new URL(req.url).pathname;try{return new Response(await readFile(new URL(p==='/'?'index.html':p.slice(1),root)),{headers:{'content-type':p.endsWith('.json')?'application/json':'text/html'}});}catch{return new Response('Not found',{status:404});}}}};
  try {
    for (const path of ['/sitting/2026-10-13','/sitting/2026-02-31','/sitting/not-a-week','/sitting/2026-10-12/extra','/estimates/unknown']) {
      const response=await worker.fetch(new Request('https://opax.com.au'+path),env,{});
      assert.equal(response.status,404,path);assert.equal(response.headers.get('x-robots-tag'),'noindex');
    }
    const index=await json('hubs/index.json');
    assert.equal((await hubPage('sitting','2026-10-12',async()=>index,[],new Map())).status,200);
    const estimates=await json('hubs/estimates-2026-10.json');
    assert.doesNotMatch(renderEstimates(estimates).html,/\/subject\/(person|donor)\//);
    const source=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
    assert.match(source,/route.kind === 'hub'\) rewriter.on\('script\[src\]'/);
    assert.match(source,/main#main/);
  } finally {globalThis.HTMLRewriter=previous;}
});
test('hubs carry the breadcrumb, one dated source line per records block, and the shared link and type rules',async()=>{
  const page = renderSittingWeek(data,fixtureWeek,people,slugs);
  assert.match(page.html,/^<nav class="crumbs prerender-crumbs"[^>]*>[\s\S]*href="\/sitting">Sitting weeks<\/a>[\s\S]*aria-current="page"><svg[^]*?<span class="crumb-label">12 Oct 2026 – 15 Oct 2026<\/span>/);
  assert.match(page.html,/<h1>[^<]+<\/h1><p class="hub-meta">House of Representatives and Senate<\/p>/);
  const sections = page.html.match(/<section class="hub-section">[\s\S]*?<\/section>/g);
  assert.equal(sections.length,2);
  for (const section of sections) {
    const lines = section.match(/<span class="ui-source-text">[^]*?<\/span><\/span>/g)||[];
    assert.equal(lines.length,1);assert.match(lines[0],/\d{1,2} \w{3} \d{4}/);
  }
  assert.doesNotMatch(page.html,/hub-pills|hub-cutoff|hub-trail|ui-tag|<footer/);
  const estimates = renderEstimates(await json('hubs/estimates-2026-10.json')).html;
  assert.equal((estimates.match(/class="ui-pop ui-source"/g)||[]).length,2);
  assert.equal((estimates.match(/not payments/g)||[]).length,1);
  assert.match(estimates,/<nav class="hub-toc"[^>]*>[\s\S]*href="#group-A"/);
  assert.doesNotMatch(estimates,/\$\d{1,3}(,\d{3}){2,}|ui-tag|hub-cutoff/);
  const css = await readFile(new URL('../public/hubs.css',import.meta.url),'utf8');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g,''),/--bills-|max-width: 960px|font-size|font: \d|border-left|--space-\d|--line\b/);
});
