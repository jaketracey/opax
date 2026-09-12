import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const folder=mkdtempSync(join(tmpdir(),'opax-community-test-'));
await build({entryPoints:[new URL('../src/community.ts',import.meta.url).pathname,new URL('../src/community-mcp.ts',import.meta.url).pathname,new URL('../src/community-core.ts',import.meta.url).pathname],outdir:folder,bundle:true,platform:'node',format:'esm',packages:'bundle'});
const {communityRoute}=await import(pathToFileURL(join(folder,'community.js')));
const {communityMcp}=await import(pathToFileURL(join(folder,'community-mcp.js')));
const {digest,sourcePath}=await import(pathToFileURL(join(folder,'community-core.js')));
function fixture(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_community.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0002_free_community.sql',import.meta.url),'utf8'));const outbox=[];const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}});const env={COMMUNITY_DB:{prepare:statement,async batch(stmts){db.exec('BEGIN');try{const results=[];for(const stmt of stmts)results.push(await stmt.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_EMAIL_FROM:'hello@login.opax.test',COMMUNITY_EMAIL:{async send(mail){outbox.push(mail);return {messageId:'test'}}},ASSETS:{async fetch(){return Response.json({entities:[],sources:[]})}}};
const request=(path,method='GET',data,cookie='',headers={})=>new Request('https://opax.test/api/community/'+path,{method,headers:{origin:'https://opax.test',...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},body:data?JSON.stringify(data):undefined});
const call=(...args)=>communityRoute(request(...args),env);
async function login(email='reader@example.com'){assert.equal((await call('auth/request','POST',{email})).status,200);const token=new URL(outbox.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(7);const response=await call('auth/consume','POST',{token});assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],token,member:db.prepare('SELECT * FROM members WHERE email=?').get(email)}}
return {db,env,outbox,call,request,login}}
test('magic links are single-use, hashed, and issue secure private sessions',async()=>{const f=fixture(),l=await f.login();assert.match(l.cookie,/__Host-opax_session=/);assert.notEqual(f.db.prepare('SELECT token_hash FROM login_links').get().token_hash,l.token);assert.equal((await f.call('auth/consume','POST',{token:l.token})).status,400);const r=await f.call('status','GET',undefined,l.cookie);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).member.email,'reader@example.com');f.db.close()});
test('expired links and tokens cannot sign in',async()=>{const f=fixture();await f.call('auth/request','POST',{email:'a@example.com'});const token=new URL(f.outbox[0].text.match(/https:\/\/\S+/)[0]).hash.slice(7);f.db.exec('UPDATE login_links SET expires_at=0');assert.equal((await f.call('auth/consume','POST',{token})).status,400);assert.equal((await f.call('auth/consume','POST',{token:'x'.repeat(43)})).status,400);f.db.close()});
test('cross-origin and opaque-origin account mutations are refused',async()=>{
 const f=fixture();
 try{
  for(const origin of ['https://evil.test','https://www.opax.test','null','']){
   for(const path of ['auth/request','auth/consume','auth/logout']){
    assert.equal((await f.call(path,'POST',{email:'a@example.com',token:'a'.repeat(43)},'',{origin})).status,403);
   }
  }
  assert.equal(f.outbox.length,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,0);
 }finally{f.db.close()}
});
test('email failures invalidate the unused link and do not create accounts',async()=>{const f=fixture();f.env.COMMUNITY_EMAIL.send=async()=>{throw Error('mail failed')};assert.equal((await f.call('auth/request','POST',{email:'a@example.com'})).status,503);assert.equal(f.db.prepare('SELECT count(*) n FROM login_links').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM members').get().n,0);f.db.close()});
test('login rate limits prevent repeated email sends',async()=>{const f=fixture();for(let i=0;i<5;i++)assert.equal((await f.call('auth/request','POST',{email:'a@example.com'})).status,200);assert.equal((await f.call('auth/request','POST',{email:'a@example.com'})).status,429);assert.equal(f.outbox.length,5);f.db.close()});
test('logging out on all devices revokes every session',async()=>{const f=fixture(),a=await f.login(),b=await f.login();assert.equal((await f.call('auth/logout','POST',{everywhere:true},a.cookie)).status,200);assert.equal((await (await f.call('status','GET',undefined,b.cookie)).json()).member,null);f.db.close()});
test('private reading lists stay private and are owner controlled',async()=>{const f=fixture(),a=await f.login(),b=await f.login('second@example.com');const created=await f.call('lists','POST',{title:'Housing records'},a.cookie),{id}=await created.json();assert.equal(created.status,201);assert.equal((await f.call('lists/'+id)).status,404);assert.equal((await f.call('lists/'+id,'GET',undefined,b.cookie)).status,404);assert.equal((await f.call('lists/'+id,'PATCH',{title:'Hijacked',public:true},b.cookie)).status,404);assert.equal((await f.call('lists/'+id+'/items','POST',{title:'Fake',path:'//evil.test/x'},a.cookie)).status,400);assert.equal((await f.call('lists/'+id+'/items','POST',{title:'Speech',path:'/doc/speech-123'},a.cookie)).status,201);await f.call('lists/'+id,'PATCH',{title:'Housing records',public:true},a.cookie);assert.equal((await f.call('lists/'+id)).status,200);await f.call('lists/'+id,'DELETE',undefined,a.cookie);assert.equal(f.db.prepare('SELECT count(*) n FROM reading_list_items').get().n,0);f.db.close()});
test('public profiles do not expose email addresses or billing IDs',async()=>{const f=fixture(),a=await f.login();const payload=await (await f.call('members/'+a.member.id)).json();assert.equal(payload.member.email,undefined);assert.equal(payload.member.stripe_customer,undefined);f.db.close()});
test('discussions require a signed-in profile and support report/removal',async()=>{const f=fixture(),a=await f.login(),b=await f.login('b@example.com');const data={title:'A useful question',body:'What does this sourced record show?',source_path:'/doc/speech-123'};assert.equal((await f.call('threads','POST',data)).status,401);assert.equal((await f.call('threads','POST',data,a.cookie)).status,400);await f.call('profile','PATCH',{name:'A reader',bio:''},a.cookie);const {id}=await (await f.call('threads','POST',data,a.cookie)).json();assert.equal((await f.call('threads/'+id,'DELETE',undefined,b.cookie)).status,404);assert.equal((await f.call('reports','POST',{target:id,reason:'Please review this'},b.cookie)).status,200);assert.equal((await f.call('reports','GET',undefined,b.cookie)).status,403);await f.call('threads/'+id,'DELETE',undefined,a.cookie);assert.equal((await f.call('threads/'+id)).status,404);f.db.close()});
test('discussion sources preserve the specific topic, publication, speech and data point',async()=>{
 const f=fixture(),a=await f.login();
 try{
  await f.call('profile','PATCH',{name:'A reader',bio:''},a.cookie);
  const paths=[
   '/subject/topic/housing',
   '/doc/publication-community-funding#findings',
   '/doc/speech-123#:~:text=community%20funding',
   '/reports/grants-allocation?collection=history&year=2024#projects',
   '/money?focus=party%3ALabor',
   '/bills/example-bill',
   '/explore?game=grants&jur=federal&open=abn%3A12345678901',
   '/discover?category=contracts&agency=example',
   '/declared?person=David%20Pocock'
  ];
  for(const path of paths){
   const created=await f.call('threads','POST',{title:'A question about this source',body:'What does this particular source tell us?',source_path:path},a.cookie);
   assert.equal(created.status,201,path);
   const {id}=await created.json();
   const result=await (await f.call('threads/'+id)).json();
   assert.equal(result.thread.source_path,path);
  }
 }finally{f.db.close()}
});
test('source links stay optional and limited to Opax record pages',()=>{
 for(const blank of [null,undefined,''])assert.equal(sourcePath(blank),null);
 for(const invalid of ['https://evil.test/doc/123','//evil.test/doc/123','javascript:alert(1)','/api/community/status','/explorer','/doc/has space','/doc/\\evil.test']){
  assert.throws(()=>sourcePath(invalid),error=>error.status===400,invalid);
 }
});
test('disabled accounts cannot retain sessions',async()=>{const f=fixture(),a=await f.login();f.db.exec('UPDATE members SET disabled=1');assert.equal((await f.call('lists','GET',undefined,a.cookie)).status,401);f.db.close()});
test.after(()=>rmSync(folder,{recursive:true,force:true}));

test('MCP tools return usable record citations and bound oversized responses',async()=>{
 const f=fixture(),a=await f.login();
 const {token,id}=await (await f.call('keys','POST',{name:'Tool checks'},a.cookie)).json();
 let read=async path=>Response.json(path.startsWith('/api/search-all')?{results:[{slug:'speech-931754',title:'Housing'},{href:'/subject/supplier/example',title:'Supplier'}]}:{slug:'speech-931754',text:'Source text'});
 const send=async(method,params={})=>{const r=await communityMcp(new Request('https://opax.test/mcp',{method:'POST',headers:{authorization:'Bearer '+token,accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:2,method,params})}),f.env,path=>read(path));assert.equal(r.status,200);return (await r.json()).result};
 const listed=await send('tools/list');assert.deepEqual(listed.tools.map(x=>x.name).sort(),['corpus_coverage','find_connections','read_record','search_records']);
 const search=await send('tools/call',{name:'search_records',arguments:{query:'housing'}});assert.equal(search.isError,false);const results=JSON.parse(search.content[0].text).results;assert.equal(results[0].opax_url,'https://opax.test/doc/speech-931754');assert.equal(results[1].opax_url,'https://opax.test/subject/supplier/example');
 const record=await send('tools/call',{name:'read_record',arguments:{slug:'speech-931754'}});assert.equal(JSON.parse(record.content[0].text).opax_url,'https://opax.test/doc/speech-931754');
 const invalid=await send('tools/call',{name:'read_record',arguments:{slug:'../../account'}});assert.equal(invalid.isError,true);
 let cancelled=false;read=async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(100000))},cancel(){cancelled=true}}));
 const large=await send('tools/call',{name:'read_record',arguments:{slug:'speech-931754'}});assert.equal(large.isError,true);assert.equal(cancelled,true);assert.equal(JSON.parse(large.content[0].text).url,'https://opax.test/doc/speech-931754');assert.equal(f.db.prepare('SELECT token_hash FROM mcp_keys').get().token_hash,await digest(token));await f.call('keys/'+id,'DELETE',undefined,a.cookie);const revoked=await communityMcp(new Request('https://opax.test/mcp',{headers:{authorization:'Bearer '+token}}),f.env,read);assert.equal(revoked.status,401);f.db.close();
});

test('member status has no payment tier and former payment routes are unavailable',async()=>{const f=fixture(),a=await f.login();const status=await (await f.call('status','GET',undefined,a.cookie)).json();assert.equal('supporter' in status,false);assert.equal('contribution' in status,false);assert.equal((await f.call('billing/checkout','POST',{},a.cookie)).status,404);assert.equal((await f.call('keys','POST',{name:'My assistant'},a.cookie)).status,201);f.db.close()});

test('official MCP client connects over HTTP and reads records with a member token',async()=>{
 const {createServer}=await import('node:http');const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
 const f=fixture(),a=await f.login();const {token,id}=await (await f.call('keys','POST',{name:'HTTP research client'},a.cookie)).json();
 const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=new Request('http://127.0.0.1/mcp',{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});const response=await communityMcp(input,f.env,async path=>Response.json({slug:path.split('/').pop(),text:'A public source record.'}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const client=new Client({name:'Opax integration check',version:'1.0.0'});
 try{const transport=new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}});await client.connect(transport);assert.equal((await client.listTools()).tools.length,4);const record=await client.callTool({name:'read_record',arguments:{slug:'speech-931754'}});assert.equal(record.isError,false);assert.equal(JSON.parse(record.content[0].text).opax_url,'https://opax.test/doc/speech-931754');for(const slug of ['grant-site-evidence-mlci-invitation-067','grant-site-evidence-mlci-invitation-070','grant-site-evidence-ga566033','mlci-invitation-067']){const venue=await client.callTool({name:'read_record',arguments:{slug}});assert.equal(venue.isError,false);assert.equal(JSON.parse(venue.content[0].text).opax_url,'https://opax.test/doc/'+slug)}const invalidVenue=await client.callTool({name:'read_record',arguments:{slug:'grant-site-evidence-admin'}});assert.equal(invalidVenue.isError,true);await f.call('keys/'+id,'DELETE',undefined,a.cookie);await assert.rejects(()=>client.listTools());}
 finally{await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.db.close()}
});
