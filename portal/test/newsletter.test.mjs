// The newsletter's capture side (docs/NEWSLETTER.md). Nothing here sends an
// email: COMMUNITY_EMAIL is a list the test reads, and Turnstile is a stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {cleanEvent} from '../analytics/privacy.mjs';
import {workerFetch} from './helpers/worker-fetch.mjs';

const folder=mkdtempSync(join(tmpdir(),'opax-newsletter-'));
await build({entryPoints:['newsletter','newsletter-card'].map(name=>new URL('../src/'+name+'.ts',import.meta.url).pathname),outdir:folder,bundle:true,platform:'node',format:'esm'});
const {newsletterRoute,newsletterRecipients,purgeNewsletter,newsletterAddress,newsletterMailbox,newsletterNetwork}=await import(pathToFileURL(join(folder,'newsletter.js')));
const {NEWSLETTER_CARD_HTML}=await import(pathToFileURL(join(folder,'newsletter-card.js')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));

const ORIGIN='https://opax.test',SENDER='Example Publisher Pty Ltd, 1 Example Street, Melbourne VIC 3000',ADDRESS='reader@example.test',DAY=86400;
const realFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=realFetch});

function fixture(overrides={}){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_community.sql','0020_newsletter.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}});
 const outbox=[],checks=[],logs=[],background=[];
 const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){const result=[];for(const stmt of stmts)result.push(await stmt.run());return result}},
  NEWSLETTER_ENABLED:'true',NEWSLETTER_SENDER:SENDER,TURNSTILE_SECRET_KEY:'test-secret',NEWSLETTER_HASH_SECRET:'k'.repeat(40),COMMUNITY_ORIGIN:ORIGIN,COMMUNITY_EMAIL_FROM:'hello@login.opax.test',
  COMMUNITY_EMAIL:{async send(mail){if(env.failSend)throw Object.assign(new Error('refused '+mail.to),{code:'E_DELIVERY_FAILED'});outbox.push(mail);return {messageId:'email-'+outbox.length}}},...overrides};
 // Turnstile's verify call: the token "pass" passes; "elsewhere" and "other-form" are good tokens minted for another site or form.
 globalThis.fetch=async(url,init)=>{checks.push(String(url));const token=init.body.get('response');
  return Response.json({success:token!=='bot',hostname:token==='elsewhere'?'elsewhere.test':'opax.test',action:token==='other-form'?'login':'newsletter'})};
 const original={log:console.log,warn:console.warn,error:console.error};
 for(const level of Object.keys(original))console[level]=(...args)=>logs.push(args.map(String).join(' '));
 const ctx={waitUntil:promise=>background.push(promise)};
 let ip=0;
 // Each call comes from a new IPv4 address unless the test names one.
 const subscribe=async(data={},headers={})=>{
  const response=await newsletterRoute(new Request(ORIGIN+'/api/newsletter/subscribe',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json','cf-connecting-ip':'203.0.113.'+(++ip),...headers},body:JSON.stringify({email:ADDRESS,turnstile:'pass',...data})}),env,ctx);
  await Promise.all(background.splice(0));return response;
 };
 const confirm=(mail,data={},headers={})=>{const params=new URLSearchParams(new URL(confirmLink(mail)).hash.slice(1));
  return newsletterRoute(new Request(ORIGIN+'/api/newsletter/confirm',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',...headers},body:JSON.stringify({token:params.get('t'),from:params.get('from'),...data})}),env,ctx)};
 const open=(url,method='GET',init={headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'})=>newsletterRoute(new Request(url,method==='POST'?{method,...init}:{method}),env,ctx);
 const row=(email=ADDRESS)=>db.prepare('SELECT * FROM newsletter_subscribers WHERE email=?').get(email);
 const counts=()=>Object.fromEntries(db.prepare('SELECT event,sum(n) n FROM newsletter_counts GROUP BY event').all().map(r=>[r.event,r.n]));
 const close=()=>{Object.assign(console,original);db.close()};
 return {db,env,outbox,checks,logs,subscribe,confirm,open,row,counts,close};
}
const confirmLink=mail=>mail.text.match(/https:\/\/opax\.test\/api\/newsletter\/confirm\S+/)[0];
const confirmToken=mail=>new URLSearchParams(new URL(confirmLink(mail)).hash.slice(1)).get('t');
const unsubscribeLink=mail=>mail.headers['List-Unsubscribe'].slice(1,-1);
const wholeDay=value=>Number.isInteger(value)&&value>0&&value%DAY===0;

test('with the flag off nothing is stored, checked or sent, and pages carry no card',async()=>{
 for(const flag of ['false',undefined,'TRUE','1']){
  const f=fixture({NEWSLETTER_ENABLED:flag});try{
   const response=await f.subscribe();
   assert.equal(response.status,404,String(flag));
   assert.equal((await f.open(ORIGIN+'/api/newsletter/confirm')).status,404);
   assert.equal((await newsletterRoute(new Request(ORIGIN+'/api/newsletter/confirm',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({token:'a'.repeat(43)})}),f.env)).status,404);
   assert.equal(f.outbox.length,0);assert.equal(f.checks.length,0);
   for(const table of ['newsletter_subscribers','newsletter_limits','newsletter_counts','community_limits'])assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);
   assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  }finally{f.close()}
 }
 const off=await workerFetch('/about',{NEWSLETTER_ENABLED:'false',NEWSLETTER_TURNSTILE_SITE_KEY:'0x4AAAAAAAtestkey00'});
 const html=await off.text();
 assert.doesNotMatch(html,/opax-newsletter|newsletter-card/);
 assert.doesNotMatch(off.headers.get('content-security-policy'),/challenges\.cloudflare\.com/);
});

test('with the flag on, a page carries one inert template and a deferred script, and nothing that blocks rendering',async()=>{
 const env={NEWSLETTER_ENABLED:'true',NEWSLETTER_TURNSTILE_SITE_KEY:'0x4AAAAAAAtestkey00'};
 const on=await workerFetch('/about',env);
 const doc=new JSDOM(await on.text()).window.document;
 const template=doc.querySelectorAll('template#opax-newsletter-template');
 assert.equal(template.length,1);
 assert.equal(template[0].dataset.siteKey,env.NEWSLETTER_TURNSTILE_SITE_KEY);
 assert.equal(template[0].dataset.stylesheet,'/newsletter-card.css');
 // Inert until the script places it: no card in the page itself, so nothing shifts or is announced.
 assert.equal(doc.querySelectorAll('aside.opax-newsletter').length,0);
 assert.equal(doc.querySelectorAll('head script[src="/newsletter-card.js"][defer]').length,1);
 // The stylesheet is not in the page: it is fetched only when a card is about to appear.
 assert.equal(doc.querySelectorAll('link[href*="newsletter-card"]').length,0);
 const csp=on.headers.get('content-security-policy');
 assert.match(csp,/script-src 'self' 'wasm-unsafe-eval' https:\/\/www\.googletagmanager\.com https:\/\/challenges\.cloudflare\.com;/);
 assert.match(csp,/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
 const privacy=await workerFetch('/privacy',env);
 assert.doesNotMatch(await privacy.text(),/opax-newsletter-template/);
 // The flag without a site key shows nothing: the form could not pass its check.
 const keyless=await workerFetch('/about',{NEWSLETTER_ENABLED:'true'});
 assert.doesNotMatch(await keyless.text(),/opax-newsletter-template/);
 // The confirmation page: one same-origin script, one same-origin post, nothing else.
 const page=await workerFetch('/api/newsletter/confirm?token=ignored',env);
 assert.equal(page.status,200);
 assert.equal(page.headers.get('content-security-policy'),"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.equal(page.headers.get('cache-control'),'no-store');
 const confirmDoc=new JSDOM(await page.text()).window.document;
 assert.equal(confirmDoc.querySelectorAll('script').length,1);assert.equal(confirmDoc.querySelector('script').getAttribute('src'),'/newsletter-confirm.js');
 assert.equal(confirmDoc.querySelector('#confirm').disabled,true);assert.equal(confirmDoc.querySelectorAll('form,#opax-app-banner,template').length,0);
});

test('double opt-in: an address is a recipient only after the button on the confirmation page is pressed',async()=>{
 const f=fixture();try{
  const response=await f.subscribe({page_type:'person'});
  assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
  assert.equal(f.outbox.length,1);assert.equal(f.outbox[0].to,ADDRESS);
  assert.equal(f.row().confirmed_at,null);assert.equal(f.row().editions,'bills');
  assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  // Opening the link (as a mail scanner does) is a page with a button; it confirms nothing and takes no token.
  const link=new URL(confirmLink(f.outbox[0]));
  assert.equal(link.search,'');assert.match(link.hash,/^#t=[\w-]{43}&from=person$/);
  const shown=await f.open(link.origin+link.pathname);
  assert.equal(shown.status,200);assert.match(await shown.text(),/<button type="button" id="confirm" disabled>/);
  assert.equal((await f.open(link.origin+link.pathname,'HEAD')).status,200);
  assert.equal(f.row().confirmed_at,null);
  // A post from another site, or without the token, confirms nothing.
  assert.equal((await f.confirm(f.outbox[0],{},{origin:'https://elsewhere.test'})).status,403);
  assert.equal((await f.confirm(f.outbox[0],{token:''})).status,400);
  assert.equal(f.row().confirmed_at,null);
  const confirmed=await f.confirm(f.outbox[0]);
  assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).title,'You are subscribed');
  assert.ok(wholeDay(f.row().confirmed_at));
  assert.deepEqual((await newsletterRecipients(f.env,'bills')).map(r=>r.email),[ADDRESS]);
  assert.deepEqual(await newsletterRecipients(f.env,'mp'),[]);
  assert.deepEqual(f.counts(),{submitted:1,confirmed:1});
  assert.equal(f.db.prepare("SELECT page_type FROM newsletter_counts WHERE event='confirmed'").get().page_type,'person');
  // The raw confirmation token is never stored.
  assert.ok(!JSON.stringify(f.row()).includes(confirmToken(f.outbox[0])));
 }finally{f.close()}
});

test('token reuse: a second press changes nothing, and expired, unsubscribed and made-up tokens are refused',async()=>{
 const f=fixture();try{
  await f.subscribe();
  await f.confirm(f.outbox[0]);
  f.db.prepare('UPDATE newsletter_subscribers SET confirmed_at=confirmed_at-86400').run();
  const at=f.row().confirmed_at;
  const again=await f.confirm(f.outbox[0]);
  assert.equal(again.status,200);assert.equal(f.row().confirmed_at,at);
  assert.equal(f.counts().confirmed,1);
  // Signing up again while subscribed sends nothing and leaves the row alone, with the same answer.
  const before=JSON.stringify(f.row());
  const repeat=await f.subscribe();
  assert.equal(repeat.status,200);assert.equal((await repeat.json()).ok,true);
  assert.equal(f.outbox.length,1);assert.equal(JSON.stringify(f.row()),before);
  // After unsubscribing, the old confirmation link cannot bring the address back.
  await f.open(unsubscribeLink(f.outbox[0]),'POST');
  assert.equal((await f.confirm(f.outbox[0])).status,400);
  assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  assert.equal((await f.confirm(f.outbox[0],{token:'z'.repeat(43)})).status,400);
  assert.equal((await f.confirm(f.outbox[0],{token:'short'})).status,400);
 }finally{f.close()}
 const g=fixture();try{
  await g.subscribe();
  // The link works for at least 48 hours, and its expiry is a whole day so it does not give the sign-up time away.
  const expires=g.row().confirm_expires_at,nowSeconds=Math.floor(Date.now()/1000);
  assert.ok(wholeDay(expires));assert.ok(expires-nowSeconds>=2*DAY&&expires-nowSeconds<=3*DAY);
  g.db.prepare('UPDATE newsletter_subscribers SET confirm_expires_at=1').run();
  assert.equal((await g.confirm(g.outbox[0])).status,400);
  assert.equal(g.row().confirmed_at,null);
 }finally{g.close()}
});

test('P2 mail-bomb: one plain address only; tagged variants, dotted Gmail variants and one IPv6 /64 share an allowance; the site has a daily cap',async()=>{
 // A strict addr-spec: no display name, angle brackets, quotes, spaces, control characters or over-long parts.
 for(const bad of ['x1<victim@gmail.com>','Victim <victim@gmail.com>','victim@gmail.com>','"a b"@gmail.com','victim@gmail.com\r\nbcc: other@example.test','a@b','a..b@example.test','.a@example.test','a@-example.test','a@example..test','a b@example.test','a@example.test, b@example.test','x'.repeat(65)+'@example.test','a@'+'x'.repeat(250)+'.test',42,null])
  assert.equal(newsletterAddress(bad),null,String(bad));
 assert.equal(newsletterAddress('  Reader.Name+Tag@Example.TEST '),'reader.name+tag@example.test');
 assert.equal(newsletterMailbox('victim+300@gmail.com'),'victim@gmail.com');
 assert.equal(newsletterMailbox('v.i.c.tim+x@googlemail.com'),'victim@gmail.com');
 assert.equal(newsletterMailbox('first.last+news@example.test'),'first.last@example.test');
 assert.equal(newsletterNetwork('2001:db8:1:2:aaaa:bbbb:cccc:dddd'),newsletterNetwork('2001:0db8:0001:0002::1'));
 assert.notEqual(newsletterNetwork('2001:db8:1:2::1'),newsletterNetwork('2001:db8:1:3::1'));
 assert.equal(newsletterNetwork('2001:db8::1'),'2001:db8:0:0::/64');assert.equal(newsletterNetwork('198.51.100.7'),'198.51.100.7');
 const f=fixture();try{
  assert.equal((await f.subscribe({email:'x1<victim@gmail.com>'})).status,400);
  // Three confirmation emails a day to one mailbox, however the address is tagged and wherever the requests come from.
  for(const email of ['victim+1@gmail.com','victim+2@gmail.com','v.ictim+3@gmail.com'])assert.equal((await f.subscribe({email})).status,200,email);
  for(const email of ['victim+4@gmail.com','vic.tim@gmail.com','victim@googlemail.com'])assert.equal((await f.subscribe({email})).status,429,email);
  assert.equal(f.outbox.length,3);
  // The address is stored as typed; only the limiter folds the tag away.
  assert.ok(f.row('victim+1@gmail.com'));assert.equal(f.row('victim+4@gmail.com'),undefined);
 }finally{f.close()}
 const g=fixture();try{
  // Five sign-ups an hour from one IPv6 /64, whichever of its addresses is used.
  for(let i=0;i<5;i++)assert.equal((await g.subscribe({email:`r${i}@example.test`},{'cf-connecting-ip':'2001:db8:1:2::'+(i+1)})).status,200);
  assert.equal((await g.subscribe({email:'r9@example.test'},{'cf-connecting-ip':'2001:db8:1:2:ffff:ffff:ffff:ffff'})).status,429);
  assert.equal((await g.subscribe({email:'r9@example.test'},{'cf-connecting-ip':'2001:db8:1:3::1'})).status,200);
  assert.equal(g.outbox.length,6);
 }finally{g.close()}
 const h=fixture({NEWSLETTER_DAILY_CAP:'2'});try{
  // The site-wide ceiling on confirmation emails a day.
  for(let i=0;i<2;i++)assert.equal((await h.subscribe({email:`c${i}@example.test`})).status,200);
  assert.equal((await h.subscribe({email:'c9@example.test'})).status,429);assert.equal(h.outbox.length,2);
 }finally{h.close()}
});

test('rate-limit counters are keyed hashes in their own table and go when their window ends; the Turnstile check is for this site and this form',async()=>{
 const f=fixture();try{
  await f.subscribe({},{'cf-connecting-ip':'198.51.100.7'});
  const limits=f.db.prepare('SELECT * FROM newsletter_limits').all();
  assert.equal(limits.length,3);
  for(const limit of limits)assert.match(limit.key,/^[0-9a-f]{64}$/);
  // Not the plain SHA-256 of anything guessable: a different secret gives different keys.
  const g=fixture({NEWSLETTER_HASH_SECRET:'j'.repeat(40)});
  try{await g.subscribe({},{'cf-connecting-ip':'198.51.100.7'});
   const other=new Set(g.db.prepare('SELECT key FROM newsletter_limits').all().map(r=>r.key));
   for(const limit of limits)assert.ok(!other.has(limit.key));
  }finally{g.close()}
  assert.doesNotMatch(JSON.stringify(limits),/198\.51\.100|example\.test/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
  // The network counter lasts an hour, the others a day; the purge removes each once its window has ended.
  const t=Math.floor(Date.now()/1000);
  assert.ok(limits.every(limit=>limit.expires_at-t<=DAY));assert.equal(limits.filter(limit=>limit.expires_at-t<=3600).length>=1,true);
  await purgeNewsletter(f.env,t+3601);assert.equal(f.db.prepare('SELECT count(*) n FROM newsletter_limits').get().n<=2,true);
  await purgeNewsletter(f.env,t+DAY+1);assert.equal(f.db.prepare('SELECT count(*) n FROM newsletter_limits').get().n,0);
 }finally{f.close()}
 const g=fixture();try{
  for(const turnstile of ['bot','elsewhere','other-form',undefined]){
   assert.equal((await g.subscribe({turnstile})).status,400,String(turnstile));
  }
  assert.equal(g.outbox.length,0);assert.equal(g.row(),undefined);
  assert.deepEqual([...new Set(g.checks)],['https://challenges.cloudflare.com/turnstile/v0/siteverify']);
  // Another site cannot post the form.
  assert.equal((await g.subscribe({},{origin:'https://elsewhere.test'})).status,403);
  assert.equal(g.outbox.length,0);
 }finally{g.close()}
 // No Turnstile secret, or no hash secret: closed, not open.
 for(const missing of [{TURNSTILE_SECRET_KEY:undefined},{NEWSLETTER_HASH_SECRET:undefined},{NEWSLETTER_HASH_SECRET:'short'}]){
  const h=fixture(missing);try{assert.equal((await h.subscribe()).status,503);assert.equal(h.outbox.length,0);assert.equal(h.row(),undefined)}finally{h.close()}
 }
});

test('P2 one-click unsubscribe (RFC 8058 section 3.2): multipart/form-data and urlencoded both work, at once, with the flag on or off',async()=>{
 const multipart=()=>{const form=new FormData();form.set('List-Unsubscribe','One-Click');return {body:form}};
 for(const [name,init] of [['multipart/form-data',multipart()],['application/x-www-form-urlencoded',{headers:{'content-type':'application/x-www-form-urlencoded; charset=UTF-8'},body:'List-Unsubscribe=One-Click'}]]){
  const f=fixture();try{
   await f.subscribe();await f.confirm(f.outbox[0]);
   const link=unsubscribeLink(f.outbox[0]);
   assert.equal(f.outbox[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
   const asked=await f.open(link);
   assert.equal(asked.status,200);assert.match(await asked.text(),/<button type="submit">Unsubscribe<\/button>/);
   assert.equal(f.row().unsubscribed_at,null);
   // Turned off after launch: the way off the list still works. No cookie, origin or other context is needed.
   f.env.NEWSLETTER_ENABLED='false';
   const done=await f.open(link,'POST',init);
   assert.equal(done.status,200,name);assert.match(await done.text(),/You are unsubscribed/);
   f.env.NEWSLETTER_ENABLED='true';
   assert.ok(wholeDay(f.row().unsubscribed_at));assert.equal(f.row().confirm_token_hash,null);
   assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
   assert.equal((await f.open(link,'POST',init)).status,200);
   assert.equal(f.counts().unsubscribed,1);
  }finally{f.close()}
 }
 const g=fixture();try{
  await g.subscribe();await g.confirm(g.outbox[0]);
  const link=unsubscribeLink(g.outbox[0]);
  // Anything else is refused and unsubscribes nobody.
  const wrong=new FormData();wrong.set('List-Unsubscribe','Maybe');
  assert.equal((await g.open(link,'POST',{body:wrong})).status,400);
  assert.equal((await g.open(link,'POST',{headers:{'content-type':'application/json'},body:'{"List-Unsubscribe":"One-Click"}'})).status,415);
  assert.equal((await g.open(link,'POST',{headers:{'content-type':'application/x-www-form-urlencoded'},body:'x='+'y'.repeat(5000)})).status,413);
  assert.equal(g.row().unsubscribed_at,null);
  assert.equal((await g.open(ORIGIN+'/api/newsletter/unsubscribe?token='+'q'.repeat(43),'POST')).status,400);
 }finally{g.close()}
});

test('P2 retention runs with the flag off: unsubscribed addresses are deleted within 30 days and unconfirmed ones within 8',async()=>{
 const f=fixture();try{
  await f.subscribe();await f.confirm(f.outbox[0]);
  await f.subscribe({email:'pending@example.test'});
  await f.open(unsubscribeLink(f.outbox[0]),'POST');
  f.env.NEWSLETTER_ENABLED='false';
  const real=Math.floor(Date.now()/1000);
  // Day 28 after the unsubscribe: kept. By 30 days after it, whatever the time of day it happened: gone.
  assert.deepEqual(await purgeNewsletter(f.env,real+28*DAY),{unsubscribed:0,unconfirmed:1});
  assert.ok(f.row());
  assert.deepEqual(await purgeNewsletter(f.env,real+30*DAY-600),{unsubscribed:1,unconfirmed:0});
  assert.equal(f.row(),undefined);assert.equal(f.row('pending@example.test'),undefined);
 }finally{f.close()}
 const g=fixture();try{
  await g.subscribe();
  const real=Math.floor(Date.now()/1000);
  await purgeNewsletter(g.env,real+6*DAY);assert.ok(g.row());
  await purgeNewsletter(g.env,real+8*DAY);assert.equal(g.row(),undefined);
 }finally{g.close()}
 // Before the migration has been applied the cron's call is a quiet no-op, not an error every five minutes.
 const missing={COMMUNITY_DB:{prepare:()=>({bind(){return this}}),async batch(){throw new Error('D1_ERROR: no such table: newsletter_subscribers: SQLITE_ERROR')}}};
 assert.equal(await purgeNewsletter(missing),null);
 await assert.rejects(purgeNewsletter({COMMUNITY_DB:{prepare:()=>({bind(){return this}}),async batch(){throw new Error('D1_ERROR: database is locked')}}}));
});

test('a resubmitted address gets a fresh link and nothing else: nobody can keep or revive an address by signing it up again',async()=>{
 const f=fixture();try{
  await f.subscribe();await f.confirm(f.outbox[0]);
  await f.open(unsubscribeLink(f.outbox[0]),'POST');
  f.db.prepare('UPDATE newsletter_subscribers SET unsubscribed_at=unsubscribed_at-20*86400,created_at=created_at-40*86400').run();
  const before=f.row();
  // A third party signs the unsubscribed address up again.
  assert.equal((await f.subscribe()).status,200);
  assert.equal(f.outbox.length,2);
  assert.equal(f.row().unsubscribed_at,before.unsubscribed_at);assert.equal(f.row().created_at,before.created_at);
  assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  // Unconfirmed, the deletion clock keeps running from the unsubscribe.
  const real=Math.floor(Date.now()/1000);
  // The owner confirming the fresh link is the only thing that brings it back.
  assert.equal((await f.confirm(f.outbox[1])).status,200);
  assert.equal(f.row().unsubscribed_at,null);
  assert.deepEqual((await newsletterRecipients(f.env,'bills')).map(r=>r.email),[ADDRESS]);
  assert.deepEqual(await purgeNewsletter(f.env,real+10*DAY),{unsubscribed:0,unconfirmed:0});
 }finally{f.close()}
 const g=fixture();try{
  await g.subscribe();await g.open(unsubscribeLink(g.outbox[0]),'POST');
  g.db.prepare('UPDATE newsletter_subscribers SET unsubscribed_at=unsubscribed_at-20*86400').run();
  await g.subscribe();
  // Never confirmed: deleted on the original schedule, 10 days on, not 30 days after the resubmit.
  assert.deepEqual(await purgeNewsletter(g.env,Math.floor(Date.now()/1000)+10*DAY),{unsubscribed:1,unconfirmed:0});
 }finally{g.close()}
 const h=fixture();try{
  // An unconfirmed address resubmitted every day still goes on its first schedule.
  await h.subscribe();
  h.db.prepare('UPDATE newsletter_subscribers SET created_at=created_at-6*86400').run();
  const created=h.row().created_at;
  await h.subscribe();
  assert.equal(h.row().created_at,created);assert.equal(h.outbox.length,2);
  // The earlier email's "remove this address" link still works after the resubmit.
  assert.equal((await h.open(unsubscribeLink(h.outbox[0]),'POST')).status,200);
 }finally{h.close()}
});

test('Spam Act: the email names its sender, comes from the configured address and carries a working unsubscribe',async()=>{
 const f=fixture();try{
  await f.subscribe();
  const mail=f.outbox[0];
  assert.deepEqual(mail.from,{email:'hello@login.opax.test',name:'OPAX'});
  assert.ok(mail.text.includes(SENDER));assert.ok(mail.html.includes(SENDER));
  assert.ok(mail.text.includes(unsubscribeLink(mail)));assert.ok(mail.html.includes(unsubscribeLink(mail).replace('&','&amp;')));
  assert.equal((await f.open(unsubscribeLink(mail),'POST')).status,200);
  // User-facing text: no em dashes.
  assert.doesNotMatch(mail.text+mail.subject+NEWSLETTER_CARD_HTML,/—/);
 }finally{f.close()}
 // Without a sender identity nothing is sent at all.
 for(const sender of [undefined,'','  ']){
  const g=fixture({NEWSLETTER_SENDER:sender});try{
   assert.equal((await g.subscribe()).status,503);assert.equal(g.outbox.length,0);assert.equal(g.row(),undefined);
  }finally{g.close()}
 }
});

test('P2 no linkage: no analytics event at sign-up, whole-day dates on the row, and no address, token or IP address in a log line or a count',async()=>{
 const f=fixture();try{
  await f.subscribe({page_type:'bill'},{'cf-connecting-ip':'203.0.113.77'});
  const mail=f.outbox[0];
  // Every date on the row is the start of a UTC day: nothing to match against an event's timestamp.
  assert.ok(wholeDay(f.row().created_at));assert.ok(wholeDay(f.row().confirm_expires_at));
  await f.confirm(mail);assert.ok(wholeDay(f.row().confirmed_at));
  await f.open(unsubscribeLink(mail),'POST');assert.ok(wholeDay(f.row().unsubscribed_at));
  // The sign-up is counted on the server as a daily number.
  assert.deepEqual(f.db.prepare("SELECT day,page_type,n FROM newsletter_counts WHERE event='submitted'").all().map(r=>({...r})),[{day:new Date().toISOString().slice(0,10),page_type:'bill',n:1}]);
  // A delivery failure is logged by code only, and the address is not kept.
  f.env.failSend=true;
  assert.equal((await f.subscribe({email:'bounce@example.test'})).status,200);
  assert.equal(f.row('bounce@example.test'),undefined);
  // An unexpected fault is logged without the request.
  const broken={...f.env,COMMUNITY_DB:{prepare(){throw new Error('fault for '+ADDRESS)}}};
  assert.equal((await newsletterRoute(new Request(unsubscribeLink(mail),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),broken)).status,503);
  assert.ok(f.logs.length>=3);
  const secrets=[ADDRESS,'bounce@example.test','example.test','203.0.113.',confirmToken(mail),new URL(unsubscribeLink(mail)).searchParams.get('token')];
  for(const line of f.logs)for(const secret of secrets)assert.ok(!line.includes(secret),line);
  assert.doesNotMatch(JSON.stringify(f.db.prepare('SELECT * FROM newsletter_counts').all()),/example\.test|203\.0\.113/);
  // The confirmation token is in no URL a server receives: the link carries it after the #, and the page posts it in a body.
  assert.equal(new URL(confirmLink(mail)).search,'');
 }finally{f.close()}
 // The row holds an address, a list and dates. Nothing links it to analytics, an account, a place or a network address.
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0020_newsletter.sql',import.meta.url),'utf8'));
 assert.deepEqual(db.prepare("SELECT name FROM pragma_table_info('newsletter_subscribers')").all().map(c=>c.name).sort(),
  ['confirm_expires_at','confirm_token_hash','confirmed_at','created_at','editions','email','id','unsubscribe_token','unsubscribed_at']);
 db.close();
 // The browser sends no event when a sign-up is submitted; "shown" and "dismissed" carry a page type from a fixed list and nothing else.
 assert.deepEqual(cleanEvent('opax_newsletter',{action:'submitted',page_type:'person'}),{page_type:'person'});
 assert.deepEqual(cleanEvent('opax_newsletter',{action:'shown',page_type:'person',email:ADDRESS,page_path:'/subject/person/someone'}),{action:'shown',page_type:'person'});
 assert.deepEqual(cleanEvent('opax_newsletter',{action:ADDRESS,page_type:'melbourne'}),{});
 const script=readFileSync(new URL('../public/newsletter-card.js',import.meta.url),'utf8');
 assert.deepEqual([...script.matchAll(/track\('(\w+)'\)/g)].map(m=>m[1]).sort(),['dismissed','shown']);
 assert.equal(script.match(/opax:analytics', \{ detail/g).length,1);
});

test('the confirmation page script: the token leaves the address bar, and is posted only when the button is pressed',async()=>{
 const token='t'.repeat(43);
 const dom=new JSDOM('<!doctype html><body><h1 id="title" tabindex="-1">Confirm your subscription</h1><p id="text"></p><button type="button" id="confirm" disabled>Confirm subscription</button></body>',{url:`https://opax.com.au/api/newsletter/confirm#t=${token}&from=bill`,runScripts:'outside-only'});
 const {window}=dom,posts=[];
 window.fetch=async(url,init)=>{posts.push({url,init});return {json:async()=>({ok:true,title:'You are subscribed',message:'Thanks for confirming.'})}};
 window.eval(readFileSync(new URL('../public/newsletter-confirm.js',import.meta.url),'utf8'));
 assert.equal(window.location.hash,'');assert.equal(posts.length,0);
 const button=window.document.getElementById('confirm');
 assert.equal(button.disabled,false);
 button.click();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(posts.length,1);assert.equal(posts[0].url,'/api/newsletter/confirm');
 assert.equal(posts[0].init.body,JSON.stringify({token,from:'bill'}));
 assert.equal(window.document.getElementById('title').textContent,'You are subscribed');
 assert.equal(window.document.getElementById('confirm'),null);
 // No token in the link: no button, and nothing is posted.
 const bare=new JSDOM('<!doctype html><body><h1 id="title" tabindex="-1"></h1><p id="text"></p><button type="button" id="confirm" disabled></button></body>',{url:'https://opax.com.au/api/newsletter/confirm',runScripts:'outside-only'});
 let called=0;bare.window.fetch=async()=>{called++};
 bare.window.eval(readFileSync(new URL('../public/newsletter-confirm.js',import.meta.url),'utf8'));
 assert.equal(bare.window.document.getElementById('confirm'),null);assert.equal(called,0);
 assert.equal(bare.window.document.getElementById('title').textContent,'This link has expired');
});

// The card in a browser: timers are held in a list so the test decides when ten seconds have passed.
function browser({path='/bills',stored={},footerTop=2000,ua='Mozilla/5.0 Safari'}={}){
 const dom=new JSDOM(`<!doctype html><html><head></head><body><main id="main"><h1>Page</h1></main><footer><a href="/about">About</a></footer><template id="opax-newsletter-template" data-site-key="0x4AAAAAAAtestkey00" data-stylesheet="/newsletter-card.css">${NEWSLETTER_CARD_HTML}</template></body></html>`,{url:'https://opax.com.au'+path,runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom,timers=[],events=[];
 Object.defineProperty(window.navigator,'userAgent',{value:ua});
 for(const [key,value] of Object.entries(stored))window.localStorage.setItem(key,value);
 window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};
 window.clearTimeout=id=>{if(timers[id-1])timers[id-1]=null};
 const footer=window.document.querySelector('footer');
 footer.getClientRects=()=>[{}];footer.getBoundingClientRect=()=>({top:footerTop});
 window.addEventListener('opax:analytics',e=>{if(e.detail.event==='opax_newsletter')events.push(e.detail.properties)});
 window.eval(readFileSync(new URL('../public/newsletter-card.js',import.meta.url),'utf8'));
 // Run the held timers, then let the card's stylesheet "load" and its promise settle.
 const run=async()=>{for(const timer of timers.splice(0))timer?.fn();for(const link of window.document.querySelectorAll('link[rel="stylesheet"]'))link.dispatchEvent(new window.Event('load'));await new Promise(resolve=>setImmediate(resolve))};
 const card=()=>window.document.querySelector('aside.opax-newsletter');
 const say=event=>window.dispatchEvent(new window.CustomEvent('opax:analytics',{detail:{event}}));
 const go=to=>{window.history.pushState({},'',to);window.dispatchEvent(new window.Event('opax:route'))};
 return {window,timers,events,run,card,say,go,footer,stored:key=>window.localStorage.getItem(key)};
}

test('the card: never on a first page view, then once, in the flow above the footer, and remembered',async()=>{
 const first=browser();
 assert.equal(first.stored('opax-newsletter-views'),'1');
 await first.run();assert.equal(first.card(),null);
 // A finished answer on the first page view does not bring it either.
 first.say('opax_ask_completed');await first.run();assert.equal(first.card(),null);
 // The second page view: nothing at once, the card after the wait.
 first.go('/subject/person/someone');
 assert.equal(first.card(),null);assert.equal(first.timers.at(-1).ms,10000);
 await first.run();
 const card=first.card();
 assert.ok(card);assert.equal(card.nextElementSibling,first.footer);
 assert.equal(card.getAttribute('aria-labelledby'),'opax-newsletter-title');
 assert.equal(first.window.document.documentElement.dataset.opaxPrompt,'newsletter');
 assert.equal(JSON.stringify(first.events),JSON.stringify([{action:'shown',page_type:'person'}]));
 assert.equal(first.stored('opax-newsletter'),'seen');
 // Every field has a label, and the buttons have names.
 for(const input of card.querySelectorAll('input'))assert.ok(card.querySelector(`label[for="${input.id}"]`));
 assert.ok(card.querySelector('[data-newsletter-dismiss]').getAttribute('aria-label'));
 // It does not follow the reader to the next page, and is not offered again.
 first.go('/bills');await first.run();assert.equal(first.card(),null);
 assert.equal(first.window.document.documentElement.dataset.opaxPrompt,undefined);
 for(const state of ['seen','dismissed','subscribed']){
  const later=browser({stored:{'opax-newsletter':state,'opax-newsletter-views':'5'}});
  await later.run();later.say('opax_ask_completed');await later.run();assert.equal(later.card(),null,state);
 }
});

test('the card: dismissal is remembered and returns focus to the page; it never moves what is on screen',async()=>{
 const b=browser({stored:{'opax-newsletter-views':'1'}});
 await b.run();
 b.card().querySelector('[data-newsletter-dismiss]').click();
 assert.equal(b.card(),null);assert.equal(b.stored('opax-newsletter'),'dismissed');
 assert.equal(b.window.document.activeElement,b.footer);
 assert.deepEqual(b.events.map(e=>e.action),['shown','dismissed']);
 // The stylesheet arrived before the card did, from the address the Worker named.
 assert.equal(b.window.document.querySelector('link[rel="stylesheet"]').getAttribute('href'),'/newsletter-card.css');
 // The footer is already on screen: adding the card would move it, so it waits for another page view.
 const inView=browser({stored:{'opax-newsletter-views':'1'},footerTop:400});
 await inView.run();assert.equal(inView.card(),null);assert.equal(inView.stored('opax-newsletter'),null);
 // And no stylesheet was fetched for a card that did not appear.
 assert.equal(inView.window.document.querySelectorAll('link').length,0);
});

test('the card: not while an answer is being written, on /ask only after it ends, and the app prompt wins the page view',async()=>{
 const ask=browser({path:'/ask',stored:{'opax-newsletter-views':'1'}});
 // No ten-second timer on /ask at all.
 assert.equal(ask.timers.filter(Boolean).length,0);
 ask.say('opax_ask_started');await ask.run();assert.equal(ask.card(),null);
 ask.say('opax_ask_completed');assert.equal(ask.card(),null);
 await ask.run();assert.ok(ask.card());
 // An answer starts in the docked assistant while the wait is running: the wait is dropped.
 const docked=browser({stored:{'opax-newsletter-views':'1'}});
 docked.say('opax_ask_started');await docked.run();assert.equal(docked.card(),null);
 // The app prompt claimed this page view first.
 const claimed=browser({stored:{'opax-newsletter-views':'1'}});
 claimed.window.document.documentElement.dataset.opaxPrompt='app';
 await claimed.run();assert.equal(claimed.card(),null);assert.equal(claimed.stored('opax-newsletter'),null);
 // Inside the app, and on policy pages, never.
 const app=browser({stored:{'opax-newsletter-views':'4'},ua:'OPAX-iOS/1.1.3 (70)'});
 await app.run();assert.equal(app.card(),null);
 const policy=browser({path:'/privacy',stored:{'opax-newsletter-views':'4'}});
 await policy.run();assert.equal(policy.card(),null);
 // A browser that cannot remember is never shown it.
 const dom=new JSDOM('<!doctype html><body><footer></footer><template id="opax-newsletter-template"></template></body>',{url:'https://opax.com.au/bills',runScripts:'outside-only'});
 Object.defineProperty(dom.window,'localStorage',{get(){throw new Error('Storage denied')}});
 let scheduled=0;dom.window.setTimeout=()=>{scheduled++;return 1};
 dom.window.eval(readFileSync(new URL('../public/newsletter-card.js',import.meta.url),'utf8'));
 assert.equal(scheduled,0);
});
