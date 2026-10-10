import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as passage from '../src/passage-text.ts';
import {SA_EXCERPT_LABEL, isSaHansard, saExcerpt, saDisplayRecord, saDisplayPayload} from '../public/sa-hansard.js';
import {saPublicResponse} from '../src/sa-hansard.ts';

const {sa,nonSA} = JSON.parse(readFileSync(new URL('./fixtures/sa-excerpts.json',import.meta.url)));
const count = text => String(text).trim().split(/\s+/).filter(Boolean).length;
const capped = text => assert.ok(count(text) <= 120, `Excerpt has ${count(text)} words`);
const row = {slug:sa.slug,kind:'speech',state:'sa',chamber:'sa_ha',url:sa.url,resource:'r1',snippet:sa.text,cited:true};
const noRead = async () => {throw new Error('Unexpected record fetch');};
const protect = async data => (await saPublicResponse(Response.json(data), 'false', async()=>sa)).json();

test('SA identification uses source or jurisdiction and leaves other record kinds alone',()=>{
  for (const record of [sa,{labels:{source:'sa_hansard'}},{kind:'speech',jurisdiction:'South Australia'}, {slug:sa.slug,metadata:{jurisdiction:'sa'}},{kind:'speech',chamber:'sa_lc'}]) assert.equal(isSaHansard(record),true);
  for (const kind of ['division','bill','bill_text','press_release','grant','person']) assert.equal(isSaHansard({kind,state:'sa'}),false);
});

test('opening, matched, overlong, HTML-cleaned and Unicode passages obey a strict 120-word cap',()=>{
  for (const text of [sa.text,sa.text.replaceAll('.',''), '😀 '+sa.text,passage.normalizePassage('<p>'+sa.text+'</p>')]) capped(saExcerpt(text));
  const opening = saExcerpt(sa.text); assert.match(opening,/statement 0\./); assert.doesNotMatch(opening,/statement 39\./);
  const matched = saExcerpt(sa.text,'statement 30'); capped(matched); assert.match(matched,/statement 30\./); assert.doesNotMatch(matched,/statement 0\./);
  assert.match(matched,/\.\s*…?$/);
  assert.equal(saExcerpt('A short complete sentence.'),'A short complete sentence.');
});

test('resource and iOS JSON carry a capped excerpt, label and existing official URL; machine summary survives',async()=>{
  const result = await protect(sa);
  capped(result.text); assert.equal(result.excerpt,true); assert.equal(result.excerpt_label,SA_EXCERPT_LABEL);
  assert.equal(result.source_url,sa.metadata.source_url); assert.equal(result.url,sa.url);
  assert.equal(result.full_text_available,false); assert.equal(result.summary,sa.summary);
  assert.deepEqual(result.labels,sa.labels); assert.ok(Object.values(result.labels).every(value=>typeof value==='string'));
  assert.equal(result.metadata.source_url,sa.metadata.source_url);
  assert.equal(sa.text.split(' ').length > 120,true);
});

test('the exact true flag restores complete records and all other values fail closed',async()=>{
  for (const flag of [undefined,'false','TRUE','1',true]) capped(saDisplayRecord(sa,flag).text);
  assert.equal(saDisplayRecord(sa,'true'),sa);
  const response = Response.json(sa); assert.equal(await saPublicResponse(response,'true',noRead),response);
});

test('federal, Victorian and Queensland document snapshots are byte-identical',async()=>{
  for (const {snapshot_sha256,...doc} of nonSA) {
    assert.equal(createHash('sha256').update(JSON.stringify(doc)).digest('hex'),snapshot_sha256);
    assert.equal(saDisplayRecord(doc,'false'),doc);
    assert.equal(JSON.stringify(await protect(doc)),JSON.stringify(doc));
  }
});

test('search, person rows, exports, source panels and report passages share the same bounded text',async()=>{
  const result = await protect({results:[row],sources:[{...row,passage:sa.text,quotes:[sa.text],evidence:[sa.text,sa.text]}]});
  for (const source of [...result.results,...result.sources]) {
    capped(source.snippet); assert.equal(source.excerpt_label,SA_EXCERPT_LABEL); assert.equal(source.source_url,sa.url);
    for (const field of ['passage','quotes','evidence']) if(source[field]) for(const text of Array.isArray(source[field])?source[field]:[source[field]]) capped(text);
  }
});

test('search summary supporting evidence is capped in both source and per-point shapes',async()=>{
  const input={points:[{text:'The matching speech discusses regional infrastructure.',source_ids:['s1'],evidence:{s1:[sa.text,sa.text]}}],sources:[{...row,id:'s1',evidence:[sa.text,sa.text]}]};
  const before=JSON.stringify(input), result=await protect(input);
  assert.equal(JSON.stringify(input),before); assert.equal(result.points[0].text,input.points[0].text);
  capped(result.sources[0].evidence.join(' ')); capped(result.points[0].evidence.s1.join(' '));
});

test('summary hrefs resolve originals so long machine paraphrases remain intact',async()=>{
  const text='This machine-written overview describes the recorded discussion and its wider implications for regional planning. '.repeat(10).trim();
  let reads=0;
  const source={id:'s1',href:'/doc/'+sa.slug,kind:'speech',state:'sa',url:sa.url,snippet:sa.text};
  const input={points:[{text,source_ids:['s1']}],sources:[source]};
  const result=await (await saPublicResponse(Response.json(input),'false',async slug=>{assert.equal(slug,sa.slug);reads++;return sa;})).json();
  assert.equal(reads,1);assert.equal(result.points[0].text,text);capped(result.sources[0].snippet);
});

test('Ask quotes and evidence-only answers are capped and citations retain valid Unicode offsets',async()=>{
  for(const answer of [`😀 The speech says “${sa.text}”. Its focus is regional services.`,sa.text]) {
    const input={answer,sources:[row],citations:{'r1/t/body/0-1':[[0,Array.from(answer).length]]},evidence_excerpts:[{resource:'r1',text:sa.text}]};
    const result=await protect(input); capped(result.sources[0].snippet); capped(result.evidence_excerpts[0].text);
    const quote=/“([^”]+)”/.exec(result.answer); capped(quote?.[1] || result.answer);
    for(const ranges of Object.values(result.citations)) for(const [start,end] of ranges) assert.ok(start>=0 && end>start && end<=Array.from(result.answer).length);
    assert.deepEqual(saDisplayPayload(input,'true'),input);
  }
});

test('multiple quoted passages share one budget, and missing or untrusted official links withhold source text',async()=>{
  const quote = sa.text.split('. ').slice(0,7).join('. ')+'.';
  const result=await protect({answer:`“${quote}” Then “${quote}” Then “${quote}”`,sources:[row]});
  const quotes=[...result.answer.matchAll(/“([^”]+)”/g)].map(m=>m[1]).filter(t=>!t.startsWith('Excerpt omitted'));
  capped(quotes.join(' '));
  for(const url of ['', 'https://example.test/full-text.pdf','https://parliament.sa.gov.au.example.test/record']) {
    const record={...row,url}; assert.equal(saDisplayRecord(record,'false').snippet,'');
  }
});

test('unquoted copied prose is checked against the full original without emitting that original',async()=>{
  const input={answer:sa.text,sources:[{...row,snippet:sa.text.slice(0,90)}],citations:{'r1/t/body/0-1':[[0,sa.text.length]]}};
  let reads=0;
  const result=await (await saPublicResponse(Response.json(input),'false',async()=>{reads++;return sa;})).json();
  assert.equal(reads,1); capped(result.answer); capped(result.sources[0].snippet);
  assert.doesNotMatch(JSON.stringify(result),/statement 39/);
});

test('old report citations resolve official source URLs once per record',async()=>{
  let reads=0; const old={...row,url:null};
  const result=await (await saPublicResponse(Response.json({sources:[old,old]}),'false',async slug=>{assert.equal(slug,sa.slug);reads++;return sa;})).json();
  assert.equal(reads,1); for(const source of result.sources){capped(source.snippet);assert.equal(source.source_url,sa.url);}
});

test('repeated report citations share one canonical excerpt rather than revealing further passages',async()=>{
  const result=await protect({sections:[{sources:[row]},{sources:[{...row,snippet:sa.text.split('. ').slice(25).join('. ')}]}]});
  assert.equal(result.sections[0].sources[0].snippet,result.sections[1].sources[0].snippet);
  capped(result.sections[0].sources[0].snippet);
});

test('SSE never emits unchecked deltas or point quotes before source metadata is available',async()=>{
  const payload={answer:`“${sa.text}”`,sources:[row],citations:{}};
  const raw=`event: status\ndata: {"phase":"writing"}\n\nevent: delta\ndata: ${JSON.stringify({text:sa.text})}\n\nevent: done\ndata: ${JSON.stringify(payload)}\n\n`;
  const bytes=new TextEncoder().encode(raw);
  for(const size of [1,7,8192]) {
    const body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=size)c.enqueue(bytes.slice(i,i+size));c.close();}});
    const result=await (await saPublicResponse(new Response(body,{headers:{'content-type':'text/event-stream'}}),'false',async()=>sa)).text();
    assert.doesNotMatch(result,/event: delta/); assert.match(result,/event: status/);
    const done=JSON.parse(result.split('event: done\ndata: ')[1]);capped(done.sources[0].snippet);capped(/“([^”]+)”/.exec(done.answer)[1]);
  }
  assert.equal(await (await saPublicResponse(new Response(raw,{headers:{'content-type':'text/event-stream'}}),'true',noRead)).text(),raw);
});

test('raw resource retrieval remains complete and the public response alone applies display policy',async()=>{
  const source=ts.createSourceFile('index.ts',readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  const handler=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apiResource').getText(source);
  const record={...sa,origin:{url:sa.url},usermetadata:{classifications:Object.entries(sa.labels).map(([labelset,label])=>({labelset,label}))},extra:{metadata:sa.metadata},data:{texts:{body:{value:{body:sa.text}},'da-summary-t-body':{value:{body:sa.summary}}}}};
  const api=runInNewContext(ts.transpile(handler)+';apiResource',{...passage,Response,isPublicSlug:()=>true,isWitness:()=>false,speakerAttribution:async()=>null,DIVISION_SLUG_RE:/^division-/,cacheRequest:()=>new Request('https://opax.test/cache'),cacheBypass:()=>true,kbFetch:async()=>Response.json(record),json:Response.json,cacheStore:()=>{},withCacheStatus:r=>r,RESOURCE_CACHE_TTL:3600});
  const req=new Request(`https://opax.test/api/resource/${sa.slug}`);
  const raw=await api(req,new URL(req.url),sa.slug,{CACHE_EPOCH:'fixture'},{});
  assert.equal((await raw.clone().json()).text,sa.text);
  capped((await (await saPublicResponse(raw,'false',noRead)).json()).text);
});

// Actual Worker routing, with the rasteriser stubbed and no upstream services.
const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'stub-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'sa-test'}));b.onLoad({filter:/.*/,namespace:'sa-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
test('Worker guards static report JSON and publishes flag-aware llms guidance and client policy',async()=>{
  const env={SA_HANSARD_FULL_TEXT:'false',ASSETS:{fetch:async req=>new URL(req.url).pathname.endsWith('.json')?Response.json({sources:[row]}):new Response('Corpus guide',{headers:{'content-type':'text/plain'}})}};
  const get=path=>worker.fetch(new Request('https://opax.test'+path),env,{});
  const report=await (await get('/reports/fixture.json')).json();capped(report.sources[0].snippet);
  assert.match(await (await get('/llms.txt')).text(),/South Australian Hansard: Excerpt/);
  assert.deepEqual(await (await get('/api/display-policy')).json(),{SA_HANSARD_FULL_TEXT:'false'});
  env.SA_HANSARD_FULL_TEXT='true';assert.doesNotMatch(await (await get('/llms.txt')).text(),/South Australian Hansard: Excerpt/);
  assert.deepEqual(await (await get('/reports/fixture.json')).json(),{sources:[row]});
});

const og=await build({entryPoints:[new URL('../src/og.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {cardTree,portraitTree}=await import('data:text/javascript;base64,'+Buffer.from(og.outputFiles[0].text).toString('base64'));
test('both share-card formats retain the complete excerpt notice and official record URL',()=>{
  const card={kicker:'From the record',title:'Regional infrastructure',lines:[sa.summary],sourceNotice:{label:SA_EXCERPT_LABEL,url:sa.url}};
  const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(node.props?.children):'';
  for(const tree of [cardTree(card),portraitTree(card)]) {
    const rendered=text(tree);assert.ok(rendered.includes(SA_EXCERPT_LABEL));assert.ok(rendered.includes(sa.url));assert.ok(rendered.includes('The speech discusses'));
  }
});
