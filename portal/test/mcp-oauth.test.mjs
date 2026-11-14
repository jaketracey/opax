// The /mcp access layer: the no-account tier and its limits, and sign in to
// connect (OAuth 2.1) beside member keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const folder=mkdtempSync(join(tmpdir(),'opax-mcp-oauth-test-'));
const src=name=>new URL('../src/'+name,import.meta.url).pathname;
await build({entryPoints:[src('community.ts'),src('community-mcp.ts'),src('community-oauth.ts'),src('mcp-access.ts')],outdir:folder,bundle:true,platform:'node',format:'esm',packages:'bundle',logLevel:'error'});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.js')));
const {communityMcp}=await import(pathToFileURL(join(folder,'community-mcp.js')));
const {oauthRoute,redirectMatches,registrableRedirect}=await import(pathToFileURL(join(folder,'community-oauth.js')));
const {anonymousVolume,sharedAddress,networkKey,wideNetwork}=await import(pathToFileURL(join(folder,'mcp-access.js')));

const ORIGIN='https://opax.test';
const sha=value=>createHash('sha256').update(value).digest('hex');
const s256=value=>createHash('sha256').update(value).digest('base64url');
const VERIFIER='v'.repeat(64),CHALLENGE=s256(VERIFIER);
const CALLBACK='https://claude.ai/api/mcp/auth_callback';

function fixture(vars={}){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_community.sql','0002_free_community.sql','0006_member_chats.sql','0009_community_social.sql','0010_reply_email_notifications.sql','0011_native_signin.sql','0019_mcp_oauth.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const outbox=[];
 const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}});
 const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const results=[];for(const stmt of stmts)results.push(await stmt.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}},
  COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:ORIGIN,COMMUNITY_EMAIL_FROM:'hello@login.opax.test',MCP_ANON_ENABLED:'true',
  COMMUNITY_EMAIL:{async send(mail){outbox.push(mail);return {messageId:'test'}}},
  ASSETS:{async fetch(){return Response.json({entities:[],sources:[],people:[],nodes:[],edges:[]})}},...vars};
 const account=(path,method='GET',data,cookie='')=>communityRoute(new Request(ORIGIN+'/api/community/'+path,{method,headers:{origin:ORIGIN,...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:data?JSON.stringify(data):undefined}),env);
 async function login(email='reader@example.com'){
  assert.equal((await account('auth/request','POST',{email})).status,200);
  const token=new URL(outbox.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(7);
  const response=await account('auth/consume','POST',{token});assert.equal(response.status,200);
  return {cookie:response.headers.get('set-cookie').split(';')[0],member:db.prepare('SELECT * FROM members WHERE email=?').get(email)};
 }
 const oauth=(path,init={})=>oauthRoute(new Request(ORIGIN+path,init),env);
 const form=(path,fields,headers={})=>oauth(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(fields)});
 let registrations=0;
 // Each registration comes from its own address unless a test names one, so the per-address limit is tested on purpose only.
 async function register(metadata={},address='198.18.0.'+(++registrations)){
  const response=await oauth('/oauth/register',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':address},body:JSON.stringify({client_name:'Claude',redirect_uris:[CALLBACK],token_endpoint_auth_method:'none',...metadata})});
  return {response,client:response.status===201?await response.json():null};
 }
 const authorizeQuery=(clientId,extra={})=>'/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:CALLBACK,code_challenge:CHALLENGE,code_challenge_method:'S256',state:'st-1',resource:ORIGIN+'/mcp',...extra});
 const hidden=html=>Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&')]));
 /** Register, consent as a signed-in member and return the code the client would receive. */
 async function consent(session,{clientId,extra={},decision='allow'}={}){
  const id=clientId||(await register()).client.client_id;
  const pageResponse=await oauth(authorizeQuery(id,extra),{headers:{cookie:session.cookie}});
  assert.equal(pageResponse.status,200);
  const fields=hidden(await pageResponse.text());
  const response=await form('/oauth/authorize',{...fields,decision},{origin:ORIGIN,cookie:session.cookie});
  const location=response.headers.get('location'),to=location?new URL(location):null;
  return {clientId:id,response,to,code:to?.searchParams.get('code'),fields};
 }
 const exchange=(clientId,code,extra={})=>form('/oauth/token',{grant_type:'authorization_code',client_id:clientId,code,code_verifier:VERIFIER,redirect_uri:CALLBACK,resource:ORIGIN+'/mcp',...extra});
 async function connect(session){const c=await consent(session);const response=await exchange(c.clientId,c.code);assert.equal(response.status,200);return {...c,tokens:await response.json()}}
 // The public search and record routes, as index.ts serves them: each makes Progress queries through the meter it is given.
 // By default one query a read; a test sets f.queries to make a search use its keyword retry too.
 const reads={queries:['/find']};
 const mcp=(headers={},{path='/mcp',method='POST',rpc={jsonrpc:'2.0',id:1,method:'tools/list',params:{}}}={})=>communityMcp(new Request(ORIGIN+path,{method,headers:{accept:'application/json, text/event-stream','content-type':'application/json','cf-connecting-ip':'203.0.113.7','user-agent':'test-client/1',...headers},body:method==='POST'?JSON.stringify(rpc):undefined}),env,async(path,meter)=>{for(const query of reads.queries)await meter(query==='hedge'?'/find':query,query==='hedge');return Response.json({results:[]})});
 const bearer=token=>({authorization:'Bearer '+token});
 return {db,env,outbox,account,login,oauth,form,register,authorizeQuery,consent,exchange,connect,mcp,bearer,reads};
}

// --- the no-account tier ------------------------------------------------------

test('without a token the read-only tools answer, with open CORS and no credentials',async()=>{
 const f=fixture();
 const response=await f.mcp({origin:'https://inspector.example'});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('access-control-allow-origin'),'*');
 assert.equal(response.headers.get('access-control-allow-credentials'),null);
 const tools=(await response.json()).result.tools.map(t=>t.name);
 for(const name of ['search_records','read_record','find_connections','corpus_coverage','read_grant_recipient','read_grant_program'])assert.ok(tools.includes(name),name);
 const preflight=await f.mcp({origin:'https://inspector.example','access-control-request-method':'POST'},{method:'OPTIONS'});
 assert.equal(preflight.status,204);
 assert.match(preflight.headers.get('access-control-allow-headers'),/authorization/);
 assert.match(preflight.headers.get('access-control-allow-headers'),/mcp-protocol-version/);
 // Nothing about the caller is stored beyond hashed limit buckets and an hourly count.
 assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);
 assert.ok(f.db.prepare('SELECT key FROM community_limits').all().every(row=>/^[0-9a-f]{64}$/.test(row.key)||/^mcp-anon-(?:hour:\d+|(?:progress|requests)-day:(?:shared|direct):\d+)$/.test(row.key)));
 f.db.close();
});

test('MCP_ANON_ENABLED off returns /mcp to members only, and /mcp/member always asks for sign-in',async()=>{
 for(const value of ['false',undefined,'TRUE','1']){
  const f=fixture({MCP_ANON_ENABLED:value});
  const response=await f.mcp();
  assert.equal(response.status,401,String(value));
  assert.match(response.headers.get('www-authenticate'),/^Bearer /);
  assert.match(response.headers.get('www-authenticate'),/resource_metadata="https:\/\/opax\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.match(response.headers.get('www-authenticate'),/scope="records:read"/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
  f.db.close();
 }
 const f=fixture();
 const member=await f.mcp({}, {path:'/mcp/member'});
 assert.equal(member.status,401);
 assert.match(member.headers.get('www-authenticate'),/oauth-protected-resource\/mcp\/member"/);
 assert.equal(member.headers.get('access-control-expose-headers').includes('www-authenticate'),true);
 f.db.close();
});

test('a presented token is never downgraded to the no-account tier',async()=>{
 const f=fixture();
 for(const token of ['opax_'+'a'.repeat(43),'opax_at_'+'a'.repeat(43),'nonsense']){
  const response=await f.mcp(f.bearer(token));
  assert.equal(response.status,401,token);
  assert.match(response.headers.get('www-authenticate'),/error="invalid_token"/);
 }
 f.db.close();
});

const call=(name='corpus_coverage')=>({rpc:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}}});
const seconds=response=>Number(response.headers.get('retry-after'));
test('no-account limits: one client, then a ceiling for the address and for everyone, each with a clear 429',async()=>{
 const f=fixture({MCP_ANON_PER_CLIENT_MINUTE:'3',MCP_ANON_PER_IP_MINUTE:'8',MCP_ANON_GLOBAL_MINUTE:'12'});
 // Three a minute with two at once: a burst of two passes, the third must wait for the bucket.
 for(let i=0;i<2;i++)assert.equal((await f.mcp({},call())).status,200);
 const limited=await f.mcp({},call());
 assert.equal(limited.status,429);
 assert.equal(seconds(limited),20); // the exact wait, not a blanket minute
 assert.equal(limited.headers.get('access-control-allow-origin'),'*');
 const limitBody=await limited.json(),message=limitBody.error.message;
 assert.equal(limitBody.jsonrpc,'2.0');assert.equal(limitBody.id,1);assert.equal(limitBody.error.code,-32029);assert.equal(limitBody.error.data.retry_after_seconds,20);
 assert.match(message,/3 a minute for one client, with up to 2 at once/);
 assert.match(message,/free OPAX account/);
 // Connecting and listing tools do not use a client's allowance.
 assert.equal((await f.mcp()).status,200);
 // Another program, or another session, at the same address has its own allowance.
 assert.equal((await f.mcp({'user-agent':'other/2'},call())).status,200);
 for(const session of ['session-one','session-two','session-three'])assert.equal((await f.mcp({'mcp-session-id':session},call())).status,200);
 // The address ceiling is the backstop: the ninth request from it is refused whoever sends it.
 const ceiling=await f.mcp({'mcp-session-id':'session-four'},call());
 assert.equal(ceiling.status,429);
 assert.ok(seconds(ceiling)>=1&&seconds(ceiling)<=60);
 assert.match((await ceiling.json()).error.message,/8 a minute for one network address/);
 // Refused requests used none of the overall ceiling (12): seven were counted, so five more addresses still get through.
 for(let i=0;i<5;i++)assert.equal((await f.mcp({},call())).status,429);
 for(const ip of ['198.51.100.1','198.51.100.2','198.51.100.3','198.51.100.5','2001:db8:1:2::9'])assert.equal((await f.mcp({'cf-connecting-ip':ip},call())).status,200);
 const busy=await f.mcp({'cf-connecting-ip':'198.51.100.4'},call());
 assert.equal(busy.status,429);
 assert.match((await busy.json()).error.message,/busy/);
 // GET and preflight spend nothing.
 const before=f.db.prepare('SELECT sum(hits) n FROM community_limits').get().n;
 assert.equal((await f.mcp({}, {method:'GET'})).status,405);
 assert.equal(f.db.prepare('SELECT sum(hits) n FROM community_limits').get().n,before);
 f.db.close();
});

test('an IPv6 caller is counted by its /64, so rotating addresses inside it is no escape',async()=>{
 assert.equal(networkKey('203.0.113.7'),'203.0.113.7');
 assert.equal(networkKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'),'2001:db8:1:2::/64');
 assert.equal(networkKey('2001:db8:1:2::1'),'2001:db8:1:2::/64');
 assert.equal(networkKey('2001:0db8:0001:0002::1'),'2001:db8:1:2::/64');
 assert.equal(networkKey('2001:db8::1'),'2001:db8:0:0::/64');
 assert.equal(networkKey('::1'),'0:0:0:0::/64');
 const f=fixture({MCP_ANON_PER_CLIENT_MINUTE:'50',MCP_ANON_PER_IP_MINUTE:'3',MCP_ANON_GLOBAL_MINUTE:'100'});
 for(let i=0;i<3;i++)assert.equal((await f.mcp({'cf-connecting-ip':'2001:db8:1:2::'+(i+1)},call())).status,200);
 assert.equal((await f.mcp({'cf-connecting-ip':'2001:db8:1:2:ffff::9'},call())).status,429);
 assert.equal((await f.mcp({'cf-connecting-ip':'2001:db8:1:3::1'},call())).status,200);
 f.db.close();
});

test('the shared addresses and everyone else have separate overall ceilings',async()=>{
 const f=fixture({MCP_ANON_PER_CLIENT_MINUTE:'50',MCP_ANON_PER_IP_MINUTE:'50',MCP_ANON_SHARED_IP_MINUTE:'50',MCP_ANON_GLOBAL_MINUTE:'2'});
 for(let i=0;i<2;i++)assert.equal((await f.mcp({},call())).status,200);
 assert.equal((await f.mcp({},call())).status,429); // ordinary callers are at their ceiling
 assert.equal((await f.mcp({'cf-connecting-ip':'160.79.104.10'},call())).status,200); // Claude's users are not shut out by it
 f.db.close();
});

test('limit rows a day past their window are cleared by the first no-account request of an hour',async()=>{
 const f=fixture();
 f.db.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,?,?)').run('old',1,1);
 f.db.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,?,?)').run('recent',1,Math.floor(Date.now()/1000)-3600);
 await f.mcp();
 assert.equal(f.db.prepare("SELECT count(*) n FROM community_limits WHERE key='old'").get().n,0);
 assert.equal(f.db.prepare("SELECT count(*) n FROM community_limits WHERE key='recent'").get().n,1);
 f.db.close();
});

test('the bucket for one client refills: after the wait it reports, the next request passes',async()=>{
 const f=fixture({MCP_ANON_PER_CLIENT_MINUTE:'600',MCP_ANON_PER_IP_MINUTE:'5000',MCP_ANON_GLOBAL_MINUTE:'5000'}); // one every 100 ms, 300 at once
 const original=Date.now;let clock=original();Date.now=()=>clock;
 try{
  for(let i=0;i<300;i++)assert.equal((await f.mcp({'mcp-session-id':'steady-session'},call())).status,200);
  const limited=await f.mcp({'mcp-session-id':'steady-session'},call());
  assert.equal(limited.status,429);assert.equal(seconds(limited),1);
  clock+=1000; // ten more have refilled
  for(let i=0;i<10;i++)assert.equal((await f.mcp({'mcp-session-id':'steady-session'},call())).status,200);
  assert.equal((await f.mcp({'mcp-session-id':'steady-session'},call())).status,429);
  // A refused request costs the client nothing more: hammering does not push the wait out.
  for(let i=0;i<20;i++)await f.mcp({'mcp-session-id':'steady-session'},call());
  clock+=100;
  assert.equal((await f.mcp({'mcp-session-id':'steady-session'},call())).status,200);
 }finally{Date.now=original}
 f.db.close();
});

test('a member session takes a burst of parallel tool calls; sessions, connecting and connected clients are counted apart',async()=>{
 const f=fixture(),session=await f.login();
 const key=(await (await f.account('keys','POST',{name:'Laptop'},session.cookie)).json()).token,live=await f.connect(session);
 for(let i=0;i<70;i++)assert.equal((await f.mcp(f.bearer(key))).status,200); // tools/list: seventy short sessions connect
 // Thirty at once from one session (an assistant firing tool calls in parallel) all pass.
 const burst=await Promise.all(Array.from({length:30},()=>f.mcp({...f.bearer(key),'mcp-session-id':'conversation-a'},call())));
 assert.ok(burst.every(response=>response.status===200));
 const limited=await f.mcp({...f.bearer(key),'mcp-session-id':'conversation-a'},call());
 assert.equal(limited.status,429);assert.equal(seconds(limited),1);
 const body=await limited.json();
 assert.equal(body.error.code,-32029);assert.match(body.error.message,/60 tool calls a minute for one session, with up to 30 at once/);
 // Another session on the same key is not held up by it.
 assert.equal((await f.mcp({...f.bearer(key),'mcp-session-id':'conversation-b'},call())).status,200);
 assert.ok(f.db.prepare('SELECT last_used_at FROM mcp_keys').get().last_used_at>0);
 // The connected client is not locked out by the key's use, nor the key by the client's.
 assert.equal((await f.mcp(f.bearer(live.tokens.access_token),call())).status,200);
 f.db.close();
});

test('addresses that Claude and ChatGPT share are not treated as one person',async()=>{
 const f=fixture({MCP_ANON_PER_CLIENT_MINUTE:'2',MCP_ANON_PER_IP_MINUTE:'4',MCP_ANON_SHARED_IP_MINUTE:'9',MCP_ANON_GLOBAL_MINUTE:'100',MCP_ANON_SHARED_RANGES:'192.0.2.0/24, nonsense',
  MCP_ANON_LIMITER:{async limit({key}){assert.equal(key,'203.0.113.7');return {success:true}}}});
 assert.equal(sharedAddress(f.env,'160.79.104.10'),true);   // Anthropic
 assert.equal(sharedAddress(f.env,'160.79.112.1'),false);
 assert.equal(sharedAddress(f.env,'98.87.72.221'),true);    // OpenAI's published list
 assert.equal(sharedAddress(f.env,'192.0.2.200'),true);     // added by MCP_ANON_SHARED_RANGES
 assert.equal(sharedAddress(f.env,'203.0.113.7'),false);
 assert.equal(sharedAddress(f.env,'2001:db8::1'),false);
 const claude={'cf-connecting-ip':'160.79.104.10','user-agent':'Claude-User'};
 // Many people behind one address and one User-Agent: no per-client allowance applies without a session...
 for(let i=0;i<6;i++)assert.equal((await f.mcp(claude,call())).status,200);
 // ...a session still gets its own allowance (two a minute, one at once, here)...
 assert.equal((await f.mcp({...claude,'mcp-session-id':'conversation-1'},call())).status,200);
 assert.equal((await f.mcp({...claude,'mcp-session-id':'conversation-1'},call())).status,429);
 assert.equal((await f.mcp({...claude,'mcp-session-id':'conversation-2'},call())).status,200);
 // ...and the shared ceiling (9 here) is far above an ordinary address's (4), but it is still a ceiling.
 const over=await f.mcp(claude,call());
 assert.equal(over.status,429);
 assert.match((await over.json()).error.message,/9 a minute for one network address/);
 // An ordinary address reaches the Workers limiter first; a shared one never does (asserted by the key above).
 assert.equal((await f.mcp({},call())).status,200);
 f.db.close();
});

test('a no-account client is given a session id at initialize, and nothing is stored for it',async()=>{
 const f=fixture();
 const init={rpc:{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'1'}}}};
 const first=await f.mcp({},init),second=await f.mcp({},init);
 assert.equal(first.status,200);
 assert.match(first.headers.get('mcp-session-id'),/^[0-9a-f-]{36}$/);
 assert.notEqual(first.headers.get('mcp-session-id'),second.headers.get('mcp-session-id'));
 assert.match(first.headers.get('access-control-expose-headers'),/mcp-session-id/);
 assert.equal((await f.mcp()).headers.get('mcp-session-id'),null);
 assert.equal(JSON.stringify(f.db.prepare('SELECT key FROM community_limits').all()).includes(first.headers.get('mcp-session-id')),false);
 // A made-up session id is only a counting key: it is never looked up, so it cannot be "wrong".
 assert.equal((await f.mcp({'mcp-session-id':'anything-at-all'},call())).status,200);
 // Members are given one too: their sessions are counted apart.
 const session=await f.login(),key=(await (await f.account('keys','POST',{name:'Laptop'},session.cookie)).json()).token;
 assert.match((await f.mcp(f.bearer(key),init)).headers.get('mcp-session-id'),/^[0-9a-f-]{36}$/);
 f.db.close();
});

test('the Workers limiter refuses a flood before any database write, and fails open when it errors',async()=>{
 const refused=fixture({MCP_ANON_LIMITER:{async limit({key}){assert.equal(key,'203.0.113.7');return {success:false}}}});
 const response=await refused.mcp();
 assert.equal(response.status,429);assert.ok(seconds(response)>=1&&seconds(response)<=60);
 assert.match((await response.json()).error.message,/300 a minute for one network address/);
 assert.equal(refused.db.prepare('SELECT count(*) n FROM community_limits').get().n,0);
 const broken=fixture({MCP_ANON_LIMITER:{async limit(){throw new Error('limiter down')}}});
 assert.equal((await broken.mcp()).status,200);
 // A member's token never touches the no-account limiter.
 const member=fixture({MCP_ANON_LIMITER:{async limit(){return {success:false}}}}),session=await member.login();
 const key=(await (await member.account('keys','POST',{name:'Laptop'},session.cookie)).json()).token;
 assert.equal((await member.mcp(member.bearer(key))).status,200);
 for(const f of [refused,broken,member])f.db.close();
});

test('a member is limited on their own account, not with the no-account callers',async()=>{
 const f=fixture({MCP_ANON_PER_CLIENT_MINUTE:'1',MCP_ANON_PER_IP_MINUTE:'1',MCP_ANON_GLOBAL_MINUTE:'1'});
 const session=await f.login();
 const key=(await (await f.account('keys','POST',{name:'Laptop'},session.cookie)).json()).token;
 assert.equal((await f.mcp({},call())).status,200);
 assert.equal((await f.mcp({},call())).status,429);
 for(let i=0;i<5;i++)assert.equal((await f.mcp(f.bearer(key),call())).status,200);
 f.db.close();
});

const search=(f,headers={})=>f.mcp(headers,{rpc:{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'search_records',arguments:{query:'housing'}}}});
const hits=(f,like)=>f.db.prepare('SELECT coalesce(sum(hits),0) n FROM community_limits WHERE key LIKE ?').get(like).n;
const untilMidnight=()=>86400-Math.floor(Date.now()/1000)%86400;
const CLAUDE='160.79.104.10';
test('the daily cap counts Progress queries one by one and pauses only the pool that spent it; members carry on',async()=>{
 const f=fixture({MCP_ANON_DAILY_PROGRESS_DIRECT:'3'});
 const warnings=[],warn=console.warn;console.warn=line=>warnings.push(line);
 try{
  // A search whose main query is slow makes two: the main one and the keyword retry. Both count.
  f.reads.queries=['/find','hedge'];
  assert.equal((await search(f,{'mcp-session-id':'session-aaaa'})).status,200);
  assert.equal(hits(f,'mcp-anon-progress-day:direct:%'),2);
  // A tool that reads only published files makes no query.
  assert.equal((await f.mcp({},call())).status,200);
  assert.equal(hits(f,'mcp-anon-progress-day:direct:%'),2);
  // The third query is the last; the fourth is refused part-way through the tool, and the answer is the limit
  // it hit (429, Retry-After to midnight UTC, the JSON-RPC shape), not the tool's own error.
  const refused=await search(f,{'mcp-session-id':'session-bbbb'});
  assert.equal(refused.status,429);
  assert.ok(Math.abs(seconds(refused)-untilMidnight())<=2);
  const body=await refused.json();
  assert.equal(body.id,7);assert.equal(body.error.code,-32029);assert.equal(body.error.data.retry_after_seconds,seconds(refused));
  assert.match(body.error.message,/paused for callers without an account until tomorrow/);
 }finally{console.warn=warn}
 assert.equal(warnings.filter(line=>line.includes('mcp_anon_daily_cap')).length,1);
 assert.deepEqual(Object.keys(JSON.parse(warnings.find(line=>line.includes('mcp_anon_daily_cap')))).sort(),['count','day','hits','kind','level','pool']);
 // The direct pool is paused, answered like the kill switch; a paused pool writes nothing more.
 const paused=await f.mcp({'cf-connecting-ip':'198.51.100.20'});
 assert.equal(paused.status,401);
 assert.match(paused.headers.get('www-authenticate'),/resource_metadata=/);
 assert.match((await paused.json()).error,/paused for callers without an account until tomorrow/);
 const before=hits(f,'%');
 await f.mcp();await search(f);
 assert.equal(hits(f,'%'),before);
 // Claude's and ChatGPT's users draw on their own pool, so they carry on.
 assert.equal((await search(f,{'cf-connecting-ip':CLAUDE})).status,200);
 assert.deepEqual(await anonymousVolume(f.env),{anonymous:true,volume:'normal',hours_over:0,paused_today:['direct:progress']});
 // Members are not counted and not paused.
 const session=await f.login(),key=(await (await f.account('keys','POST',{name:'Laptop'},session.cookie)).json()).token;
 const counted=hits(f,'mcp-anon-progress-day:%');
 assert.equal((await search(f,f.bearer(key))).status,200);
 assert.equal(hits(f,'mcp-anon-progress-day:%'),counted);
 // The next UTC day starts clean.
 f.db.prepare("UPDATE community_limits SET key='mcp-anon-progress-day:direct:1' WHERE key LIKE 'mcp-anon-progress-day:direct:%'").run();
 assert.equal((await f.mcp()).status,200);
 f.db.close();
});

test('one network cannot pause the no-account tier for everyone, even with a new session id on every call',async()=>{
 assert.equal(wideNetwork('203.0.113.7'),'203.0.113.7');
 assert.equal(wideNetwork('2001:db8:1:2:aaaa::1'),'2001:db8:1::/48');
 assert.equal(wideNetwork('2001:0db8:0001:ffff::9'),'2001:db8:1::/48');
 const f=fixture({MCP_ANON_DAILY_PROGRESS_NETWORK:'5',MCP_ANON_DAILY_PROGRESS_DIRECT:'20',MCP_ANON_DAILY_PROGRESS_SHARED:'12'});
 const warnings=[],warn=console.warn;console.warn=line=>warnings.push(line);
 let refused;
 try{
  // The reviewer's attack: one address, a fresh session id each call, as fast as the minute limits allow.
  for(let i=0;i<5;i++)assert.equal((await search(f,{'mcp-session-id':'attack-'+i+'-session'})).status,200);
  refused=await search(f,{'mcp-session-id':'attack-5-session'});
 }finally{console.warn=warn}
 assert.equal(refused.status,429);
 assert.ok(Math.abs(seconds(refused)-untilMidnight())<=2);
 assert.match((await refused.json()).error.message,/This network has used today's allowance/);
 assert.equal(warnings.filter(line=>line.includes('mcp_anon_network_cap')).length,1);
 assert.ok(warnings.every(line=>!line.includes('203.0.113')),'no address is logged');
 // From then on it is refused by a read alone, and the pool holds only the five it made.
 const before=hits(f,'%');
 for(let i=6;i<10;i++)assert.equal((await search(f,{'mcp-session-id':'attack-'+i+'-session'})).status,429);
 assert.equal(hits(f,'%'),before);
 assert.equal(hits(f,'mcp-anon-progress-day:direct:%'),5);
 // Everyone else carries on: another network, an IPv6 site, and Claude's shared addresses.
 assert.equal((await search(f,{'cf-connecting-ip':'198.51.100.30'})).status,200);
 for(const ip of ['2001:db8:1:1::1','2001:db8:1:2::1','2001:db8:1:3::1','2001:db8:1:4::1','2001:db8:1:5::1'])assert.equal((await search(f,{'cf-connecting-ip':ip})).status,200);
 // An IPv6 site is one network however many /64s it rotates through; the next /48 is another.
 assert.equal((await search(f,{'cf-connecting-ip':'2001:db8:1:6::1'})).status,429);
 assert.equal((await search(f,{'cf-connecting-ip':'2001:db8:2:1::1'})).status,200);
 for(let i=0;i<8;i++)assert.equal((await search(f,{'cf-connecting-ip':CLAUDE,'mcp-session-id':'claude-'+i+'-session'})).status,200);
 assert.deepEqual((await anonymousVolume(f.env)).paused_today,[]);
 // Network counts are hashed, like every other per-address row.
 assert.equal(f.db.prepare("SELECT count(*) n FROM community_limits WHERE key LIKE '%network%' OR key LIKE '%203.0.113%'").get().n,0);
 f.db.close();
});

test('by default the no-account tier makes at most 500 Progress queries a day: 150 a network, 250 a pool',async()=>{
 const f=fixture();
 let n=0;const one=ip=>search(f,{'cf-connecting-ip':ip,'mcp-session-id':'default-'+(++n)+'-session'});
 for(let i=0;i<150;i++)assert.equal((await one('198.51.100.50')).status,200);
 assert.equal((await one('198.51.100.50')).status,429);
 for(let i=0;i<100;i++)assert.equal((await one('198.51.100.51')).status,200);
 // The direct pool's 250 are spent: the next caller from anywhere direct is paused before it makes a query.
 assert.equal((await one('198.51.100.52')).status,401);
 for(let i=0;i<250;i++)assert.equal((await one(CLAUDE)).status,200);
 assert.equal((await one(CLAUDE)).status,401);
 assert.equal(hits(f,'mcp-anon-progress-day:%'),500);
 assert.deepEqual((await anonymousVolume(f.env)).paused_today,['shared:progress','direct:progress']);
 f.db.close();
});

test('migration 0019 can be applied again by hand without error',()=>{
 const db=new DatabaseSync(':memory:'),sql=readFileSync(new URL('../migrations/0019_mcp_oauth.sql',import.meta.url),'utf8');
 db.exec('CREATE TABLE members(id TEXT PRIMARY KEY)');
 db.exec(sql);db.exec(sql);
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'oauth_%'").get().n,9); // four tables, five indexes
 db.close();
});

test('the daily cap on no-account requests: one network, then the pool',async()=>{
 const f=fixture({MCP_ANON_DAILY_REQUESTS_NETWORK:'3',MCP_ANON_DAILY_REQUESTS_DIRECT:'5'});
 for(let i=0;i<3;i++)assert.equal((await f.mcp()).status,200);
 const network=await f.mcp();
 assert.equal(network.status,429);
 assert.match((await network.json()).error.message,/This network has used today's allowance/);
 // The refused request did not count toward the pool: another network gets the two left.
 for(let i=0;i<2;i++)assert.equal((await f.mcp({'cf-connecting-ip':'198.51.100.40'})).status,200);
 assert.equal((await f.mcp({'cf-connecting-ip':'198.51.100.41'})).status,401);
 assert.deepEqual((await anonymousVolume(f.env)).paused_today,['direct:requests']);
 assert.equal((await f.mcp({'cf-connecting-ip':CLAUDE})).status,200);
 // Both pools spent: the tier reports itself off.
 const both=fixture({MCP_ANON_DAILY_REQUESTS_DIRECT:'1',MCP_ANON_DAILY_REQUESTS_SHARED:'1'});
 await both.mcp();await both.mcp({'cf-connecting-ip':CLAUDE});
 assert.deepEqual(await anonymousVolume(both.env),{anonymous:false,volume:'normal',hours_over:0,paused_today:['shared:requests','direct:requests']});
 for(const x of [f,both])x.db.close();
});

test('on staging each response reports its Progress queries, and a caller can lower its own budget',async()=>{
 const f=fixture({MCP_PROGRESS_REPORT:'true'});
 f.reads.queries=['/find','hedge'];
 const counted=await search(f);
 assert.equal(counted.status,200);
 assert.equal(counted.headers.get('x-opax-progress'),'find=1, hedge=1, other=0');
 // A budget of one: the second query is refused before it is made, and the request reports the one it made.
 const capped=await search(f,{'x-opax-progress-budget':'1','mcp-session-id':'probe-session'});
 assert.equal(capped.status,429);
 assert.equal(capped.headers.get('x-opax-progress'),'find=1, hedge=0, other=0');
 assert.match((await capped.json()).error.message,/Progress budget its caller set/);
 // Members are reported too, and a tool that reads only files makes no query.
 assert.equal((await f.mcp({},call())).headers.get('x-opax-progress'),'find=0, hedge=0, other=0');
 // Elsewhere (production) neither header does anything.
 const prod=fixture();prod.reads.queries=['/find','hedge'];
 const plain=await search(prod,{'x-opax-progress-budget':'0'});
 assert.equal(plain.status,200);
 assert.equal(plain.headers.get('x-opax-progress'),null);
 for(const x of [f,prod])x.db.close();
});

test('sustained no-account volume is reported high after three full hours over the line',async()=>{
 const f=fixture({MCP_ANON_ALERT_HOURLY:'2'});
 const warnings=[],warn=console.warn;console.warn=line=>warnings.push(line);
 try{for(let i=0;i<3;i++)await f.mcp()}finally{console.warn=warn}
 assert.equal(warnings.length,1); // logged once, when the hour crosses the line
 assert.deepEqual(Object.keys(JSON.parse(warnings[0])).sort(),['hits','hour','kind','level']);
 assert.deepEqual(await anonymousVolume(f.env),{anonymous:true,volume:'normal',hours_over:0,paused_today:[]});
 const hour=Math.floor(Date.now()/3600000);
 const add=(back,hits)=>f.db.prepare('INSERT INTO community_limits(key,hits,expires_at) VALUES (?,?,?)').run('mcp-anon-hour:'+(hour-back),hits,(hour-back+1)*3600);
 // Two hours in a row, a quiet hour, then one more: busy but not sustained.
 for(const back of [6,7,9])add(back,5);
 assert.deepEqual(await anonymousVolume(f.env),{anonymous:true,volume:'normal',hours_over:3,paused_today:[]});
 // Three in a row anywhere in the last day is sustained, and stays reported for the daily check.
 add(8,2);
 assert.deepEqual(await anonymousVolume(f.env),{anonymous:true,volume:'high',hours_over:4,paused_today:[]});
 add(30,99);
 assert.equal((await anonymousVolume(f.env)).hours_over,4);
 f.db.close();
});

// --- discovery ----------------------------------------------------------------

test('resource and server metadata describe one issuer, PKCE S256 and public clients',async()=>{
 const f=fixture();
 for(const [path,resource] of [['/.well-known/oauth-protected-resource',ORIGIN+'/mcp'],['/.well-known/oauth-protected-resource/mcp',ORIGIN+'/mcp'],['/.well-known/oauth-protected-resource/mcp/member',ORIGIN+'/mcp/member']]){
  const response=await f.oauth(path);assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  const data=await response.json();
  assert.equal(data.resource,resource);assert.deepEqual(data.authorization_servers,[ORIGIN]);assert.deepEqual(data.bearer_methods_supported,['header']);
 }
 const data=await (await f.oauth('/.well-known/oauth-authorization-server')).json();
 assert.equal(data.issuer,ORIGIN);
 assert.equal(data.authorization_endpoint,ORIGIN+'/oauth/authorize');
 assert.equal(data.token_endpoint,ORIGIN+'/oauth/token');
 assert.equal(data.registration_endpoint,ORIGIN+'/oauth/register');
 assert.equal(data.revocation_endpoint,ORIGIN+'/oauth/revoke');
 assert.deepEqual(data.code_challenge_methods_supported,['S256']);
 assert.deepEqual(data.token_endpoint_auth_methods_supported,['none']);
 assert.deepEqual(data.grant_types_supported,['authorization_code','refresh_token']);
 assert.equal(data.authorization_response_iss_parameter_supported,true);
 assert.equal((await f.oauth('/.well-known/oauth-authorization-server',{method:'POST'})).status,405);
 assert.equal(await f.oauth('/.well-known/other'),null);
 f.db.close();
});

// --- registration -------------------------------------------------------------

test('registration issues a public client and refuses unsafe redirect addresses',async()=>{
 const f=fixture();
 const {response,client}=await f.register({redirect_uris:[CALLBACK,'http://localhost:8787/callback','cursor://anysphere.cursor-mcp/oauth/callback','com.example.app://callback'],client_name:'<b>Claude</b>\n"Desktop"'});
 assert.equal(response.status,201);
 assert.match(client.client_id,/^[\w-]{43}$/);
 assert.equal(client.token_endpoint_auth_method,'none');
 assert.equal(client.client_secret,undefined);
 assert.equal(client.client_name,'b Claude b Desktop');
 for(const bad of [['http://example.com/cb'],['https://ok.example/cb#frag'],['javascript://x/%0aalert(1)'],['data://text/html,x'],['ms-msdt://x'],['smb://host/share'],['ssh://host'],['http://[::1]:8000/cb'],['https://user:pw@ok.example/cb'],[ORIGIN+'/community'],['not a url'],[],Array(9).fill(CALLBACK),'https://ok.example/cb']){
  const refused=await f.register({redirect_uris:bad});
  assert.equal(refused.response.status,400,JSON.stringify(bad));
  assert.equal((await refused.response.json()).error,'invalid_redirect_uri');
 }
 for(const metadata of [{token_endpoint_auth_method:'client_secret_post'},{grant_types:['implicit']},{response_types:['token']}]){
  const refused=await f.register(metadata);assert.equal(refused.response.status,400);assert.equal((await refused.response.json()).error,'invalid_client_metadata');
 }
 assert.equal((await f.oauth('/oauth/register',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,400);
 assert.equal((await f.oauth('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[CALLBACK],client_name:'x'.repeat(9000)})})).status,413);
 assert.equal((await f.oauth('/oauth/register')).status,405);
 f.db.close();
});

test('registration is limited per address',async()=>{
 const f=fixture();
 for(let i=0;i<10;i++)assert.equal((await f.register({},'203.0.113.9')).response.status,201);
 assert.equal((await f.register({},'203.0.113.9')).response.status,429);
 assert.equal((await f.register({},'203.0.113.10')).response.status,201);
 // An assistant maker's shared address registers for many people.
 const shared=()=>f.oauth('/oauth/register',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'160.79.104.10'},body:JSON.stringify({redirect_uris:[CALLBACK]})});
 for(let i=0;i<12;i++)assert.equal((await shared()).status,201);
 f.db.close();
});

test('one network cannot use up the day\'s registrations: an IPv6 site gets 50 a day across all its /64s',async()=>{
 const f=fixture();
 // Five registrations from each of ten /64s in one /48 stay under each /64's hourly ten.
 for(let net=0;net<10;net++)for(let i=0;i<5;i++)assert.equal((await f.register({},`2001:db8:7:${net+1}::${i+1}`)).response.status,201);
 const refused=await f.register({},'2001:db8:7:99::1');
 assert.equal(refused.response.status,429);
 // Other networks still register: the next /48, an ordinary IPv4 address.
 assert.equal((await f.register({},'2001:db8:8:1::1')).response.status,201);
 assert.equal((await f.register({},'203.0.113.60')).response.status,201);
 f.db.close();
});

test('redirect addresses match exactly; only a loopback port may differ',()=>{
 assert.equal(registrableRedirect('https://claude.ai/api/mcp/auth_callback',ORIGIN),true);
 assert.equal(registrableRedirect('http://127.0.0.1:33418/',ORIGIN),true);
 assert.equal(registrableRedirect('http://127.0.0.1.evil.example/',ORIGIN),false);
 const registered=[CALLBACK,'http://localhost:8787/callback'];
 assert.equal(redirectMatches(registered,CALLBACK),true);
 assert.equal(redirectMatches(registered,'http://localhost:51234/callback'),true);
 for(const other of [CALLBACK+'/',CALLBACK+'?x=1','https://claude.ai.evil.example/api/mcp/auth_callback','https://CLAUDE.ai/api/mcp/auth_callback','http://localhost:51234/other','http://127.0.0.1:8787/callback','http://localhost.evil.example:8787/callback','https://localhost:8787/callback','http://localhost:8787/callback#x','http://user@localhost:8787/callback'])assert.equal(redirectMatches(registered,other),false,other);
});

// --- consent ------------------------------------------------------------------

test('an unknown client or a wrong redirect address is shown an error and never redirected',async()=>{
 const f=fixture(),session=await f.login(),{client}=await f.register();
 for(const query of [f.authorizeQuery('x'.repeat(43)),f.authorizeQuery(client.client_id,{redirect_uri:'https://evil.example/cb'}),f.authorizeQuery(client.client_id,{redirect_uri:CALLBACK+'/extra'}),f.authorizeQuery(client.client_id,{redirect_uri:'https://claude.ai.evil.example/api/mcp/auth_callback'})]){
  const response=await f.oauth(query,{headers:{cookie:session.cookie}});
  assert.equal(response.status,400);
  assert.equal(response.headers.get('location'),null);
  assert.doesNotMatch(await response.text(),/<form/);
 }
 f.db.close();
});

test('requests without PKCE S256, the code flow or this resource are refused on the page, never by redirect',async()=>{
 const f=fixture(),session=await f.login(),{client}=await f.register();
 for(const [extra,error] of [[{code_challenge:''},'invalid_request'],[{code_challenge_method:'plain'},'invalid_request'],[{code_challenge:'short'},'invalid_request'],[{response_type:'token'},'unsupported_response_type'],[{resource:'https://other.example/mcp'},'invalid_target'],[{state:'s'.repeat(1025)},'invalid_request']]){
  for(const headers of [{cookie:session.cookie},{}]){
   const response=await f.oauth(f.authorizeQuery(client.client_id,extra),{headers});
   assert.equal(response.status,400);
   assert.equal(response.headers.get('location'),null); // not usable as a redirector
   const html=await response.text();
   assert.ok(html.includes(error));assert.doesNotMatch(html,/<form/);
  }
 }
 f.db.close();
});

test('a client that returns to a program on the device carries an extra warning',async()=>{
 const f=fixture(),session=await f.login();
 const {client}=await f.register({redirect_uris:['http://localhost:8787/callback','cursor://anysphere.cursor-mcp/oauth/callback']});
 const local=await f.oauth(f.authorizeQuery(client.client_id,{redirect_uri:'http://localhost:51999/callback'}),{headers:{cookie:session.cookie}});
 const html=await local.text();
 assert.match(html,/this computer \(localhost\)/);assert.match(html,/Any program on this device/);
 assert.match(local.headers.get('content-security-policy'),/form-action 'self' http:\/\/localhost:\*;/);
 const scheme=await f.oauth(f.authorizeQuery(client.client_id,{redirect_uri:'cursor://anysphere.cursor-mcp/oauth/callback'}),{headers:{cookie:session.cookie}});
 assert.match(await scheme.text(),/Any program on this device/);
 assert.match(scheme.headers.get('content-security-policy'),/form-action 'self' cursor:;/);
 const web=await f.oauth(f.authorizeQuery((await f.register()).client.client_id),{headers:{cookie:session.cookie}});
 assert.doesNotMatch(await web.text(),/Any program on this device/);
 f.db.close();
});

test('the consent page is script-free, names the client and return address, and asks signed-out readers to sign in',async()=>{
 const f=fixture(),{client}=await f.register({client_name:'Claude'});
 const signedOut=await f.oauth(f.authorizeQuery(client.client_id));
 assert.equal(signedOut.status,200);
 const outHtml=await signedOut.text();
 assert.doesNotMatch(outHtml,/<form|<script/);
 const next=new URL(outHtml.match(/href="(\/community\?view=signin&amp;next=[^"]+)"/)[1].replaceAll('&amp;','&'),ORIGIN).searchParams.get('next');
 assert.ok(next.startsWith('/oauth/authorize?'));
 const session=await f.login();
 const response=await f.oauth(f.authorizeQuery(client.client_id),{headers:{cookie:session.cookie}});
 const html=await response.text();
 assert.match(html,/Allow Claude to read the public record as you\?/);
 assert.match(html,/reader@example\.com/);
 assert.match(html,/claude\.ai/);
 assert.doesNotMatch(html,/<script/);
 const csp=response.headers.get('content-security-policy');
 assert.match(csp,/default-src 'none'/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/form-action 'self' https:\/\/claude\.ai;/);
 assert.equal(response.headers.get('x-frame-options'),'DENY');
 assert.equal(response.headers.get('cache-control'),'no-store');
 // A browser sends the real Origin with the form only if the page's referrer policy is not no-referrer.
 assert.equal(response.headers.get('referrer-policy'),'same-origin');
 // The page holds no code or token: consent has not happened yet.
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 f.db.close();
});

test('consent cannot be forged: it needs the same origin, the session and a proof bound to this exact request',async()=>{
 const f=fixture(),session=await f.login(),other=await f.login('other@example.com');
 const {client}=await f.register(),second=(await f.register({redirect_uris:['https://evil.example/cb']})).client;
 const page=await f.oauth(f.authorizeQuery(client.client_id),{headers:{cookie:session.cookie}});
 const fields=Object.fromEntries([...(await page.text()).matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&')]));
 const post=(values,headers)=>f.form('/oauth/authorize',{...fields,decision:'allow',...values},headers);
 const good={origin:ORIGIN,cookie:session.cookie};
 assert.equal((await post({}, {origin:'https://evil.example',cookie:session.cookie})).status,403);
 assert.equal((await post({}, {cookie:session.cookie})).status,403); // no Origin header
 assert.equal((await post({}, {origin:ORIGIN})).status,401); // no session
 assert.equal((await post({}, {origin:ORIGIN,cookie:other.cookie})).status,403); // another member's session
 assert.equal((await post({proof:'0'.repeat(64)},good)).status,403);
 assert.equal((await post({proof:''},good)).status,403);
 // Moving the consent to another client, state or challenge invalidates the proof.
 assert.equal((await post({client_id:second.client_id,redirect_uri:'https://evil.example/cb'},good)).status,403);
 assert.equal((await post({code_challenge:s256('attacker')},good)).status,403);
 assert.equal((await post({state:'other'},good)).status,403);
 assert.equal((await post({redirect_uri:'https://evil.example/cb'},good)).status,400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_codes').get().n,0);
 const denied=await post({decision:'deny'},good);
 assert.equal(denied.status,303);
 assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'),'access_denied');
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 const allowed=await post({},good);
 assert.equal(allowed.status,303);
 const to=new URL(allowed.headers.get('location'));
 assert.equal(to.origin+to.pathname,CALLBACK);
 assert.match(to.searchParams.get('code'),/^[\w-]{43}$/);
 assert.equal(to.searchParams.get('state'),'st-1');
 assert.equal(to.searchParams.get('iss'),ORIGIN);
 f.db.close();
});

// --- tokens -------------------------------------------------------------------

test('a code is exchanged once for short-lived tokens that work at /mcp, stored only as hashes',async()=>{
 const f=fixture(),session=await f.login(),c=await f.consent(session);
 const response=await f.exchange(c.clientId,c.code);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const tokens=await response.json();
 assert.match(tokens.access_token,/^opax_at_[\w-]{43}$/);assert.match(tokens.refresh_token,/^opax_rt_[\w-]{43}$/);
 assert.equal(tokens.token_type,'Bearer');assert.equal(tokens.expires_in,3600);assert.equal(tokens.scope,'records:read');
 for(const path of ['/mcp','/mcp/member'])assert.equal((await f.mcp(f.bearer(tokens.access_token),{path})).status,200);
 // A refresh token is not an access token, and an access token is not a member key.
 assert.equal((await f.mcp(f.bearer(tokens.refresh_token))).status,401);
 const stored=JSON.stringify([f.db.prepare('SELECT * FROM oauth_tokens').all(),f.db.prepare('SELECT * FROM oauth_codes').all(),f.db.prepare('SELECT * FROM oauth_grants').all()]);
 for(const secret of [tokens.access_token,tokens.refresh_token,c.code,tokens.access_token.slice(8),tokens.refresh_token.slice(8)])assert.equal(stored.includes(secret),false);
 assert.ok(f.db.prepare('SELECT 1 FROM oauth_tokens WHERE token_hash=?').get(sha(tokens.access_token)));
 const access=f.db.prepare("SELECT expires_at-created_at AS life FROM oauth_tokens WHERE kind='access'").get();
 assert.equal(access.life,3600);
 assert.equal(f.db.prepare('SELECT resource FROM oauth_grants').get().resource,ORIGIN+'/mcp');
 f.db.close();
});

test('a wrong PKCE verifier fails and burns the code',async()=>{
 const f=fixture(),session=await f.login(),c=await f.consent(session);
 for(const verifier of ['w'.repeat(64),'','short',VERIFIER+'!']){
  const response=await f.exchange(c.clientId,c.code,{code_verifier:verifier});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_grant');
 }
 // The right verifier is too late: the first failure spent the code and removed the pending connection.
 assert.equal((await f.exchange(c.clientId,c.code)).status,400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_tokens').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 f.db.close();
});

test('a replayed code is refused and removes the tokens from its first use',async()=>{
 const f=fixture(),session=await f.login(),c=await f.consent(session);
 const tokens=await (await f.exchange(c.clientId,c.code)).json();
 assert.equal((await f.mcp(f.bearer(tokens.access_token))).status,200);
 const replay=await f.exchange(c.clientId,c.code);
 assert.equal(replay.status,400);assert.equal((await replay.json()).error,'invalid_grant');
 assert.equal((await f.mcp(f.bearer(tokens.access_token))).status,401);
 assert.equal((await f.form('/oauth/token',{grant_type:'refresh_token',client_id:c.clientId,refresh_token:tokens.refresh_token})).status,400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 f.db.close();
});

test('a code is bound to its client, redirect address and resource, and expires',async()=>{
 const f=fixture(),session=await f.login();
 const other=(await f.register()).client.client_id;
 for(const extra of [{client_id:other},{redirect_uri:'https://evil.example/cb'},{resource:ORIGIN+'/mcp/member'},{resource:'https://other.example/mcp'}]){
  const c=await f.consent(session);
  const response=await f.exchange(c.clientId,c.code,extra);
  assert.equal(response.status,400,JSON.stringify(extra));
  assert.ok(['invalid_grant','invalid_target'].includes((await response.json()).error));
 }
 const c=await f.consent(session);
 f.db.exec('UPDATE oauth_codes SET expires_at=1');
 assert.equal((await f.exchange(c.clientId,c.code)).status,400);
 assert.equal((await f.exchange('bad',c.code)).status,401);
 assert.equal((await f.form('/oauth/token',{grant_type:'password',client_id:c.clientId})).status,400);
 assert.equal((await f.oauth('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'grant_type=authorization_code&client_id='+c.clientId+'&code=a&code=b'})).status,400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_tokens').get().n,0);
 f.db.close();
});

test('expired and revoked tokens stop working',async()=>{
 const f=fixture(),session=await f.login();
 const expired=await f.connect(session);
 f.db.prepare("UPDATE oauth_tokens SET expires_at=1 WHERE kind='access'").run();
 const response=await f.mcp(f.bearer(expired.tokens.access_token));
 assert.equal(response.status,401);
 assert.match(response.headers.get('www-authenticate'),/error="invalid_token"/);
 assert.match(response.headers.get('www-authenticate'),/resource_metadata=/);
 // Revocation by the client (RFC 7009) removes the connection whichever token is sent, and never says what existed.
 for(const which of ['access_token','refresh_token']){
  const live=await f.connect(session);
  assert.equal((await f.mcp(f.bearer(live.tokens.access_token))).status,200);
  assert.equal((await f.form('/oauth/revoke',{token:live.tokens[which]})).status,200);
  assert.equal((await f.mcp(f.bearer(live.tokens.access_token))).status,401);
  assert.equal((await f.form('/oauth/token',{grant_type:'refresh_token',client_id:live.clientId,refresh_token:live.tokens.refresh_token})).status,400);
 }
 assert.equal((await f.form('/oauth/revoke',{token:'opax_at_'+'z'.repeat(43)})).status,200);
 assert.equal((await f.form('/oauth/revoke',{})).status,200);
 // A moderated account loses access at once and cannot refresh.
 const live=await f.connect(session);
 f.db.prepare('UPDATE members SET disabled=1').run();
 assert.equal((await f.mcp(f.bearer(live.tokens.access_token))).status,401);
 assert.equal((await f.form('/oauth/token',{grant_type:'refresh_token',client_id:live.clientId,refresh_token:live.tokens.refresh_token})).status,400);
 f.db.close();
});

test('a token issued for another resource is refused',async()=>{
 const f=fixture(),session=await f.login(),live=await f.connect(session);
 f.db.prepare('UPDATE oauth_grants SET resource=?').run('https://other.example/mcp');
 assert.equal((await f.mcp(f.bearer(live.tokens.access_token))).status,401);
 f.db.close();
});

test('refresh tokens rotate, and reusing a rotated one removes the connection',async()=>{
 const f=fixture(),session=await f.login(),first=await f.connect(session);
 const refresh=(token,clientId=first.clientId)=>f.form('/oauth/token',{grant_type:'refresh_token',client_id:clientId,refresh_token:token});
 const rotated=await refresh(first.tokens.refresh_token);
 assert.equal(rotated.status,200);
 const second=await rotated.json();
 assert.notEqual(second.refresh_token,first.tokens.refresh_token);
 assert.notEqual(second.access_token,first.tokens.access_token);
 assert.equal((await f.mcp(f.bearer(second.access_token))).status,200);
 assert.equal((await f.mcp(f.bearer(first.tokens.access_token))).status,401); // the earlier access token went with the rotation
 // A repeat within seconds is a retry: refused, and nothing else changes.
 const retried=await refresh(first.tokens.refresh_token);
 assert.equal(retried.status,400);
 assert.equal((await f.mcp(f.bearer(second.access_token))).status,200);
 // Later than that it is a stolen token: the whole connection goes.
 f.db.prepare("UPDATE oauth_tokens SET used_at=used_at-60 WHERE used_at IS NOT NULL").run();
 const reused=await refresh(first.tokens.refresh_token);
 assert.equal(reused.status,400);assert.equal((await reused.json()).error,'invalid_grant');
 assert.equal((await f.mcp(f.bearer(second.access_token))).status,401);
 assert.equal((await refresh(second.refresh_token)).status,400);
 assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 // A refresh token belongs to its client, and expires.
 const live=await f.connect(session),other=(await f.register()).client.client_id;
 assert.equal((await refresh(live.tokens.refresh_token,other)).status,400);
 const again=await f.connect(session);
 f.db.prepare("UPDATE oauth_tokens SET expires_at=1 WHERE kind='refresh'").run();
 assert.equal((await refresh(again.tokens.refresh_token,again.clientId)).status,400);
 assert.equal((await refresh('opax_rt_'+'q'.repeat(43))).status,400);
 f.db.close();
});

test('token and registration endpoints never read the session cookie and carry open CORS',async()=>{
 const f=fixture(),session=await f.login(),c=await f.consent(session);
 // A public client_id is not a limit key: hammering one cannot lock its members out of the token endpoint.
 for(let i=0;i<70;i++)assert.equal((await f.exchange(c.clientId,'x'.repeat(43))).status,400);
 const response=await f.exchange(c.clientId,c.code);
 assert.equal(response.headers.get('access-control-allow-origin'),'*');
 assert.equal(response.headers.get('access-control-allow-credentials'),null);
 const preflight=await f.oauth('/oauth/token',{method:'OPTIONS',headers:{origin:'https://inspector.example'}});
 assert.equal(preflight.status,204);
 // The consent page is for a browser tab only: no CORS, no preflight.
 const consentPreflight=await f.oauth(f.authorizeQuery(c.clientId),{method:'OPTIONS'});
 assert.equal(consentPreflight.headers.get('access-control-allow-origin'),null);
 f.db.close();
});

// --- a member's connected clients ---------------------------------------------

test('members see and remove their connected clients beside their keys',async()=>{
 const f=fixture(),session=await f.login(),other=await f.login('other@example.com');
 const live=await f.connect(session);
 const listed=(await (await f.account('connections','GET',undefined,session.cookie)).json()).connections;
 assert.equal(listed.length,1);
 assert.deepEqual(Object.keys(listed[0]).sort(),['created_at','id','last_used_at','name','returns_to']);
 assert.equal(listed[0].name,'Claude');assert.equal(listed[0].returns_to,'claude.ai');
 assert.deepEqual((await (await f.account('connections','GET',undefined,other.cookie)).json()).connections,[]);
 assert.equal((await f.account('connections','GET')).status,401);
 assert.equal((await f.account('connections/'+listed[0].id,'DELETE',undefined,other.cookie)).status,404);
 assert.equal((await f.mcp(f.bearer(live.tokens.access_token))).status,200);
 assert.equal((await f.account('connections/'+listed[0].id,'DELETE',undefined,session.cookie)).status,200);
 assert.equal((await f.mcp(f.bearer(live.tokens.access_token))).status,401);
 assert.equal((await f.form('/oauth/token',{grant_type:'refresh_token',client_id:live.clientId,refresh_token:live.tokens.refresh_token})).status,400);
 // Member keys are untouched by any of this.
 const key=(await (await f.account('keys','POST',{name:'Laptop'},session.cookie)).json()).token;
 assert.match(key,/^opax_[\w-]{43}$/);
 assert.equal((await f.mcp(f.bearer(key))).status,200);
 assert.equal((await f.mcp(f.bearer(key),{path:'/mcp/member'})).status,200);
 f.db.close();
});

test('sign-in endpoints pause with the community; the no-account tools do not',async()=>{
 const f=fixture({COMMUNITY_ENABLED:'false'});
 assert.equal((await f.oauth('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,503);
 assert.equal((await f.oauth('/oauth/authorize?client_id=x')).status,503);
 assert.equal((await f.oauth('/.well-known/oauth-authorization-server')).status,200);
 assert.equal((await f.mcp()).status,200);
 assert.equal((await f.mcp(f.bearer('opax_'+'a'.repeat(43)))).status,503);
 f.db.close();
});
