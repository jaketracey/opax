import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'opax-summary-test-'));
await build({entryPoints:[new URL('../src/search-summary.ts',import.meta.url).pathname,new URL('../src/ask-evidence.ts',import.meta.url).pathname],outdir:dir,bundle:true,platform:'node',format:'esm'});
const summary=await import(pathToFileURL(join(dir,'search-summary.js')));
const {stripListingBoilerplate,evidenceExcerpt}=await import(pathToFileURL(join(dir,'ask-evidence.js')));
const rows=[{slug:'speech-1',title:'Agricultural research',speaker:'Example MP',date:'2000-10-04',kind:'speech',snippet:'Agricultural research and development increased by 10 per cent under the programme. The speaker described investing in rural production.'},{slug:'award-2',title:'Local facilities',kind:'grant_award',href:'/money/grants?open=award-2#record',snippet:'A published grant award of $250,000 supported local facilities in the shire. This entry does not establish a payment.'}];
const sources=summary.summarySources(rows);
const draft=()=>({points:[{text:'The speaker described a 10 per cent increase in agricultural research and development.',citations:[{id:'s1',quote:'Agricultural research and development increased by 10 per cent under the programme.'}]}]});
test('summary citations carry exact server record links and original supporting excerpts',()=>{
 const output=summary.parseSearchSummary(JSON.stringify(draft()),sources);
 assert.equal(output.sources[0].href,'/doc/speech-1');assert.equal(output.sources[0].evidence[0],draft().points[0].citations[0].quote);
 const grant={points:[{text:'The published grant award supported local facilities in the shire.',citations:[{id:'s2',quote:'A published grant award of $250,000 supported local facilities in the shire.'}]}]};
 assert.equal(summary.parseSearchSummary(JSON.stringify(grant),sources).sources[0].href,'/money/grants?open=award-2#record');
});
test('structured record titles are source evidence and whole-dollar formatting preserves the amount',()=>{
 const records=summary.summarySources([{slug:'catalog-1',kind:'grant',href:'/money/grants?open=award-1',title:'Lismore Regional Sports Hub Oakes and Crozier Ovals - Stage 2',snippet:'$5,999,000.00. Department of Infrastructure. Published grant award.'}]);
 const output=summary.parseSearchSummary(JSON.stringify({points:[{text:'The Lismore sports hub project has a published grant award of $5,999,000.',citations:[{id:'s1',quote:records[0].title},{id:'s1',quote:records[0].snippet}]}]}),records);
 assert.equal(output.sources[0].evidence.length,2);assert.equal(output.points.length,1);
});
test('invented citations, unsupported quotes and new amounts fail closed',()=>{
 for(const change of [d=>d.points[0].citations[0].id='s99',d=>d.points[0].citations[0].quote='An invented claim about the programme.',d=>d.points[0].text='The speaker described a 90 per cent increase in agricultural research.',d=>d.points[0].text='The record says "Funding was doubled" for research.']){
  const data=draft();change(data);assert.equal(summary.parseSearchSummary(JSON.stringify(data),sources),null);
 }
});
test('grant awards cannot become claims of payment or completed work',()=>{
 const records=summary.summarySources([rows[1]]);
 for(const verb of ['received','paid','spent','funded','delivered','completed']) {
  assert.equal(summary.parseSearchSummary(JSON.stringify({points:[{text:`The grant ${verb} the local facilities project in the shire.`,citations:[{id:'s1',quote:records[0].snippet}]}]}),records),null);
 }
});
test('an unsupported speaker attribution is dropped without discarding other grounded points',()=>{
 const other={...rows[0],slug:'speech-3',speaker:'Another MP',snippet:'Another MP discussed a different agriculture programme in the same debate.'};
 const evidence=summary.summarySources([...rows,other]);
 const good=draft().points[0],bad={text:'Another MP described increasing agricultural research funding.',citations:good.citations};
 const output=summary.parseSearchSummary(JSON.stringify({points:[bad,good]}),evidence);
 assert.equal(output.points.length,1);assert.equal(output.points[0].text,good.text);assert.equal(output.sources.length,1);
});
test('briefs, generated records, duplicate links and unsafe destinations cannot become source evidence',()=>{
 const candidates=[...rows,rows[0],{...rows[0],slug:'da-summary-1'},{...rows[0],slug:'speech-2',snippet:'',brief:'Machine generated content'},...['https://evil.test/doc/1','//evil.test/doc/1','/doc/../api/private','/api/private'].map(href=>({...rows[0],href}))];
 assert.equal(summary.summarySources(candidates).length,2);
});
test('malformed and nested markup cannot survive source text cleanup',()=>{
 const [source]=summary.summarySources([{...rows[0],title:'<scr<script>ipt>Record</script>',snippet:'<mark>Agricultural research</mark> and development remain in the original passage. <script'}]);
 assert.doesNotMatch(source.title,/[<>]/);assert.doesNotMatch(source.snippet,/[<>]/);
 assert.match(source.snippet,/Agricultural research and development/);
});
test('listing boilerplate is removed without removing substantive grant data or other links',()=>{
 const url='http://www.dpmc.gov.au/accountability/grants/index.cfm';
 for(const value of [url,`[${url}](${url})`,`<${url}>`]){
  const input=`A grant award was $250,000. The full listing can be found at ${value}. More projects were proposed.`;
  assert.equal(stripListingBoilerplate(input),'A grant award was $250,000.  More projects were proposed.');
  assert.doesNotMatch(evidenceExcerpt(input,'grant award').text,/full listing|dpmc/);
 }
 assert.equal(stripListingBoilerplate('An audit is at https://example.gov.au/report.pdf.'),'An audit is at https://example.gov.au/report.pdf.');
 assert.equal(summary.summarySources([{...rows[0],snippet:`The full listing can be found at ${url}`}]).length,0);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const clean=runInNewContext(app.slice(app.indexOf('function cleanPassage('),app.indexOf('\nfunction ',app.indexOf('function cleanPassage(')+1))+';cleanPassage');
 assert.doesNotMatch(clean(`Grant award: $250,000. The full listing can be found at [${url}](${url})`),/listing|dpmc/);
});
test('oversized or malformed model output is discarded',async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(100000))},cancel(){cancelled=true}}));
 assert.equal(await summary.summaryModelAnswer(response),null);assert.equal(cancelled,true);
 assert.equal(summary.parseSearchSummary('Not JSON',sources),null);
});
const index=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const code=ts.transpileModule(index.slice(index.indexOf('async function apiSearchSummary('),index.indexOf('// Narration is generated')), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({empty=false,invalid=false,denied=false}={}){
 const calls=[],cache=new Map();
 const ctx={...summary,URL,Request,Response,AbortSignal,Error,json:(x,status=200)=>Response.json(x,{status}),
  apiUnifiedSearch:async(req,url)=>{calls.push({search:url.href});return Response.json({results:empty?[]:rows,index_version:'v1'})},
  cacheRequest:(kind,key)=>new Request('https://cache.test/'+kind+'/'+key),sha256Hex:async s=>createHash('sha256').update(s).digest('hex'),
  readGenerationCache:async (_env,_ctx,key)=>cache.get(key.url)?.clone(),storeGenerationCache:(_env,_ctx,key,res)=>cache.set(key.url,res.clone()),withCacheStatus:res=>res,
  rateLimited:async()=>denied?Response.json({error:'Limited'},{status:429}):null,
  kbFetch:async(_env,path,options)=>{calls.push({path,body:options.body});return Response.json({answer:invalid?'invalid':JSON.stringify(draft())})}
 };
 const fn=runInNewContext(code+';apiSearchSummary',ctx);
 return {calls,run:async params=>{const u=new URL('https://opax.test/api/search-summary?'+new URLSearchParams({q:'agriculture',kind:'all',...params}));return fn(new Request(u),u,{CACHE_EPOCH:'v1'}, {})}};
}
test('summary uses the actual filtered search with canonical relevance order and caches by scope',async()=>{
 const f=fixture(),params={party:'Nationals',topic:'agriculture',from:'1998',to:'2002',state:'federal',mode:'keyword',speaker:'Example MP',page:'5',sort:'oldest'};
 const result=await f.run(params);assert.equal(result.status,200);
 const query=new URL(f.calls[0].search).searchParams;
 for(const k of ['party','topic','from','to','state','mode','speaker','kind'])assert.equal(query.get(k),params[k]||'all');
 assert.equal(query.get('page'),'1');assert.equal(query.get('sort'),'relevance');
 assert.equal(f.calls[1].path,'/ask');assert.equal(f.calls[1].body.generative_model,'openai-compatible');
 await f.run({...params,page:'1',sort:'newest'});assert.equal(f.calls.filter(c=>c.path).length,1);
 await f.run({...params,from:'1999'});assert.equal(f.calls.filter(c=>c.path).length,2);
});
test('empty search, quota and provider failure never fabricate a summary',async()=>{
 const empty=fixture({empty:true});assert.equal((await (await empty.run()).json()).status,'empty');assert.equal(empty.calls.length,1);
 assert.equal((await fixture({denied:true}).run()).status,429);
 const invalid=fixture({invalid:true});assert.equal((await invalid.run()).status,502);await invalid.run();assert.equal(invalid.calls.filter(c=>c.path).length,4,'Failures are not cached');
});
test.after(()=>rmSync(dir,{recursive:true,force:true}));

test('the point stream yields each object as it closes, across chunk boundaries and braces inside quotes',()=>{
 const s=new summary.SummaryPointStream();
 const whole='```json\n{"points":[{"text":"First point about {braces} in text.","citations":[{"id":"s1","quote":"a \\"quoted\\" excerpt with } inside"}]},\n {"text":"Second point.","citations":[{"id":"s2","quote":"x"}]}]}\n```';
 const out=[];
 for(let i=0;i<whole.length;i+=7) out.push(...s.push(whole.slice(i,i+7)));
 assert.equal(out.length,2);assert.equal(out[0].text,'First point about {braces} in text.');assert.equal(out[0].citations[0].quote,'a "quoted" excerpt with } inside');assert.equal(out[1].text,'Second point.');
 assert.deepEqual(new summary.SummaryPointStream().push('{"points":[{"text":"unfinished'),[]);
});

test('the streamed overview sends each validated point as it lands, then the cached payload as done',async()=>{
 const calls=[],cache=new Map();
 const answer=JSON.stringify({points:[...draft().points,{text:'An invented claim that must be dropped.',citations:[{id:'s1',quote:'not in the record at all, really not'}]}]});
 const chunks=[];for(let i=0;i<answer.length;i+=11) chunks.push(JSON.stringify({item:{type:'answer',text:answer.slice(i,i+11)}})+'\n');
 chunks.unshift(JSON.stringify({item:{type:'reasoning',text:''}})+'\n');
 const ctx={...summary,URL,Request,Response,AbortSignal,Error,TransformStream,TextEncoder,TextDecoder,JSON,json:(x,status=200)=>Response.json(x,{status}),
  SSE_HEADERS:{'content-type':'text/event-stream; charset=utf-8'},ragBase:()=>'https://rag.test/kb',
  fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});const enc=new TextEncoder();return new Response(new ReadableStream({start(c){for(const ch of chunks)c.enqueue(enc.encode(ch));c.close()}}),{status:200})},
  apiUnifiedSearch:async()=>Response.json({results:rows,index_version:'v1'}),
  cacheRequest:(kind,key)=>new Request('https://cache.test/'+kind+'/'+key),sha256Hex:async s=>createHash('sha256').update(s).digest('hex'),
  readGenerationCache:async(_e,_c,key)=>cache.get(key.url)?.clone(),storeGenerationCache:(_e,_c,key,res)=>cache.set(key.url,res.clone()),withCacheStatus:res=>res,
  rateLimited:async()=>null,kbFetch:async()=>{throw new Error('the streamed path must not fall back to a synchronous generation when points validated')}};
 const fn=runInNewContext(code+';apiSearchSummary',ctx);
 const pending=[];const u=new URL('https://opax.test/api/search-summary?q=agriculture&kind=all&stream=1');
 const res=await fn(new Request(u),u,{CACHE_EPOCH:'v1'},{waitUntil:p=>pending.push(p)});
 assert.match(res.headers.get('content-type'),/text\/event-stream/);
 const text=await res.text();await Promise.all(pending);
 const events=text.split('\n\n').filter(Boolean).map(b=>{const m=b.match(/^event: (\w+)\ndata: ([\s\S]*)$/);return {e:m[1],d:JSON.parse(m[2])}});
 assert.deepEqual(events.map(e=>e.e),['point','done']);
 assert.equal(events[0].d.text,draft().points[0].text);assert.deepEqual(events[0].d.source_ids,['s1']);
 assert.equal(events[1].d.status,'ready');assert.equal(events[1].d.points.length,1);assert.equal(events[1].d.sources[0].href,'/doc/speech-1');
 assert.equal(calls[0].url,'https://rag.test/kb/ask');assert.equal(calls[0].body.generative_model,'openai-compatible');
 assert.equal(cache.size,1,'the done payload is cached like the synchronous answer');
 const hit=await fn(new Request(u),u,{CACHE_EPOCH:'v1'},{waitUntil:()=>{}});
 assert.doesNotMatch(hit.headers.get('content-type')||'',/text\/event-stream/);assert.equal((await hit.json()).status,'ready');
});
