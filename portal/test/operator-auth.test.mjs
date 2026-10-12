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
await build({entryPoints:['operator-auth','index'].map(name=>new URL('../src/'+name+'.ts',import.meta.url).pathname),outdir:folder,bundle:true,platform:'node',format:'esm',plugins:[omitImages]});
const {operatorAuthorized}=await import(pathToFileURL(join(folder,'operator-auth.js')));
const {default:worker}=await import(pathToFileURL(join(folder,'index.js')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));

const routes=[
 {label:'reviewer status',path:'/api/ops/reviewer-login',method:'GET'},
 {label:'daily-post engagement',path:'/api/daily-post/engagement',method:'GET'},
 {label:'daily-post run',path:'/api/daily-post/run',method:'POST'},
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
 const request=(route,headers={})=>new Request('https://opax.test'+route.path,{method:route.method,headers:{'content-type':'application/json',...headers},body:route.method==='POST'?JSON.stringify({date:'2026-10-12'}):undefined});
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
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
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

test('all three operator routes use the shared constant-time guard and contain no inline credential reads',()=>{
 const helper=readFileSync(new URL('../src/operator-auth.ts',import.meta.url),'utf8');
 assert.match(helper,/crypto\.subtle\.timingSafeEqual\(/);
 assert.doesNotMatch(helper,/===|!==|==|!=/,'operator guard must not compare raw strings');
 const source=ts.createSourceFile('index.ts',readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 const guarded=[],secretReads=[];
 function visit(node){
  if(ts.isPropertyAccessExpression(node)&&node.name.text==='DAILY_POST_OPERATOR_SECRET')secretReads.push(node);
  if(ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)&&node.argumentExpression.text==='DAILY_POST_OPERATOR_SECRET')secretReads.push(node);
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='operatorAuthorized'){
   let parent=node.parent;
   while(parent&&(!ts.isIfStatement(parent)||!routes.some(route=>parent.expression.getText(source).includes(route.path))))parent=parent.parent;
   assert.ok(parent,'operator guard must belong to a known operator route');
   guarded.push(routes.find(route=>parent.expression.getText(source).includes(route.path)).path);
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 assert.equal(secretReads.length,0,'index must not read and compare operator secrets directly');
 assert.deepEqual(guarded.sort(),routes.map(route=>route.path).sort());
});
