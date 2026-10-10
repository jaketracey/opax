import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {build} from 'esbuild';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {personNameKey} from '../public/canonical-urls.js';
import {vicElectionEnabled,vicElectionDiscovery,VIC_ELECTION_ASSET} from '../public/vic-election.js';
import {buildVicElection} from '../../scripts/build_vic_election.mjs';
import {sitemapFiles} from '../../scripts/build_crawl_catalog.mjs';
const root = new URL('../public/',import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const compile = async entry => {
  const r = await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-og',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'vic-test'}));b.onLoad({filter:/.*/,namespace:'vic-test'},()=>({contents:'export const renderOgPng=async()=>null; export const renderOgJpeg=renderOgPng;',loader:'js'}));}}]});
  return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
};
const {renderVicElection,vicElectionPage} = await compile('../src/vic-election.ts');
const {renderSittingIndex,renderEstimates,hubPage} = await compile('../src/hubs.ts');
const {default:worker} = await compile('../src/index.ts');
const data = await json('hubs/vic-election-2026.json');
const read = async path => json(path.replace(/^\//,''));
const env = {COMMUNITY_ORIGIN:'https://opax.com.au',ASSETS:{async fetch(req){const path=new URL(req.url).pathname;assert.doesNotMatch(path,/^\/api\/|^\/ask(?:\/|$)/);try{return new Response(await readFile(new URL(path==='/'?'index.html':path.slice(1),root)),{headers:{'content-type':path.endsWith('.json')?'application/json':'text/html'}});}catch(e){if(e.code!=='ENOENT')throw e;return new Response('Not found',{status:404});}}}};
const fetchPage = (path,enabled,extra={},options={}) => worker.fetch(new Request(new URL(path,'https://opax.com.au'),options),{...env,...extra,...(enabled===undefined?{}:{VIC_ELECTION_HUB_ENABLED:enabled})},{});
// Content assertions use the SSR renderer; router assertions stub only HTML rewriting.
globalThis.HTMLRewriter=class {on(){return this;} transform(r){return r;}};

test('publication defaults off, fails closed, and never reads election facts when disabled',async()=>{
  for (const value of [undefined,'false','1','TRUE','yes',' true ']) {
    assert.equal(vicElectionEnabled(value),false);
    const page=await vicElectionPage(null,()=>assert.fail('Disabled hub read its facts'),{VIC_ELECTION_HUB_ENABLED:value});
    assert.equal(page.status,404);assert.doesNotMatch(page.html,/href=.*vic-election-2026/);
    for(const path of ['/vic-election-2026','/vic-election-2026/','/vic-election-2026/lowan','/vic-election-2026/unknown',VIC_ELECTION_ASSET,VIC_ELECTION_ASSET+'/','/hubs/%76ic-election-2026.json']) {
      const r=await fetchPage(path,value);assert.equal(r.status,404,path);assert.equal(r.headers.get('x-robots-tag'),'noindex');
    }
    for(const path of ['/sitemap.xml','/llms.txt'])assert.doesNotMatch(await (await fetchPage(path,value)).text(),/vic-election/);
    const sitemap=await fetchPage('/sitemaps/vic-election-1.xml',value);assert.equal(sitemap.status,404);assert.equal(sitemap.headers.get('x-robots-tag'),'noindex');
    assert.deepEqual(vicElectionDiscovery(data,false),{});
  }
});
test('disabled publication gate precedes host, case and trailing-slash redirects for GET and HEAD',async()=>{
  const paths=['/vic-election-2026','/vic-election-2026/','/VIC-ELECTION-2026/','/vic-election-2026/lowan/',
    '/Vic-Election-2026/LOWAN/','/vic-election-2026//Lowan/','/%76ic-election-2026/lowan',
    '/vic-election-2026/%','/%76ic-election-2026/%',
    '/sitemaps/vic-election-1.xml','/sitemaps/vic-election-1.xml/','/SITEMAPS/VIC-ELECTION-1.XML/',
    '/sitemaps/%76ic-election-1.xml/',VIC_ELECTION_ASSET,'/HUBS/VIC-ELECTION-2026.JSON/'];
  for(const enabled of [undefined,'false'])for(const host of ['https://opax.com.au','https://www.opax.com.au','http://www.opax.com.au','http://localhost:8787'])for(const path of paths)for(const method of ['GET','HEAD']) {
    const url=host+path;const r=await fetchPage(url,enabled,{ASSETS:{fetch(){assert.fail('Disabled alias read assets');}}},{method});
    assert.equal(r.status,404,url);assert.equal(r.headers.get('x-robots-tag'),'noindex',url);
    assert.equal(r.headers.get('location'),null,url);assert.equal(r.headers.get('cache-control'),'no-store',url);
    if(method==='HEAD')assert.equal(await r.text(),'');
  }
});
test('enabled SSR renders all 88 districts and 8 regions, 128 existing people, sources and explicit gaps',async()=>{
  assert.equal(data.seats.filter(s=>s.kind==='district').length,88);assert.equal(data.seats.filter(s=>s.kind==='region').length,8);
  assert.equal(data.seats.reduce((n,s)=>n+s.members.length,0),128);assert.equal(data.pages.length,97);
  const {PERSON_PATHS}=await import('../public/person-paths.js');const paths=new Set(Object.values(PERSON_PATHS.exact));
  for (const s of data.seats) {
    const page=await vicElectionPage(s.path.split('/').at(-1),read,{VIC_ELECTION_HUB_ENABLED:'true'});
    assert.equal(page.status,200,s.name);assert.doesNotMatch(page.html,/loading|opening|placeholder/i);
    assert.ok(page.html.includes(s.electorate_url));assert.ok(page.html.includes(s.source_url));
    for(const m of s.members){assert.ok(paths.has(m.href),m.name);assert.ok(page.html.includes(m.href));}
    for(const text of ['2026 only','no Victorian register','no Victorian state grants','Federal electorates','3 November 2026','18–27 November 2026','28 November 2026'])assert.ok(page.html.includes(text),`${s.name}: ${text}`);
    assert.doesNotMatch(page.html,/An association does not prove influence/);
    assert.equal(page.jsonLd['@graph'][0]['@type'],'Event');assert.equal(page.jsonLd['@graph'][1]['@type'],'ItemList');
    assert.equal((await fetchPage(s.path,'true')).status,200);
  }
  const index=renderVicElection(data,null);assert.equal(index.jsonLd['@graph'][1].numberOfItems,96);
  for(const p of data.pages.slice(1))assert.ok(index.html.includes(p.path));
  for(const id of ['unknown','lowan/extra','../lowan','Lowan'])assert.equal((await vicElectionPage(id,read,{VIC_ELECTION_HUB_ENABLED:'true'})).status,404);
  const unknown=await fetchPage('/vic-election-2026/unknown','true');assert.equal(unknown.status,404);assert.equal(unknown.headers.get('x-robots-tag'),'noindex');
});
test('enabled crawl discovery has a separate sitemap type; trailing-slash aliases redirect once',async()=>{
  assert.match(await (await fetchPage('/sitemap.xml','true')).text(),/\/sitemaps\/vic-election-1.xml/);
  const body=await (await fetchPage('/sitemaps/vic-election-1.xml','true')).text();
  assert.equal((body.match(/<url>/g)||[]).length,97);
  for(const p of data.pages)assert.ok(body.includes(`<loc>https://opax.com.au${p.path}</loc><lastmod>${p.lastmod}</lastmod>`));
  const built=sitemapFiles(vicElectionDiscovery(data,true));assert.equal(built.counts['vic-election'],97);
  assert.match(await (await fetchPage('/llms.txt','true')).text(),/https:\/\/opax.com.au\/vic-election-2026/);
  for(const p of data.pages){const r=await fetchPage(p.path+'/','true');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://opax.com.au'+p.path);}
});
test('authorisation and correction footer values are optional, shared, escaped and safe',async()=>{
  const cfg={AUTHORISATION_LINE:'Authorised by <Approved Person>, Melbourne',CORRECTION_CONTACT:'/corrections'};
  const weeks=await json('hubs/index.json');const estimates=await json('hubs/estimates-2026-10.json');
  const pages=[renderVicElection(data,null,cfg),...data.seats.map(s=>renderVicElection(data,s,cfg)),renderSittingIndex(weeks,'2026-10-10',cfg),renderEstimates(estimates,cfg),await hubPage('sitting','bad',read,[],new Map(),undefined,cfg),await hubPage('sitting',weeks.weeks[0].start,read,[],new Map(),undefined,cfg)];
  for(const p of pages){assert.match(p.html,/<footer class="hub-footer">[\s\S]*Authorised by &lt;Approved Person&gt;, Melbourne[\s\S]*href="\/corrections">Report a correction[\s\S]*<\/footer>/);assert.doesNotMatch(p.html,/48 hours/);}
  for(const cfg of [{},{AUTHORISATION_LINE:null,CORRECTION_CONTACT:null}])for(const s of [null,...data.seats])assert.doesNotMatch(renderVicElection(data,s,cfg).html,/hub-authorisation|Report a correction/);
  assert.doesNotMatch(renderVicElection(data,null,{CORRECTION_CONTACT:'javascript:alert(1)'}).html,/href="javascript:/);
  const auth=renderVicElection(data,null,{AUTHORISATION_LINE:'Approved line'}).html;assert.match(auth,/Approved line/);assert.doesNotMatch(auth,/Report a correction/);
  const correction=renderVicElection(data,null,{CORRECTION_CONTACT:'/corrections'}).html;assert.match(correction,/Report a correction/);assert.doesNotMatch(correction,/hub-authorisation/);
});
test('derived individual donor set is absent from every election page and the projection',async()=>{
  const individuals=new Set();
  for(const path of ['graph/money.json','graph/money.vic.json','graph/money.qld.json'])for(const n of (await json(path)).nodes)if(n.kind==='donor'&&!isOrganisationDonor(n))individuals.add(n.label);
  assert.ok(individuals.size>100);
  const all=JSON.stringify(data)+[null,...data.seats].map(s=>renderVicElection(data,s).html).join('\n');
  // A donor label can coincide with a sitting member's name (Peter Walsh).
  // Their existing roster identity is allowed only in its member context.
  const memberNames=new Set(data.seats.flatMap(s=>s.members.map(m=>personNameKey(m.name))));
  for(const name of individuals)if(!memberNames.has(personNameKey(name)))assert.ok(!all.includes(name),name);
  for(const s of data.seats)for(const m of s.members)assert.deepEqual(Object.keys(m).sort(),['name','href','source_url','speeches','speech_gap','votes','detailed_count','divisions'].sort());
  assert.doesNotMatch(all,/\/subject\/donor\/|donor_links|candidate_names/);
});
test('non-partisan strings, nomination dates and actual speech scope stay explicit',()=>{
  const pages=[null,...data.seats].map(s=>renderVicElection(data,s,{},new Date('2026-10-10T00:00:00Z')).html);
  for(const html of pages)assert.doesNotMatch(html,/safe seat|marginal|predictions?|polling|opinion poll|ones to watch|likely winner|projected winner|vote for|rankings?/i);
  assert.match(pages[0],/noon on Monday 9 November 2026/);assert.doesNotMatch(pages[0],/13 November|candidate list[^<]*[A-Z][a-z]+ [A-Z]/);
  const after=renderVicElection(data,null,{},new Date('2026-11-10T00:00:00Z')).html;assert.match(after,/Nominations closed/);assert.doesNotMatch(after,/nominations close at noon/);
  const lowan=data.seats.find(s=>s.name==='Lowan');assert.ok(lowan.members[0].speeches.within_term);assert.match(renderVicElection(data,lowan).html,/2023–2026 export/);
  for(const name of ['Mornington','South Barwon']){const seat=data.seats.find(s=>s.name===name);assert.equal(seat.members[0].speeches,null);assert.match(renderVicElection(data,seat).html,/cannot isolate Victorian speeches/);}
  for(const name of ['Gippsland South','Malvern','Mill Park','Shepparton'])assert.ok(data.seats.find(s=>s.name===name).members[0].votes,name+' uses the existing apostrophe-normalised name rule');
  assert.match(renderVicElection(data,data.seats.find(s=>s.name==='Eureka')).html,/Buninyong/);
  assert.match(renderVicElection(data,data.seats.find(s=>s.name==='North-Eastern Metropolitan')).html,/Eastern Metropolitan Region was renamed/);
});
test('offline projection allowlist withholds injected donor, candidate and money fields; unknown state seats fail',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vic-election-'));
  try {
    const manifest=await json('electorates/manifest.json');const seats=await json(manifest.index_url.slice(1));
    const roster=await json('parliamentarians.json');const votes=await json('votes.json');
    for(const r of roster.people)Object.assign(r,{donor_links:[{name:'Private Donor Sentinel'}],candidate_names:['Candidate Sentinel']});
    for(const s of seats.electorates){s.grants=[{name:'Private Recipient Sentinel'}];for(const r of s.representatives)Object.assign(r.person,{donor:'Private Donor Sentinel'});}
    const files={'electorates/manifest.json':manifest,[manifest.index_url.slice(1)]:seats,'parliamentarians.json':roster,'votes.json':votes,'divisions/index.json':{divisions:[]},'interests/index.json':await json('interests/index.json'),'corpus.json':await json('corpus.json')};
    for(const [path,data] of Object.entries(files)){await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),JSON.stringify(data));}
    await writeFile(join(dir,'person-paths.js'),await readFile(new URL('person-paths.js',root),'utf8'));
    await buildVicElection(dir);
    const output=await readFile(join(dir,VIC_ELECTION_ASSET),'utf8');assert.doesNotMatch(output,/Private Donor Sentinel|Private Recipient Sentinel|Candidate Sentinel|donor_links|candidate_names/);
    seats.electorates=seats.electorates.filter(s=>!(s.jurisdiction==='vic'&&s.name==='Lowan'));await writeFile(join(dir,manifest.index_url),JSON.stringify(seats));
    await assert.rejects(buildVicElection(dir),/No exact state electorate: Lowan/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
