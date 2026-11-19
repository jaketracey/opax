import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';

const folder=mkdtempSync(join(tmpdir(),'opax-operator-auth-test-'));
const omitImages={name:'omit-image-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function renderOgPng(){throw Error("No images in operator tests")}; export const renderOgJpeg=renderOgPng; export const renderStoryJpeg=renderOgPng;',loader:'js'}))}};
await build({entryPoints:['operator-auth','index'].map(name=>new URL('../src/'+name+'.ts',import.meta.url).pathname),outdir:folder,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire as __opaxCreateRequire} from 'node:module';const require=__opaxCreateRequire(import.meta.url);"},plugins:[omitImages]});
const {operatorAuthorized}=await import(pathToFileURL(join(folder,'operator-auth.js')));
const {default:worker}=await import(pathToFileURL(join(folder,'index.js')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));

const routes=[
 {label:'reviewer status',path:'/api/ops/reviewer-login',method:'GET'},
 {label:'daily-post engagement',path:'/api/daily-post/engagement',method:'GET'},
 {label:'daily-post run',path:'/api/daily-post/run',method:'POST'},
 {label:'Ask gold',path:'/api/ops/ask-gold',method:'POST',handler:'apiAgenticGold',status:409},
];
const cachedEngagement={at:'test-only',accounts:{},posts:[],errors:{}};

function fixture(t){
 const logs=[],responses=[],comparisons=[];let cacheReads=0;
 const forbidden=()=>{throw Error('Operator tests forbid outbound traffic, assets, email, database and cache writes')};
 t.mock.method(globalThis,'fetch',forbidden);
 t.mock.method(console,'log',(...args)=>logs.push(args.join(' ')));
 t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));
 crypto.subtle.timingSafeEqual??=timingSafeEqual;
 t.mock.method(crypto.subtle,'timingSafeEqual',(a,b)=>{
  comparisons.push({presented:a.byteLength,expected:b.byteLength});
  return timingSafeEqual(a,b);
 });
 const env={
  DAILY_POST_OPERATOR_SECRET:'test-only-operator-token-'.repeat(2),
  REVIEWER_LOGIN_CODE:'0'.repeat(8),COMMUNITY_ENABLED:'false',COMMUNITY_ORIGIN:'https://opax.test',
  DAILY_POST_ENABLED:'false',BLUESKY_POST_ENABLED:'false',FACEBOOK_POST_ENABLED:'false',INSTAGRAM_POST_ENABLED:'false',INSTAGRAM_STORY_ENABLED:'false',FACEBOOK_STORY_ENABLED:'false',
  ASSETS:{fetch:forbidden},COMMUNITY_DB:{prepare:forbidden,batch:forbidden},COMMUNITY_EMAIL:{send:forbidden},
  GENERATION_CACHE:{async get(key){assert.equal(key,'daily-post:engagement');cacheReads++;return JSON.stringify(cachedEngagement)},put:forbidden},
 };
 const originalSecret=env.DAILY_POST_OPERATOR_SECRET,originalCode=env.REVIEWER_LOGIN_CODE;
 const request=(route,headers={})=>new Request('https://opax.test'+route.path,{method:route.method,headers:{'content-type':'application/json',...headers},body:route.method==='POST'?JSON.stringify({}):undefined});
 async function call(route,headers){
  const response=await worker.fetch(request(route,headers),env,{waitUntil:forbidden});
  responses.push(await response.clone().text(),JSON.stringify([...response.headers]));
  return response;
 }
 const headers=token=>({authorization:'Bearer '+token});
 const candidates=()=>[
  {label:'same length',headers:headers('x'+originalSecret.slice(1))},
  {label:'shorter',headers:headers(originalSecret.slice(0,-1))},
  {label:'longer',headers:headers(originalSecret+'x')},
  {label:'empty',headers:headers('')},
  {label:'no header',headers:{}},
  {label:'wrong scheme',headers:{authorization:'Basic '+originalSecret}},
  {label:'wrong bearer case',headers:{authorization:'bearer '+originalSecret}},
 ];
 t.after(()=>{
  for(const value of [originalSecret,originalCode])assert.ok(![...responses,...logs].some(line=>line.includes(value)),'test credential leaked in response headers, body or logs');
 });
 return {env,logs,responses,comparisons,request,call,headers,candidates,cacheReads:()=>cacheReads};
}

for(const route of routes){
 test(route.label+' accepts the right operator token without provider calls',async t=>{
  const f=fixture(t),response=await f.call(route,f.headers(f.env.DAILY_POST_OPERATOR_SECRET));
  assert.equal(response.status,route.status||200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(f.comparisons,[{presented:32,expected:32}]);
  const payload=await response.json();
  if(route.label==='reviewer status')assert.deepEqual(payload,{reviewer_login_enabled:true});
  if(route.label==='daily-post engagement'){assert.deepEqual(payload,cachedEngagement);assert.equal(f.cacheReads(),1)}
  if(route.label==='daily-post run')assert.equal(payload.status,'skipped');
 });

 test(route.label+' rejects same-length, shorter, longer and empty tokens and missing headers',async t=>{
  const f=fixture(t);
  for(const candidate of f.candidates()){
   const before=f.comparisons.length,response=await f.call(route,candidate.headers);
   assert.equal(response.status,401,candidate.label);assert.deepEqual(await response.json(),{error:'operator secret required'});
   assert.equal(response.headers.get('set-cookie'),null);
   if(['same length','shorter','longer'].includes(candidate.label)){
    assert.equal(f.comparisons.length,before+1);
    assert.deepEqual(f.comparisons.at(-1),{presented:32,expected:32});
   }
  }
  assert.equal(f.cacheReads(),0);
 });

 for(const label of ['missing','empty'])test(route.label+' rejects every request with a '+label+' operator secret',async t=>{
  const f=fixture(t),valid=f.headers(f.env.DAILY_POST_OPERATOR_SECRET),candidates=[valid,...f.candidates().map(candidate=>candidate.headers)];
  if(label==='missing')delete f.env.DAILY_POST_OPERATOR_SECRET;else f.env.DAILY_POST_OPERATOR_SECRET='';
  for(const headers of candidates){const response=await f.call(route,headers);assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'operator secret required'})}
  assert.equal(f.comparisons.length,0);assert.equal(f.cacheReads(),0);
 });
}

test('the operator comparator receives the independent SHA-256 digests rather than raw token bytes',async t=>{
 const f=fixture(t),secret=f.env.DAILY_POST_OPERATOR_SECRET,token='x'+secret.slice(1);
 let digestCalls=0,comparisons=0;
 const digest=crypto.subtle.digest.bind(crypto.subtle);
 t.mock.method(crypto.subtle,'digest',(algorithm,input)=>{assert.equal(algorithm,'SHA-256');digestCalls++;return digest(algorithm,input)});
 t.mock.method(crypto.subtle,'timingSafeEqual',(a,b)=>{
  comparisons++;assert.equal(a.byteLength,32);assert.equal(b.byteLength,32);
  assert.ok(Buffer.from(a).equals(createHash('sha256').update(token).digest()),'presented digest is not SHA-256 of the supplied token');
  assert.ok(Buffer.from(b).equals(createHash('sha256').update(secret).digest()),'expected digest is not SHA-256 of the configured secret');
  return timingSafeEqual(a,b);
 });
 assert.equal(await operatorAuthorized(f.request(routes[0],f.headers(token)),f.env),false);
 assert.equal(digestCalls,2);assert.equal(comparisons,1);
});

test('the constant-time comparator result governs authorization without a raw string equality fallback',async t=>{
 const f=fixture(t),secret=f.env.DAILY_POST_OPERATOR_SECRET;
 t.mock.method(crypto.subtle,'timingSafeEqual',()=>false);
 assert.equal(await operatorAuthorized(f.request(routes[0],f.headers(secret)),f.env),false);
 t.mock.method(crypto.subtle,'timingSafeEqual',()=>true);
 assert.equal(await operatorAuthorized(f.request(routes[0],f.headers('x'+secret.slice(1))),f.env),true);
});

// /api/ask accepts an operator-only x-opax-research engine override (eval); unauthenticated requests ignore the header
// instead of getting 401, so it is not an operator route, but it must still use the shared guard (checked below).
function insideAskEvalOverride(node){let p=node.parent;while(p&&!ts.isFunctionDeclaration(p))p=p.parent;return p?.name?.text==='apiAskRouted';}
test('all four operator routes use the shared constant-time guard and contain no inline credential reads',()=>{
 const helper=readFileSync(new URL('../src/operator-auth.ts',import.meta.url),'utf8');
 assert.match(helper,/crypto\.subtle\.timingSafeEqual\(/);
 assert.doesNotMatch(helper,/===|!==|==|!=/,'operator guard must not compare raw strings');
 const source=ts.createSourceFile('index.ts',readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 const guarded=[],secretReads=[];
 function visit(node){
  if(ts.isPropertyAccessExpression(node)&&node.name.text==='DAILY_POST_OPERATOR_SECRET')secretReads.push(node);
  if(ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)&&node.argumentExpression.text==='DAILY_POST_OPERATOR_SECRET')secretReads.push(node);
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='operatorAuthorized'&&!insideAskEvalOverride(node)){
   let parent=node.parent;
   while(parent&&(!ts.isIfStatement(parent)||!routes.some(route=>parent.expression.getText(source).includes(route.path)))&&(!ts.isFunctionDeclaration(parent)||!routes.some(route=>route.handler===parent.name?.text)))parent=parent.parent;
   assert.ok(parent,'operator guard must belong to a known operator route');
   const route=routes.find(route=>ts.isIfStatement(parent)?parent.expression.getText(source).includes(route.path):route.handler===parent.name?.text);
   if(route.handler)assert.ok(source.text.includes(`url.pathname === '${route.path}'`)&&source.text.includes(`await ${route.handler}(request, env, ctx)`),'guarded handler must be wired to its operator route');
   guarded.push(route.path);
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 assert.equal(secretReads.length,0,'index must not read and compare operator secrets directly');
 assert.deepEqual(guarded.sort(),routes.map(route=>route.path).sort());
});

// The operator run route posts only under today's or yesterday's Melbourne date unless the body carries
// allow_any_date: true. The clock is pinned to 17 Nov 00:30 in Melbourne (16 Nov 13:30 UTC), so a UTC date
// would name the wrong pair. Every channel is switched on and X is connected; the journal double answers
// "posted" for each channel, so an accepted run proceeds through the journal and still calls no channel.
const RUN_NOW=Date.UTC(2026,10,16,13,30),RUN_TODAY='2026-11-17',RUN_YESTERDAY='2026-11-16';
function runFixture(t,now=RUN_NOW){
 t.mock.timers.enable({apis:['Date'],now});
 const fetches=[],statements=[],logs=[];
 t.mock.method(globalThis,'fetch',async(...args)=>{fetches.push(String(args[0]?.url??args[0]));throw Error('Date guard tests forbid outbound traffic')});
 t.mock.method(console,'log',(...args)=>logs.push(args.join(' ')));
 t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));
 // Pinned per test: an earlier test mocks the comparator twice and its restore can leave the first mock in place.
 crypto.subtle.timingSafeEqual??=timingSafeEqual;t.mock.method(crypto.subtle,'timingSafeEqual',timingSafeEqual);
 const forbidden=()=>{throw Error('Date guard tests forbid assets, email and cache writes')};
 const frozen=date=>({post_json:JSON.stringify({date,subject:'person:Test Member',kind:'politician',title:'Test Member',text:'Check the record.',url:'https://opax.com.au/subject/person/Test%20Member'})});
 const env={
  DAILY_POST_OPERATOR_SECRET:'test-only-operator-token-'.repeat(2),COMMUNITY_ENABLED:'false',COMMUNITY_ORIGIN:'https://opax.test',
  DAILY_POST_ENABLED:'true',X_API_KEY:'key',X_API_SECRET:'secret',X_ACCESS_TOKEN:'token',X_ACCESS_TOKEN_SECRET:'token-secret',X_ACCOUNT_ID:'123',X_USERNAME:'OpaxAustralia',
  BLUESKY_POST_ENABLED:'true',FACEBOOK_POST_ENABLED:'true',INSTAGRAM_POST_ENABLED:'true',INSTAGRAM_STORY_ENABLED:'true',FACEBOOK_STORY_ENABLED:'true',
  ASSETS:{fetch:forbidden},COMMUNITY_EMAIL:{send:forbidden},GENERATION_CACHE:{async get(){return null},put:forbidden},
  COMMUNITY_DB:{batch:forbidden,prepare(sql){
   const entry={sql,args:[]};statements.push(entry);
   return {bind(...args){entry.args=args;return this},
    async first(){if(/FROM social_editions WHERE date=\?/.test(sql))return frozen(entry.args[0]);if(/FROM social_deliveries WHERE edition_date=\? AND channel=\?/.test(sql))return {status:'posted'};throw Error('Unexpected read '+sql)},
    async all(){throw Error('Unexpected read '+sql)},async run(){throw Error('Unexpected write '+sql)}};
  }},
 };
 const run=body=>worker.fetch(new Request('https://opax.test/api/daily-post/run',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.DAILY_POST_OPERATOR_SECRET},body:JSON.stringify(body)}),env,{waitUntil:forbidden});
 const journalDates=()=>[...new Set(statements.map(s=>s.args[0]))];
 return {env,fetches,statements,logs,run,journalDates};
}

for(const [label,date] of [['a date weeks old','2026-10-15'],['the day before yesterday','2026-11-15'],['yesterday by the UTC clock but two days back in Melbourne','2026-11-15'],['tomorrow','2026-11-18']]){
 test('operator run refuses '+label+' without touching the journal or any channel',async t=>{
  const f=runFixture(t),response=await f.run({date});
  assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');
  const payload=await response.json();
  assert.deepEqual(payload.allowed_dates,[RUN_TODAY,RUN_YESTERDAY]);assert.equal(payload.date,date);assert.equal(payload.override,'allow_any_date');
  assert.ok(payload.error.includes(RUN_TODAY)&&payload.error.includes(RUN_YESTERDAY)&&payload.error.includes('allow_any_date'),'the error names the allowed dates and the override');
  assert.equal(f.statements.length,0,'no D1 statement is prepared');assert.equal(f.fetches.length,0,'no outbound request');
 });
}

test('operator run refuses a past date when the override is anything but true',async t=>{
 const f=runFixture(t);
 for(const allow_any_date of [false,'true',1,null]){const response=await f.run({date:'2026-10-15',allow_any_date});assert.equal(response.status,400,String(allow_any_date))}
 assert.equal(f.statements.length,0);assert.equal(f.fetches.length,0);
});

for(const [label,body,date] of [
 ['today\'s Melbourne date',{date:RUN_TODAY},RUN_TODAY],
 ['yesterday\'s Melbourne date',{date:RUN_YESTERDAY},RUN_YESTERDAY],
 ['no date as today',{},RUN_TODAY],
 ['a past date with allow_any_date: true',{date:'2026-10-15',allow_any_date:true},'2026-10-15'],
]){
 test('operator run accepts '+label+' and works on that journal date',async t=>{
  const f=runFixture(t),response=await f.run(body);
  assert.equal(response.status,200);
  assert.deepEqual(f.journalDates(),[date]);
  assert.ok(f.statements.some(s=>/FROM social_deliveries/.test(s.sql)),'the run reached the delivery journal');
  assert.equal(f.fetches.length,0,'a channel with a posted receipt is not called');
  assert.ok(f.logs.some(line=>line.startsWith('daily-post')&&line.includes('"operator":true')));
 });
}

test('operator dry run for a past date composes without a journal write or a channel call',async t=>{
 const f=runFixture(t),response=await f.run({date:'2026-10-15',dry_run:true});
 assert.equal(response.status,200);assert.equal((await response.json()).date,'2026-10-15');
 assert.deepEqual(f.statements.map(s=>s.sql),['SELECT post_json FROM social_editions WHERE date=?']);assert.equal(f.fetches.length,0);
});

// The cron never passes through the route's guard: it takes the Melbourne date of its own scheduled time,
// whatever the wall clock says, and passes no date of its own.
for(const [label,scheduledTime,date] of [['today\'s tick',Date.UTC(2026,10,16,22),'2026-11-17'],['a tick replayed weeks after its scheduled time',Date.UTC(2026,9,14,22),'2026-10-15']]){
 test('the daily cron is not date-guarded: '+label,async t=>{
  const f=runFixture(t,Date.UTC(2026,10,16,22,0,30));
  await worker.scheduled({cron:'0,5,10 22 * * *',scheduledTime},f.env,{waitUntil(){}});
  assert.deepEqual(f.journalDates(),[date]);
  assert.ok(f.statements.some(s=>/FROM social_deliveries/.test(s.sql)));assert.equal(f.fetches.length,0);
  assert.ok(f.logs.some(line=>line.startsWith('daily-post')&&line.includes('"cron"')));
 });
}

test('the scheduled handler passes no date and the guard sits only on the posting branch of the run route',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const scheduled=source.slice(source.indexOf('async scheduled(controller'));
 assert.match(scheduled,/runSocialPublication\(env, \{\s*now: controller\.scheduledTime,/);
 assert.doesNotMatch(scheduled,/\bdate\b|operatorRunDates/);
 assert.equal(source.split('operatorRunDates(').length-1,1,'one guard call, in the run route');
});
