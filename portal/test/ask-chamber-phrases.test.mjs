// A chamber named for a cited speaker is the one their passage records (13 Nov 2026). The live slip: "In the House on
// 27 November 2024, Senator ... said", citing a Senate speech. Stored payloads and a scripted model, no provider or
// network calls. Names are invented.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'

const built=await build({stdin:{contents:"export * from './src/ask-chamber-phrases';export * from './src/agentic-ask';export * from './src/research-loop';export * from './src/research-writing';export {createResearchCreditCooldown} from './src/research-credit';export {inferPeriod} from './src/ask-period';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))

const passage=(n,speaker,chamber,kind='speech')=>({id:`speech-${n}/t/body/0-90`,resource:`speech-${n}`,slug:`speech-${n}`,title:`Hansard ${n}`,url:`https://opax.com.au/doc/speech-${n}`,kind,speaker,text:'The minimum age gives parents the backing of the law against platforms that have failed children.',...(chamber?{chamber}:{})})
const sourceOf=p=>({resource:p.resource,slug:p.slug,title:p.title,href:p.url,url:p.url,snippet:p.text,cited:true,kind:p.kind,speaker:p.speaker,...(p.chamber?{chamber:p.chamber}:{})})
const cp=(text,sub)=>{const at=text.indexOf(sub);assert.ok(at>=0,sub);const from=Array.from(text.slice(0,at)).length;return [from,from+Array.from(sub).length]}
/** One stored answer: each [passage, cited text] pair is a citation range over that text. */
const stored=(answer,cites)=>{
  const citations={}
  for(const [p,sub] of cites)(citations[p.id]??=[]).push(cp(answer,sub??answer))
  return {answer,citations,sources:[...new Map(cites.map(([p])=>[p.resource,sourceOf(p)])).values()],answer_decision:'answer'}
}
/** The research loop's reader: its own passages, null where a passage records no chamber. */
const loopReader=(...passages)=>id=>{const p=passages.find(x=>x.id===id);return p?{chamber:p.chamber??null,speaker:p.speaker}:undefined}
const cited=(payload,id)=>payload.citations[id].map(([a,b])=>Array.from(payload.answer).slice(a,b).join(''))

test('a Senate speaker placed in the House is moved to the Senate, and the citation still covers the sentence',()=>{
  const p=passage(1,'Jordan Sample','senate')
  const answer='In the House on 27 November 2024, Senator Jordan Sample said the minimum age gives parents the backing of the law.'
  const out=api.withRecordedChambers(stored(answer,[[p]]),loopReader(p))
  assert.equal(out.answer,'In the Senate on 27 November 2024, Senator Jordan Sample said the minimum age gives parents the backing of the law.')
  assert.deepEqual(cited(out,p.id),[out.answer])
  assert.equal(out.sources[0].cited,true)
  // The sources a payload carries are enough on their own (the writer's reader).
  assert.equal(api.withRecordedChambers(stored(answer,[[p]])).answer,out.answer)
  // A bulleted point, as the research loop writes them.
  assert.equal(api.withRecordedChambers(stored('- '+answer,[[p,answer]]),loopReader(p)).answer,'- '+out.answer)
})

test('a House speaker placed in the Senate is moved to the House of Representatives',()=>{
  const p=passage(2,'Casey Example','representatives')
  const answer='Casey Example told the Senate that platforms had failed children.'
  assert.equal(api.withRecordedChambers(stored(answer,[[p]]),loopReader(p)).answer,'Casey Example told the House of Representatives that platforms had failed children.')
  // The register spelling of the lower house is the same chamber.
  assert.equal(api.withRecordedChambers(stored(answer,[[{...p,chamber:'house'}]]),loopReader({...p,chamber:'house'})).answer,'Casey Example told the House of Representatives that platforms had failed children.')
})

test('state chambers are named as recorded, and a phrase that already agrees is left alone',()=>{
  const council=passage(3,'Alex Sample','nsw_lc'),assembly=passage(4,'Robin Example','vic_la'),sa=passage(5,'Morgan Example','sa_ha')
  const a='Alex Sample said in the Legislative Assembly that the age limit was overdue.'
  assert.equal(api.withRecordedChambers(stored(a,[[council]]),loopReader(council)).answer,'Alex Sample said in the NSW Legislative Council that the age limit was overdue.')
  const b='Robin Example told the Legislative Council that platforms had failed children.'
  assert.equal(api.withRecordedChambers(stored(b,[[assembly]]),loopReader(assembly)).answer,'Robin Example told the Victorian Legislative Assembly that platforms had failed children.')
  const c='Robin Example told the Queensland Legislative Assembly that platforms had failed children.'
  assert.equal(api.withRecordedChambers(stored(c,[[assembly]]),loopReader(assembly)).answer,'Robin Example told the Victorian Legislative Assembly that platforms had failed children.','a wrong state is a wrong chamber')
  for(const [text,p] of [
    ['Alex Sample said in the Legislative Council that the age limit was overdue.',council],
    ['Alex Sample said in the upper house that the age limit was overdue.',council],
    ['Morgan Example told the House that the age limit was overdue.',sa],
    ['Morgan Example told the House of Assembly that the age limit was overdue.',sa],
    ['Robin Example said in the Legislative Assembly that the age limit was overdue.',assembly],
  ]){const payload=stored(text,[[p]]);assert.equal(api.withRecordedChambers(payload,loopReader(p)),payload,text)}
})

test('a passage with no recorded chamber loses the phrase rather than a guessed chamber',()=>{
  const release=passage(6,'Jordan Sample',undefined,'press_release')
  for(const [before,after] of [
    ['In the Senate on 3 May 2024, Jordan Sample said the age limit was overdue.','On 3 May 2024, Jordan Sample said the age limit was overdue.'],
    ['In the House, Jordan Sample said the age limit was overdue.','Jordan Sample said the age limit was overdue.'],
    ['Jordan Sample told the Senate that the age limit was overdue.','Jordan Sample said that the age limit was overdue.'],
    ['Jordan Sample said in the House that the age limit was overdue.','Jordan Sample said that the age limit was overdue.'],
    ['Jordan Sample, speaking in the House, said the age limit was overdue.','Jordan Sample said the age limit was overdue.'],
  ]){
    const out=api.withRecordedChambers(stored(before,[[release]]),loopReader(release))
    assert.equal(out.answer,after)
    assert.deepEqual(cited(out,release.id),[after],'the citation still covers the whole corrected sentence')
  }
  // The writer's reader only acts on a recorded chamber; a source without one is left as written.
  const writer=stored('Jordan Sample told the Senate that the age limit was overdue.',[[release]])
  assert.equal(api.withRecordedChambers(writer),writer)
})

test('a sentence citing two passages from different chambers is left alone, unless the phrase sits beside one citation',()=>{
  const senate=passage(7,'Jordan Sample','senate'),house=passage(8,'Casey Example','representatives')
  const answer='Jordan Sample told the House that the age limit was overdue, and Casey Example said platforms had failed children.'
  const both=stored(answer,[[senate],[house]])
  assert.equal(api.withRecordedChambers(both,loopReader(senate,house)),both)
  const beside=stored(answer,[[senate,'Jordan Sample told the House that the age limit was overdue,'],[house,'Casey Example said platforms had failed children.']])
  const out=api.withRecordedChambers(beside,loopReader(senate,house))
  assert.equal(out.answer,'Jordan Sample told the Senate that the age limit was overdue, and Casey Example said platforms had failed children.')
  assert.deepEqual(cited(out,senate.id),['Jordan Sample told the Senate that the age limit was overdue,'])
  assert.deepEqual(cited(out,house.id),['Casey Example said platforms had failed children.'])
  // Two passages that record the same chamber settle it together.
  const twoSenate=stored(answer.replace('Casey Example','Jordan Sample'),[[senate],[{...house,chamber:'senate',speaker:'Jordan Sample'}]])
  assert.match(api.withRecordedChambers(twoSenate,loopReader(senate,{...house,chamber:'senate',speaker:'Jordan Sample'})).answer,/^Jordan Sample told the Senate that/)
})

test('quotations, bill events, offices, committees and record facts keep their wording',()=>{
  const senate=passage(9,'Jordan Sample','senate')
  for(const text of [
    'Jordan Sample said “I told the House last week that platforms had failed children.”',
    'The bill was introduced in the House on 21 November 2024, and Jordan Sample said it was overdue.',
    'Jordan Sample, the Leader of the Government in the House, said the age limit was overdue.',
    'Jordan Sample told the House Standing Committee on Communications that platforms had failed children.',
    'Jordan Sample told the Senate Environment and Communications Legislation Committee that platforms had failed children.',
    'In the House, the age limit passed with support from both major parties.',
  ]){const payload=stored(text,[[senate]]);assert.equal(api.withRecordedChambers(payload,loopReader(senate)),payload,text)}
  const fact={resource:'fact-1',id:'fact-1/t/body/0'},text='The Online Safety Amendment Bill was introduced in the Senate and Jordan Sample said it was overdue.'
  const payload={answer:text,citations:{[fact.id]:[[0,Array.from(text).length]]},sources:[{resource:'fact-1',slug:'',title:'Bill record',href:'https://opax.com.au/bill/x',url:'https://opax.com.au/bill/x',snippet:'Introduced in the House.',cited:true,kind:'record'}]}
  assert.equal(api.withRecordedChambers(payload,loopReader(senate)),payload,'a record fact is not a passage')
  // A Senate committee hearing is not the Senate floor.
  const hearing=passage(10,'Jordan Sample','senate_committee')
  assert.equal(api.withRecordedChambers(stored('Jordan Sample told the Senate that platforms had failed children.',[[hearing]]),loopReader(hearing)).answer,'Jordan Sample told a Senate committee that platforms had failed children.')
  assert.equal(api.withRecordedChambers(stored('In the Senate on 3 May 2024, Jordan Sample said platforms had failed children.',[[hearing]]),loopReader(hearing)).answer,'At a Senate committee hearing on 3 May 2024, Jordan Sample said platforms had failed children.')
})

test('the writer is shown the chamber each fact records',()=>{
  const p=passage(11,'Jordan Sample','senate','press_release')
  const prompt=JSON.parse(api.writingPrompt({question:'Why was the minimum age introduced?',period:{kind:'all',label:''},facts:[{id:1,text:p.text,source:sourceOf(p),evidenceId:p.id}]}))
  assert.equal(prompt.facts[0].chamber,'senate')
  assert.match(prompt.contract,/Name the chamber a fact records in its chamber field/)
})

const call=(name,args,id)=>({type:'tool-call',toolName:name,toolCallId:id,input:JSON.stringify(args)})
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}

test('research shows the model each passage\'s chamber, and a point that guesses it is corrected',async()=>{
  const q='Why did the government introduce the social media minimum age law?'
  const pid='c'.repeat(32)+'/t/body/0-96',text='The minimum age gives parents the backing of the law against platforms that have failed our children.'
  const point='In the House on 27 November 2024, Senator Jordan Sample said the minimum age gives parents the backing of the law against platforms.'
  const m=new MockLanguageModelV4({doGenerate:[
    reply([call('search',{query:'social media minimum age'},'a')]),
    reply([call('answer',{points:[{claim:point,id:pid,quote:'gives parents the backing of the law against platforms'}]},'b')]),
  ]})
  const deps={asset:async()=>null,generate:async()=>{throw new Error('the old planner must not run')},
    kb:async()=>({resources:{[pid.split('/')[0]]:{slug:'speech-12',title:'Online Safety Amendment Bill 2024',fields:{body:{paragraphs:{[pid]:{text}}}}}}}),
    research:Object.assign(api.createResearch({inputPrice:0.1,outputPrice:0.3,model:m,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown(),
      readRecord:async()=>({text,speaker:'Jordan Sample',labels:{kind:'speech',chamber:'senate'},metadata:{date:'2024-11-27'}})}),{write:undefined})}
  const run=await api.runAgentic(q,deps,async()=>{},40_000,api.inferPeriod(q),{},scope)
  assert.equal(run.answered,true)
  const answer=JSON.stringify(m.doGenerateCalls[1].prompt)
  assert.match(answer,/"chamber":"senate"/,'the search result the model reads carries the recorded chamber')
  // The answer is reply text (REPLY_ANSWER_RULE), so the rule reaches the model in its instructions.
  assert.match(JSON.stringify(m.doGenerateCalls[1].prompt.filter(p=>p.role==='system')),/Name the chamber a passage records in its chamber field/)
  assert.match(run.answer,/In the Senate on 27 November 2024, Senator Jordan Sample said/)
  assert.doesNotMatch(run.answer,/In the House/)
  assert.equal(run.qualitative.sources.find(s=>s.resource===pid.split('/')[0])?.chamber,'senate')
  for(const [a,b] of Object.values(run.qualitative.citations).flat())assert.ok(a>=0&&b>a&&b<=Array.from(run.answer).length)
})
