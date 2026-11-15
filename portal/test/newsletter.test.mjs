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
const {newsletterRoute,newsletterRecipients,purgeNewsletter}=await import(pathToFileURL(join(folder,'newsletter.js')));
const {NEWSLETTER_CARD_HTML}=await import(pathToFileURL(join(folder,'newsletter-card.js')));
test.after(()=>rmSync(folder,{recursive:true,force:true}));

const ORIGIN='https://opax.test',SENDER='Example Publisher Pty Ltd, 1 Example Street, Melbourne VIC 3000',ADDRESS='reader@example.test';
const realFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=realFetch});

function fixture(overrides={}){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_community.sql','0020_newsletter.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}});
 const outbox=[],checks=[],logs=[],background=[];
 const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){const result=[];for(const stmt of stmts)result.push(await stmt.run());return result}},
  NEWSLETTER_ENABLED:'true',NEWSLETTER_SENDER:SENDER,TURNSTILE_SECRET_KEY:'test-secret',COMMUNITY_ORIGIN:ORIGIN,COMMUNITY_EMAIL_FROM:'hello@login.opax.test',
  COMMUNITY_EMAIL:{async send(mail){if(env.failSend)throw Object.assign(new Error('refused '+mail.to),{code:'E_DELIVERY_FAILED'});outbox.push(mail);return {messageId:'email-'+outbox.length}}},...overrides};
 // Turnstile's verify call: the token "pass" passes, anything else fails.
 globalThis.fetch=async(url,init)=>{checks.push(String(url));return Response.json({success:init.body.get('response')==='pass'})};
 const original={log:console.log,warn:console.warn,error:console.error};
 for(const level of Object.keys(original))console[level]=(...args)=>logs.push(args.map(String).join(' '));
 const ctx={waitUntil:promise=>background.push(promise)};
 const subscribe=async(data={},headers={})=>{
  const response=await newsletterRoute(new Request(ORIGIN+'/api/newsletter/subscribe',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json','cf-connecting-ip':'203.0.113.7',...headers},body:JSON.stringify({email:ADDRESS,turnstile:'pass',...data})}),env,ctx);
  await Promise.all(background.splice(0));return response;
 };
 const open=(url,method='GET')=>newsletterRoute(new Request(url,method==='POST'?{method,headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}:{method}),env,ctx);
 const row=(email=ADDRESS)=>db.prepare('SELECT * FROM newsletter_subscribers WHERE email=?').get(email);
 const counts=()=>Object.fromEntries(db.prepare('SELECT event,sum(n) n FROM newsletter_counts GROUP BY event').all().map(r=>[r.event,r.n]));
 const close=()=>{Object.assign(console,original);db.close()};
 return {db,env,outbox,checks,logs,subscribe,open,row,counts,close};
}
const confirmLink=mail=>mail.text.match(/https:\/\/opax\.test\/api\/newsletter\/confirm\S+/)[0];
const unsubscribeLink=mail=>mail.headers['List-Unsubscribe'].slice(1,-1);

test('with the flag off nothing is stored, checked or sent, and pages carry no card',async()=>{
 for(const flag of ['false',undefined,'TRUE','1']){
  const f=fixture({NEWSLETTER_ENABLED:flag});try{
   const response=await f.subscribe();
   assert.equal(response.status,404,String(flag));
   assert.equal((await f.open(ORIGIN+'/api/newsletter/confirm?token='+'a'.repeat(43))).status,404);
   assert.equal(f.outbox.length,0);assert.equal(f.checks.length,0);
   assert.equal(f.db.prepare('SELECT count(*) n FROM newsletter_subscribers').get().n,0);
   assert.equal(f.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
   assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  }finally{f.close()}
 }
 const off=await workerFetch('/about',{NEWSLETTER_ENABLED:'false',NEWSLETTER_TURNSTILE_SITE_KEY:'0x4AAAAAAAtestkey00'});
 const html=await off.text();
 assert.doesNotMatch(html,/opax-newsletter|newsletter-card/);
 assert.doesNotMatch(off.headers.get('content-security-policy'),/challenges\.cloudflare\.com/);
});

test('with the flag on, a page carries one inert template and may load Turnstile; policy pages and data do not',async()=>{
 const env={NEWSLETTER_ENABLED:'true',NEWSLETTER_TURNSTILE_SITE_KEY:'0x4AAAAAAAtestkey00'};
 const on=await workerFetch('/about',env);
 const doc=new JSDOM(await on.text()).window.document;
 assert.equal(doc.querySelectorAll('template#opax-newsletter-template').length,1);
 assert.equal(doc.querySelector('template#opax-newsletter-template').dataset.siteKey,env.NEWSLETTER_TURNSTILE_SITE_KEY);
 // Inert until the script places it: no card in the page itself, so nothing shifts or is announced.
 assert.equal(doc.querySelectorAll('aside.opax-newsletter').length,0);
 assert.equal(doc.querySelectorAll('head script[src="/newsletter-card.js"][defer]').length,1);
 const csp=on.headers.get('content-security-policy');
 assert.match(csp,/script-src 'self' 'wasm-unsafe-eval' https:\/\/www\.googletagmanager\.com https:\/\/challenges\.cloudflare\.com;/);
 assert.match(csp,/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
 const privacy=await workerFetch('/privacy',env);
 assert.doesNotMatch(await privacy.text(),/opax-newsletter-template/);
 // The flag without a site key shows nothing: the form could not pass its check.
 const keyless=await workerFetch('/about',{NEWSLETTER_ENABLED:'true'});
 assert.doesNotMatch(await keyless.text(),/opax-newsletter-template/);
});

test('double opt-in: an address is a recipient only after the button on the confirmation page is pressed',async()=>{
 const f=fixture();try{
  const response=await f.subscribe({electorate:'Melbourne',page_type:'person'});
  assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
  assert.equal(f.outbox.length,1);assert.equal(f.outbox[0].to,ADDRESS);
  assert.equal(f.row().confirmed_at,null);assert.equal(f.row().editions,'bills,mp');assert.equal(f.row().electorate,'melbourne');
  assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  // Following the link (as a mail scanner does) shows the button and confirms nothing.
  const link=confirmLink(f.outbox[0]);
  const shown=await f.open(link);
  assert.equal(shown.status,200);assert.match(await shown.text(),/<form action="[^"]+" method="post">/);
  assert.equal(f.row().confirmed_at,null);
  assert.equal((await f.open(link,'HEAD')).status,200);assert.equal(f.row().confirmed_at,null);
  const confirmed=await f.open(link,'POST');
  assert.equal(confirmed.status,200);assert.match(await confirmed.text(),/You are subscribed/);
  assert.ok(f.row().confirmed_at>0);
  assert.deepEqual((await newsletterRecipients(f.env,'mp')).map(r=>r.email),[ADDRESS]);
  assert.deepEqual(f.counts(),{submitted:1,confirmed:1});
  assert.equal(f.db.prepare("SELECT page_type FROM newsletter_counts WHERE event='confirmed'").get().page_type,'person');
  // The raw confirmation token is never stored.
  assert.ok(!JSON.stringify(f.row()).includes(new URL(link).searchParams.get('token')));
 }finally{f.close()}
});

test('token reuse: a second press changes nothing, and expired, unsubscribed and made-up tokens are refused',async()=>{
 const f=fixture();try{
  await f.subscribe();
  const link=confirmLink(f.outbox[0]);
  await f.open(link,'POST');
  const at=f.row().confirmed_at;
  f.db.prepare('UPDATE newsletter_subscribers SET confirmed_at=confirmed_at-50').run();
  const again=await f.open(link,'POST');
  assert.equal(again.status,200);assert.equal(f.row().confirmed_at,at-50);
  assert.equal(f.counts().confirmed,1);
  // Signing up again while subscribed sends nothing and leaves the row alone, with the same answer.
  const repeat=await f.subscribe({electorate:'3000'});
  assert.equal(repeat.status,200);assert.equal((await repeat.json()).ok,true);
  assert.equal(f.outbox.length,1);assert.equal(f.row().electorate,null);assert.equal(f.row().confirmed_at,at-50);
  // After unsubscribing, the old confirmation link cannot bring the address back.
  await f.open(unsubscribeLink(f.outbox[0]),'POST');
  assert.equal((await f.open(link,'POST')).status,400);
  assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  assert.equal((await f.open(ORIGIN+'/api/newsletter/confirm?token='+'z'.repeat(43),'POST')).status,400);
  assert.equal((await f.open(ORIGIN+'/api/newsletter/confirm?token=short')).status,400);
 }finally{f.close()}
 const g=fixture();try{
  await g.subscribe();
  g.db.prepare('UPDATE newsletter_subscribers SET confirm_expires_at=1').run();
  assert.equal((await g.open(confirmLink(g.outbox[0]),'POST')).status,400);
  assert.equal(g.row().confirmed_at,null);
 }finally{g.close()}
});

test('unsubscribe: one press or a mailbox one-click stops everything at once, with the flag on or off, and the row is deleted within 30 days',async()=>{
 const f=fixture();try{
  await f.subscribe();await f.open(confirmLink(f.outbox[0]),'POST');
  const link=unsubscribeLink(f.outbox[0]);
  assert.equal(f.outbox[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  const asked=await f.open(link);
  assert.equal(asked.status,200);assert.match(await asked.text(),/<button type="submit">Unsubscribe<\/button>/);
  assert.equal(f.row().unsubscribed_at,null);
  // Turned off after launch: the way off the list still works.
  f.env.NEWSLETTER_ENABLED='false';
  const done=await f.open(link,'POST');
  assert.equal(done.status,200);assert.match(await done.text(),/You are unsubscribed/);
  f.env.NEWSLETTER_ENABLED='true';
  assert.ok(f.row().unsubscribed_at>0);assert.equal(f.row().confirm_token_hash,null);
  assert.deepEqual(await newsletterRecipients(f.env,'bills'),[]);
  assert.equal((await f.open(link,'POST')).status,200);
  assert.equal((await f.open(ORIGIN+'/api/newsletter/unsubscribe?token='+'q'.repeat(43),'POST')).status,400);
  const t=f.row().unsubscribed_at;
  assert.deepEqual(await purgeNewsletter(f.env,t+29*86400),{unsubscribed:0,unconfirmed:0});
  assert.ok(f.row());
  assert.deepEqual(await purgeNewsletter(f.env,t+30*86400+1),{unsubscribed:1,unconfirmed:0});
  assert.equal(f.row(),undefined);
 }finally{f.close()}
 const g=fixture();try{
  // The "remove this address" link in the confirmation email works before confirming, and a never-confirmed address goes after 7 days.
  await g.subscribe();
  assert.equal((await g.open(unsubscribeLink(g.outbox[0]),'POST')).status,200);
  assert.ok(g.row().unsubscribed_at>0);
  await g.subscribe({email:'second@example.test'});
  const created=g.row('second@example.test').created_at;
  await purgeNewsletter(g.env,created+6*86400);assert.ok(g.row('second@example.test'));
  await purgeNewsletter(g.env,created+7*86400+1);assert.equal(g.row('second@example.test'),undefined);
 }finally{g.close()}
});

test('rate limits and the Turnstile check: the form cannot be used to mail-bomb an address',async()=>{
 const f=fixture();try{
  // Three confirmation emails a day to one address, whoever asks and from wherever.
  for(let i=0;i<3;i++)assert.equal((await f.subscribe({}, {'cf-connecting-ip':'198.51.100.'+i})).status,200);
  const fourth=await f.subscribe({}, {'cf-connecting-ip':'198.51.100.9'});
  assert.equal(fourth.status,429);assert.equal(f.outbox.length,3);
  // Five sign-ups an hour from one IP address.
  for(let i=0;i<5;i++)assert.equal((await f.subscribe({email:`r${i}@example.test`})).status,200);
  assert.equal((await f.subscribe({email:'r9@example.test'})).status,429);
  assert.equal(f.row('r9@example.test'),undefined);assert.equal(f.outbox.length,8);
  // The counters hold hashes, never the IP address or the email address.
  const limits=JSON.stringify(f.db.prepare('SELECT * FROM community_limits').all());
  assert.doesNotMatch(limits,/203\.0\.113|198\.51\.100|example\.test/);
 }finally{f.close()}
 const g=fixture();try{
  const failed=await g.subscribe({turnstile:'bot'});
  assert.equal(failed.status,400);assert.equal(g.outbox.length,0);assert.equal(g.row(),undefined);
  assert.equal((await g.subscribe({turnstile:undefined})).status,400);
  assert.deepEqual(g.checks,['https://challenges.cloudflare.com/turnstile/v0/siteverify']);
  // Another site cannot post the form, and bad input is refused before anything is stored.
  assert.equal((await g.subscribe({},{origin:'https://elsewhere.test'})).status,403);
  assert.equal((await g.subscribe({email:'not-an-address'})).status,400);
  assert.equal((await g.subscribe({electorate:'12345'})).status,400);
  assert.equal((await g.subscribe({electorate:'x'.repeat(61)})).status,400);
  assert.equal((await g.subscribe({editions:['mp']})).status,400);
  assert.equal(g.outbox.length,0);
 }finally{g.close()}
 const h=fixture({TURNSTILE_SECRET_KEY:undefined});try{
  // No secret configured: closed, not open.
  assert.equal((await h.subscribe()).status,503);assert.equal(h.outbox.length,0);
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

test('no address, token or IP address reaches a log line, a count or an analytics event',async()=>{
 const f=fixture();try{
  await f.subscribe({electorate:'2600',page_type:'bill'});
  const mail=f.outbox[0],link=confirmLink(mail);
  await f.open(link);await f.open(link,'POST');await f.open(unsubscribeLink(mail),'POST');
  // A delivery failure is logged by code only, and the address is not kept.
  f.env.failSend=true;
  assert.equal((await f.subscribe({email:'bounce@example.test'})).status,200);
  assert.equal(f.row('bounce@example.test'),undefined);
  // An unexpected fault is logged without the request.
  const broken={...f.env,COMMUNITY_DB:{prepare(){throw new Error('fault for '+ADDRESS)}}};
  assert.equal((await newsletterRoute(new Request(link,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),broken)).status,503);
  assert.ok(f.logs.length>=3);
  const secrets=[ADDRESS,'bounce@example.test','example.test','203.0.113.7',new URL(link).searchParams.get('token'),new URL(unsubscribeLink(mail)).searchParams.get('token')];
  for(const line of f.logs)for(const secret of secrets)assert.ok(!line.includes(secret),line);
  assert.doesNotMatch(JSON.stringify(f.db.prepare('SELECT * FROM newsletter_counts').all()),/example\.test|203\.0\.113/);
 }finally{f.close()}
 // The row holds what the reader typed and the dates of their choices; nothing links it to analytics, an account or a network address.
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0020_newsletter.sql',import.meta.url),'utf8'));
 assert.deepEqual(db.prepare("SELECT name FROM pragma_table_info('newsletter_subscribers')").all().map(c=>c.name).sort(),
  ['confirm_expires_at','confirm_token_hash','confirmed_at','created_at','editions','electorate','email','id','unsubscribe_token','unsubscribed_at']);
 db.close();
 // The browser's events: a step and a page type, from fixed lists.
 assert.deepEqual(cleanEvent('opax_newsletter',{action:'submitted',page_type:'person',email:ADDRESS,electorate:'2600',page_path:'/subject/person/someone'}),{action:'submitted',page_type:'person'});
 assert.deepEqual(cleanEvent('opax_newsletter',{action:ADDRESS,page_type:'melbourne'}),{});
 const script=readFileSync(new URL('../public/newsletter-card.js',import.meta.url),'utf8');
 assert.match(script,/properties: \{ action, page_type: pageType\(\) \}/);
 assert.equal(script.match(/opax:analytics', \{ detail/g).length,1);
});

// The card in a browser: timers are held in a list so the test decides when ten seconds have passed.
function browser({path='/bills',stored={},footerTop=2000,ua='Mozilla/5.0 Safari'}={}){
 const dom=new JSDOM(`<!doctype html><html><head></head><body><main id="main"><h1>Page</h1></main><footer><a href="/about">About</a></footer><template id="opax-newsletter-template" data-site-key="0x4AAAAAAAtestkey00">${NEWSLETTER_CARD_HTML}</template></body></html>`,{url:'https://opax.com.au'+path,runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom,timers=[],events=[];
 Object.defineProperty(window.navigator,'userAgent',{value:ua});
 for(const [key,value] of Object.entries(stored))window.localStorage.setItem(key,value);
 window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};
 window.clearTimeout=id=>{if(timers[id-1])timers[id-1]=null};
 const footer=window.document.querySelector('footer');
 footer.getClientRects=()=>[{}];footer.getBoundingClientRect=()=>({top:footerTop});
 window.addEventListener('opax:analytics',e=>{if(e.detail.event==='opax_newsletter')events.push(e.detail.properties)});
 window.eval(readFileSync(new URL('../public/newsletter-card.js',import.meta.url),'utf8'));
 const run=()=>{for(const timer of timers.splice(0))timer?.fn()};
 const card=()=>window.document.querySelector('aside.opax-newsletter');
 const say=event=>window.dispatchEvent(new window.CustomEvent('opax:analytics',{detail:{event}}));
 const go=to=>{window.history.pushState({},'',to);window.dispatchEvent(new window.Event('opax:route'))};
 return {window,timers,events,run,card,say,go,footer,stored:key=>window.localStorage.getItem(key)};
}

test('the card: never on a first page view, then once, in the flow above the footer, and remembered',()=>{
 const first=browser();
 assert.equal(first.stored('opax-newsletter-views'),'1');
 first.run();assert.equal(first.card(),null);
 // A finished answer on the first page view does not bring it either.
 first.say('opax_ask_completed');first.run();assert.equal(first.card(),null);
 // The second page view: nothing at once, the card after the wait.
 first.go('/subject/person/someone');
 assert.equal(first.card(),null);assert.equal(first.timers.at(-1).ms,10000);
 first.run();
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
 first.go('/bills');first.run();assert.equal(first.card(),null);
 assert.equal(first.window.document.documentElement.dataset.opaxPrompt,undefined);
 for(const state of ['seen','dismissed','subscribed']){
  const later=browser({stored:{'opax-newsletter':state,'opax-newsletter-views':'5'}});
  later.run();later.say('opax_ask_completed');later.run();assert.equal(later.card(),null,state);
 }
});

test('the card: dismissal is remembered and returns focus to the page; it never moves what is on screen',()=>{
 const b=browser({stored:{'opax-newsletter-views':'1'}});
 b.run();
 b.card().querySelector('[data-newsletter-dismiss]').click();
 assert.equal(b.card(),null);assert.equal(b.stored('opax-newsletter'),'dismissed');
 assert.equal(b.window.document.activeElement,b.footer);
 assert.deepEqual(b.events.map(e=>e.action),['shown','dismissed']);
 // The footer is already on screen: adding the card would move it, so it waits for another page view.
 const inView=browser({stored:{'opax-newsletter-views':'1'},footerTop:400});
 inView.run();assert.equal(inView.card(),null);assert.equal(inView.stored('opax-newsletter'),null);
});

test('the card: not while an answer is being written, on /ask only after it ends, and the app prompt wins the page view',()=>{
 const ask=browser({path:'/ask',stored:{'opax-newsletter-views':'1'}});
 // No ten-second timer on /ask at all.
 assert.equal(ask.timers.filter(Boolean).length,0);
 ask.say('opax_ask_started');ask.run();assert.equal(ask.card(),null);
 ask.say('opax_ask_completed');assert.equal(ask.card(),null);
 ask.run();assert.ok(ask.card());
 // An answer starts in the docked assistant while the wait is running: the wait is dropped.
 const docked=browser({stored:{'opax-newsletter-views':'1'}});
 docked.say('opax_ask_started');docked.run();assert.equal(docked.card(),null);
 // The app prompt claimed this page view first.
 const claimed=browser({stored:{'opax-newsletter-views':'1'}});
 claimed.window.document.documentElement.dataset.opaxPrompt='app';
 claimed.run();assert.equal(claimed.card(),null);assert.equal(claimed.stored('opax-newsletter'),null);
 // Inside the app, and on policy pages, never.
 const app=browser({stored:{'opax-newsletter-views':'4'},ua:'OPAX-iOS/1.1.3 (70)'});
 app.run();assert.equal(app.card(),null);
 const policy=browser({path:'/privacy',stored:{'opax-newsletter-views':'4'}});
 policy.run();assert.equal(policy.card(),null);
 // A browser that cannot remember is never shown it.
 const dom=new JSDOM('<!doctype html><body><footer></footer><template id="opax-newsletter-template"></template></body>',{url:'https://opax.com.au/bills',runScripts:'outside-only'});
 Object.defineProperty(dom.window,'localStorage',{get(){throw new Error('Storage denied')}});
 let scheduled=0;dom.window.setTimeout=()=>{scheduled++;return 1};
 dom.window.eval(readFileSync(new URL('../public/newsletter-card.js',import.meta.url),'utf8'));
 assert.equal(scheduled,0);
});
