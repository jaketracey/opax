import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {MockLanguageModelV4} from 'ai/test';

const built=await build({stdin:{contents:"export * from './src/research-writing'; export {createAnswerWriter} from './src/research-writer'; export {groundAnswerPayload} from './src/research-grounding'; export {verifyResearchAnswer} from './src/research-evidence';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const source=(resource,text,url='https://example.test/report')=>({resource,slug:'',title:text,href:url,url,snippet:text,cited:true,kind:'record'});
const input=(question,facts)=>({question,period:{kind:'all',label:''},facts});
const fact=(id,text,url)=>({id,text,source:source('record-'+id,text,url)});
const answer=(lines,sources)=>{
  const answer=lines.join('\n\n');let offset=0;
  const citations=Object.fromEntries(lines.map((line,i)=>{const from=offset;offset+=Array.from(line).length+2;return [sources[i].resource+'/t/body/0',[[from,offset-2]]]}));
  return {answer,citations,sources};
};
const validRanges=out=>{for(const ranges of Object.values(out.citations))for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(out.answer).length)};
const noFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Dedupe fixtures must stay offline')};
test.after(()=>{globalThis.fetch=noFetch});

test('tool retries and a selected point from the same record feed one fact and produce one sentence at the writer seam',async()=>{
  const text='The Example Commission found Cabinet approved the recovery scheme without legislative authority.';
  const selected=answer([text],[source('fact-1',text)]);
  const facts=api.writingFacts(selected,[1,2,3].map(id=>({id,text,cite:{label:text,url:'https://example.test/report',kind:'record'}})));
  assert.equal(facts.length,1);
  const model=new MockLanguageModelV4({doGenerate:{content:[{type:'text',text:JSON.stringify({sentences:[{text,facts:[facts[0].id]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]}});
  const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}});
  const out=await write(input('Who approved the recovery scheme?',facts),{rounds:0,tokens:{input:0,output:0}},undefined,3000);
  assert.equal(out.answer,text);assert.equal(model.doGenerateCalls.length,1);
  assert.equal(JSON.parse(api.writingPrompt(input('Who approved it?',facts))).facts.length,1);
  assert.ok(Object.keys(out.citations).length);validRanges(out);
});

test('a record label and its fuller selected point become one fact without losing the extra figure',()=>{
  const label='Example Commission, in the commission\'s own words: "Cabinet approved the scheme without legislative authority."';
  const full='The commission found Cabinet approved the scheme without legislative authority, and made 42 recommendations.';
  const facts=api.writingFacts({answer:'',citations:{},sources:[source('fact-1',label),{...source('fact-1',full),title:label}]});
  assert.equal(facts.length,1);assert.equal(facts[0].text,full);assert.match(facts[0].source.snippet,/42 recommendations/);
});

test('two sources with different figures both survive fact selection, writing and final grounding',()=>{
  const lines=['The Example Commission reported that the recovery scheme affected 17 households in the district.','The Example Commission reported that the recovery scheme affected 19 households in the district.'];
  const facts=api.writingFacts({answer:'',citations:{},sources:lines.map((s,i)=>source('record-'+i,s,'https://example.test/report-'+i))});
  assert.equal(facts.length,2);
  const raw={sentences:facts.map(f=>({text:f.text,facts:[f.id]}))};
  const out=api.groundAnswerPayload(api.verifyWrittenAnswer(raw,input('Who was affected?',facts)),'Who was affected?');
  assert.match(out.answer,/17 households/);assert.match(out.answer,/19 households/);validRanges(out);
});

test('identical wording from different sources becomes one sentence carrying both citations',()=>{
  const text='The recovery scheme affected 17 households in the district.';
  const facts=[fact(1,text,'https://example.test/first'),fact(2,text,'https://example.test/second')];
  const out=api.verifyWrittenAnswer({sentences:facts.map(f=>({text,facts:[f.id]}))},input('Who was affected?',facts));
  assert.equal(out.answer,text);assert.equal(out.sources.length,2);
  for(const f of facts)assert.deepEqual(out.citations[f.source.resource+'/t/body/0'],[[0,text.length]]);
  assert.ok(out.sources.every(s=>s.cited));validRanges(out);
  const appended=api.appendWrittenPoints(answer([text],[facts[0].source]),answer([text],[facts[1].source]));
  assert.equal(appended.answer,text);assert.equal(Object.keys(appended.citations).length,2);
  assert.ok(appended.sources.every(s=>s.cited));validRanges(appended);
});

test('normalised exact wording merges different sources while retaining the earlier spelling',()=>{
  const first='The recovery scheme affected 17 households in the district.';
  const second=first.toUpperCase();
  const out=api.distinctSummary(answer([first,second],[source('first',first,'https://example.test/first'),source('second',second,'https://example.test/second')]));
  assert.equal(out.answer,first);assert.equal(Object.keys(out.citations).length,2);
  assert.ok(out.sources.every(s=>s.cited));validRanges(out);
});

test('r143 pre-writer record labels and selected points produce seven facts',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/ask-dedupe/01-robodebt.json',import.meta.url),'utf8'));
  const sources=fixture.pre_writer_sources.map(s=>({slug:'',href:s.url,...s}));
  assert.equal(sources.length,10);
  const facts=api.writingFacts({answer:'',citations:{},sources});
  assert.equal(facts.length,7);
  for(const resource of ['fact-23','fact-24','fact-26'])assert.equal(facts.filter(f=>f.source.resource===resource).length,1);
  assert.match(facts.find(f=>f.source.resource==='fact-26').text,/990-page.*57 recommendations/);
});

test('near-identical sentences keep the earlier wording and merge same-source citations with Unicode offsets',()=>{
  const first='The 🏠 Example Commission found that Cabinet approved the recovery scheme without legislative authority.';
  const second='The 🏠 Example Commission found Cabinet approved the recovery scheme without legislative authority.';
  const payload=answer([first,second],[source('record-1',first),source('alias-2',second)]);
  const out=api.distinctSummary(payload);
  assert.equal(out.answer,first);
  for(const id of ['record-1/t/body/0','alias-2/t/body/0'])assert.deepEqual(out.citations[id],[[0,Array.from(first).length]]);
  assert.ok(out.sources.every(s=>s.cited));validRanges(out);
  assert.deepEqual(api.distinctSummary(out),out);
});

test('exact repeated writer sentences merge the supporting aliases before assembly',()=>{
  const text='The Example Commission found Cabinet approved the recovery scheme without legislative authority.';
  const facts=[fact(1,text),fact(2,text)];
  const out=api.verifyWrittenAnswer({sentences:facts.map(f=>({text,facts:[f.id]}))},input('Who approved the scheme?',facts));
  assert.equal(out.answer,text);
  assert.equal(Object.keys(out.citations).length,2);assert.ok(out.sources.every(s=>s.cited));
});

test('a near-identical paragraph with reordered sentences is removed once and citations merge',()=>{
  const one='The Example Commission reported on the recovery scheme. Its report made 42 recommendations.';
  const two='Its report made 42 recommendations. The Example Commission reported on the recovery scheme.';
  const out=api.distinctSummary(answer([one,two],[source('record-1',one),source('record-2',two)]));
  assert.equal(out.answer,one);assert.equal(Object.keys(out.citations).length,2);validRanges(out);
});

test('a different figure or qualification from the same source survives the final guard',()=>{
  const first='The Example Commission found that the scheme affected 17 households in the district.';
  for(const second of [first.replace('17','19'),first.replace('affected','did not affect'),first.replace('17 households','17 households and 3 businesses')]){
    const out=api.distinctSummary(answer([first,second],[source('record-1',first),source('record-2',second)]));
    assert.equal(out.answer,first+'\n\n'+second);
  }
});

test('long shared templates preserve different categories and their equal figures',()=>{
  const text='The Example Commission published $0 for research and evaluation in financial year 2023-24, covering the recovery scheme review in the northern district.';
  const second=text.replace('research and evaluation','print and collateral');
  const payload=answer([text,second],[source('record-1',text),source('record-2',second)]);
  assert.equal(api.writingFacts(payload).length,2);
  assert.equal(api.distinctSummary(payload).answer,text+'\n\n'+second);
});

for(const reverse of [false,true])test('a sentence under thirty words retains an added name, '+(reverse?'named wording first':'unnamed wording first'),()=>{
  const first='The Example Commission found that officials ignored repeated legal warnings from senior departmental advisers during the development and implementation of the recovery scheme.';
  const named=first.replace('found that officials','found that Avery Sample and officials');
  const lines=reverse?[named,first]:[first,named];
  assert.ok(named.split(' ').length<30);
  const payload=answer(lines,lines.map((text,i)=>source('record-'+i,text)));
  assert.equal(api.distinctSummary(payload).answer,lines.join('\n\n'));
  const facts=api.dedupeWritingFacts(lines.map((text,i)=>fact(i+1,text)));
  assert.equal(facts.length,2);assert.ok(facts.some(f=>f.text.includes('Avery Sample')));
});

test('punctuation folding cannot merge different decimal figures before writing',()=>{
  const a='The Example Commission reported 1.5 million claims for the recovery scheme.';
  const b='The Example Commission reported 1,5 million claims for the recovery scheme.';
  assert.equal(api.dedupeWritingFacts([fact(1,a),fact(2,b)]).length,2);
});

test('the same set of figures assigned differently stays as distinct claims',()=>{
  const first='The Example Commission found Avery Sample approved 17 claims while Blake Example approved 19 claims.';
  const second=first.replace('17 claims','19 claims').replace('19 claims.','17 claims.');
  const payload=answer([first,second],[source('record-1',first),source('record-2',second)]);
  assert.equal(api.distinctSummary(payload).answer,first+'\n\n'+second);
});

const claim='The Example Commission found that Cabinet approved the recovery scheme without legislative authority.';
const coverage='Recommendations without a published government response have an unknown status.';
const coverageInput=question=>input(question,[fact(1,claim),{...fact(2,coverage),coverage:true}]);
for(const method of ['verifyWrittenAnswer','proseFallback']){
  const write=q=>method==='proseFallback'?api.proseFallback(coverageInput(q)):api.verifyWrittenAnswer({sentences:[{text:claim,facts:[1]}]},coverageInput(q));
  test(method+': a fully cited who-question has no historical-total note or partly-cited label',()=>{
    const out=write('Who approved the recovery scheme?');
    assert.doesNotMatch(out.coverage?.note??'',/complete historical total/);assert.equal(out.answer_status,undefined);
    assert.ok(Object.keys(out.citations).length);validRanges(out);
  });
  test(method+': a count question retains the historical-total note',()=>{
    const out=write('How many recommendations were implemented?');
    assert.match(out.coverage.note,/complete historical total/);
  });
  test(method+': money rankings retain the historical-total note without scope constraints',()=>{
    for(const question of ['Who gave Labor the most money?', 'Which donors gave the most to Labor?', 'Who are Labor\'s top donors?', 'Who gave Labor the biggest donations?', 'Who gave Labor the largest gifts?', 'Who gave Labor so much money?']){
      const out=write(question);
      assert.match(out.coverage.note,/complete historical total/,question);
    }
    assert.doesNotMatch(write('Who was most responsible for the recovery scheme?').coverage?.note??'',/complete historical total/);
  });
}

test('a writer-supplied historical-total caveat is also scoped to count intent',()=>{
  const raw={sentences:[{text:claim,facts:[1]},{text:'These records cannot establish a complete historical total.',facts:[2],coverage:true}]};
  const out=api.verifyWrittenAnswer(raw,coverageInput('Who approved the recovery scheme?'));
  assert.equal(out.coverage,undefined);
});

test('removing an uncited repeat refreshes the label using the existing character coverage check',()=>{
  const payload=answer([claim],[source('record-1',claim)]);
  const out=api.distinctSummary({...payload,answer:claim+'\n\n'+claim,answer_status:'partly_cited'});
  assert.equal(out.answer,claim);assert.equal(out.answer_status,undefined);
  const loose='Independent oversight was needed.';
  const mixed=api.distinctSummary({...payload,answer:claim+'\n\n'+claim+'\n\n'+loose,answer_status:'partly_cited'});
  assert.match(mixed.answer,/Independent oversight/);assert.equal(mixed.answer_status,'partly_cited');
});

test('the citation check still labels an uncited substantive point partly cited',()=>{
  const draft={text:claim+' Independent oversight was needed.',citations:[{id:'record-1/t/body/0',quote:claim,start:0,end:Array.from(claim).length}]};
  const passages=new Map([['record-1/t/body/0',{id:'record-1/t/body/0',resource:'record-1',slug:'',title:claim,text:claim,url:'https://example.test/report',kind:'record'}]]);
  assert.equal(api.verifyResearchAnswer(draft,passages).answer_status,'partly_cited');
});

test('merging a partial citation never widens it to cover uncited words',()=>{
  const text='The Example Commission found that Cabinet approved the recovery scheme without legislative authority.';
  const out=api.distinctSummary({answer:text+'\n\n'+text,citations:{'record-1/t/body/0':[[text.length+2,text.length+2+22]]},sources:[source('record-1',text)],answer_status:'partly_cited'});
  assert.equal(out.answer,text);assert.equal(out.answer_status,'partly_cited');
  assert.deepEqual(out.citations['record-1/t/body/0'],[[0,22]]);
});
