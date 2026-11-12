// ask_opax: the voice agent's route into the same research as /api/ask, its source labels and its agent config.
// No model or provider calls: Ask is a stub that replays a stored /api/ask payload.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdtempSync,statSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {loadConfig,renderTools,planSync,formatPlan,parseArgs,differences,run,samePrompt} from '../voice/agent-sync.mjs';

crypto.subtle.timingSafeEqual ??= timingSafeEqual;
const folder=mkdtempSync(join(tmpdir(),'opax-voice-ask-test-'));
await build({entryPoints:[new URL('../src/voice.ts',import.meta.url).pathname,new URL('../src/voice-sources.ts',import.meta.url).pathname,new URL('../src/voice-ask.ts',import.meta.url).pathname,new URL('../src/ask-caller-budget.ts',import.meta.url).pathname],outdir:folder,bundle:true,platform:'node',format:'esm',logLevel:'error'});
const {voiceRoute,reserveVoiceSession,claimVoiceSession}=await import(pathToFileURL(join(folder,'voice.js')));
const {voiceSource,spokenAnswer,plainCase,askOpaxResult}=await import(pathToFileURL(join(folder,'voice-sources.js')));
const {voiceAsk}=await import(pathToFileURL(join(folder,'voice-ask.js')));
const {callerBudgetMs,fallbackAllowanceMs,gatheredPayload,ASK_FALLBACK_FLOOR_MS,trustedCaller,shortenedCaller}=await import(pathToFileURL(join(folder,'ask-caller-budget.js')));
const stored=JSON.parse(readFileSync(new URL('./fixtures/voice-ask-payload.json',import.meta.url),'utf8'));
const hash=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');

function fixture({ask=async()=>Response.json(stored),searchRows=[]}={}){
  const db=new DatabaseSync(':memory:');
  for(const name of ['0001_community.sql','0002_free_community.sql','0003_voice.sql','0004_voice_access.sql','0009_community_social.sql','0010_reply_email_notifications.sql','0011_native_signin.sql','0012_voice_deletion_safe.sql']) db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){db.prepare(sql).run(...args);return {success:true}}});
  const env={COMMUNITY_DB:{prepare:statement},COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',VOICE_ENABLED:'true',VOICE_AGENT_ID:'agent_test',ELEVENLABS_API_KEY:'server-only-test-key',VOICE_TOOL_SECRET:'t'.repeat(43),VOICE_MONTHLY_SECONDS:'40000',ASSETS:{async fetch(){return Response.json({})}}};
  const asked=[];
  const askStub=async(input,sessionId,signal,budgetMs)=>{asked.push({input,sessionId,signal,budgetMs});return ask(input,sessionId,signal,budgetMs)};
  const read=async()=>Response.json({results:searchRows,index_version:'0123456789abcdef'});
  const call=(path,data,headers={'x-opax-voice-token':env.VOICE_TOOL_SECRET},signal)=>voiceRoute(new Request('https://opax.test/api/voice/'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data),signal}),env,{waitUntil(){}},read,askStub);
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
  assert.equal(f.asked[0].sessionId,sid);assert.ok(f.asked[0].signal instanceof AbortSignal);assert.equal(f.asked[0].budgetMs,82_000);
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
      // LiteralJsonSchemaProperty: only one of these may be set (tools/get reference).
      for(const [key,property] of Object.entries(tool.api_schema.request_body_schema.properties)) assert.ok(['description','dynamic_variable','constant_value','is_system_provided','is_omitted'].filter(f=>f in property).length<=1,tool.name+'.'+key);
      assert.ok(['auto','force','off'].includes(tool.pre_tool_speech));assert.ok(['immediate','post_tool_speech','async'].includes(tool.execution_mode));
      if('tool_call_sound' in tool) assert.ok(['typing','elevator1','elevator2','elevator3','elevator4'].includes(tool.tool_call_sound));
      assert.ok(tool.response_timeout_secs>=5&&tool.response_timeout_secs<=300);
    }
  }
  const ask=config.tools.find(t=>t.name==='ask_opax');
  assert.ok(ask&&ask.response_timeout_secs>=85,'ask_opax waits longer than the Worker bound');
  assert.equal(ask.pre_tool_speech,'force');
  const prompt=config.prompt.join('\n');
  assert.match(prompt,/call ask_opax first/);assert.match(prompt,/holding line/);assert.match(prompt,/offer the sources/);assert.match(prompt,/dollar amount/);
  assert.doesNotMatch(prompt,/on your screen|one point zero/);
  assert.doesNotMatch(raw,/—/);
  assert.doesNotMatch(raw,/sk_[a-z0-9]{20,}|xi-api-key/i);
});

test('staging asks through STAGING_API the way its /api/ask is served; production asks in this Worker with its deadline',async()=>{
  for(const [staging,secret] of [[true,'k'.repeat(40)],[true,undefined],[false,'k'.repeat(40)]]){
    const forwarded=[],local=[];
    const env={COMMUNITY_ORIGIN:staging?'https://staging.opax.test':'https://opax.test',ASK_INTERNAL_SECRET:secret,...(staging?{STAGING_API:{async fetch(request){forwarded.push(request);return Response.json({answer:'Forwarded.'})}}}:{})};
    const ask=voiceAsk(env,async(request,caller)=>{local.push({request,caller});return Response.json({answer:'Local.'})});
    const controller=new AbortController(),before=Date.now();
    const response=await ask({question:'How much is a federal backbencher paid?'},'session-1',controller.signal,82_000);
    assert.equal((await response.json()).answer,staging?'Forwarded.':'Local.');
    assert.equal(forwarded.length,staging?1:0);assert.equal(local.length,staging?0:1);
    const request=staging?forwarded[0]:local[0].request;
    assert.equal(request.method,'POST');assert.equal(new URL(request.url).href,env.COMMUNITY_ORIGIN+'/api/ask');
    assert.equal(request.headers.get('accept'),'application/json');assert.equal(request.headers.get('content-type'),'application/json');
    assert.equal(request.headers.get('cf-connecting-ip'),'voice-ask:session-1');
    assert.deepEqual(await request.json(),{question:'How much is a federal backbencher paid?'});
    if(staging){
      // The hop states the remaining time only with the shared secret; production checks it (ask-caller-budget.test.mjs).
      assert.equal(request.headers.get('x-opax-ask-budget-ms'),secret?'82000':null);
      assert.equal(request.headers.get('x-opax-ask-internal'),secret??null);
    }else{
      // In this Worker the deadline is an argument: no header, nothing a reader could copy.
      assert.equal(request.headers.get('x-opax-ask-budget-ms'),null);assert.equal(request.headers.get('x-opax-ask-internal'),null);
      assert.equal(local[0].caller.ms,82_000);assert.ok(local[0].caller.deadline>=before+82_000&&local[0].caller.deadline<=Date.now()+82_000);
    }
    controller.abort();assert.equal(request.signal.aborted,true);
  }
});

test('the budget header is trusted only with the internal secret, and counted from arrival',async()=>{
  const secret='k'.repeat(40),req=headers=>new Request('https://opax.test/api/ask',{method:'POST',headers});
  assert.equal(await trustedCaller(req({'x-opax-ask-budget-ms':'30000'}),secret),undefined);
  assert.equal(await trustedCaller(req({'x-opax-ask-budget-ms':'30000','x-opax-ask-internal':'k'.repeat(39)}),secret),undefined);
  assert.equal(await trustedCaller(req({'x-opax-ask-budget-ms':'30000','x-opax-ask-internal':secret}),undefined),undefined);
  assert.equal(await trustedCaller(req({'x-opax-ask-budget-ms':'30000','x-opax-ask-internal':'short'}),'short'),undefined,'a short secret is never accepted');
  assert.equal(await trustedCaller(req({'x-opax-ask-internal':secret}),secret),undefined);
  assert.deepEqual(await trustedCaller(req({'x-opax-ask-budget-ms':'30000','x-opax-ask-internal':secret}),secret,1_000),{deadline:31_000,ms:30_000});
  assert.equal(shortenedCaller(undefined),false);assert.equal(shortenedCaller({ms:82_000,deadline:0}),true);assert.equal(shortenedCaller({ms:150_000,deadline:0}),false);
});

test('the provider hanging up aborts the Ask run',async()=>{
  let seen;
  const f=fixture({ask:(input,sessionId,signal)=>{seen=signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}});
  const sid=await f.live(),hangup=new AbortController();
  const pending=f.call('tools/ask_opax',{session_id:sid,question:'Who is the highest paid agency head?'},undefined,hangup.signal);
  while(!seen) await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(seen.aborted,false);
  hangup.abort(new DOMException('Provider closed the request','AbortError'));
  const response=await pending;
  assert.equal(seen.aborted,true);
  assert.equal(response.status,200);assert.match((await response.json()).spoken_answer,/could not finish/);
  f.db.close();
});

test('a caller budget only shortens Ask, and when it runs short Ask returns what research gathered',()=>{
  assert.equal(callerBudgetMs(null),undefined);assert.equal(callerBudgetMs('soon'),undefined);assert.equal(callerBudgetMs('-5'),undefined);
  assert.equal(callerBudgetMs('82000'),82_000);assert.equal(callerBudgetMs('5'),1_000);assert.equal(callerBudgetMs('999999999'),150_000);
  assert.equal(fallbackAllowanceMs(undefined,0),90_000);
  assert.equal(fallbackAllowanceMs(100_000,70_000),30_000);
  assert.equal(fallbackAllowanceMs(100_000,95_000),5_000);assert.ok(fallbackAllowanceMs(100_000,95_000)<ASK_FALLBACK_FLOOR_MS);
  assert.equal(gatheredPayload(undefined),null);assert.equal(gatheredPayload({sources:[]}),null);
  const research={mode:'loop',rounds:2,trail:[],failure:'timeout',sources:[{title:'Example Office Determination 2025',url:'https://opax.com.au/doc/legal-700001',kind:'legal',date:'2025-07-01'},{title:'Robin Example — PAY — 2025-02-05',url:'https://opax.com.au/doc/speech-800003',kind:'speech',speaker:'EXAMPLE, Robin'}]};
  const gathered=gatheredPayload(research);
  assert.equal(gathered.partial,true);assert.equal(gathered.answer,'');assert.equal(gathered.sources.length,2);
  const voiced=askOpaxResult(gathered,'https://opax.test');
  assert.match(voiced.spoken_answer,/^I ran out of time to write a full answer, but the research found 2 records on this\./);
  assert.doesNotMatch(voiced.spoken_answer,/could not find|no record/i);
  assert.deepEqual(voiced.sources.map(s=>[s.type,s.title,s.date]),[['Legislation','Example Office Determination 2025','2025-07-01'],['Speech','Robin Example: Pay','2025-02-05']]);
});

// A stand-in for the ElevenLabs agents and tools API, in memory.
function provider({prompt='Old prompt',failAgentPatches=0,padPrompt=false,extraTools=[]}={}){
  const config=loadConfig(),origin='https://staging.opax.com.au';
  const [search]=renderTools(config,{origin,secretId:'secret_live'}).filter(t=>t.name==='search_records');
  const tools=new Map([['tool_search',{...search,description:'Old description'}],['tool_end',{name:'end_call',type:'system'}],...extraTools]);
  const agent={agent_id:'agent_x',conversation_config:{agent:{prompt:{prompt,llm:'example-llm',tool_ids:['tool_search','tool_end']}}}};
  const calls=[];let next=1;
  const call=async(method,path,body)=>{
    calls.push(method+' '+path);
    const url=new URL('https://api.test'+path),tool=/^\/v1\/convai\/tools\/(.+)$/.exec(url.pathname);
    if(url.pathname==='/v1/convai/agents/agent_x'&&method==='GET') return structuredClone(agent);
    if(url.pathname==='/v1/convai/agents/agent_x'&&method==='PATCH'){
      if(failAgentPatches-->0) throw new Error('PATCH /v1/convai/agents/agent_x -> 500: unavailable');
      const p=structuredClone(body.conversation_config.agent.prompt);agent.conversation_config.agent.prompt={...p,prompt:padPrompt?p.prompt+'  \r\n':p.prompt};return {};
    }
    if(url.pathname==='/v1/convai/tools'&&method==='GET') return {tools:[...tools].filter(([,c])=>c.name.startsWith(url.searchParams.get('search'))).map(([id,c])=>({id,tool_config:structuredClone(c)})),has_more:false};
    if(url.pathname==='/v1/convai/tools'&&method==='POST'){const id='tool_new_'+next++;tools.set(id,{...structuredClone(body.tool_config),provider_default:1});return {id}}
    if(tool&&method==='GET') return {id:tool[1],tool_config:structuredClone(tools.get(tool[1]))};
    if(tool&&method==='PATCH'){tools.set(tool[1],{...structuredClone(body.tool_config),provider_default:1});return {}}
    throw new Error('unexpected '+method+' '+path);
  };
  return {agent,tools,calls,call,origin};
}
const quiet=()=>{const lines=[];return {lines,log:line=>lines.push(String(line))}};

test('agent sync: a dry run reads only; the plan matches attached tools by name',async()=>{
  const p=provider(),out=quiet();
  assert.equal(await run({agent:'agent_x',origin:p.origin},{call:p.call,log:out.log,backupDir:mkdtempSync(join(tmpdir(),'opax-voice-backup-'))}),0);
  assert.ok(p.calls.every(c=>c.startsWith('GET ')),p.calls.join('\n'));
  const text=out.lines.join('\n');
  assert.match(text,/create ask_opax/);assert.match(text,/update search_records \(tool_search\)/);assert.match(text,/keep   end_call/);assert.match(text,/Dry run: nothing changed/);
  assert.deepEqual(parseArgs(['--agent','agent_x']),{apply:false,agent:'agent_x'});
  assert.deepEqual(parseArgs(['--agent','agent_x','--apply','--secret-id','s1','--restore','/tmp/b.json']),{apply:true,agent:'agent_x',secretId:'s1',restore:'/tmp/b.json'});
  assert.throws(()=>parseArgs(['--force']));assert.throws(()=>parseArgs(['--agent']));
  assert.deepEqual(differences({a:{b:1}},{a:{b:1,c:2}}),[]);
  assert.ok(samePrompt('a\nb','a  \r\nb\n'));assert.ok(!samePrompt('a b','a  b'));
  assert.equal(planSync(loadConfig(),{conversation_config:{agent:{prompt:{}}}},[],{origin:p.origin}).problems.length,1);
});

test('agent sync --apply backs up first, attaches the tools, then re-checks to in sync; restore puts it back',async()=>{
  const p=provider({padPrompt:true}),out=quiet(),dir=mkdtempSync(join(tmpdir(),'opax-voice-backup-'));
  assert.equal(await run({agent:'agent_x',origin:p.origin,apply:true},{call:p.call,log:out.log,backupDir:dir}),0,out.lines.join('\n'));
  const [file]=readdirSync(dir);assert.match(file,/^agent_x-.+\.json$/);
  assert.equal(statSync(join(dir,file)).mode&0o777,0o600);
  const backup=JSON.parse(readFileSync(join(dir,file),'utf8'));
  assert.equal(backup.agent.conversation_config.agent.prompt.prompt,'Old prompt');assert.equal(backup.attached.length,2);
  const text=out.lines.join('\n');
  assert.ok(text.includes(join(dir,file)));assert.doesNotMatch(text,/saved_at|"conversation_config"/);
  assert.match(text,/--restore /);assert.match(text,/Check after apply/);assert.match(text,/In sync\./);
  // Writes come after the backup, tools before the agent.
  const writes=p.calls.filter(c=>!c.startsWith('GET '));
  assert.equal(writes.at(-1),'PATCH /v1/convai/agents/agent_x');assert.equal(writes.filter(c=>c==='POST /v1/convai/tools').length,7);
  const ids=p.agent.conversation_config.agent.prompt.tool_ids;
  assert.equal(ids.length,9);assert.ok(ids.includes('tool_search')&&ids.includes('tool_end'));
  assert.equal(p.agent.conversation_config.agent.prompt.llm,'example-llm');
  // Restore: a dry run, then the agent and the updated tool as they were.
  const dry=quiet();
  assert.equal(await run({agent:'agent_x',origin:p.origin,restore:join(dir,file)},{call:p.call,log:dry.log,backupDir:dir}),0);
  assert.match(dry.lines.join('\n'),/prompt and tool_ids: restore[\s\S]*restore search_records \(tool_search\): description[\s\S]*detach tool_new_1/);
  const undo=quiet();
  assert.equal(await run({agent:'agent_x',origin:p.origin,restore:join(dir,file),apply:true},{call:p.call,log:undo.log,backupDir:dir}),0,undo.lines.join('\n'));
  assert.deepEqual(p.agent.conversation_config.agent.prompt.tool_ids,['tool_search','tool_end']);
  assert.ok(samePrompt(p.agent.conversation_config.agent.prompt.prompt,'Old prompt'));
  assert.equal(p.tools.get('tool_search').description,'Old description');
  assert.equal(readdirSync(dir).length,2);
});

test('agent sync: a failed agent update says what was left, and a re-run reuses the tools it created',async()=>{
  const p=provider({failAgentPatches:1}),dir=mkdtempSync(join(tmpdir(),'opax-voice-backup-'));
  await assert.rejects(run({agent:'agent_x',origin:p.origin,apply:true},{call:p.call,log:()=>{},backupDir:dir}),error=>{
    assert.match(error.message,/Agent update failed[\s\S]*agent itself is unchanged[\s\S]*Created, not attached: ask_opax tool_new_1;[\s\S]*Updated in place[\s\S]*search_records tool_search[\s\S]*--restore/);
    return true;
  });
  assert.deepEqual(p.agent.conversation_config.agent.prompt.tool_ids,['tool_search','tool_end']);
  const posts=p.calls.filter(c=>c==='POST /v1/convai/tools').length,out=quiet();
  assert.equal(await run({agent:'agent_x',origin:p.origin,apply:true},{call:p.call,log:out.log,backupDir:dir}),0,out.lines.join('\n'));
  assert.equal(p.calls.filter(c=>c==='POST /v1/convai/tools').length,posts,'no duplicate tools');
  assert.match(out.lines.join('\n'),/same   ask_opax \(tool_new_1, in workspace, not attached\)/);
  assert.ok(p.agent.conversation_config.agent.prompt.tool_ids.includes('tool_new_1'));
});

test('agent sync never reuses another environment\'s tool and fails the check when the provider differs',async()=>{
  const config=loadConfig();
  const [prodAsk]=renderTools(config,{origin:'https://opax.com.au',secretId:'secret_live'}).filter(t=>t.name==='ask_opax');
  const p=provider({extraTools:[['tool_prod_ask',prodAsk]]}),out=quiet();
  const state={agent:p.agent,attached:[],workspace:[{id:'tool_prod_ask',tool_config:prodAsk}]};
  assert.equal(planSync(config,state.agent,state.attached,{origin:p.origin,workspace:state.workspace,secretId:'s'}).tools.find(t=>t.name==='ask_opax').action,'create');
  // A provider that silently drops a field leaves the re-check out of sync: non-zero exit.
  const drop={...p,call:async(method,path,body)=>{if(method==='POST'&&path==='/v1/convai/tools'){const {pre_tool_speech,...rest}=body.tool_config;return p.call(method,path,{tool_config:rest})}return p.call(method,path,body)}};
  assert.equal(await run({agent:'agent_x',origin:p.origin,apply:true},{call:drop.call,log:out.log,backupDir:mkdtempSync(join(tmpdir(),'opax-voice-backup-'))}),1);
  assert.match(out.lines.join('\n'),/NOT IN SYNC after apply/);
  assert.ok(!p.agent.conversation_config.agent.prompt.tool_ids.includes('tool_prod_ask'));
});

test('agent sync refuses to apply when an attached tool of a configured name posts to another environment',async()=>{
  const config=loadConfig();
  const [prodSearch]=renderTools(config,{origin:'https://opax.com.au',secretId:'secret_prod'}).filter(t=>t.name==='search_records');
  const p=provider();p.tools.set('tool_search',prodSearch);
  const out=quiet(),dir=mkdtempSync(join(tmpdir(),'opax-voice-backup-'));
  assert.equal(await run({agent:'agent_x',origin:p.origin,apply:true,secretId:'secret_stage'},{call:p.call,log:out.log,backupDir:dir}),1);
  assert.match(out.lines.join('\n'),/PROBLEM search_records \(tool_search\) is attached but posts to https:\/\/opax\.com\.au, not https:\/\/staging\.opax\.com\.au\. It may be another environment's tool; apply refused\./);
  assert.ok(p.calls.every(c=>c.startsWith('GET ')),'no writes');assert.equal(readdirSync(dir).length,0,'no backup either');
  assert.equal(p.tools.get('tool_search').api_schema.url,'https://opax.com.au/api/voice/tools/search_records');
  // The end_call system tool and tools of other names never raise it.
  assert.ok(!out.lines.join('\n').includes('end_call (tool_end) is attached but'));
});

test('agent sync takes the tool secret only from this environment\'s tools',()=>{
  const config=loadConfig(),origin='https://staging.opax.com.au',agent={conversation_config:{agent:{prompt:{prompt:'x',tool_ids:[]}}}};
  const [prodAsk]=renderTools(config,{origin:'https://opax.com.au',secretId:'secret_prod'}).filter(t=>t.name==='ask_opax');
  const [stageAsk]=renderTools(config,{origin,secretId:'secret_stage'}).filter(t=>t.name==='ask_opax');
  const onlyProd=planSync(config,agent,[],{origin,workspace:[{id:'tool_prod',tool_config:prodAsk}]});
  assert.equal(onlyProd.secret_id,null);assert.match(onlyProd.problems.join('\n'),/No tool secret id/);
  assert.equal(planSync(config,agent,[],{origin,workspace:[{id:'tool_prod',tool_config:prodAsk},{id:'tool_stage',tool_config:stageAsk}]}).secret_id,'secret_stage');
  assert.equal(planSync(config,{conversation_config:{agent:{prompt:{tools:[prodAsk]}}}},[],{origin}).secret_id,null,'inline tools too');
  assert.equal(planSync(config,agent,[],{origin,secretId:'chosen',workspace:[{id:'tool_prod',tool_config:prodAsk}]}).secret_id,'chosen');
});
