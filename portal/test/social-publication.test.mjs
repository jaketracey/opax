import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const built = await build({ entryPoints: [new URL('../src/social-publication.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { runSocialPublication, publicationCopy, readiness, socialStatus, previewPublication, socialEngagement } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const storyBuilt = await build({ entryPoints: [new URL('../src/story.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { STORY_VERSION, storyFrames } = await import('data:text/javascript;base64,' + Buffer.from(storyBuilt.outputFiles[0].text).toString('base64'));
const post = { date: '2026-09-13', subject: 'person:Test Member', kind: 'politician', title: 'Test Member', text: 'Check the parliamentary record.\n\nhttps://opax.com.au/subject/person/Test%20Member', caption: 'The longer source-qualified caption.\n\nhttps://opax.com.au/subject/person/Test%20Member', url: 'https://opax.com.au/subject/person/Test%20Member' };
const now = Date.UTC(2026,8,12,22);
// A valid story (story.ts): a cover first, one fact a slide, the source last.
const slides = [
 { type:'cover', kicker:'Parliamentarian · Test', title:'Test Member', line:'A test line.', photo:'parliament-house-flagpole', alt:'Parliament House with Test Member.' },
 { type:'number', kicker:'The record', title:'What OPAX holds', lines:['Collected records.'], value:'1,369', label:'speeches in the Opax record', alt:'1,369 speeches.' },
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
 const run=()=>runSocialPublication(env,{now,personTopics:async()=>Response.json({}),fetchImpl});
 return {env,db,sqlite,calls,run,fetchImpl};
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
 const h=harness({...storyEnv,FACEBOOK_STORY_ENABLED:'false'},async(url)=>{ if(url.endsWith('/803?fields=status_code')&&polls++===0)return Response.json({status_code:'IN_PROGRESS'}); return null; });
 h.sqlite.prepare('UPDATE social_editions SET post_json=?').run(JSON.stringify({...story,slides:seven}));
 const first=await h.run();
 assert.equal(first.channels.instagram_story,'preparing');
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
 assert.equal(publicationCopy(post,'bluesky').text,'Check the parliamentary record.');
 const long={...post,text:'x'.repeat(350)+'\n\n'+post.url};assert.ok([...publicationCopy(long,'bluesky').text].length<=300);
 const r=await h.run();assert.deepEqual(r.channels,{bluesky:'posted'});
 const login=h.calls.filter(c=>c.url.endsWith('/xrpc/com.atproto.server.createSession'));assert.equal(login.length,2);assert.equal(login[0].body.identifier,'opax.bsky.social');
 const upload=h.calls.find(c=>c.url.endsWith('/xrpc/com.atproto.repo.uploadBlob'));assert.equal(upload.init.headers.authorization,'Bearer jwt');assert.equal(upload.init.headers['content-type'],'image/jpeg');
 const create=h.calls.find(c=>c.url.endsWith('/xrpc/com.atproto.repo.createRecord'));assert.equal(create.body.repo,'did:plc:test');assert.equal(create.body.collection,'app.bsky.feed.post');
 const rec=create.body.record;assert.equal(rec.text,'Check the parliamentary record.');assert.doesNotMatch(rec.text,/https:/);
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
