import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};runInNewContext(transpile(readFileSync(new URL('../src/ask-evidence.ts',import.meta.url),'utf8')),{exports});
const {normaliseFootnotes,FootnoteStream}=exports;
const index=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const extract=(a,b)=>index.slice(index.indexOf(a),index.indexOf(b,index.indexOf(a)));
let streamBody;
const api=runInNewContext(transpile([extract('function buildAskBody(','/** The portal'),extract('function askPayload(','type AskPayload'),extract('function hasUnsupportedQuotes(', '/**\n * The canonical form of an ask'),extract('function askCacheInput(','/** Worth keeping'),extract('class RefusalGate','/** streamAskOnce under')].join('\n'))+';({buildAskBody,askPayload,askCacheInput,streamAskOnce,hasUnsupportedQuotes,evidenceOnlyAnswer})',{
 ...exports, askRetrievalQuery: input=>input.question, recordContext:rows=>rows.map(r=>JSON.stringify(r)), recordSources:(rows,c)=>rows.map((r,i)=>({...r,resource:`USER_CONTEXT_${i}`,cited:Object.hasOwn(c,`USER_CONTEXT_${i}`)})), RECORD_GROUNDING:'', filterExpression:f=>({field:f}),calibrate:s=>s,label:()=>null,canonicalSpeaker:s=>s,TOPIC_SLUGS:new Set(['housing']),REFUSAL_PREFIXES:['not enough data'],TextDecoder,Date,ragBase:()=> 'https://example.test',fetch:async()=>new Response(streamBody)
});
const id='r1/t/transcript/0-50',neighbour='r1/t/transcript/50-100',generated='r1/t/da-summary/0-50';
const fixture=()=>({answer:'😀 A fact[^1]. Another fact[^2].\n\n[^1]: block-AA\n[^2]: block-AB',citation_footnote_to_context:{'block-AA':id,'block-AB':neighbour},retrieval_results:{resources:{r1:{slug:'speech-1',title:'Speech',fields:{'t/transcript':{paragraphs:{[id]:{text:'Original passage',score:0.8,score_type:'RERANKER'}}}}}}},augmented_context:{paragraphs:{[neighbour]:{id:neighbour,text:'Surrounding original passage'}}}});
const plain=x=>JSON.parse(JSON.stringify(x));
test('footnotes resolve through provider mappings with Unicode offsets',()=>{const p=api.askPayload(fixture());assert.equal(p.answer,'😀 A fact. Another fact.');assert.deepEqual(plain(p.citations[id]),[[7,8]]);assert.deepEqual(plain(p.citations[neighbour]),[[21,22]]);assert.equal(p.sources[0].cited,true)});
test('live plain numbering, multiple blocks and repeated citations work',()=>{const p=normaliseFootnotes('Fact [1]. More [1][2].\n[1]: block-AA, block-AB\n[2]: block-AA',{'block-AA':id,'block-AB':neighbour},new Set([id,neighbour]));assert.equal(p.answer,'Fact. More.');assert.equal(p.citations[id].length,2);assert.equal(p.citations[neighbour].length,2);assert.equal(normaliseFootnotes('Schedule [42] applies.',{},new Set()).answer,'Schedule [42] applies.')});
test('invented and generated references never become citations',()=>{const f=fixture();f.citation_footnote_to_context={'block-AA':generated,'block-AB':'unknown/t/body/0-20'};f.retrieval_results.resources.r1.fields['t/da-summary']={paragraphs:{[generated]:{text:'Generated summary',score:1,score_type:'RERANKER'}}};const p=api.askPayload(f);assert.equal(Object.keys(p.citations).length,0);assert.equal(p.sources[0].cited,false);assert.equal(p.sources[0].snippet,'Original passage')});
test('neighbouring evidence supplies cited snippet',()=>{const f=fixture();f.answer='A fact[^2].\n[^2]: block-AB';assert.equal(api.askPayload(f).sources[0].snippet,'Surrounding original passage')});
test('legacy citations still work',()=>{const f=fixture();f.answer='A fact.';f.citation_footnote_to_context={};f.citations={[id]:[[0,6]]};assert.deepEqual(plain(api.askPayload(f).citations[id]),[[0,6]])});
test('request preserves scope and clips current chat history; cache is versioned',()=>{const b=api.buildAskBody({question:'What did she propose?',speaker:'Example MP',context:Array.from({length:30},(_,i)=>({author:i%2?'answer':'question',text:'x'.repeat(7000)}))});assert.equal(b.citations,'llm_footnotes');assert.equal(b.context,undefined);assert.equal(b.chat_history.length,24);assert.equal(b.chat_history[1].author,'NUCLIA');assert.equal(b.chat_history[0].text.length,6000);assert.equal(b.filter_expression.field.speaker,'Example MP');assert.equal(b.rag_strategies[0].before,1);assert.equal(b.rag_strategies[0].after,1);assert.deepEqual(plain(b.rag_strategies[1].types),['classification_labels']);assert.equal(b.answer_json_schema,undefined);assert.equal(api.askCacheInput({question:'Q',context:[{text:'history'}]},'epoch'),null);assert.match(api.askCacheInput({question:'Q'},'epoch'),/footnotes-context/)});
test('stream hides markers and definitions across every chunk boundary',()=>{for(const raw of [fixture().answer,'Fact[1].\n\n[1]: block-AA\n','Fact[^block-AA].\n'])for(let size=1;size<=raw.length;size++){const stream=new FootnoteStream();let text='';for(let i=0;i<raw.length;i+=size)text+=stream.push(raw.slice(i,i+size));text+=stream.push('',true);assert.doesNotMatch(text,/block-|\[\^|\[1\]/);assert.match(text,/fact|Fact/)}});
test('NDJSON and synchronous payloads agree, including augmented evidence',async()=>{const f=fixture();const items=[{type:'answer',text:f.answer},{type:'retrieval',results:f.retrieval_results},{type:'footnote_citations',footnote_to_context:f.citation_footnote_to_context},{type:'augmented_context',augmented:f.augmented_context},{type:'status',code:'0'}];const encoded=new TextEncoder().encode(items.map(item=>JSON.stringify({item})).join('\n'));streamBody=new ReadableStream({start(c){for(let i=0;i<encoded.length;i+=7)c.enqueue(encoded.slice(i,i+7));c.close()}});const events=[];const a=await api.streamAskOnce({ARAG_KB_TOKEN:'test'},{citations:'llm_footnotes'},async(e,d)=>events.push([e,d]),new AbortController().signal);assert.deepEqual(plain(api.askPayload(a)),plain(api.askPayload(f)));assert.doesNotMatch(events.filter(([e])=>e==='delta').map(([,d])=>d.text).join(''),/block-|\[\^/)});
test('stream preserves normal markdown links and incomplete ordinary brackets',()=>{for(const raw of ['Read [bill](https://example.test).','An ordinary [bracket remains open','Code [1, 2, 3] is an array']){const f=new FootnoteStream();let out='';for(const c of raw)out+=f.push(c);out+=f.push('',true);assert.equal(out,raw)}});
test('UI places normalized citations at the supported claims',()=>{const s=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const fn=s.slice(s.indexOf('function askCitationText('),s.indexOf('function wireAskCitations('));const render=runInNewContext(fn+';askCitationText');const p=api.askPayload(fixture());const text=render(p.answer,[{answerRanges:Object.values(p.citations).flat()}]);assert.equal(text,'😀 A fact ⟦source:1⟧. Another fact ⟦source:1⟧.')});

test('legacy fallback removes footnote instructions but retains scope and context',()=>{const b=api.buildAskBody({question:'Q',speaker:'Example MP',context:[{text:'Earlier'}]});const fallback=exports.legacyCitationsAsk(b);assert.equal(fallback.citations,'default');assert.doesNotMatch(fallback.prompt.user,/define EVERY reference/);assert.deepEqual(fallback.filter_expression,b.filter_expression);assert.deepEqual(fallback.rag_strategies,b.rag_strategies);assert.deepEqual(fallback.chat_history,b.chat_history)});

test('footnotes can cite only server-supplied financial records',()=>{const f=fixture();f.answer='Disclosed funding[^1]. Unknown[^2].';f.citation_footnote_to_context={'1':'USER_CONTEXT_0','2':'USER_CONTEXT_99'};const p=api.askPayload(f,{records:[{title:'Disclosed receipt'}],coverage:'',total:1});assert.ok(p.citations.USER_CONTEXT_0);assert.equal(p.citations.USER_CONTEXT_99,undefined);assert.equal(p.sources[0].cited,true)});

test('provider-added metadata is not displayed as a source quotation',()=>{const f=fixture();f.answer='A fact[^2].\n[^2]: block-AB';f.augmented_context.paragraphs[neighbour].text='Original neighbouring passage.\n\nDOCUMENT CLASSIFICATION LABELS:\n - speech (kind)';assert.equal(api.askPayload(f).sources[0].snippet,'Original neighbouring passage.')});


test('literal quote validation permits formatting and ellipses but detects altered words',()=>{
 const evidence=['A large property portfolio is not something that should be set against a salary.'];
 assert.equal(exports.unsupportedQuotes('The passage says "should be set against a salary".',evidence).length,0);
 assert.equal(exports.unsupportedQuotes('The passage says "should not be set against a salary".',evidence).length,1);
 assert.equal(exports.unsupportedQuotes('It says "A large property portfolio ... should be set against a salary".',evidence).length,0);
 assert.equal(exports.unsupportedQuotes('It says "should be set against a salary ... A large property portfolio".',evidence).length,1);
});

test('quotations in uncited documents cannot validate a cited answer',()=>{
 const quote='A long source quotation with enough words to be checked.';
 const raw=fixture();raw.answer=`The passage says "${quote}".`;raw.citation_footnote_to_context={};raw.citations={[id]:[[0,raw.answer.length]]};
 raw.retrieval_results.resources.other={slug:'speech-2',fields:{body:{paragraphs:{'other/t/body/0-100':{text:quote,score:1}}}}};
 let p=api.askPayload(raw);assert.equal(api.hasUnsupportedQuotes(p,raw),true);
 raw.retrieval_results.resources.r1.fields['t/transcript'].paragraphs[id].text=quote;
 p=api.askPayload(raw);assert.equal(api.hasUnsupportedQuotes(p,raw),false);
});

test('failed quote recovery replaces prose with original passages and valid citations',()=>{
 const raw=fixture();const p=api.askPayload(raw);const safe=api.evidenceOnlyAnswer(p);
 assert.equal(safe.answer_status,'evidence_only');
 assert.match(safe.answer,/could not verify/);assert.match(safe.answer,/Original passage/);
 assert.ok(!safe.answer.includes('A fact'));
 for(const spans of Object.values(safe.citations))for(const [start,end] of spans){assert.ok(start>=0);assert.ok(end<=Array.from(safe.answer).length)}
 assert.ok(safe.sources.some(s=>s.cited));
});
