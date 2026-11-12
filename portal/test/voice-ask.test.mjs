// ask_opax: the voice agent's route into the same research as /api/ask, its source labels and its agent config.
// No model or provider calls: Ask is a stub that replays a stored /api/ask payload.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {loadConfig,renderTools,planSync,formatPlan,parseArgs,differences} from '../voice/agent-sync.mjs';

crypto.subtle.timingSafeEqual ??= timingSafeEqual;
const folder=mkdtempSync(join(tmpdir(),'opax-voice-ask-test-'));
await build({entryPoints:[new URL('../src/voice.ts',import.meta.url).pathname,new URL('../src/voice-sources.ts',import.meta.url).pathname],outdir:folder,bundle:true,platform:'node',format:'esm',logLevel:'error'});
const {voiceRoute,reserveVoiceSession,claimVoiceSession}=await import(pathToFileURL(join(folder,'voice.js')));
const {voiceSource,spokenAnswer,plainCase,askOpaxResult}=await import(pathToFileURL(join(folder,'voice-sources.js')));
const stored=JSON.parse(readFileSync(new URL('./fixtures/voice-ask-payload.json',import.meta.url),'utf8'));
const hash=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');

function fixture({ask=async()=>Response.json(stored),searchRows=[]}={}){
  const db=new DatabaseSync(':memory:');
  for(const name of ['0001_community.sql','0002_free_community.sql','0003_voice.sql','0004_voice_access.sql','0009_community_social.sql','0010_reply_email_notifications.sql','0011_native_signin.sql','0012_voice_deletion_safe.sql']) db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){db.prepare(sql).run(...args);return {success:true}}});
  const env={COMMUNITY_DB:{prepare:statement},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',VOICE_ENABLED:'true',VOICE_AGENT_ID:'agent_test',ELEVENLABS_API_KEY:'server-only-test-key',VOICE_TOOL_SECRET:'t'.repeat(43),VOICE_MONTHLY_SECONDS:'40000',ASSETS:{async fetch(){return Response.json({})}}};
  const asked=[];
  const askStub=async(input,sessionId,signal)=>{asked.push({input,sessionId,signal});return ask(input,sessionId,signal)};
  const read=async()=>Response.json({results:searchRows,index_version:'0123456789abcdef'});
  const call=(path,data,headers={'x-opax-voice-token':env.VOICE_TOOL_SECRET})=>voiceRoute(new Request('https://opax.test/api/voice/'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)}),env,{waitUntil(){}},read,askStub);
  async function live(){
    const id=crypto.randomUUID(),timestamp=Math.floor(Date.now()/1000);
    db.prepare('INSERT INTO members(id,email,created_at) VALUES(?,?,?)').run(id,'reader@example.com',timestamp);
    const s=await reserveVoiceSession(env,id);await claimVoiceSession(env,id,s.id);
    db.prepare("UPDATE voice_sessions SET state='active' WHERE id=?").run(s.id);
    return s.id;
  }
  return {db,env,call,live,asked};
}

test('ask_opax needs the provider secret and a live voice session before Ask runs',async()=>{
  const f=fixture(),sid=await f.live();
  assert.equal((await f.call('tools/ask_opax',{session_id:sid,question:'Who is the highest paid agency head?'},{})).status,401);
  assert.equal((await f.call('tools/ask_opax',{session_id:sid,question:'Who is the highest paid agency head?'},{'x-opax-voice-token':'x'.repeat(43)})).status,401);
  assert.equal((await f.call('tools/ask_opax',{session_id:crypto.randomUUID(),question:'Who is the highest paid agency head?'})).status,403);
  f.db.exec("UPDATE voice_sessions SET state='closed'");
  assert.equal((await f.call('tools/ask_opax',{session_id:sid,question:'Who is the highest paid agency head?'})).status,403);
  assert.equal(f.asked.length,0);f.db.close();
});

test('ask_opax bounds its arguments',async()=>{
  const f=fixture(),sid=await f.live();
  for(const bad of [{},{question:'hi'},{question:'x'.repeat(501)},{question:42},{question:'How much is a backbencher paid?',person:'x'.repeat(121)},{question:'How much is a backbencher paid?',topic:['pay']}]){
    const response=await f.call('tools/ask_opax',{session_id:sid,...bad});
    assert.equal(response.status,400,JSON.stringify(bad));
  }
  assert.equal((await f.call('tools/ask_opax',{session_id:sid,question:'x'.repeat(10_000)})).status,413);
  assert.equal(f.asked.length,0);f.db.close();
});

test('ask_opax calls Ask once per question and returns a spoken answer with labelled sources',async()=>{
  const f=fixture(),sid=await f.live();
  const response=await f.call('tools/ask_opax',{session_id:sid,question:'Who is the highest paid agency head?',topic:'agency heads'});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(f.asked.length,1);
  assert.equal(f.asked[0].input.question,'Who is the highest paid agency head (agency heads)?');
  assert.equal(f.asked[0].sessionId,sid);assert.ok(f.asked[0].signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(result).sort(),['answer','answered','question','source_notice','source_url','sources','spoken_answer']);
  assert.equal(result.answered,true);
  // Answer first, at most four sentences, no citation markers or markdown, numbers in plain words.
  const sentences=result.spoken_answer.split(/(?<=[.!?])\s+(?=[A-Z])/);
  assert.ok(sentences.length>=2&&sentences.length<=4,result.spoken_answer);
  assert.match(sentences[0],/Example Department.*\$1\.03 million/);
  assert.doesNotMatch(result.spoken_answer,/\[\d+\]|\*\*|https?:|\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(result.answer,/\[\d+\]/);
  // Every source has a title, date, type and OPAX link; cited rows first; external-only rows drop out.
  assert.ok(result.sources.length>=3);
  assert.ok(result.sources.some(s=>s.type==='Pay record'&&s.date==='1999–2026'));
  for(const s of result.sources){
    assert.deepEqual(Object.keys(s).sort(),['date','record_title','speaker','title','type','url']);
    assert.ok(s.url.startsWith('https://opax.test/'),s.url);
    assert.doesNotMatch(s.title,/—|\d{4}-\d{2}-\d{2}|^[A-Z\s]{6,}$/);
  }
  assert.equal(result.sources[0].type,'Pay determination');assert.equal(result.sources[0].date,'2025-07-01');
  assert.equal(result.source_url,result.sources[0].url);
  assert.ok(!result.sources.some(s=>s.url.includes('example.gov.au')||s.type==='Coverage note'));
  f.db.close();
});

test('ask_opax speaks Ask failures and timeouts in one sentence, and passes a quota refusal through',async()=>{
  for(const [ask,status,pattern] of [
    [async()=>Response.json({error:'The record is temporarily unavailable. Please try again.'},{status:503}),200,/could not finish/],
    [async()=>{throw new DOMException('slow','TimeoutError')},200,/could not finish/],
    [async()=>Response.json({error:'Too many requests.'},{status:429}),429,null],
    [async()=>Response.json({answered:false,answer:'',sources:[]}),200,/could not find an answer/],
  ]){
    const f=fixture({ask}),sid=await f.live();
    const response=await f.call('tools/ask_opax',{session_id:sid,question:'How much is a federal backbencher paid?'});
    assert.equal(response.status,status);
    if(pattern){const r=await response.json();assert.match(r.spoken_answer,pattern);assert.equal(r.answered,false);assert.deepEqual(r.sources,[])}
    f.db.close();
  }
});

test('an answer Ask wrote is spoken even when Ask marks it unanswered',()=>{
  const r=askOpaxResult({answered:false,answer:'The record shows two determinations for this office [1]. Neither sets a figure for 2026.',sources:[{slug:'',href:'/doc/legal-12',title:'Example Determination 2025',kind:'legal',cited:true}]},'https://opax.test');
  assert.match(r.spoken_answer,/^The record shows two determinations/);assert.equal(r.sources[0].type,'Legislation');
});

// The three records in the 13 Nov TestFlight screenshot, with invented names and titles.
test('voice sources read like Ask sources: speaker, date, type and a plain title',async()=>{
  const rows=[
    {slug:'speech-500101',title:'Alex Example — COMMITTEES — 2001-06-21',kind:'speech'},
    {slug:'speech-500102',title:'Sam Sample — 1998-06-23',kind:'speech'},
    {slug:'speech-500103',title:'Jo Placeholder — EXAMPLE SERVICES DELIVERY AGENCY BILL 1996 — 1997-02-26'},
  ];
  const f=fixture({searchRows:rows}),sid=await f.live();
  const response=await f.call('tools/search_records',{session_id:sid,query:'agency head pay'});
  assert.equal(response.status,200);
  const {sources}=await response.json();
  assert.deepEqual(sources,[
    {title:'Alex Example: Committees',record_title:'Committees',speaker:'Alex Example',date:'2001-06-21',type:'Speech',url:'https://opax.test/doc/speech-500101'},
    {title:'Speech by Sam Sample',record_title:'Speech by Sam Sample',speaker:'Sam Sample',date:'1998-06-23',type:'Speech',url:'https://opax.test/doc/speech-500102'},
    {title:'Jo Placeholder: Example Services Delivery Agency Bill 1996',record_title:'Example Services Delivery Agency Bill 1996',speaker:'Jo Placeholder',date:'1997-02-26',type:'Speech',url:'https://opax.test/doc/speech-500103'},
  ]);
  f.db.close();
});

test('source labels never show raw slugs, roster names or capitals-only titles',()=>{
  assert.equal(voiceSource({slug:'speech-1',title:'speech-1'},'https://opax.test').title,'Speech');
  assert.equal(voiceSource({slug:'speech-2',title:'HOUSING — 2020-02-03',speaker:'EXAMPLE, Robin, MP'},'https://opax.test').title,'Robin Example: Housing');
  assert.equal(voiceSource({href:'/subject/agency/example-office',title:'EXAMPLE OFFICE OF THE NDIS',kind:'agency'},'https://opax.test').title,'Example Office of the NDIS');
  assert.equal(voiceSource({url:'https://www.example.gov.au/report.pdf',title:'External'},'https://opax.test'),null);
  assert.equal(voiceSource({url:'https://opax.com.au/doc/speech-9?x=1',title:'Budget',date:'2024-05-14T00:00:00Z'},'https://opax.test').url,'https://opax.test/doc/speech-9?x=1');
  assert.equal(plainCase('Mixed Case Stays'),'Mixed Case Stays');
  // Shapes seen in the 13 Nov local runs: Hansard XML in a title, a contract number ahead of the supplier, Ask's pay rows.
  assert.equal(voiceSource({slug:'speech-3',title:'Robin Example — <Xref Class="Bill" Xrefid="R1">Example Bill 1997</Xref> <Break Type="Line"><Xref Class="Bill">Example Amendment Bill 1997</Xref',kind:'speech'},'https://opax.test').record_title,'Example Bill 1997 Example Amendment Bill 1997');
  assert.equal(voiceSource({href:'/subject/supplier/s-1?contract=CN1',title:'3000175296 — Example Supplies Pty Ltd',kind:'contract',date:'2025-06-30'},'https://opax.test').title,'Example Supplies Pty Ltd');
  assert.deepEqual(voiceSource({kind:'pay',title:'Example office pay — every step since 1999',href:'/ask?q=x',url:'https://www.example.gov.au/d.pdf',dateLabel:'1999–2026'},'https://opax.test'),{title:'Example office pay: every step since 1999',record_title:'Example office pay: every step since 1999',speaker:null,date:'1999–2026',type:'Pay record',url:'https://opax.test/ask?q=x'});
  assert.equal(voiceSource({kind:'pay',title:'Example ranking',href:'/ask?q=y',dateLabel:'As at 2026-10-19'},'https://opax.test').date,'2026-10-19');
  assert.equal(spokenAnswer('Pay is $2,500,000,000 [1]. Dr. Example said so on 2024-03-01. Third. Fourth. Fifth.'),'Pay is $2.5 billion. Dr. Example said so on 1 March 2024. Third. Fourth.');
});

test('agent config is valid JSON, every tool posts under /api/voice/tools/ and ask_opax leads the prompt',()=>{
  const raw=readFileSync(new URL('../voice/agent-config.json',import.meta.url),'utf8');
  const config=JSON.parse(raw);
  assert.ok(Object.keys(config.agents).length>=2);
  for(const {origin} of Object.values(config.agents)){
    const tools=renderTools(config,{origin,secretId:'secret_example'});
    for(const tool of tools){
      const url=new URL(tool.api_schema.url);
      assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith('/api/voice/tools/'),tool.name);
      assert.equal(url.pathname,'/api/voice/tools/'+tool.name);
      assert.equal(tool.api_schema.method,'POST');
      assert.deepEqual(tool.api_schema.request_headers,{'x-opax-voice-token':{secret_id:'secret_example'}});
      assert.equal(tool.api_schema.request_body_schema.properties.session_id.dynamic_variable,'opax_session_id');
      assert.ok(tool.response_timeout_secs>=5&&tool.response_timeout_secs<=300);
    }
  }
  const ask=config.tools.find(t=>t.name==='ask_opax');
  assert.ok(ask&&ask.response_timeout_secs>=85,'ask_opax waits longer than the Worker bound');
  assert.equal(ask.pre_tool_speech,'force');
  const prompt=config.prompt.join('\n');
  assert.match(prompt,/call ask_opax first/);assert.match(prompt,/holding line/);assert.match(prompt,/offer the sources/);
  assert.doesNotMatch(raw,/—/);
  assert.doesNotMatch(raw,/sk_[a-z0-9]{20,}|xi-api-key/i);
});

test('agent sync is a dry-run plan by default and only touches this agent\'s tools',()=>{
  const config=loadConfig(),origin='https://staging.opax.com.au';
  const [search]=renderTools(config,{origin,secretId:'secret_live'}).filter(t=>t.name==='search_records');
  const agent={agent_id:'agent_x',conversation_config:{agent:{prompt:{prompt:'Old prompt',llm:'example-llm',tool_ids:['tool_search','tool_other']}}}};
  const attached=[{id:'tool_search',tool_config:{...search,description:'Old description',extra_provider_field:1}},{id:'tool_other',tool_config:{name:'end_call',type:'system'}}];
  const plan=planSync(config,agent,attached,{origin});
  assert.equal(plan.secret_id,'secret_live');assert.deepEqual(plan.problems,[]);
  assert.deepEqual(plan.tools.find(t=>t.name==='ask_opax').action,'create');
  const update=plan.tools.find(t=>t.name==='search_records');
  assert.equal(update.action,'update');assert.deepEqual(update.changes.map(c=>c.path),['description']);
  assert.deepEqual(plan.kept,[{id:'tool_other',name:'end_call'}]);
  assert.ok(plan.prompt.changed);
  const text=formatPlan(plan);assert.match(text,/create ask_opax/);assert.match(text,/keep   end_call/);assert.doesNotMatch(text,/secret_example/);
  assert.deepEqual(parseArgs(['--agent','agent_x']),{apply:false,agent:'agent_x'});
  assert.deepEqual(parseArgs(['--agent','agent_x','--apply','--secret-id','s1']),{apply:true,agent:'agent_x',secretId:'s1'});
  assert.throws(()=>parseArgs(['--force']));
  assert.deepEqual(planSync(config,{conversation_config:{agent:{prompt:{}}}},[],{origin}).problems.length,1);
  assert.deepEqual(differences({a:{b:1}},{a:{b:1,c:2}}),[]);
});
