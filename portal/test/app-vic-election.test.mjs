import './helpers/vic-election-clock.mjs';
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {join} from 'node:path';
import {buildVicElection} from '../../scripts/build_vic_election.mjs';
import {withVicElectionBuild} from './helpers/vic-election-build.mjs';
import {VIC_ELECTION_CACHE as APP_CACHE} from '../public/vic-election.js';
import {personNameKey} from '../public/canonical-urls.js';
import {VIC_ELECTION_ASSET, VIC_ELECTION_PLACES, VIC_ELECTION_AUTHORISATION_LINE, VIC_ELECTION_POLLS_OPEN, VIC_ELECTION_POLLS_CLOSE} from '../public/vic-election.js';

// Freeze response pins independently of the Mac's real election-day clock.
beforeEach(t=>t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-12T10:00:00+11:00')}));
const ROOT = '/api/app/v1/vic-election';
const publicRoot = new URL('../public/',import.meta.url);
const fixtures = new URL('./fixtures/app-vic-election/',import.meta.url);
const jsonFile = async path=>JSON.parse(await readFile(new URL(path,publicRoot),'utf8'));
// Exact response pins always use these committed inputs, never nightly exports.
const data = JSON.parse(await readFile(new URL('hub-input.json',fixtures),'utf8'));
const places = JSON.parse(await readFile(new URL('places-input.json',fixtures),'utf8'));
const councilCandidates = JSON.parse(await readFile(new URL('northern-metropolitan-candidates-input.json',fixtures),'utf8'));
const liveData = await jsonFile(VIC_ELECTION_ASSET.slice(1));
const livePlaces = await jsonFile(VIC_ELECTION_PLACES.slice(1));
async function compile(entry) {
  const result = await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],
    plugins:[{name:'omit-og',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'vic-api-test'}));b.onLoad({filter:/.*/,namespace:'vic-api-test'},()=>({contents:'export const renderOgPng=async()=>null; export const renderOgJpeg=renderOgPng; export const renderStoryPng=renderOgPng; export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {appVicElection} = await compile('../src/app-vic-election.ts');
const {renderVicElection,findSeats,titledVotes,contestName} = await compile('../src/vic-election.ts');
const {default:worker} = await compile('../src/index.ts');
const slug = s=>s.path.split('/').at(-1);
function environment(election=data,index=places,flag='true') {
  const reads=[];
  return {VIC_ELECTION_HUB_ENABLED:flag,reads,ASSETS:{async fetch(req){
    const path=new URL(req.url).pathname;reads.push(path);
    assert.ok([VIC_ELECTION_ASSET,VIC_ELECTION_PLACES].includes(path),'only local election assets may be read');
    const value=path===VIC_ELECTION_ASSET?election:index;
    if(value instanceof Error)throw value;
    return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
  }}};
}
const request=(path='',options={})=>new Request('https://opax.com.au'+ROOT+path,options);
const get=(path='',env=environment(),options={})=>appVicElection(request(path,options),env);
async function payload(path='',env=environment()) {
  const r=await get(path,env);assert.equal(r.status,200,await r.clone().text());return r.json();
}
async function pin(name,path,election=data) {
  const value=await payload(path,environment(election,places));
  if(process.env.UPDATE_APP_VIC_ELECTION_FIXTURES==='1') {
    await mkdir(fixtures,{recursive:true});
    await writeFile(new URL(name+'.json',fixtures),JSON.stringify(value,null,2)+'\n');
  }
  assert.deepEqual(value,JSON.parse(await readFile(new URL(name+'.json',fixtures),'utf8')),name);
}
const candidateData=()=>{
  const d=structuredClone(data);
  d.seats[0].candidates={published:'2026-11-10',url:data.sources.election,list:[
    {name:'Wren Halloway',party:''},{name:'Avery Quill',party:'Independent'},{name:'Rowan Ketch',party:'Example Party'},
  ]};
  return d;
};
const councilCandidateData=()=>{
  const d=structuredClone(data);
  d.seats.find(s=>slug(s)==='northern-metropolitan').candidates=structuredClone(councilCandidates);
  return d;
};

test('publication gate precedes method, query and assets on every sub-path, through the Worker',async()=>{
  for(const flag of [undefined,'false','1','TRUE'])for(const path of ['', '/seat/albert-park','/find?q=3350','/unknown','/seat/BAD?extra=1'])for(const method of ['GET','HEAD','POST']) {
    const env=environment();env.VIC_ELECTION_HUB_ENABLED=flag;
    const r=await worker.fetch(request(path,{method}),env,{});
    assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(r.headers.get('x-robots-tag'),'noindex');assert.deepEqual(env.reads,[]);
    if(method==='HEAD')assert.equal(await r.text(),'');else assert.deepEqual(await r.json(),{error:'not_published'});
  }
});

test('overview projects 88 districts and 8 regions in hub order; every slug resolves',async()=>{
  const d=await payload();assert.equal(d.schema_version,1);assert.equal(d.districts.length,88);assert.equal(d.regions.length,8);
  assert.deepEqual([...d.districts,...d.regions].map(x=>x.slug),data.seats.map(slug));
  assert.equal(d.authorisation,VIC_ELECTION_AUTHORISATION_LINE);assert.deepEqual(d.corrections,data.corrections);
  assert.equal(d.polls_open,VIC_ELECTION_POLLS_OPEN);assert.equal(d.polls_close,VIC_ELECTION_POLLS_CLOSE);
  const event=renderVicElection(data,null).jsonLd['@graph'][0];
  assert.equal(d.polls_open,event.startDate);assert.equal(d.polls_close,event.endDate);
  assert.equal(d.notice,null);assert.equal(d.candidates_published,null);
  assert.equal(d.roster_date,data.seats.map(s=>s.roster_date).sort().at(-1));
  const page=JSDOM.fragment(renderVicElection(data,null).html);
  assert.equal(page.querySelector('h1').textContent,d.title);
  assert.equal(page.querySelector('.vic-about').textContent.replace('About this data: ','').replace(' How this page is built','').replace(/^d/,'D'),d.about);
  for(const row of [...d.districts,...d.regions]) {
    const detail=await payload('/seat/'+row.slug);assert.equal(detail.name,row.name);assert.equal(detail.kind,row.kind);
  }
  await pin('overview','');
});

for(const date of ['2026-11-02T10:00:00+11:00','2026-11-12T10:00:00+11:00','2026-11-26T10:00:00+11:00']) {
  test('key date API wording and links equal rendered hub HTML at '+date,async()=>{
    const now=new Date(date);const response=await appVicElection(request(),environment(),now);const d=await response.json();
    const rows=[...JSDOM.fragment(renderVicElection(data,null,{},now).html).querySelectorAll('.vic-dates > div')];
    assert.equal(rows.length,6);
    d.key_dates.forEach((r,i)=>{
      const passed=r.passes_at!==null && now.getTime()>=Date.parse(r.passes_at);
      assert.equal(rows[i].querySelector('dt').textContent,passed?r.passed_label??r.label:r.label);
      assert.equal(rows[i].querySelector('dd').firstChild.textContent,passed?r.passed_when??r.when:r.when);
      const link=rows[i].querySelector('a');
      assert.deepEqual(link?{label:link.textContent,url:link.getAttribute('href')}:null,r.link);
    });
  });
}

test('every district recent-vote title equals the rendered page; regions use the same filter',async()=>{
  for(const s of data.seats) {
    const api=await payload('/seat/'+slug(s));
    for(const [i,m] of s.members.entries())assert.deepEqual(api.members[i].recent_votes,titledVotes(m));
    if(s.kind==='district') {
      const titles=[...JSDOM.fragment(renderVicElection(data,s).html).querySelectorAll('.vic-votes a')].map(a=>a.textContent);
      assert.deepEqual(api.members[0].recent_votes.map(v=>v.title),titles,s.name);
    }
  }
});

test('recent votes skip untitled motions and duplicate titles, retain source order, and stop at three',async()=>{
  const d=structuredClone(data),m=d.seats[0].members[0],base=m.divisions[0];
  m.divisions=['Assembly divided on motion','Council divided on question','First question','First question','Second question','Third question','Fourth question'].map(title=>({...base,title}));
  const member=(await payload('/seat/albert-park',environment(d))).members[0];
  assert.deepEqual(member.recent_votes.map(v=>v.title),['First question','Second question','Third question']);
});

for(const name of ['albert-park','werribee','eureka','bendigo-west','southern-metropolitan']) {
  test('pinned seat response from frozen hub: '+name,async()=>{await pin(name,'/seat/'+name);});
}

test('Albert Park complete payload equals the API contract example',async()=>{
  const api=await payload('/seat/albert-park');
  // This pinned response is the complete example in the 12 November contract.
  const example=JSON.parse(await readFile(new URL('albert-park.json',fixtures),'utf8'));
  assert.deepEqual(api,example);
  assert.equal(api.updated,'2026-11-12');assert.equal(api.speech_updated,'2026-10-18');
  assert.deepEqual(api.members[0].speeches,{count:367,first:2023,last:2026,within_term:true});
  assert.deepEqual(api.members[0].votes,{count:15,ayes:12,noes:3});assert.equal(api.members[0].recent_votes.length,1);
  assert.equal(api.result.general.share,61.15);assert.equal(api.result.general.margin,11.15);
  assert.equal(api.result.general.share.toFixed(1),'61.1');assert.equal(api.result.general.margin.toFixed(1),'11.2');
});

test('seat variants retain subsequent contests, former names, created districts and unavailable records',async()=>{
  const w=await payload('/seat/werribee');assert.equal(w.result.since.kind,'by-election');
  assert.equal(w.result.since.date,'2025-02-08');assert.equal(contestName(w.result.since),'2025 by-election');
  const overview=await payload();assert.equal(overview.districts.find(s=>s.slug==='werribee').result.margin,w.result.since.margin);
  const r=await payload('/seat/southern-metropolitan');assert.equal(r.members.length,5);assert.equal(r.districts.length,11);
  assert.equal(r.result,null);assert.equal(r.region,null);
  assert.deepEqual(r.districts,r.districts.map(row=>overview.districts.find(x=>x.slug===row.slug)));
  assert.equal((await payload('/seat/eureka')).formerly,'Buninyong');assert.equal((await payload('/seat/ashwood')).created,true);
  const b=await payload('/seat/bendigo-west');assert.equal(b.members[0].speeches,null);assert.equal(b.members[0].votes,null);
  assert.equal(b.members[0].speech_gap,'No speech count for this member.');
});

test('injected candidates keep ballot order, normalise empty party to null, and supply publication date',async()=>{
  const d=candidateData();const api=await payload('/seat/albert-park',environment(d));
  assert.deepEqual(api.candidates.list,d.seats[0].candidates.list.map(c=>({...c,party:c.party||null})));
  const overview=await payload('',environment(d));assert.equal(overview.candidates_published,'2026-11-10');
  assert.equal(overview.districts[0].candidates,3);await pin('albert-park-candidates','/seat/albert-park',d);
});

test('frozen Council candidates retain ballot groups and normalise blank or absent group names to null',async()=>{
  const d=councilCandidateData(),api=await payload('/seat/northern-metropolitan',environment(d));
  assert.equal(api.schema_version,1);
  assert.deepEqual(api.candidates.list.map(c=>c.name),councilCandidates.list.map(c=>c.name));
  assert.deepEqual(api.candidates.list.map(c=>[c.group,c.group_name]),[
    ['A','Example Alliance'],['A','Example Alliance'],['B',null],['Z',null],[null,null],[null,null],
  ]);
  assert.equal(api.candidates.list[2].party,null);
  await pin('northern-metropolitan-candidates','/seat/northern-metropolitan',d);
  const district=candidateData();
  Object.assign(district.seats[0].candidates.list[0],{group:'A',group_name:'Example Alliance',private_field:'hidden'});
  const districtApi=await payload('/seat/albert-park',environment(district));
  assert.deepEqual(districtApi.candidates.list[0],{name:'Wren Halloway',party:null});
});

test('invalid Council group letters or names make the reader reject the asset',async()=>{
  for(const invalid of [{group:''},{group:'AA'},{group:'a'},{group:1},{group_name:1},{group_name:{}}]) {
    const d=councilCandidateData();
    Object.assign(d.seats.find(s=>slug(s)==='northern-metropolitan').candidates.list[0],invalid);
    const response=await get('/seat/northern-metropolitan',environment(d));
    assert.equal(response.status,503,JSON.stringify(invalid));
    assert.deepEqual(await response.json(),{error:'vic_election_unavailable'});
  }
});

test('unknown and invalid seat slugs answer JSON 404 without caching',async()=>{
  for(const path of ['/seat/unknown','/seat/Albert-Park','/seat/albert--park','/seat/albert_park','/seat/%61lbert-park','/seat/%','/seat/','/seat/albert-park/extra','/unknown',
    '/unknown?q=Bass','/seat/Albert-Park?extra=1','/seat/albert-park/extra?q=Bass']) {
    const r=await get(path);assert.equal(r.status,404,path);assert.deepEqual(await r.json(),{error:'not_found'});
    assert.equal(r.headers.get('cache-control'),'no-store');
  }
});

for(const [q,name] of [['3350','find-3350'],['St Kilda','find-st-kilda'],['Bass','find-bass'],['allan','find-allan'],['9999','find-9999']]) {
  test('find matches page kinds, order, seats and shares for '+q,async()=>{
    const api=await payload('/find?q='+encodeURIComponent(q));const found=findSeats(q,data,places);
    assert.equal(api.places_searched,true);assert.equal(api.q,q);assert.equal(api.split,found.some(h=>h.seats.length>1));
    assert.deepEqual(api.hits.map(h=>({name:h.name,kind:h.kind,seats:h.seats.map(s=>({slug:s.slug,share:s.share}))})),
      found.map(h=>({name:h.name,kind:h.kind,seats:h.seats.map(x=>({slug:slug(x.seat),share:h.seats.length>1?x.share:null}))})));
    const overview=await payload();
    for(const hit of api.hits)for(const {share,...row} of hit.seats)assert.deepEqual(row,[...overview.districts,...overview.regions].find(x=>x.slug===row.slug));
    assert.equal(api.empty,found.length?null:/^\d{4}$/.test(q)?'postcode':'place');
    assert.equal(api.attribution,places.attribution);assert.equal(api.note,places.note);await pin(name,'/find?q='+encodeURIComponent(q));
  });
}

test('find trims and truncates q to 60 characters, and distinguishes empty place results',async()=>{
  assert.equal((await payload('/find?q=%20%20Bass%20%20')).q,'Bass');
  const q='x'.repeat(80);const api=await payload('/find?q='+q);assert.equal(api.q,q.slice(0,60));
  const cut='x'.repeat(59)+' '+ 'following word';
  assert.equal((await payload('/find?q='+encodeURIComponent(cut))).q,'x'.repeat(59));
  assert.equal(api.empty,'place');assert.deepEqual(api.hits,[]);
  assert.ok((await payload('/find?q=Metropolitan')).hits.some(h=>h.kind==='Region'));
});

test('unavailable or malformed places retain seat/member search and declare that places were not searched',async()=>{
  for(const index of [new Error('missing places'),null,{}, {...places,postcode:[['9999',[[999,1000]],1]]},
    {...places,districts:places.districts.map((name,i)=>i===0?'Unknown district':name)}]) {
    for(const q of ['Bass','allan','3350']) {
      const api=await payload('/find?q='+q,environment(data,index));
      assert.equal(api.places_searched,false);assert.equal(api.attribution,'');assert.equal(api.note,'');
      assert.deepEqual(api.hits.map(h=>h.name),findSeats(q,data,null).map(h=>h.name));
    }
  }
});

test('query and method checks precede reads, and errors remain noindex and no-store',async()=>{
  for(const path of ['?q=x','?extra','/seat/albert-park?q=x','/find','/find?q=','/find?q=%20%20','/find?q=Bass&q=Bass','/find?q=Bass&extra=1','/find?x=Bass']) {
    const env=environment();const r=await get(path,env);assert.equal(r.status,400,path);
    assert.deepEqual(await r.json(),{error:'invalid_query'});assert.deepEqual(env.reads,[]);
    assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-robots-tag'),'noindex');
  }
  for(const path of ['', '/seat/albert-park','/find?q=3350','/find?extra=1'])for(const method of ['POST','PUT','DELETE','OPTIONS']) {
    const env=environment();const r=await get(path,env,{method});assert.equal(r.status,405);
    assert.equal(r.headers.get('allow'),'GET, HEAD');assert.deepEqual(await r.json(),{error:'method_not_allowed'});assert.deepEqual(env.reads,[]);
    assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-robots-tag'),'noindex');
  }
});

test('HTTP success, conditional GET and HEAD use shared cache, ETag and noindex headers on all three routes',async()=>{
  for(const path of ['', '/seat/albert-park','/find?q=3350']) {
    const r=await get(path);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),APP_CACHE);
    assert.equal(r.headers.get('content-type'),'application/json; charset=utf-8');assert.equal(r.headers.get('x-robots-tag'),'noindex');
    const etag=r.headers.get('etag');assert.match(etag,/^W\/"[a-f0-9]{64}"$/);
    for(const tag of [etag,etag.slice(2),'"unrelated", '+etag,'*']) {
      const cached=await get(path,environment(),{headers:{'if-none-match':tag}});assert.equal(cached.status,304);
      assert.equal(await cached.text(),'');assert.deepEqual([...cached.headers],[...r.headers]);
    }
    const head=await get(path,environment(),{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.deepEqual([...head.headers],[...r.headers]);
    assert.equal((await get(path,environment(),{headers:{'if-none-match':'"other"'}})).status,200);
    const routed=await worker.fetch(request(path),environment(),{});assert.equal(routed.status,200);assert.equal(routed.headers.get('etag'),etag);
  }
});

test('failed, non-JSON, or malformed election assets are retryable 503 on every route',async()=>{
  const malformed=[new Error('missing election'),null,{}, {...data,seats:[]}, {...data,updated:'bad'}, {...data,sources:{}},
    {...data,seats:data.seats.map((s,i)=>i===0?{...s,members:[]}:s)},
    {...data,seats:data.seats.map((s,i)=>i===0?{...s,result:{}}:s)}];
  for(const value of malformed)for(const path of ['', '/seat/albert-park','/find?q=Bass']) {
    const r=await get(path,environment(value));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'vic_election_unavailable'});
    assert.equal(r.headers.get('retry-after'),'60');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-robots-tag'),'noindex');
  }
  for(const response of [()=>new Response('not JSON'),()=>new Response('{}',{status:404})]) {
    const r=await get('',{VIC_ELECTION_HUB_ENABLED:'true',ASSETS:{fetch:async()=>response()}});assert.equal(r.status,503);
  }
  const head=await get('',environment(null),{method:'HEAD'});assert.equal(head.status,503);assert.equal(await head.text(),'');
});

test('optional notice is null at launch and admits only plain text and HTTPS links',async()=>{
  const notice={text:'See the VEC election page for published updates.',link:{label:'VEC election page',url:data.sources.election}};
  assert.deepEqual((await payload('',environment({...data,notice}))).notice,notice);
  assert.deepEqual((await payload('',environment({...data,notice:{text:notice.text,link:null}}))).notice,{text:notice.text,link:null});
  for(const bad of [{...notice,text:'x'.repeat(201)},{...notice,text:'<b>Update</b>'},{...notice,text:''},{...notice,link:{label:'bad',url:'http://example.com'}}]) {
    assert.equal((await get('',environment({...data,notice:bad}))).status,503);
  }
});

function changingEnvironment({conditional=true,etags=true}={}) {
  const files={[VIC_ELECTION_ASSET]:structuredClone(data),[VIC_ELECTION_PLACES]:structuredClone(places)};
  const versions={[VIC_ELECTION_ASSET]:0,[VIC_ELECTION_PLACES]:0},reads=[],parses=[];
  return {VIC_ELECTION_HUB_ENABLED:'true',files,reads,parses,
    replace(path,value){files[path]=value;versions[path]++;},
    ASSETS:{async fetch(req){
      const path=new URL(req.url).pathname;reads.push({path,tag:req.headers.get('if-none-match')});
      const value=files[path];if(value instanceof Error)throw value;
      const etag='"'+path+':'+versions[path]+'"',headers=etags?{etag}:{};
      if(conditional&&etags&&req.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
      const encoded=JSON.stringify(value),response=new Response(encoded,{headers});
      response.json=async()=>{parses.push(path);return JSON.parse(encoded);};
      return response;
    }}};
}

for(const conditional of [true,false]) {
  test('parsed assets survive '+(conditional?'conditional 304':'unchanged 200 ETag')+' responses and refresh when either asset changes',async()=>{
    const env=changingEnvironment({conditional});
    await payload('/find?q=St%20Kilda',env);await payload('',env);await payload('/seat/albert-park',env);await payload('/find?q=3350',env);
    assert.deepEqual(env.parses,[VIC_ELECTION_ASSET,VIC_ELECTION_PLACES]);
    assert.ok(env.reads.filter(r=>r.path===VIC_ELECTION_ASSET).slice(1).every(r=>r.tag));
    assert.ok(env.reads.filter(r=>r.path===VIC_ELECTION_PLACES).slice(1).every(r=>r.tag));
    const first=await get('',env),updated='2026-11-13';
    env.replace(VIC_ELECTION_ASSET,{...env.files[VIC_ELECTION_ASSET],updated});
    const next=await get('',env);assert.equal((await next.json()).updated,updated);assert.notEqual(first.headers.get('etag'),next.headers.get('etag'));
    await payload('/find?q=3350',env);
    assert.deepEqual(env.parses,[VIC_ELECTION_ASSET,VIC_ELECTION_PLACES,VIC_ELECTION_ASSET,VIC_ELECTION_PLACES]);
    env.replace(VIC_ELECTION_PLACES,{...env.files[VIC_ELECTION_PLACES],note:'Updated local places note.'});
    assert.equal((await payload('/find?q=3350',env)).note,'Updated local places note.');
    assert.equal(env.parses.at(-1),VIC_ELECTION_PLACES);
    const other=changingEnvironment();
    assert.equal((await payload('',other)).updated,data.updated);assert.deepEqual(other.parses,[VIC_ELECTION_ASSET]);
  });
}

for(const etags of [true,false]) {
  test('warm place searches reuse the fold cache '+(etags?'with ETags':'without ETags'),async()=>{
    const env=changingEnvironment({etags});
    const name=places.suburb.find(([name])=>!data.seats.some(s=>s.name===name||s.members.some(m=>m.name===name)))[0];
    const original=String.prototype.normalize;let folds=0;
    String.prototype.normalize=function(...args){if(String(this)===name)folds++;return original.apply(this,args);};
    try {
      await payload('/find?q=St%20Kilda',env);assert.equal(folds,1);
      await payload('/find?q=3350',env);await payload('/find?q=Bass',env);assert.equal(folds,1);
      env.replace(VIC_ELECTION_PLACES,{...env.files[VIC_ELECTION_PLACES],note:'Changed index.'});
      assert.equal((await payload('/find?q=St%20Kilda',env)).note,'Changed index.');assert.equal(folds,2);
      env.replace(VIC_ELECTION_ASSET,{...env.files[VIC_ELECTION_ASSET],updated:'2026-11-14'});
      assert.equal((await payload('',env)).updated,'2026-11-14');
    } finally {String.prototype.normalize=original;}
  });
}

test('concurrent reads share pending parses and failed asset reads are retried without stale success',async()=>{
  const env=changingEnvironment();
  await Promise.all([payload('',env),payload('/seat/albert-park',env),payload('/find?q=3350',env),payload('/find?q=Bass',env)]);
  assert.deepEqual(env.parses,[VIC_ELECTION_ASSET,VIC_ELECTION_PLACES]);
  assert.equal(env.reads.filter(r=>r.path===VIC_ELECTION_ASSET).length,1);
  const good=env.files[VIC_ELECTION_ASSET];
  env.replace(VIC_ELECTION_ASSET,new Error('local read failed'));
  assert.equal((await get('',env)).status,503);
  env.replace(VIC_ELECTION_ASSET,{...good,updated:'2026-11-15'});
  assert.equal((await payload('',env)).updated,'2026-11-15');
  env.replace(VIC_ELECTION_PLACES,new Error('places unavailable'));
  assert.equal((await payload('/find?q=Bass',env)).places_searched,false);
  env.replace(VIC_ELECTION_PLACES,places);
  assert.equal((await payload('/find?q=Bass',env)).places_searched,true);
});

test('shape pin covers every response and nested contract type; internal fields cannot leak',async()=>{
  const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),expected.split(' ').sort());
  const overview=await payload();
  keys(overview,'schema_version state title lede voting finder current_results web_url updated election_day polls_open polls_close term_start term_end key_dates notice candidates_published results_fetched roster_date districts regions sources about methods_url authorisation corrections');
  keys(overview.sources,'election voting enrolment address results licence');keys(overview.corrections,'email response');
  assert.deepEqual(overview.key_dates.map(r=>r.id),['enrolment','caretaker','nominations','postal','early','election_day']);
  for(const r of overview.key_dates){keys(r,'id label when passes_at passed_label passed_when link');if(r.link)keys(r.link,'label url');}
  const row=r=>{
    if(r.kind==='district') {
      keys(r,'kind slug name region electorate_url member result candidates');keys(r.member,'name party');if(r.result)keys(r.result,'date kind party margin');
    }else {keys(r,'kind slug name electorate_url members districts candidates');r.members.forEach(m=>keys(m,'name party'));}
  };
  [...overview.districts,...overview.regions].forEach(row);
  for(const s of data.seats) {
    const detail=await payload('/seat/'+slug(s));
    keys(detail,'schema_version state current_result updated kind slug name web_url source_url electorate_url roster_date formerly created boundary_note region districts result candidates members results_fetched speech_updated division_start division_end');
    detail.districts.forEach(row);
    if(detail.region){keys(detail.region,'slug name members');detail.region.members.forEach(m=>keys(m,'name party slug href'));}
    if(detail.result){keys(detail.result,'general since');for(const c of [detail.result.general,detail.result.since].filter(Boolean))keys(c,'date kind party share against against_share margin url');}
    for(const m of detail.members) {
      keys(m,'name party slug href source_url speeches speech_gap votes recent_votes');
      if(m.speeches)keys(m.speeches,'count first last within_term');if(m.votes)keys(m.votes,'count ayes noes');
      m.recent_votes.forEach(v=>keys(v,'date title href vote source_url'));
    }
  }
  const candidate=(await payload('/seat/albert-park',environment(candidateData()))).candidates;
  keys(candidate,'published url list');candidate.list.forEach(c=>keys(c,'name party'));
  const council=(await payload('/seat/northern-metropolitan',environment(councilCandidateData()))).candidates;
  keys(council,'published url list');council.list.forEach(c=>keys(c,'name party group group_name'));
  const notice=(await payload('',environment({...data,notice:{text:'Election update.',link:{label:'VEC',url:data.sources.election}}}))).notice;
  keys(notice,'text link');keys(notice.link,'label url');
  for(const q of ['3350','Bass','Metropolitan','allan']) {
    const find=await payload('/find?q='+q);keys(find,'schema_version state q places_searched hits split empty address_url attribution note');
    for(const h of find.hits){keys(h,'name kind seats');for(const {share,...s} of h.seats){row(s);assert.ok(share===null||typeof share==='number');}}
  }
  const injected=structuredClone(data);const seat=injected.seats[0];
  injected.private_field='not for the app';seat.result.general.private_field='not for the app';seat.members[0].votes.private_field='not for the app';
  assert.doesNotMatch(JSON.stringify(await payload('/seat/albert-park',environment(injected))),/private_field|detailed_count|interests_available/);
});

async function liveParity(election,index) {
  const env=environment(election,index),overview=await payload('',env);
  const frozen=JSON.parse(await readFile(new URL('overview.json',fixtures),'utf8'));
  assert.deepEqual(Object.keys(overview).sort(),Object.keys(frozen).sort());
  for(const key of ['updated','election_day','term_start','term_end','results_fetched','authorisation','corrections'])
    assert.deepEqual(overview[key],election[key],key);
  assert.deepEqual(overview.districts.map(s=>s.slug),election.seats.filter(s=>s.kind==='district').map(slug));
  assert.deepEqual(overview.regions.map(s=>s.slug),election.seats.filter(s=>s.kind==='region').map(slug));
  assert.equal(overview.candidates_published,election.seats.find(s=>s.candidates)?.candidates.published??null);
  const now=Date.now(),rendered=JSDOM.fragment(renderVicElection(election,null,{},new Date(now)).html);
  assert.equal(overview.title,rendered.querySelector('h1').textContent);
  assert.equal(overview.about,rendered.querySelector('.vic-about').textContent.replace('About this data: ','').replace(' How this page is built','').replace(/^d/,'D'));
  const dates=[...rendered.querySelectorAll('.vic-dates > div')];
  overview.key_dates.forEach((r,i)=>{
    const passed=r.passes_at!==null&&now>=Date.parse(r.passes_at);
    assert.equal(dates[i].querySelector('dt').textContent,passed?r.passed_label??r.label:r.label);
    assert.equal(dates[i].querySelector('dd').firstChild.textContent,passed?r.passed_when??r.when:r.when);
  });
  for(const seat of election.seats) {
    const detail=await payload('/seat/'+slug(seat),env);
    const pinned=JSON.parse(await readFile(new URL(seat.kind==='district'?'albert-park.json':'southern-metropolitan.json',fixtures),'utf8'));
    assert.deepEqual(Object.keys(detail).sort(),Object.keys(pinned).sort());
    for(const key of ['kind','name','source_url','electorate_url','roster_date','formerly','created','boundary_note','result'])
      assert.deepEqual(detail[key],seat[key],seat.name+': '+key);
    assert.deepEqual(detail.members.map(m=>m.name),seat.members.map(m=>m.name));
    for(const [i,m] of seat.members.entries()) {
      for(const key of ['party','href','source_url','speeches','speech_gap','votes'])assert.deepEqual(detail.members[i][key],m[key]);
      assert.deepEqual(detail.members[i].recent_votes,titledVotes(m));
    }
    assert.deepEqual(detail.candidates,seat.candidates?{
      published:seat.candidates.published,url:seat.candidates.url,
      list:seat.candidates.list.map(c=>({name:c.name,party:c.party||null,
        ...seat.kind==='region'?{group:c.group??null,group_name:c.group_name?.trim()||null}:{}})),
    }:null);
    const row=[...overview.districts,...overview.regions].find(s=>s.slug===detail.slug);
    assert.equal(row.candidates,seat.candidates?.list.length??0);
    if(seat.kind==='district') {
      const page=JSDOM.fragment(renderVicElection(election,seat).html);
      assert.deepEqual(detail.members[0].recent_votes.map(v=>v.title),[...page.querySelectorAll('.vic-votes a')].map(a=>a.textContent));
    } else assert.deepEqual(detail.districts.map(s=>s.name),seat.districts);
  }
  for(const q of ['3350','St Kilda','Bass','allan','9999']) {
    const api=await payload('/find?q='+encodeURIComponent(q),env),hits=findSeats(q,election,index);
    const hitShape=h=>({name:h.name,kind:h.kind,seats:h.seats.map(s=>({slug:s.slug,share:s.share}))});
    assert.deepEqual(api.hits.map(hitShape),hits.map(h=>({name:h.name,kind:h.kind,seats:h.seats.map(x=>({slug:slug(x.seat),share:h.seats.length>1?x.share:null}))})));
    assert.equal(api.split,hits.some(h=>h.seats.length>1));
    assert.deepEqual(Object.keys(api).sort(),Object.keys(JSON.parse(await readFile(new URL('find-3350.json',fixtures),'utf8'))).sort());
  }
}

test('current built hub and finder retain contract shape and page parity without snapshot values',async()=>{
  await liveParity(liveData,livePlaces);
});

test('a scratch nightly build with changed date, speech and vote counts preserves live parity and every frozen pin',async()=>{
  await withVicElectionBuild(async({root,configPath})=>{
    const corpusPath=join(root,'corpus.json'),corpus=JSON.parse(await readFile(corpusPath,'utf8'));
    const next=new Date(Date.parse(liveData.updated+'T00:00:00Z')+24*60*60*1000).toISOString().slice(0,10);
    corpus.version=next;await writeFile(corpusPath,JSON.stringify(corpus));
    const beforeSeat=liveData.seats.find(s=>s.members.some(m=>m.speeches&&m.votes));
    assert.ok(beforeSeat,'a current member has both speech and vote coverage');
    const before=beforeSeat.members.find(m=>m.speeches&&m.votes),house=beforeSeat.kind==='district'?'vic_la':'vic_lc';
    const rosterPath=join(root,'parliamentarians.json'),roster=JSON.parse(await readFile(rosterPath,'utf8'));
    const person=roster.people.find(p=>personNameKey(p.name)===personNameKey(before.name));
    assert.equal(person.speeches,before.speeches.count);
    person.speeches++;await writeFile(rosterPath,JSON.stringify(roster));
    const votesPath=join(root,'votes.json'),votes=JSON.parse(await readFile(votesPath,'utf8'));
    const rows=Object.values(votes).filter(v=>v.jurisdiction==='vic'&&v.house===house&&personNameKey(v.name)===personNameKey(before.name));
    assert.equal(rows.length,1);assert.equal(rows[0].divisions_total,before.votes.count);
    rows[0].divisions_total++;rows[0].ayes++;await writeFile(votesPath,JSON.stringify(votes));
    await buildVicElection(root,configPath);
    const rebuilt=JSON.parse(await readFile(join(root,VIC_ELECTION_ASSET),'utf8'));
    const rebuiltPlaces=JSON.parse(await readFile(join(root,VIC_ELECTION_PLACES),'utf8'));
    assert.equal(rebuilt.updated,next);assert.notEqual(rebuilt.updated,data.updated);
    const after=rebuilt.seats.flatMap(s=>s.members).find(m=>m.href===before.href);
    assert.equal(after.speeches.count,before.speeches.count+1);
    assert.equal(after.votes.count,before.votes.count+1);assert.equal(after.votes.ayes,before.votes.ayes+1);
    assert.ok(rebuilt.seats.some(s=>s.kind==='region'&&s.candidates?.list.some(c=>c.group)),
      'the scratch build consumes the committed Council candidates and groups');
    await liveParity(rebuilt,rebuiltPlaces);
    await pin('overview','');
    for(const name of ['albert-park','werribee','eureka','bendigo-west','southern-metropolitan'])await pin(name,'/seat/'+name);
    for(const q of ['3350','st kilda','bass','allan','9999'])await pin('find-'+q.replaceAll(' ','-'),'/find?q='+encodeURIComponent(q==='st kilda'?'St Kilda':q==='bass'?'Bass':q));
    await pin('albert-park-candidates','/seat/albert-park',candidateData());
    await pin('northern-metropolitan-candidates','/seat/northern-metropolitan',councilCandidateData());
  });
});
