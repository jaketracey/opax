import {createHash} from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/social-publication.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { runSocialPublication, publicationCopy, readiness, socialStatus, previewPublication, socialEngagement, todayRedirect, tagFacets, instagramTags, failureDetail, leaveBy, CONTAINER_WAITS } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const storyBuilt = await build({ entryPoints: [new URL('../src/story.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { STORY_VERSION, storyFrames } = await import('data:text/javascript;base64,' + Buffer.from(storyBuilt.outputFiles[0].text).toString('base64'));
const post = { date: '2026-09-13', subject: 'person:Test Member', kind: 'politician', title: 'Test Member', text: 'Check the parliamentary record.\n\nhttps://opax.com.au/subject/person/Test%20Member', caption: 'The longer source-qualified caption.\n\nhttps://opax.com.au/subject/person/Test%20Member', url: 'https://opax.com.au/subject/person/Test%20Member' };
const now = Date.UTC(2026,8,12,22);
// A valid story (story.ts): a cover first, one fact a slide, the source last.
const slides = [
 { type:'cover', kicker:'Parliamentarian · Test', title:'Test Member', line:'A test line.', photo:'parliament-house-flagpole', alt:'Parliament House with Test Member.' },
 { type:'number', kicker:'The record', title:'What OPAX holds', lines:['Collected records.'], value:'1,369', label:'speeches in the OPAX record', alt:'1,369 speeches.' },
 { type:'source', kicker:'Read the speeches', title:'What do the speeches say?', rows:['Cited to Hansard'], url:'opax.com.au/subject/person', path:'Test Member', alt:'Read at opax.com.au.' },
];
const story = { ...post, slides };
function harness(overrides = {}, handler) {
 const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../migrations/0005_social_publication.sql',import.meta.url),'utf8')); sqlite.exec(readFileSync(new URL('../migrations/0007_social_stories.sql',import.meta.url),'utf8')); sqlite.exec(readFileSync(new URL('../migrations/0008_social_bluesky.sql',import.meta.url),'utf8'));
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
 const calls=[];let children=0,photos=0,stories=0;
 const fetchImpl=async(url,init={})=>{
  calls.push({url,init,body:typeof init.body==='string'?JSON.parse(init.body):null}); const changed=await handler?.(url,init); if(changed)return changed;
  const slide=/\/og\/story\/(\d{4}-\d{2}-\d{2})\/(\d+)\.jpg/.exec(url);
  if(init.method==='HEAD'&&slide)return new Response(null,{headers:{'content-type':'image/jpeg','x-opax-story':slide[1]+'/'+slide[2],'x-opax-format':new URL(url).searchParams.get('format')==='story'?'story':'portrait','x-opax-subject':post.subject}});
  if(init.method==='HEAD')return new Response(null,{headers:{'content-type':'image/jpeg','x-opax-og':new URL(post.url).pathname,...(new URL(url).searchParams.get('format')==='portrait'?{'x-opax-format':'portrait'}:{})}});
  if(!init.method&&/\/og\/.*\.jpg/.test(url))return new Response(new Uint8Array(1500),{headers:{'content-type':'image/jpeg'}});
  if(url.endsWith('/xrpc/com.atproto.server.createSession'))return Response.json({accessJwt:'jwt',did:'did:plc:test',handle:'opax.bsky.social'});
  if(url.endsWith('/xrpc/com.atproto.repo.uploadBlob'))return Response.json({blob:{$type:'blob',ref:{$link:'bafyblob'},mimeType:'image/jpeg',size:1500}});
  if(url.endsWith('/xrpc/com.atproto.repo.createRecord'))return Response.json({uri:'at://did:plc:test/app.bsky.feed.post/3kabc',cid:'bafycid'});
  if(url.endsWith('/2/users/me'))return Response.json({data:{id:'123',username:'OpaxAustralia'}});
  if(url.endsWith('/me?fields=id'))return Response.json({id:'456'});
  if(url.endsWith('/789?fields=id,username'))return Response.json({id:'789',username:'opaxaustralia'});
  if(url.endsWith('?fields=status_code'))return Response.json({status_code:'FINISHED'});
  if(url.endsWith('/2/tweets'))return Response.json({data:{id:'1001'}});
  if(url.endsWith('/456/feed'))return Response.json({id:'456_1002'});
  if(url.endsWith('/456/photos'))return Response.json({id:String(700+ ++photos)});
  if(url.endsWith('/789/media')){const b=JSON.parse(init.body);return Response.json({id:b.is_carousel_item?String(900+ ++children):b.media_type==='STORIES'?String(800+ ++stories):'999'});}
  if(url.endsWith('/456/photo_stories'))return Response.json({success:true,post_id:'456_'+JSON.parse(init.body).photo_id});
  if(url.endsWith('/789/media_publish'))return Response.json({id:JSON.parse(init.body).creation_id==='999'||JSON.parse(init.body).creation_id.startsWith('9')?'1003':'1'+JSON.parse(init.body).creation_id});
  throw Error('Unexpected request '+url);
 };
 // The waits between container status reads are recorded, not slept. The wall clock stands at the run's tick unless a test moves it.
 const sleeps=[];
 const run=(at=now,clock=()=>at,more={})=>runSocialPublication(env,{now:at,clock,personTopics:async()=>Response.json({}),fetchImpl,sleep:async ms=>{sleeps.push(ms)},...more});
 return {env,db,sqlite,calls,run,fetchImpl,sleeps};
}
test('platform copy uses attribution, real JPEG, a portrait card and a bio CTA for Instagram',()=>{
 for(const channel of ['x','facebook','instagram']) {
  const c=publicationCopy(post,channel);assert.equal(new URL(c.link).searchParams.get('utm_source'),channel);assert.match(c.image,/\.jpg\?v=/);
  // Instagram's feed and grid are 4:5; X and Facebook previews stay landscape.
  assert.equal(new URL(c.image).searchParams.get('format'),channel==='instagram'?'portrait':null,channel);
  if(channel==='instagram'){assert.match(c.text,/link in bio/);assert.doesNotMatch(c.text,/https:\/\//)}
 }
 const award=new URL(publicationCopy({...post,url:post.url+'?award=GA123'},'instagram').image);
 assert.equal(award.pathname,'/og/subject/person/Test%20Member.jpg');assert.equal(award.searchParams.get('award'),'GA123');assert.match(award.searchParams.get('v'),/^\d+$/);assert.equal(award.searchParams.get('format'),'portrait');
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
test('an award post cannot publish a recipient-total image or a different award',async()=>{
 const h=harness({},async (url,init)=>init.method==='HEAD'?new Response(null,{headers:{'content-type':'image/jpeg','x-opax-og':'/money/grants/federal/recipient/abn%3A18374210672','x-opax-award':'GA999'}}):null);
 const grant={...post,kind:'grant',url:'https://opax.com.au/money/grants/federal/recipient/abn%3A18374210672?award=GA123'};
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(grant));
 const copy=publicationCopy(grant,'instagram');assert.equal(new URL(copy.image).searchParams.get('award'),'GA123');
 await h.run();assert.equal(h.calls.filter(c=>c.init.method==='POST').length,0);
 assert.equal(h.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='x'").get().detail,'Grant award image mismatch');
});
test('legacy X daily receipt is respected during migration',async()=>{
 const h=harness({GENERATION_CACHE:{async get(){return 'existing-id'}}});await h.run();assert.equal(h.calls.filter(c=>new URL(c.url).hostname === 'api.x.com').length,0);
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
test('a landscape answer to the portrait request keeps Instagram closed without blocking X or Facebook',async()=>{
 // An older Worker (or a fallback) answers the portrait URL with the landscape card: no x-opax-format header.
 const h=harness({},async(url,init)=>init.method==='HEAD'&&url.includes('format=portrait')?new Response(null,{headers:{'content-type':'image/jpeg','x-opax-og':new URL(post.url).pathname}}):null);
 await h.run();
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')).length,0);
 const ig=h.sqlite.prepare("SELECT status,detail FROM social_deliveries WHERE channel='instagram'").get();assert.equal(ig.status,'failed');assert.equal(ig.detail,'Portrait image unavailable');
 for(const channel of ['x','facebook'])assert.equal(h.sqlite.prepare('SELECT status FROM social_deliveries WHERE channel=?').get(channel).status,'posted',channel);
 // The Instagram preflight asked for the portrait card, and only Instagram did.
 const heads=h.calls.filter(c=>c.init.method==='HEAD'&&c.url.includes('/og/'));
 assert.equal(heads.filter(c=>c.url.includes('format=portrait')).length,1);assert.equal(heads.length,3);
});

test('a story gives Instagram and Facebook the slide images in order and X the single card',()=>{
 for(const channel of ['instagram','facebook']){
  const c=publicationCopy(story,channel);
  assert.deepEqual(c.slides,[1,2,3].map(n=>`https://opax.com.au/og/story/2026-09-13/${n}.jpg?v=${new URL(c.image).searchParams.get('v')}.${STORY_VERSION}`),channel);
  assert.match(c.image,/\.jpg\?v=/);
 }
 assert.equal(publicationCopy(story,'x').slides,undefined);
 assert.equal(publicationCopy(post,'instagram').slides,undefined,'no slides, no story');
 assert.equal(publicationCopy({...story,slides:slides.slice(1)},'instagram').slides,undefined,'a story opens with its cover');
 assert.equal(publicationCopy({...story,slides:[slides[0],slides[2]]},'instagram').slides,undefined,'a story is at least three slides');
 assert.equal(publicationCopy({...story,slides:[...slides.slice(0,2),slides[1],slides[1],slides[1],slides[1],slides[1],slides[1],slides[1],slides[1],slides[2]]},'instagram').slides,undefined,'Instagram allows ten');
});
test('a story posts one Instagram carousel and one Facebook multi-photo post, X unchanged',async()=>{
 const h=harness();h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(story));
 await h.run();
 for(const channel of ['x','facebook','instagram'])assert.equal(h.sqlite.prepare('SELECT status FROM social_deliveries WHERE channel=?').get(channel).status,'posted',channel);
 // Every slide was preflighted as the frozen edition's own portrait drawing; the single card was not needed.
 const heads=h.calls.filter(c=>c.init.method==='HEAD'&&c.url.includes('/og/'));
 assert.equal(heads.filter(c=>c.url.includes('/og/story/')).length,6,'three slides for each of two channels');assert.equal(heads.filter(c=>!c.url.includes('/og/story/')).length,1,'the single card only for X');
 // Instagram: three children, then the parent, then publish; the parent is the journal's container.
 const media=h.calls.filter(c=>c.url.endsWith('/789/media'));
 assert.equal(media.length,4);
 media.slice(0,3).forEach((c,i)=>{assert.equal(c.body.is_carousel_item,true);assert.equal(c.body.image_url,publicationCopy(story,'instagram').slides[i]);assert.equal(c.body.alt_text,slides[i].alt);assert.equal(c.body.caption,undefined)});
 assert.deepEqual(media[3].body,{media_type:'CAROUSEL',children:'901,902,903',caption:publicationCopy(story,'instagram').text});
 assert.equal(h.sqlite.prepare("SELECT container_id FROM social_deliveries WHERE channel='instagram'").get().container_id,'999');
 assert.deepEqual(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).map(c=>c.body),[{creation_id:'999'}]);
 // Facebook: three unpublished photos, then one feed post attaching them, the link in the message.
 const uploads=h.calls.filter(c=>c.url.endsWith('/456/photos'));
 assert.deepEqual(uploads.map(c=>c.body),[1,2,3].map(n=>({url:publicationCopy(story,'facebook').slides[n-1],published:false})));
 const feed=h.calls.filter(c=>c.url.endsWith('/456/feed'));assert.equal(feed.length,1);
 assert.deepEqual(feed[0].body.attached_media,[{media_fbid:'701'},{media_fbid:'702'},{media_fbid:'703'}]);
 assert.equal(feed[0].body.link,undefined);assert.match(feed[0].body.message,/utm_source=facebook/);assert.ok(feed[0].body.message.startsWith(publicationCopy(story,'facebook').text));
 assert.equal(h.calls.filter(c=>c.url.endsWith('/2/tweets')).length,1);
 // A second run repeats nothing.
 const before=h.calls.length;await h.run();assert.equal(h.calls.length,before);
});
test('a carousel still processing resumes the same parent without recreating children or repeating other channels',async()=>{
 let ready=false;const h=harness({},async url=>url.endsWith('?fields=status_code')?Response.json({status_code:ready?'FINISHED':'IN_PROGRESS'}):null);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(story));
 await h.run();
 const ig=h.sqlite.prepare("SELECT status,container_id FROM social_deliveries WHERE channel='instagram'").get();assert.equal(ig.status,'preparing');assert.equal(ig.container_id,'999');
 ready=true;await h.run();
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')).length,4,'children and parent created once');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,1);
 assert.equal(h.calls.filter(c=>c.url.endsWith('/2/tweets')).length,1);assert.equal(h.calls.filter(c=>c.url.endsWith('/456/feed')).length,1);assert.equal(h.calls.filter(c=>c.url.endsWith('/456/photos')).length,3);
 assert.equal(h.sqlite.prepare("SELECT status FROM social_deliveries WHERE channel='instagram'").get().status,'posted');
});
test('a slide that is not the frozen edition\'s own drawing keeps the story off Instagram and Facebook while X posts',async()=>{
 // Slide 2 answers with another date's drawing (a stale cache, a different edition under the URL).
 const h=harness({},async(url,init)=>init.method==='HEAD'&&url.includes('/og/story/2026-09-13/2.jpg')?new Response(null,{headers:{'content-type':'image/jpeg','x-opax-story':'2026-09-12/2','x-opax-format':'portrait'}}):null);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(story));
 await h.run();
 for(const channel of ['instagram','facebook']){const r=h.sqlite.prepare('SELECT status,detail FROM social_deliveries WHERE channel=?').get(channel);assert.equal(r.status,'failed',channel);assert.equal(r.detail,'Story slide unavailable',channel)}
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')).length,0);assert.equal(h.calls.filter(c=>c.url.endsWith('/456/photos')).length,0);assert.equal(h.calls.filter(c=>c.url.endsWith('/456/feed')).length,0);
 assert.equal(h.sqlite.prepare("SELECT status FROM social_deliveries WHERE channel='x'").get().status,'posted');
 // A landscape or non-JPEG slide is refused the same way.
 const h2=harness({},async(url,init)=>init.method==='HEAD'&&url.includes('/og/story/')?new Response(null,{headers:{'content-type':'image/jpeg','x-opax-story':/\/(\d{4}-\d{2}-\d{2}\/\d+)\.jpg/.exec(url)[1]}}):null);
 h2.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(story));await h2.run();
 assert.equal(h2.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='instagram'").get().detail,'Story slide unavailable');
 assert.equal(h2.calls.filter(c=>c.init.method==='POST'&&!c.url.includes('x.com')).length,0);
});

// A seven-slide story, the shape the grant edition takes.
const seven = [slides[0],
 slides[1],
 { type:'picture', kicker:'The purpose', title:'What it was for', photo:'qantas-founders-twilight', quote:'A quote.', lines:[], alt:'Picture.' },
 { type:'bars', kicker:'How it was chosen', title:'Closed', lines:[], items:[{label:'Closed',pct:98}], alt:'Bars.' },
 { type:'ledger', kicker:'The same trust', title:'Three awards', lines:[], rows:[{c1:'2018-19',c2:'Roof',amount:'$11,300,000'}], alt:'Ledger.' },
 { type:'number', kicker:'The electorate', title:'Kennedy', lines:[], value:'$1.45bn', label:'in awards', alt:'Electorate.' },
 slides[2]];
const storyEnv = { INSTAGRAM_STORY_ENABLED:'true', FACEBOOK_STORY_ENABLED:'true' };
test('story frames are the cover, the number, the picture, the cross-reference and the source, five at most',()=>{
 assert.deepEqual(storyFrames(seven),[1,2,3,5,7]);
 assert.deepEqual(storyFrames(slides),[1,2,3]);
 assert.deepEqual(storyFrames(seven,3),[1,2,7]);
 assert.deepEqual(storyFrames(slides.slice(1)),[],'not a story');
 const c=publicationCopy({...story,slides:seven},'instagram_story');
 assert.deepEqual(c.frames,[1,2,3,5,7]);
 assert.deepEqual(c.slides,[1,2,3,5,7].map(n=>`https://opax.com.au/og/story/2026-09-13/${n}.jpg?v=${new URL(c.image).searchParams.get('v')}.${STORY_VERSION}&format=story`));
 assert.equal(publicationCopy({...story,slides:seven},'instagram').frames,undefined,'the feed carousel posts every slide');
 assert.equal(publicationCopy(post,'instagram_story').frames,undefined,'no frames without a story');
});
test('a story posts its frames one by one as Instagram and Page stories, in order, recording progress',async()=>{
 const h=harness({...storyEnv});h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const r=await h.run();
 assert.equal(r.channels.instagram_story,'posted'); assert.equal(r.channels.facebook_story,'posted');
 const ig=h.calls.filter(c=>c.url.endsWith('/789/media')&&c.body?.media_type==='STORIES');
 assert.equal(ig.length,5,'five story containers');
 assert.deepEqual(ig.map(c=>new URL(c.body.image_url).pathname),[1,2,3,5,7].map(n=>`/og/story/2026-09-13/${n}.jpg`));
 assert.ok(ig.every(c=>new URL(c.body.image_url).searchParams.get('format')==='story'),'frames are drawn at 9:16');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')&&c.body.creation_id.startsWith('8')).length,5,'five story publishes');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/456/photo_stories')).length,5,'five Page stories');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/456/photos')&&c.body.published===false).length,5+7,'unpublished photos for the story frames and the feed post');
 const heads=h.calls.filter(c=>c.init.method==='HEAD'&&new URL(c.url).searchParams.get('format')==='story');
 assert.equal(heads.length,10,'every frame is preflighted for each story channel');
 const rows=h.sqlite.prepare("SELECT channel,status,post_id,progress FROM social_deliveries WHERE channel LIKE '%_story' ORDER BY channel").all();
 assert.equal(rows.length,2);
 for(const row of rows){assert.equal(row.status,'posted');assert.equal(row.post_id.split(',').length,5,row.channel);const p=JSON.parse(row.progress);assert.equal(p.done.length,5);assert.equal(p.at,null);assert.equal(p.container,null);}
 const again=await h.run();
 assert.equal(again.channels.instagram_story,'posted');assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')&&c.body?.media_type==='STORIES').length,5,'a second run repeats no frame');
});
test('a story frame still processing is resumed from that frame, without repeating the frames already in the tray',async()=>{
 let polls=0;
 const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async(url)=>{ if(url.endsWith('/803?fields=status_code')&&polls++<=CONTAINER_WAITS.length)return Response.json({status_code:'IN_PROGRESS'}); return null; });
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const first=await h.run();
 assert.equal(first.channels.instagram_story,'preparing');
 assert.deepEqual(h.sleeps,CONTAINER_WAITS,'the run read the frame again after each wait before leaving it');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/803?fields=status_code')).length,1+CONTAINER_WAITS.length);
 const mid=h.sqlite.prepare("SELECT status,progress FROM social_deliveries WHERE channel='instagram_story'").get();
 assert.equal(mid.status,'preparing');const p=JSON.parse(mid.progress);assert.equal(p.done.length,2);assert.equal(p.at,2);assert.equal(p.container,'803');
 const second=await h.run();
 assert.equal(second.channels.instagram_story,'posted');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')&&c.body?.media_type==='STORIES').length,5,'the third frame keeps its container; the last two are new');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')&&c.body.creation_id.startsWith('8')).length,5);
 const done=h.sqlite.prepare("SELECT status,post_id FROM social_deliveries WHERE channel='instagram_story'").get();
 assert.equal(done.status,'posted');assert.equal(done.post_id.split(',').length,5);
});
test('story channels post nothing for an edition without a story, and a frame in the wrong shape keeps only that channel closed',async()=>{
 const h=harness({...storyEnv});
 const r=await h.run();
 assert.equal(r.channels.instagram_story,'nothing to post');assert.equal(r.channels.facebook_story,'nothing to post');assert.equal(r.channels.x,'posted');
 assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM social_deliveries WHERE channel LIKE '%_story'").get().n,0,'no receipt for nothing');
 const h2=harness({...storyEnv},async(url,init)=>init.method==='HEAD'&&new URL(url).searchParams.get('format')==='story'?new Response(null,{headers:{'content-type':'image/jpeg','x-opax-story':/\/(\d{4}-\d{2}-\d{2}\/\d+)\.jpg/.exec(url)[1],'x-opax-format':'portrait'}}):null);
 h2.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const r2=await h2.run();
 assert.equal(r2.channels.instagram_story,'failed');assert.equal(r2.channels.facebook_story,'failed');assert.equal(r2.channels.instagram,'posted');assert.equal(r2.channels.facebook,'posted');
 assert.equal(h2.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='instagram_story'").get().detail,'Story slide unavailable');
 assert.equal(h2.calls.filter(c=>c.body?.media_type==='STORIES').length,0,'no story container is created');
});

test('engagement reads account and feed-post metrics, skips stories, reports a refusal as a code',async()=>{
 const h=harness({},async(url)=>{
  if(url.includes('/2/users/me?user.fields=public_metrics'))return Response.json({data:{id:'123',username:'OpaxAustralia',public_metrics:{followers_count:3,following_count:84,tweet_count:6}}});
  if(url.startsWith('https://api.x.com/2/tweets?ids=1001'))return Response.json({data:[{id:'1001',public_metrics:{like_count:2,reply_count:1,retweet_count:1,quote_count:0,impression_count:40,bookmark_count:0}}]});
  if(url.endsWith('/456?fields=followers_count,fan_count'))return Response.json({followers_count:12,fan_count:11});
  if(url.endsWith('/456_1002?fields=reactions.summary(total_count).limit(0),shares'))return Response.json({reactions:{summary:{total_count:5}},shares:{count:1}});
  if(url.endsWith('/456_1002?fields=comments.summary(total_count).limit(0)'))return Response.json({comments:{summary:{total_count:2}}});
  if(url.endsWith('/789?fields=followers_count,media_count'))return Response.json({error:{message:'secret',code:10,error_subcode:2069030}},{status:403});
  if(url.endsWith('/1003?fields=like_count,comments_count'))return Response.json({like_count:7,comments_count:0});
 });
 const at=new Date(now).toISOString();
 for(const [c,id] of [['x','1001'],['facebook','456_1002'],['instagram','1003'],['instagram_story','800,801']]) h.sqlite.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,?,?,?,?)').run(post.date,c,'posted',id,at);
 h.sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run('2026-09-12','person:Other',JSON.stringify({...post,date:'2026-09-12'}),at);
 h.sqlite.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,?,?,?,?)').run('2026-09-12','x','failed',null,at);
 const e=await socialEngagement(h.env,{fetchImpl:h.fetchImpl,now});
 assert.deepEqual(e.accounts.x,{followers:3,following:84,posts:6});
 assert.deepEqual(e.accounts.facebook,{followers:12,likes:11});
 assert.equal(e.accounts.instagram,undefined);assert.equal(e.errors.instagram,'Provider HTTP 403 code 10/2069030');
 assert.deepEqual(e.posts.map(p=>p.channel).sort(),['facebook','instagram','x']);
 assert.deepEqual(e.posts.find(p=>p.channel==='x'),{date:post.date,channel:'x',post_id:'1001',likes:2,comments:1,shares:1,views:40,bookmarks:0});
 assert.deepEqual(e.posts.find(p=>p.channel==='facebook'),{date:post.date,channel:'facebook',post_id:'456_1002',likes:5,comments:2,shares:1});
 assert.deepEqual(e.posts.find(p=>p.channel==='instagram'),{date:post.date,channel:'instagram',post_id:'1003',likes:7,comments:0});
});

test('bluesky posts a link card with the share image as thumb and journals the at-uri',async()=>{
 const only={X_ACCOUNT_ID:undefined,FACEBOOK_POST_ENABLED:'false',INSTAGRAM_POST_ENABLED:'false',INSTAGRAM_STORY_ENABLED:'false',FACEBOOK_STORY_ENABLED:'false',BLUESKY_POST_ENABLED:'true',BSKY_HANDLE:'opax.bsky.social',BSKY_APP_PASSWORD:'app-pass'};
 const off=harness({...only,BSKY_APP_PASSWORD:undefined});assert.equal(readiness(off.env).bluesky.ready,false);await off.run();assert.equal(off.calls.length,0);
 const h=harness(only);assert.equal(readiness(h.env).bluesky.ready,true);
 assert.equal(publicationCopy(post,'bluesky').text,'Check the parliamentary record.\n\n#auspol');
 const long={...post,text:'x'.repeat(350)+'\n\n'+post.url};assert.ok([...publicationCopy(long,'bluesky').text].length<=300);assert.match(publicationCopy(long,'bluesky').text,/\n\n#auspol$/);
 const r=await h.run();assert.deepEqual(r.channels,{bluesky:'posted'});
 const login=h.calls.filter(c=>c.url.endsWith('/xrpc/com.atproto.server.createSession'));assert.equal(login.length,2);assert.equal(login[0].body.identifier,'opax.bsky.social');
 const upload=h.calls.find(c=>c.url.endsWith('/xrpc/com.atproto.repo.uploadBlob'));assert.equal(upload.init.headers.authorization,'Bearer jwt');assert.equal(upload.init.headers['content-type'],'image/jpeg');
 const create=h.calls.find(c=>c.url.endsWith('/xrpc/com.atproto.repo.createRecord'));assert.equal(create.body.repo,'did:plc:test');assert.equal(create.body.collection,'app.bsky.feed.post');
 const rec=create.body.record;assert.equal(rec.text,'Check the parliamentary record.\n\n#auspol');assert.doesNotMatch(rec.text,/https:/);assert.deepEqual(rec.facets,[{index:{byteStart:33,byteEnd:40},features:[{$type:'app.bsky.richtext.facet#tag',tag:'auspol'}]}]);
 assert.equal(rec.embed.$type,'app.bsky.embed.external');assert.equal(new URL(rec.embed.external.uri).searchParams.get('utm_source'),'bluesky');assert.equal(rec.embed.external.title,'Test Member');assert.equal(rec.embed.external.thumb.ref.$link,'bafyblob');
 const row=h.sqlite.prepare("SELECT status,post_id FROM social_deliveries WHERE channel='bluesky'").get();assert.deepEqual({...row},{status:'posted',post_id:'at://did:plc:test/app.bsky.feed.post/3kabc'});
 // A wrong account answers the session: nothing is written and the journal says why.
 const wrong=harness(only,async(url)=>{if(url.endsWith('/xrpc/com.atproto.server.createSession'))return Response.json({accessJwt:'jwt',did:'did:plc:other',handle:'someone.bsky.social'});});
 assert.deepEqual((await wrong.run()).channels,{bluesky:'failed'});assert.equal(wrong.calls.some(c=>c.url.endsWith('createRecord')),false);
 assert.equal(wrong.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='bluesky'").get().detail,'Bluesky account mismatch');
});
test('engagement reads bluesky from the public AppView without credentials',async()=>{
 const h=harness({BSKY_HANDLE:'opax.bsky.social'},async(url)=>{
  if(url.includes('public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=opax.bsky.social'))return Response.json({followersCount:9,followsCount:40,postsCount:3});
  if(url.includes('public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=at%3A%2F%2Fdid%3Aplc%3Atest%2Fapp.bsky.feed.post%2F3kabc'))return Response.json({posts:[{uri:'at://did:plc:test/app.bsky.feed.post/3kabc',likeCount:4,repostCount:1,replyCount:2,quoteCount:1}]});
  if(url.includes('/2/users/me?user.fields'))return Response.json({data:{public_metrics:{followers_count:3,following_count:84,tweet_count:6}}});
  if(url.endsWith('/456?fields=followers_count,fan_count'))return Response.json({followers_count:4,fan_count:4});
  if(url.endsWith('/789?fields=followers_count,media_count'))return Response.json({followers_count:6,media_count:4});
 });
 const at=new Date(now).toISOString();
 h.sqlite.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,?,?,?,?)').run(post.date,'bluesky','posted','at://did:plc:test/app.bsky.feed.post/3kabc',at);
 const e=await socialEngagement(h.env,{fetchImpl:h.fetchImpl,now});
 assert.deepEqual(e.accounts.bluesky,{followers:9,following:40,posts:3});
 assert.deepEqual(e.posts,[{date:post.date,channel:'bluesky',post_id:'at://did:plc:test/app.bsky.feed.post/3kabc',likes:4,comments:2,shares:2}]);
 assert.equal(h.calls.some(c=>c.url.includes('createSession')),false);
});

test('every channel carries #auspol; Instagram swaps the unfollowed tags for kind tags, never a party',()=>{
 assert.match(publicationCopy(post,'x').text,/\n\n#auspol$/);
 assert.match(publicationCopy(post,'facebook').text,/\n\n#auspol$/);
 const ig=publicationCopy(post,'instagram').text;
 assert.match(ig,/#auspol #australianpolitics #parliament #opax$/);assert.doesNotMatch(ig,/#AustralianParliament|#PublicRecords/);
 assert.deepEqual(instagramTags({kind:'grant'}),['#auspol','#australianpolitics','#grants','#publicmoney','#opax']);
 assert.deepEqual(instagramTags({kind:'bill'}),['#auspol','#australianpolitics','#legislation','#parliament','#opax']);
 // An X post already at the limit keeps its words and drops the tag.
 const full={...post,text:'y'.repeat(254)+'\n\n'+post.url};
 assert.equal(publicationCopy(full,'x').text.includes('#auspol'),false);
 assert.ok(publicationCopy({...post,text:'y'.repeat(240)+'\n\n'+post.url},'x').text.endsWith('#auspol'));
});
test('Bluesky hashtags become tag facets at UTF-8 byte offsets',()=>{
 const text='Grant for the Café — roof\n\n#auspol';
 const [f]=tagFacets(text);const bytes=new TextEncoder().encode(text);
 assert.equal(new TextDecoder().decode(bytes.slice(f.index.byteStart,f.index.byteEnd)),'#auspol');
 assert.deepEqual(f.features,[{$type:'app.bsky.richtext.facet#tag',tag:'auspol'}]);
 assert.deepEqual(tagFacets('no tags, a C# note and url#frag'),[]);
 assert.equal(tagFacets('#one and #two').length,2);
});
test('the bio link opens the latest edition with bio UTMs, home without one',async()=>{
 const h=harness();
 let r=await todayRedirect(h.env,new URL('https://opax.com.au/today'),'2026-08-13');
 assert.equal(r.status,302);let to=new URL(r.headers.get('location'));assert.equal(to.pathname,'/');assert.equal(to.searchParams.get('utm_campaign'),'bio_link');
 h.sqlite.prepare('INSERT INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').run('2026-08-12',post.subject,JSON.stringify({...post,date:'2026-08-12',url:'https://opax.com.au/money/grants/federal/recipient/abn%3A97694995462?award=GA34203'}),'x');
 h.sqlite.prepare('INSERT INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').run('2026-08-14',post.subject,JSON.stringify(post),'x');
 r=await todayRedirect(h.env,new URL('https://opax.com.au/today?via=bluesky'),'2026-08-13');to=new URL(r.headers.get('location'));
 assert.equal(to.pathname,'/money/grants/federal/recipient/abn%3A97694995462');assert.equal(to.searchParams.get('award'),'GA34203');
 assert.deepEqual([to.searchParams.get('utm_source'),to.searchParams.get('utm_medium'),to.searchParams.get('utm_content')],['bluesky','social','2026-08-12']);
 r=await todayRedirect(h.env,new URL('https://opax.com.au/today?via=Evil%20Thing'),'2026-08-13');assert.equal(new URL(r.headers.get('location')).searchParams.get('utm_source'),'instagram');
 h.sqlite.prepare('INSERT INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').run('2026-08-13',post.subject,JSON.stringify({...post,url:'https://evil.example/x'}),'x');
 r=await todayRedirect(h.env,new URL('https://opax.com.au/today'),'2026-08-13');assert.equal(new URL(r.headers.get('location')).origin,'https://opax.com.au');
 // A topic edition's report while the reports are withdrawn (REPORTS_ENABLED): home instead; published, the report.
 h.sqlite.prepare('INSERT INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').run('2026-08-15','topic:housing',JSON.stringify({...post,date:'2026-08-15',subject:'topic:housing',url:'https://opax.com.au/reports/housing'}),'x');
 r=await todayRedirect(h.env,new URL('https://opax.com.au/today'),'2026-08-15');to=new URL(r.headers.get('location'));
 assert.equal(to.pathname,'/');assert.equal(to.searchParams.get('utm_content'),'home');
 r=await todayRedirect({...h.env,REPORTS_ENABLED:'true'},new URL('https://opax.com.au/today'),'2026-08-15');
 assert.equal(new URL(r.headers.get('location')).pathname,'/reports/housing');
});
test('a program or a month on the grants page shares its own card, never the page\'s generic one',()=>{
 const program={...post,kind:'program',url:'https://opax.com.au/money/grants?jur=federal&program=go6047'};
 for(const channel of ['x','bluesky','facebook','instagram']){
  const image=new URL(publicationCopy(program,channel).image);
  assert.equal(image.pathname,'/og/money/grants.jpg');assert.equal(image.searchParams.get('program'),'go6047');assert.equal(image.searchParams.get('jur'),'federal');
  assert.equal(new URL(publicationCopy(program,channel).link).searchParams.get('program'),'go6047');
 }
 const month=new URL(publicationCopy({...post,kind:'largest',url:'https://opax.com.au/money/grants?jur=federal&largest=2026-08'},'instagram').image);
 assert.equal(month.searchParams.get('largest'),'2026-08');assert.equal(month.searchParams.get('format'),'portrait');
 assert.deepEqual(instagramTags({kind:'program'}),['#auspol','#australianpolitics','#grants','#publicmoney','#opax']);
 assert.deepEqual(instagramTags({kind:'largest'}),['#auspol','#australianpolitics','#grants','#publicmoney','#opax']);
});
test('a clean recipient link keeps its colon in the share image path the preflight compares',()=>{
 const url='https://opax.com.au/money/grants/federal/recipient/abn:18374210672?award=GA123';
 const grant={...post,kind:'grant',url,text:`$4m grant to redevelop Windsor Park.\n\n${url}`};
 for(const channel of ['x','bluesky','facebook','instagram']){
  const c=publicationCopy(grant,channel);
  assert.equal(new URL(c.image).pathname,'/og/money/grants/federal/recipient/abn:18374210672.jpg');
  assert.equal(new URL(c.image).searchParams.get('award'),'GA123');
  assert.equal(new URL(c.link).pathname,'/money/grants/federal/recipient/abn:18374210672');
 }
 assert.match(publicationCopy(grant,'x').text,/recipient\/abn:18374210672\?award=GA123/);
});

test('all six electoral channel templates retain the exact line even after caption truncation', async () => {
 const line='Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little Collins Street, Melbourne VIC 3000.';
 const electoral={...story,title:'Victorian election 2026',url:'https://opax.com.au/vic-election-2026',text:'Official dates and parliamentary records.\n\nhttps://opax.com.au/vic-election-2026',caption:'Source-qualified records. '.repeat(400)};
 for(const channel of ['x','bluesky','facebook','instagram','instagram_story','facebook_story']) {
  const copy=publicationCopy(electoral,channel);
  assert.ok(copy.text.includes(line),channel);
  assert.equal(copy.text.split(line).length-1,1,channel+' includes it once');
  if(channel==='x')assert.ok([...copy.text.replace(/https?:\/\/\S+/g,'x'.repeat(23))].length<=280);
  if(channel==='bluesky')assert.ok([...copy.text].length<=300);
 }
 const h=harness();
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(electoral));
 const frozen=await previewPublication(h.env,post.date,()=>assert.fail('Frozen edition requested generation'));
 assert.equal(frozen.authorisation,line);
 for(const slide of frozen.slides)assert.equal(slide.authorisation,line);
 assert.equal(h.calls.length,0,'preview and copy do not send requests');
 h.sqlite.close();
});

test('a failure outside the known reasons is journalled as a category and the error class, never its text',()=>{
 // Every known reason is kept exactly as thrown.
 for(const m of ['Provider HTTP 500','Provider timeout','Provider omitted post id','X identity HTTP 401','X API HTTP 403','X account mismatch','X did not return a post id','Facebook Page token mismatch','Instagram account mismatch','Instagram container not publishable','Instagram container already published','Instagram container still processing','Source page or matching image unavailable','Grant award image mismatch','Portrait image unavailable','Story slide unavailable','Meta API version not configured','Bluesky session HTTP 401','Bluesky API HTTP 400','Bluesky account mismatch','Bluesky did not return a post uri'])assert.equal(failureDetail(new Error(m)),m);
 // Meta's numeric code rides on the status, digits only.
 assert.equal(failureDetail(new Error('Provider HTTP 400 code 9007/2207027')),'Provider HTTP 400 code 9007/2207027');
 assert.equal(failureDetail(new Error('Provider HTTP 403 code 10')),'Provider HTTP 403 code 10');
 assert.equal(failureDetail(new Error('Provider HTTP 400 code 10 and the token ig-token')),'Unexpected error (Error)');
 // The Workers subrequest limit, by the word Cloudflare names it with: the docs give the limit, not the message.
 assert.equal(failureDetail(new Error('Too many subrequests.'),true),'Worker limit (subrequests)');
 assert.equal(failureDetail(new Error('Too many subrequests by single Worker invocation.')),'Worker limit (subrequests)');
 // D1's documented messages.
 assert.equal(failureDetail(new Error('D1_ERROR: database is locked')),'Database error (Error)');
 assert.equal(failureDetail(new Error('D1_EXEC_ERROR: Error in line 1: near "X": syntax error')),'Database error (Error)');
 assert.equal(failureDetail(new Error('D1 DB is overloaded. Too many requests queued.')),'Database error (Error)');
 // A request that got no HTTP answer, and the runtime's documented connection failure.
 assert.equal(failureDetail(new TypeError('fetch failed'),true),'Network error (TypeError)');
 assert.equal(failureDetail(new Error('Network connection lost.')),'Network error (Error)');
 assert.equal(failureDetail(new DOMException('The operation was aborted due to timeout','TimeoutError'),true),'Timeout (DOMException)');
 // Anything else: the class alone.
 assert.equal(failureDetail(new TypeError("Cannot read properties of undefined (reading 'alt')")),'Unexpected error (TypeError)','a TypeError from the code is not a network error');
 assert.equal(failureDetail(new SyntaxError('Unexpected token < in JSON')),'Unexpected error (SyntaxError)');
 assert.equal(failureDetail('a thrown string with ig-token'),'Unexpected error (string)');
 assert.equal(failureDetail(undefined),'Unexpected error (undefined)');
 class Odd extends Error {} Object.defineProperty(Odd,'name',{value:'Odd name with page-token'});
 assert.equal(failureDetail(new Odd('x')),'Unexpected error (unknown)');
 // Only an Error's class is read: a thrown plain object's `constructor` is its own data, never stored.
 assert.equal(failureDetail({constructor:{name:'EAAGtoken1234'}}),'Unexpected error (object)');
 // An Error's class comes from its prototype: a `constructor` set on the error itself is data too.
 assert.equal(failureDetail(Object.assign(new Error('x'),{constructor:{name:'EAAGtoken1234'}})),'Unexpected error (Error)');
 assert.equal(failureDetail(Object.assign(new TypeError('x'),{constructor:{name:'EAAGtoken1234'}}),true),'Network error (TypeError)');
 assert.equal(failureDetail({name:'TimeoutError',constructor:{name:'EAAGtoken1234'}}),'Timeout (object)');
 assert.equal(failureDetail(null),'Unexpected error (null)');
});
test('a story publish that fails without an HTTP answer is held for review under its category, never its text, and is not tried again',async()=>{
 const only={...storyEnv,FACEBOOK_STORY_ENABLED:'false',FACEBOOK_POST_ENABLED:'false',INSTAGRAM_POST_ENABLED:'false',DAILY_POST_ENABLED:'false'};
 const cases=[
  ['no answer',()=>{throw new TypeError('fetch failed for ig-token')},'Network error (TypeError)'],
  ['subrequest limit',()=>{throw new Error('Too many subrequests.')},'Worker limit (subrequests)'],
  ['not JSON',()=>new Response('<html>ig-token</html>'),'Unexpected error (SyntaxError)'],
 ];
 for(const [label,answer,detail] of cases){
  const h=harness(only,async url=>url.endsWith('/789/media_publish')?answer():null);
  h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
  assert.equal((await h.run()).channels.instagram_story,'review_required',label);
  const row=h.sqlite.prepare("SELECT status,detail,progress FROM social_deliveries WHERE channel='instagram_story'").get();
  assert.equal(row.status,'review_required',label);assert.equal(row.detail,detail,label);assert.doesNotMatch(JSON.stringify(row),/ig-token/,label);
  assert.equal(JSON.parse(row.progress).container,'801',label+': the frame keeps its container');
  await h.run();assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,1,label+': held, never repeated');
 }
 // The journal write after a frame is published fails: the frame may be in the tray, so it is held for review.
 const h=harness(only);h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const db=h.env.COMMUNITY_DB;
 h.env.COMMUNITY_DB={prepare(sql){const st=db.prepare(sql);if(!sql.startsWith('UPDATE social_deliveries SET progress'))return st;let args=[];return {bind(...a){args=a;st.bind(...a);return this},first:()=>st.first(),all:()=>st.all(),async run(){if(JSON.parse(args[0]).done.length)throw new Error('D1_ERROR: Network connection lost.');return st.run()}}}};
 assert.equal((await h.run()).channels.instagram_story,'review_required');
 assert.deepEqual({...h.sqlite.prepare("SELECT status,detail FROM social_deliveries WHERE channel='instagram_story'").get()},{status:'review_required',detail:'Database error (Error)'});
});
test('a Meta refusal keeps its numeric code in the journal',async()=>{
 const h=harness({},async url=>url.endsWith('/789/media_publish')?Response.json({error:{message:'secret text',code:100,error_subcode:33}},{status:400}):null);
 await h.run();
 assert.deepEqual({...h.sqlite.prepare("SELECT status,detail FROM social_deliveries WHERE channel='instagram'").get()},{status:'review_required',detail:'Provider HTTP 400 code 100/33'});
 const h2=harness({},async url=>url.endsWith('/me?fields=id')?Response.json({error:{message:'secret text',code:190}},{status:401}):null);
 await h2.run();
 assert.deepEqual({...h2.sqlite.prepare("SELECT status,detail FROM social_deliveries WHERE channel='facebook'").get()},{status:'failed',detail:'Provider HTTP 401 code 190'});
 assert.doesNotMatch(JSON.stringify([...h.sqlite.prepare('SELECT * FROM social_deliveries').all(),...h2.sqlite.prepare('SELECT * FROM social_deliveries').all()]),/secret text/);
});

// Meta's "The media is not ready for publishing, please wait for a moment".
const notReady=()=>Response.json({error:{message:'The media is not ready for publishing, please wait for a moment',code:9007,error_subcode:2207027}},{status:400});
const tick=minutes=>now+minutes*60000; // the harness's `now` is 22:00 UTC
test('a run may leave a container for the next tick only until a minute before it, and never after the last of the three',()=>{
 const crons=/"crons":\s*\[([^\]]*)\]/.exec(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'))[1];
 assert.match(crons,/"0,5,10 22 \* \* \*"/,'the daily ticks are 22:00, 22:05 and 22:10 UTC');
 assert.deepEqual([0,3,5,8,9,10,15,-1].map(m=>leaveBy(tick(m))),[tick(4),tick(4),tick(9),tick(9),tick(9),null,null,null]);
 assert.equal(leaveBy(tick(10)-1),tick(9),'22:09:59 still counts as before the last tick, with its deadline already gone');
});
test('a container still processing is read again within the run, and published when it finishes',async()=>{
 let reads=0;const h=harness({},async url=>url.endsWith('/999?fields=status_code')?Response.json({status_code:reads++<1?'IN_PROGRESS':'FINISHED'}):null);
 assert.equal((await h.run()).channels.instagram,'posted');
 assert.equal(reads,2);assert.deepEqual(h.sleeps,[CONTAINER_WAITS[0]]);
});
test('a carousel Meta calls not ready waits for the next tick with the same container, then posts once',async()=>{
 let refusals=1;const h=harness({},async url=>url.endsWith('/789/media_publish')&&refusals-->0?notReady():null);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify(story));
 const first=await h.run(tick(0));
 assert.equal(first.channels.instagram,'preparing');assert.equal(first.channels.x,'posted');assert.equal(first.channels.facebook,'posted');
 const row=h.sqlite.prepare("SELECT status,container_id,detail,progress FROM social_deliveries WHERE channel='instagram'").get();
 assert.equal(row.status,'preparing');assert.equal(row.container_id,'999');assert.equal(row.detail,null);assert.equal(JSON.parse(row.progress).refused,1);
 assert.equal((await h.run(tick(5))).channels.instagram,'posted');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media')).length,4,'children and parent created once');
 assert.deepEqual(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).map(c=>c.body.creation_id),['999','999']);
 assert.equal(h.sqlite.prepare("SELECT post_id FROM social_deliveries WHERE channel='instagram'").get().post_id,'1003');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/2/tweets')).length,1);assert.equal(h.calls.filter(c=>c.url.endsWith('/456/feed')).length,1);
});
test('a story frame Meta calls not ready keeps its container and is published at the next tick, no frame repeated',async()=>{
 let refusals=1;const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async(url,init)=>url.endsWith('/789/media_publish')&&JSON.parse(init.body).creation_id==='803'&&refusals-->0?notReady():null);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 assert.equal((await h.run(tick(0))).channels.instagram_story,'preparing');
 const mid=h.sqlite.prepare("SELECT status,detail,progress FROM social_deliveries WHERE channel='instagram_story'").get();
 assert.equal(mid.status,'preparing');assert.equal(mid.detail,null);
 const p=JSON.parse(mid.progress);assert.equal(p.done.length,2);assert.equal(p.at,2);assert.equal(p.container,'803');assert.equal(p.refused,1);
 assert.equal((await h.run(tick(5))).channels.instagram_story,'posted');
 assert.equal(h.calls.filter(c=>c.body?.media_type==='STORIES').length,5,'the third frame keeps its container');
 assert.deepEqual(h.calls.filter(c=>c.url.endsWith('/789/media_publish')&&c.body.creation_id.startsWith('8')).map(c=>c.body.creation_id),['801','802','803','803','804','805']);
 const done=h.sqlite.prepare("SELECT status,post_id FROM social_deliveries WHERE channel='instagram_story'").get();
 assert.equal(done.status,'posted');assert.equal(done.post_id.split(',').length,5);
});
test('not ready on every tick ends in review after 22:10, and nothing is tried again',async()=>{
 const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async url=>url.endsWith('/789/media_publish')?notReady():null);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const states=[];
 for(const m of [0,5,10]){const r=await h.run(tick(m));states.push([r.channels.instagram,r.channels.instagram_story])}
 assert.deepEqual(states,[['preparing','preparing'],['preparing','preparing'],['review_required','review_required']]);
 for(const channel of ['instagram','instagram_story'])assert.deepEqual({...h.sqlite.prepare('SELECT status,detail FROM social_deliveries WHERE channel=?').get(channel)},{status:'review_required',detail:'Provider HTTP 400 code 9007/2207027'},channel);
 const publishes=h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length;
 assert.equal(publishes,6,'one refusal a tick for each channel');
 // A later run under the same date (a stray tick, an operator's run) tries nothing more.
 await h.run(tick(15));await h.run(tick(60));
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,publishes);
 assert.equal(JSON.parse(h.sqlite.prepare("SELECT progress FROM social_deliveries WHERE channel='instagram_story'").get().progress).done.length,0,'no frame reached the tray');
});
test('the not-ready wait is capped at two, holds only before the last tick, and only for that refusal',async()=>{
 const h=harness({},async url=>url.endsWith('/789/media_publish')?notReady():null);
 const out=[];for(const m of [0,1,2])out.push((await h.run(tick(m))).channels.instagram);
 assert.deepEqual(out,['preparing','preparing','review_required'],'a third refusal goes to review even before 22:10');
 // An operator's run outside the cron's window: review at once, as before.
 const h2=harness({},async url=>url.endsWith('/789/media_publish')?notReady():null);
 assert.equal((await h2.run(Date.UTC(2026,8,13,3))).channels.instagram,'review_required');
 // Any other refusal of a publish, an expired container among them, goes to review at once.
 const h3=harness({},async url=>url.endsWith('/789/media_publish')?Response.json({error:{code:24,error_subcode:2207008}},{status:400}):null);
 assert.equal((await h3.run(tick(0))).channels.instagram,'review_required');
 assert.equal(h3.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='instagram'").get().detail,'Provider HTTP 400 code 24/2207008');
});
test('a container that reads PUBLISHED after a not-ready refusal is held for review and never published again',async()=>{
 // Meta answered "not ready" at 22:00 but published anyway: at 22:05 the container reads PUBLISHED.
 const refused=new Set();
 const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async(url,init)=>{
  if(url.endsWith('/789/media_publish')){const id=JSON.parse(init.body).creation_id;if(id==='999'||id==='803'){refused.add(id);return notReady()}}
  const read=/\/(\d+)\?fields=status_code$/.exec(url);
  if(read&&refused.has(read[1]))return Response.json({status_code:'PUBLISHED'});
  return null;
 });
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const first=await h.run(tick(0));
 assert.equal(first.channels.instagram,'preparing');assert.equal(first.channels.instagram_story,'preparing');
 const publishes=h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length;
 const second=await h.run(tick(5));
 assert.equal(second.channels.instagram,'review_required');assert.equal(second.channels.instagram_story,'review_required');
 for(const channel of ['instagram','instagram_story'])assert.deepEqual({...h.sqlite.prepare('SELECT status,detail FROM social_deliveries WHERE channel=?').get(channel)},{status:'review_required',detail:'Instagram container already published'},channel);
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,publishes,'no publish after the PUBLISHED read');
 const p=JSON.parse(h.sqlite.prepare("SELECT progress FROM social_deliveries WHERE channel='instagram_story'").get().progress);
 assert.equal(p.done.length,2);assert.equal(p.container,'803','the journal keeps the frame that went through');
 assert.equal(h.calls.filter(c=>c.body?.media_type==='STORIES').length,3,'no later frame is started');
 await h.run(tick(10));
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,publishes,'22:10 tries nothing');
});
test('a refusal that reaches a run after the next tick has passed its row over is held for review',async()=>{
 // Refused at 22:00. The 22:05 run is still publishing when the whole 22:10 run goes by and passes over the
 // row (it is `sending`); then Meta's second not-ready answer reaches the 22:05 run, on a clock now past 22:10.
 let wall=null,inner=null;
 const h=harness({},async url=>{
  if(!url.endsWith('/789/media_publish'))return null;
  if(wall===tick(5)){wall=tick(10);inner=await h.run(tick(10))}
  return notReady();
 });
 assert.equal((await h.run(tick(0))).channels.instagram,'preparing');
 wall=tick(5);
 const late=await h.run(tick(5),()=>wall);
 assert.equal(inner.channels.instagram,'sending','the 22:10 run passed over the row the 22:05 run held');
 assert.equal(late.channels.instagram,'review_required');
 assert.deepEqual({...h.sqlite.prepare("SELECT status,detail FROM social_deliveries WHERE channel='instagram'").get()},{status:'review_required',detail:'Provider HTTP 400 code 9007/2207027'});
 const publishes=h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length;
 assert.equal(publishes,2);
 await h.run(tick(15));await h.run(tick(60));
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,publishes,'nothing is tried again');
});
test('a frame still processing when the next tick has passed its row over is held for review, with no more waits',async()=>{
 let wall=null,inner=null;
 const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async url=>{
  if(!url.endsWith('/803?fields=status_code'))return null;
  if(wall===tick(5)){wall=tick(10);inner=await h.run(tick(10))}
  return Response.json({status_code:'IN_PROGRESS'});
 });
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 assert.equal((await h.run(tick(0))).channels.instagram_story,'preparing');
 const waited=h.sleeps.length;
 wall=tick(5);
 const late=await h.run(tick(5),()=>wall);
 assert.equal(inner.channels.instagram_story,'sending');
 assert.equal(late.channels.instagram_story,'review_required');
 assert.equal(h.sleeps.length,waited,'a run past its waiting time reads once and waits no more');
 const row=h.sqlite.prepare("SELECT status,detail,progress FROM social_deliveries WHERE channel='instagram_story'").get();
 assert.equal(row.status,'review_required');assert.equal(row.detail,'Instagram container still processing');
 const p=JSON.parse(row.progress);assert.equal(p.done.length,2,'the frames already in the tray stay recorded');assert.equal(p.container,'803');
});
test('four minutes past its tick a run holds a refusal or a processing container for review; three minutes past, it reads once and hands the row back',async()=>{
 for(const [label,clock,want] of [['3:59 past',()=>tick(4)-1000,'preparing'],['4:00 past',()=>tick(4),'review_required']]){
  const h=harness({},async url=>url.endsWith('/789/media_publish')?notReady():null);
  assert.equal((await h.run(tick(0),clock)).channels.instagram,want,label);
 }
 const processing=async url=>url.endsWith('/999?fields=status_code')?Response.json({status_code:'IN_PROGRESS'}):null;
 const h=harness({},processing);
 assert.equal((await h.run(tick(0),()=>tick(4))).channels.instagram,'review_required');
 assert.equal(h.sqlite.prepare("SELECT detail FROM social_deliveries WHERE channel='instagram'").get().detail,'Instagram container still processing');
 const h2=harness({},processing);
 assert.equal((await h2.run(tick(0),()=>tick(3))).channels.instagram,'preparing');
 assert.deepEqual(h2.sleeps,[]);assert.equal(h2.calls.filter(c=>c.url.endsWith('/999?fields=status_code')).length,1);
});
test('a container still processing at the last tick is held for review, and nothing is tried again',async()=>{
 const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async url=>/\/(999|801)\?fields=status_code$/.test(url)?Response.json({status_code:'IN_PROGRESS'}):null);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const states=[];
 for(const m of [0,5,10]){const r=await h.run(tick(m));states.push([r.channels.instagram,r.channels.instagram_story])}
 assert.deepEqual(states,[['preparing','preparing'],['preparing','preparing'],['review_required','review_required']]);
 for(const channel of ['instagram','instagram_story'])assert.deepEqual({...h.sqlite.prepare('SELECT status,detail FROM social_deliveries WHERE channel=?').get(channel)},{status:'review_required',detail:'Instagram container still processing'},channel);
 const reads=h.calls.filter(c=>c.url.endsWith('?fields=status_code')).length;
 await h.run(tick(15));await h.run(tick(60));
 assert.equal(h.calls.filter(c=>c.url.endsWith('?fields=status_code')).length,reads,'no later run reads them again');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/789/media_publish')).length,0);
});
test('an operator\'s run for yesterday inside the cron\'s window holds a refusal or a processing container for review',async()=>{
 const yesterday='2026-09-12';
 const cases=[
  ['not ready',url=>url.endsWith('/789/media_publish')?notReady():null,'Provider HTTP 400 code 9007/2207027'],
  ['processing',url=>url.endsWith('?fields=status_code')?Response.json({status_code:'IN_PROGRESS'}):null,'Instagram container still processing'],
 ];
 for(const [label,handler,detail] of cases){
  const h=harness({},async url=>handler(url));
  h.sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(yesterday,post.subject,JSON.stringify({...post,date:yesterday}),new Date(now).toISOString());
  assert.equal((await h.run(tick(2),()=>tick(2),{date:yesterday})).channels.instagram,'review_required',label);
  assert.deepEqual({...h.sqlite.prepare('SELECT status,detail FROM social_deliveries WHERE edition_date=? AND channel=?').get(yesterday,'instagram')},{status:'review_required',detail},label);
 }
});
test('the cron holds an earlier day\'s delivery still preparing for review as stranded, posts nothing for it, and leaves every other row as it was',async()=>{
 const h=harness(storyEnv);
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const edition=h.sqlite.prepare('INSERT OR IGNORE INTO social_editions VALUES(?,?,?,?)');
 const row=h.sqlite.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,container_id,detail,progress,updated_at) VALUES(?,?,?,?,?,?,?,?)');
 // Sixteen X deliveries already held for review on earlier days (28 Aug to 12 Sep), as production has: never touched.
 for(let i=0;i<16;i++){const day=new Date(Date.UTC(2026,7,28+i)).toISOString().slice(0,10);edition.run(day,post.subject,JSON.stringify({...post,date:day}),day+'T22:00:00.000Z');row.run(day,'x','review_required',null,null,i%2?'Provider timeout':'Unexpected error (TypeError)',null,day+'T22:00:01.000Z')}
 const yesterday='2026-09-12',earlier='2026-09-02';
 // Stranded: a carousel left for a 22:10 tick that never fired, a story stopped between frames, and an older one.
 row.run(yesterday,'instagram','preparing',null,'555',null,'{"done":[],"at":null,"container":null,"refused":1}','2026-09-11T22:05:02.000Z');
 row.run(yesterday,'instagram_story','preparing',null,null,null,'{"done":["1801"],"at":1,"container":"556"}','2026-09-11T22:00:02.000Z');
 row.run(earlier,'instagram','preparing',null,'557',null,null,'2026-09-01T22:00:02.000Z');
 // An earlier day's other states are not the sweep's: a crash mid-send needs reconciling, a failed preflight stays failed.
 row.run(yesterday,'facebook','sending',null,null,null,null,'2026-09-11T22:00:03.000Z');
 row.run(yesterday,'facebook_story','failed',null,null,'Story slide unavailable',null,'2026-09-11T22:00:04.000Z');
 const rows=()=>h.sqlite.prepare('SELECT * FROM social_deliveries WHERE edition_date<? ORDER BY edition_date,channel').all(post.date).map(r=>({...r}));
 const before=rows();
 const result=await h.run(tick(0),()=>tick(0),{holdStranded:true});
 assert.deepEqual(rows(),before.map(r=>r.status==='preparing'?{...r,status:'review_required',detail:'Stranded',updated_at:new Date(tick(0)).toISOString()}:r),'only the three preparing rows moved, keeping their container and progress');
 assert.equal(h.sqlite.prepare("SELECT count(*) n FROM social_deliveries WHERE channel='x' AND status='review_required' AND edition_date<?").get(post.date).n,16);
 // The day's own edition still goes out on every channel; nothing is read or published for a stranded row.
 assert.deepEqual(result.channels,{x:'posted',facebook:'posted',instagram:'posted',instagram_story:'posted',facebook_story:'posted'});
 const strandedCall=c=>/\/55[5-7]\b/.test(c.url)||/"(?:creation_id|photo_id)":"55[5-7]"/.test(JSON.stringify(c.body));
 assert.equal(h.calls.filter(strandedCall).length,0);
 // Held rows are never retried, an operator's run of yesterday's date included.
 const calls=h.calls.length;
 assert.deepEqual((await h.run(tick(2),()=>tick(2),{date:yesterday})).channels,{x:'review_required',facebook:'sending',instagram:'review_required',instagram_story:'review_required',facebook_story:'failed'});
 assert.equal(h.calls.length,calls,'no request at all for yesterday');
});
test('only the cron sweeps, only earlier days, and a failed sweep still lets the day\'s edition go out',async()=>{
 let ready=false;const h=harness({},async url=>url.endsWith('/999?fields=status_code')?Response.json({status_code:ready?'FINISHED':'IN_PROGRESS'}):null);
 const yesterday='2026-09-12';
 h.sqlite.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(yesterday,post.subject,JSON.stringify({...post,date:yesterday}),new Date(now).toISOString());
 h.sqlite.prepare("INSERT INTO social_deliveries(edition_date,channel,status,container_id,updated_at) VALUES(?,'instagram','preparing','555',?)").run(yesterday,'2026-09-11T22:00:02.000Z');
 const status=(date)=>h.sqlite.prepare("SELECT status FROM social_deliveries WHERE edition_date=? AND channel='instagram'").get(date).status;
 // A run without the sweep (an operator's) leaves yesterday's row alone; today's container is left for the next tick.
 assert.equal((await h.run(tick(0),()=>tick(0),{date:post.date})).channels.instagram,'preparing');
 assert.equal(status(yesterday),'preparing');
 // The cron's 22:05 tick holds yesterday's row and finishes today's, which is its own day's and not stranded.
 ready=true;
 assert.equal((await h.run(tick(5),()=>tick(5),{holdStranded:true})).channels.instagram,'posted');
 assert.equal(status(yesterday),'review_required');assert.equal(status(post.date),'posted');
 assert.equal(h.calls.filter(c=>c.url.includes('/555')).length,0);
 // The sweep's write fails: logged, and the run goes on.
 const f=harness();const db=f.env.COMMUNITY_DB;
 f.env.COMMUNITY_DB={prepare(sql){if(sql.includes("detail=?,updated_at=? WHERE status='preparing'"))throw new Error('D1_ERROR: Network connection lost.');return db.prepare(sql)}};
 assert.deepEqual((await f.run(tick(0),()=>tick(0),{holdStranded:true})).channels,{x:'posted',facebook:'posted',instagram:'posted'});
});
