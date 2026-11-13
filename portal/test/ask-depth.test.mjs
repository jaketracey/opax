import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
const built=await build({stdin:{contents:"export {auditPayload} from './src/research-claim-audit.mjs';export {recordAnswerLines} from './src/research-record-answer';export * from './src/ask-answer-grain';export {joinedSourceName} from './src/source-text-fidelity';export {callTool} from './src/tools';export {proseFallback,writingFacts,appendWrittenPoints} from './src/research-writing';export {withAnswerLanguage} from './src/research-response';export {extractAskConstraints,constrainStep} from './src/ask-constraints';export {groundAnswerPayload} from './src/research-grounding';export {inferPeriod,runAgentic} from './src/agentic-ask';export {createAnswerWriter} from './src/research-writer';export {createResearch} from './src/research-loop';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const named={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const constraints=(q,scope=named)=>api.extractAskConstraints(q,api.inferPeriod(q),scope)

test('speech ranking grain follows the requested people or parties, with the date and party filter retained',()=>{
 for(const [q,group]of [['Which members have spoken most about housing affordability since 2022?','speaker'],['Which party has spoken most about housing affordability since 2022?','party'],['Which senators have spoken most about climate change this term?','speaker']]){
  const c=constraints(q)
  const step=api.constrainStep({tool:'count_speeches',args:{group_by:group==='party'?'speaker':'party',speaker:'Invented Person',state:'federal',chamber:'representatives',party:'Liberal'}},c,{group_by:{},speaker:{},since:{},until:{},chamber:{},state:{},party:{}})
  assert.equal(step.args.group_by,group);assert.equal(step.args.speaker,undefined)
  if(q.includes('2022'))assert.equal(step.args.since,'2022-01-01')
  if(q.includes('senators'))assert.equal(step.args.chamber,'senate')
  else if(group==='speaker')assert.equal(step.args.chamber,undefined)
  if(group==='speaker')assert.equal(step.args.state,undefined)
  if(group==='speaker')assert.equal(step.args.party,undefined)
 }
 assert.equal(api.speechRankingGrain('Which industries gave the most to the Liberal Party?'),undefined)
 assert.equal(api.speechRankingGrain('How have housing speeches changed each year?'),undefined)
 const scoped=constraints('Which Liberal senators have spoken most about housing since 2022?',{...named,parties:['Liberal']})
 const filtered=api.constrainStep({tool:'count_speeches',args:{party:'Labor',chamber:'representatives'}},scoped,{group_by:{},party:{},chamber:{},since:{}})
 assert.equal(filtered.args.party,'Liberal');assert.equal(filtered.args.chamber,'senate');assert.equal(filtered.args.since,'2022-01-01')
})
test('industry questions keep the industry unit instead of a party total or named donor',()=>{
 const c=constraints('Which industries gave the most to the Liberal Party in 2023-24?',{...named,parties:['Liberal']})
 const step=api.constrainStep({tool:'money_totals',args:{donor:'Vapold Pty Ltd'}},c,{party:{},donor:{},group_by:{},since:{},until:{},from_year:{},to_year:{}})
 assert.equal(step.args.group_by,'industry');assert.equal(step.args.donor,undefined);assert.equal(step.args.party,'Liberal')
 assert.equal(step.args.from_year,2023);assert.equal(step.args.to_year,2023)
})
test('policy voting requests cannot terminate as a single division or one member, while exact bills retain lookup',()=>{
 const c=constraints('How have the Greens voted on climate bills?',{...named,parties:['Greens']})
 const step=api.constrainStep({tool:'division',args:{bill:'Climate Change Bill 2022',person:'Adam Bandt',division_id:'federal-senate-1',date:'2022-09-08'}},c,{party:{},title:{},operation:{}})
 assert.deepEqual(step.args,{operation:'policy_votes',title:'climate',party:'Greens'})
 for(const q of ['How did the Greens vote on the Climate Change Bill 2022?','Who voted against the motion?'])assert.equal(api.partyPolicyTopic(q),undefined)
})
test('broad overviews request years and different record kinds without changing named-person questions',()=>{
 assert.equal(api.broadTopicOverview('What has parliament said about the Murray–Darling Basin?'),true)
 const hint=api.overviewResearchHint('What has parliament said about negative gearing?')
 for(const word of ['4 to 8','kind bill','kind report','committee','since/until'])assert.ok(hint.includes(word))
 assert.equal(api.overviewResearchHint('What has Senator Penny Wong said about the Pacific?'),'')
})
test('quoted source titles preserve the source dash and remapped Unicode citations through repeated grounding',()=>{
 const title='Murray–Darling Basin reform',answer=`On 25 October 2010, the record was titled “${title}”.`
 const source={resource:'speech-1',kind:'speech',title,date:'2010-10-25',url:'https://www.aph.gov.au/record',href:'https://www.aph.gov.au/record',snippet:title,cited:true}
 let out={answer,answer_decision:'answer',sources:[source],citations:{'speech-1/t/body/0':[[0,Array.from(answer).length]]}}
 for(let i=0;i<3;i++)out=api.groundAnswerPayload(out,'What has parliament said about the Murray–Darling Basin?')
 assert.match(out.answer,/Murray–Darling/);assert.equal(out.sources[0].title,title)
 for(const [a,b]of Object.values(out.citations).flat())assert.ok(a>=0&&b>a&&b<=Array.from(out.answer).length)
})

test('joined compound names are rejected for quotation without silently altering source text',async()=>{
 assert.equal(api.joinedSourceName('MurrayDarling Basinreform process.','Murray–Darling Basin'),true)
 assert.equal(api.joinedSourceName('Murray–Darling Basin reform process.','Murray-Darling Basin'),false)
 assert.equal(api.joinedSourceName('Murray-Darling Basin reform process.','Murray–Darling Basin'),false)
 const body='The MurrayDarling Basin reform process needs a better water management plan.'
 const kb=async path=>path==='/find'?{resources:{one:{slug:'speech-1'}}}:{slug:'speech-1',title:'Water debate',origin:{created:'2010-10-25',collaborators:['Member Example']},usermetadata:{classifications:[{labelset:'kind',label:'speech'},{labelset:'state',label:'federal'}]},data:{texts:{body:{value:{body}}}}}
 const found=await api.callTool({kb},'corpus_records',{kind:'speech',query:'Murray–Darling Basin'})
 assert.equal(found.rows.length,0)
 const explicit=await api.callTool({kb},'corpus_records',{kind:'speech',record_id:'speech-1'})
 assert.equal(explicit.rows[0].excerpt,body)
})
test('aggregate selection limits survive writing and repeated final-boundary checks, with the aggregate first',async()=>{
 const q='How have the Greens voted on climate bills?',lead='Across 3 matching divisions on climate from 8 November 2011 to 8 September 2022, a majority of Greens members voted aye in 2 and no in 1. An aye or no is the side of the specific question, not support for or opposition to the policy.'
 const note='Title selection: climate; carbon. Linked bill titles are also matched. This is a title-matched selection, not every vote on the policy area. An aye or no is the side of the specific question, not support for or opposition to the policy.'
 const sources=[{resource:'fact-1',kind:'count',url:'https://opax.com.au/divisions/index.json',href:'https://opax.com.au/divisions/index.json',snippet:lead,title:lead,cited:true},{resource:'coverage',kind:'record',url:'https://opax.com.au/divisions/index.json',href:'https://opax.com.au/divisions/index.json',snippet:note,title:'Coverage of the selected records',cited:true}]
 const answer=lead+'\n\n'+note,input={question:q,period:api.inferPeriod(q),constraints:constraints(q,{...named,parties:['Greens']}),facts:api.writingFacts({answer,sources,citations:{'fact-1/t/body/0':[[0,lead.length]],'coverage/t/body/0':[[lead.length+2,answer.length]]}})}
 let out=api.proseFallback(input)
 for(let i=0;i<2;i++)out=await (await api.withAnswerLanguage(Response.json(out),q)).json()
 assert.ok(out.answer.startsWith(lead),out.answer)
 assert.match(out.answer,/An aye or no is the side of the specific question, not support for or opposition to the policy\./)
 assert.doesNotMatch(out.answer,/\b\d{4}-\d{2}-\d{2}\b|in 0\b|—/)
 assert.match(out.coverage.note,/Title selection: climate; carbon/)
 assert.match(out.coverage.note,/not support for or opposition/)
})
test('a broad topic answer keeps six distinct cited lines; quotes no source holds lose their marks',()=>{
 const q='What has parliament said about the Murray–Darling Basin?'
 const sources=Array.from({length:6},(_,i)=>({resource:'speech-'+i,kind:'speech',title:`Murray–Darling Basin debate ${i}, 201${i}-10-25`,date:`201${i}-10-25`,speaker:`Speaker ${i}`,url:`https://www.aph.gov.au/record/${i}`,href:`https://www.aph.gov.au/record/${i}`,snippet:'The Murray–Darling Basin needs better water management.',cited:true}))
 const lines=sources.map(s=>`On ${s.date}, ${s.speaker} said “The Basin belongs to Martians”.`),answer=lines.join('\n')
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',sources,citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,answer.length]]]))},q)
 assert.equal(out.coherence,undefined)
 assert.equal(Object.keys(out.citations).length,6)
 assert.equal(out.answer.split('\n').length,6)
 assert.match(out.answer,/Speaker 0 said The Basin belongs to Martians\./)
 assert.doesNotMatch(out.answer,/[“”]/)
})

test('policy representative wording and source punctuation survive the final answer boundary',async()=>{
 const question='How have the Greens voted on climate bills?'
 const lead='Across 1 matching division on climate from 16 May 2024 to 16 May 2024, a majority of Greens members voted no in 1. An aye or no is the side of the specific question, not support for or opposition to the policy.'
 const representative='On 16 May 2024, Greens senators voted 0 ayes and 10 noes on Climate Bill — Second Reading.'
 const facts=[lead,representative].map((text,i)=>({id:i+1,text,source:{resource:'fact-'+i,kind:i?'record':'count',url:i?'https://opax.com.au/doc/division-federal-senate-701':'https://opax.com.au/divisions/index.json',snippet:text,title:text,cited:true}}))
 let out=api.proseFallback({question,period:api.inferPeriod(question),constraints:constraints(question,{...named,parties:['Greens']}),facts})
 for(let i=0;i<2;i++)out=await (await api.withAnswerLanguage(Response.json(out),question)).json()
 assert.ok(out.answer.startsWith(lead),out.answer)
 assert.ok(out.answer.includes(representative.replace(/ — /g,', ')),out.answer)
 assert.doesNotMatch(out.answer,/\b\d{4}-\d{2}-\d{2}\b|\bin 0\b|\b0 had\b/)
 assert.equal(Object.keys(out.citations).length,2)
})

test('representative division titles retain repeated procedural suffixes when checked points are appended',async()=>{
 const question='How have the Greens voted on climate bills?'
 const lines=[
  'On 16 September 2026, Greens senators voted 10 ayes and 0 noes on Documents — Climate Change; Order for the Production of Documents.',
  'On 15 October 2026, Greens senators voted 0 ayes and 7 noes on DOCUMENTS - Department of Climate Change, Energy, the Environment and Water; Order for the Production of Documents.',
 ]
 const answer=lines.join('\n\n'),offset=Array.from(lines[0]+'\n\n').length
 const points={answer,answer_decision:'answer',sources:lines.map((text,i)=>({resource:'fact-'+i,kind:'record',url:'https://opax.com.au/doc/division-federal-senate-'+i,title:text,snippet:text,cited:true})),citations:{'fact-0/t/body/0':[[0,offset-2]],'fact-1/t/body/0':[[offset,Array.from(answer).length]]}}
 let out=api.appendWrittenPoints({answer:'',sources:[],citations:{}},points)
 assert.equal(out.answer,answer,'complete titles survive point composition')
 for(let i=0;i<2;i++)out=await (await api.withAnswerLanguage(Response.json(out),question)).json()
 assert.equal(out.answer,answer.replace(/ — /g,', '))
 for(const ranges of Object.values(out.citations))for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(out.answer).length)
 assert.equal(api.appendWrittenPoints(out,points).answer,answer.replace(/ — /g,', '),'the same complete division line is still deduplicated')
})

test('member and party ranking prose keeps the complete requested grain and ordered leaders without a writer turn',()=>{
 for(const [q,prefix,names]of [['Which members have spoken most about housing affordability since 2022?','person:',['First Person','Second Person','Third Person']],['Which party has spoken most about housing affordability since 2022?','party:',['Labor','Liberal','Greens']]]){
  const facts=names.map((name,i)=>({id:i+1,text:`${name}: ${100-i*20} chamber speeches labelled housing from 2022-01-01`,source:{resource:'fact-'+i,kind:'count',url:'https://opax.com.au/search',href:'https://opax.com.au/search',snippet:`${name}: ${100-i*20} chamber speeches labelled housing from 2022-01-01`,entities:[prefix+name],cited:true}}))
  facts.push({id:4,text:'Wrong grain: 9999 chamber speeches labelled housing from 2022-01-01',source:{resource:'wrong',kind:'count',url:'https://opax.com.au/search',entities:[(prefix==='person:'?'party:':'person:')+'Wrong grain'],cited:true}})
  const out=api.proseFallback({question:q,period:api.inferPeriod(q),constraints:constraints(q),facts})
  assert.ok(out.answer.startsWith(names[0]),out.answer)
  for(const name of names)assert.ok(out.answer.includes(name))
  assert.equal((out.answer.match(/from 1 January 2022/g)??[]).length,1)
  assert.doesNotMatch(out.answer,/\b\d{4}-\d{2}-\d{2}\b/)
  assert.doesNotMatch(out.answer,/Wrong grain|9999/)
  assert.equal(Object.keys(out.citations).length,3)
 }
})

test('an incidental party aggregate cannot replace a broad topic overview',()=>{
 const text='Across 3 matching divisions on water from 8 November 2011 to 8 September 2022, a majority of Greens members voted aye in 2 and no in 1.'
 const facts=[{id:1,text,source:{resource:'fact-1',kind:'count',url:'https://opax.com.au/divisions/index.json',snippet:text,cited:true}}]
 assert.equal(api.recordAnswerLines({question:'What has parliament said about the Murray–Darling Basin?',period:{kind:'all'},facts}),null)
})

test('broad overviews retain policy substance instead of bill lifecycle filler, within requested dates',()=>{
 assert.equal(api.overviewContextOnly('On 6 September 2023, the Water Amendment Bill was first introduced.'),true)
 assert.equal(api.overviewContextOnly('The report recommended returning water to the river.'),false)
 assert.match(api.overviewResearchHint('What has parliament said about the Basin?'),/until 2012-12-31.*since 2013-01-01/)
 assert.doesNotMatch(api.overviewResearchHint('What has parliament said about the Basin since 2022?',true),/until 2012-12-31/)
})


test('a possessive topic frame does not steal the speaker of later quoted clauses, and the audit never cuts it',()=>{
 const answer='On the Basin Plan’s implementation, Penny Wong said the basin “needs more water”, and described it as “in crisis”.'
 const snippet='The basin needs more water and is in crisis.'
 const source={resource:'speech-1',kind:'speech',title:'Water debate',speaker:'Penny Wong',date:'2019-09-11',url:'https://www.aph.gov.au/record',href:'https://www.aph.gov.au/record',snippet,cited:true}
 const payload={answer,answer_decision:'answer',sources:[source],citations:{'speech-1/t/body/0':[[0,Array.from(answer).length]]}}
 const audit=api.auditPayload('What has parliament said about the Murray–Darling Basin?',payload)
 assert.equal(audit.findings.filter(f=>f.type==='quote').length,0)
 assert.ok(audit.findings.some(f=>f.entity==='Basin Plan'),'unsupported framing still fails')
 const out=api.groundAnswerPayload(payload,'What has parliament said about the Murray–Darling Basin?')
 assert.equal(out.answer,answer)
 for(const [a,b]of Object.values(out.citations).flat())assert.ok(a>=0&&b>a&&b<=Array.from(out.answer).length)
 const wrong={...payload,answer:'Sarah Hanson-Young’s words were “needs more water”.'}
 assert.ok(api.auditPayload('What was said?',wrong).findings.some(f=>f.type==='quote'&&f.entity==='Sarah Hanson-Young'))
})
test('joined adjacent proper names are omitted without editing the source words',()=>{
 assert.equal(api.joinedSourceName('The Murray DarlingBasin is under pressure.','Murray–Darling Basin'),true)
 assert.equal(api.joinedSourceName('Federal management of theMurray Riverwas called for.','Murray–Darling Basin Water Act 2007'),true)
 assert.equal(api.joinedSourceName('The Basinwas under pressure.','Murray–Darling Basin'),true)
 assert.equal(api.joinedSourceName('The Murray-Darling Basin is under pressure.','Murray–Darling Basin'),false)
 assert.equal(api.joinedSourceName('The Murray River was under pressure.','Murray–Darling Basin'),false)
 assert.equal(api.joinedSourceName('Murray Macdonald spoke about water.','Murray Macdonald'),false)
})


test('policy aggregates preserve the whole requested chamber and period scope',()=>{
 const c=constraints('How have the Greens voted on climate bills?',{...named,parties:['Greens']})
 const args=api.constrainStep({tool:'division',args:{operation:'policy_votes',title:'climate',chamber:'representatives',jurisdiction:'nsw',since:'2022-01-01'}},c,{party:{},title:{},operation:{},chamber:{},jurisdiction:{},since:{},until:{}}).args
 assert.equal(args.jurisdiction,'federal');assert.equal(args.chamber,undefined);assert.equal(args.since,undefined)
 const senate=api.constrainStep({tool:'division',args:{operation:'policy_votes',title:'climate'}},{...c,chamber:'senate',dated:true,period:{kind:'window',since:'2022-01-01'}},{party:{},title:{},operation:{},chamber:{},jurisdiction:{},since:{},until:{}}).args
 assert.equal(senate.chamber,'senate');assert.equal(senate.since,'2022-01-01')
})
test('Basin topic searches cover the framework, plan and recovery without changing named or dated questions',()=>{
 const q='What has parliament said about the Murray–Darling Basin?',plan=api.overviewSearchPlan(q)
 assert.equal(plan.length,3);assert.ok(plan.some(p=>p.query.includes('Water Act 2007')));assert.ok(plan.some(p=>p.query.includes('buybacks')));assert.ok(plan.some(p=>p.query.includes('diversion limits')))
 assert.deepEqual(api.overviewSearchPlan(q,true),[]);assert.deepEqual(api.overviewSearchPlan(q,false,'vic'),[])
 assert.deepEqual(api.overviewSearchPlan('What did Senator Andrew Murray say about the Murray-Darling Basin?'),[])
})
test('typed ranking entities survive selection into the real writer instead of being lost before prose',async()=>{
 const question='Which members have spoken most about housing across the whole record?'
 const step={tool:'count_speeches',args:{topic:'housing',group_by:'speaker'}}
 const result={tool:'count_speeches',ok:true,data:{group_by:'speaker',filter:{topic:'housing'},described:'chamber speeches labelled housing',rows:[{name:'First Person',count:100},{name:'Second Person',count:80},{name:'Third Person',count:60}]},cite:[100,80,60].map(value=>({kind:'count',label:'Counted chamber speeches',value,url:'https://opax.com.au/search?kind=speech&topic=housing'})),notes:[]}
 let input
 const writer=api.createAnswerWriter({modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
 const research=Object.assign(async()=>({steps:[step],results:[result],selected:[1,2,3],rounds:1,tokens:{input:0,output:0},constraints:constraints(question)}),{write:async(...args)=>{input=args[0];return writer(...args)}})
 const run=await api.runAgentic(question,{asset:async()=>null,research,generate:async()=>{throw Error('No planner or writer model needed')}},async()=>{},40000,api.inferPeriod(question),{},named)
 assert.equal(run.answered,true)
 for(const name of ['First Person','Second Person','Third Person'])assert.ok(input.facts.some(f=>f.source.entities?.includes('person:'+name)))
 for(const name of ['First Person','Second Person','Third Person'])assert.ok(run.qualitative.answer.includes(name))
 assert.equal(run.qualitative.sources.filter(s=>s.cited).length,3)
})

test('named-person overview depth leaves exact-bill and unresolved-person guards unchanged',()=>{
 assert.match(api.personOverviewHint('What has Senator Penny Wong said about the Pacific?',['Penny Wong']),/4 to 6 dated points/)
 assert.equal(api.personOverviewHint('What has parliament said about water?',[]),'')
 assert.equal(api.personOverviewHint('What has David Gillespie said about the bill?',['David Gillespie'],true),'')
})

test('a loop person overview retains four verified dated records after verbose claims are removed',()=>{
 const q='What has Senator Penny Wong said about the Pacific?'
 const complete='I have in my first year as foreign minister visited every member of the Pacific Islands Forum, some of them more than once, and I have said the same things.'
 const phrases=['Pacific priorities guide our partnerships.','Pacific sovereignty matters to regional security.','Climate change is a Pacific priority.',complete+' Our Pacific partnerships will']
 const sources=phrases.map((snippet,i)=>({resource:'speech-'+i,slug:'speech-'+i,kind:'speech',speaker:'Penny Wong',title:'Pacific statement',date:`202${i+2}-11-13`,url:'https://www.aph.gov.au/record/'+i,href:'https://www.aph.gov.au/record/'+i,snippet,cited:i<2}))
 const answer='Penny Wong said “Pacific priorities guide our partnerships.”\nPenny Wong said “Pacific sovereignty matters to regional security.”'
 const payload={answer,answer_decision:'answer',research:{mode:'loop'},answer_scope:{people:['Penny Wong']},sources,citations:{'speech-0/t/body/0':[[0,answer.indexOf('\n')]],'speech-1/t/body/0':[[answer.indexOf('\n')+1,answer.length]]}}
 const out=api.groundAnswerPayload(payload,q)
 assert.equal(out.sources.filter(s=>s.cited).length,4)
 assert.match(out.answer,/13 November 2024/);assert.match(out.answer,/13 November 2025/)
 assert.ok(out.answer.includes(complete));assert.doesNotMatch(out.answer,/and I”|partnerships will”/)
 assert.equal(api.auditPayload(q,out).findings.length,0)
 const refusal=api.groundAnswerPayload({...payload,answer:'I cannot provide private information.',answer_decision:'refusal'},q)
 assert.equal(refusal.answer,'I cannot provide private information.')
})


test('a repaired invalid overview call does not skip the framework search',async()=>{
 const q='What has parliament said about the Murray–Darling Basin?',seen=[]
 const call=(toolName,input)=>({type:'tool-call',toolName,toolCallId:toolName,input:JSON.stringify(input)})
 const reply=content=>({content,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
 const search=limit=>reply([call('corpus_records',{kind:'speech',query:'Murray-Darling Basin',limit})])
 const model=new MockLanguageModelV4({doGenerate:[search(99),search(1),search(1),search(1),reply([call('decline',{reason:'ambiguous'})])]})
 const deps={asset:async()=>null,kb:async()=>({resources:{}}),origin:'https://opax.test'}
 const run=api.createResearch({model,inputPrice:0.1,outputPrice:0.3,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
 await run(q,{deps,period:api.inferPeriod(q),named,signal:new AbortController().signal,progress:async()=>{},scope:step=>step,execute:async(step,round,action)=>{seen.push(step);return action(deps)}})
 const searches=seen.filter(s=>s.tool==='corpus_records')
 assert.deepEqual(searches.map(s=>s.args.query),api.overviewSearchPlan(q).map(s=>s.query))
 assert.equal(model.doGenerateCalls.length,5)
})
