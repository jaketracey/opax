// Manual staging check; never runs under the unit-test glob. No email is sent.
// 1. node test/voice-staging-smoke.mjs prepare /tmp/opax-voice-smoke-<unique>
// 2. Apply setup.sql with the staging COMMUNITY_DB binding.
// 3. node test/voice-staging-smoke.mjs run <directory> [--tool-secret-file <file>]
// 4. Always apply cleanup.sql, then remove the private temporary directory.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import WebSocket from 'ws';

const origin='https://staging.opax.com.au';
const [mode,requestedDirectory,...options]=process.argv.slice(2);
if(!requestedDirectory || !['prepare','run'].includes(mode)) throw new Error('Use prepare or run followed by a private temporary directory.');
const directory=resolve(requestedDirectory), stateFile=join(directory,'state.json');
function save(value){writeFileSync(stateFile,JSON.stringify(value),{mode:0o600});chmodSync(stateFile,0o600)}

if(mode==='prepare'){
  mkdirSync(directory,{mode:0o700});
  const timestamp=Math.floor(Date.now()/1000), memberId=randomUUID(), token=randomBytes(32).toString('base64url'), balanceId=randomUUID(), old=timestamp-70*86400;
  const state={origin,memberId,token,expiresAt:timestamp+1200};save(state);
  const tokenHash=createHash('sha256').update(token).digest('hex');
  const setup=`INSERT INTO members(id,email,display_name,created_at) VALUES('${memberId}','voice-smoke-${memberId}@example.invalid','Voice staging check',${timestamp});
INSERT INTO member_sessions(token_hash,member_id,expires_at,created_at) VALUES('${tokenHash}','${memberId}',${state.expiresAt},${timestamp});
INSERT INTO voice_sessions(id,member_id,state,reserved_seconds,charged_seconds,created_at,expires_at,started_at,closed_at) VALUES('${balanceId}','${memberId}','closed',510,510,${old},${old+510},${old},${old+510});
`;
  // Old synthetic usage caps this live check at ninety seconds while avoiding
  // a reservation against the current monthly pool before the check begins.
  writeFileSync(join(directory,'setup.sql'),setup,{mode:0o600});
  writeFileSync(join(directory,'cleanup.sql'),`DELETE FROM voice_sessions WHERE member_id='${memberId}';
DELETE FROM member_sessions WHERE member_id='${memberId}';
DELETE FROM members WHERE id='${memberId}' AND email='voice-smoke-${memberId}@example.invalid';
`,{mode:0o600});
  console.log(JSON.stringify({prepared:true,setup_sql:join(directory,'setup.sql'),cleanup_sql:join(directory,'cleanup.sql')}));
}else{
  const state=JSON.parse(readFileSync(stateFile,'utf8'));
  assert.equal(state.origin,origin,'This check only runs against staging.');
  assert.match(state.memberId,/^[a-f0-9-]{36}$/);assert.match(state.token,/^[\w-]{43}$/);
  assert.ok(state.expiresAt>Math.floor(Date.now()/1000),'Prepare a new short-lived smoke account.');
  const cookie='__Host-opax_session='+state.token;
  const secretIndex=options.indexOf('--tool-secret-file');
  const handshakeOnly=options.includes('--handshake-only');
  const secret=secretIndex>=0?readFileSync(options[secretIndex+1],'utf8').trim():null;
  if(secret!==null)assert.ok(secret.length>=32,'Tool secret file is incomplete.');
  const report={staging:true,checks:{},tool_checks:[],socket:{metadata:false,greeting:false,audio:false,provider_tool:false},clean_close:false,reconciled:false};
  let socket,session,stage='status',completed=false;
  const api=async(path,{method='GET',data,headers={}}={})=>{
    const response=await fetch(origin+'/api/voice/'+path,{method,headers:{cookie,origin,...(data?{'content-type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
    return {status:response.status,data:await response.json()};
  };
  try{
    const status=await api('status');assert.equal(status.status,200);assert.equal(status.data.enabled,true);assert.equal(status.data.signed_in,true);assert.equal(status.data.remaining_seconds,90);report.checks.signed_in=true;
    const cross=await api('start',{method:'POST',data:{},headers:{origin:'https://invalid.example'}});assert.equal(cross.status,403);report.checks.cross_origin_refused=true;
    stage='reservation';const start=await api('start',{method:'POST',data:{}});assert.equal(start.status,201);session=start.data;assert.equal(session.remaining_seconds,90);
    const proxyUrl=new URL(session.signed_url);assert.equal(proxyUrl.origin,'wss://staging.opax.com.au');assert.equal(proxyUrl.pathname,'/api/voice/connect');
    state.sessionId=session.session_id;save(state);
    assert.equal((await api('start',{method:'POST',data:{}})).status,409);report.checks.duplicate_start_refused=true;
    assert.equal((await api('tools/corpus_coverage',{method:'POST',data:{session_id:session.session_id}})).status,401);report.checks.tool_without_secret_refused=true;
    stage='websocket';
    const directChecks=async()=>{
      if(!secret)return;
      const call=async(name,args)=>{
        const result=await api('tools/'+name,{method:'POST',data:{session_id:session.session_id,...args},headers:{'x-opax-voice-token':secret}});
        assert.equal(result.status,200,'Tool check failed: '+name);assert.ok(Array.isArray(result.data.sources));assert.match(result.data.source_notice,/untrusted evidence/);
        report.tool_checks.push({name,status:result.status,sources:result.data.sources.length});return result.data;
      };
      const search=await call('search_records',{query:'housing'});
      const slug=search.data?.results?.find(row=>typeof row.slug==='string')?.slug;assert.ok(slug,'Search returned no record identifier.');
      await call('read_record',{slug});
      await call('find_connections',{query:'Canberra'});
      await call('corpus_coverage',{});
      await call('lookup_grants',{query:'housing',jurisdiction:'federal'});
      await call('lookup_topics',{query:'housing'});
      await call('lookup_parties',{query:'Labor'});
    };
    await new Promise((resolveDone,reject)=>{
      let sentQuery=false,directDone=!secret||handshakeOnly;
      const timeout=setTimeout(()=>reject(new Error('Timed out waiting for provider greeting, audio and tool result.')),65000);
      socket=new WebSocket(proxyUrl,['convai'],{headers:{Origin:origin,Cookie:cookie},handshakeTimeout:25000});
      const finish=()=>{if(report.socket.metadata&&(handshakeOnly||(report.socket.greeting&&report.socket.audio&&report.socket.provider_tool&&directDone))){clearTimeout(timeout);completed=true;resolveDone()}};
      socket.on('upgrade',response=>{report.checks.upgrade_101=response.statusCode===101;report.checks.protocol_convai=response.headers['sec-websocket-protocol']==='convai'});
      socket.on('unexpected-response',(_request,response)=>{
        report.handshake_error={http_status:response.statusCode};let body='';
        response.on('data',chunk=>{if(body.length<2000)body+=chunk.toString().slice(0,2000-body.length)});
        response.on('end',()=>{try{const error=JSON.parse(body).error;if(typeof error==='string')report.handshake_error.message=error.replace(/(?:https?|wss?):\/\/\S+/g,'[URL removed]').replace(/[\w-]{40,}/g,'[value removed]').slice(0,250)}catch{}clearTimeout(timeout);reject(new Error('WebSocket upgrade was refused.'))});
      });
      socket.on('open',()=>socket.send(JSON.stringify({type:'conversation_initiation_client_data',conversation_config_override:{conversation:{max_duration_seconds:7200}},dynamic_variables:{opax_session_id:'must-be-replaced-by-server'}})));
      socket.on('message',raw=>{
        try{
          const message=JSON.parse(raw.toString());
          if(message.type==='ping')socket.send(JSON.stringify({type:'pong',event_id:message.ping_event.event_id}));
          if(message.type==='conversation_initiation_metadata'){
            report.socket.metadata=true;
            if(!handshakeOnly)directChecks().then(()=>{directDone=true;finish()},error=>{clearTimeout(timeout);reject(error)});
          }
          if(message.type==='agent_response'&&message.agent_response_event?.agent_response)report.socket.greeting=true;
          if(message.type==='audio'&&message.audio_event?.audio_base_64)report.socket.audio=true;
          const tool=message.agent_tool_response??message.agent_tool_response_full_payload;
          if(tool?.tool_name==='corpus_coverage'&&tool.is_called&&!tool.is_error)report.socket.provider_tool=true;
          if(!handshakeOnly&&report.socket.metadata&&report.socket.greeting&&!sentQuery){sentQuery=true;socket.send(JSON.stringify({type:'user_message',text:'Please use the corpus_coverage tool now, then tell me the coverage date in one short sentence.'}))}
          finish();
        }catch(error){clearTimeout(timeout);reject(error)}
      });
      socket.on('error',()=>{clearTimeout(timeout);reject(new Error('WebSocket connection failed.'))});
      socket.on('close',(code)=>{report.clean_close=code===1000;if(!completed){clearTimeout(timeout);reject(new Error('WebSocket closed before the smoke checks completed.'))}});
    });
    stage='close';
  }catch{
    report.failure_stage=stage;
  }finally{
    if(socket){
      if(socket.readyState===WebSocket.OPEN){socket.close(1000,'Staging smoke complete');await Promise.race([new Promise(resolveClose=>socket.once('close',resolveClose)),delay(5000)])}
      if(socket.readyState!==WebSocket.CLOSED)socket.terminate();
    }
    if(session){
      try{
        await api('finish',{method:'POST',data:{session_id:session.session_id}});
        for(let i=0;i<10;i++){
          const status=await api('status');
          if(!status.data.active_session){report.reconciled=true;report.remaining_seconds=status.data.remaining_seconds;break}
          await delay(1000);
        }
      }catch{report.reconciled=false}
    }
    report.passed=completed&&report.clean_close&&report.reconciled&&report.checks.upgrade_101&&report.checks.protocol_convai;
    writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify(report));
    console.log(JSON.stringify({cleanup_sql:join(directory,'cleanup.sql'),cleanup_required:true}));
    if(!report.passed)process.exitCode=1;
  }
}
