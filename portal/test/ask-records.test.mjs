import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';

const bundle=await build({entryPoints:[new URL('../src/ask-records.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const records=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const assets={fetch:async req=>new Response(await readFile(new URL('../public'+new URL(req.url).pathname,import.meta.url)))};
const parsed=ts.createSourceFile('index.ts',await readFile(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const names=new Set(['buildAskBody','askPayload','askCacheInput','filterExpression','canonicalSpeaker','TOPIC_SLUGS','label','calibrate']);
const code=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)?names.has(n.name?.text):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(parsed)))).map(n=>n.getText(parsed)).join('\n');
const evidenceBundle=await build({entryPoints:[new URL('../src/ask-evidence.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const evidenceHelpers=await import('data:text/javascript;base64,'+Buffer.from(evidenceBundle.outputFiles[0].text).toString('base64'));
const scopeBundle=await build({entryPoints:[new URL('../src/ask-scope.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const scopeHelpers=await import('data:text/javascript;base64,'+Buffer.from(scopeBundle.outputFiles[0].text).toString('base64'));
const worker={...records,...evidenceHelpers,...scopeHelpers};
runInNewContext(ts.transpile(code),worker);
const plain=value=>JSON.parse(JSON.stringify(value));

test('natural questions find funding and public records, with explicit speech scope respected',async()=>{
 const question='Who takes gambling money, and what do they say about pokies?';
 assert.equal(records.recordQuery({question}),'gambling');
 const found=await records.retrieveAskRecords({question},assets);
 assert.ok(found.records.some(r=>r.kind==='receipt' && /Tabcorp.*Liberal/.test(r.title)));
 assert.ok(found.records.some(r=>r.kind==='donor'));
 assert.ok(found.records.some(r=>r.kind==='bill'));
 assert.ok(found.records.some(r=>r.kind==='grant'));
 assert.ok(found.records.length<=48);
 assert.ok(found.records.every(r=>r.kind!=='news'));
 assert.equal((await records.retrieveAskRecords({question,kind:'speech'},assets)).records.length,0);
});

test('entity questions do not fill the answer with unrelated partial name matches',async()=>{
 const found=await records.retrieveAskRecords({question:'What interests has Anthony Albanese declared?'},assets);
 assert.ok(found.records.some(r=>r.kind==='interest'));
 assert.ok(found.records.filter(r=>r.kind==='person' || r.kind==='interest' || r.kind==='expense').every(r=>/Anthony Albanese/.test(r.title)));
 assert.ok(!found.records.some(r=>r.kind==='donor' || r.kind==='receipt'));
 const contracts=await records.retrieveAskRecords({question:'What contracts has Woodside Energy received?'},assets);
 assert.ok(contracts.records.some(r=>r.kind==='contract' && /7,260,000/.test(r.snippet)));
 assert.ok(contracts.records.every(r=>!/Defence Families/.test(r.title)));
});

test('follow-ups use the prior question, never ungrounded model claims',()=>{
 assert.equal(records.recordQuery({question:'And Labor?',context:[{author:'question',text:'Who takes gambling money?'},{author:'answer',text:'InventedIndustries takes it.'}]}),'labor gambling');
});

test('party and date filters are honoured without relabelling lifetime totals',async()=>{
 const found=await records.retrieveAskRecords({question:'Tabcorp',party:'Labor'},assets);
 assert.ok(found.records.some(r=>r.kind==='receipt'));
 assert.ok(found.records.every(r=>!r.title.includes('→ Liberal')));
 const dated=await records.retrieveAskRecords({question:'Tabcorp',from:'2024',to:'2024'},assets);
 assert.ok(dated.records.every(r=>!/^1998/.test(r.dateLabel||'')));
 const person=await records.retrieveAskRecords({question:'gambling',speaker:'Andrew Wilkie'},assets);
 assert.ok(person.records.every(r=>r.kind!=='receipt'), 'party receipts cannot silently bypass an individual filter');
});

test('Ask defaults to all documents and includes structured evidence without unsafe speaker attribution',()=>{
 const evidence={records:[{kind:'receipt',title:'Company → Party',snippet:'$123 over 2020–2024.',href:'/money?type=receipts',dateLabel:'2020–2024',source:'AEC'}],coverage:'Partial published record',total:1};
 const body=worker.buildAskBody({question:'Who received it?'},evidence);
 const filters=JSON.stringify(body.filter_expression);
 assert.ok(!filters.includes('"label":"speech"'));
 assert.match(filters, /"not":\{"prop":"label","labelset":"kind","label":"news"\}/);
 assert.equal(body.extra_context.length,1);
 assert.equal(JSON.parse(body.extra_context[0]).period,'2020–2024');
 assert.match(body.prompt.system,/NOT proof that any individual politician/);
 assert.match(body.prompt.system,/never use it as a subtotal/i);
 assert.deepEqual(plain(body.rag_strategies),[{name:'neighbouring_paragraphs',before:1,after:1},{name:'metadata_extension',types:['classification_labels']}]);
 const speech=worker.buildAskBody({question:'What did he say?',kind:'speech',speaker:'Andrew Wilkie'});
 assert.match(JSON.stringify(speech.filter_expression),/"label":"speech"/);
 assert.match(speech.prompt.user,/These records are indexed under Andrew Wilkie/);
 assert.ok(!worker.buildAskBody({question:'What did he do?',speaker:'Andrew Wilkie'}).prompt.user.includes('Every passage is from a speech'));
 assert.equal(worker.askCacheInput({question:'Same'},'v'),worker.askCacheInput({question:'Same',kind:'all'},'v'));
 assert.notEqual(worker.askCacheInput({question:'Same'},'v'),worker.askCacheInput({question:'Same',kind:'speech'},'v'));
});

test('external citation offsets and document citations share one source payload with working destinations',()=>{
 const rows=[{kind:'receipt',title:'Company → Party',snippet:'$123',href:'/money?type=receipts',slug:'catalog-1'},
 {kind:'donor',title:'Uncited company',snippet:'$456',href:'/subject/donor/Other',slug:'catalog-2'}];
 const citations={USER_CONTEXT_0:[[0,12]],'rid/t/body/0-20':[[13,25]]};
 const payload=worker.askPayload({answer:'Party received funding.',citations,retrieval_results:{resources:{rid:{slug:'bill-c1234',title:'A bill',fields:{'t/body':{paragraphs:{'rid/t/body/0-20':{text:'Original bill text',score:0.8,score_type:'RERANKER'}}}}},news:{slug:'news-1'}}}},{records:rows,coverage:'',total:2});
 assert.deepEqual(plain(payload.citations),citations);
 assert.equal(payload.sources.length,3);
 assert.equal(payload.sources[0].resource,'USER_CONTEXT_0');
 assert.equal(payload.sources[0].cited,true);
 assert.equal(payload.sources[0].href,'/money?type=receipts');
 assert.equal(payload.sources[1].cited,false);
 assert.equal(payload.sources[2].href,'/bill/c1234');
 assert.equal(payload.sources[2].cited,true);
});


test('bill dates describe introduction, never passage or assent',()=>{
 const row=JSON.parse(records.recordContext([{kind:'bill',title:'Voice 2023',snippet:'passed',date:'2023-03-30'}])[0]);
 assert.equal(row.period,'2023-03-30');
 assert.match(row.date_meaning,/Introduction date, not passage or assent/);
 assert.match(worker.buildAskBody({question:'When did it pass?'}).prompt.system,/only give a passage or assent date when separately documented/);
});

test('referential funding questions retain the donor in catalog retrieval',()=>{
 const query=records.recordQuery({question:'And which parties received it?',context:[{author:'question',text:'Which parties received funding from Woodside?'},{author:'answer',text:'Imaginary Mining'}]});
 assert.match(query,/woodside/);
 assert.ok(!query.includes('imaginary'));
});

test('Senate asks filter chamber and cache it independently',()=>{
 const body=worker.buildAskBody({question:'What did the Senate say?',kind:'speech',chamber:'senate',state:'federal'});
 assert.match(JSON.stringify(body.filter_expression),/"labelset":"chamber","label":"senate"/);
 assert.notEqual(worker.askCacheInput({question:'Q',chamber:'senate'},'v'),worker.askCacheInput({question:'Q'},'v'));
});

test('follow-ups preserve generation history but bypass the failing implicit retrieval rewrite',()=>{
 const context=[{author:'question',text:'What did independent MPs say about negative gearing?'},{author:'answer',text:'They discussed reform.'}];
 const body=worker.buildAskBody({question:'And what about housing supply?',context});
 assert.match(body.query,/negative gearing/);assert.match(body.query,/housing supply/);
 assert.equal(body.chat_history.length,2);assert.equal(body.chat_history_relevance_threshold,1);assert.equal(body.rephrase,false);
 assert.equal(worker.buildAskBody({question:'What about housing?'}).chat_history_relevance_threshold,undefined);
});

test('anti-corruption answers require evidence identifying the relevant institution',()=>{
 const body=worker.buildAskBody({question:'Who argued against a federal anti-corruption commission?'});
 assert.match(body.prompt.user,/explicitly identifies a corruption or integrity body/);
 assert.match(JSON.stringify(body.filter_expression),/"prop":"keyword","word":"corruption"/);
 assert.ok(!worker.buildAskBody({question:'What did the Productivity Commission recommend?'}).prompt.user.includes('For this question, use a passage'));
});

test('institution catalog evidence excludes unrelated commissioners',async()=>{
 const found=await records.retrieveAskRecords({question:'Who argued against a federal anti-corruption commission, and on what grounds?'},assets);
 assert.ok(found.records.length>0);
 assert.ok(found.records.every(r=>/corruption|integrity|NACC/i.test(r.title+' '+r.snippet)));
});

test('public-record follow-ups recognise the browser user role and ignore assistant claims',()=>{
 assert.equal(records.recordQuery({question:'And Labor?',context:[{author:'user',text:'Who takes gambling money?'},{author:'answer',text:'InventedIndustries takes it.'}]}),'labor gambling');
});
