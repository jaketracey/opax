import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {build} from 'esbuild';
import {isOrganisationDonor} from "../public/donor-entity.js";
import {personNameKey} from '../public/canonical-urls.js';
import {vicElectionEnabled,vicElectionDiscovery,vicElectionMaterial,VIC_ELECTION_ASSET,VIC_ELECTION_PLACES,VIC_ELECTION_AUTHORISATION_LINE,VIC_ELECTION_CORRECTIONS_EMAIL,VIC_ELECTION_CORRECTIONS_RESPONSE} from '../public/vic-election.js';
import {buildVicElection} from '../../scripts/build_vic_election.mjs';
import {sitemapFiles} from '../../scripts/build_crawl_catalog.mjs';
const EXACT_AUTHORISATION = 'Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little Collins Street, Melbourne VIC 3000.';
const root = new URL('../public/',import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const compile = async entry => {
  const r = await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-og',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'vic-test'}));b.onLoad({filter:/.*/,namespace:'vic-test'},()=>({contents:'export const renderOgPng=async()=>null; export const renderOgJpeg=renderOgPng;',loader:'js'}));}}]});
  return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
};
const {renderVicElection,vicElectionPage,findSeats} = await compile('../src/vic-election.ts');
const {renderSittingIndex,renderEstimates,hubPage} = await compile('../src/hubs.ts');
const {default:worker} = await compile('../src/index.ts');
const data = await json('hubs/vic-election-2026.json');
const places = await json(VIC_ELECTION_PLACES.slice(1));
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
test('disabled electoral share cards are refused before any cached card can be replayed',async()=>{
  const saved=globalThis.caches;
  globalThis.caches={default:{match(){assert.fail('Disabled election card read cache');},put(){assert.fail('Disabled election card wrote cache');}}};
  try {
    for(const path of ['/og/vic-election-2026.jpg','/og/vic-election-2026/lowan.jpg?format=portrait']) {
      const r=await fetchPage(path,'false');assert.equal(r.status,404);
    }
  } finally {globalThis.caches=saved;}
});
test('enabled SSR renders all 88 districts and 8 regions, 128 existing people, results, dates and no unheld sections',async()=>{
  assert.equal(data.seats.filter(s=>s.kind==='district').length,88);assert.equal(data.seats.filter(s=>s.kind==='region').length,8);
  assert.equal(data.seats.reduce((n,s)=>n+s.members.length,0),128);assert.equal(data.pages.length,97);
  const {PERSON_PATHS}=await import('../public/person-paths.js');const paths=new Set(Object.values(PERSON_PATHS.exact));
  for (const s of data.seats) {
    const page=await vicElectionPage(s.path.split('/').at(-1),read,{VIC_ELECTION_HUB_ENABLED:'true'});
    // Visible text only: the speech search's example words are an input attribute.
    assert.equal(page.status,200,s.name);assert.doesNotMatch(page.html.replace(/<[^>]+>/g,' '),/loading|opening|placeholder/i);
    assert.ok(page.html.includes(s.source_url));
    for(const m of s.members){assert.ok(paths.has(m.href),m.name);assert.ok(page.html.includes(m.href));assert.ok(m.party,m.name);assert.ok(page.html.replace(/&#39;/g,"'").includes(`${m.party}</span>`),`${s.name}: ${m.party}`);}
    for(const text of ['8 pm Tuesday 3 November 2026','18–27 November 2026','Saturday 28 November 2026','href="/methods#vic-election"'])assert.ok(page.html.includes(text),`${s.name}: ${text}`);
    // Jake, 13 Oct: sections OPAX can't fill are dropped; the caveats live on Methods.
    assert.doesNotMatch(page.html,/Not available|What OPAX holds|Grants by state electorate|Declared interests|Electoral boundaries|annual aggregate|snapshot|vote export|export/i,s.name);
    if(s.kind==='district'){
      const r=s.result.since||s.result.general;
      assert.ok(page.html.includes(`${r.margin.toFixed(1)} points`),s.name);
      assert.ok(page.html.includes(`name="speaker" value="${s.members[0].name.replace(/'/g,'&#39;')}"`),s.name);
    }
    assert.doesNotMatch(page.html,/An association does not prove influence/);
    assert.equal(page.jsonLd['@graph'][0]['@type'],'Event');assert.equal(page.jsonLd['@graph'][1]['@type'],'ItemList');
    const response=await fetchPage(s.path,'true');assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'all');
  }
  const index=renderVicElection(data,null);assert.equal(index.jsonLd['@graph'][1].numberOfItems,96);
  for(const p of data.pages.slice(1))assert.ok(index.html.includes(p.path));
  for(const id of ['unknown','lowan/extra','../lowan','Lowan'])assert.equal((await vicElectionPage(id,read,{VIC_ELECTION_HUB_ENABLED:'true'})).status,404);
  const unknown=await fetchPage('/vic-election-2026/unknown','true');assert.equal(unknown.status,404);assert.equal(unknown.headers.get('x-robots-tag'),'noindex');
  const missing=await vicElectionPage('unknown',read,{VIC_ELECTION_HUB_ENABLED:'true'});assert.ok(missing.html.includes(VIC_ELECTION_AUTHORISATION_LINE));
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
test('every election page and download carries Jake’s exact 13 October authorisation and corrections contact',()=>{
  assert.equal(VIC_ELECTION_AUTHORISATION_LINE,EXACT_AUTHORISATION);
  assert.equal(data.authorisation,VIC_ELECTION_AUTHORISATION_LINE);
  assert.deepEqual(data.corrections,{email:VIC_ELECTION_CORRECTIONS_EMAIL,response:VIC_ELECTION_CORRECTIONS_RESPONSE});
  for(const s of [null,...data.seats]) {
    // Optional federal Worker values cannot remove the election's approved lines.
    const page=renderVicElection(data,s,{AUTHORISATION_LINE:'',CORRECTION_CONTACT:null});
    const footer=page.html.match(/<div class="hub-footer">[\s\S]*?<\/div>/)?.[0];
    assert.ok(footer);
    assert.ok(footer.includes(EXACT_AUTHORISATION));
    assert.ok(footer.includes(`href="mailto:${VIC_ELECTION_CORRECTIONS_EMAIL}"`));
    assert.ok(footer.includes(VIC_ELECTION_CORRECTIONS_RESPONSE));
    assert.doesNotMatch(footer,/48[- ]hours?|placeholder|TODO/i);
    assert.equal(page.card.authorisation,VIC_ELECTION_AUTHORISATION_LINE);
  }
});
test('production config publishes with the exact line; staging explicitly stays unpublished',async()=>{
  const {default:ts}=await import('typescript');
  const {config,error}=ts.parseConfigFileTextToJson('wrangler.jsonc',await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.equal(error,undefined);
  assert.equal(config.vars.VIC_ELECTION_HUB_ENABLED,'true');
  assert.equal(config.vars.AUTHORISATION_LINE,EXACT_AUTHORISATION);
  assert.equal(config.vars.CORRECTION_CONTACT,'mailto:corrections@opax.com.au');
  assert.equal(config.env.staging.vars.VIC_ELECTION_HUB_ENABLED,'false');
  const stage=await fetchPage('/vic-election-2026',config.env.staging.vars.VIC_ELECTION_HUB_ENABLED);
  assert.equal(stage.status,404);assert.equal(stage.headers.get('x-robots-tag'),'noindex');
});
test('federal hub footer values remain optional, escaped and safe',async()=>{
  const cfg={AUTHORISATION_LINE:'Authorised by <Approved Person>, Melbourne',CORRECTION_CONTACT:'/corrections'};
  const weeks=await json('hubs/index.json');const estimates=await json('hubs/estimates-2026-10.json');
  const pages=[renderSittingIndex(weeks,'2026-10-10',cfg),renderEstimates(estimates,cfg),await hubPage('sitting','bad',read,[],new Map(),undefined,cfg),await hubPage('sitting',weeks.weeks[0].start,read,[],new Map(),undefined,cfg)];
  for(const p of pages){assert.match(p.html,/<div class="hub-footer">[\s\S]*Authorised by &lt;Approved Person&gt;, Melbourne[\s\S]*href="\/corrections">Report a correction[\s\S]*<\/div>/);assert.doesNotMatch(p.html,/48 hours/);}
  for(const cfg of [{},{AUTHORISATION_LINE:null,CORRECTION_CONTACT:null}])assert.doesNotMatch(renderSittingIndex(weeks,'2026-10-10',cfg).html,/hub-authorisation|Report a correction/);
  assert.doesNotMatch(renderSittingIndex(weeks,'2026-10-10',{CORRECTION_CONTACT:'javascript:alert(1)'}).html,/href="javascript:/);
  assert.doesNotMatch(renderSittingIndex(weeks,'2026-10-10',{CORRECTION_CONTACT:'mailto:corrections@example.com?subject=bad'}).html,/href="mailto:/);
  const auth=renderSittingIndex(weeks,'2026-10-10',{AUTHORISATION_LINE:'Approved line'}).html;assert.match(auth,/Approved line/);assert.doesNotMatch(auth,/Report a correction/);
  const correction=renderSittingIndex(weeks,'2026-10-10',{CORRECTION_CONTACT:'/corrections'}).html;assert.match(correction,/Report a correction/);assert.doesNotMatch(correction,/hub-authorisation/);
});
test('derived individual donor set is absent from every election page and the projection',async()=>{
  const individuals=new Set();
  for(const path of ['graph/money.json','graph/money.vic.json','graph/money.qld.json'])for(const n of (await json(path)).nodes)if(n.kind==='donor'&&!isOrganisationDonor(n))individuals.add(n.label);
  assert.ok(individuals.size>100);
  const all=JSON.stringify(data)+[null,...data.seats].map(s=>renderVicElection(data,s).html).join('\n');
  // A donor label can coincide with a sitting member's name.
  // Their existing roster identity is allowed only in its member context.
  const memberNames=new Set(data.seats.flatMap(s=>s.members.map(m=>personNameKey(m.name))));
  for(const name of individuals)if(!memberNames.has(personNameKey(name)))assert.ok(!all.includes(name),name);
  for(const s of data.seats)for(const m of s.members)assert.deepEqual(Object.keys(m).sort(),['name','party','href','source_url','speeches','speech_gap','votes','detailed_count','divisions'].sort());
  // Results keep parties and shares only: no candidate names.
  for(const s of data.seats.filter(s=>s.result))for(const c of [s.result.general,s.result.since].filter(Boolean))assert.deepEqual(Object.keys(c).sort(),['date','kind','party','share','against','against_share','margin','url'].sort());
  assert.doesNotMatch(all,/\/subject\/donor\/|donor_links|candidate_names/);
});
test('non-partisan strings, nomination dates and actual speech scope stay explicit',()=>{
  const pages=[null,...data.seats].map(s=>renderVicElection(data,s,{},new Date('2026-10-10T00:00:00Z')).html);
  for(const html of pages)assert.doesNotMatch(html,/safe seat|marginal|predictions?|polling|opinion poll|ones to watch|likely winner|projected winner|vote for|rankings?/i);
  assert.match(pages[0],/noon on Monday 9 November 2026/);assert.doesNotMatch(pages[0],/13 November|candidate list[^<]*[A-Z][a-z]+ [A-Z]/);
  const after=renderVicElection(data,null,{},new Date('2026-11-10T00:00:00Z')).html;assert.match(after,/Nominations closed/);assert.doesNotMatch(after,/nominations close at noon/);
  const lowan=data.seats.find(s=>s.name==='Lowan');assert.ok(lowan.members[0].speeches.within_term);assert.match(renderVicElection(data,lowan).html,/speeches in Parliament, 2023–2026/);
  // A count the export can't separate from federal records is left out, not explained away.
  for(const name of ['Mornington','South Barwon']){const seat=data.seats.find(s=>s.name===name);assert.equal(seat.members[0].speeches,null);const html=renderVicElection(data,seat).html;assert.doesNotMatch(html,/speeches in Parliament|cannot isolate/);assert.match(html,/Search [^<]+’s speeches/);}
  for(const name of ['Gippsland South','Malvern','Mill Park','Shepparton'])assert.ok(data.seats.find(s=>s.name===name).members[0].votes,name+' uses the existing apostrophe-normalised name rule');
  assert.match(renderVicElection(data,data.seats.find(s=>s.name==='Eureka')).html,/Called Buninyong before 2022/);
  assert.match(renderVicElection(data,data.seats.find(s=>s.name==='North-Eastern Metropolitan')).html,/Called Eastern Metropolitan Region before 2022/);
  assert.match(renderVicElection(data,data.seats.find(s=>s.name==='Ashwood')).html,/First contested in 2022/);
});

test('VEC results: 2022 seat totals, later by-elections and margins as records',()=>{
  const districts=data.seats.filter(s=>s.kind==='district');
  const won={};for(const s of districts)won[s.result.general.party]=(won[s.result.general.party]||0)+1;
  assert.deepEqual(won,{Labor:56,Liberal:19,Nationals:9,Greens:4});
  for(const s of districts){const g=s.result.general;assert.ok(g.share>50&&Math.abs(g.share+g.against_share-100)<0.05,s.name);assert.equal(g.margin,Math.round((g.share-50)*100)/100,s.name);assert.match(g.url,/^https:\/\/www\.vec\.vic\.gov\.au\//);}
  const since=Object.fromEntries(districts.filter(s=>s.result.since).map(s=>[s.name,s.result.since.date]));
  assert.deepEqual(since,{Mulgrave:'2023-11-18',Nepean:'2026-05-02',Prahran:'2025-02-08',Warrandyte:'2023-08-26',Werribee:'2025-02-08'});
  assert.equal(districts.find(s=>s.name==='Narracan').result.general.kind,'supplementary');
  const prahran=renderVicElection(data,districts.find(s=>s.name==='Prahran')).html;
  assert.match(prahran,/2025 by-election<\/dt><dd>Liberal 51\.4%, Greens 48\.6% after preferences/);assert.match(prahran,/2022 election<\/dt><dd>Greens 62\.0%/);
  assert.match(renderVicElection(data,null).html,/Liberal by 1\.4<\/span><span class="vic-seat-held">Rachel Westaway/);
});
test('seat finder: suburbs, postcodes and council areas from ABS splits, exact names first, never indexed',async()=>{
  assert.equal(places.suburb.length>2900&&places.postcode.length>650&&places.council.length===80,true);
  assert.deepEqual(places.districts,data.seats.filter(s=>s.kind==='district').map(s=>s.name).sort());
  const names=hits=>hits.map(h=>`${h.kind}:${h.name}`);
  const pc=findSeats('3350',data,places);assert.equal(pc[0].kind,'Postcode');
  assert.deepEqual(pc[0].seats.map(x=>x.seat.name),['Wendouree','Eureka','Ripon']);assert.ok(Math.abs(pc[0].seats.reduce((n,x)=>n+x.share,0)-100)<0.5);
  const ballarat=findSeats('Ballarat',data,places);assert.equal(names(ballarat)[0],'Council area:Ballarat');assert.ok(names(ballarat).includes('Suburb:Ballarat Central'));
  assert.deepEqual(findSeats('fitzroy',data,places).filter(h=>h.name==='Fitzroy').map(h=>h.seats.map(x=>x.seat.name)),[['Richmond']]);
  assert.equal(names(findSeats('Wendouree',data,places))[0],'District:Wendouree');
  // One answer per seat named outright; suburbs wholly inside it don't repeat it.
  assert.deepEqual(names(findSeats('bass',data,places)),['District:Bass']);
  assert.ok(['Suburb:Ballarat Central','Suburb:Ballarat North','Suburb:Ballarat East'].every(n=>names(ballarat).includes(n)));
  assert.deepEqual(names(findSeats('Mt Waverley',data,places)).slice(0,1),['Suburb:Mount Waverley']);
  assert.deepEqual(findSeats('Addison',data,null).map(h=>`${h.kind}:${h.seats[0].seat.name}`),['Member:Wendouree']);
  assert.deepEqual(findSeats('zzqx',data,places),[]);assert.deepEqual(findSeats('   ',data,places),[]);
  const found=await vicElectionPage(null,read,{VIC_ELECTION_HUB_ENABLED:'true'},'3350');
  assert.equal(found.noindex,true);assert.match(found.html,/<strong>3350<\/strong> <span>Postcode<\/span>/);assert.match(found.html,/Check your exact address with the VEC/);
  const none=await vicElectionPage(null,read,{VIC_ELECTION_HUB_ENABLED:'true'},'<script>x');assert.match(none.html,/matches “&lt;script&gt;x”/);assert.doesNotMatch(none.html,/<script>x/);
  assert.match((await vicElectionPage(null,read,{VIC_ELECTION_HUB_ENABLED:'true'},'3001')).html,/No Victorian postcode area matches “3001”\. PO box postcodes aren’t included/);
  const r=await fetchPage('/vic-election-2026?place=3350','true');assert.equal(r.status,200);assert.equal(r.headers.get('x-robots-tag'),'noindex');
  assert.equal((await fetchPage('/vic-election-2026','true')).headers.get('x-robots-tag'),'all');
});
test('key dates follow the VEC timeline and say when a deadline has passed',()=>{
  const before=renderVicElection(data,null,{},new Date('2026-10-13T00:00:00+11:00')).html;
  assert.match(before,/Enrol or update your details by 8 pm on Tuesday 3 November\. <a href="https:\/\/www\.vec\.vic\.gov\.au\/enrolment\/check-my-enrolment">Check your enrolment/);
  assert.match(before,/Apply for a postal vote by<\/dt><dd>6 pm Wednesday 25 November 2026/);
  const after=renderVicElection(data,null,{},new Date('2026-11-04T00:00:00+11:00')).html;
  assert.match(after,/Enrolment closed at 8 pm on Tuesday 3 November\./);assert.match(after,/<dt>Enrolment closed<\/dt>/);assert.match(after,/Caretaker period began/);
});
test('Methods carries the coverage detail the election pages link to',async()=>{
  const shell=await readFile(new URL('index.html',root),'utf8');
  const section=shell.split('<h3 id="vic-election">')[1]?.split('<h3>')[0];assert.ok(section);
  for(const text of ['2026 only','no Victorian register','no Victorian\n        state grants','Federal electorates are different from state districts','CC BY 4.0','Australian Bureau of Statistics','usual residents at the 2021 Census','copyright material without an open licence'])
    assert.ok(section.replace(/\s+/g,' ').includes(text.replace(/\s+/g,' ')),text);
});

test('candidates appear only from a VEC list, in ballot paper order, with the allowlisted fields',async()=>{
  assert.ok(data.seats.every(s=>s.candidates===null));
  assert.doesNotMatch(renderVicElection(data,data.seats.find(s=>s.name==='Lowan')).html,/id="candidates"/);
  const dir=await mkdtemp(join(tmpdir(),'vic-candidates-'));
  try {
    const hubs=new URL('../../scripts/hubs/',import.meta.url);
    for(const name of ['vic-election-2026.json','vic-results-2022.json','vic-places-2025.json'])await writeFile(join(dir,name),await readFile(new URL(name,hubs)));
    // Invented names: test fixtures never use real people.
    await writeFile(join(dir,'vic-candidates-2026.json'),JSON.stringify({published:'2026-11-10',url:'https://www.vec.vic.gov.au/candidates',districts:{Lowan:[{name:'Avery Quill',party:'Independent',email:'x@example.com'},{name:'Rowan Ketch',party:'Liberal'}]}}));
    const out=await mkdtemp(join(tmpdir(),'vic-candidates-out-'));
    try {
      for(const path of ['electorates/manifest.json','parliamentarians.json','votes.json','divisions/index.json','interests/index.json','corpus.json','person-paths.js']){await mkdir(dirname(join(out,path)),{recursive:true});await writeFile(join(out,path),await readFile(new URL(path,root)));}
      const manifest=await json('electorates/manifest.json');await mkdir(dirname(join(out,manifest.index_url)),{recursive:true});await writeFile(join(out,manifest.index_url),await readFile(new URL(manifest.index_url.slice(1),root)));
      for(const row of (await json('divisions/index.json')).divisions.filter(d=>/^vic-(la|lc)-/.test(d.key))){await mkdir(join(out,'divisions'),{recursive:true});await writeFile(join(out,`divisions/${row.slug}.json`),await readFile(new URL(`divisions/${row.slug}.json`,root)));}
      await buildVicElection(out,join(dir,'vic-election-2026.json'));
      const built=JSON.parse(await readFile(join(out,VIC_ELECTION_ASSET),'utf8'));const lowan=built.seats.find(s=>s.name==='Lowan');
      assert.deepEqual(lowan.candidates.list,[{name:'Avery Quill',party:'Independent'},{name:'Rowan Ketch',party:'Liberal'}]);
      const html=renderVicElection(built,lowan).html;assert.match(html,/<h2>Candidates<\/h2><p class="hub-meta">In ballot paper order, as published by the VEC on 10 Nov 2026/);assert.ok(html.indexOf('Avery Quill')<html.indexOf('Rowan Ketch'));
      await writeFile(join(dir,'vic-candidates-2026.json'),JSON.stringify({published:'2026-11-10',url:'https://www.vec.vic.gov.au/candidates',districts:{Nowhere:[{name:'Avery Quill'}]}}));
      await assert.rejects(buildVicElection(out,join(dir,'vic-election-2026.json')),/unknown constituency: Nowhere/);
    } finally {await rm(out,{recursive:true,force:true});}
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('election detection identifies state election copy without treating federal records in Victoria as state electoral copy',()=>{
  for(const text of ['Victorian election 2026','2026 Victorian state election','Victoria’s election','State election in Victoria','VIC election 2026','https://opax.com.au/vic-election-2026/lowan'])assert.ok(vicElectionMaterial(text),text);
  for(const text of ['Federal election in Victoria','Federal election grants in Victoria','Gippsland, Vic. Held at the 2025 federal election.','Victorian Hansard speeches','Time to the next federal election'])assert.equal(vicElectionMaterial(text),false,text);
});
