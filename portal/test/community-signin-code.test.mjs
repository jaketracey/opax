import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const folder=mkdtempSync(join(tmpdir(),'opax-signin-code-test-'));
await build({entryPoints:['community','community-core','community-signin-code'].map(name=>new URL('../src/'+name+'.ts',import.meta.url).pathname),outdir:folder,bundle:true,platform:'node',format:'esm'});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.js')));
const {digest}=await import(pathToFileURL(join(folder,'community-core.js')));
const {randomSignInCode}=await import(pathToFileURL(join(folder,'community-signin-code.js')));
const TEST_KEY='fixed-test-only-code-mac-key-00000000000000000000000000000000';
const context=new AsyncLocalStorage();
const previousComparator=crypto.subtle.timingSafeEqual;
crypto.subtle.timingSafeEqual=(a,b)=>{context.getStore()?.push({kind:'compare'});return timingSafeEqual(a,b)};
const timestamp=()=>Math.floor(Date.now()/1000);
const limitHash=async(key,seconds)=>digest(key+':'+Math.floor(timestamp()/seconds));
const wrongCode=code=>code==='00000000'?'00000001':'00000000';

function fixture(t,{nativeSchema=true}={}){
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')&&(nativeSchema||name!=='0011_native_signin.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 t.after(()=>db.close());
 const outbox=[],trace=[];
 const statement=(sql,args=[])=>({
  bind(...values){return statement(sql,values)},
  async first(){
   const row=db.prepare(sql).get(...args)||null;
   const kind=sql.startsWith('SELECT email FROM login_links')?'lookup':sql.startsWith('INSERT INTO community_limits')?'limit':sql.startsWith('UPDATE login_links SET attempts')?'challenge':sql.startsWith('UPDATE login_links SET used_at')?'redeem':null;
   if(kind)context.getStore()?.push({kind,key:args[0],row});
   return row;
  },
  async all(){return {results:db.prepare(sql).all(...args)}},
  async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}
 });
 const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const result=[];for(const stmt of stmts)result.push(await stmt.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_EMAIL_FROM:'signin@example.test',COMMUNITY_CODE_MAC_SECRET:TEST_KEY,COMMUNITY_EMAIL:{async send(mail){outbox.push(mail);return {messageId:'test'}}}};
 const request=(path,data,headers={})=>new Request('https://opax.test/api/community/'+path,{method:'POST',headers:{origin:env.COMMUNITY_ORIGIN,'content-type':'application/json',...headers},body:JSON.stringify(data)});
 const call=(path,data,headers)=>context.run(trace,()=>communityRoute(request(path,data,headers),env));
 async function issue(email='reader@example.com',client='ios',headers){
  const response=await call('auth/request',{email,...(client?{client}:{})},headers);
  assert.equal(response.status,200);
  const payload=await response.json(),mail=outbox.at(-1);
  const token=new URL(mail.text.match(/https:\/\/\S+/)[0]).hash.slice(7);
  const code=mail.text.match(/Your Opax app sign-in code: (\d{8})/)?.[1];
  return {...payload,email:email.trim().toLowerCase(),token,code,mail};
 }
 const consume=(proof,code=proof.code,ip='192.0.2.1')=>call('auth/consume-code',{challenge_id:proof.challenge_id,code},{'cf-connecting-ip':ip});
 const proofRow=proof=>db.prepare('SELECT * FROM login_links WHERE challenge_id=?').get(proof.challenge_id);
 async function counter(key,seconds){return db.prepare('SELECT hits FROM community_limits WHERE key=?').get(await limitHash(key,seconds))?.hits||0}
 async function seedCounter(key,seconds,hits){db.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=excluded.hits').run(await limitHash(key,seconds),hits,(Math.floor(timestamp()/seconds)+1)*seconds)}
 const emailKey=email=>'consume-code-email:'+emailDigest(email);
 return {db,env,outbox,trace,request,call,issue,consume,proofRow,counter,seedCounter,emailKey};
}
// Match the SHA-256 email digest independently of the Worker helper.
const emailDigest=value=>createHash('sha256').update(value).digest('hex');
async function responseSnapshot(response){
 return {status:response.status,headers:new Headers(response.headers),body:await response.json()};
}
function failure(snapshot){
 assert.equal(snapshot.status,400);
 assert.equal(snapshot.headers.get('set-cookie'),null);
 assert.equal(snapshot.headers.get('cache-control'),'no-store');
 assert.equal(snapshot.headers.get('referrer-policy'),'no-referrer');
 return snapshot.body;
}
const failureResponse=async response=>failure(await responseSnapshot(response));

test('web issuance is unchanged and native issuance holds one challenge-bound MAC proof',async t=>{
 const f=fixture(t),actualWeb=await f.issue('browser@example.com',null);
 assert.deepEqual(Object.keys(actualWeb).filter(k=>!['email','token','code','mail'].includes(k)).sort(),['message','sent']);
 assert.equal(actualWeb.code,undefined);assert.doesNotMatch(actualWeb.mail.html,/app sign-in code/);
 const native=await f.issue('  Reader@EXAMPLE.com  '),row=f.proofRow(native);
 assert.match(native.challenge_id,/^[\w-]{43}$/);assert.equal(Buffer.from(native.challenge_id,'base64url').length,32);
 assert.match(native.code,/^\d{8}$/);assert.match(native.mail.html,new RegExp(native.code));
 for(const content of [native.mail.text,native.mail.html]){
  assert.match(content,/Never share this code/);
  assert.match(content,/The link signs you in through your browser, not the app/);
  assert.match(content,/Using the link also uses up this code/);
 }
 assert.match(native.mail.html,/#token=/);assert.ok(native.mail.html.includes(native.token));
 assert.equal(row.email,'reader@example.com');assert.equal(row.client,'ios');
 assert.equal(row.expires_at-row.created_at,900);assert.equal(row.attempts,0);
 assert.equal(row.token_hash,await digest(native.token));
 assert.equal(row.code_mac,createHmac('sha256',TEST_KEY).update(JSON.stringify(['opax-signin-code-v1',native.challenge_id,native.code])).digest('hex'));
 assert.equal(f.db.prepare('SELECT count(*) n FROM login_links WHERE email=?').get(row.email).n,1);
 for(const [column,value] of Object.entries(row))if(typeof value==='string'&&column!=='email')assert.notEqual(value,native.code);
 assert.equal(row.code,undefined);
 assert.equal((await f.call('auth/consume',{token:actualWeb.token})).status,200);
});

test('CSPRNG rejection sampling rejects the biased tail and preserves leading zeroes',t=>{
 const values=[0xffffffff,4_200_000_000,0,99_999_999,100_000_001];
 t.mock.method(crypto,'getRandomValues',array=>{assert.ok(array instanceof Uint32Array);assert.equal(array.length,1);array[0]=values.shift();return array});
 assert.equal(randomSignInCode(),'00000000');assert.equal(randomSignInCode(),'99999999');assert.equal(randomSignInCode(),'00000001');assert.equal(values.length,0);
});

test('native responses do not disclose whether the email already has an account',async t=>{
 const f=fixture(t);
 f.db.prepare('INSERT INTO members(id,email,created_at) VALUES (?,?,?)').run('existing','existing@example.com',timestamp());
 const existing=await f.issue('existing@example.com'),fresh=await f.issue('new@example.com');
 assert.deepEqual({sent:existing.sent,message:existing.message},{sent:fresh.sent,message:fresh.message});
 assert.equal(existing.challenge_id.length,fresh.challenge_id.length);
 assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,1);
});

test('web and native share both issuance limits with unchanged 5/email and 15/IP caps',async t=>{
 const f=fixture(t);
 for(let i=0;i<5;i++)await f.issue('reader@example.com',i%2?'ios':null,{'cf-connecting-ip':'192.0.2.10'});
 assert.equal((await f.call('auth/request',{email:'reader@example.com',client:'ios'},{'cf-connecting-ip':'192.0.2.11'})).status,429);
 assert.equal((await f.call('auth/request',{email:'reader@example.com'},{'cf-connecting-ip':'192.0.2.12'})).status,429);
 for(let i=0;i<15;i++)await f.issue(`reader${i}@example.com`,i%2?'ios':null,{'cf-connecting-ip':'192.0.2.20'});
 assert.equal((await f.call('auth/request',{email:'new@example.com',client:'ios'},{'cf-connecting-ip':'192.0.2.20'})).status,429);
 assert.equal(f.outbox.length,20);
});

test('supersession is atomic per normalized email and client and preserves the other client',async t=>{
 const f=fixture(t),web=await f.issue('reader@example.com',null),old=await f.issue('Reader@example.com');
 const [a,b]=await Promise.all([f.issue(),f.issue()]);
 const latest=[a,b].find(p=>f.proofRow(p).superseded_at===null);
 assert.ok(latest);assert.equal([a,b].filter(p=>f.proofRow(p).superseded_at===null).length,1);
 assert.notEqual(f.proofRow(old).superseded_at,null);
 assert.equal((await f.call('auth/consume',{token:old.token})).status,400);
 await failureResponse(await f.consume(old));
 assert.equal((await f.call('auth/consume',{token:web.token})).status,200);
 assert.equal((await f.consume(latest)).status,200);
 const w1=await f.issue('browser@example.com',null),w2=await f.issue('browser@example.com',null);
 assert.equal((await f.call('auth/consume',{token:w1.token})).status,200);
 assert.equal((await f.call('auth/consume',{token:w2.token})).status,200);
});

test('both web links remain usable when native proofs for the same email are superseded',async t=>{
 const f=fixture(t),a=await f.issue('reader@example.com',null),b=await f.issue('reader@example.com',null);
 const old=await f.issue(),current=await f.issue();
 await failureResponse(await f.consume(old));
 assert.equal((await f.call('auth/consume',{token:old.token})).status,400);
 for(const web of [a,b])assert.equal((await f.call('auth/consume',{token:web.token})).status,200);
 assert.equal((await f.consume(current)).status,200);
});

test('a failed second web email preserves the first web link',async t=>{
 const f=fixture(t),first=await f.issue('browser@example.com',null);
 const expiresAt=f.db.prepare('SELECT expires_at FROM login_links WHERE token_hash=?').get(await digest(first.token)).expires_at;
 f.env.COMMUNITY_EMAIL.send=async()=>{throw Error('stub failure')};
 assert.equal((await f.call('auth/request',{email:first.email})).status,503);
 assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,1);
 assert.equal(f.db.prepare('SELECT expires_at FROM login_links').get().expires_at,expiresAt);
 assert.equal((await f.call('auth/consume',{token:first.token})).status,200);
});

test('failed delivery deletes the native proof and missing MAC secret fails closed without affecting web',async t=>{
 const f=fixture(t);delete f.env.COMMUNITY_CODE_MAC_SECRET;
 assert.equal((await f.call('auth/request',{email:'reader@example.com',client:'ios'})).status,503);
 assert.equal(f.outbox.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
 await f.issue('browser@example.com',null);
 f.env.COMMUNITY_CODE_MAC_SECRET=TEST_KEY;f.env.COMMUNITY_EMAIL.send=async()=>{throw Error('stub failure')};
 assert.equal((await f.call('auth/request',{email:'reader@example.com',client:'ios'})).status,503);
 assert.equal(f.db.prepare("SELECT count(*) n FROM login_links WHERE client='ios'").get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);
});

test('admission is lookup, shared IP, email, challenge, then constant-time comparison',async t=>{
 const f=fixture(t),p=await f.issue();f.trace.length=0;
 await failureResponse(await f.consume(p,wrongCode(p.code)));
 assert.deepEqual(f.trace.map(e=>e.kind),['lookup','limit','limit','challenge','compare']);
 assert.equal(f.trace[1].key,await limitHash('consume:192.0.2.1',900));
 assert.equal(f.trace[2].key,await limitHash(f.emailKey(p.email),86400));
 assert.equal(f.proofRow(p).attempts,1);
 await f.seedCounter('consume:192.0.2.1',900,30);f.trace.length=0;
 await failureResponse(await f.consume(p));
 assert.deepEqual(f.trace.map(e=>e.kind),['lookup','limit']);
 assert.equal(await f.counter(f.emailKey(p.email),86400),1);
});

test('unknown and malformed challenges spend IP quota and never reach email or MAC comparison',async t=>{
 const f=fixture(t);
 for(const data of [{challenge_id:'x'.repeat(43),code:'12345678'},{challenge_id:'bad',code:'12345678'},{}])await failureResponse(await f.call('auth/consume-code',data,{'cf-connecting-ip':'192.0.2.1'}));
 const malformed=new Request('https://opax.test/api/community/auth/consume-code',{method:'POST',headers:{origin:f.env.COMMUNITY_ORIGIN,'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:'{'});
 await failureResponse(await context.run(f.trace,()=>communityRoute(malformed,f.env)));
 assert.equal(await f.counter('consume:192.0.2.1',900),4);
 assert.equal(f.trace.filter(e=>e.kind==='compare'||e.kind==='challenge').length,0);
});

test('link and code exchange share the 30 per fixed 15-minute IP admission',async t=>{
 const f=fixture(t),p=await f.issue();
 for(let i=0;i<30;i++){
  const r=i%2?await f.consume(p,wrongCode(p.code)):await f.call('auth/consume',{token:'x'.repeat(43)},{'cf-connecting-ip':'192.0.2.1'});
  assert.equal(r.status,400);
 }
 await failureResponse(await f.consume(p));
 assert.equal((await f.call('auth/consume',{token:p.token},{'cf-connecting-ip':'192.0.2.1'})).status,429);
 assert.equal(await f.counter('consume:192.0.2.1',900),32);
});

test('twenty concurrent attempts admit exactly five comparisons for one challenge',async t=>{
 const f=fixture(t),p=await f.issue();f.trace.length=0;
 await Promise.all(Array.from({length:20},(_,i)=>f.consume(p,wrongCode(p.code),`192.0.2.${i+1}`).then(failureResponse)));
 assert.equal(f.proofRow(p).attempts,5);
 assert.equal(f.trace.filter(e=>e.kind==='compare').length,5);
 assert.equal(await f.counter(f.emailKey(p.email),86400),20);
 assert.equal(f.trace.filter(e=>e.kind==='challenge').length,10);
 await failureResponse(await f.consume(p));
 assert.equal(f.proofRow(p).used_at,null);
});

test('email cap holds across concurrent attempts on superseded and current challenges',async t=>{
 const f=fixture(t),old=await f.issue(),current=await f.issue();f.trace.length=0;
 const responses=await Promise.all(Array.from({length:20},(_,i)=>f.consume(i%2?old:current,wrongCode((i%2?old:current).code),`192.0.2.${i+1}`)));
 for(const response of responses)await failureResponse(response);
 assert.equal(await f.counter(f.emailKey(current.email),86400),20);
 assert.equal(f.trace.filter(e=>e.kind==='challenge').length,10);
 assert.ok(f.trace.filter(e=>e.kind==='compare').length<=5);
 assert.equal(f.proofRow(old).attempts,0);
 const fresh=await f.issue();f.trace.length=0;
 await failureResponse(await f.consume(fresh));
 await failureResponse(await f.call('auth/consume-code',{challenge_id:fresh.challenge_id,code:fresh.code,email:'uncapped@example.com'},{'cf-connecting-ip':'192.0.2.99'}));
 assert.equal(f.proofRow(fresh).attempts,0);assert.equal(f.trace.filter(e=>e.kind==='compare').length,0);
 assert.equal((await f.call('auth/consume',{token:fresh.token})).status,200,'link fallback remains available at email cap');
});

test('twenty requests at the email cap boundary admit only the remaining attempt, including a correct code',async t=>{
 const f=fixture(t),p=await f.issue();await f.seedCounter(f.emailKey(p.email),86400,9);f.trace.length=0;
 const responses=await Promise.all(Array.from({length:20},(_,i)=>f.consume(p,p.code,`192.0.2.${i+1}`)));
 assert.equal(responses.filter(r=>r.status===200).length,1);
 for(const response of responses.filter(r=>r.status!==200))await failureResponse(response);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,1);
 assert.equal(f.trace.filter(e=>e.kind==='challenge').length,1);
 assert.equal(f.trace.filter(e=>e.kind==='compare').length,1);
 assert.equal(f.proofRow(p).attempts,1);
 assert.equal(await f.counter(f.emailKey(p.email),86400),29);
 const before=f.trace.filter(e=>e.kind==='compare').length;
 await failureResponse(await f.consume(p));
 assert.equal(f.trace.filter(e=>e.kind==='compare').length,before);
 const fresh=await f.issue();await failureResponse(await f.consume(fresh));assert.equal(f.proofRow(fresh).attempts,0);
});

test('reissue during in-flight attempts shares the email cap and invalidates earlier proofs',async t=>{
 const f=fixture(t),old=await f.issue();await f.seedCounter(f.emailKey(old.email),86400,5);f.trace.length=0;
 const inFlight=Array.from({length:10},(_,i)=>f.consume(old,wrongCode(old.code),`192.0.2.${i+1}`));
 const fresh=await f.issue();
 const responses=await Promise.all([...inFlight,...Array.from({length:10},(_,i)=>f.consume(fresh,wrongCode(fresh.code),`192.0.2.${i+11}`))]);
 for(const response of responses)await failureResponse(response);
 assert.equal(await f.counter(f.emailKey(old.email),86400),25);
 assert.ok(f.trace.filter(e=>e.kind==='compare').length<=5);
 await failureResponse(await f.consume(fresh));
});

test('fixed daily email window resets independently of challenge issuance',async t=>{
 const f=fixture(t);
 let clock=Math.floor(timestamp()/86400)*86400+86400-60;
 t.mock.method(Date,'now',()=>clock*1000);
 const p=await f.issue();await f.seedCounter(f.emailKey(p.email),86400,10);
 await failureResponse(await f.consume(p));clock+=61;
 assert.equal((await f.consume(p)).status,200);
 assert.equal(await f.counter(f.emailKey(p.email),86400),1);
});

test('success returns the existing cookie and a hashed ios session usable by existing member/logout code',async t=>{
 const f=fixture(t),p=await f.issue(),response=await f.consume(p);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{signed_in:true});
 const cookie=response.headers.get('set-cookie');
 assert.match(cookie,/^__Host-opax_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
 assert.doesNotMatch(cookie,/Domain=/);
 const token=cookie.split(';')[0].split('=')[1],session=f.db.prepare('SELECT * FROM member_sessions').get();
 assert.equal(session.token_hash,await digest(token));assert.equal(session.client,'ios');assert.equal(session.expires_at-session.created_at,2592000);
 const status=await communityRoute(new Request('https://opax.test/api/community/status',{headers:{cookie:cookie.split(';')[0]}}),f.env);
 assert.equal((await status.json()).member.email,p.email);
 assert.equal((await f.call('auth/logout',{}, {cookie:cookie.split(';')[0]})).status,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);
});

test('parallel correct code redemptions create exactly one session',async t=>{
 const f=fixture(t),p=await f.issue();
 const responses=await Promise.all(Array.from({length:20},(_,i)=>f.consume(p,p.code,`192.0.2.${i+1}`)));
 assert.equal(responses.filter(r=>r.status===200).length,1);
 for(const response of responses.filter(r=>r.status!==200))await failureResponse(response);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,1);
 assert.notEqual(f.proofRow(p).used_at,null);
});

test('link then code and code then link each consume the same proof',async t=>{
 const f=fixture(t),a=await f.issue('a@example.com');
 assert.equal((await f.call('auth/consume',{token:a.token})).status,200);await failureResponse(await f.consume(a));
 const b=await f.issue('b@example.com');assert.equal((await f.consume(b)).status,200);
 assert.equal((await f.call('auth/consume',{token:b.token})).status,400);
 assert.deepEqual(f.db.prepare('SELECT client FROM member_sessions ORDER BY client').all().map(r=>r.client),['ios','web']);
});

test('concurrent link/code races have one winning redemption and one session',async t=>{
 const f=fixture(t);
 for(let i=0;i<12;i++){
  const p=await f.issue(`race${i}@example.com`);
  const calls=[()=>f.call('auth/consume',{token:p.token},{'cf-connecting-ip':`192.0.2.${i+1}`}),()=>f.consume(p,p.code,`198.51.100.${i+1}`)];
  if(i%2)calls.reverse();
  const responses=await Promise.all(calls.map(call=>call()));
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===400).length,1);
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,12);
});

test('supersession and expiry between comparison and redemption still refuse the code',async t=>{
 const f=fixture(t);
 for(const change of ['superseded_at=1','expires_at=0']){
  const p=await f.issue(change.startsWith('superseded')?'superseded@example.com':'expired@example.com');
  const compare=crypto.subtle.timingSafeEqual;
  crypto.subtle.timingSafeEqual=(a,b)=>{const result=compare(a,b);f.db.prepare('UPDATE login_links SET '+change+' WHERE challenge_id=?').run(p.challenge_id);return result};
  try{await failureResponse(await f.consume(p))}finally{crypto.subtle.timingSafeEqual=compare}
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);
});

test('all wrong, expired, superseded, consumed, unknown, malformed and over-limit code failures are identical',async t=>{
 const f=fixture(t),p=await f.issue();const expected=await failureResponse(await f.consume(p,wrongCode(p.code)));
 for(const code of ['1234567','123456789','abcdefgh',12345678,null])assert.deepEqual(await failureResponse(await f.consume(p,code)),expected);
 const expired=await f.issue('expired@example.com');f.db.prepare('UPDATE login_links SET expires_at=0 WHERE challenge_id=?').run(expired.challenge_id);
 assert.deepEqual(await failureResponse(await f.consume(expired)),expected);
 const old=await f.issue('superseded@example.com');await f.issue('superseded@example.com');assert.deepEqual(await failureResponse(await f.consume(old)),expected);
 const consumed=await f.issue('consumed@example.com');assert.equal((await f.consume(consumed)).status,200);assert.deepEqual(await failureResponse(await f.consume(consumed)),expected);
 const disabled=await f.issue('disabled@example.com');f.db.prepare('INSERT INTO members(id,email,created_at,disabled) VALUES (?,?,?,1)').run('disabled',disabled.email,timestamp());assert.deepEqual(await failureResponse(await f.consume(disabled)),expected);
 assert.deepEqual(await failureResponse(await f.consume({challenge_id:'x'.repeat(43),code:'12345678'})),expected);
 const capped=await f.issue('capped@example.com');await f.seedCounter(f.emailKey(capped.email),86400,10);assert.deepEqual(await failureResponse(await f.consume(capped)),expected);
 await f.seedCounter('consume:192.0.2.1',900,30);assert.deepEqual(await failureResponse(await f.consume(capped)),expected);
});

test('a different challenge or email code and a different MAC key cannot redeem the proof',async t=>{
 const getRandomValues=crypto.getRandomValues.bind(crypto),codes=[12345678,87654321];
 t.mock.method(crypto,'getRandomValues',array=>{if(array instanceof Uint32Array){array[0]=codes.shift();return array}return getRandomValues(array)});
 const f=fixture(t),a=await f.issue('a@example.com'),b=await f.issue('b@example.com');
 assert.notEqual(a.code,b.code);await failureResponse(await f.consume(b,a.code));
 // Prove challenge binding even if two emails happen to receive the same numeric code.
 f.db.prepare('UPDATE login_links SET code_mac=? WHERE challenge_id=?').run(f.proofRow(a).code_mac,b.challenge_id);
 await failureResponse(await f.consume(b,a.code));
 f.env.COMMUNITY_CODE_MAC_SECRET='different-test-only-key-00000000000000000000';await failureResponse(await f.consume(a));
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,0);
});

test('Origin remains mandatory on native and cookie mutations, including logout',async t=>{
 const f=fixture(t),p=await f.issue();
 const signed=await f.consume(p),cookie=signed.headers.get('set-cookie').split(';')[0];
 for(const origin of ['https://evil.test','https://www.opax.test','null',''])for(const path of ['auth/request','auth/consume','auth/consume-code','auth/logout','profile']){
  const response=await f.call(path,{email:'reader@example.com',client:'ios',token:p.token,challenge_id:p.challenge_id,code:p.code},{origin,cookie});
  assert.equal(response.status,403);
 }
 const missing=f.request('auth/consume-code',{challenge_id:p.challenge_id,code:p.code},{cookie});missing.headers.delete('origin');
 assert.equal((await communityRoute(missing,f.env)).status,403);
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,1);
});

for(const nativeSchema of [false,true])test(`real web route flow works on the ${nativeSchema?'post':'pre'}-0011 schema`,async t=>{
 const f=fixture(t,{nativeSchema});delete f.env.COMMUNITY_CODE_MAC_SECRET;
 const first=await f.issue('browser@example.com',null),second=await f.issue('browser@example.com',null);
 for(const proof of [first,second]){
  const response=await f.call('auth/consume',{token:proof.token});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/^__Host-opax_session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  const status=await communityRoute(new Request('https://opax.test/api/community/status',{headers:{cookie:cookie.split(';')[0]}}),f.env);
  assert.equal((await status.json()).member.email,proof.email);
  assert.equal((await f.call('auth/consume',{token:proof.token})).status,400);
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,2);
 const session=f.db.prepare('SELECT * FROM member_sessions').get();
 assert.equal(session.client,nativeSchema?'web':undefined);
 const pending=await f.issue('pending@example.com',null);f.env.COMMUNITY_EMAIL.send=async()=>{throw Error('stub failure')};
 assert.equal((await f.call('auth/request',{email:pending.email})).status,503);
 assert.equal((await f.call('auth/consume',{token:pending.token})).status,200);
});

test('migration preserves web proofs and sessions created by the real pre-0011 route',async t=>{
 const f=fixture(t,{nativeSchema:false}),signed=await f.issue('signed@example.com',null),pending=await f.issue('pending@example.com',null);
 const response=await f.call('auth/consume',{token:signed.token});assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 f.db.exec(readFileSync(new URL('../migrations/0011_native_signin.sql',import.meta.url),'utf8'));
 assert.equal(f.db.prepare('SELECT client FROM login_links').get().client,'web');assert.equal(f.db.prepare('SELECT client FROM member_sessions').get().client,'web');
 const status=await communityRoute(new Request('https://opax.test/api/community/status',{headers:{cookie}}),f.env);
 assert.equal((await status.json()).member.email,signed.email);
 assert.equal((await f.call('auth/consume',{token:pending.token})).status,200);
 const fresh=await f.issue('fresh@example.com',null);assert.equal((await f.call('auth/consume',{token:fresh.token})).status,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,3);assert.equal(f.db.prepare('SELECT count(*) n FROM member_sessions').get().n,3);
});

for(const nativeSchema of [false,true])test(`missing or short native secret spends no quota on the ${nativeSchema?'post':'pre'}-0011 schema`,async t=>{
 const f=fixture(t,{nativeSchema});
 for(const secret of [undefined,'','x'.repeat(31),' '.repeat(32)]){
  f.env.COMMUNITY_CODE_MAC_SECRET=secret;
  for(const path of ['auth/request','auth/consume-code']){
   const response=await f.call(path,{email:'reader@example.com',client:'ios',challenge_id:'x'.repeat(43),code:'12345678'});
   assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'This action could not be completed. Please try again shortly.'});assert.equal(response.headers.get('set-cookie'),null);
  }
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,0);assert.equal(f.outbox.length,0);
 for(let i=0;i<5;i++)await f.issue('reader@example.com',null);
});

test('missing or partial native columns fail before quota or proof creation',async t=>{
 const f=fixture(t,{nativeSchema:false});
 // Check every partial migration state, including missing session client after all proof columns exist.
 const columns=[['login_links',"client TEXT NOT NULL DEFAULT 'web'"],['login_links','challenge_id TEXT'],['login_links','code_mac TEXT'],['login_links','attempts INTEGER NOT NULL DEFAULT 0'],['login_links','superseded_at INTEGER']];
 for(let i=0;i<=columns.length;i++){
  for(const path of ['auth/request','auth/consume-code']){
   const response=await f.call(path,{email:'reader@example.com',client:'ios',challenge_id:'x'.repeat(43),code:'12345678'});
   assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'This action could not be completed. Please try again shortly.'});
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,0);assert.equal(f.outbox.length,0);
  if(i<columns.length)f.db.exec('ALTER TABLE '+columns[i][0]+' ADD COLUMN '+columns[i][1]);
 }
 f.db.exec("ALTER TABLE member_sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'web'");
 const p=await f.issue();assert.equal((await f.consume(p)).status,200);
});

test('real Worker and local D1 enforce the concurrent email cap, MAC comparison and one-winner redemption',async t=>{
 const rounds=Number(process.env.OPAX_SIGNIN_STRESS_ROUNDS||1);
 assert.ok(Number.isSafeInteger(rounds)&&rounds>=1&&rounds<=1000);
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const compiled=await build({entryPoints:[new URL('../src/community.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
 const script=compiled.outputFiles[0].text+`\nexport default {fetch(req,env){return communityRoute(req,{...env,COMMUNITY_EMAIL:{async send(mail){const result=await env.EMAIL_STUB.fetch(new Request('https://example.test/mail',{method:'POST',body:JSON.stringify(mail)}));return result.json()}}})}};`;
 const outbox=[];
 const mf=new Miniflare(convertV4MiniflareOptions({port:0,workers:[{name:'signin',modules:true,script,compatibilityDate:'2026-09-01',d1Databases:{COMMUNITY_DB:'signin-runtime'},bindings:{COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_EMAIL_FROM:'signin@example.test',COMMUNITY_CODE_MAC_SECRET:TEST_KEY},serviceBindings:{EMAIL_STUB:async req=>{outbox.push(await req.json());return Response.json({messageId:'test'})}},outboundService:()=>{throw Error('Outbound network is forbidden in sign-in tests')}}]}));
 try{
  const db=await mf.getD1Database('COMMUNITY_DB','signin');
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())for(const sql of readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const call=(path,data,ip='192.0.2.1')=>mf.dispatchFetch('https://opax.test/api/community/'+path,{method:'POST',headers:{origin:'https://opax.test','content-type':'application/json','cf-connecting-ip':ip},body:JSON.stringify(data)});
  for(let round=0;round<rounds;round++){
   await db.prepare('DELETE FROM community_limits').run();outbox.length=0;
   const email=`runtime${round}@example.com`;
   const response=await responseSnapshot(await call('auth/request',{email,client:'ios'}));assert.equal(response.status,200);
   const {challenge_id}=response.body,code=outbox[0].text.match(/Your Opax app sign-in code: (\d{8})/)[1];
   const key=await limitHash('consume-code-email:'+emailDigest(email),86400);
   await db.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,9,?)').bind(key,timestamp()+86400).run();
   // Read each body as its request completes, inside the Promise.all callback.
   const responses=await Promise.all(Array.from({length:20},async(_,i)=>responseSnapshot(await call('auth/consume-code',{challenge_id,code},`192.0.2.${i+1}`))));
   assert.equal(responses.filter(r=>r.status===200).length,1);
   for(const response of responses.filter(r=>r.status!==200))failure(response);
   assert.equal((await db.prepare('SELECT hits FROM community_limits WHERE key=?').bind(key).first()).hits,29);
   assert.equal((await db.prepare('SELECT attempts FROM login_links WHERE challenge_id=?').bind(challenge_id).first()).attempts,1);
   assert.equal((await db.prepare('SELECT client FROM member_sessions WHERE member_id=(SELECT id FROM members WHERE email=?)').bind(email).first()).client,'ios');
   const linkReplay=await responseSnapshot(await call('auth/consume',{token:new URL(outbox[0].text.match(/https:\/\/\S+/)[0]).hash.slice(7)}));assert.equal(linkReplay.status,400);
   failure(await responseSnapshot(await call('auth/consume-code',{challenge_id,code})));
   if((round+1)%25===0)t.diagnostic(`Completed ${round+1} workerd rounds without failures.`);
  }
  assert.equal((await db.prepare('SELECT count(*) n FROM member_sessions').first()).n,rounds);
  t.diagnostic(`${rounds} rounds, ${rounds*20} concurrent code-exchange responses, zero failures.`);
 }finally{await mf.dispose()}
});

test.after(()=>{crypto.subtle.timingSafeEqual=previousComparator;rmSync(folder,{recursive:true,force:true})});
