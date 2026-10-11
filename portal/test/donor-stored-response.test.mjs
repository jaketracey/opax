import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {privacySourceGraphs} from '../../scripts/withhold_donor_assets.mjs';
import {donorPrivacyIndex,donorNameWithheld,foldDonorName} from '../public/donor-entity.js';
const compiled=await build({entryPoints:[new URL('../src/donor-stored-response.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {sanitiseStoredResponse}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const graphs=privacySourceGraphs(),index=donorPrivacyIndex(graphs),registry=JSON.parse(readFileSync(new URL('../src/donor-withheld.json',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const hidden=graphs.flatMap(g=>g.nodes).find(n=>n.kind==='donor'&&donorNameWithheld(index,n.label)&&!registry.names[hash(foldDonorName(n.label))]?.exempt);

test('persisted JSON is withheld on read and stale content headers are discarded',async()=>{
 assert.ok(hidden);const original={title:`${hidden.label} to the party`,amount:123,years:[2025]};
 const response=await sanitiseStoredResponse(Response.json(original,{headers:{etag:'raw-etag','content-length':'123','cache-control':'max-age=60'}}));
 const safe=await response.json();assert.ok(!safe.title.includes(hidden.label),'persisted identity remains');assert.match(safe.title,/Donor \d+ \(name withheld\)/);
 assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('content-length'),null);assert.equal(response.headers.get('cache-control'),'max-age=60');assert.equal(safe.amount,original.amount);assert.deepEqual(safe.years,original.years);
});
test('invalid or oversized persisted JSON fails closed without waiting for a tee branch',async()=>{
 const invalid=await sanitiseStoredResponse(new Response('{',{headers:{'content-type':'application/json'}}));assert.equal(invalid.status,503);
 let stopped=false;const oversized=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4_000_001));},cancel(){stopped=true;}}),{headers:{'content-type':'application/json'}});
 let timer;const guarded=await Promise.race([sanitiseStoredResponse(oversized),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Persisted guard did not finish')),2000)})]);clearTimeout(timer);
 assert.equal(guarded.status,503);assert.equal(guarded.headers.get('cache-control'),'no-store');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(stopped,true);
});
test('safe JSON and non-JSON responses keep their existing response contract',async()=>{
 for(const response of [Response.json({status:'ready',amount:1},{headers:{etag:'safe-etag'}}),new Response('image-bytes',{headers:{'content-type':'image/png'}})])assert.equal(await sanitiseStoredResponse(response),response);
});

test('combined public guards preserve event streams without reading or buffering them',async()=>{
 const bundled=await build({entryPoints:[new URL('../src/sa-hansard.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
 const {saPublicResponse}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 let reads=0;const body=new ReadableStream({pull(){reads++;}},{highWaterMark:0});
 const response=new Response(body,{headers:{'content-type':'text/event-stream','x-stream-fixture':'preserved'}});
 const read=async()=>{throw Error('Stream guard must not retrieve records')};
 const result=await sanitiseStoredResponse(await saPublicResponse(await sanitiseStoredResponse(response),'false',read));
 assert.equal(result,response);assert.equal(result.body,response.body);assert.equal(reads,0);assert.equal(result.headers.get('x-stream-fixture'),'preserved');await body.cancel();
});

test('public community prose is withheld while member identity fields remain intact',async()=>{
 const compiled=await build({entryPoints:[new URL('../src/community-public-content.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
 const {publicCommunityContent}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const payload={member:{id:'member-fixture',display_name:'Reader'},threads:[{title:`${hidden.label} to the party`,body:`${hidden.label} to a council`,source_path:'/subject/donor/'+encodeURIComponent(hidden.label)}],lists:[{description:hidden.label,items:[{title:hidden.label,note:hidden.label,path:'/subject/donor/'+encodeURIComponent(hidden.label)}]}]};
 const result=publicCommunityContent(payload);assert.ok(!JSON.stringify(result).includes(hidden.label),'stored public prose remains named');assert.deepEqual(result.member,payload.member);assert.match(result.lists[0].items[0].path,/Donor%20/);
});
