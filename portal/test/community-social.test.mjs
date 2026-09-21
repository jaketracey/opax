import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const folder=mkdtempSync(join(tmpdir(),'opax-social-test-'));
await build({entryPoints:[new URL('../src/community.ts',import.meta.url).pathname],outfile:join(folder,'community.mjs'),bundle:true,platform:'node',format:'esm'});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.mjs')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_community.sql','0002_free_community.sql','0009_community_social.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}});
 const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const results=[];for(const stmt of stmts)results.push(await stmt.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test'};
 const cookies={};
 for(const [id,name] of [['alice','Alice Reader'],['bob','Bob Researcher'],['carol','Carol Observer'],['mod','Moderator']]){
  const token=(id[0]).repeat(43);cookies[id]='__Host-opax_session='+token;
  db.prepare('INSERT INTO members(id,email,display_name,bio,role,created_at) VALUES (?,?,?,?,?,?)').run(id,id+'@example.test',name,id==='bob'?'Housing research':'Public records',id==='mod'?'moderator':'member',1000);
  db.prepare('INSERT INTO member_sessions VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Math.floor(Date.now()/1000)+86400,1000);
 }
 const call=(path,method='GET',data,user='alice',origin='https://opax.test')=>communityRoute(new Request('https://opax.test/api/community/'+path,{method,headers:{origin,...(user?{cookie:cookies[user]}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),env);
 const post=(recipient='bob',body='A private research question',client_id=crypto.randomUUID())=>({recipient_id:recipient,body,client_id});
 const thread=async(user='alice')=>{const r=await call('threads','POST',{title:'Housing source discussion',body:'What can we learn from this source?',source_path:'/doc/speech-123'},user);assert.equal(r.status,201);return (await r.json()).id};
 return {db,env,call,post,thread};
}
async function payload(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json()}

test('DMs are participant-only, idempotent and do not leak into public profiles or notifications',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('conversations','GET',undefined,null)).status,401);
  const message=f.post(),sent=await payload(await f.call('conversations','POST',message),201);
  assert.equal((await f.call('conversations','POST',message)).status,200);
  const reverse=await payload(await f.call('conversations','POST',f.post('alice','Thanks for the source.'),'bob'),201);
  assert.equal(reverse.id,sent.id);assert.equal(f.db.prepare('SELECT count(*) n FROM direct_conversations').get().n,1);
  const a=await payload(await f.call('conversations/'+sent.id));assert.equal(a.messages.length,2);assert.equal(a.conversation.member.email,undefined);
  for(const user of ['carol','mod']){
   assert.equal((await f.call('conversations/'+sent.id,'GET',undefined,user)).status,404);
   assert.equal((await f.call('conversations/'+sent.id+'/read','POST',{through:a.messages[0].seq},user)).status,404);
   assert.equal((await f.call('conversations/'+sent.id+'/messages','POST',f.post('alice'),user)).status,404);
   assert.deepEqual((await payload(await f.call('conversations','GET',undefined,user))).conversations,[]);
  }
  assert.equal((await f.call('conversations','POST',{...message,recipient_id:'carol'})).status,409);
  assert.equal((await f.call('conversations','POST',{...message,body:'Changed body'})).status,409);
  assert.equal((await f.call('conversations','POST',message,'carol')).status,409);
  assert.equal(f.db.prepare('SELECT count(*) n FROM direct_messages').get().n,2);
  assert.doesNotMatch(await (await f.call('members/alice','GET',undefined,null)).text(),/private research question|@example/);
  assert.deepEqual((await payload(await f.call('notifications','GET',undefined,'bob'))).notifications,[]);
  assert.equal((await f.call('conversations/'+sent.id)).headers.get('cache-control'),'no-store');
 }finally{f.db.close()}
});

test('message read cursors preserve later and same-second unread messages, and cannot be forged',async()=>{
 const f=fixture();try{
  const {id}=await payload(await f.call('conversations','POST',f.post()),201);
  const first=(await payload(await f.call('conversations/'+id,'GET',undefined,'bob'))).messages[0];
  assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.messages,1);
  await f.call('conversations/'+id+'/messages','POST',f.post('bob','Second message'));
  await f.call('conversations/'+id+'/read','POST',{through:first.seq},'bob');
  assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.messages,1);
  await f.call('conversations/'+id+'/read','POST',{through:999999},'bob');
  assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.messages,1);
  const incremental=await payload(await f.call('conversations/'+id+'?after='+first.seq,'GET',undefined,'bob'));assert.equal(incremental.messages.length,1);
  const second=incremental.messages[0];await f.call('conversations/'+id+'/read','POST',{through:second.seq},'bob');await f.call('conversations/'+id+'/read','POST',{through:first.seq},'bob');
  assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.messages,0);
  assert.equal((await f.call('conversations/'+id+'?before=NaN')).status,400);
 }finally{f.db.close()}
});

test('DM pagination is chronological without overlap, including identical timestamps',async()=>{
 const f=fixture();try{
  const {id}=await payload(await f.call('conversations','POST',f.post()),201);
  for(let i=0;i<104;i++)f.db.prepare('INSERT INTO direct_messages(id,conversation_id,sender_id,body,created_at) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),id,'alice','Message '+i,1234);
  const latest=await payload(await f.call('conversations/'+id,'GET',undefined,'bob'));assert.equal(latest.messages.length,50);assert.equal(latest.more,true);
  const older=await payload(await f.call('conversations/'+id+'?before='+latest.messages[0].seq,'GET',undefined,'bob'));assert.equal(older.messages.length,50);
  assert.ok(older.messages.at(-1).seq<latest.messages[0].seq);
  const first=await payload(await f.call('conversations/'+id+'?before='+older.messages[0].seq,'GET',undefined,'bob'));assert.equal(first.messages.length,5);assert.equal(first.more,false);
  const incremental=await payload(await f.call('conversations/'+id+'?after=0','GET',undefined,'bob'));assert.equal(incremental.more,true);assert.equal(incremental.messages.length,50);assert.ok(incremental.messages[0].seq<incremental.messages.at(-1).seq);
 }finally{f.db.close()}
});

test('privacy changes and bilateral blocks apply to existing conversations and social discovery',async()=>{
 const f=fixture();try{
  const thread=await f.thread('bob'),{id}=await payload(await f.call('conversations','POST',f.post()),201);
  await f.call('preferences','PATCH',{message_policy:'following'},'bob');
  assert.equal((await f.call('conversations/'+id+'/messages','POST',f.post())).status,403);
  await f.call('members/alice/follow','PUT',undefined,'bob');
  assert.equal((await f.call('conversations/'+id+'/messages','POST',f.post())).status,201);
  await f.call('members/bob/follow','PUT');
  await f.call('members/alice/block','PUT',undefined,'bob');
  for(const [user,other] of [['alice','bob'],['bob','alice']]){
   assert.equal((await f.call('conversations','POST',f.post(other),user)).status,403);
   assert.equal((await f.call('conversations/'+id,'GET',undefined,user)).status,404);
   assert.equal((await f.call('members/'+other+'/follow','PUT',undefined,user)).status,403);
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM member_follows').get().n,0);
  assert.equal((await f.call('threads/'+thread)).status,404);
  assert.equal((await f.call('threads/'+thread,'POST',{body:'Blocked reply'})).status,404);
  assert.equal((await f.call('threads/'+thread+'/like','PUT')).status,404);
  assert.equal((await payload(await f.call('status'))).unread.messages,0);
  const members=await payload(await f.call('members?q=Bob'));assert.equal(members.members.length,0);
  const profile=await payload(await f.call('members/bob'));assert.equal(profile.can_message,false);assert.equal(profile.relationship.blocked,0);assert.equal(profile.threads.length,0);
  await f.call('members/alice/block','DELETE',undefined,'bob');
  await f.call('preferences','PATCH',{message_policy:'nobody'},'bob');assert.equal((await f.call('conversations','POST',f.post())).status,403);
  assert.equal((await f.call('conversations/'+id)).status,200);
  assert.equal((await f.call('preferences','PATCH',{message_policy:'invalid'})).status,400);
 }finally{f.db.close()}
});

test('discovery, following, likes, bookmarks and activity enforce ownership and visibility',async()=>{
 const f=fixture();try{
  const thread=await f.thread('bob');
  assert.equal((await f.call('members','GET',undefined,null)).status,401);
  const found=await payload(await f.call('members?q=housing'));assert.equal(found.members.length,1);assert.equal(found.members[0].email,undefined);
  assert.equal((await payload(await f.call('threads?feed=following'))).threads.length,0);
  await f.call('members/bob/follow','PUT');await f.call('members/bob/follow','PUT');
  assert.equal((await payload(await f.call('threads?feed=following'))).threads.length,1);
  await f.call('threads/'+thread+'/like','PUT');await f.call('threads/'+thread+'/like','PUT');await f.call('threads/'+thread+'/save','PUT');
  const saved=(await payload(await f.call('threads?feed=saved'))).threads;assert.equal(saved.length,1);assert.equal(saved[0].likes,1);assert.equal(saved[0].saved,1);assert.equal(saved[0].liked,1);
  assert.equal((await payload(await f.call('threads?feed=saved','GET',undefined,'carol'))).threads.length,0);
  assert.equal((await f.call('threads?feed=saved','GET',undefined,null)).status,401);
  await f.call('threads/'+thread,'POST',{body:'Another source to compare.'});
  const activity=await payload(await f.call('notifications','GET',undefined,'bob'));assert.deepEqual(activity.notifications.map(n=>n.kind).sort(),['follow','like','reply']);
  assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.activity,3);
  await f.call('notifications/read','POST',{through:activity.notifications[0].id},'alice');assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.activity,3);
  await f.call('notifications/read','POST',{through:activity.notifications[0].id},'bob');assert.equal((await payload(await f.call('status','GET',undefined,'bob'))).unread.activity,0);
  await f.call('threads/'+thread+'/like','DELETE');await f.call('threads/'+thread+'/save','DELETE');assert.equal((await payload(await f.call('threads?feed=saved'))).threads.length,0);
  await f.call('threads/'+thread,'DELETE',undefined,'bob');assert.equal((await payload(await f.call('notifications','GET',undefined,'bob'))).notifications.length,1);
  f.db.prepare('UPDATE members SET disabled=1 WHERE id=?').run('alice');assert.equal((await payload(await f.call('notifications','GET',undefined,'bob'))).notifications.length,0);
 }finally{f.db.close()}
});

test('reporting exposes only the reported received message to moderation',async()=>{
 const f=fixture();try{
  const {id}=await payload(await f.call('conversations','POST',f.post()),201);await f.call('conversations/'+id+'/messages','POST',f.post('bob','Unreported private message'));
  const messages=(await payload(await f.call('conversations/'+id))).messages,report='messages/'+messages[0].id+'/report';
  assert.equal((await f.call(report,'POST',{reason:'Please review this.'},'carol')).status,404);
  assert.equal((await f.call(report,'POST',{reason:'Please review this.'})).status,404);
  assert.equal((await f.call(report,'POST',{reason:'Please review this.'},'bob')).status,200);
  assert.equal((await f.call('reports','GET',undefined,'bob')).status,403);
  const reports=await payload(await f.call('reports','GET',undefined,'mod'));assert.equal(reports.reports.length,1);assert.equal(reports.reports[0].body,'A private research question');assert.equal(reports.reports[0].kind,'message');
  assert.doesNotMatch(JSON.stringify(reports),/Unreported private message/);
  assert.equal((await f.call('messages/'+messages[1].id,'DELETE',undefined,'mod')).status,404);
  assert.equal((await f.call('messages/'+messages[0].id,'DELETE',undefined,'bob')).status,403);
  assert.equal((await f.call('messages/'+messages[0].id,'DELETE',undefined,'mod')).status,200);
  const removed=(await payload(await f.call('conversations/'+id))).messages[0];assert.equal(removed.hidden,1);assert.equal(removed.body,'');
 }finally{f.db.close()}
});

test('social writes reject cross-origin requests, empty messages, self messages and disabled accounts',async()=>{
 const f=fixture();try{
  for(const path of ['members/bob/follow','members/bob/block','threads/none/like','threads/none/save'])assert.equal((await f.call(path,'PUT',undefined,'alice','https://elsewhere.test')).status,403);
  assert.equal((await f.call('conversations','POST',f.post(),'alice','null')).status,403);
  assert.equal((await f.call('conversations','POST',f.post('alice'))).status,403);
  assert.equal((await f.call('conversations','POST',f.post('bob','   '))).status,400);
  assert.equal((await f.call('conversations','POST',f.post('bob','x'.repeat(3001)))).status,400);
  assert.equal((await f.call('conversations','POST',f.post('bob','Message','invalid'))).status,400);
  f.db.exec("UPDATE members SET disabled=1 WHERE id='bob'");assert.equal((await f.call('conversations','POST',f.post())).status,404);
  assert.equal((await f.call('conversations','GET',undefined,'bob')).status,401);
  f.db.exec("UPDATE members SET display_name='' WHERE id='alice'");assert.equal((await f.call('conversations','POST',f.post('carol'))).status,400);
 }finally{f.db.close()}
});

test('message rate limits cap sending and retries do not consume additional allowance',async()=>{
 const f=fixture();try{
  const message=f.post();await f.call('conversations','POST',message);
  for(let i=0;i<25;i++)assert.equal((await f.call('conversations','POST',message)).status,200);
  for(let i=1;i<20;i++)assert.equal((await f.call('conversations','POST',f.post())).status,201);
  assert.equal((await f.call('conversations','POST',f.post())).status,429);assert.equal(f.db.prepare('SELECT count(*) n FROM direct_messages').get().n,20);
 }finally{f.db.close()}
});

test('conversation lookup is private and a privacy change during send prevents insertion',async()=>{
 const f=fixture();try{
  const {id}=await payload(await f.call('conversations','POST',f.post()),201);
  assert.equal((await payload(await f.call('members/bob'))).conversation_id,id);
  assert.equal((await payload(await f.call('members/bob','GET',undefined,'carol'))).conversation_id,null);
  assert.equal((await payload(await f.call('members/bob','GET',undefined,null))).conversation_id,null);
  const batch=f.env.COMMUNITY_DB.batch;
  f.env.COMMUNITY_DB.batch=async stmts=>{f.db.exec("UPDATE members SET message_policy='nobody' WHERE id='bob'");return batch(stmts)};
  assert.equal((await f.call('conversations/'+id+'/messages','POST',f.post())).status,403);
  assert.equal(f.db.prepare('SELECT count(*) n FROM direct_messages').get().n,1);
 }finally{f.db.close()}
});

test('message and conversation insertion roll back together when the database rejects a write',async()=>{
 const f=fixture();try{
  f.db.exec("CREATE TRIGGER reject_message BEFORE INSERT ON direct_messages BEGIN SELECT RAISE(ABORT,'test database failure'); END;");
  assert.equal((await f.call('conversations','POST',f.post())).status,503);
  assert.equal(f.db.prepare('SELECT count(*) n FROM direct_conversations').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM direct_messages').get().n,0);
 }finally{f.db.close()}
});
