import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/social-publication.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { runSocialPublication, publicationCopy, readiness, socialStatus, previewPublication } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const post = { date: '2026-09-13', subject: 'person:Test Member', kind: 'politician', title: 'Test Member', text: 'Check the parliamentary record.\n\nhttps://opax.com.au/subject/person/Test%20Member', caption: 'The longer source-qualified caption.\n\nhttps://opax.com.au/subject/person/Test%20Member', url: 'https://opax.com.au/subject/person/Test%20Member' };
const now = Date.UTC(2026,8,12,22);
function harness(overrides = {}, handler) {
 const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../migrations/0005_social_publication.sql',import.meta.url),'utf8'));
 const db = {
  prepare(sql) {
   let args=[];
   return {
    bind(...a) { args=a; return this; },
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
   };
  },
 };
 sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(post.date,post.subject,JSON.stringify(post),new Date(now).toISOString());
 const env = { COMMUNITY_DB:db, GENERATION_CACHE:{async get(){return null}}, ASSETS:{async fetch(){throw Error('frozen edition must be reused')}}, DAILY_POST_ENABLED:'true', X_API_KEY:'key', X_API_SECRET:'secret', X_ACCESS_TOKEN:'token', X_ACCESS_TOKEN_SECRET:'token-secret', X_ACCOUNT_ID:'123', X_USERNAME:'OpaxAustralia', FACEBOOK_POST_ENABLED:'true', FACEBOOK_PAGE_ID:'456', FACEBOOK_PAGE_TOKEN:'page-token', INSTAGRAM_POST_ENABLED:'true', INSTAGRAM_ACCOUNT_ID:'789', INSTAGRAM_USERNAME:'opaxaustralia', INSTAGRAM_ACCESS_TOKEN:'ig-token', META_API_VERSION:'v25.0', ...overrides };
 const calls=[];
 const fetchImpl=async(url,init={})=>{
  calls.push({url,init}); const changed=await handler?.(url,init); if(changed)return changed;
  if(init.method==='HEAD')return new Response(null,{headers:{'content-type':'image/jpeg','x-opax-og':new URL(post.url).pathname}});
  if(url.endsWith('/2/users/me'))return Response.json({data:{id:'123',username:'OpaxAustralia'}});
  if(url.endsWith('/me?fields=id'))return Response.json({id:'456'});
  if(url.endsWith('/789?fields=id,username'))return Response.json({id:'789',username:'opaxaustralia'});
  if(url.endsWith('?fields=status_code'))return Response.json({status_code:'FINISHED'});
  if(url.endsWith('/2/tweets'))return Response.json({data:{id:'1001'}});
  if(url.endsWith('/456/feed'))return Response.json({id:'456_1002'});
  if(url.endsWith('/789/media'))return Response.json({id:'999'});
  if(url.endsWith('/789/media_publish'))return Response.json({id:'1003'});
  throw Error('Unexpected request '+url);
 };
 const run=()=>runSocialPublication(env,{now,personTopics:async()=>Response.json({}),fetchImpl});
 return {env,db,sqlite,calls,run};
}
test('platform copy uses attribution, real JPEG and a bio CTA for Instagram',()=>{
 for(const channel of ['x','facebook','instagram']) {
  const c=publicationCopy(post,channel);assert.equal(new URL(c.link).searchParams.get('utm_source'),channel);assert.match(c.image,/\.jpg\?v=/);
  if(channel==='instagram'){assert.match(c.text,/link in bio/);assert.doesNotMatch(c.text,/https:\/\//)}
 }
 assert.throws(()=>publicationCopy({...post,url:'https://evil.example/'},'x'));
});
test('missing account identity and staging fail closed',async()=>{
 const h=harness({X_ACCOUNT_ID:undefined,FACEBOOK_POST_ENABLED:'false',INSTAGRAM_POST_ENABLED:'false'});assert.equal(readiness(h.env).x.ready,false);await h.run();assert.equal(h.calls.length,0);
 const staging=harness({STAGING_API:{}});await staging.run();assert.equal(staging.calls.length,0);
});
test('three platforms publish once under overlapping cron invocations',async()=>{
 const h=harness();await Promise.all([h.run(),h.run()]);await h.run();
 for(const ending of ['/2/tweets','/456/feed','/789/media_publish'])assert.equal(h.calls.filter(c=>c.url.endsWith(ending)).length,1,ending);
 assert.equal(h.sqlite.prepare("SELECT count(*) n FROM social_deliveries WHERE status='posted'").get().n,3);
 const status=await socialStatus(h.env,post.date);assert.equal(status.deliveries.length,3);assert.doesNotMatch(JSON.stringify(status),/page-token|token-secret|ig-token/);
});
test('wrong X account cannot publish and does not prevent Meta delivery',async()=>{
 const h=harness({},async url=>url.endsWith('/2/users/me')?Response.json({data:{id:'222',username:'jaketracey'}}):null);await h.run();
 assert.equal(h.calls.filter(c=>c.url.endsWith('/2/tweets')).length,0);
 assert.equal(h.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='x'").get().detail,'X account mismatch');
 assert.equal(h.sqlite.prepare("SELECT status FROM social_deliveries WHERE channel='facebook'").get().status,'posted');
});
test('ambiguous X write is held for review and never repeated',async()=>{
 const h=harness({},async url=>{if(url.endsWith('/2/tweets'))throw Error('timeout with private-token-value')});await h.run();await h.run();
 assert.equal(h.calls.filter(c=>c.url.endsWith('/2/tweets')).length,1);
 const receipt=h.sqlite.prepare("SELECT * FROM social_deliveries WHERE channel='x'").get();assert.equal(receipt.status,'review_required');assert.doesNotMatch(JSON.stringify(receipt),/private-token/);
});
test('Instagram processing resumes the same container without repeating successful channels',async()=>{
 let ready=false;const h=harness({},async url=>url.endsWith('?fields=status_code')?Response.json({status_code:ready?'FINISHED':'IN_PROGRESS'}):null);
 await h.run();assert.equal(h.sqlite.prepare("SELECT status FROM social_deliveries WHERE channel='instagram'").get().status,'preparing');ready=true;await h.run();
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')).length,1);assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,1);assert.equal(h.calls.filter(c=>c.url.endsWith('/2/tweets')).length,1);
});
test('wrong or generic social image prevents every publish',async()=>{
 const h=harness({},async(url,init)=>init.method==='HEAD'&&url.includes('/og/')?new Response(null,{headers:{'content-type':'image/png'}}):null);await h.run();assert.equal(h.calls.filter(c=>c.init.method==='POST').length,0);
});
test('legacy X daily receipt is respected during migration',async()=>{
 const h=harness({GENERATION_CACHE:{async get(){return 'existing-id'}}});await h.run();assert.equal(h.calls.filter(c=>c.url.includes('api.x.com')).length,0);
});

test('preview returns the frozen edition even when source assets are unavailable',async()=>{
 const h=harness();assert.deepEqual(await previewPublication(h.env,post.date,async()=>Response.json({})),post);
});
test('only posted subjects in the preceding 90 days are excluded from new copy',async()=>{
 const h=harness();h.sqlite.exec('DELETE FROM social_editions');
 const people=['Already Featured','Failed Delivery','Old Feature'].map(name=>({name,current:true,speeches:250,representation:[{jurisdiction:'federal'}]}));
 h.env.ASSETS={async fetch(request){return new URL(request.url).pathname==='/parliamentarians.json'?Response.json({people}):new Response(null,{status:404})}};
 for(const [date,name,status] of [['2026-09-12','Already Featured','posted'],['2026-09-11','Failed Delivery','failed'],['2026-06-01','Old Feature','posted']]){
  h.sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(date,'person:'+name,'{}',date);
  h.sqlite.prepare('INSERT INTO social_deliveries(edition_date,channel,status,updated_at) VALUES(?,?,?,?)').run(date,'x',status,date);
 }
 const seen=new Set();
 for(let day=13;day<=23;day++){
  const candidate=await previewPublication(h.env,'2026-09-'+day,async()=>Response.json({}),'politician');
  assert.notEqual(candidate.subject,'person:Already Featured');seen.add(candidate.subject);
 }
 assert.deepEqual(seen,new Set(['person:Failed Delivery','person:Old Feature']));
});
