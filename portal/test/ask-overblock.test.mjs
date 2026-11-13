import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {auditPayload} from '../src/research-claim-audit.mjs'

const built=await build({stdin:{contents:"export {extractNamedScope} from './src/agentic-ask';export {groundAnswerPayload} from './src/research-grounding';export {sentenceFragment} from './src/research-claims';export {verifyResearchPoints} from './src/research-evidence';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const people=['Andrew Murray','Ian Hunter','Malcolm Fraser','John Darling','Gordon Brown','James Cook','William Cooper'].map(name=>({name}))
for(const topic of ['the Murray–Darling Basin','the Murray-Darling Basin','Murray Darling Basin','the Murray River','the Darling River','coal mining in the Hunter Valley','Fraser Island','the Gordon River','Cook Islands','Cooper Creek']){
 test(`topic names retain all speakers: ${topic}`,()=>{
  const scope=api.extractNamedScope(`What has parliament said about ${topic}?`,{people:[...people,{name:'Murray'},{name:'Hunter'}]},null)
  assert.deepEqual(scope.people,[]);assert.equal(scope.ambiguous,false)
 })
}
for(const person of ['Andrew Murray','Senator Murray','Mr Murray','Ms Hunter','Malcolm Fraser','John Darling']){
 test(`explicit person retains the person constraint: ${person}`,()=>{
  const scope=api.extractNamedScope(`What did ${person} say about the Murray-Darling Basin?`,{people},null)
  assert.equal(scope.people.length,1);assert.equal(scope.ambiguous,false)
 })
}
test('a place surname cannot create ambiguity between unrelated members',()=>{
 const scope=api.extractNamedScope('What has parliament said about the Hunter Valley?',{people:[{name:'Ian Hunter'},{name:'Andrew Hunter'}]},null)
 assert.deepEqual(scope.people,[]);assert.equal(scope.ambiguous,false)
})
test('date leads need a finite clause after a claim is removed',()=>{
 for(const fragment of ["In his 2004 Governor-General's speech contribution.",'In the 2019 Basin Plan debate.','On 12 February 2019.', '-, and that coal would be mined for decades to come.', ', and that he was disappointed.'])assert.equal(api.sentenceFragment(fragment),true,fragment)
 for(const sentence of ['In 2004, Andrew Murray argued for better water management.','On 12 February 2019, Anne Ruston moved a motion.','During the debate, members discussed the Basin Plan.'])assert.equal(api.sentenceFragment(sentence),false,sentence)
})
const question='What has parliament said about the Murray-Darling Basin?'
const source={resource:'speech-1',slug:'speech-1',kind:'speech',title:'Andrew Murray, Address in Reply',date:'2004-11-17',speaker:'Andrew Murray',url:'https://www.aph.gov.au/record/1',href:'https://www.aph.gov.au/record/1',snippet:'The Murray-Darling Basin needs better water management.',cited:true}
const payload=()=>{
 const answer='In his 2004 Governor-General\'s speech contribution, Andrew Murray said “The Basin belongs to Martians”.'
 return {answer,answer_decision:'answer',citations:{'speech-1/t/body/0':[[0,Array.from(answer).length]]},sources:[structuredClone(source)]}
}
test('a misquote becomes paraphrase: the sentence, its lead and its citation all stay',()=>{
 const input=payload(),snapshot=structuredClone(input),out=api.groundAnswerPayload(input,question)
 assert.deepEqual(input,snapshot)
 assert.equal(out.answer,"In his 2004 Governor-General's speech contribution, Andrew Murray said The Basin belongs to Martians.")
 assert.notEqual(out.coherence?.method,'cited_record_titles')
 const ranges=Object.values(out.citations).flat();assert.ok(ranges.length)
 for(const [from,to] of ranges)assert.ok(from>=0&&to>from&&to<=Array.from(out.answer).length)
 const again=api.groundAnswerPayload(structuredClone(out),question)
 assert.equal(again.answer,out.answer);assert.deepEqual(again.citations,out.citations)
})
test('a typed refusal passes the final boundary unchanged',()=>{
 for(const q of ['Can you write my Python homework?','Prove that mining donations bribed senators to vote against climate legislation.']){
  const input={...payload(),answer:'I cannot establish that from public records.',answer_decision:'refusal'}
  const out=api.groundAnswerPayload(input,q)
  assert.equal(out.answer,input.answer);assert.equal(out.answer_decision,'refusal')
  assert.notEqual(out.coherence?.method,'cited_record_titles')
 }
})
test('record fallback respects named-person and date constraints',()=>{
 for(const answer_scope of [{people:['Anne Ruston']},{dated:true,period:{since:'2020-01-01',until:'2020-12-31'}}]){
  const out=api.groundAnswerPayload({...payload(),answer_scope},question)
  assert.notEqual(out.coherence?.method,'cited_record_titles')
 }
})
test('a named speaker surname repair preserves Murray-Darling as a place',()=>{
 const id='speech-1/t/body/0',quote='The Murray-Darling Basin needs better water management.'
 const passage={...source,id,text:quote}
 const out=api.verifyResearchPoints([{id,quote,claim:'Murray said the Murray-Darling Basin needs better water management.'}],new Map([[id,passage]]),question,{people:['Andrew Murray'],parties:[],bills:[],ambiguous:false,unresolved:false},undefined,{people})
 assert.match(out.answer,/Andrew Murray said the Murray-Darling Basin/)
 assert.doesNotMatch(out.answer,/Andrew Murray-Darling/)
})
test('an uncited point stays in the answer as written',()=>{
 const answer='The Murray-Darling Basin Plan was legislated in 2012.\nAndrew Murray said the river needed reform.'
 const out=api.groundAnswerPayload({...payload(),answer,answer_status:'partly_cited',citations:{'speech-1/t/body/0':[[54,Array.from(answer).length]]}},question)
 assert.equal(out.answer,answer)
 assert.notEqual(out.coherence?.method,'cited_record_titles')
 assert.deepEqual(out.citations,{'speech-1/t/body/0':[[54,Array.from(answer).length]]})
})
test('annual speech rows retain their own year, rather than the search start date',()=>{
 const series=[['2018',1062],['2019',928],['2020',1780],['2021',2070],['2023',2040]]
 const sources=series.map(([year,count],i)=>({resource:`fact-${i+1}`,kind:'count',snippet:`${year}: ${count} chamber speeches labelled housing from 2018-01-01 (5.0% of 21253 topic-labelled speeches)`,title:year,cited:true,url:'https://opax.com.au/methods'}))
 for(const [year,count] of series){
  const answer=`In ${year}, there were ${count} chamber speeches labelled housing.`
  assert.equal(auditPayload('housing each year since 2018',{answer,sources,citations:{}}).findings.length,0,answer)
 }
 assert.ok(auditPayload('housing each year since 2018',{answer:'In 2019, there were 1780 chamber speeches labelled housing.',sources,citations:{}}).findings.length,'a count from a different year still fails')
 const answer=sources.map((s,i)=>`In ${series[i][0]}, there were ${series[i][1]} chamber speeches labelled housing.`).join('\n\n')
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',sources,citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,answer.length]]]))},'How have housing speeches changed each year since 2018?')
 for(const [year] of series)assert.ok(out.answer.includes(year))
})
