// Review r3 controls, written before the fix. All providers and requests are local stubs.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {canReconstructRanking,donorRanking} from '../src/research-coherence.mjs'
import {rankingSourceMatches} from '../src/research-ranking-scope.mjs'
const built=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const qld=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-lnp-qld.json',import.meta.url)))
function source({jur='federal',party='LNP',period='2019–20',chamber,entity_type}={}){
 return {resource:'fact-1',kind:'record',title:'Selected donor ranking',url:`/money?jur=${jur}&party=party:${party}`,cited:true,...(chamber?{chamber}:{}),...(entity_type?{entity_type}:{}),snippet:`Selected Company has the largest disclosed total to ${party} in this published selection: $754,314.\nFinancial years: ${period}.\n| Donor | Disclosed receipts | Records |\n| Selected Company | $754,314 | 2 |\nThese are party receipts, not personal payments.`}
}
const cases=[
 ['review: federal excludes saved Queensland fact','Who gives the most money to the LNP in federal disclosures?',qld,false],
 ['Queensland permits saved Queensland fact','Who gives the most money to the LNP in Queensland disclosures?',qld,true],
 ['federal permits federal fact','Who gives the most money to the LNP in federal disclosures?',source(),true],
 ['Queensland excludes federal fact','Who gives the most money to the LNP in Queensland disclosures?',source(),false],
 ['unqualified disclosures retain the federal default','Who gives the most money to the LNP?',qld,false],
 ['financial year excludes aggregate','Who gives the most money to the LNP in federal disclosures in 2019–20?',source({period:'1998–99 to 2025–26'}),false],
 ['aggregate excludes single financial year','Who gives the most money to the LNP in federal disclosures from 1998–99 to 2025–26?',source(),false],
 ['matching financial year','Who gives the most money to the LNP in federal disclosures in 2019–20?',source(),true],
 ['different financial year','Who gives the most money to the LNP in federal disclosures in 2019–20?',source({period:'2019–21'}),false],
 ['unknown period cannot grant permission','Who gives the most money to the LNP in federal disclosures?',source({period:'unknown'}),false],
 ['Senate excludes House','Who gives the most money to the LNP in federal Senate disclosures?',source({chamber:'representatives'}),false],
 ['House excludes Senate','Who gives the most money to the LNP in federal House of Representatives disclosures?',source({chamber:'senate'}),false],
 ['Senate requires known chamber','Who gives the most money to the LNP in federal Senate disclosures?',source(),false],
 ['matching Senate','Who gives the most money to the LNP in federal Senate disclosures?',source({chamber:'senate'}),true],
 ['Labor excludes Liberal','Who gives the most money to Labor in federal disclosures?',source({party:'Liberal'}),false],
 ['Liberal excludes Labor','Who gives the most money to the Liberal Party in federal disclosures?',source({party:'Labor'}),false],
 ['One Nation alias',"Who gives the most money to Pauline Hanson's party in federal disclosures?",source({party:'One Nation'}),true],
 ['LNP alias','Who gives the most money to the Liberal National Party in federal disclosures?',source(),true],
 ['company excludes individual','Which company gives the most money to the LNP in federal disclosures?',source({entity_type:'person'}),false],
 ['individual excludes company','Which person gives the most money to the LNP in federal disclosures?',source({entity_type:'company'}),false],
 ['company requires known type','Which company gives the most money to the LNP in federal disclosures?',source(),false],
 ['a party ranking cannot answer a personal-recipient question','Who gives the most money to Pauline Hanson in federal disclosures?',source({party:'One Nation'}),false],
 ['matching company','Which company gives the most money to the LNP in federal disclosures?',source({entity_type:'company'}),true],
 ['jurisdiction requires evidence','Who gives the most money to the LNP in federal disclosures?',source({jur:''}),false],
 ['all dimensions together','Which company gives the most money to Labor in federal Senate disclosures in 2019–20?',source({party:'Labor',chamber:'senate',entity_type:'company'}),true],
 ['one disagreement vetoes the conjunction','Which company gives the most money to Labor in federal Senate disclosures in 2019–20?',source({jur:'qld',party:'Labor',chamber:'senate',entity_type:'company'}),false],
]
for(const [jur,name] of [['nsw','New South Wales'],['vic','Victoria'],['qld','Queensland'],['sa','South Australia'],['wa','Western Australia'],['tas','Tasmania'],['act','Australian Capital Territory'],['nt','Northern Territory']]){
 cases.push([`${jur} match`,`Who gives the most money to the LNP in ${name} disclosures?`,source({jur}),true])
 cases.push([`${jur} excludes federal`,`Who gives the most money to the LNP in ${name} disclosures?`,source(),false])
 cases.push([`federal excludes ${jur}`,'Who gives the most money to the LNP in federal disclosures?',source({jur}),false])
}
for(const [name,question,evidence,allowed] of cases)for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`${name}: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const answer='Avery Example received $754,314.',payload={answer,citations:{'fact-1/t/body/0':[[0,answer.length]]},sources:[structuredClone(evidence)],...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})}
 assert.equal(canReconstructRanking(payload,question),allowed,'scope permission')
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})},response=stream?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers})
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 if(allowed){assert.match(out.answer,/provided the most disclosed funding/);assert.match(out.answer,/754,314/);assert.ok(out.citations['fact-1/t/body/0'])}
 else{assert.doesNotMatch(out.answer,/provided the most|754,314/);assert.deepEqual(out.citations,{})}
})
test('each row used by a repair agrees with scope; a matching row cannot admit a mismatched row',()=>{
 const wrong={...source({jur:'qld'}),resource:'fact-2',snippet:source({jur:'qld'}).snippet.replaceAll('Selected Company','Wrong Company')}
 assert.deepEqual(donorRanking('Who gives the most money to the LNP in federal disclosures?',[source(),wrong]).map(r=>r.name),['Selected Company'])
 assert.deepEqual(donorRanking('Who gives the most money to the LNP in federal disclosures?',[{...source({jur:'qld'}),resource:'fact-2'},source()]).map(r=>r.name),['Selected Company'],'a mismatched duplicate cannot hide the valid row')
})
for(const [dimension,scope,evidence] of [
 ['jurisdiction',{jurisdiction:'federal'},source({jur:'qld'})],
 ['chamber',{chamber:'senate'},source({chamber:'representatives'})],
 ['party',{party:'Labor'},source({party:'Liberal'})],
 ['entity type',{entity_type:'company'},source({entity_type:'person'})],
 ['period',{period:{kind:'window',since:'2019-01-01',until:'2019-12-31',label:'2019'}},source({period:'1998–99 to 2025–26'})],
])for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`resolved ${dimension} filter survives all boundaries: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const question=dimension==='party'?'Who gives the most money to Labor?':'Who gives the most money to the LNP?',answer='Avery Example received $754,314.',payload={answer,answer_scope:scope,sources:[evidence],citations:{'fact-1/t/body/0':[[0,answer.length]]},...(fallback?{research:{mode:'planner'}}:{})}
 assert.equal(canReconstructRanking(payload,question),false)
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})},response=stream?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers})
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.doesNotMatch(out.answer,/provided the most|754,314/);assert.deepEqual(out.citations,{})
})
test('writer retains resolved constraints on the draft and its checked result',async()=>{
 const writing=await build({stdin:{contents:"export * from './src/research-writing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'}),writer=await import('data:text/javascript;base64,'+Buffer.from(writing.outputFiles[0].text).toString('base64'))
 const constraints={jurisdiction:'federal',party:'LNP'},evidence=source({jur:'qld'}),input={question:'Who gives the most money to the LNP?',period:{kind:'all',label:''},constraints,facts:[{id:1,text:evidence.snippet,source:evidence}]}
 const draft=writer.draftWrittenAnswer({answer_decision:'answer',sentences:[{text:'Avery Example received $754,314.',facts:[1]}]},input)
 assert.deepEqual(draft.answer_scope,constraints);assert.equal(canReconstructRanking(draft,input.question),false)
 const out=writer.proseFallback(input);assert.equal(out.answer_decision,'limitation');assert.doesNotMatch(out.answer,/provided the most|754,314/);assert.deepEqual(out.answer_scope,constraints)
})
for(const [asked,evidence,allowed] of [['senate','representatives',false],['representatives','senate',false],['senate','senate',true],['representatives','representatives',true]])test(`non-donor ranking scope: ${asked}/${evidence}`,()=>{
 const question=`Which Labor politician made the most speeches in federal ${asked==='senate'?'Senate':'House of Representatives'} records in 2019?`,answer='Avery Example recorded 42 chamber speeches labelled gambling in federal parliament in 2019.'
 const source={resource:'fact-1',kind:'count',url:`/explore?state=federal&party=Labor&chamber=${evidence}`,cited:true,snippet:'Pat Example: 42 chamber speeches labelled gambling in federal parliament from 2019-01-01 to 2019-12-31.',claim_atoms:[{entity:'Pat Example',metric:'speeches',value:'42',unit:'count',chamber:evidence,period:{since:'2019-01-01',until:'2019-12-31'}}]}
 assert.equal(canReconstructRanking({answer,sources:[source],citations:{'fact-1/t/body/0':[[0,answer.length]]}},question),allowed)
 const mixed={...source,claim_atoms:[...source.claim_atoms,{...source.claim_atoms[0],period:{since:'2020-01-01',until:'2020-12-31'}}]}
 assert.equal(rankingSourceMatches(question,mixed),false,'every figure is checked, including repeated values')
})
test('reconstruction excludes mismatched selected coverage and donor facts',()=>{
 const question='Who gives the most money to the LNP in federal disclosures?',answer='Avery Example received $754,314.',wrong={...source({jur:'qld'}),resource:'fact-2',snippet:source({jur:'qld'}).snippet.replaceAll('Selected Company','Wrong Company').replaceAll('754,314','900,000')},coverage={...source({jur:'qld'}),resource:'coverage',snippet:'Financial years: 2019–20. Only the published selection is covered.'}
 const out=api.groundAnswerPayload({answer,sources:[source(),wrong,coverage],citations:{'fact-1/t/body/0':[[0,answer.length]]}},question)
 assert.match(out.answer,/Selected Company.*754,314/);assert.doesNotMatch(out.answer,/Wrong Company|900,000/);assert.deepEqual(Object.keys(out.citations),['fact-1/t/body/0']);assert.deepEqual(out.sources.map(s=>s.resource),['fact-1'])
})
test('a legacy figure cannot borrow the period of an unrelated selection',()=>{
 const fact={resource:'fact-1',kind:'export',cited:true,snippet:'Selected Company gave One Nation $754,314 (federal disclosures).'},coverage={resource:'coverage',kind:'record',url:'/money?jur=qld&party=party:One%20Nation',snippet:'Financial years 1998–99 to 2025–26.'},question='Who gives the most money to One Nation in federal disclosures?'
 assert.deepEqual(donorRanking(question,[fact,coverage]),[])
 assert.equal(donorRanking(question,[fact,{...coverage,url:'/money?jur=federal&party=party:One%20Nation'}]).length,1)
 assert.deepEqual(donorRanking(question,[fact,{...coverage,url:'/money?jur=federal&party=party:Labor'}]),[])
})
