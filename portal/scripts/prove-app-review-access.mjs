// Local-only proof. Creates an isolated Wrangler config, fake secrets and D1.
// Never loads the production config, credentials, routes, schedules or bindings.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const portal=fileURLToPath(new URL('..',import.meta.url));
const port=Number(process.env.OPAX_REVIEW_FIXTURE_PORT??8931);
assert.ok(Number.isInteger(port)&&port>=8900&&port<=8999);
const origin=`http://127.0.0.1:${port}`;
// The native bridge keeps its canonical Origin header even in e2e loopback.
const authOrigin=process.argv.includes('--native-origin')?'https://opax.com.au':origin;
const email=process.argv.includes('--play-review')?'play-review@opax.com.au':'app-review@opax.com.au',code='00000000'; // Obviously fake.
const privateRoot=join(portal,'private/app-review');
await mkdir(privateRoot,{recursive:true});
const folder=await mkdtemp(join(privateRoot,'runtime-'));
const config=join(folder,'wrangler.json');
const wrangler=join(portal,'node_modules/.bin/wrangler');
// Only the CLI's operating environment is inherited. No deployment credentials.
const cliEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 CI:'1',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false',
 WRANGLER_LOG_PATH:join(folder,'wrangler.log')};
let dev,output='';
const command=(args)=>new Promise((resolve,reject)=>{
 const child=spawn(wrangler,args,{cwd:folder,env:cliEnv,stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',data=>{log+=data});child.stderr.on('data',data=>{log+=data});
 child.on('error',reject);child.on('close',status=>status===0?resolve(log):reject(Error(`Local Wrangler command failed (${status}): ${log}`)));
});
try{
 await writeFile(config,JSON.stringify({name:'opax-app-review-fixture',main:'worker.ts',
  compatibility_date:'2026-09-01',compatibility_flags:['nodejs_compat'],
  d1_databases:[{binding:'COMMUNITY_DB',database_name:'app-review-fixture-only',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:join(portal,'migrations')}],
  vars:{COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:authOrigin,COMMUNITY_EMAIL_FROM:'fixture@example.test',VOICE_ENABLED:'true',VOICE_AGENT_ID:'fixture-only-agent',VOICE_MONTHLY_SECONDS:'40000',INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true',DAILY_POST_ENABLED:'false',RESEARCH_LOOP:'off',AGENTIC_ASK_MODE:'off'},
  triggers:{crons:[]},routes:[],workers_dev:false},null,2));
 await writeFile(join(folder,'.dev.vars'),[
  `REVIEWER_LOGIN_CODE=${code}`,
  'COMMUNITY_CODE_MAC_SECRET=fixture-only-mac-key-000000000000000000000000000000000000',
  'ELEVENLABS_API_KEY=fixture-only','VOICE_TOOL_SECRET=fixture-only-voice-key-0000000000000000000000000000'
 ].join('\n')+'\n',{mode:0o600});
 await writeFile(join(folder,'worker.ts'),`
import app from ${JSON.stringify(join(portal,'src/index.ts'))};
let emailAttempts=0;
globalThis.fetch=async()=>{throw Error('External fetch forbidden in app review fixture')};
export default {async fetch(req,env,ctx){
 const path=new URL(req.url).pathname;
 if(path==='/__fixture/email-count')return Response.json({email_attempts:emailAttempts});
 if(!path.startsWith('/api/community/')&&path!=='/api/voice/status')return new Response('Fixture route unavailable',{status:404});
 return app.fetch(req,{...env,COMMUNITY_EMAIL:{async send(){emailAttempts++;throw Error('Email forbidden in app review fixture')}}},ctx);
}};
`);
 await command(['d1','migrations','apply','COMMUNITY_DB','--local','--config',config,'--persist-to',join(folder,'state')]);
 console.log('LOCAL ONLY: isolated D1 migrations applied; no remote bindings or schedules.');
 dev=spawn(wrangler,['dev','--local','--config',config,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--persist-to',join(folder,'state')],{cwd:folder,env:cliEnv,detached:true,stdio:['ignore','pipe','pipe']});
 dev.stdout.on('data',data=>{output+=data});dev.stderr.on('data',data=>{output+=data});
 const deadline=Date.now()+45000;
 while(true){
  if(dev.exitCode!==null)throw Error('Fixture Worker stopped before readiness: '+output);
  try{if((await fetch(origin+'/__fixture/email-count')).ok)break}catch{}
  if(Date.now()>deadline)throw Error('Fixture Worker readiness timeout: '+output);
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 const call=async(path,data,cookie)=>{
  const response=await fetch(origin+path,{method:data===undefined?'GET':'POST',redirect:'error',headers:{origin:authOrigin,'content-type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  return {response,body:await response.json()};
 };
 const request=async()=>{
  const result=await call('/api/community/auth/request',{email,client:'ios'});
  assert.equal(result.response.status,200);assert.match(result.body.challenge_id,/^[\w-]{43}$/);
  assert.equal((await call('/__fixture/email-count')).body.email_attempts,0);
  console.log('POST /api/community/auth/request -> 200; challenge=[REDACTED]; email_attempts=0');
  return result.body.challenge_id;
 };
 const verify=async challenge_id=>{
  const result=await call('/api/community/auth/consume-code',{challenge_id,code});
  assert.equal(result.response.status,200);assert.equal(result.body.signed_in,true);
  const cookie=result.response.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly; Secure; SameSite=Lax; Max-Age=2592000/);
  console.log('POST /api/community/auth/consume-code -> 200; signed_in=true; session=[REDACTED]');
  return cookie.split(';')[0];
 };
 const challenge=await request();
 assert.equal((await call('/api/community/auth/consume-code',{challenge_id:challenge,code:'00000001'})).response.status,400);
 console.log('POST /api/community/auth/consume-code (wrong fixture) -> 400; no session');
 const cookie=await verify(challenge);
 const first=(await call('/api/community/status',undefined,cookie)).body;
 assert.equal(first.member.role,'member');assert.equal(first.can_delete_account,true);
 const talk=(await call('/api/voice/status',undefined,cookie)).body;
 assert.equal(talk.signed_in,true);assert.equal(talk.remaining_seconds,600);assert.equal(talk.unlimited,false);
 console.log('GET /api/community/status -> 200; role=member; can_delete_account=true');
 console.log('GET /api/voice/status -> 200; signed_in=true; remaining_seconds=600; unlimited=false');
 const deletion=await call('/api/community/account/deletion-code',{},cookie);
 assert.equal(deletion.response.status,200);
 assert.equal((await call('/__fixture/email-count')).body.email_attempts,0);
 console.log('POST /api/community/account/deletion-code -> 200; challenge=[REDACTED]; email_attempts=0');
 const removed=await call('/api/community/account/delete',{challenge_id:deletion.body.challenge_id,code},cookie);
 assert.equal(removed.response.status,200);assert.equal(removed.body.deleted,true);
 assert.match(removed.response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call('/api/voice/status',undefined,cookie)).body.signed_in,false);
 console.log('POST /api/community/account/delete -> 200; deleted=true; old session no longer signs in');
 const renewed=await verify(await request());
 const second=(await call('/api/community/status',undefined,renewed)).body;
 assert.notEqual(second.member.id,first.member.id);assert.equal(second.member.role,'member');
 assert.equal((await call('/api/voice/status',undefined,renewed)).body.signed_in,true);
 assert.equal((await call('/__fixture/email-count')).body.email_attempts,0);
 // Print only aggregate audit evidence; no credential, cookies or challenges.
 assert.ok(!output.includes(code),'Fixture credential leaked into Worker logs');
 assert.equal((output.match(/"event":"community_reviewer_signin"/g)||[]).length,2);
 assert.equal((output.match(/"event":"community_reviewer_deletion"/g)||[]).length,1);
 console.log('Recreated fresh member; Talk signed_in=true; email_attempts=0; 3 redacted audit events.');
 console.log('PASS: local Wrangler end-to-end proof; no provider call or model spend.');
}finally{
 if(dev?.pid){
  const stopped=new Promise(resolve=>dev.once('close',resolve));
  try{process.kill(-dev.pid,'SIGTERM')}catch{}
  let timer;
  await Promise.race([stopped,new Promise(resolve=>{timer=setTimeout(resolve,3000)})]);
  clearTimeout(timer);
  if(dev.exitCode===null&&dev.signalCode===null){try{process.kill(-dev.pid,'SIGKILL')}catch{}await stopped}
 }
 await writeFile(join(privateRoot,'wrangler-local.log'),output);
 await rm(folder,{recursive:true,force:true});
}
