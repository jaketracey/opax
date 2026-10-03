import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const compile=async file=>{
  const result=await build({entryPoints:[new URL('../src/'+file,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {appEdition}=await compile('app-edition.ts');
const {appManifest}=await compile('app-manifest.ts');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const at=Date.UTC(2026,9,2,22);
const post={date:'2026-10-03',subject:'bill:au-federal-test',kind:'bill',title:'A test bill',text:'Published source copy.',caption:'Stored summary; attributed to Parliament.',url:'https://opax.com.au/bill/au-federal-test'};
const slides=[
  {type:'cover',kicker:'Bill',title:'A test bill',alt:'The cover.',line:'A published bill.',photo:null},
  {type:'list',kicker:'Record',title:'The summary',alt:'Stored summary.',items:['One recorded fact.'],note:'Summary from Parliament.'},
  {type:'source',kicker:'Source',title:'Parliament',alt:'Read the source.',rows:['Parliament of Australia'],url:'opax.com.au/bill',path:'au-federal-test'},
];
const request=(path,method='GET',headers={})=>new Request('https://opax.test/api/app/v1/'+path,{method,headers});

function journal(){
  const db=new DatabaseSync(':memory:');
  for(const file of ['0005_social_publication.sql','0007_social_stories.sql','0008_social_bluesky.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const calls=[];
  const env={COMMUNITY_DB:{prepare(sql){assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);calls.push(sql);let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)??null}}}}};
  const store=(edition=post,status='posted',id='fixture-post')=>{
    db.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(edition.date,edition.subject,JSON.stringify(edition),'2026-10-02T22:00:00Z');
    if(status)db.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,?,?,?,?)').run(edition.date,'x',status,id,'2026-10-02T22:01:00Z');
  };
  return {db,env,calls,store,call:(path='edition/today',method='GET',headers={})=>appEdition(request(path,method,headers),env,at)};
}

test('today and date return the exact published journal copy with attribution, slides and revalidation',async()=>{
  const f=journal();try{
    f.store({...post,slides});
    for(const path of ['edition/today','edition/2026-10-03']){
      const response=await f.call(path),body=await response.json();
      assert.equal(response.status,200);assert.deepEqual(body,{schema_version:1,date:post.date,created_at:'2026-10-02T22:00:00Z',edition:{...post,slides}});
      assert.equal(response.headers.get('cache-control'),path.endsWith('today')?'public, max-age=300, must-revalidate':'public, max-age=86400, must-revalidate');
      assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('access-control-allow-origin'),null);
      const etag=response.headers.get('etag');assert.match(etag,/^W\/"[a-f0-9]{64}"$/);
      for(const tag of [etag,etag.slice(2),'"unrelated", '+etag,'*']){
        const fresh=await f.call(path,'GET',{'if-none-match':tag});assert.equal(fresh.status,304);assert.equal(await fresh.text(),'');assert.equal(fresh.headers.get('etag'),etag);
      }
      const head=await f.call(path,'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('etag'),etag);
    }
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM social_editions').get().n,1);
  }finally{f.db.close()}
});

test('legacy editions without slides remain readable without manufacturing a story',async()=>{
  const f=journal();try{f.store();assert.deepEqual((await (await f.call()).json()).edition,post)}finally{f.db.close()}
});

test('missing, frozen-only and every unsuccessful delivery remain a clear 404, with no previous-day fallback',async()=>{
  for(const status of [null,'preparing','sending','failed','review_required']){
    const f=journal();try{
      f.store(post,status);f.store({...post,date:'2026-10-02'});
      for(const path of ['edition/today','edition/2026-10-03','edition/2026-10-01']){
        const response=await f.call(path);assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'edition_not_published',date:path.endsWith('01')?'2026-10-01':'2026-10-03'});
        assert.equal(response.headers.get('cache-control'),'public, max-age=60, must-revalidate');
      }
    }finally{f.db.close()}
  }
  for(const id of [null,'']){const f=journal();try{f.store(post,'posted',id);assert.equal((await f.call()).status,404)}finally{f.db.close()}}
});

test('any posted channel suffices; multiple posted receipts never duplicate an edition',async()=>{
  const f=journal();try{
    f.store(post,'failed');
    for(const channel of ['bluesky','instagram'])f.db.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,?,?,?,?)').run(post.date,channel,'posted','fixture-'+channel,'2026-10-02T22:02:00Z');
    assert.equal((await f.call()).status,200);assert.equal(f.calls.length,1);
  }finally{f.db.close()}
});

test('date selection follows Melbourne midnight, including daylight saving, and refuses future publications',async()=>{
  const f=journal();try{
    const rows=['2026-10-03','2026-10-04','2026-10-05'];for(const date of rows)f.store({...post,date});
    for(const [clock,date] of [[Date.UTC(2026,9,3,13,59),'2026-10-03'],[Date.UTC(2026,9,3,14),'2026-10-04'],[Date.UTC(2026,9,4,12,59),'2026-10-04'],[Date.UTC(2026,9,4,13),'2026-10-05']]){
      const response=await appEdition(request('edition/today'),f.env,clock);assert.equal((await response.json()).date,date);
    }
    const before=f.calls.length;
    assert.equal((await f.call('edition/2026-10-05')).status,404);assert.equal(f.calls.length,before);
  }finally{f.db.close()}
});

test('edition refuses invalid dates, composition parameters and all mutation methods before reading D1',async()=>{
  const f=journal();try{
    for(const date of ['2026-02-30','2025-02-29','2026-13-01','2026-1-01','2026-10-03/extra','preview','%32%30%32%36-10-03','']){
      const response=await f.call('edition/'+date);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_date'});assert.equal(response.headers.get('cache-control'),'no-store');
    }
    for(const query of ['kind=bill','date=2026-10-02','subject=test','dry_run=true','nocache=1']){
      const response=await f.call('edition/today?'+query);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_query'});
    }
    for(const method of ['POST','PUT','DELETE','OPTIONS','PATCH']){
      const response=await f.call('edition/today',method);assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');assert.deepEqual(await response.json(),{error:'method_not_allowed'});
    }
    assert.equal(f.calls.length,0);
  }finally{f.db.close()}
});

test('malformed journal content or schema/database failure returns generic uncached 503, never a fallback',async()=>{
  for(const corrupt of ['not-json','null','{}',JSON.stringify({...post,date:'2026-10-02'}),JSON.stringify({...post,url:'https://example.test/'}),JSON.stringify({...post,url:'https://opax.com.au/og/story/2026-10-03/1.jpg'}),JSON.stringify({...post,slides:[]}),JSON.stringify({...post,caption:123})]){
    const f=journal();try{
      f.store();f.db.prepare('UPDATE social_editions SET post_json=?').run(corrupt);
      const response=await f.call();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'edition_unavailable'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('retry-after'),'60');
    }finally{f.db.close()}
  }
  for(const env of [{},{COMMUNITY_DB:{prepare(){throw Error('private detail')}}}])assert.equal((await appEdition(request('edition/today'),env,at)).status,503);
});

function assetsFixture(){
  const paths=['/corpus.json','/parliamentarians.json','/votes.json','/bills/index.json','/interests/index.json','/interests/recent.json','/pay.json','/expenses.json','/expense-categories.json','/graph/money.json','/photos/people.json','/photos/credits.json','/electorates/manifest.json','/social/photos.json'];
  const payloads=new Map(paths.map(path=>[path,JSON.stringify({meta:{generated:'2026-09-01'},fixture:path})]));
  payloads.set('/corpus.json',JSON.stringify({version:'2026-10-03',refresh:{checked_at:'2026-10-02T18:21:42Z'}}));
  payloads.set('/pay.json',JSON.stringify({meta:{as_of:'2026-08-31',generated:'2026-09-01'}}));
  payloads.set('/votes.json',JSON.stringify({_names:{},123:{divisions:[]}}));
  payloads.set('/photos/people.json',JSON.stringify({test:'123.webp'}));
  const release='0123456789abcdef',base='/electorates/releases/'+release+'/';
  const files=Object.fromEntries(['index.json','people.json','reference.json','crosswalk.json','el_'+'a'.repeat(24)+'.json'].map(name=>[name,digest(name)]));
  payloads.set('/electorates/manifest.json',JSON.stringify({release_id:release,generated:'2026-09-09',files,index_url:base+'index.json',people_url:base+'people.json',reference_url:base+'reference.json',crosswalk_url:base+'crosswalk.json'}));
  const calls=[];
  const env={ASSETS:{async fetch(req){assert.equal(new URL(req.url).origin,'https://app-assets.invalid');assert.equal(req.headers.get('cookie'),null);calls.push(new URL(req.url).pathname);const text=payloads.get(new URL(req.url).pathname);return new Response(text??'missing',{status:text===undefined?404:200,headers:{'content-type':'application/json'}})}},VOICE_ENABLED:'true'};
  return {env,calls,payloads,files,base,call:(method='GET',headers={})=>appManifest(request('manifest',method,headers),env)};
}

test('manifest covers P0 root catalogs and immutable seats, hashes exact bytes, and preserves actual source dates',async()=>{
  const f=assetsFixture();const response=await f.call();assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.schema_version,1);assert.match(body.data_version,/^[a-f0-9]{64}$/);assert.equal(body.generated_at,'2026-10-02T18:21:42Z');assert.equal(body.minimum_app_version,'1.0.0');
  assert.deepEqual(body.features,{public_data:true,voice:true,community:false,push:false});
  assert.equal(response.headers.get('cache-control'),'public, max-age=300, must-revalidate');
  for(const path of f.payloads.keys()){
    const catalog=Object.values(body.catalogs).find(c=>c.url===path);assert.ok(catalog,path);assert.equal(catalog.sha256,digest(f.payloads.get(path)),path);
  }
  assert.equal(body.catalogs.pay.as_of,'2026-08-31');assert.equal(body.catalogs.votes.as_of,null);assert.equal(body.catalogs.portraits.as_of,null);
  for(const [name,hash] of Object.entries(f.files))assert.deepEqual(body.catalogs['electorates/'+name],{url:f.base+name,sha256:hash,as_of:'2026-09-09'});
  assert.equal(f.calls.length,14,'no seat/detail fetches');
});

test('manifest caches concurrent and repeated asset reads, supports HEAD and conditional GET without D1',async()=>{
  const f=assetsFixture();const responses=await Promise.all(Array.from({length:5},()=>f.call()));
  assert.equal(f.calls.length,14);const etag=responses[0].headers.get('etag');
  for(const response of responses)assert.equal(response.headers.get('etag'),etag);
  const head=await f.call('HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('etag'),etag);
  const revalidated=await f.call('GET',{'if-none-match':etag});assert.equal(revalidated.status,304);assert.equal(await revalidated.text(),'');assert.equal(f.calls.length,14);
});

test('manifest minimum version is configurable and fails safely for missing or malformed values',async()=>{
  const f=assetsFixture();
  for(const [value,expected] of [[undefined,'1.0.0'],['','1.0.0'],[' 2.3.4 ','2.3.4'],['garbage','1.0.0'],['01.0.0','1.0.0'],['2.0','1.0.0'],['9999999999.0.0','1.0.0']]){
    f.env.APP_MINIMUM_VERSION=value;assert.equal((await (await f.call()).json()).minimum_app_version,expected);
  }
  const before=await f.call();f.env.APP_MINIMUM_VERSION='2.0.0';f.env.VOICE_ENABLED='false';const after=await f.call();
  assert.notEqual(before.headers.get('etag'),after.headers.get('etag'));const previous=await before.json(),next=await after.json();assert.equal(previous.data_version,next.data_version);assert.equal(next.features.voice,false);assert.equal(f.calls.length,14);
});

test('manifest cache expires and a changed catalog changes data_version even with an unchanged corpus refresh',async t=>{
  let clock=at;t.mock.method(Date,'now',()=>clock);
  const f=assetsFixture(),before=await (await f.call()).json();
  f.payloads.set('/pay.json',JSON.stringify({meta:{as_of:'2026-09-17'},updated:true}));
  clock+=299999;assert.equal((await (await f.call()).json()).data_version,before.data_version);assert.equal(f.calls.length,14);
  clock++;const after=await (await f.call()).json();assert.notEqual(after.data_version,before.data_version);assert.equal(after.generated_at,before.generated_at);assert.equal(f.calls.length,28);
  const other=assetsFixture();assert.equal((await (await other.call()).json()).data_version,before.data_version,'separate deployments/bindings never share cached catalogs');
});

test('manifest missing or malformed assets and invalid release paths/hashes fail closed, and failures are retried',async()=>{
  for(const mutate of [
    f=>f.payloads.delete('/votes.json'),f=>f.payloads.set('/pay.json','not-json'),f=>f.payloads.set('/corpus.json','[]'),
    f=>{const m=JSON.parse(f.payloads.get('/electorates/manifest.json'));m.index_url='https://example.test/index.json';f.payloads.set('/electorates/manifest.json',JSON.stringify(m))},
    f=>{const m=JSON.parse(f.payloads.get('/electorates/manifest.json'));m.files['../escape.json']='a'.repeat(64);f.payloads.set('/electorates/manifest.json',JSON.stringify(m))},
    f=>{const m=JSON.parse(f.payloads.get('/electorates/manifest.json'));m.files['index.json']='invalid';f.payloads.set('/electorates/manifest.json',JSON.stringify(m))},
    f=>{const m=JSON.parse(f.payloads.get('/electorates/manifest.json'));delete m.files['people.json'];f.payloads.set('/electorates/manifest.json',JSON.stringify(m))},
  ]){
    const f=assetsFixture();mutate(f);const response=await f.call();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'manifest_unavailable'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('retry-after'),'60');
    f.payloads.clear();for(const [path,text] of assetsFixture().payloads)f.payloads.set(path,text);
    assert.equal((await f.call()).status,200,'failed build is not cached');
  }
  for(const response of [new Response(null,{status:302,headers:{location:'https://example.test/'}}),new Response('{}',{headers:{'content-type':'text/html'}})]){
    const f=assetsFixture();f.env.ASSETS.fetch=async()=>response.clone();assert.equal((await f.call()).status,503);
  }
  assert.equal((await appManifest(request('manifest'),{})).status,503);
});

test('manifest refuses mutations and unsupported query parameters without asset reads',async()=>{
  const f=assetsFixture();
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
    const response=await f.call(method);assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const response=await appManifest(request('manifest?nocache=1'),f.env);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_query'});assert.equal(f.calls.length,0);
});

test('manifest hashes and source dates match this worktree static exports',async()=>{
  const paths=[];
  const response=await appManifest(request('manifest'),{ASSETS:{async fetch(req){const path=new URL(req.url).pathname;paths.push(path);return new Response(readFileSync(new URL('../public'+path,import.meta.url)),{headers:{'content-type':'application/json'}})}}});
  assert.equal(response.status,200);const body=await response.json();
  for(const catalog of Object.values(body.catalogs))assert.equal(catalog.sha256,digest(readFileSync(new URL('../public'+catalog.url,import.meta.url))),catalog.url);
  assert.equal(paths.length,14);
  assert.equal(body.catalogs.pay.as_of,JSON.parse(readFileSync(new URL('../public/pay.json',import.meta.url),'utf8')).meta.as_of);
  const votes=JSON.parse(readFileSync(new URL('../public/votes.json',import.meta.url),'utf8'));
  if(!votes._meta)assert.equal(body.catalogs.votes.as_of,null,'never substitute the corpus refresh for missing vote metadata');
});
