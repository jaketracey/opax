import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const folder=mkdtempSync(join(tmpdir(),'opax-reply-email-'));
await build({entryPoints:['community','community-notifications','community-email'].map(name=>new URL('../src/'+name+'.ts',import.meta.url).pathname),outdir:folder,bundle:true,platform:'node',format:'esm'});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.js')));
const {deliverReplyEmails,queueReplyEmail}=await import(pathToFileURL(join(folder,'community-notifications.js')));
const {replyEmail}=await import(pathToFileURL(join(folder,'community-email.js')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_community.sql','0002_free_community.sql','0009_community_social.sql','0010_reply_email_notifications.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}});
 const outbox=[],background=[],cookies={};
 const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const result=[];for(const stmt of stmts)result.push(await stmt.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_EMAIL_FROM:'hello@login.opax.test',COMMUNITY_EMAIL:{async send(mail){outbox.push(mail);return {messageId:'email-'+outbox.length}}}};
 for(const [id,name] of [['alice','Alice Reader'],['bob','Bob Researcher'],['carol','Carol Observer']]){
  const token=id[0].repeat(43);cookies[id]='__Host-opax_session='+token;
  db.prepare('INSERT INTO members(id,email,display_name,created_at) VALUES (?,?,?,?)').run(id,id+'@example.test',name,1000);
  db.prepare('INSERT INTO member_sessions VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Math.floor(Date.now()/1000)+86400,1000);
 }
 db.prepare('INSERT INTO community_threads(id,member_id,title,body,created_at) VALUES (?,?,?,?,?)').run('housing','alice','A housing discussion','What does the record show?',1000);
 const call=(path,method='GET',data,user='bob',immediate=false)=>communityRoute(new Request('https://opax.test/api/community/'+path,{method,headers:{origin:'https://opax.test',...(user?{cookie:cookies[user]}:{}),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),env,immediate?{waitUntil:p=>background.push(p)}:undefined);
 const reply=async(user='bob',immediate=false)=>{const response=await call('threads/housing','POST',{body:'A useful reply with a public source.'},user,immediate);assert.equal(response.status,201,await response.clone().text());return db.prepare('SELECT id FROM community_replies ORDER BY rowid DESC LIMIT 1').get().id};
 const state=id=>db.prepare('SELECT * FROM community_email_outbox WHERE reply_id=?').get(id);
 const unsubscribe=(url,method='GET',body='List-Unsubscribe=One-Click',headers={})=>communityRoute(new Request(url,{method,headers:method==='POST'?{'content-type':'application/x-www-form-urlencoded',...headers}:headers,body:method==='POST'?body:undefined}),env);
 return {db,env,outbox,background,call,reply,state,unsubscribe};
}
const unsubscribeUrl=mail=>mail.headers['List-Unsubscribe'].slice(1,-1);

test('the actual Worker allows the unsubscribe form and its styles without allowing scripts',async()=>{
 const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-unrelated-image-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'image-renderer',namespace:'email-test'}));b.onLoad({filter:/.*/,namespace:'email-test'},()=>({contents:'export async function renderOgPng(){throw Error("Image rendering is outside this test")}; export const renderOgJpeg=renderOgPng;',loader:'js'}))}}]});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const f=fixture();try{
  await f.reply();await deliverReplyEmails(f.env);
  const url=unsubscribeUrl(f.outbox[0]);
  const response=await worker.fetch(new Request(url),f.env,{});
  assert.equal(response.status,200);
  const csp=response.headers.get('content-security-policy');
  assert.match(csp,/default-src 'none'/);assert.match(csp,/form-action 'self'/);assert.match(csp,/style-src 'unsafe-inline'/);assert.doesNotMatch(csp,/script-src/);
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.match(await response.text(),/method="post"/);
  const result=await worker.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),f.env,{});
  assert.equal(result.status,200);assert.match(await result.text(),/Reply emails are turned off/);
  assert.equal(f.db.prepare("SELECT reply_email_notifications n FROM members WHERE id='alice'").get().n,0);
  const invalid=await worker.fetch(new Request('https://opax.test/api/community/email/unsubscribe'),f.env,{});
  assert.equal(invalid.status,400);assert.match(invalid.headers.get('content-security-policy'),/form-action 'none'/);
 }finally{f.db.close()}
});

test('new replies email only the discussion author, preserve the notification, and support background delivery',async()=>{
 const f=fixture();try{
  const id=await f.reply('bob',true);await Promise.all(f.background);
  assert.equal(f.outbox.length,1);assert.equal(f.outbox[0].to,'alice@example.test');
  assert.equal(f.state(id).state,'sent');assert.equal(f.state(id).provider_id,'email-1');
  assert.equal(f.db.prepare("SELECT count(*) n FROM community_notifications WHERE member_id='alice' AND kind='reply'").get().n,1);
  assert.match(f.outbox[0].text,new RegExp('#reply-'+id));assert.match(f.outbox[0].html,/Read the reply/);
  assert.match(f.outbox[0].html,/cid:opax-brand-mark/);assert.match(f.outbox[0].text,/Bob Researcher/);
  assert.doesNotMatch(f.outbox[0].html,/alice@example|bob@example|#token=/);
  assert.equal(f.outbox[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  await queueReplyEmail(f.env,id).run();await deliverReplyEmails(f.env);assert.equal(f.outbox.length,1);
  await f.reply('alice');await deliverReplyEmails(f.env);assert.equal(f.outbox.length,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM community_email_outbox').get().n,1);
 }finally{f.db.close()}
});

test('preferences are private, validated, independently editable and cancel queued emails',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('preferences','GET',undefined,null)).status,401);
  assert.equal((await (await f.call('preferences','GET',undefined,'alice')).json()).reply_email_notifications,true);
  const id=await f.reply();
  assert.equal((await f.call('preferences','PATCH',{reply_email_notifications:false},'alice')).status,200);
  assert.equal(f.state(id).state,'skipped');await deliverReplyEmails(f.env);assert.equal(f.outbox.length,0);
  await f.reply();assert.equal(f.db.prepare('SELECT count(*) n FROM community_email_outbox').get().n,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM community_notifications WHERE kind='reply'").get().n,2);
  await f.call('preferences','PATCH',{message_policy:'nobody'},'alice');
  let prefs=await (await f.call('preferences','GET',undefined,'alice')).json();assert.deepEqual(prefs,{message_policy:'nobody',reply_email_notifications:false});
  await f.call('preferences','PATCH',{reply_email_notifications:true},'alice');prefs=await (await f.call('preferences','GET',undefined,'alice')).json();assert.equal(prefs.message_policy,'nobody');
  for(const value of ['false',0,null])assert.equal((await f.call('preferences','PATCH',{reply_email_notifications:value},'alice')).status,400);
  assert.equal((await f.call('preferences','PATCH',{},'alice')).status,400);
  assert.doesNotMatch(await (await f.call('members/alice','GET',undefined,null)).text(),/reply_email_notifications|@example/);
 }finally{f.db.close()}
});

test('delivery rechecks blocks, disabled accounts, moderation, preferences and the community switch',async()=>{
 for(const sql of ["INSERT INTO member_blocks VALUES ('alice','bob',1)","INSERT INTO member_blocks VALUES ('bob','alice',1)","UPDATE members SET disabled=1 WHERE id='alice'","UPDATE members SET disabled=1 WHERE id='bob'","UPDATE community_threads SET hidden=1","UPDATE community_replies SET hidden=1","UPDATE members SET reply_email_notifications=0 WHERE id='alice'"]){
  const f=fixture();try{const id=await f.reply();f.db.exec(sql);await deliverReplyEmails(f.env);assert.equal(f.outbox.length,0,sql);assert.equal(f.state(id).state,'skipped')}finally{f.db.close()}
 }
 const f=fixture();try{const id=await f.reply();f.env.COMMUNITY_ENABLED='false';await deliverReplyEmails(f.env);assert.equal(f.state(id).state,'pending');assert.equal(f.outbox.length,0)}finally{f.db.close()}
});

test('atomic claims prevent duplicate sends under overlapping delivery runs',async()=>{
 const f=fixture();try{
  const id=await f.reply();let release;const gate=new Promise(resolve=>release=resolve);const send=f.env.COMMUNITY_EMAIL.send;
  f.env.COMMUNITY_EMAIL.send=async mail=>{await gate;return send(mail)};
  const first=deliverReplyEmails(f.env,id);await new Promise(resolve=>setImmediate(resolve));
  await deliverReplyEmails(f.env,id);assert.equal(f.state(id).attempts,1);release();await first;assert.equal(f.outbox.length,1);
 }finally{f.db.close()}
});

test('an opt-out during email preparation is honoured immediately before dispatch',async()=>{
 const f=fixture();try{
  const id=await f.reply(),prepare=f.env.COMMUNITY_DB.prepare;
  f.env.COMMUNITY_DB.prepare=sql=>{const stmt=prepare(sql);if(!sql.startsWith('INSERT INTO community_email_unsubscribes'))return stmt;return {bind(...args){const bound=stmt.bind(...args);return {async run(){const r=await bound.run();f.db.exec("UPDATE members SET reply_email_notifications=0 WHERE id='alice'");return r}}}}};
  await deliverReplyEmails(f.env);assert.equal(f.outbox.length,0);assert.equal(f.state(id).state,'skipped');
 }finally{f.db.close()}
});

test('preparation failures can retry but a failed receipt write never resends an accepted email',async()=>{
 const f=fixture();try{
  const id=await f.reply();f.db.exec("CREATE TRIGGER fail_token BEFORE INSERT ON community_email_unsubscribes BEGIN SELECT RAISE(ABORT,'temporarily unavailable'); END");
  await deliverReplyEmails(f.env);assert.equal(f.state(id).state,'pending');assert.equal(f.outbox.length,0);
  f.db.exec("DROP TRIGGER fail_token; UPDATE community_email_outbox SET next_attempt_at=0; CREATE TRIGGER fail_receipt BEFORE UPDATE ON community_email_outbox WHEN NEW.state='sent' BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END");
  await assert.rejects(deliverReplyEmails(f.env));assert.equal(f.outbox.length,1);assert.equal(f.state(id).state,'sending');
  f.db.exec('DROP TRIGGER fail_receipt; UPDATE community_email_outbox SET lease_until=0');await deliverReplyEmails(f.env);assert.equal(f.outbox.length,1);assert.equal(f.state(id).state,'uncertain');
 }finally{f.db.close()}
});

test('explicit temporary email failures retry without failing or duplicating the posted reply',async()=>{
 const f=fixture();try{
  const send=f.env.COMMUNITY_EMAIL.send;f.env.COMMUNITY_EMAIL.send=async()=>{throw Object.assign(new Error('temporary'),{code:'E_RATE_LIMIT_EXCEEDED'})};
  const id=await f.reply('bob',true);await Promise.all(f.background);assert.equal(f.state(id).state,'pending');assert.equal(f.state(id).attempts,1);
  await deliverReplyEmails(f.env);assert.equal(f.state(id).attempts,1);
  f.db.exec('UPDATE community_email_outbox SET next_attempt_at=0');f.env.COMMUNITY_EMAIL.send=send;
  await deliverReplyEmails(f.env);assert.equal(f.outbox.length,1);assert.equal(f.state(id).state,'sent');assert.equal(f.db.prepare('SELECT count(*) n FROM community_replies').get().n,1);
 }finally{f.db.close()}
});

test('permanent, exhausted and ambiguous deliveries do not loop or resend accepted messages',async()=>{
 for(const [code,expected] of [['E_RECIPIENT_SUPPRESSED','failed'],['','uncertain']]){
  const f=fixture();try{const id=await f.reply();let attempts=0;f.env.COMMUNITY_EMAIL.send=async()=>{attempts++;throw Object.assign(new Error('private provider detail'),{code})};await deliverReplyEmails(f.env);await deliverReplyEmails(f.env);assert.equal(attempts,1);assert.equal(f.state(id).state,expected)}finally{f.db.close()}
 }
 const f=fixture();try{
  const id=await f.reply();f.db.exec("UPDATE community_email_outbox SET state='sending',lease_until=0");await deliverReplyEmails(f.env);assert.equal(f.state(id).state,'uncertain');assert.equal(f.outbox.length,0);
  const exhausted=await f.reply();f.db.prepare('UPDATE community_email_outbox SET attempts=4 WHERE reply_id=?').run(exhausted);f.env.COMMUNITY_EMAIL.send=async()=>{throw Object.assign(new Error('temporary'),{code:'E_INTERNAL_SERVER_ERROR'})};await deliverReplyEmails(f.env);assert.equal(f.state(exhausted).state,'failed');
 }finally{f.db.close()}
});

test('unsubscribe GET is read-only, POST is scoped and repeatable, re-enabling invalidates old links',async()=>{
 const f=fixture();try{
  await f.reply();await deliverReplyEmails(f.env);const url=unsubscribeUrl(f.outbox[0]);
  const token=new URL(url).searchParams.get('token');assert.ok(token);assert.notEqual(f.db.prepare('SELECT token_hash FROM community_email_unsubscribes').get().token_hash,token);
  let response=await f.unsubscribe(url);assert.equal(response.status,200);assert.match(await response.text(),/Turn off reply emails\?/);
  assert.equal(f.db.prepare("SELECT reply_email_notifications n FROM members WHERE id='alice'").get().n,1);
  assert.equal((await f.unsubscribe(url,'HEAD')).status,200);
  assert.equal((await f.unsubscribe(url,'POST','no=thanks')).status,400);
  assert.equal((await f.unsubscribe(url,'POST','{}',{'content-type':'application/json'})).status,415);
  assert.equal((await f.unsubscribe(url,'POST','x'.repeat(1100))).status,413);
  const pending=await f.reply();response=await f.unsubscribe(url,'POST');assert.equal(response.status,200);assert.match(await response.text(),/Reply emails are turned off/);assert.equal(f.state(pending).state,'skipped');
  assert.equal((await f.unsubscribe(url,'POST')).status,200);
  assert.equal(f.db.prepare("SELECT reply_email_notifications n FROM members WHERE id='bob'").get().n,1);
  assert.equal((await f.call('auth/request','POST',{email:'alice@example.test'},null)).status,200);assert.equal(f.outbox.length,2);assert.match(f.outbox[1].subject,/sign-in/);
  await f.call('preferences','PATCH',{reply_email_notifications:true},'alice');assert.equal((await f.unsubscribe(url,'POST')).status,400);
  assert.equal((await f.unsubscribe(url.replace(token,'x'.repeat(43)),'POST')).status,400);
 }finally{f.db.close()}
});

test('reply, activity and outbox creation roll back together and do not backfill old replies',async()=>{
 const f=fixture();try{
  f.db.exec("CREATE TRIGGER fail_email BEFORE INSERT ON community_email_outbox BEGIN SELECT RAISE(ABORT,'unavailable'); END");
  assert.equal((await f.call('threads/housing','POST',{body:'A new source.'})).status,503);
  for(const table of ['community_replies','community_notifications','community_email_outbox'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
  f.db.exec('DROP TRIGGER fail_email');f.db.prepare('INSERT INTO community_replies VALUES (?,?,?,?,?,?)').run('historic','housing','bob','An old reply',1000,0);
  await deliverReplyEmails(f.env);assert.equal(f.outbox.length,0);
 }finally{f.db.close()}
});

test('email content is escaped, clipped and links to an accessible reply even beyond the latest 200',async()=>{
 const mail=replyEmail({origin:'https://opax.test',author:'<script>alert(1)</script>',title:'A title & <img src=x>',body:'<img src=x onerror=alert(1)>\n'+'z'.repeat(500),threadId:'housing',replyId:'old-reply',unsubscribeUrl:'https://opax.test/unsubscribe?token=abc&scope=reply'});
 assert.doesNotMatch(mail.html,/<script>|<img src=x/);assert.match(mail.html,/&lt;script&gt;/);assert.match(mail.html,/&amp;scope=reply/);assert.match(mail.text,/…/);assert.doesNotMatch(mail.text,/z{300}/);
 assert.equal(mail.subject,'New reply to your Opax discussion');
 const f=fixture();try{
  for(let i=0;i<205;i++)f.db.prepare('INSERT INTO community_replies VALUES (?,?,?,?,?,?)').run('reply-'+i,'housing','bob','Reply '+i,1000+i,0);
  let data=await (await f.call('threads/housing?reply=reply-0','GET',undefined,null)).json();assert.equal(data.replies.length,200);assert.equal(data.replies[0].id,'reply-0');assert.equal(data.replies.at(-1).id,'reply-204');assert.equal(data.more_replies,true);
  f.db.exec("UPDATE community_replies SET hidden=1 WHERE id='reply-0'");data=await (await f.call('threads/housing?reply=reply-0','GET',undefined,null)).json();assert.ok(!data.replies.some(r=>r.id==='reply-0'));
 }finally{f.db.close()}
});
