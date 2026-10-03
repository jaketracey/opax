import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

crypto.subtle.timingSafeEqual ??= timingSafeEqual;
const folder=mkdtempSync(join(tmpdir(),'opax-deletion-test-'));
const omitImages={name:'omit-image-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function renderOgPng(){throw Error("No images in this test")}; export const renderOgJpeg=renderOgPng; export const renderStoryJpeg=renderOgPng;',loader:'js'}))}};
await build({entryPoints:['community','voice','index'].map(n=>new URL('../src/'+n+'.ts',import.meta.url).pathname),outdir:folder,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',plugins:[omitImages]});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.mjs')));
const {reserveVoiceSession,claimVoiceSession,reconcileVoiceSession,expireVoiceSessions,voiceRoute}=await import(pathToFileURL(join(folder,'voice.mjs')));
const {default:worker}=await import(pathToFileURL(join(folder,'index.mjs')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));
const KEY='fixed-test-only-deletion-mac-key-00000000000000000000';
const hash=s=>createHash('sha256').update(s).digest('hex');
const time=()=>Math.floor(Date.now()/1000);
const migrations=readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
const sqlFile=n=>readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8');

function fixture(t,{migrated=true}={}){
 const db=new DatabaseSync(':memory:');
 for(const file of migrations.filter(n=>migrated||n<'0012'))db.exec(sqlFile(file));
 t.after(()=>db.close());
 const trace=[],outbox=[];
 let failingBatch=false;
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){trace.push(sql);return db.prepare(sql).get(...args)||null},async all(){trace.push(sql);return {results:db.prepare(sql).all(...args)}},async run(){trace.push(sql);const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}});
 // Queue transactions to model D1's serial, atomic batches even under parallel callers.
 let tail=Promise.resolve();
 const env={COMMUNITY_DB:{prepare:statement,batch(stmts){const task=tail.then(async()=>{db.exec('BEGIN');try{const results=[];for(const s of stmts){results.push(await s.run());if(failingBatch&&results.length===12)throw Error('Injected failure')}db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}});tail=task.catch(()=>{});return task}},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://example.test',COMMUNITY_EMAIL_FROM:'signin@example.test',COMMUNITY_CODE_MAC_SECRET:KEY,COMMUNITY_EMAIL:{async send(mail){outbox.push(mail);return {messageId:'test'}}},VOICE_ENABLED:'true',VOICE_AGENT_ID:'test-agent',ELEVENLABS_API_KEY:'test-only',VOICE_TOOL_SECRET:'t'.repeat(43),VOICE_MONTHLY_SECONDS:'40000'};
 const cookies={};
 async function login(id='a',email=id+'@example.test'){
  db.prepare('INSERT INTO members(id,email,display_name,bio,created_at) VALUES (?,?,?,?,?)').run(id,email,'Reader '+id,'Private profile '+id,time());
  const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');cookies[id]='__Host-opax_session='+token;
  db.prepare("INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at,client) VALUES (?,?,?,?,'ios')").run(hash(token),id,time()+40*86400,time());
  return id;
 }
 const call=(path,data={},id='a',headers={},method='POST')=>communityRoute(new Request('https://example.test/api/community/'+path,{method,headers:{origin:env.COMMUNITY_ORIGIN,'content-type':'application/json',cookie:cookies[id]||'','cf-connecting-ip':'192.0.2.1',...headers},body:method==='GET'?undefined:JSON.stringify(data)}),env);
 async function issue(id='a'){
  const r=await call('account/deletion-code',{},id);assert.equal(r.status,200,await r.clone().text());const data=await r.json();
  return {...data,code:outbox.at(-1).text.match(/deletion code: (\d{8})/)[1]};
 }
 const del=(p,id='a',headers={})=>call('account/delete',{challenge_id:p.challenge_id,code:p.code},id,headers);
 const remove=async(id='a')=>{const p=await issue(id),r=await del(p,id);assert.equal(r.status,200,await r.clone().text());return r};
 const row=id=>db.prepare('SELECT * FROM voice_sessions WHERE id=?').get(id);
 const seedCounter=(key,seconds,hits)=>db.prepare('INSERT INTO community_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=excluded.hits').run(hash(key+':'+Math.floor(time()/seconds)),hits,time()+seconds);
 return {db,env,trace,outbox,cookies,login,call,issue,del,remove,row,seedCounter,failBatch:()=>{failingBatch=true}};
}
const count=(db,table)=>db.prepare('SELECT count(*) n FROM '+table).get().n;
const generic=async r=>{assert.equal(r.status,400,await r.clone().text());assert.equal(r.headers.get('set-cookie'),null);return r.json()};
async function active(f,id,t=time()){
 const v=await reserveVoiceSession(f.env,id,t);assert.ok(v);await claimVoiceSession(f.env,id,v.id,t);
 f.db.prepare("UPDATE voice_sessions SET state='active',conversation_id=? WHERE id=?").run('conv_'+v.id,v.id);return v;
}
function seedContent(f){
 const db=f.db,t=time();
 db.exec(`INSERT INTO community_threads VALUES ('owned','a','Personal title','Personal opening','/doc/private',100,0),('empty','a','Remove me','Personal text',NULL,100,0),('other','b','Other title','Other opening',NULL,100,0);
 INSERT INTO community_replies VALUES ('mine','owned','a','My reply',101,0),('theirs','owned','b','Their reply',102,0),('mine-other','other','a','My other reply',103,0);
 INSERT INTO reading_lists VALUES ('list-a','a','Private list','Description',0,100),('list-b','b','Other list','Other description',1,100);
 INSERT INTO reading_list_items VALUES ('item-a','list-a','Item','/doc/private','Private note',100),('item-b','list-b','Other item','/doc/other','Other note',100);
 INSERT INTO member_chats VALUES ('chat-a','a','Personal chat','all',1,'[]',100,100),('chat-b','b','Other chat','all',1,'[]',100,100);
 INSERT INTO direct_conversations VALUES ('conversation','a','b',100),('empty-conversation','a','c',100);
 INSERT INTO direct_messages(id,conversation_id,sender_id,body,created_at) VALUES ('sent','conversation','a','Personal message',100),('received','conversation','b','Their message',101),('only-sent','empty-conversation','a','My message',102);
 INSERT INTO direct_reads VALUES ('conversation','a',1),('conversation','b',2),('empty-conversation','a',3),('empty-conversation','c',3);
 INSERT INTO member_follows VALUES ('a','b',100),('b','a',100),('b','c',100);
 INSERT INTO member_blocks VALUES ('a','c',100),('c','a',100);
 INSERT INTO thread_likes VALUES ('owned','a',100),('owned','b',100),('other','a',100),('other','b',100);
 INSERT INTO thread_bookmarks VALUES ('a','owned',100),('b','owned',100),('a','other',100),('b','other',100);
 INSERT INTO community_notifications(member_id,actor_id,kind,target_id,thread_id,created_at) VALUES ('a','b','reply','theirs','owned',100),('b','a','reply','mine-other','other',100),('b','c','follow','c',NULL,100);
 INSERT INTO community_reports VALUES ('a','other','Filed report',100),('b','mine','Report on deleted content',100),('c','owned','Report on deleted opening',100),('b','other','Other report',100);
 INSERT INTO community_email_outbox(reply_id,member_id,next_attempt_at,created_at) VALUES ('theirs','a',100,100),('mine-other','b',100,100);
 INSERT INTO community_email_unsubscribes VALUES ('unsubscribe-a','a',100),('unsubscribe-b','b',100);
 INSERT INTO voice_access VALUES ('a',1,100),('b',0,100);`);
 for(const [member,client] of [['a','web'],['a','ios'],['b','web']])db.prepare('INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at,client) VALUES (?,?,?,?,?)').run(hash(member+client),member,t+86400,t,client);
 for(const [member,client] of [['a','web'],['a','ios'],['b','web']])db.prepare('INSERT INTO login_links(token_hash,email,expires_at,created_at,client,challenge_id,code_mac) VALUES (?,?,?,?,?,?,?)').run(hash(member+client),member+'@example.test',t+900,t,client,client==='ios'?'x'.repeat(43):null,client==='ios'?'0'.repeat(64):null);
 for(const member of ['a','b'])db.prepare('INSERT INTO mcp_keys(id,member_id,token_hash,name,prefix,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').run('key-'+member,member,hash('key-'+member),'Tool','opax_',t,t+86400);
}

test('0012 test 1: migration preserves every voice column, constraints, indexes, foreign keys and existing content',async t=>{
 const f=fixture(t,{migrated:false});for(const id of ['a','b','c'])await f.login(id);seedContent(f);
 for(const [i,state] of ['reserved','connecting','active','closed','cancelled','expired'].entries()){
  const member=i<3?['a','b','c'][i]:'a';f.db.prepare('INSERT INTO voice_sessions VALUES (?,?,?,?,?,?,?,?,?,?)').run('voice-'+i,member,state,600,i===4?0:600,100,1000,i?110:null,i>=3?120:null,'conv_'+i);
 }
 const before=f.db.prepare('SELECT * FROM voice_sessions ORDER BY id').all(),content=f.db.prepare('SELECT * FROM community_threads ORDER BY id').all();
 assert.throws(()=>f.db.prepare("DELETE FROM members WHERE id='a'").run(),/FOREIGN KEY/);
 f.db.exec('BEGIN');f.db.exec(sqlFile('0012_voice_deletion_safe.sql'));f.db.exec('COMMIT');
 assert.deepEqual(f.db.prepare('SELECT * FROM voice_sessions ORDER BY id').all(),before);assert.deepEqual(f.db.prepare('SELECT * FROM community_threads ORDER BY id').all(),content);
 assert.equal(f.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(f.db.prepare('PRAGMA foreign_key_list(voice_sessions)').get().on_delete,'SET NULL');
 assert.equal(f.db.prepare('PRAGMA table_info(voice_sessions)').all().find(c=>c.name==='member_id').notnull,0);
 assert.deepEqual(f.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'voice_%' ORDER BY name").all().map(r=>r.name),['voice_expiry','voice_member_history','voice_month_budget','voice_one_active_member']);
 assert.match(f.db.prepare("SELECT sql FROM sqlite_master WHERE name='voice_one_active_member'").get().sql,/member_id IS NOT NULL/);
 assert.throws(()=>f.db.prepare("UPDATE voice_sessions SET charged_seconds=601 WHERE id='voice-0'").run(),/CHECK/);
 assert.throws(()=>f.db.prepare("UPDATE voice_sessions SET conversation_id='conv_0' WHERE id='voice-1'").run(),/UNIQUE/);
});

test('0012 test 2: deletion with both slots occupied keeps the slot and budget; tools refuse and relay reconciles by id',async t=>{
 const f=fixture(t);for(const id of ['a','b','c'])await f.login(id);
 const a=await active(f,'a');await active(f,'b');const before=f.row(a.id);await f.remove('a');
 assert.deepEqual({...f.row(a.id)},{...before,member_id:null});assert.equal(await reserveVoiceSession(f.env,'c'),null);
 const response=await voiceRoute(new Request('https://example.test/api/voice/tools/search_records',{method:'POST',headers:{'content-type':'application/json','x-opax-voice-token':f.env.VOICE_TOOL_SECRET},body:JSON.stringify({session_id:a.id})}),f.env,{},()=>{throw Error('No reads permitted')});assert.equal(response.status,403);
 await reconcileVoiceSession(f.env,a.id,37);assert.equal(f.row(a.id).charged_seconds,37);assert.equal(f.row(a.id).state,'closed');assert.ok(await reserveVoiceSession(f.env,'c'));
});

test('0012 test 3: crossing UTC month-end deletion retains the charge and exact 720-second window',async t=>{
 const f=fixture(t);const boundary=Date.UTC(2026,10,1)/1000;let clock=boundary-10;t.mock.method(Date,'now',()=>clock*1000);
 for(const id of ['a','b','c'])await f.login(id);f.env.VOICE_MONTHLY_SECONDS='800';
 const a=await reserveVoiceSession(f.env,'a',clock);assert.equal(a.reserved_seconds,600);await claimVoiceSession(f.env,'a',a.id,boundary-5);f.db.prepare("UPDATE voice_sessions SET state='active' WHERE id=?").run(a.id);
 clock=boundary+2;await f.remove();clock=boundary+5;assert.equal((await reserveVoiceSession(f.env,'b',clock)).reserved_seconds,200);
 for(const age of [720,721]){
  f.db.exec('DELETE FROM voice_sessions');f.db.prepare("INSERT INTO voice_sessions(id,state,reserved_seconds,charged_seconds,created_at,expires_at,closed_at) VALUES ('edge','closed',600,600,?,?,?)").run(boundary-age,boundary,boundary);
  assert.equal((await reserveVoiceSession(f.env,'c',clock)).reserved_seconds,age===720?200:600);
 }
});

test('0012 test 4: repeated delete/signup cannot refund a 1200-second global budget',async t=>{
 const f=fixture(t);f.env.VOICE_MONTHLY_SECONDS='1200';
 for(const id of ['a','b']){await f.login(id);const v=await active(f,id);await reconcileVoiceSession(f.env,v.id,600);await f.remove(id)}
 await f.login('c');assert.equal(await reserveVoiceSession(f.env,'c'),null);assert.equal(f.db.prepare('SELECT SUM(charged_seconds) n FROM voice_sessions').get().n,1200);
});

test('0012 test 5: deleted unclaimed reservation holds budget until expiry and cannot be claimed',async t=>{
 const f=fixture(t);await f.login('a');await f.login('b');f.env.VOICE_MONTHLY_SECONDS='800';const at=time(),v=await reserveVoiceSession(f.env,'a',at);await f.remove();
 assert.equal(await claimVoiceSession(f.env,'a',v.id,at+1),null);const b=await reserveVoiceSession(f.env,'b',at+1);assert.equal(b.reserved_seconds,200);
 await expireVoiceSessions(f.env,at+60);assert.equal(f.row(v.id).state,'cancelled');assert.equal(f.row(v.id).charged_seconds,0);
 await expireVoiceSessions(f.env,at+61);assert.equal((await reserveVoiceSession(f.env,'b',at+61)).reserved_seconds,600);
});

test('0012 test 6: multiple orphaned open rows coexist without a unique member collision',async t=>{
 const f=fixture(t);await f.login('a');await f.login('b');const a=await active(f,'a'),b=await active(f,'b');await f.remove('a');await f.remove('b');assert.equal(f.row(a.id).member_id,null);assert.equal(f.row(b.id).member_id,null);assert.equal(count(f.db,'voice_sessions'),2);
});

test('0012 test 7: failure halfway through deletion rolls back every scope row and redemption, preserving voice',async t=>{
 const f=fixture(t);for(const id of ['a','b','c'])await f.login(id);seedContent(f);await active(f,'a');const p=await f.issue();
 const snapshot=()=>Object.fromEntries(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'sqlite_sequence' AND name<>'community_limits'").all().map(({name})=>[name,f.db.prepare('SELECT * FROM '+name).all()]));
 const before=snapshot();f.failBatch();assert.equal((await f.del(p)).status,503);
 const after=snapshot();before.community_deletion_challenges[0].attempts++;assert.deepEqual(after,before);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('0012 test 8: request and scheduled cleanup clear only orphaned terminal IDs one day after stored closed_at',async t=>{
 const f=fixture(t);await f.login('a');const at=time();
 const cases=[['old','closed',null,at-86400],['young','closed',null,at-86399],['linked','closed','a',at-86401],['open','active',null,at-86401],['cancel','cancelled',null,at-86400],['expired','expired',null,at-86400],['no-close','closed',null,null]];
 for(const [id,state,member,closed] of cases)f.db.prepare('INSERT INTO voice_sessions VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,member,state,600,600,at-90000,at+600,at-90000,closed,'conv_'+id);
 const r=await voiceRoute(new Request('https://example.test/api/voice/status',{headers:{cookie:f.cookies.a}}),f.env,{},()=>{throw Error('No reads')});assert.equal(r.status,200);
 for(const [id] of cases)assert.equal(f.row(id).conversation_id,['old','cancel','expired'].includes(id)?null:'conv_'+id);
 f.env.VOICE_ENABLED='false';f.env.COMMUNITY_ENABLED='false';await worker.scheduled({cron:'*/5 * * * *'},f.env,{});assert.equal(f.row('young').conversation_id,'conv_young');
});

test('0012 test 9: returning email gets a fresh allowance while orphan call holds budget and slot',async t=>{
 const f=fixture(t);await f.login('a');const v=await active(f,'a');await f.remove('a');await f.login('new','a@example.test');const fresh=await reserveVoiceSession(f.env,'new');assert.equal(fresh.reserved_seconds,600);assert.equal(f.row(v.id).member_id,null);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM voice_sessions WHERE member_id IS NULL').get().n,1);
 await f.login('b');assert.equal(await reserveVoiceSession(f.env,'b'),null);assert.equal(f.db.prepare('SELECT SUM(charged_seconds) n FROM voice_sessions').get().n,1200);
});

test('0012 test 10: only cron expires orphan call and later clears ID, including reply-email failure and disabled voice',async t=>{
 for(const failEmail of [false,true]){
  const f=fixture(t);let clock=time();t.mock.method(Date,'now',()=>clock*1000);await f.login('a');const v=await active(f,'a');await f.remove();const deadline=f.row(v.id).expires_at;
  f.env.VOICE_ENABLED='false';
  if(failEmail){const prepare=f.env.COMMUNITY_DB.prepare;f.env.COMMUNITY_DB.prepare=sql=>{if(sql.includes('community_email_outbox'))throw Error('Reply-email failure');return prepare(sql)}}
  const cron=()=>worker.scheduled({cron:'*/5 * * * *',scheduledTime:clock*1000},f.env,{});
  clock=deadline-1;await cron();assert.equal(f.row(v.id).state,'active');
  clock=deadline+1;await cron();assert.equal(f.row(v.id).state,'expired');assert.equal(f.row(v.id).charged_seconds,600);assert.equal(f.row(v.id).closed_at,clock);const closed=clock;
  clock=closed+86399;await cron();assert.ok(f.row(v.id).conversation_id);clock=closed+86400;await cron();assert.equal(f.row(v.id).conversation_id,null);t.mock.restoreAll();
 }
});

test('complete content deletion revokes all credentials, scrubs stubs and preserves others accessible content',async t=>{
 const f=fixture(t);for(const id of ['a','b','c'])await f.login(id);seedContent(f);const v=await active(f,'a');const r=await f.remove();assert.deepEqual(await r.json(),{deleted:true,signed_out:true,message:'Your account and authored content have been deleted.'});assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal(count(f.db,'members'),2);assert.equal(f.db.prepare("SELECT * FROM community_threads WHERE id='empty'").get(),undefined);
 assert.deepEqual({...f.db.prepare("SELECT * FROM community_threads WHERE id='owned'").get()},{id:'owned',member_id:null,title:'Deleted discussion',body:'',source_path:null,created_at:0,hidden:0});
 for(const table of ['member_sessions','mcp_keys','voice_access','member_chats','reading_lists','community_reports','community_email_unsubscribes','direct_reads'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table+' WHERE member_id=?').get('a').n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM login_links WHERE email=?').get('a@example.test').n,0);
 assert.equal(count(f.db,'community_deletion_challenges'),0);assert.equal(count(f.db,'community_email_outbox'),0);assert.equal(count(f.db,'community_replies'),1);assert.equal(count(f.db,'direct_messages'),1);assert.equal(count(f.db,'direct_conversations'),1);assert.equal(count(f.db,'reading_list_items'),1);assert.equal(count(f.db,'member_blocks'),0);assert.equal(count(f.db,'member_follows'),1);assert.equal(count(f.db,'thread_likes'),1);assert.equal(count(f.db,'thread_bookmarks'),1);assert.equal(count(f.db,'community_notifications'),1);assert.equal(count(f.db,'community_reports'),1);
 assert.equal(f.row(v.id).member_id,null);assert.equal((await (await f.call('status',{},'a',{},'GET')).json()).member,null);
 assert.equal((await f.call('profile',{name:'Try resurrecting'},'a',{},'PATCH')).status,401);
 const discussion=await (await f.call('threads/owned',{},'b',{},'GET')).json();assert.equal(discussion.thread.member_id,null);assert.equal(discussion.replies[0].body,'Their reply');
 const inbox=await (await f.call('conversations',{},'b',{},'GET')).json();assert.equal(inbox.conversations[0].member_id,null);
 const conversation=await (await f.call('conversations/conversation',{},'b',{},'GET')).json();assert.equal(conversation.can_message,false);assert.equal(conversation.messages[0].body,'Their message');assert.equal(conversation.conversation.member.name,'Deleted account');
 assert.equal((await f.call('conversations/conversation/messages',{body:'New message',client_id:crypto.randomUUID()},'b')).status,403);
 assert.equal((await f.call('threads/owned',{body:'A new reply'},'b')).status,201);
 assert.equal(count(f.db,'community_email_outbox'),0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 // Deleting the second participant removes their surviving content and empty shell.
 await f.remove('b');assert.equal(count(f.db,'direct_conversations'),0);assert.equal(count(f.db,'direct_messages'),0);
});

test('post-0011 refuses deletion before quota/email; existing web sessions/signin survive applying 0012',async t=>{
 const f=fixture(t,{migrated:false});await f.login();const v=await active(f,'a');
 for(const path of ['account/deletion-code','account/delete'])assert.equal((await f.call(path)).status,503);
 assert.equal(count(f.db,'community_limits'),0);assert.equal(f.outbox.length,0);assert.equal(f.row(v.id).member_id,'a');
 const request=await f.call('auth/request',{email:'a@example.test'});assert.equal(request.status,200);const token=new URL(f.outbox.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(7);
 f.db.exec('BEGIN');f.db.exec(sqlFile('0012_voice_deletion_safe.sql'));f.db.exec('COMMIT');
 assert.equal((await f.call('auth/consume',{token})).status,200);assert.equal((await (await f.call('status',{},'a',{},'GET')).json()).member.email,'a@example.test');await f.remove();assert.equal(f.row(v.id).member_id,null);
});

test('deletion purpose is member-bound, domain-separated, single-use and inaccessible to sign-in consumption',async t=>{
 const f=fixture(t);await f.login('a');await f.login('b');const p=await f.issue();const row=f.db.prepare('SELECT * FROM community_deletion_challenges').get();
 assert.equal(row.code_mac,createHmac('sha256',KEY).update(JSON.stringify(['opax-deletion-code-v1','a',p.challenge_id,p.code])).digest('hex'));assert.equal(row.expires_at-row.created_at,900);assert.equal(row.member_id,'a');assert.equal(p.code.length,8);assert.equal(p.code_mac,undefined);assert.doesNotMatch(f.outbox[0].text,/https:|sign-in link/);
 await generic(await f.del(p,'b'));assert.equal((await f.call('auth/consume-code',p)).status,400);assert.equal(count(f.db,'members'),2);
 const success=await f.del(p);assert.equal(success.status,200);assert.equal((await f.del(p)).status,401);assert.equal((await f.del(p,'b')).status,400);
});

test('wrong, malformed, unknown, expired, superseded and capped codes share generic failures; admissions bound comparison',async t=>{
 const f=fixture(t);await f.login();const p=await f.issue();const wrong={...p,code:p.code==='00000000'?'00000001':'00000000'},expected=await generic(await f.del(wrong));
 for(const code of ['1234567',12345678,null,'abcdefgh'])assert.deepEqual(await generic(await f.del({...p,code})),expected);
 assert.deepEqual(await generic(await f.del(p)),expected);assert.equal(f.db.prepare('SELECT attempts FROM community_deletion_challenges WHERE challenge_id=?').get(p.challenge_id).attempts,5);
 const expired=await f.issue();f.db.prepare('UPDATE community_deletion_challenges SET expires_at=0 WHERE challenge_id=?').run(expired.challenge_id);assert.deepEqual(await generic(await f.del(expired)),expected);
 const old=await f.issue(),fresh=await f.issue();assert.deepEqual(await generic(await f.del(old)),expected);
 f.seedCounter('consume-code-email:'+hash('a@example.test'),86400,10);assert.deepEqual(await generic(await f.del(fresh)),expected);assert.equal(f.db.prepare('SELECT attempts FROM community_deletion_challenges WHERE challenge_id=?').get(fresh.challenge_id).attempts,0);
 f.seedCounter('consume:192.0.2.1',900,30);assert.deepEqual(await generic(await f.del(fresh)),expected);assert.deepEqual(await generic(await f.del({challenge_id:'x'.repeat(43),code:'12345678'})),expected);
 assert.equal(count(f.db,'members'),1);
});

test('issuance shares native/web quotas, supersedes deletion only, and removes a failed-delivery proof',async t=>{
 const f=fixture(t);await f.login();const p=await f.issue();assert.equal((await f.call('auth/request',{email:'a@example.test',client:'ios'})).status,200);const signIn=f.db.prepare("SELECT * FROM login_links WHERE client='ios'").get();
 await f.issue();assert.equal(f.db.prepare('SELECT superseded_at FROM login_links WHERE challenge_id=?').get(signIn.challenge_id).superseded_at,null);await generic(await f.del(p));
 f.env.COMMUNITY_EMAIL.send=async()=>{throw Error('Test email failure')};assert.equal((await f.call('account/deletion-code')).status,503);assert.equal(count(f.db,'community_deletion_challenges'),2);
 f.seedCounter('login-email:a@example.test',3600,5);assert.equal((await f.call('account/deletion-code')).status,400);assert.equal((await f.call('auth/request',{email:'a@example.test'})).status,429);
});

test('parallel correct deletion races yield one atomic winner with no second success',async t=>{
 const f=fixture(t);await f.login();await active(f,'a');const p=await f.issue();
 const responses=await Promise.all(Array.from({length:20},(_,i)=>f.del(p,'a',{'cf-connecting-ip':'192.0.2.'+(i+1)})));
 assert.equal(responses.filter(r=>r.status===200).length,1);for(const r of responses.filter(r=>r.status!==200))assert.ok([400,401].includes(r.status));assert.equal(count(f.db,'members'),0);assert.equal(count(f.db,'member_sessions'),0);assert.equal(count(f.db,'voice_sessions'),1);
});

test('expiry, supersession or exact-session revocation after comparison prevents deletion',async t=>{
 for(const action of ['expire','supersede','revoke']){
  const f=fixture(t);await f.login();const p=await f.issue();const compare=crypto.subtle.timingSafeEqual;
  crypto.subtle.timingSafeEqual=(a,b)=>{const result=compare(a,b);if(action==='revoke')f.db.prepare('DELETE FROM member_sessions WHERE token_hash=?').run(hash(f.cookies.a.split('=')[1]));else f.db.prepare('UPDATE community_deletion_challenges SET '+(action==='expire'?'expires_at=0':'superseded_at=1')+' WHERE challenge_id=?').run(p.challenge_id);return result};
  try{assert.equal((await f.del(p)).status,400)}finally{crypto.subtle.timingSafeEqual=compare}assert.equal(count(f.db,'members'),1);
 }
});

test('cookie and exact Origin are mandatory; unsupported methods and missing secret fail closed',async t=>{
 const f=fixture(t);await f.login();
 for(const path of ['account/deletion-code','account/delete']){
  for(const origin of ['', 'https://evil.example.test','https://example.test/'])assert.equal((await f.call(path,{},'a',{origin})).status,403);
  assert.equal((await f.call(path,{},'a',{cookie:''})).status,401);assert.equal((await f.call(path,{},'a',{},'GET')).status,405);
 }
 f.env.COMMUNITY_CODE_MAC_SECRET='short';assert.equal((await f.call('account/deletion-code')).status,503);assert.equal(count(f.db,'community_limits'),0);assert.equal(f.outbox.length,0);
});

test('deletion removes account/email limiter hashes and a redeemed sign-in proof cannot resurrect the deleted account',async t=>{
 for(const client of ['web','ios']){
  const f=fixture(t);await f.login();const deletion=await f.issue();
  const r=await f.call('auth/request',{email:'a@example.test',...(client==='ios'?{client}:{})});assert.equal(r.status,200);const p=await r.json(),mail=f.outbox.at(-1),token=new URL(mail.text.match(/https:\/\/\S+/)[0]).hash.slice(7),code=mail.text.match(/app sign-in code: (\d{8})/)?.[1];
  f.seedCounter('keys:a',3600,3);f.seedCounter('mcp:a',60,3);const expiry=time()-1;f.db.prepare('INSERT INTO community_limits VALUES (?,?,?)').run(hash('old-account-bucket'),1,expiry);
  const original=f.env.COMMUNITY_DB.batch;let sessionHeld,release;
  const reached=new Promise(resolve=>{sessionHeld=resolve}),hold=new Promise(resolve=>{release=resolve});
  f.env.COMMUNITY_DB.batch=async stmts=>{if(stmts.length===2){sessionHeld();await hold}return original(stmts)};
  const signingIn=f.call(client==='web'?'auth/consume':'auth/consume-code',client==='web'?{token}:{challenge_id:p.challenge_id,code});await reached;
  assert.equal((await f.del(deletion)).status,200);release();assert.ok([400,403].includes((await signingIn).status));assert.equal(count(f.db,'members'),0);assert.equal(count(f.db,'member_sessions'),0);
  for(const [key,seconds] of [['keys:a',3600],['mcp:a',60],['login-email:a@example.test',3600],['consume-code-email:'+hash('a@example.test'),86400]])assert.equal(f.db.prepare('SELECT * FROM community_limits WHERE key=?').get(hash(key+':'+Math.floor(time()/seconds))),undefined);
  assert.equal(f.db.prepare('SELECT * FROM community_limits WHERE expires_at<=?').get(time()),undefined);
 }
});

test('real Worker/D1 applies 0012 with existing content, rolls back deletion failures, and has one race winner plus scheduled expiry',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[omitImages]});
 // Inject a service-bound email double into the actual Worker, including scheduled().
 const workerScript=compiled.outputFiles[0].text.replace(/export \{\s*index_default as default\s*\};/,`const actualWorker=index_default;
 const testWorker={fetch(req,env,ctx){return actualWorker.fetch(req,{...env,COMMUNITY_EMAIL:{send:mail=>env.EMAIL_STUB.fetch(new Request('https://example.test/mail',{method:'POST',body:JSON.stringify(mail)})).then(r=>r.json())}},ctx)},scheduled(c,env,ctx){return actualWorker.scheduled(c,env,ctx)}};
 export {testWorker as default};`);
 assert.match(workerScript,/testWorker as default/);
 const outbox=[];
 const mf=new Miniflare(convertV4MiniflareOptions({port:8941,workers:[{name:'deletion',modules:true,script:workerScript,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],d1Databases:{COMMUNITY_DB:'deletion-runtime'},bindings:{COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://example.test',COMMUNITY_EMAIL_FROM:'signin@example.test',COMMUNITY_CODE_MAC_SECRET:KEY,VOICE_ENABLED:'false'},serviceBindings:{EMAIL_STUB:async req=>{outbox.push(await req.json());return Response.json({messageId:'test'})}},outboundService:()=>{throw Error('Outbound network forbidden in deletion tests')}}]}));
 try{
  const db=await mf.getD1Database('COMMUNITY_DB','deletion');
  const migrate=async file=>db.batch(sqlFile(file).replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  for(const file of migrations.filter(n=>n<'0012'))await migrate(file);
  const at=time(),token='a'.repeat(43),cookie='__Host-opax_session='+token;
  await db.batch([
   db.prepare("INSERT INTO members(id,email,display_name,created_at) VALUES ('a','a@example.test','Reader A',?),('b','b@example.test','Reader B',?)").bind(at,at),
   db.prepare("INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at) VALUES (?,'a',?,?)").bind(hash(token),at+3600,at),
   db.prepare("INSERT INTO community_threads VALUES ('discussion','a','Personal title','Personal opening',NULL,100,0)"),
   db.prepare("INSERT INTO community_replies VALUES ('reply','discussion','b','Other reply',100,0)"),
   db.prepare("INSERT INTO direct_conversations VALUES ('conversation','a','b',100)"),
   db.prepare("INSERT INTO direct_messages(id,conversation_id,sender_id,body,created_at) VALUES ('message','conversation','b','Other message',100)"),
   db.prepare("INSERT INTO voice_sessions VALUES ('voice','a','active',600,600,?,?,?,NULL,'conv_orphan')").bind(at,at+500,at)
  ]);
  const call=(path,data={})=>mf.dispatchFetch('https://example.test/api/community/'+path,{method:'POST',headers:{origin:'https://example.test','content-type':'application/json',cookie},body:JSON.stringify(data)});
  assert.equal((await call('account/deletion-code')).status,503);assert.equal(outbox.length,0);
  await migrate('0012_voice_deletion_safe.sql');assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);assert.equal((await db.prepare('SELECT count(*) n FROM direct_messages').first()).n,1);
  const r=await call('account/deletion-code');assert.equal(r.status,200);const {challenge_id}=await r.json(),code=outbox.at(-1).text.match(/deletion code: (\d{8})/)[1];
  await db.prepare("CREATE TRIGGER deletion_failure BEFORE DELETE ON members BEGIN SELECT RAISE(ABORT,'Test rollback'); END").run();
  assert.equal((await call('account/delete',{challenge_id,code})).status,503);assert.equal((await db.prepare("SELECT member_id FROM voice_sessions WHERE id='voice'").first()).member_id,'a');assert.equal((await db.prepare('SELECT count(*) n FROM member_sessions').first()).n,1);assert.equal((await db.prepare('SELECT used_at FROM community_deletion_challenges').first()).used_at,null);
  await db.prepare('DROP TRIGGER deletion_failure').run();
  const responses=await Promise.all(Array.from({length:10},()=>call('account/delete',{challenge_id,code})));assert.equal(responses.filter(r=>r.status===200).length,1);
  assert.equal((await db.prepare("SELECT * FROM voice_sessions WHERE id='voice'").first()).member_id,null);assert.equal((await db.prepare('SELECT member_id FROM community_threads').first()).member_id,null);assert.equal((await db.prepare('SELECT member_a FROM direct_conversations').first()).member_a,null);assert.equal((await db.prepare('SELECT count(*) n FROM member_sessions').first()).n,0);assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  await db.prepare("UPDATE voice_sessions SET expires_at=? WHERE id='voice'").bind(at-1).run();
  // Break only email delivery. No request follows the delete; cron owns expiry.
  await db.prepare('DROP TABLE community_email_outbox').run();const entry=await mf.getWorker('deletion');await entry.scheduled({cron:'*/5 * * * *',scheduledTime:new Date(time()*1000)});
  const expired=await db.prepare("SELECT * FROM voice_sessions WHERE id='voice'").first();assert.equal(expired.state,'expired',JSON.stringify({at,expired}));assert.equal(expired.charged_seconds,600);assert.ok(expired.closed_at>=at);assert.equal(expired.conversation_id,'conv_orphan');
  await db.prepare("UPDATE voice_sessions SET closed_at=? WHERE id='voice'").bind(time()-86401).run();await entry.scheduled({cron:'*/5 * * * *',scheduledTime:new Date(time()*1000)});assert.equal((await db.prepare("SELECT conversation_id FROM voice_sessions WHERE id='voice'").first()).conversation_id,null);
 }finally{await mf.dispose()}
});

test('parallel wrong guesses compare at most five MACs, and the shared email cap admits one at its boundary',async t=>{
 for(const boundary of [false,true]){
  const f=fixture(t);await f.login();const p=await f.issue();if(boundary)f.seedCounter('consume-code-email:'+hash('a@example.test'),86400,9);
  let comparisons=0;const compare=crypto.subtle.timingSafeEqual;crypto.subtle.timingSafeEqual=(a,b)=>{comparisons++;return compare(a,b)};
  try{const responses=await Promise.all(Array.from({length:20},(_,i)=>f.del({...p,code:p.code==='00000000'?'00000001':'00000000'},'a',{'cf-connecting-ip':'192.0.2.'+(i+1)})));for(const r of responses)await generic(r)}finally{crypto.subtle.timingSafeEqual=compare}
  assert.equal(comparisons,boundary?1:5);assert.equal(f.db.prepare('SELECT attempts FROM community_deletion_challenges').get().attempts,boundary?1:5);assert.equal(count(f.db,'members'),1);
 }
});

test('deletion admission is IP then email then challenge before comparison; sign-in email admission is shared',async t=>{
 const f=fixture(t);await f.login();const p=await f.issue();f.trace.length=0;
 const compare=crypto.subtle.timingSafeEqual;crypto.subtle.timingSafeEqual=(a,b)=>{f.trace.push('MAC comparison');return compare(a,b)};
 try{await generic(await f.del({...p,code:p.code==='00000000'?'00000001':'00000000'}))}finally{crypto.subtle.timingSafeEqual=compare}
 const ip=f.trace.findIndex(sql=>sql.startsWith('INSERT INTO community_limits')),email=f.trace.findIndex((sql,i)=>i>ip&&sql.startsWith('INSERT INTO community_limits')),challenge=f.trace.findIndex(sql=>sql.startsWith('UPDATE community_deletion_challenges SET attempts'));
 assert.ok(ip>=0&&ip<email&&email<challenge&&challenge<f.trace.indexOf('MAC comparison'));
 f.seedCounter('consume-code-email:'+hash('a@example.test'),86400,10);
 const requested=await f.call('auth/request',{email:'a@example.test',client:'ios'});assert.equal(requested.status,200);const {challenge_id}=await requested.json(),code=f.outbox.at(-1).text.match(/app sign-in code: (\d{8})/)[1];assert.equal((await f.call('auth/consume-code',{challenge_id,code})).status,400);assert.equal(f.db.prepare('SELECT attempts FROM login_links').get().attempts,0);
});
