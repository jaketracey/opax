import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';

const index=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const start=index.indexOf('function buildAskBody('),end=index.indexOf('/** The portal',start);
const compiled=ts.transpileModule(index.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const buildAskBody=runInNewContext(compiled+';buildAskBody',{
 askRetrievalQuery:input=>input.question,recordContext:rows=>rows.map(r=>JSON.stringify(r)),
 filterExpression:f=>({field:f}),integrityQuestion:()=>false,
 isNamedPositionQuestion:input=>Boolean(input.speaker),RECORD_GROUNDING:'',POSITION_GROUNDING:'',
 EVIDENCE_GAP_ANSWER:'This selection does not establish their position on that topic.',FOOTNOTE_INSTRUCTIONS:'Cite exact source blocks.',
});
const built=await build({entryPoints:[new URL('../src/agentic-tools.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {memberVotes,findQuotes,countSpeeches}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

test('ordinary answer prompt starts with the requested answer and prevents tool echoes and repeated figures',()=>{
 const {prompt}=buildAskBody({question:'Which party received the most disclosed receipts?'},{records:[{kind:'receipt',amount:20000}],coverage:'Published returns only.',total:1});
 assert.match(prompt.user,/first sentence must answer the question with the requested name, figure, date or outcome/);
 assert.match(prompt.user,/Give the supported part first/);
 assert.match(prompt.user,/Use plain prose for the substantive answer/);
 assert.match(prompt.user,/State each fact once/);
 assert.match(prompt.user,/each figure one supporting citation at the claim/);
 assert.match(prompt.user,/response coverage note, and only when the answer depends on them/);
 assert.doesNotMatch(prompt.user,/name the gap in one sentence at the end|note that the record is limited/);
 assert.match(prompt.user,/Published-record coverage: Published returns only/);
});

test('documented-position prompt answers before distinct supporting points without repeating the takeaway',()=>{
 const {prompt}=buildAskBody({question:'What did Example Member propose about housing?',speaker:'Example Member',kind:'speech'});
 assert.match(prompt.user,/first sentence answers the question with the person’s name and documented position, date or outcome/);
 assert.match(prompt.user,/distinct concrete policy positions/);
 assert.match(prompt.user,/each in a complete paraphrased sentence/);
 assert.match(prompt.user,/Use that person’s explicit speaking turns/);
 assert.match(prompt.user,/response coverage note, only when the answer depends on them/);
 assert.match(prompt.user,/When the passages hold no position on that exact topic, give the closest position they do record and say so in one line/);
 assert.doesNotMatch(prompt.user,/return (?:ONLY )?this sentence/);
});

test('vote-selection notes describe the boundary separately from unchanged vote rows',async()=>{
 const division={key:'federal-senate-1',date:'2025-07-31',name:'Housing Bill',ayes:35,noes:28,members:[{name:'Example Member',vote:'aye',party:'Example Party'}]};
 const result=await memberVotes({kb:async()=>{throw Error('Archive votes do not use ranked search')},asset:async path=>path==='/parliamentarians.json'?{people:[{name:'Example Member'}]}:path==='/divisions/index.json'?{divisions:[{key:division.key,date:division.date}]}:division},{keyword:'Housing',person:'Example Member'});
 assert.equal(result.data.counts.aye,1);
 assert.equal(result.data.counts_complete_for_scope,true);
 assert.equal(result.data.rows[0].vote,'aye');
 assert.equal(result.cite[1].url,'https://opax.com.au/doc/division-'+division.key);
 assert.match(result.notes.join(' '),/Missing member rows do not establish absence/);
 assert.doesNotMatch(result.notes.join(' '),/read the speeches|coverage\.note|put .*answer/);
});

test('ranked-passage notes stay plain metadata and avoid count-answer boilerplate',async()=>{
 const record={slug:'speech-1',title:'Housing debate',origin:{collaborators:['Example Member'],created:'2025-01-01'},usermetadata:{classifications:[{labelset:'kind',label:'speech'},{labelset:'state',label:'federal'},{labelset:'chamber',label:'senate'}]},data:{texts:{body:{value:{body:'Housing supply needs attention.'}}}}};
 const result=await findQuotes({kb:async path=>path==='/find'?{resources:{one:record}}:record,asset:async()=>null},{query:'housing'});
 assert.equal(result.data.passages[0].text,'Housing supply needs attention.');
 assert.match(result.notes.join(' '),/ranked sample, not a complete count/);
 assert.doesNotMatch(result.notes.join(' '),/That count comes|never count them|coverage\.note/);
});

test('speaker-name coverage notes describe the source limit without internal repair status',async()=>{
 const result=await countSpeeches({kb:async()=>({fulltext:{total:3,facets:{'/u/o':{'/u/o/Example Member':3}}}}),asset:async()=>null},{group_by:'speaker',state:'nsw'});
 assert.equal(result.data.rows[0].count,3);
 assert.ok(result.notes.some(note=>/state members are recorded by surname only/.test(note)));
 assert.doesNotMatch(result.notes.join(' '),/source fault being repaired/);
});
