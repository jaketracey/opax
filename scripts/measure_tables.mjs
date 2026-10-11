import {spawn} from 'node:child_process';
import {readFile,writeFile,open,mkdir} from 'node:fs/promises';
import {once} from 'node:events';
import WebSocket from '../portal/node_modules/ws/index.js';
import assert from 'node:assert/strict';
const root=new URL('../portal/',import.meta.url).pathname,output=new URL('../portal/private/dt-api/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const log=await open(output+'measure-worker.log','w');
const worker=spawn(process.execPath,[root+'node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port','8947','--inspector-port','9231','--log-level','debug','--var','INDEXNOW_ENABLED:false','--var','INDEXNOW_DRY_RUN:true'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'},stdio:['ignore','pipe','pipe']});
let logQueue=Promise.resolve();for(const stream of [worker.stdout,worker.stderr]){let remainder='';stream.on('data',bytes=>{remainder+=bytes;const lines=remainder.split('\n');remainder=lines.pop();for(const line of lines)if(line.includes('handleProxyControllerIncomingMessage {\"type\":\"reloadComplete\"') || line.includes('NEW RUNTIME WEBSOCKET'))logQueue=logQueue.then(()=>log.write(line+'\n'));});}
await writeFile(output+'measure-worker.pid',String(worker.pid));let ws;
try{
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:8947/api/table/missing')).status===404){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Local workerd ready');await logQueue;
 const line=(await readFile(output+'measure-worker.log','utf8')).split('\n').find(l=>l.includes('handleProxyControllerIncomingMessage {"type":"reloadComplete"'));
 const data=JSON.parse(line.slice(line.indexOf('{'))).proxyData;const base=data.userWorkerUrl.protocol+'//'+data.userWorkerUrl.hostname+':'+data.userWorkerUrl.port;
 const targets=await(await fetch('http://127.0.0.1:9231/json/list')).json();const address=new URL(targets[0].webSocketDebuggerUrl);address.hostname='127.0.0.1';ws=new WebSocket(address,{origin:'http://localhost',headers:data.headers});await once(ws,'open');
 let id=0;const pending=new Map();let snapshotChunks=[];ws.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='HeapProfiler.addHeapSnapshotChunk')snapshotChunks.push(m.params.chunk);if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});const timer=setTimeout(()=>{if(pending.has(n)){pending.delete(n);reject(new Error(method+' timed out'));}},180000);timer.unref();ws.send(JSON.stringify({id:n,method,params}));});
 await call('Runtime.enable');await call('HeapProfiler.enable');await call('HeapProfiler.takeHeapSnapshot',{reportProgress:false,exposeInternals:true,captureNumericValue:false});
 const snapshot=JSON.parse(snapshotChunks.join(''));snapshotChunks=[];const fields=snapshot.snapshot.meta.node_fields,step=fields.length,size=fields.indexOf('self_size');let baseline=0;for(let i=size;i<snapshot.nodes.length;i+=step)baseline+=snapshot.nodes[i];snapshot.nodes=[];snapshot.strings=[];
 await call('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:false,includeObjectsCollectedByMinorGC:false});
 await call('Profiler.enable');await call('Profiler.setSamplingInterval',{interval:1000});console.log(JSON.stringify({stage:'profiling',baselineHeapBytes:baseline}));
 const evidence={runtime:'wrangler dev --local / workerd',memoryMethod:'Workerd baseline heap snapshot self_size including native backing objects plus peak live allocation sampling (16 KiB) polled every 20 ms; raw heap snapshots stay in memory and are never written',cpuMethod:'CDP V8 Profiler, 1 ms active V8 sample count excluding (idle); includes allocation sampling overhead; wall includes local D1 execution and streaming',results:[]};
 for(const dataset of ['contracts','grants'])for(const format of ['page','csv']){
  let peak=0,polling=true,samples=0,pollError;
  const poll=(async()=>{while(polling){const {profile}=await call('HeapProfiler.getSamplingProfile');const nodes=[profile.head];let allocated=0;while(nodes.length){const node=nodes.pop();allocated+=node.selfSize;nodes.push(...node.children);}samples++;peak=Math.max(peak,baseline+allocated);await new Promise(r=>setTimeout(r,20));}})().catch(error=>{pollError=error;polling=false;});
  await call('Profiler.start');const start=performance.now();const response=await fetch(base+'/api/table/'+dataset+'?q=a&pageSize=200'+(format==='csv'?'&format=csv':''),{headers:data.headers});assert.equal(response.status,200,dataset+' '+format);
  let bytes=0,total,rows;
  if(format==='page'){const page=await response.json();total=page.total;rows=page.rows.length;}
  else{total=Number(response.headers.get('x-table-total'));rows=Number(response.headers.get('x-table-exported'));for await(const chunk of response.body)bytes+=chunk.length;}
  const wallMs=performance.now()-start;await new Promise(r=>setTimeout(r,1000));const{profile}=await call('Profiler.stop');polling=false;await poll;if(pollError)throw pollError;
  const functions=new Map(profile.nodes.map(n=>[n.id,n.callFrame.functionName]));let cpuUs=0;for(let i=0;i<(profile.samples||[]).length;i++)if(functions.get(profile.samples[i])!=='(idle)')cpuUs+=1000;
  assert.ok(total>50000,'Broad query really matches the dataset');assert.ok(peak>0,'Real workerd heap stats recorded');assert.ok(peak<60*1024*1024,'Worker peak below 60 MiB');
  const result={dataset,format,total,rows,bytes,peakBytes:peak,cpuMs:cpuUs/1000,wallMs,samples};evidence.results.push(result);console.log(JSON.stringify(result));await writeFile(output+'memory-cpu.json',JSON.stringify(evidence,null,2)+'\n');
 }
 // Check the legacy public path is inaccessible through the actual production route.
 assert.equal((await fetch('http://127.0.0.1:8947/table-index/manifest.json')).status,404);
}catch(error){console.error('Local workerd measurement failed:',error.message);process.exitCode=1;}
finally{ws?.close();worker.kill('SIGTERM');await Promise.race([once(worker,'exit'),new Promise(r=>setTimeout(r,5000))]);await logQueue;await log.close();}
