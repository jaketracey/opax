import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const folder=mkdtempSync(join(tmpdir(),'opax-reviewer-login-test-'));
const omitImages={name:'omit-image-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function renderOgPng(){throw Error("No images in reviewer tests")}; export const renderOgJpeg=renderOgPng; export const renderStoryJpeg=renderOgPng;',loader:'js'}))}};
await build({entryPoints:['community','voice','index'].map(name=>new URL('../src/'+name+'.ts',import.meta.url).pathname),outdir:folder,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire as __opaxCreateRequire} from 'node:module';const require=__opaxCreateRequire(import.meta.url);"},plugins:[omitImages]});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.js')));
const {voiceRoute}=await import(pathToFileURL(join(folder,'voice.js')));
const {default:worker}=await import(pathToFileURL(join(folder,'index.js')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));
const hash=value=>createHash('sha256').update(value).digest('hex');
const time=()=>Math.floor(Date.now()/1000);
const failure={error:'This code could not be used. Request a new sign-in email or use its link to sign in through your browser.'};
const invalidReviewerBindings=[
 {label:'unset',value:undefined},{label:'empty',value:''},
 {label:'short nonnumeric',value:'short'},{label:'short numeric',value:'0'.repeat(7)},
 {label:'long numeric',value:'0'.repeat(9)},{label:'nondigit',value:'abcdefgh'},
 {label:'trailing newline',value:'0'.repeat(8)+'\n'},
 {label:'leading whitespace',value:' '+'0'.repeat(8)},
 {label:'trailing whitespace',value:'0'.repeat(8)+' '},
 {label:'null',value:null},{label:'number',value:0}
];
function setReviewerBinding(env,value){if(value===undefined)delete env.REVIEWER_LOGIN_CODE;else env.REVIEWER_LOGIN_CODE=value}

function fixture(t){
 // Stable rate-limit windows, wholly local SQLite and email doubles.
 t.mock.method(Date,'now',()=>Date.UTC(2026,9,12,0,0,0));
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const outbox=[],trace=[],logs=[],responses=[];
 t.mock.method(console,'log',(...args)=>logs.push(args.join(' ')));
 t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Outbound calls are forbidden in reviewer tests')});
 crypto.subtle.timingSafeEqual??=timingSafeEqual;
 t.mock.method(crypto.subtle,'timingSafeEqual',(a,b)=>{trace.push('constant-time comparison');return timingSafeEqual(a,b)});
 const random=crypto.getRandomValues.bind(crypto);
 t.mock.method(crypto,'getRandomValues',array=>{
  random(array);
  // An obviously fake emailed OTP, distinct from the reviewer env binding.
  if(array instanceof Uint32Array&&array.length===1)array[0]=42;
  return array;
 });
 const statement=(sql,args=[])=>({
  bind(...values){return statement(sql,values)},
  async first(){trace.push(sql);return db.prepare(sql).get(...args)||null},
  async all(){trace.push(sql);return {results:db.prepare(sql).all(...args)}},
  run(){trace.push(sql);const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}
 });
 const env={
  COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const results=stmts.map(stmt=>stmt.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}},
  COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_EMAIL_FROM:'signin@example.test',
  DAILY_POST_OPERATOR_SECRET:'test-only-operator-token-'.repeat(2),
  COMMUNITY_CODE_MAC_SECRET:'fake-test-only-code-mac-key-00000000000000000000000000000000',
  REVIEWER_LOGIN_CODE:'00000000',
  COMMUNITY_EMAIL:{async send(mail){outbox.push(mail);return {messageId:'test-only'}}},
  VOICE_ENABLED:'true',VOICE_AGENT_ID:'test-only-agent',ELEVENLABS_API_KEY:'fake-test-only',VOICE_TOOL_SECRET:'test-only-voice-key-'.repeat(3),VOICE_MONTHLY_SECONDS:'40000'
 };
 const fakeSecret=env.REVIEWER_LOGIN_CODE;
 const fakeOperator=env.DAILY_POST_OPERATOR_SECRET;
 async function capture(response){
  responses.push(await response.clone().text(),JSON.stringify([...response.headers]));
  return response;
 }
 const request=(path,data={},headers={},method='POST')=>{
  const req=new Request('https://opax.test/api/community/'+path,{method,headers:{origin:env.COMMUNITY_ORIGIN,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...headers},body:method==='GET'?undefined:JSON.stringify(data)});
  Object.defineProperty(req,'cf',{value:{colo:'SYD'}});
  return req;
 };
 const call=async(path,data,headers,method)=>capture(await communityRoute(request(path,data,headers,method),env));
 const issue=async(email='play-review@opax.com.au',headers={})=>{
  const response=await call('auth/request',{email,client:'ios'},headers);
  assert.equal(response.status,200);
  return response.json();
 };
 const consume=(proof,code=env.REVIEWER_LOGIN_CODE,headers={})=>call('auth/consume-code',{challenge_id:proof.challenge_id,code},headers);
 const row=proof=>db.prepare('SELECT * FROM login_links WHERE challenge_id=?').get(proof.challenge_id);
 const counter=(key,seconds)=>db.prepare('SELECT hits FROM community_limits WHERE key=?').get(hash(key+':'+Math.floor(time()/seconds)))?.hits||0;
 const seedCounter=(key,seconds,hits)=>db.prepare('INSERT INTO community_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=excluded.hits').run(hash(key+':'+Math.floor(time()/seconds)),hits,(Math.floor(time()/seconds)+1)*seconds);
 async function voice(cookie){
  const response=await capture(await voiceRoute(new Request('https://opax.test/api/voice/status',{headers:{cookie}}),env,{},()=>{throw Error('No public reads needed')}));
  assert.equal(response.status,200);
  return response.json();
 }
 t.after(()=>{
  try{
   // Grep-style leak gate covers every captured response body, header and log.
   assert.ok(![...responses,...logs].some(line=>line.includes(fakeSecret)),'reviewer test credential leaked in an HTTP response or log');
   assert.ok(![...responses,...logs].some(line=>line.includes(fakeOperator)),'operator test credential leaked in an HTTP response or log');
   for(const table of ['login_links','members','member_sessions','community_limits'])assert.ok(!JSON.stringify(db.prepare('SELECT * FROM '+table).all()).includes(fakeSecret),'reviewer test credential persisted in database rows');
  }finally{db.close()}
 });
 const status=async(headers={},method='GET')=>{
  const forbidden=()=>{throw Error('Operator status must not use assets, database, email, cache or staging proxy')};
  const statusEnv={...env,ASSETS:{fetch:forbidden},COMMUNITY_DB:{prepare:forbidden,batch:forbidden},COMMUNITY_EMAIL:{send:forbidden},GENERATION_CACHE:{get:forbidden,put:forbidden},STAGING_API:{fetch:forbidden}};
  return capture(await worker.fetch(new Request('https://opax.test/api/ops/reviewer-login',{method,headers}),statusEnv,{waitUntil:forbidden}));
 };
 return {db,env,outbox,trace,logs,responses,call,issue,consume,row,counter,seedCounter,voice,status};
}
async function rejected(response){
 assert.equal(response.status,400);
 assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),failure);
}
function sessionCookie(response){
 assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');
 assert.match(cookie,/^__Host-opax_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
 return cookie.split(';')[0];
}

test('both reviewer addresses issue ordinary sessions, account defaults and the normal Talk allowance',async t=>{
 const f=fixture(t),auditStarted=new Date().getTime();
 const normal=await f.issue('ordinary@example.test');
 const ordinary=await f.consume(normal,f.outbox.at(-1).text.match(/app sign-in code: (\d{8})/)[1]);
 const normalMember=f.db.prepare('SELECT * FROM members WHERE email=?').get('ordinary@example.test');
 const normalVoice=await f.voice(sessionCookie(ordinary));
 for(const email of ['play-review@opax.com.au','app-review@opax.com.au']){
  const proof=await f.issue(email),response=await f.consume(proof),cookie=sessionCookie(response);
  assert.deepEqual(await response.json(),{signed_in:true});
  const member=f.db.prepare('SELECT * FROM members WHERE email=?').get(email);
  const defaults=({id,email,created_at,...rest})=>rest;
  // Includes every schema default; there is no reviewer role or adult override.
  assert.deepEqual(defaults(member),defaults(normalMember));
  assert.equal(member.created_at,time());
  const session=f.db.prepare('SELECT * FROM member_sessions WHERE member_id=?').get(member.id);
  assert.equal(session.client,'ios');assert.equal(session.expires_at-session.created_at,30*86400);
  const status=await f.voice(cookie);
  assert.deepEqual(status,normalVoice);assert.equal(status.enabled,true);assert.equal(status.remaining_seconds,600);assert.equal(status.unlimited,false);
  const audit=JSON.parse(f.logs.find(line=>line.includes('community_reviewer_signin')&&line.includes(email)));
  assert.deepEqual(audit,{event:'community_reviewer_signin',timestamp:audit.timestamp,email,colo:'SYD'});
  assert.ok(Date.parse(audit.timestamp)>=auditStarted&&Date.parse(audit.timestamp)<=new Date().getTime());
 }
 assert.equal(f.logs.filter(line=>line.includes('community_reviewer_signin')).length,2);
});

test('reviewer requests never call the email binding or store an OTP and preserve the response shape',async t=>{
 const f=fixture(t),normalResponse=await f.call('auth/request',{email:'ordinary@example.test',client:'ios'}),normal=await normalResponse.json();
 const normalWebResponse=await f.call('auth/request',{email:'browser@example.test'}),normalWeb=await normalWebResponse.json();
 const send=t.mock.fn(async()=>{throw Error('Reviewer requests must never send email')});
 f.env.COMMUNITY_EMAIL.send=send;
 for(const email of ['play-review@opax.com.au','app-review@opax.com.au']){
  const response=await f.call('auth/request',{email,client:'ios'}),payload=await response.json();
  assert.equal(response.status,normalResponse.status);assert.deepEqual([...response.headers],[...normalResponse.headers]);
  assert.deepEqual({...payload,challenge_id:'opaque'},{...normal,challenge_id:'opaque'});
  assert.match(payload.challenge_id,/^[\w-]{43}$/);
  assert.equal(f.row(payload).code_mac,null);assert.equal(f.row(payload).attempts,0);
  assert.equal(f.row(payload).expires_at-f.row(payload).created_at,900);
  const web=await f.call('auth/request',{email});assert.equal(web.status,normalWebResponse.status);assert.deepEqual([...web.headers],[...normalWebResponse.headers]);assert.deepEqual(await web.json(),normalWeb);
  assert.equal(f.db.prepare("SELECT count(*) n FROM login_links WHERE email=? AND client='web'").get(email).n,0);
 }
 assert.equal(send.mock.callCount(),0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);
});

test('reviewer and ordinary request responses share a floor with a delayed email double',{timeout:10000},async t=>{
 const f=fixture(t),send=f.env.COMMUNITY_EMAIL.send;
 // Compare the requested delays on a controlled clock. CPU contention in the
 // full suite must not be mistaken for a difference in the admission policy.
 let elapsed=0,scheduled=[],finished=false;
 const ready=Promise.withResolvers();let wake=Promise.withResolvers();
 t.mock.method(performance,'now',()=>elapsed);
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{
  scheduled.push({at:elapsed+delay,callback,args});
  if(scheduled.length===2)ready.resolve();
  wake.resolve();return scheduled.length;
 });
 f.env.COMMUNITY_EMAIL.send=async mail=>{await new Promise(resolve=>setTimeout(resolve,100));return send(mail)};
 const duration=async email=>{const start=performance.now(),response=await f.call('auth/request',{email,client:'ios'});assert.equal(response.status,200);return performance.now()-start};
 const requests=Promise.all([duration('ordinary@example.test'),duration('play-review@opax.com.au')]);
 const finish=()=>{finished=true;wake.resolve()};requests.then(finish,finish);
 await ready.promise;
 assert.deepEqual(scheduled.map(timer=>timer.at).sort((a,b)=>a-b),[100,100],'email delivery and reviewer response must use the same floor');
 while(!finished){
  if(!scheduled.length){await wake.promise;wake=Promise.withResolvers();continue;}
  elapsed=Math.min(...scheduled.map(timer=>timer.at));
  const due=scheduled.filter(timer=>timer.at===elapsed);scheduled=scheduled.filter(timer=>timer.at!==elapsed);
  for(const timer of due)timer.callback(...timer.args);
 }
 const [ordinary,reviewer]=await requests;
 assert.ok(ordinary>=95&&reviewer>=95,'both successful requests must reach the common response floor');
 assert.ok(Math.abs(ordinary-reviewer)<=25,'request timing differs by more than 25 ms');
 assert.equal(f.outbox.length,1);
});

test('ordinary email delivery above the floor does not receive another full delay',async t=>{
 const f=fixture(t),send=f.env.COMMUNITY_EMAIL.send;
 let accepted;
 f.env.COMMUNITY_EMAIL.send=async mail=>{await new Promise(resolve=>setTimeout(resolve,150));const result=await send(mail);accepted=performance.now();return result};
 const response=await f.call('auth/request',{email:'ordinary@example.test',client:'ios'});
 assert.equal(response.status,200);assert.ok(performance.now()-accepted<75,'ordinary delivery received an unnecessary response delay');
});

test('reviewer issuance retains the normal email and IP quotas',async t=>{
 const f=fixture(t);
 for(let i=0;i<5;i++)await f.issue();
 assert.equal((await f.call('auth/request',{email:'play-review@opax.com.au',client:'ios'})).status,429);
 assert.equal(f.counter('login-email:play-review@opax.com.au',3600),6);
 f.seedCounter('login-ip:192.0.2.9',3600,15);
 assert.equal((await f.call('auth/request',{email:'app-review@opax.com.au',client:'ios'},{'cf-connecting-ip':'192.0.2.9'})).status,429);
 assert.equal(f.outbox.length,0);
});

test('wrong reviewer codes spend both quotas and all five attempts lock out the exact credential',async t=>{
 const f=fixture(t),proof=await f.issue();
 for(let i=0;i<5;i++)await rejected(await f.consume(proof,'00000001'));
 assert.equal(f.row(proof).attempts,5);
 const comparisons=f.trace.filter(line=>line==='constant-time comparison').length;
 await rejected(await f.consume(proof));
 assert.equal(f.trace.filter(line=>line==='constant-time comparison').length,comparisons);
 assert.equal(f.counter('consume:192.0.2.1',900),6);
 assert.equal(f.counter('consume-code-email:'+hash('play-review@opax.com.au'),86400),6);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);
 assert.equal(f.logs.length,0);
});

test('IP, email and challenge admissions all precede the reviewer comparison',async t=>{
 const f=fixture(t),proof=await f.issue();f.trace.length=0;
 await rejected(await f.consume(proof,'00000001'));
 const comparison=f.trace.indexOf('constant-time comparison');
 const limits=f.trace.map((sql,i)=>sql.startsWith('INSERT INTO community_limits')?i:-1).filter(i=>i>=0);
 const attempt=f.trace.findIndex(sql=>sql.startsWith('UPDATE login_links SET attempts'));
 assert.equal(limits.length,2);assert.ok(limits.every(i=>i<attempt)&&attempt<comparison);
 f.seedCounter('consume:192.0.2.1',900,30);f.trace.length=0;
 await rejected(await f.consume(proof));assert.ok(!f.trace.includes('constant-time comparison'));assert.equal(f.row(proof).attempts,1);
 f.seedCounter('consume:192.0.2.1',900,0);f.seedCounter('consume-code-email:'+hash('play-review@opax.com.au'),86400,10);f.trace.length=0;
 await rejected(await f.consume(proof));assert.ok(!f.trace.includes('constant-time comparison'));assert.equal(f.row(proof).attempts,1);
});

test('reviewer email lockout survives challenge reissue and IP changes',async t=>{
 const f=fixture(t);
 for(let i=0;i<2;i++){
  const proof=await f.issue();
  for(let j=0;j<5;j++)await rejected(await f.consume(proof,'00000001',{'cf-connecting-ip':`192.0.2.${i+2}`}));
 }
 const fresh=await f.issue();await rejected(await f.consume(fresh,undefined,{'cf-connecting-ip':'192.0.2.99'}));
 assert.equal(f.row(fresh).attempts,0);assert.equal(f.counter('consume-code-email:'+hash('play-review@opax.com.au'),86400),11);
});

for(const {label,value} of invalidReviewerBindings)test('invalid reviewer binding rejects every code for both addresses: '+label,async t=>{
 const f=fixture(t),correctLooking=f.env.REVIEWER_LOGIN_CODE;
 const addresses=['play-review@opax.com.au','app-review@opax.com.au'],legacy=[];
 for(let i=0;i<addresses.length;i++){
  const proof=await f.issue('legacy-'+i+'@example.test');
  legacy.push({proof,code:f.outbox.at(-1).text.match(/app sign-in code: (\d{8})/)[1]});
 }
 setReviewerBinding(f.env,value);
 const send=t.mock.fn(async()=>{throw Error('Reviewer request must never send email')});
 f.env.COMMUNITY_EMAIL.send=send;
 for(let i=0;i<addresses.length;i++){
  const proof=await f.issue(addresses[i]);
  assert.equal(f.row(proof).code_mac,null);
  // Preserve a valid old OTP to prove it is rejected by reviewer policy, not expiry.
  f.db.prepare('UPDATE login_links SET email=? WHERE challenge_id=?').run(addresses[i],legacy[i].proof.challenge_id);
  for(const candidate of [correctLooking,legacy[i].code]){
   await rejected(await f.consume(proof,candidate));
   await rejected(await f.consume(legacy[i].proof,candidate));
  }
  assert.equal(f.row(proof).attempts,2);assert.equal(f.row(legacy[i].proof).attempts,2);
  const web=await f.call('auth/request',{email:addresses[i]});assert.equal(web.status,200);
  assert.equal(f.db.prepare("SELECT count(*) n FROM login_links WHERE email=? AND client='web'").get(addresses[i]).n,0);
 }
 assert.equal(send.mock.callCount(),0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);
 assert.ok(!f.trace.includes('constant-time comparison'));
 assert.ok(!f.logs.some(line=>line.includes('community_reviewer_signin')));
});

test('ordinary emailed sign-in still succeeds with reviewer binding disabled',async t=>{
 const f=fixture(t);delete f.env.REVIEWER_LOGIN_CODE;
 const proof=await f.issue('ordinary@example.test'),code=f.outbox.at(-1).text.match(/app sign-in code: (\d{8})/)[1];
 sessionCookie(await f.consume(proof,code));
});

test('disabling an existing reviewer challenge fails closed and rotation accepts only the new binding',async t=>{
 const f=fixture(t),proof=await f.issue(),old=f.env.REVIEWER_LOGIN_CODE;
 delete f.env.REVIEWER_LOGIN_CODE;await rejected(await f.consume(proof,old));
 f.env.REVIEWER_LOGIN_CODE='00000002';await rejected(await f.consume(proof,old));sessionCookie(await f.consume(proof));
});

test('the reviewer credential cannot authenticate any non-allowlisted address and ordinary OTPs and links still work',async t=>{
 const f=fixture(t);
 for(const email of ['ordinary@example.test','play-review+extra@opax.com.au','play-review@elsewhere.test']){
  const proof=await f.issue(email),mail=f.outbox.at(-1);
  await rejected(await f.consume(proof));
  sessionCookie(await f.consume(proof,mail.text.match(/app sign-in code: (\d{8})/)[1]));
 }
 await f.call('auth/request',{email:'browser@example.test'});
 const token=new URL(f.outbox.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(7);
 sessionCookie(await f.call('auth/consume',{token}));
 assert.equal(f.outbox.length,4);assert.ok(!f.logs.some(line=>line.includes('community_reviewer_signin')));
});

test('an enabled reviewer address never falls through to an already stored OTP',async t=>{
 const f=fixture(t),proof=await f.issue('legacy@example.test'),otp=f.outbox.at(-1).text.match(/app sign-in code: (\d{8})/)[1];
 // Simulate a legacy reviewer row with an otherwise valid challenge-bound OTP.
 f.db.prepare('UPDATE login_links SET email=? WHERE challenge_id=?').run('play-review@opax.com.au',proof.challenge_id);
 await rejected(await f.consume(proof,otp));sessionCookie(await f.consume(proof));
});

test('reviewer case and whitespace use normal email normalization and challenge email controls the allowlist',async t=>{
 const f=fixture(t);
 for(const input of ['  PLAY-REVIEW@OPAX.COM.AU  ','\tApp-Review@Opax.Com.Au\n']){
  const proof=await f.issue(input);assert.equal(f.row(proof).email,input.trim().toLowerCase());
  sessionCookie(await f.consume(proof));
 }
 const normal=await f.issue('ordinary@example.test');
 await rejected(await f.call('auth/consume-code',{challenge_id:normal.challenge_id,code:f.env.REVIEWER_LOGIN_CODE,email:'play-review@opax.com.au'}));
 assert.equal(f.outbox.length,1);
});

test('reviewer challenges retain expiry, supersession and single redemption with one concurrent winner',async t=>{
 const f=fixture(t),old=await f.issue(),fresh=await f.issue();await rejected(await f.consume(old));
 f.db.prepare('UPDATE login_links SET expires_at=? WHERE challenge_id=?').run(time(),fresh.challenge_id);await rejected(await f.consume(fresh));
 const proof=await f.issue(),responses=await Promise.all(Array.from({length:8},()=>f.consume(proof)));
 assert.equal(responses.filter(r=>r.status===200).length,1);
 for(const response of responses.filter(r=>r.status!==200))await rejected(response);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,1);
 assert.equal(f.logs.filter(line=>line.includes('community_reviewer_signin')).length,1);
});

test('existing and disabled reviewer accounts follow normal sign-in rules and failed sign-ins are not audited',async t=>{
 const f=fixture(t),proof=await f.issue();sessionCookie(await f.consume(proof));
 const member=f.db.prepare('SELECT * FROM members').get();f.db.prepare("UPDATE members SET display_name='Reviewer profile',bio='Saved profile' WHERE id=?").run(member.id);
 const next=await f.issue();sessionCookie(await f.consume(next));assert.equal(f.db.prepare('SELECT * FROM members').get().id,member.id);
 f.db.prepare('UPDATE members SET disabled=1 WHERE id=?').run(member.id);
 await rejected(await f.consume(await f.issue()));assert.equal(f.logs.filter(line=>line.includes('community_reviewer_signin')).length,2);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,2);
});

test('normal deletion removes the reviewer account and the next sign-in recreates fresh ordinary defaults',async t=>{
 const f=fixture(t),proof=await f.issue(),cookie=sessionCookie(await f.consume(proof)),first=f.db.prepare('SELECT * FROM members').get();
 f.db.prepare("UPDATE members SET display_name='Reviewer profile',bio='Saved profile' WHERE id=?").run(first.id);
 f.db.prepare('INSERT INTO voice_access VALUES (?,1,?)').run(first.id,time());
 const secret=f.env.REVIEWER_LOGIN_CODE,headers={cookie},deletion=await f.call('account/deletion-code',{},headers);
 assert.equal(deletion.status,200);const challenge=await deletion.json();
 const code=f.outbox.at(-1).text.match(/deletion code: (\d{8})/)[1];
 const deleted=await f.call('account/delete',{challenge_id:challenge.challenge_id,code},headers);
 assert.equal(deleted.status,200);assert.equal((await deleted.json()).deleted,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,0);
 assert.ok(f.env.REVIEWER_LOGIN_CODE===secret,'deletion changed the reviewer binding');
 const response=await f.consume(await f.issue()),second=f.db.prepare('SELECT * FROM members').get();
 assert.notEqual(second.id,first.id);assert.equal(second.display_name,'');assert.equal(second.bio,'');assert.equal(second.role,'member');assert.equal(second.disabled,0);
 const status=await f.voice(sessionCookie(response));assert.equal(status.enabled,true);assert.equal(status.remaining_seconds,600);assert.equal(status.unlimited,false);
 const source=readFileSync(new URL('../src/community-deletion.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/REVIEWER_LOGIN_CODE|REVIEWER_EMAILS|env\.[A-Z_]+\s*=|wrangler|api\.cloudflare\.com/);
});

test('a concurrent deletion prevents reviewer session issuance from resurrecting an account',async t=>{
 const f=fixture(t),cookie=sessionCookie(await f.consume(await f.issue())),headers={cookie};
 const deletion=await f.call('account/deletion-code',{},headers),proof=await deletion.json(),code=f.outbox.at(-1).text.match(/deletion code: (\d{8})/)[1];
 const signin=await f.issue(),original=f.env.COMMUNITY_DB.batch;
 let reached,release;const held=new Promise(resolve=>{reached=resolve}),resume=new Promise(resolve=>{release=resolve});
 f.env.COMMUNITY_DB.batch=async statements=>{if(statements.length===2){reached();await resume}return original(statements)};
 const pending=f.consume(signin);await held;
 try{assert.equal((await f.call('account/delete',{challenge_id:proof.challenge_id,code},headers)).status,200)}finally{release()}
 await rejected(await pending);assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);
 assert.equal(f.logs.filter(line=>line.includes('community_reviewer_signin')).length,1);
});

test('the reviewer secret test value is absent from all captured responses, headers and log lines',async t=>{
 const f=fixture(t),proof=await f.issue();await rejected(await f.consume(proof,'00000001'));sessionCookie(await f.consume(proof));await rejected(await f.consume(proof));
 assert.ok(f.responses.length>=8);assert.ok(f.logs.length>0);
 for(const line of [...f.responses,...f.logs])assert.ok(!line.includes(f.env.REVIEWER_LOGIN_CODE),'reviewer test credential found by leak grep');
});

test('operator status requires the existing bearer token for every method',async t=>{
 const f=fixture(t),headers={authorization:'Bearer '+f.env.DAILY_POST_OPERATOR_SECRET};
 for(const supplied of [{},{authorization:'Bearer denied-test-token'}])for(const method of ['GET','POST','HEAD']){
  const response=await f.status(supplied,method);assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
 }
 delete f.env.DAILY_POST_OPERATOR_SECRET;
 const unset=await f.status(headers);assert.equal(unset.status,401);assert.equal(unset.headers.get('cache-control'),'no-store');
 f.env.DAILY_POST_OPERATOR_SECRET='';assert.equal((await f.status(headers)).status,401);
});

test('authorized operator status returns only binding readiness without any provider or proxy access',async t=>{
 const f=fixture(t);f.env.COMMUNITY_ENABLED='false';
 const response=await f.status({authorization:'Bearer '+f.env.DAILY_POST_OPERATOR_SECRET});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),{reviewer_login_enabled:true});
 assert.equal(f.outbox.length,0);assert.deepEqual(f.trace,['constant-time comparison']);assert.equal(f.logs.length,0);
});

for(const {label,value} of invalidReviewerBindings)test('operator status reports false without echoing an invalid reviewer binding: '+label,async t=>{
 const f=fixture(t);setReviewerBinding(f.env,value);
 const response=await f.status({authorization:'Bearer '+f.env.DAILY_POST_OPERATOR_SECRET});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),{reviewer_login_enabled:false});
 assert.equal(f.outbox.length,0);assert.deepEqual(f.trace,['constant-time comparison']);assert.equal(f.logs.length,0);
 if(typeof value==='string'&&value)assert.ok(!f.responses.some(line=>line.includes(value)),'operator status echoed the invalid binding');
});

test('authorized operator status accepts only GET and never falls through to staging',async t=>{
 const f=fixture(t),response=await f.status({authorization:'Bearer '+f.env.DAILY_POST_OPERATOR_SECRET},'POST');
 assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET');assert.equal(response.headers.get('cache-control'),'no-store');
});
