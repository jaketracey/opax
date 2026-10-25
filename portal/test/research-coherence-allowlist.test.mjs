import {federalReceiptSource} from '../src/receipt-language.mjs'
// Review r4 reproductions and allowlist controls precede the implementation.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {canReconstructRanking,coherenceCheck} from '../src/research-coherence.mjs'
import {resolvedRankingScope,rankingScopeMatches} from '../src/research-ranking-scope.mjs'
const built=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-writing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const hanson=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url))),golds=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-donor-golds.json',import.meta.url)))
function synthetic(period='2019–20',entity_type='company'){
 return {resource:'fact-1',kind:'record',cited:true,url:'/money?jur=federal&party=party:One%20Nation',entity_type,snippet:`Selected Company has the largest disclosed total to One Nation in this published selection: $161,787.\nFinancial years: ${period}.\n| Donor | Disclosed receipts | Records |\n| Selected Company | $161,787 | 2 |`}
}
const variants=[
 'Who is the largest individual donor to One Nation in federal disclosures?',
 'Who gives the most money to One Nation in federal disclosures from 2019-01-01 to 2019-06-30?',
 'Who gives the most money to One Nation between 2019 and 2021?',
 'Who gives the most money to One Nation since 2019?',
 'Who gives the most money to One Nation in most years?',
 'Who gives the most money to One Nation per year?',
 'Who gives the most money to One Nation and Labor?',
 'Who does not give the most money to One Nation?',
 'Who gives the most money to One Nation excluding companies?',
 'Who usually gives the most money to One Nation?',
 'Show the largest reliable individual donor to One Nation.',
 'Please show the top donors to One Nation?',
]
for(const question of variants)for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`out of allowlist: ${question} SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const answer='Avery Example received $161,787.',source=question.includes('2019')?synthetic():null,payload={answer,sources:source?[source]:structuredClone(hanson.payload.sources),citations:{'fact-1/t/body/0':[[0,answer.length]]},...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})}
 assert.equal(canReconstructRanking(payload,question),false)
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})},response=stream?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers})
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.doesNotMatch(out.answer,/provided the most|161,787/);assert.deepEqual(out.citations,{});assert.equal(coherenceCheck(question,out).pass,true)
 const input={question,period:{kind:'all',label:''},facts:payload.sources.map((source,i)=>({id:i+1,text:source.snippet,source}))},ordinary=api.proseFallback(input)
 assert.doesNotMatch(ordinary.answer,/provided the most|received the most|led the selected ranking/,'ordinary fallback uses the same allowlist')
})
test('explicit date endpoints are not collapsed to a year',()=>{
 const q=variants[1],scope=resolvedRankingScope(q)
 assert.equal(scope.period,'date:2019-01-01:2019-06-30')
 assert.equal(rankingScopeMatches(q,{source:synthetic(),party:'One Nation',period:'2019–20'}),false)
})
test('matching financial-year ranges normalize correctly but remain outside repair allowlist',()=>{
 const q='Who gives the most money to One Nation in federal disclosures from 2019–20 to 2020–21?',constraints={period:{kind:'window',since:'2019-07-01',until:'2021-06-30',label:'2019–20 to 2020–21'}},scope=resolvedRankingScope(q,constraints)
 assert.equal(scope.period,'fy:2019-20:fy:2020-21')
 assert.equal(rankingScopeMatches(q,{source:synthetic('2019–20 to 2020–21'),party:'One Nation',period:'2019–20 to 2020–21'},constraints),true)
 const answer='Avery Example received $161,787.'
 assert.equal(canReconstructRanking({answer,answer_scope:constraints,sources:[synthetic('2019–20 to 2020–21')],citations:{'fact-1/t/body/0':[[0,answer.length]]}},q),false)
})
for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`review FY range stays a limitation on every boundary: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const question='Who gives the most money to One Nation in federal disclosures from 2019–20 to 2020–21?',answer='Avery Example received $161,787.',payload={answer,answer_scope:{period:{kind:'window',since:'2019-07-01',until:'2021-06-30',label:''}},sources:[synthetic('2019–20 to 2020–21')],citations:{'fact-1/t/body/0':[[0,answer.length]]},...(fallback?{research:{mode:'planner'}}:{})},headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})}
 const response=stream?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers}),wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.doesNotMatch(out.answer,/provided the most|161,787/);assert.deepEqual(out.citations,{});assert.equal(coherenceCheck(question,out).pass,true)
})
for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`review individual wording cannot select a company: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const question=variants[0],answer='Avery Example received $161,787.',payload={answer,sources:[synthetic()],citations:{'fact-1/t/body/0':[[0,answer.length]]},...(fallback?{research:{mode:'planner'}}:{})},headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})}
 assert.equal(canReconstructRanking(payload,question),false)
 const response=stream?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers}),wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.doesNotMatch(out.answer,/provided the most|161,787/);assert.deepEqual(out.citations,{});assert.equal(coherenceCheck(question,out).pass,true)
})
for(const f of golds)for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`donor scope permission cannot override the drop boundary: ${f.id} SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const figure=/\$[\d,]+/.exec(f.top)?.[0];assert.ok(figure)
 const source=f.sources.find(s=>s.snippet.includes(figure)),answer=`Avery Example received ${figure}.`,payload={answer,sources:structuredClone(f.sources),citations:{[source.resource+'/t/body/0']:[[0,answer.length]]},...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})}
 assert.equal(canReconstructRanking(payload,f.question),true)
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})},response=stream?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers})
 const wire=await(await api.withAnswerLanguage(response,f.question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 if(federalReceiptSource(source)){assert.ok(!out.answer.includes(figure));assert.deepEqual(out.citations,{})}else{assert.match(out.answer,/largest disclosed receipts/);assert.ok(out.answer.includes(figure))}
 assert.equal(coherenceCheck(f.question,out).pass,true)
})
for(const [question,evidence,allowed] of [
 ['Who gave the most to One Nation?',synthetic(),true],
 ['Which company donated the most to One Nation?',synthetic(),true],
 ['Who gives the most money to One Nation in 2019–20 in federal disclosures?',synthetic(),true],
 ['Who gives the most money to One Nation in federal disclosures in 2019–20?',synthetic(),true],
 ['Who gives the most money to One Nation in 2019?',synthetic('2019'),true],
 ['Who gives the most money to One Nation in 2019?',synthetic(),false],
 ['Who gives the most money to One Nation in 2019–20?',synthetic('1998–99 to 2025–26'),false],
 ['Which company donated the most to One Nation?',synthetic('2019–20','person'),false],
 ['Who gives the most money to One Nation?',synthetic('2019–20','unknown'),false],
 ['Who gives the most money to One Nation?',{...synthetic(),chamber:'senate'},false],
])test(`exact slots: ${question}/${evidence.entity_type}/${evidence.snippet.match(/Financial years: ([^.]+)/)[1]}`,()=>{
 const answer='Avery Example received $161,787.'
 assert.equal(canReconstructRanking({answer,sources:[evidence],citations:{'fact-1/t/body/0':[[0,answer.length]]}},question),allowed)
})
for(const scope of [{entity_type:'person'},{period:{kind:'window',since:'2019-07-01',until:'2020-06-30',label:''}}])test('resolved qualifiers require their own allowlist slots: '+JSON.stringify(scope),()=>{
 const question='Who gives the most money to One Nation?',answer='Avery Example received $161,787.',evidence=synthetic('2019–20',scope.entity_type??'company')
 assert.equal(canReconstructRanking({answer,answer_scope:scope,sources:[evidence],citations:{'fact-1/t/body/0':[[0,answer.length]]}},question),false)
})
