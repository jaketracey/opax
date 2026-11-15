// One record fact reaches the answer once. Seen live on 15 November 2026: "What were Jo Briskey's itemised travel
// expenses for 2026?" gave her term of service in two paragraphs. The loop had selected the service record as a fact
// and also written a point resting on it, and both spans of the answer cited that one record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {importBundle} from './fixtures/import-bundle.mjs';
const bundled=await build({stdin:{contents:"export {writingFacts,appendWrittenPoints} from './src/research-writing'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await importBundle(bundled.outputFiles[0].text,'ask-each-fact-once');

const url='https://opax.com.au/subject/person/jo-briskey';
const service='Jo Briskey served in the House of Representatives for Maribyrnong from 3 May 2025, ongoing as at 4 September 2026.';
const point='Jo Briskey is the Labor member for Maribyrnong in the House of Representatives, having served since 3 May 2025, so the 2026 figures fall within her current term.';
const expenses='Jo Briskey: $318,774 in reported parliamentary expenses for 2026; itemised lines for that year are not loaded.';
const record=(n,text,link)=>({resource:`fact-${n}`,slug:'',title:text,href:link,url:link,snippet:text,cited:true,kind:'record'});
const span=(answer,text)=>{const at=Array.from(answer.slice(0,answer.indexOf(text))).length;return [at,at+Array.from(text).length]};
/** The loop's answer as compose() builds it: each selected record fact as its own line, then the model's points. */
const loopAnswer=()=>{
 const answer=`- ${expenses}\n- ${service}\n${point}`;
 return {answer,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey'),record(2,service,url)],
  citations:{'fact-1/t/body/0':[span(answer,expenses)],'fact-2/t/body/0':[span(answer,service)],'fact-2':[span(answer,point)]}};
};

test('a record cited by its own line and by a point resting on it is one writer fact, in the record\'s words',()=>{
 const facts=api.writingFacts(loopAnswer());
 assert.deepEqual(facts.map(f=>f.text),[expenses,service]);
});
test('a point that is the only citation of a record still reaches the writer as written',()=>{
 const answer=`- ${expenses}\n${point}`;
 const facts=api.writingFacts({answer,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey'),record(2,service,url)],
  citations:{'fact-1/t/body/0':[span(answer,expenses)],'fact-2':[span(answer,point)]}});
 assert.deepEqual(facts.map(f=>f.text),[expenses,point]);
});
test('two different lines of one larger record stay two writer facts',()=>{
 const first='The report found the scheme was unlawful.',second='The report recommended 57 changes.';
 const answer=`${first}\n${second}`,source={...record(3,first+'\n'+second,'https://example.org/report')};
 const facts=api.writingFacts({answer,answer_decision:'answer',sources:[source],citations:{'fact-3/t/body/0':[span(answer,first)],'fact-3':[span(answer,second)]}});
 assert.deepEqual(facts.map(f=>f.text),[first,second]);
});
test('a model point resting on a record the written answer already cites is not added after it',()=>{
 const sentence='Jo Briskey has served as the Labor member for Maribyrnong in the House of Representatives since 3 May 2025, ongoing as at 4 September 2026.';
 const lead='The published record holds no itemised travel lines for Jo Briskey for 2026; the year\'s reported total is $318,774.';
 const text=lead+'\n\n'+sentence;
 const written={answer:text,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey'),record(2,service,url)],
  citations:{'fact-1/t/body/0':[span(text,lead)],'fact-2/t/body/0':[span(text,sentence)]}};
 const speech='Jo Briskey told the House on 2 March 2026 that travel claims should be published monthly.';
 const pointsAnswer=point+'\n'+speech;
 const points={answer:pointsAnswer,answer_decision:'answer',sources:[record(2,service,url),{resource:'speech-9',slug:'speech-9',title:'Expenses debate',href:'https://opax.com.au/doc/speech-9',url:'https://opax.com.au/doc/speech-9',snippet:'travel claims should be published monthly',cited:true,kind:'speech',speaker:'Jo Briskey',date:'2026-03-02'}],
  citations:{'fact-2':[span(pointsAnswer,point)],'speech-9/t/body/0-40':[span(pointsAnswer,speech)]}};
 const out=api.appendWrittenPoints(written,points);
 assert.equal(out.answer,text+'\n\n'+speech,'the term of service appears once; the speech point is kept');
 assert.equal((out.answer.match(/3 May 2025/g)??[]).length,1);
 assert.deepEqual(out.citations['speech-9/t/body/0-40'].map(([a,b])=>Array.from(out.answer).slice(a,b).join('')),[speech]);
});
test('a model point resting on a record the written answer does not cite is still added',()=>{
 const lead='The published record holds no itemised travel lines for Jo Briskey for 2026; the year\'s reported total is $318,774.';
 const written={answer:lead,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey')],citations:{'fact-1/t/body/0':[span(lead,lead)]}};
 const points={answer:point,answer_decision:'answer',sources:[record(2,service,url)],citations:{'fact-2':[span(point,point)]}};
 assert.equal(api.appendWrittenPoints(written,points).answer,lead+'\n\n'+point);
});
