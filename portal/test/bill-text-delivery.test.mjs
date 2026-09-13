import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import ts from 'typescript';

const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../src/bill-text.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
runInNewContext(code, {exports,Response,Request,URL,TextEncoder,crypto:webcrypto});
const {handleBillText} = exports;
const key = 'au-federal-r7542';
const source = '1  Short title 😀\n    Original provision\n\nSchedule 1\nFinal provision.';
function resource(stage = 'first-reps', overrides = {}) {
  const cut = source.indexOf('\n\n');
  return { slug:`bill-text-${key}-${stage}`, title:'Example Bill',
    usermetadata:{classifications:[{labelset:'kind',label:'bill_text'},{labelset:'bill_key',label:key}]},
    extra:{metadata:{bill_key:key,title:'Example Bill',version_id:`r7542-${stage}`,source_version:`r7542_${stage.replaceAll('-','_')}`,
      stage,stage_label:stage,complete:true,source_url:'https://parlinfo.aph.gov.au/source',characters:Array.from(source).length,
      source_text_sha256:createHash('sha256').update(source).digest('hex'),section_count:2,section_offset_unit:'utf16',
      sections:[{id:'first',title:'Part 1',start:0,end:cut},{id:'schedule',title:'Schedule 1',start:cut+2,end:source.length}],...overrides}},
    data:{texts:{body:{value:{body:source}},'da-summary-body':{value:{body:'Generated summary'}}}} };
}
function harness(fetcher) {
  const stored = new Map(), pending = [], calls = [];
  const deps={cacheEpoch:'one',cache:{match:async req=>stored.get(req.url)?.clone(),put:async(req,res)=>{stored.set(req.url,res)}},
    waitUntil:promise=>pending.push(promise),kbFetch:async(path,init)=>{calls.push({path,init});return fetcher(path,init)}};
  const run=async(file='index',options={})=>{const response=await handleBillText(new Request(`https://opax.com.au/bill-texts/${key}/${file}.json${options.query??''}`,{method:options.method??'GET'}),deps);await Promise.all(pending);return response};
  return {run,deps,stored,calls};
}
test('manifest uses exact AND labels and extra metadata, latest complete version only',async()=>{
  const h=harness(()=>Response.json({resources:{one:resource(),two:resource('aspassed'),incomplete:resource('third-reps',{complete:false}),other:resource('first-senate',{bill_key:'au-federal-r1'})},fulltext:{total:4}}));
  const response=await h.run(); const body=await response.json();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].init.body.filter_expression)),{resource:{and:[{prop:'label',labelset:'kind',label:'bill_text'},{prop:'label',labelset:'bill_key',label:key}]}});
  assert.deepEqual([...h.calls[0].init.body.show],['basic','extra']);
  assert.deepEqual(body.versions.map(v=>v.id),['r7542-aspassed','r7542-first-reps']);
  assert.equal(body.default_version_id,'r7542-aspassed');
  assert.match(body.coverage_note,/not a list of every version/);
  assert.equal(response.headers.get('cache-control'),'public, max-age=60');
});
test('full version preserves exact source, Unicode boundaries and schedule; ignores summaries',async()=>{
  const h=harness(()=>Response.json(resource()));
  const response=await h.run('r7542-first-reps'); const body=await response.json();
  assert.equal(body.text,source); assert.equal(body.sections.map(s=>s.text).join('\n\n'),source);
  assert.equal(body.sections[1].text,'Schedule 1\nFinal provision.');
  assert.equal(body.complete,true); assert.equal(response.headers.get('cache-control'),'public, max-age=3600');
  assert.equal(h.calls[0].path,`/slug/bill-text-${key}-first-reps?show=basic&show=extra&show=values`);
});
test('old offset metadata falls back to whole verified text, standard and migrated fields do not double',async()=>{
  const record=resource('first-reps',{sections:[],section_offset_unit:null});
  record.data.texts={'t-body':{value:{body:source}},'da-summary-t-body':{value:{body:'Summary'}}};
  const h=harness(()=>Response.json(record));
  let body=await (await h.run('r7542-first-reps')).json(); assert.equal(body.sections[0].text,source);
  record.data.texts.body={value:{body:source}};
  body=await (await h.run('r7542-first-reps',{query:'?nocache=1'})).json(); assert.equal(body.text,source);
});
test('wrong identity and incomplete versions never become full source responses',async()=>{
  for(const override of [{bill_key:'au-federal-r999'},{version_id:'r999-first-reps'},{stage:'aspassed'},{source_version:'r7542_third_reps'},{complete:false}]){
    const h=harness(()=>Response.json(resource('first-reps',override)));
    assert.equal(await h.run('r7542-first-reps'),null); assert.equal(h.stored.size,0);
  }
  const h=harness(()=>{throw new Error('must not fetch')});assert.equal(await h.run('r999-first-reps'),null);
});
test('partial or altered body fails checksum and is never cached or called complete',async()=>{
  const record=resource();record.data.texts.body.value.body=source.slice(0,-10);
  const h=harness(()=>Response.json(record));const response=await h.run('r7542-first-reps');
  assert.equal(response.status,502);assert.equal(h.stored.size,0);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('legacy stable bill key accepts its separately reconciled canonical source version',async()=>{
  const legacy='au-federal-alrc-4391', record=resource();
  record.slug=`bill-text-${legacy}-first-reps`;record.extra.metadata.bill_key=legacy;
  record.usermetadata.classifications[1].label=legacy;
  const h=harness(path=>Response.json(path==='/catalog'?{resources:{one:record},fulltext:{total:1}}:record));
  for(const file of ['index','r7542-first-reps']){
    const response=await handleBillText(new Request(`https://opax.com.au/bill-texts/${legacy}/${file}.json`),h.deps);
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.bill_key,legacy);
    assert.equal(file==='index'?body.versions[0].id:body.version.id,'r7542-first-reps');
  }
});
test('cache shares GET and HEAD, changes with epoch, and bypasses explicitly',async()=>{
  const h=harness(()=>Response.json(resource()));
  assert.equal((await h.run('r7542-first-reps')).headers.get('x-opax-cache'),'MISS');
  const head=await h.run('r7542-first-reps',{method:'HEAD'});assert.equal(head.headers.get('x-opax-cache'),'HIT');assert.equal(await head.text(),'');
  assert.equal(h.calls.length,1); h.deps.cacheEpoch='two';
  assert.equal((await h.run('r7542-first-reps')).headers.get('x-opax-cache'),'MISS');
  const bypass=await h.run('r7542-first-reps',{query:'?nocache=1'});assert.equal(bypass.headers.get('x-opax-cache'),'BYPASS');assert.equal(bypass.headers.get('cache-control'),'no-store');
  assert.equal(h.calls.length,3);
});
test('catalog pagination is complete; empty and failing catalogs never negative-cache',async()=>{
  const h=harness((_,init)=>Response.json(init.body.page_number===0?{resources:{one:resource()},fulltext:{total:2,next_page:true}}:{resources:{two:resource('aspassed')},fulltext:{total:2,next_page:false}}));
  assert.equal((await(await h.run()).json()).versions.length,2);assert.equal(h.calls.length,2);
  const empty=harness(()=>Response.json({resources:{},fulltext:{total:0}}));assert.equal(await empty.run(),null);assert.equal(empty.stored.size,0);
  const bad=harness(()=>Response.json({resources:{one:resource()},fulltext:{total:2,next_page:true}}));
  assert.equal((await bad.run()).status,502);assert.equal(bad.stored.size,0);
});
