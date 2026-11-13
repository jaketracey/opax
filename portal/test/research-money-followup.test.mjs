import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
const bundled=await build({stdin:{contents:"export * from './src/research-writing'; export * from './src/research-response'; export * from './src/research-grounding'; export * from './src/research-claims'; export * from './src/research-money-writing'; export {callTool} from './src/tools/index';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/ask-money-followup-mining.json',import.meta.url)))
const graph=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url)))
const period={kind:'all',label:''},donor='Mining and Energy Union'
const env={origin:'http://localhost:8981',asset:async path=>path==='/graph/money.json'?structuredClone(graph):null}
const result=await api.callTool(env,'money_totals',{donor})
const fact=result.citations[0],record={resource:'fact-1',slug:'',title:fact.text,href:fact.url,url:fact.url,snippet:fact.text,cited:true,kind:'export'}
const input=question=>({question,period,facts:api.writingFacts(undefined,[{id:1,text:fact.text,cite:{kind:'export',url:fact.url,label:fact.text}}])})
const bound=payload=>{for(const ranges of Object.values(payload.citations))for(const [a,b] of ranges)assert.ok(a>=0&&a<b&&b<=Array.from(payload.answer).length);assert.doesNotMatch(payload.answer,/(?:^|\n)(?:The )?Mining\./)}

test('entity conjunctions remain whole while independent claims retain original offsets',()=>{
 for(const verb of ['has','was','recorded','received']){
  const text=`The ${donor} ${verb} 56 disclosed receipts and Example Party received $12.`
  const clauses=api.claimClauses(text)
  assert.equal(clauses.length,2)
  assert.ok(clauses[0].text.startsWith('The '+donor))
  for(const clause of clauses)assert.equal(text.slice(clause.start,clause.end),clause.text)
 }
})
test('fragment guard flags short and complete entity names, including long names; the writer keeps them',()=>{
 for(const text of ['Mining.','The Mining.','Energy Union.','The Mining and Energy Union.','And another.'])assert.equal(api.sentenceFragment(text,[donor]),true,text)
 assert.equal(api.sentenceFragment('The motion passed.'),false)
 assert.equal(api.sentenceFragment('Please name the bill.'),false)
 assert.equal(api.sentenceFragment('Pocock supported transparency.'),false)
 assert.equal(api.verifyWrittenAnswer({sentences:[{text:'Mining.',facts:[1]}]},input(fixtures[0].request.question)).answer,'Mining.')
})
test('the real donor aggregate supplies its count, human-readable dates and exclusion basis together',()=>{
 // The typed figure (each receipt once, from the parties' own returns), as on the union's donor page;
 // the legacy aggregate (37 receipts, $4,144,973) also counted its own declarations of the same gifts.
 assert.equal(result.rows[0].receipts,32);assert.equal(result.rows[0].total_aud,4144973)
 assert.match(fact.text,/\(1 July 1998 to 30 June 2025\)/)
 assert.match(fact.text,/exclude internal party transfers and public funding/)
 assert.deepEqual([result.coverage.since,result.coverage.until],['1998-07-01','2025-06-30'])
 assert.doesNotMatch(fact.text.replace(/\b\d{4}-\d{2}-\d{2}\b/g,''),/\(\s*to\s*\)/)
})
test('receipt fallback answers count, inclusion and years as distinct fields',()=>{
 const questions=[fixtures[0].request.question,`Are internal party transfers counted in the $4,144,973 from the ${donor}?`,fixtures[2].request.question]
 const answers=questions.map(q=>api.proseFallback(input(q)))
 assert.match(answers[0].answer,/^32 disclosed receipts from Mining and Energy Union/);assert.doesNotMatch(answers[0].answer,/\$/)
 assert.match(answers[1].answer,/^No, internal party transfers and public funding are excluded/)
 assert.match(answers[2].answer,/receipt total covers financial years 1998-99 to 2024-25/)
 answers.forEach(bound)
 assert.equal(api.receiptWritingLines(input(`What did the ${donor} say about energy policy?`)),null)
 const missing=input(questions[1]);missing.facts[0].text=missing.facts[0].text.replace(/ Donor aggregates.*$/,'')
 assert.equal(api.receiptWritingLines(missing),null,'an exclusion must have evidence')
})
test('each observed year is retained when selected records contain an annual series',async()=>{
 const series=await api.callTool(env,'money_totals',{donor,group_by:'year'})
 const facts=api.writingFacts(undefined,series.citations.map((c,i)=>({id:i+1,text:c.text,cite:{kind:'export',url:c.url,label:c.text}})))
 const out=api.proseFallback({question:fixtures[2].request.question,period,facts})
 assert.match(out.answer,/2001-02, 2002-03, 2021-22, 2023-24 and 2024-25/);assert.doesNotMatch(out.answer,/\$/);bound(out)
})
test('JSON and SSE release a fragment payload as written rather than swapping in fresh evidence',async()=>{
 for(const [i,fixture] of fixtures.entries())for(const stream of [false,true]){
  const question=i===1?`Are internal party transfers counted in the $4,144,973 from the ${donor}?`:fixture.request.question
  const answer=i===0?'Mining.\n\nThe Mining.':'Mining.'
  const raw={...fixture.response,answer,answer_decision:'answer',citations:{'fact-1/t/body/0':[[0,Array.from(answer).length]]},sources:[record],research:{pre_writer_sources:[record]}}
  const wire=stream?new Response('event: delta\ndata: '+JSON.stringify({text:answer})+'\n\nevent: done\ndata: '+JSON.stringify(raw)+'\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json(raw)
  const response=await api.withAnswerLanguage(wire,question),text=await response.text()
  const out=stream?JSON.parse(text.match(/event: done\ndata: (.+)/)[1]):JSON.parse(text)
  assert.equal(out.answer,answer);assert.deepEqual(out.citations,raw.citations)
assert.equal(out.sources.find(s=>s.resource==='fact-1').title,fact.text)
 }
})
test('grounding keeps an amount the cited money record does not hold, entity name whole',()=>{
 const answer=`The ${donor} has $999,999 in invented receipts.`
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',sources:[record],citations:{'fact-1/t/body/0':[[0,answer.length]]}},fixtures[0].request.question)
 assert.equal(out.answer,answer);assert.deepEqual(out.citations,{'fact-1/t/body/0':[[0,answer.length]]})
})
test('shape cleanup keeps a fragment line with its citation and cleans legacy titles',()=>{
 const good='The 🏠 committee discussed Mining.',answer=good+'\n\nMining.'
 const out=api.cleanAnswerShape({answer,sources:[{...record,title:record.title.replace(/\(1 July 1998 to 30 June 2025\)/,'( to )')}],citations:{'fact-1/t/body/0':[[0,Array.from(good).length],[Array.from(good).length+2,Array.from(answer).length]]}})
 assert.equal(out.answer,answer)
 assert.deepEqual(out.citations['fact-1/t/body/0'],[[0,Array.from(good).length],[Array.from(good).length+2,Array.from(answer).length]])
 assert.doesNotMatch(out.sources[0].title,/\(\s*to\s*\)/)
})
