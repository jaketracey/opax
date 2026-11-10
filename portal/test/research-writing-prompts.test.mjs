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
 assert.match(prompt.user,/Do not restate the question/);
 assert.match(prompt.user,/never paste raw tool rows/);
 assert.match(prompt.user,/State each fact once/);
 assert.match(prompt.user,/each figure one supporting citation at the claim/);
 assert.match(prompt.user,/response coverage note, and only when the answer depends on them/);
 assert.doesNotMatch(prompt.user,/name the gap in one sentence at the end|note that the record is limited/);
 assert.match(prompt.user,/Published-record coverage: Published returns only/);
});

test('documented-position prompt answers before distinct supporting points without repeating the takeaway',()=>{
 const {prompt}=buildAskBody({question:'What did Example Member propose about housing?',speaker:'Example Member',kind:'speech'});
 assert.match(prompt.user,/first sentence answers the question with the person’s name and documented position, date or outcome/);
 assert.match(prompt.user,/without a preamble or question restatement/);
 assert.match(prompt.user,/do not repeat the takeaway in a bullet/);
 assert.match(prompt.user,/never raw tool rows/);
 assert.match(prompt.user,/response coverage note, only when the answer depends on them/);
 assert.match(prompt.user,/return ONLY this sentence: This selection does not establish their position on that topic/);
});

test('vote-selection notes describe the boundary separately from unchanged vote rows',async()=>{
 const division={key:'2025-07-31-example',date:'2025-07-31',name:'Housing Bill',ayes:35,noes:28,members:[{name:'Example Member',vote:'aye',party:'Example Party'}]};
 const result=await memberVotes({kb:async()=>({resources:{one:{slug:'division-'+division.key}}}),asset:async()=>division},{keyword:'Housing',person:'Example Member'});
 assert.equal(result.data.summary.divisions,1);
 assert.equal(result.data.rows[0].vote,'aye');
 assert.equal(result.cite[0].url,'https://opax.com.au/doc/division-'+division.key);
 assert.deepEqual(result.notes,['Divisions are matched by words in their titles; divisions filed under other titles may be missed.','A recorded vote does not establish why a member voted that way.']);
 assert.doesNotMatch(result.notes.join(' '),/read the speeches|coverage\.note|put .*answer/);
});

test('ranked-passage notes stay plain metadata and avoid count-answer boilerplate',async()=>{
 const result=await findQuotes({kb:async()=>({resources:{one:{slug:'speech-example',title:'Housing debate',fields:{body:{paragraphs:{p:{text:'Housing supply needs attention.'}}}}}}}),asset:async()=>null},{query:'housing'});
 assert.equal(result.data.passages[0].text,'Housing supply needs attention.');
 assert.deepEqual(result.notes,['The selected passages are a ranked sample, not a complete speech count.']);
 assert.doesNotMatch(result.notes.join(' '),/That count comes|never count them|coverage\.note/);
});

test('speaker-name coverage notes describe the source limit without internal repair status',async()=>{
 const result=await countSpeeches({kb:async()=>({fulltext:{total:3,facets:{'/u/o':{'/u/o/Example Member':3}}}}),asset:async()=>null},{group_by:'speaker',state:'nsw'});
 assert.equal(result.data.rows[0].count,3);
 assert.ok(result.notes.some(note=>/state members are recorded by surname only/.test(note)));
 assert.doesNotMatch(result.notes.join(' '),/source fault being repaired/);
});
