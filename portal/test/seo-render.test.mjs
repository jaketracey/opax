import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {renderBillAnswer,renderPersonAnswer,partyLine,escapeHtml,safeHref,internalLinkCount,associationCaveat,crumbsHTML,answerBlock} from '../src/seo-content.ts';
const pub=new URL('../public/',import.meta.url);
const parsedAssets=new Map();
const read=async path=>{if(!parsedAssets.has(path)) parsedAssets.set(path,JSON.parse(readFileSync(new URL(path.slice(1),pub),'utf8')));return parsedAssets.get(path);};
// Exercise the real Worker dispatch/render/meta code with disk-backed ASSETS.
// A minimal HTMLRewriter adapter supplies only the platform transformations it uses.
class Rewriter {
  handlers=[];
  on(selector,handler){this.handlers.push([selector,handler]);return this;}
  transform(response){const handlers=this.handlers;return new Response(new ReadableStream({async start(controller){
    let html=await response.text();
    for(const [selector,handler] of handlers){
      const mutate=(outer,open,inner,close)=>{let attr=open,body=inner,removed=false;const el={setAttribute(name,value){const re=new RegExp(` ${name}="[^"]*"`);const next=` ${name}="${escapeHtml(value)}"`;attr=re.test(attr)?attr.replace(re,next):attr.replace(/>$/,next+'>');},setInnerContent(value,opts){body=opts?.html?value:escapeHtml(value);},append(value){body+=value;},remove(){removed=true;}};handler.element(el);return removed?'':attr+body+close;};
      if(selector==='main#main')html=html.replace(/(<main\b[^>]*>)([\s\S]*?)(<\/main>)/,mutate);
      else if(selector==='div#crawl-facts')html=html.replace(/(<div\b[^>]*id="crawl-facts"[^>]*>)([\s\S]*?)(<\/div>)/,mutate);
      else if(selector==='title')html=html.replace(/(<title>)([\s\S]*?)(<\/title>)/,mutate);
      else if(selector==='head')html=html.replace(/(<head>)([\s\S]*?)(<\/head>)/,mutate);
      else if(selector==='script#ld-page')html=html.replace(/(<script\b[^>]*id="ld-page"[^>]*>)([\s\S]*?)(<\/script>)/,mutate);
      else{const match=/^(meta|link)\[(name|property|rel)="([^"]+)"\]$/.exec(selector);if(match)html=html.replace(new RegExp(`<${match[1]}\\b[^>]*${match[2]}="${match[3]}"[^>]*>`,'g'),outer=>mutate(outer,outer,'',''));}
    }
    controller.enqueue(new TextEncoder().encode(html));controller.close();
  }}),response);}
}
const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-images',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'seo-test'}));b.onLoad({filter:/.*/,namespace:'seo-test'},()=>({contents:'export const renderOgPng=()=>{};export const renderOgJpeg=()=>{};',loader:'js'}));}}]});
globalThis.HTMLRewriter=Rewriter;
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const origin='https://opax.com.au';
const env={COMMUNITY_ORIGIN:origin,ASSETS:{async fetch(req){const path=new URL(req.url).pathname;const file=new URL(path==='/'?'index.html':path==='/home'?'home.html':path==='/community'?'community.html':path.slice(1),pub);if(!existsSync(file)) return new Response('Missing',{status:404}); const response=new Response(readFileSync(file),{headers:{'content-type':path.endsWith('.json')?'application/json':'text/html'}}); if(path.endsWith('.json')) response.json=()=>read(path); return response;}}};
async function get(path){const r=await worker.fetch(new Request(origin+path),env,{waitUntil(){}});assert.equal(r.status,200,path);return r.text();}
function checkHtml(html){assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.doesNotMatch(html,/id="panel-ask"|id="panel-privacy"|Ask &amp; search the record/);const graph=JSON.parse(html.match(/<script[^>]*id="ld-page"[^>]*>(.*?)<\/script>/s)[1]);assert.ok(graph['@graph'].some(n=>n['@type']==='BreadcrumbList'));return graph['@graph'];}
test('raw MP answer includes exported bill votes without unsupported recent-vote claims',async()=>{
  const html=await get('/subject/person/david-pocock');const graph=checkHtml(html);
  for(const fact of ['David Pocock','Independent','Senate','Latest exported bill votes','Declared interests','View original'])assert.ok(html.includes(fact),fact);
  assert.match(html,/href="\/subject\/party\/independent"/);assert.match(html,/href="\/subject\/electorate\//);
  assert.doesNotMatch(html,/Last 10 recorded votes|No per-member votes|not a complete list of recent divisions/);
  const record=(await read('/votes.json'))['11009'];const votes=[...record.for,...record.against].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);for(const vote of votes)assert.ok(html.includes(escapeHtml(vote.name)),vote.name);
  for(const path of ['/graph/money.json','/graph/money.qld.json','/graph/money.vic.json'])for(const n of (await read(path)).nodes.filter(n=>n.kind==='donor'&&!isOrganisationDonor(n)))assert.ok(!html.includes(escapeHtml(n.label)),n.label);
  const person=graph.find(n=>n['@type']==='Person');assert.ok(person.image);assert.ok(person.sameAs.some(url=>url.startsWith('https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=')));
  const labor=await get('/subject/person/anthony-albanese');assert.ok(labor.includes('donors in this export are not named here'));
});
test('mobile voting asset retains schema 1 and the shipped per-person keys',async()=>{
  const data=await read('/votes.json');assert.equal(data._meta.schema,1);
  assert.deepEqual(Object.keys(data._meta).sort(),['content_changed_at','latest_division_date','latest_division_date_by_jurisdiction','schema']);
  const allowed=new Set(['name','party','jurisdiction','house','ayes','noes','divisions_total','years','for','against']);
  for(const [key,person] of Object.entries(data))if(!key.startsWith('_')){assert.ok(person.name);assert.ok(Object.keys(person).every(field=>allowed.has(field)),key);assert.ok(Array.isArray(person.for));assert.ok(Array.isArray(person.against));}
});
test('recent-vote answers only use the separate OPAX export and omit an empty vote block',async()=>{
  const p={name:'Example Member',pid:'123',party:'Independent',chambers:['senate'],current:true};
  const rows=Array.from({length:10},(_,i)=>({title:`Recorded question ${i}`,date:'2026-09-01',vote:'aye',division_slug:`division-example-${i}`,source_url:`https://example.test/${i}`}));
  const assets={'/votes.json':{_names:{},'123':{name:p.name,recent:rows,for:[],against:[]}},'/seo/recent-votes.json':{_meta:{schema:1,source:'opax-parli-db',coverage:'recorded'},people:{'123':{name:p.name,recent:rows}}}};
  const readFixture=async path=>{if(path in assets)return assets[path];throw Error('Missing');};
  assert.match((await renderPersonAnswer(p,readFixture,new Map())).html,/Last 10 recorded votes/);
  assets['/seo/recent-votes.json']._meta.source='manual-tvfy-sample';
  const empty=(await renderPersonAnswer(p,readFixture,new Map())).html;
  assert.doesNotMatch(empty,/Last 10 recorded votes|Latest exported bill votes|No per-member votes|Recorded question/);
});
test('raw bill includes summary attribution, stages, sponsor/portfolio, divisions and source links',async()=>{
  const html=await get('/bill/au-federal-r7534');const graph=checkHtml(html);
  const bill=await read('/bills/au-federal-r7534.json');assert.ok(html.includes(escapeHtml(bill.portfolio)));assert.ok(html.includes(escapeHtml(bill.summary.attribution)));assert.ok(html.includes(escapeHtml(bill.summary.sentences[0])));assert.ok(html.includes('ayes 11, noes 24'));assert.match(html,/href="\/doc\/division-federal-senate-10701"/);assert.ok(graph.some(n=>n['@type']==='Legislation'&&n.legislationIdentifier===bill.key&&n.creativeWorkStatus));
  const sponsored=await get('/bill/au-federal-s1517');assert.match(sponsored,/href="\/subject\/person\/david-pocock"/);
});
test('raw division names and links every recorded member, with question/date/tally/bills',async()=>{
  const html=await get('/doc/division-federal-senate-10701');checkHtml(html);const d=await read('/divisions/division-federal-senate-10701.json');for(const m of d.members)assert.ok(html.includes(escapeHtml(m.name)),m.name);assert.ok(html.includes('ayes 11, noes 24'));assert.match(html,/href="\/bill\/au-federal-r7534"/);assert.match(html,/href="\/subject\/person\/david-pocock"/);assert.ok(html.includes(escapeHtml(d.question)));
  const response=await worker.fetch(new Request(origin+'/api/resource/division-federal-senate-10701'),env,{});const app=await response.json();assert.equal(app.metadata.ayes.length,11);assert.equal(app.metadata.noes.length,24);
});
test('directories expose bounded links and canonical pagination with rel prev/next',async()=>{
  for(const path of ['/subject/person','/subject/party','/subject/electorate','/subject/topic','/bills?page=2','/money/grants?page=2']){const html=await get(path);checkHtml(html);const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];assert.ok((main.match(/<li>/g)||[]).length<=50);assert.match(main,/href="\/(subject|bill|money\/grants)\//);if(path.includes('page=2')){assert.match(html,/<link rel="prev"/);assert.match(html,/<link rel="next"/);}}
  const first=await get('/bills');const second=await get('/bills?page=2');const rows=(await read('/bills/index.json')).bills;assert.ok(first.includes(`/bill/${rows[0].key}`));assert.ok(!second.includes(`/bill/${rows[0].key}`));assert.ok(second.includes(`/bill/${rows[50].key}`));const last=await get('/bills?page=999999');assert.match(last,/rel="canonical" href="https:\/\/opax.com.au\/bills\?page=60"/);
});
test('homepage schema includes website, search, organisation and breadcrumb; stats is a dataset',async()=>{
  const html=await get('/');const graph=JSON.parse(html.match(/<script[^>]*id="ld-page"[^>]*>(.*?)<\/script>/s)[1])['@graph'];for(const type of ['WebSite','Organization','BreadcrumbList'])assert.ok(graph.some(n=>n['@type']===type));assert.equal(graph.find(n=>n['@type']==='WebSite').potentialAction.target,origin+'/ask?view=search&q={search_term_string}');assert.ok(checkHtml(await get('/stats')).some(n=>n['@type']==='Dataset'));
});
test('source markup, malicious URLs and tally fields stay escaped; tri-state affiliation is explicit',()=>{
  assert.equal(partyLine({party:'Labor',current:false}),'Formerly Labor');assert.equal(partyLine({party:'Labor',current:undefined}),'Labor (recorded affiliation)');assert.equal(partyLine({party:'Labor',party_now:'Independent',current:true}),'Independent; formerly Labor');assert.equal(safeHref('javascript:alert(1)'),null);
  const html=renderBillAnswer({title:'<img src=x onerror=bad>',key:'x',divisions:[{key:'x',ayes:'<script>bad</script>',noes:0,url:'javascript:alert(1)'}],summary:{sentences:['</script><script>bad</script>']}},[],new Map()).html;assert.doesNotMatch(html,/<script>|<img|javascript:/);assert.match(html,/&lt;script&gt;/);
});
test('sample HTML stays bounded and boot assets preserve the original app panel IDs',async()=>{
  for(const path of ['/subject/person/david-pocock','/bill/au-federal-r7534','/doc/division-federal-senate-10701'])assert.ok(Buffer.byteLength(await get(path))<1_000_000,path);
  const generated=readFileSync(new URL('spa-shell.js',pub),'utf8');assert.ok(generated.includes('panel-subject'));assert.ok(generated.includes('main.prepend(answer)'));assert.ok(readFileSync(new URL('index.html',pub),'utf8').indexOf('/spa-shell.js')<readFileSync(new URL('index.html',pub),'utf8').indexOf('/app.js'));
});

// The nightly exports division JSON; the Worker must format its question as
// well as the same record embedded in a bill's crawlable answer.
test('reported TVFY bill and division routes render Markdown blocks from local exports',async()=>{
  for(const path of ['/bill/au-federal-s1488','/doc/division-federal-senate-10178']) {
    const html=await get(path);checkHtml(html);
    const answer=html.match(/<section id="prerender"[\s\S]*?<\/section>/)[0];
    assert.doesNotMatch(answer,/###|&gt; /);
    assert.match(answer,/<strong>What is the bill&#39;s main idea\?<\/strong>/);
    assert.match(answer,/<blockquote><p><em>Amends the Criminal Code Act 1995/);
    assert.match(answer,/href="https:\/\/www.openaustralia.org.au\/senate/);
  }
});

test('built SSR pages for every route type expose one canonical, factual content and canonical entity URLs',async()=>{
  const seats=await read((await read('/electorates/manifest.json')).index_url);
  const recipient=(await read('/graph/grants.federal.json')).recipients.find(r=>r.k==='company');
  const supplier=(await read('/suppliers.json')).suppliers[0];
  const agency=(await read('/agencies.json')).agencies[0];
  const campaigner=(await read('/graph/campaigners.json')).entities[0];
  const report=(await read('/reports/index.json')).reports[0];
  const instrument=Object.keys((await read('/instruments/manifest.json')).lookup)[0];
  const paths=['/','/ask','/ask?q=example','/ask?view=search&q=example','/money','/money?journey=minerals','/money/receipts','/money/receipts?jur=qld','/declared?party=Labor','/connections?entity=example','/money/grants','/money/grants?jur=federal&program=GO3141','/bills','/connections','/explore','/discover','/about','/methods','/stats','/declared','/expenses','/privacy','/support','/reports',`/reports/${report.slug}`,'/subject/topic','/subject/topic/housing',...['person','party','electorate','donor','supplier','agency','campaigner'].map(k=>`/subject/${k}`),'/subject/person/bruce-baird','/subject/party/labor',seats.electorates[0].url,`/subject/supplier/${supplier.id}`,`/subject/agency/${agency.id}`,`/subject/campaigner/${encodeURIComponent(campaigner.name)}`,'/subject/donor/Clubs%20NSW','/bill/au-federal-r7537','/bill/au-federal-r7534','/doc/division-federal-representatives-10266',`/money/grants/federal/recipient/${encodeURIComponent(recipient.id)}`,'/instruments',`/instrument/${instrument}`,'/map','/community'];
  for(const path of paths) {
    const html=await get(path);
    assert.equal((html.match(/<link\b[^>]*rel="canonical"/g)||[]).length,1,path);
    assert.doesNotMatch(html,/www\.opax\.com\.au|(?:Loading(?:\s|&|…|\.)|Opening (?:the|a) |could not load|script error|ReferenceError|TypeError|SyntaxError)/i,path);
    assert.doesNotMatch(html,/href="(?:https:\/\/opax\.com\.au)?\/(?:search|home)(?:[?"#])/i,path);
    const text=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'').replace(/<[^>]+>/g,' ').trim();
    assert.ok(text.length>100,path);
    assert.doesNotMatch(text,/linked to/i,path);
    for(const match of html.matchAll(/(?:href|content)="((?:https?:\/\/(?:www\.)?opax\.com\.au)?\/subject\/(person|party)\/[^"?#]+)[^"]*"/g)) {
      const slug=match[1].split('/').at(-1);
      assert.match(slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/,path+' '+match[1]);
    }
    for(const match of html.matchAll(/https?:\/\/(?:www\.)?opax\.com\.au\/subject\/(?:person|party)\/([^"?#\\<]+)/g)) assert.match(match[1],/^[a-z0-9]+(?:-[a-z0-9]+)*$/,path);
    const canonical=html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)[1];
    assert.ok(canonical.startsWith(origin+'/'),path);
    if(['/money?journey=minerals','/ask?q=example','/ask?view=search&q=example','/money/receipts?jur=qld','/declared?party=Labor','/connections?entity=example'].includes(path)) assert.equal(canonical,origin+path.split('?')[0]);
  }
});

test('page aliases, including combined www/path aliases, redirect once to an exported 200 page',async()=>{
  const seats=(await read((await read('/electorates/manifest.json')).index_url)).electorates;
  const seat=seats.find(e=>seats.filter(s=>s.name===e.name).length===1);
  const cases=[
    ['/subject/person/Bruce%20Baird','/subject/person/bruce-baird'],
    ['/subject/person/Jess%20Pugh','/subject/person/pugh'],['/subject/person/Scott%20Stewart','/subject/person/stewart'],['/subject/person/Zo%C3%AB%20Daniel','/subject/person/zoe-daniel'],
    ['/subject/person/jess-pugh','/subject/person/pugh'],['/subject/person/scott-stewart','/subject/person/stewart'],
    ['/subject/person/BRUCE-BAIRD/','/subject/person/bruce-baird'],
    ['/person/Bruce%20Baird','/subject/person/bruce-baird'],
    ['/subject/mp/Bruce%20Baird','/subject/person/bruce-baird'],
    ['/subject/people/Bruce%20Baird','/subject/person/bruce-baird'],
    ['/subject/party/Labor/','/subject/party/labor'],
    ['/party/Labor','/subject/party/labor'],
    [`/subject/electorate/${seat.electorate_id}`,seat.url],
    [`/subject/electorate/${encodeURIComponent(seat.name)}`,seat.url],
    ['/bill/AU-FEDERAL-R7537/','/bill/au-federal-r7537'],
    ['/division/federal-representatives-10266','/doc/division-federal-representatives-10266'],
    ['/division/division-federal-representatives-10266/','/doc/division-federal-representatives-10266'],
    ['/doc/federal-representatives-10266','/doc/division-federal-representatives-10266'],
    ['/money/','/money'],['/map/','/map'],['/community/','/community'],['/map.html','/map'],['/connections.html','/connections'],['/community.html','/community'],
    ...(await read('/hubs/index.json')).pages.map(p=>[p.path+'/',p.path]),
  ];
  for(const [path,target] of cases) for(const host of ['opax.com.au','www.opax.com.au']) for(const method of ['GET','HEAD']) {
    const response=await worker.fetch(new Request(`https://${host}${path}`,{method}),env,{waitUntil(){}});
    assert.equal(response.status,host.startsWith('www.') && !/^\/(sitting|estimates)(\/|$)/.test(target)?308:301,path);
    assert.equal(response.headers.get('location'),origin+target,path);
    const landed=await worker.fetch(new Request(response.headers.get('location'),{method}),env,{waitUntil(){}});
    assert.equal(landed.status,200,path);
    if(method==='GET') assert.ok((await landed.text()).includes(`rel="canonical" href="${origin+target}"`),path);
  }
  for(const path of ['/bill/AU-FEDERAL-NONEXISTENT','/division/federal-representatives-99999999','/subject/person/null','/sitting/2026-10-13/','/estimates/unknown/']) {
    const r=await worker.fetch(new Request(origin+path),env,{waitUntil(){}});
    assert.equal(r.status,404,path);assert.equal(r.headers.get('location'),null,path);
  }
});

test('bill SSR renders all exported members, dated party votes and related bills',async()=>{
  const html=await get('/bill/au-federal-r7534');
  const division=await read('/divisions/division-federal-senate-10701.json');
  for(const m of division.members) assert.ok(html.includes(escapeHtml(m.name)),m.name);
  assert.match(html,/How each party voted/);
  const bill=await get('/bill/au-federal-r7537');
  for(const fact of ['Andrew Gee','Independent Members','Introduced','Second reading','Written by a model','2026-09-07','Other bills from this sponsor']) assert.ok(bill.includes(fact),fact);
  assert.match(bill,/href="\/subject\/person\/andrew-gee"/);
  assert.match(bill,/href="\/bill\/au-federal-r7450"/);
  assert.doesNotMatch(await get('/subject/person/bruce-baird'),/Died \d/);
});

test('supplier SSR carries agency facts, contract references and related suppliers without individual donor links',async()=>{
  const html=await get('/subject/supplier/s-f93824d9abc756c8f32f');
  for(const fact of ['Department of Foreign Affairs and Trade','CN4248039','2026-02-24','112,216','Other suppliers to these agencies','An association does not prove influence']) assert.ok(html.includes(fact),fact);
  assert.match(html,/tenders\.gov\.au\/Search\/KeywordSearch\?keyword=CN4248039/);
  const answer=html.match(/<section id="prerender"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(answer,/linked to|href="\/subject\/donor\//i);
});

test('all exported bill bodies render safely within the member, byte and link budgets',async t=>{
  const {personIndex}=await import('../src/person-slug.ts');
  const roster=await read('/parliamentarians.json');const people=roster.people;
  const identity=personIndex(people);
  const index=await read('/bills/index.json');
  const summaries=new Map((await read('/divisions/index.json')).divisions.map(d=>[d.key,d]));
  let worstBytes={bytes:0},worstLinks={links:0};
  const emitted=new Set();let checked=0;
  for(const file of readdirSync(new URL('bills/',pub)).filter(f=>f.endsWith('.json')&&f!=='index.json')) {
    const b=await read('/bills/'+file);
    const recent=new Set([...(b.divisions || [])].sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,3).map(d=>d.key));
    const divisions=await Promise.all((b.divisions || []).map(async d=>({...d,...summaries.get(d.key),...(recent.has(d.key)?await read(`/divisions/division-${d.key.replace(/^division-/, '')}.json`).catch(()=>null):{})})));
    let html;assert.doesNotThrow(()=>{html=renderBillAnswer({...b,divisions},people,identity.slugOf,index.bills).html;},b.key);
    assert.doesNotMatch(html,/record exceeds the page display limit/,b.key);
    const bytes=Buffer.byteLength(html),links=internalLinkCount(html),words=html.replace(/<[^>]*>/g,' ').trim().split(/\s+/).length;
    assert.ok(bytes<=80000,`${b.key}: ${bytes} bytes`);assert.ok(links<=300,`${b.key}: ${links} links`);
    assert.ok((html.match(/data-full-members=/g)||[]).length<=3,b.key);
    for(const m of html.matchAll(/href="(\/subject\/person[^"?#]*)/g)) emitted.add(m[1]);
    if(bytes>worstBytes.bytes)worstBytes={key:b.key,bytes,links,words};
    if(links>worstLinks.links)worstLinks={key:b.key,bytes,links,words};
    checked++;
  }
  assert.equal(checked,index.bills.length);
  // URLs from SSR vote lists join those from every browser name/alias below.
  globalThis.billPersonUrls=emitted;
  t.diagnostic(JSON.stringify({checked,worstBytes,worstLinks}));
  for(const key of new Set([worstBytes.key,worstLinks.key,'au-federal-r5626'])) {
    const html=await get('/bill/'+key);assert.ok(Buffer.byteLength(html)<=120000,`${key}: whole page ${Buffer.byteLength(html)} bytes`);assert.ok(internalLinkCount(html)<=300,key);
  }
});

test('every emitted person URL resolves directly with its matching canonical, including reviewed aliases and accents',async t=>{
  const {personUrl}=await import('../public/canonical-urls.js');
  const {PERSON_PATHS}=await import('../public/person-paths.js');
  assert.equal(personUrl('Jess Pugh'),'/subject/person/pugh');
  assert.equal(personUrl('Scott Stewart'),'/subject/person/stewart');
  assert.equal(personUrl('Zoë Daniel'),'/subject/person/zoe-daniel');
  assert.equal(personUrl('Unverified Display Name'),'/subject/person');
  const manifest=await read('/search-catalog/manifest.json');
  const catalogNames=readdirSync(new URL(`search-catalog/${manifest.version}/`,pub)).filter(f=>f.startsWith('records-'));
  const catalogPaths=(await Promise.all(catalogNames.map(f=>read(`/search-catalog/${manifest.version}/${f}`)))).flat().filter(r=>r.href?.startsWith('/subject/person')).map(r=>new URL(r.href,origin).pathname);
  const paths=new Set([...catalogPaths,...Object.values(PERSON_PATHS.exact),...Object.values(PERSON_PATHS.folded),...(globalThis.billPersonUrls || []),'/subject/person']);
  for(const path of paths){const html=await get(path);assert.equal(html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)[1],origin+path,path);}
  t.diagnostic(`${paths.size} emitted person paths resolve without a redirect`);
});

test('exposure draft and sponsor full-name bodies return 200 with direct aliases',async()=>{
  const key='au-federal-ed-online-safety-digital-duty-of-care-2026';
  assert.match(await get('/bill/'+key),/Chamber not recorded/);
  const redirect=await worker.fetch(new Request(origin+'/bill/'+key.toUpperCase()),env,{});
  assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),origin+'/bill/'+key);
  assert.match(await get('/bill/au-federal-s1479'),/href="\/subject\/person\/mehreen-faruqi">Mehreen Faruqi<\/a>/);
});

test('discovery endpoints redirect www once with 301 and serve apex directly',async()=>{
  for(const path of ['/sitemap.xml','/sitemaps/bills-1.xml','/robots.txt','/llms.txt']) for(const method of ['GET','HEAD']) {
    const redirect=await worker.fetch(new Request('https://www.opax.com.au'+path,{method}),env,{});
    assert.equal(redirect.status,301,path);assert.equal(redirect.headers.get('location'),origin+path);
    const apex=await worker.fetch(new Request(origin+path,{method}),env,{});assert.equal(apex.status,200,path);assert.equal(apex.headers.get('location'),null,path);
  }
});

test('noindex 404 bodies emit no canonical or page identity, including unknown reports/topics',async()=>{
  const paths=['/reports/not-a-published-report','/subject/topic/not-a-published-topic','/subject/supplier/not-a-supplier','/subject/agency/not-an-agency','/subject/campaigner/not-a-campaigner','/bill/au-federal-nonexistent','/doc/division-federal-senate-99999999','/instrument/C9999L99999'];
  for(const path of paths){const response=await worker.fetch(new Request(origin+path),env,{});assert.equal(response.status,404,path);assert.equal(response.headers.get('x-robots-tag'),'noindex',path);const html=await response.text();assert.doesNotMatch(html,/<link\b[^>]*rel="canonical"|<script[^>]*id="ld-page"/,path);}
});

test('all SSR body types use factual relationship wording and pair political money with the caveat',async()=>{
  const samples=['/subject/party/labor','/subject/person/anthony-albanese','/subject/donor/Clubs%20NSW','/subject/supplier/s-f93824d9abc756c8f32f','/money','/connections','/explore'];
  const campaigners=(await read('/graph/campaigners.json')).entities;
  for(const c of campaigners){const html=await get('/subject/campaigner/'+encodeURIComponent(c.name));const body=html.match(/<section id="prerender"[\s\S]*?<\/section>/)[0];assert.doesNotMatch(body,/linked to/i,c.name);assert.equal(associationCaveat(body,body),body,c.name);}
  for(const path of samples){const body=(await get(path)).match(/<section id="prerender"[\s\S]*?<\/section>/)[0];assert.doesNotMatch(body,/linked to/i,path);assert.match(body,/An association does not prove influence\./,path);}
});

test('association caveat requires a rendered money pairing, not an election coverage gap',async()=>{
  const election=await read('/hubs/vic-election-2026.json');
  for(const {path} of election.pages){
    const r=await worker.fetch(new Request(origin+path),{...env,VIC_ELECTION_HUB_ENABLED:'true'},{});
    assert.equal(r.status,200,path);const html=await r.text();
    assert.match(html,/<h2>Grants by state electorate<\/h2><p>Not available\./,path);
    assert.doesNotMatch(html,/An association does not prove influence/,path);
  }
  const person=await get('/subject/person/anthony-albanese');
  const body=person.match(/<section id="prerender"[\s\S]*?<\/section>/)[0];
  assert.match(body,/<h1>Anthony Albanese<\/h1>/);
  assert.match(body,/<h2>Donors to their party<\/h2>[\s\S]*An association does not prove influence\.[\s\S]*\$[\d,]+/);
});

test('server-only pages write the app breadcrumb strip, hidden once the app boots',()=>{
  assert.equal(crumbsHTML([]),'');
  const html=crumbsHTML([{label:'Audit reports',href:'/audit'},{label:'Report <16>'}]);
  assert.match(html,/^<nav class="crumbs prerender-crumbs" aria-label="Breadcrumb"><ol class="wrap crumbs-list">/);
  assert.match(html,/<li><a class="crumb-label" href="\/">Home<\/a><\/li>/);
  assert.match(html,/<a class="crumb-label" href="\/audit">Audit reports<\/a>/);
  assert.match(html,/<li class="crumb-here" aria-current="page"><svg class="crumb-sep"[^>]*>.*<\/svg><span class="crumb-label">Report &lt;16&gt;<\/span><\/li><\/ol><\/nav>$/);
  assert.equal((html.match(/crumb-sep/g)||[]).length,2);
  assert.doesNotMatch(crumbsHTML([{label:'x',href:'javascript:alert(1)'},{label:'y'}]),/javascript:/);
  assert.match(crumbsHTML([{label:'a'.repeat(80)}]),/a{59}…<\/span>/);
  const block=answerBlock('Title','Sentence.','',[{label:'Sitting weeks',href:'/sitting'},{label:'Week'}]);
  assert.match(block,/<section id="prerender" class="wrap"><h1>Title<\/h1><p>Sentence.<\/p><\/section>$/,'one title, no kicker');
  assert.ok(block.indexOf('prerender-crumbs')<block.indexOf('id="prerender"'));
  const css=readFileSync(new URL('style.css',pub),'utf8');
  assert.match(css,/\.spa-ready \.prerender-crumbs, \.spa-booting \.prerender-crumbs \{ display: none; \}/);
});

test('an address nothing answers gets the site page, noindex, with a way on; a missing file stays plain',async()=>{
  for(const path of ['/no-such-page-p5','/no/such/page/','/old-page.html']){
    const response=await worker.fetch(new Request(origin+path),env,{waitUntil(){}});
    assert.equal(response.status,404,path);assert.equal(response.headers.get('x-robots-tag'),'noindex',path);
    const html=await response.text();
    assert.match(html,/<title>Page not found · OPAX<\/title>/,path);
    assert.match(html,/<nav class="crumbs prerender-crumbs"[^>]*>.*<span class="crumb-label">Page not found<\/span>/s,path);
    assert.match(html,/<h1>Page not found<\/h1><p>Nothing is published at this address\. Search the record, or start again from the home page\.<\/p><p><a href="\/ask\?view=search">Search the record<\/a> · <a href="\/">Home<\/a><\/p>/,path);
    // The canonical goes with the status; the app scripts go in the real HTMLRewriter (not modelled here).
    assert.doesNotMatch(html,/rel="canonical"/,path);
  }
  for(const path of ['/no-such-script.js','/missing.png']){
    const response=await worker.fetch(new Request(origin+path),env,{waitUntil(){}});
    assert.equal(response.status,404,path);assert.doesNotMatch(await response.text(),/Page not found · OPAX/,path);
  }
});
test('/privacy and /support are served whole, from their panels, with canonical links',async()=>{
  const types=['Email Address','User ID','Emails or Text Messages','Audio Data','Other User Content','Product Interaction','Search History','Other Diagnostic Data'];
  for(const [path,name,facts] of [['/privacy','privacy',['What OPAX collects and who receives it','id="privacy-app"','id="privacy-deletion"','id="voice"','privacy@opax.com.au','Noice Pty Ltd',...types]],['/support','support',['Help with OPAX','id="support-contact"','id="support-report"','id="support-delete"','support@opax.com.au','8-digit deletion code']]]){
    const html=await get(path);checkHtml(html);
    assert.match(html,new RegExp(`<link rel="canonical" href="https://opax\\.com\\.au${path}"`),path);
    assert.match(html,new RegExp(`<section id="prerender" class="wrap policy-page" data-panel-copy="${name}">`),path);
    const main=html.match(/<main\b[^>]*data-server-rendered[^>]*>([\s\S]*?)<\/main>/)[1];
    for(const fact of facts)assert.ok(main.includes(fact),`${path}: ${fact}`);
    assert.doesNotMatch(main,/An association does not prove influence/,path);
    assert.doesNotMatch(main.match(/<section id="prerender"[^>]*>/)[0],/\shidden/,`${path}: the copy is visible without scripts`);
  }
  const shell=readFileSync(new URL('spa-shell.js',pub),'utf8');
  assert.ok(shell.includes('if(answer.hasAttribute("data-panel-copy"))for(const el of answer.querySelectorAll("[id]"))el.removeAttribute("id");main.prepend(answer);'));
});
