// Review controls are deliberately added before the implementation fix.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {coherenceCheck,donorRanking} from '../src/research-coherence.mjs'
import {runOne} from '../../scripts/research_eval.mjs'
import {gradeRow} from '../../scripts/research_eval_grade.mjs'
Error.stackTraceLimit=2
const b=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-writing';export * from './src/research-writer';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const hanson=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url)))
const payload=(answer,sources=hanson.payload.sources)=>({answer,sources:structuredClone(sources),citations:{}})
const controls=[
 ['1990 coverage','Who gave the most money to One Nation in 1990?','The disclosed returns cover 1998–99 to 2025–26 and cannot establish the answer for 1990.',{}],
 ['causal refusal','Which donor gave the most money to One Nation to buy its votes?','These disclosed receipts do not establish that money bought votes or influenced policy.',{}],
 ['Smith clarification','Which Smith gave the most money to One Nation?','Please specify which Smith you mean before I compare their disclosed receipts.',{}],
 ['answered false',hanson.question,'There is not enough evidence to answer this question.',{answered:false}],
 ['moderation',hanson.question,'I cannot help with that request.',{answer_status:'moderated'}],
]
for(const [name,q,answer,extra]of controls)for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`protected ${name}: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const p={...payload(answer),...extra,...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})},headers=cache?{'x-opax-cache':'HIT'}:{}
 const r=stream?new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{...headers,'content-type':'text/event-stream'}}):Response.json(p,{headers})
 const wire=await(await api.withAnswerLanguage(r,q)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.equal(out.answer,answer);assert.deepEqual(out.citations,{});assert.equal(out.answered,extra.answered)
 assert.equal(coherenceCheck(q,out).pass,true)
})
for(const q of ['Did Westpac give money to One Nation in most years?','Who gave the most money to Labor?','Who gave the most money to One Nation in 1990?','Who gave the most money to One Nation in Queensland state returns?','Which Smith gave the most money to One Nation?'])test('ranking scope: '+q,()=>{
 assert.deepEqual(donorRanking(q,hanson.payload.sources),[])
 const out=api.groundAnswerPayload(payload('The selected records do not establish the requested answer.'),q)
 assert.doesNotMatch(out.answer,/provided the most/)
})
test('WHY retains surviving checked reasons, never an arbitrary source quotation',()=>{
 const sources=[{resource:'s1',kind:'speech',speaker:'Brenda Gibbs',title:'Detention',snippet:'Labor believed mandatory detention was needed to establish identity, security and health and reduce the risk of absconding.',cited:true},{resource:'s2',kind:'speech',speaker:'Philip Ruddock',title:'Detention',snippet:'That is the obligation—they have to be detained.',cited:true}]
 const valid='Brenda Gibbs said Labor believed mandatory detention was needed to establish identity, security and health and reduce the risk of absconding.'
 const bad='Bill Shorten said “'+('This quotation is not in the selected evidence and must be removed. '.repeat(6))+'”'
 const answer=valid+'\n\n'+bad
 const out=api.groundAnswerPayload({answer,sources,citations:{'s1/t/body/0':[[0,valid.length]],'s2/t/body/0':[[valid.length+2,answer.length]]}},'Why did MPs argue for mandatory detention of asylum seekers?')
 assert.match(out.answer,/Brenda Gibbs.*identity, security and health/);assert.doesNotMatch(out.answer,/Philip Ruddock said/);assert.ok(out.citations['s1/t/body/0'])
})
test('GOLD-M03 never reconstructs or cites unselected USER_CONTEXT',()=>{
 const p=payload('Other records included $999,999.',[{resource:'USER_CONTEXT_0',kind:'grant',title:'Unrelated financial counselling',snippet:'Avery Example: $660,764 grant.',cited:false}]);p.citations={'USER_CONTEXT_0/t/body/0':[[0,p.answer.length]]}
 const out=api.groundAnswerPayload(p,'How much did gambling-industry donors give to each party, and which party spoke most about gambling?')
 assert.deepEqual(out.citations,{});assert.doesNotMatch(out.answer,/660,764/)
})
test('aggregate donor range occurs once, with selection, lower-bound and receipts caveats',()=>{
 const out=api.groundAnswerPayload(structuredClone(hanson.payload),hanson.question)
 assert.match(out.answer,/^Across disclosed returns from 1998[–-]99 to 2025[–-]26 in OPAX.s published selection, Westpac/)
 assert.equal((out.answer.match(/1998[–-]99 to 2025[–-]26/g)??[]).length,1)
 assert.match(out.answer,/floor|lower.bound|under.*threshold/i);assert.match(out.answer,/more than gifts|not.*gifts/i)
 for(const id of Object.keys(out.citations))assert.ok(out.sources.some(s=>s.cited&&id.startsWith(s.resource+'/')))
})
test('PLACE-OLD proseFallback preserves the Census coverage explanation',()=>{
 const text='The requested period is 2005-01-01 to 2005-12-31. This tool covers 2021-01-01 to 2021-12-31, as of 2021-08-10. 2021 Census; published geography. It cannot establish the answer for the requested period; no current figures have been substituted.'
 const out=api.proseFallback({question:'What was the median age in Corangamite in 2005?',period:{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'},facts:[{id:1,text,coverage:true,source:{resource:'fact-2',kind:'record',snippet:text,cited:true}}]})
 assert.match(out.answer,/2021.*Census|Census.*2021/);assert.match(out.answer,/2005/);assert.match(out.answer,/cannot|does not/);assert.ok(out.citations['fact-2/t/body/0'])
})
test('RESEARCH-Q04 drops the empty record refusal beside supported passage points',()=>{
 const text='David Pocock questioned the three ads per hour figure.',source={resource:'s',kind:'speech',speaker:'David Pocock',snippet:text,title:'Gambling reform',cited:true}
 const written=payload('OPAX cannot establish the requested answer from the selected records.',[])
 const out=api.appendWrittenPoints(written,{answer:text,sources:[source],citations:{'s/t/body/0':[[0,text.length]]}})
 assert.equal(out.answer,text);assert.ok(out.citations['s/t/body/0'])
})
test('FOLLOW-PAY a revision cannot drop the required highest-paid subject',async()=>{
 let calls=0;const response=text=>({content:[{type:'text',text:JSON.stringify({sentences:[{text,facts:[calls===1?1:2]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]})
 const model=new MockLanguageModelV4({doGenerate:()=>{calls++;return response(calls===1?'John Howard was Prime Minister, with annual salary entitlements of $288,990, plus an unverified additional payment of $999 and a separate claimed special payment of $888.':'Peter Costello earned $208,406 a year as Treasurer.')}})
 const facts=[['John Howard: $288,990 a year as Prime Minister, 2005-07-01 to 2005-12-31; base $111,150 plus 160%.'],['Peter Costello: $208,406 a year as Treasurer, 2005-07-01 to 2005-12-31; base $111,150 plus 87.5%.']].map(([text],i)=>({id:i+1,text,source:{resource:'fact-'+(i+1),kind:'record',snippet:text,cited:true,title:'Federal pay'}}))
 const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}}),stats={rounds:1,tokens:{input:0,output:0}}
 const out=await write({question:'Who was the highest paid politician in 2005?',period:{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'},facts},stats,undefined,3000)
 assert.match(out.answer,/John Howard/);assert.match(out.answer,/288,990/);assert.ok(out.citations['fact-1/t/body/0'])
 assert.equal(model.doGenerateCalls.length,2);assert.match(JSON.stringify(model.doGenerateCalls[1].prompt),/John Howard/)
})
test('eval harness preserves non-2xx bodies and structured research error evidence',async()=>{
 const body={error:'grounding failed',research:{failure:'grounding',cost_usd:0.012}}
 const out=await runOne({q:{question:'Question'},mode:'loop',base:'http://localhost:8978',fetchImpl:async()=>Response.json(body,{status:503})})
 assert.equal(out.error,'HTTP 503');assert.deepEqual(out.payload,body);assert.match(out.response_body,/grounding failed/)
})
test('equivalent coverage refusals grade identically on both arms',()=>{
 const q={question:'What was the median age in Corangamite in 2005?',expected:{kind:'decline'},must:[]}
 const a=gradeRow(q,payload('The median age in Corangamite for 2005 cannot be established from the available records, which cover only 2021-01-01 to 2021-12-31.',[]))
 const b=gradeRow(q,payload('OPAX cannot establish the requested answer for 2005-01-01 to 2005-12-31 from the selected records.',[]))
 assert.equal(a.refusal,true);assert.equal(b.refusal,true);assert.equal(a.axes.correctness,b.axes.correctness);assert.equal(a.axes.decline,b.axes.decline)
})
test('observed PLACE-OLD Census and available-record refusals both pass the decline rubric',()=>{
 const q={question:'What was the median age in Corangamite in 2005?',expected:{kind:'decline'},must:[]}
 for(const answer of ['The available records do not establish the median age in Corangamite for 2005.','The 2021 Census covers 2021-01-01 to 2021-12-31 and cannot establish the requested answer for 2005-01-01 to 2005-12-31.']){
   const grade=gradeRow(q,payload(answer,[]));assert.equal(grade.refusal,true);assert.equal(grade.axes.decline,'pass')
 }
})
test('PROBE-SENATOR equivalent historical ranking limitations are both declines',()=>{
 const q={question:'Who was the highest paid senator in 2005?',expected:{kind:'decline'},must:[]}
 for(const answer of ['The selected facts do not identify the highest paid senator in 2005.','The selected facts do not identify who the highest paid senator was in 2005.'])assert.equal(gradeRow(q,payload(answer,[])).refusal,true)
})
test('protected limitations still audit any accompanying misattributed claim',()=>{
 const refusal='The selected passages do not establish an exhaustive ranking.',bad='Bill Shorten said “I support the bill”.',answer=refusal+'\n\n'+bad
 const p={answer,sources:[{resource:'s',kind:'speech',speaker:'Avery Example',snippet:'Bill Shorten asked a question. I support the bill.',cited:true}],citations:{'s/t/body/0':[[refusal.length+2,answer.length]]}}
 const out=api.groundAnswerPayload(p,'Which party spoke the most?');assert.match(out.answer,/do not establish/);assert.doesNotMatch(out.answer,/Bill Shorten/);assert.deepEqual(out.citations,{})
})
test('ordinary period fallback preserves protected clarification and causal decisions',async()=>{
 for(const [answer,status]of [['Please specify which Smith you mean.','needs_question'],['The disclosed receipts do not establish that money bought votes.','refused']]){
 const p={answer,answer_status:status,sources:[],citations:{}}
 const out=await(await api.withFallbackPeriod(Response.json(p),{kind:'window',since:'1990-01-01',until:'1990-12-31',label:'1990'})).json();assert.equal(out.answer,answer);assert.equal(out.answer_status,status)
 }
})
for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`RESEARCH-Q04 mixed cached answer: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const prefix='OPAX cannot establish the requested answer from the selected records.',point='David Pocock questioned the three ads per hour figure.',answer=prefix+'\n\n'+point
 const p={answer,sources:[{resource:'s',kind:'speech',speaker:'David Pocock',title:'Gambling reform',snippet:point,cited:true}],citations:{'s/t/body/0':[[prefix.length+2,answer.length]]},...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})}
 const headers=cache?{'x-opax-cache':'HIT'}:{},response=stream?new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{...headers,'content-type':'text/event-stream'}}):Response.json(p,{headers})
 const wire=await(await api.withAnswerLanguage(response,'What did David Pocock say about the gambling bill?')).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.equal(out.answer,point);assert.ok(out.citations['s/t/body/0'])
})
test('a later caveat cannot exempt an affirmative lead from ranking checks',()=>{
 const p=payload('Other donors included National Australia Bank at $19,715. The disclosed receipts do not establish policy influence.')
 const result=coherenceCheck(hanson.question,p);assert.equal(result.rankingLead,false)
})
for(const question of ['Did Westpac give money to One Nation in most years?','Who gave the most money to Labor?','Who gave the most money to One Nation in 1990?'])test('proseFallback itself cannot turn out-of-scope donor facts into a ranking: '+question,()=>{
 const facts=hanson.payload.sources.flatMap((source,i)=>source.snippet.split(/\n+/).map((text,j)=>({id:100*i+j+1,text,source,coverage:source.resource==='coverage'})))
 const out=api.proseFallback({question,period:{kind:'all',label:''},facts})
 assert.doesNotMatch(out.answer,/provided the most|received the most|runners.up|^- /im);assert.match(out.answer,/cannot|do not establish|does not establish/i)
})
test('ranking party scope reads the selected calculation URL, including encoded party labels',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-labor-2023.json',import.meta.url)))
 const bad='Avery Example received $2,000,000.',shift=bad.length+2
 f.payload.answer=bad+'\n\n'+f.payload.answer
 f.payload.citations=Object.fromEntries(Object.entries(f.payload.citations).map(([id,ranges])=>[id,ranges.map(([a,b])=>[a+shift,b+shift])]))
 f.payload.citations['receipt-ranking-1/t/body/0']=[[0,bad.length]]
 // Full original wording remains a veto control; canonical FY wording remains a positive control.
 const blocked=api.groundAnswerPayload(structuredClone(f.payload),f.question);assert.equal(blocked.answer_decision,'limitation');assert.match(blocked.answer,/United Workers Union/);assert.equal(coherenceCheck(f.question,blocked).pass,true)
 const question='Who gave the most money to Labor in 2023–24?',out=api.groundAnswerPayload(f.payload,question);assert.match(out.answer.split('\n')[0],/Pratt Holdings Pty Ltd/);assert.match(out.answer.split('\n')[0],/2,000,000/);assert.match(out.answer.split('\n')[0],/2023[–-]24/);assert.equal(coherenceCheck(question,out).pass,true)
})
test('an affirmative misattributed figure cannot become a protected decision by adding a limitation',()=>{
 const answer='Avery Example was paid $999,999, but the records cannot establish anything further.'
 const p={answer,sources:[{resource:'s',kind:'record',snippet:'Avery Example: $100,000 annual salary.',cited:true}],citations:{'s/t/body/0':[[0,answer.length]]}}
 const out=api.groundAnswerPayload(p,'What was Avery Example paid?');assert.doesNotMatch(out.answer,/999,999/)
})
test('selected by-person counts retain both comparison figures in the direct lead',()=>{
 const question='Compare how often Peter Dutton and Anthony Albanese spoke about immigration.',answer='Peter Dutton spoke about immigration more often than Anthony Albanese.'
 const sources=[['fact-3','244 chamber speeches labelled immigration by Anthony Albanese'],['fact-4','578 chamber speeches labelled immigration by Peter Dutton']].map(([resource,snippet])=>({resource,kind:'count',title:'Selected speech counts',snippet,cited:true}))
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',sources,citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,answer.length]]]))},question)
 assert.match(out.answer.split('\n')[0],/578/);assert.match(out.answer.split('\n')[0],/244/);assert.match(out.answer.split('\n')[0],/Peter Dutton/);assert.match(out.answer.split('\n')[0],/Anthony Albanese/);assert.equal(coherenceCheck(question,out).pass,true)
})
test('proseFallback never turns USER_CONTEXT into selected calculation evidence',()=>{
 const text='Avery Example: $660,764 grant.',source={resource:'USER_CONTEXT_0',kind:'grant',snippet:text,cited:false,title:'Unselected context'}
 const out=api.proseFallback({question:'What did the selected donation records establish?',period:{kind:'all',label:''},facts:[{id:1,text,source}]});assert.deepEqual(out.citations,{});assert.doesNotMatch(out.answer,/660,764/)
})
test('ordinary fallback removes the record heading and retains checked points and citations',()=>{
 const text='David Pocock questioned the three ads per hour figure.',answer='What the record says:\n'+text,source={resource:'s',kind:'speech',speaker:'David Pocock',title:'Gambling reform',snippet:text,cited:true}
 const out=api.groundAnswerPayload({answer,sources:[source],citations:{'s/t/body/0':[[22,answer.length]]}},'What did David Pocock say about the gambling bill?')
 assert.equal(out.answer,text);assert.ok(out.citations['s/t/body/0']);assert.equal(coherenceCheck('What did David Pocock say about the gambling bill?',out).pass,true)
})
test('an incomplete qualitative comparison gets a specific limitation and keeps its checked points',()=>{
 const answer='Terry Young said “I want to set the record straight on nuclear power”.',source={resource:'s',kind:'speech',speaker:'Terry Young',party:'LNP',title:'Nuclear power',snippet:'I want to set the record straight on nuclear power.',cited:true}
 const question='How do Labor and the Coalition differ on nuclear power?',out=api.groundAnswerPayload({answer,sources:[source],citations:{'s/t/body/0':[[0,answer.length]]}},question)
 assert.match(out.answer.split('\n')[0],/do not establish how Labor and the Coalition differ on nuclear power/);assert.match(out.answer,/Terry Young said/);assert.ok(out.citations['s/t/body/0']);assert.equal(coherenceCheck(question,out).pass,true)
})
test('a named donor cannot be replaced by a different selected donor',async()=>{
 const facts=api.writingFacts(undefined,[['Westpac Banking Corporation','40,608,922'],['Vapold Pty Ltd','33,999,963']].map(([name,amount],i)=>({id:i+1,text:`${name} gave Liberal $${amount} (federal disclosures; financial years 1998-99 to 2025-26)`,cite:{kind:'export',url:'https://example.org',label:name}})))
 let calls=0;const model=new MockLanguageModelV4({doGenerate:()=>{calls++;return {content:[{type:'text',text:JSON.stringify({sentences:[{text:calls===1?'Vapold Pty Ltd gave Liberal $33,999,963.':'Westpac Banking Corporation gave Liberal $40,608,922.',facts:[calls===1?2:1]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]}}})
 const stats={rounds:1,tokens:{input:0,output:0}},write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
 const out=await write({question:'How much disclosed funding did Westpac Banking Corporation provide to the Liberal Party?',period:{kind:'all',label:''},facts},stats,undefined,3000)
 assert.match(out.answer,/Liberal disclosed \$40,608,922 in receipts from Westpac Banking Corporation/);assert.ok(out.citations['fact-1/t/body/0']);assert.ok(calls>=1&&calls<=2)
})
test('equivalent selected-excerpt and OPAX limitations use the same refusal rubric',()=>{
 const q={question:'How do Labor and the Coalition differ on nuclear power?',expected:{kind:'decline'},must:[]}
 const answers=['The selected excerpts do not establish how Labor and the Coalition differ on nuclear power.','OPAX cannot establish how Labor and the Coalition differ on nuclear power.']
 const grades=answers.map(answer=>gradeRow(q,payload(answer,[])));assert.ok(grades.every(g=>g.refusal));assert.equal(grades[0].axes.correctness,grades[1].axes.correctness);assert.equal(grades[0].axes.citations,grades[1].axes.citations)
})
test('protected metadata and same-paragraph refusals still remove misattributed quotes',()=>{
 for(const [answer,extra]of [['Bill Shorten said “I support the bill”.',{answered:false}],['The selected records do not establish a ranking. Bill Shorten said “I support the bill”.',{}]]){
 const p={answer,...extra,sources:[{resource:'s',kind:'speech',speaker:'Avery Example',snippet:'Bill Shorten asked a question. I support the bill.',cited:true}],citations:{'s/t/body/0':[[answer.indexOf('Bill Shorten'),answer.length]]}}
 const out=api.groundAnswerPayload(p,'What does the selected record establish?');assert.doesNotMatch(out.answer,/Bill Shorten/);assert.deepEqual(out.citations,{})
 }
})
test('a combined two-year count stays context rather than pretending to answer a year comparison',()=>{
 const question='How many speeches about immigration were made in federal parliament in 2024 compared with 2023?',snippet='1800 chamber speeches labelled immigration in federal parliament from 2023-01-01 to 2024-12-31',answer='There were '+snippet+'.',source={resource:'fact-1',kind:'count',title:snippet,snippet,cited:true}
 const out=api.groundAnswerPayload({answer,sources:[source],citations:{'fact-1/t/body/0':[[0,answer.length]]}},question)
 assert.match(out.answer.split('\n')[0],/do not establish separate.*2023.*2024/);assert.match(out.answer,/1800/);assert.ok(out.citations['fact-1/t/body/0']);assert.equal(coherenceCheck(question,out).pass,true)
})
test('a quoted organisation name containing initials remains one complete ranking lead',()=>{
 const question='Who gives the most money to Queensland LNP?',text='**J.J. RICHARDS & SONS PTY LTD** has the largest disclosed total to LNP in this published selection: **$754,314**.\n**Financial years: 2013–14 to 2026–27.** QLD.\n| Donor | Disclosed receipts |\n| --- | ---: |\n| J.J. RICHARDS & SONS PTY LTD | $754,314 |'
 const source={resource:'fact-14',kind:'record',title:text,url:'https://opax.com.au/money?jur=qld&party=party%3ALNP',snippet:text,cited:true}
 const out=api.proseFallback({question,period:{kind:'all',label:''},facts:[{id:1,text,source}]});assert.equal(coherenceCheck(question,out).pass,true)
})
test('selected receipt periods survive when the writer fact is prose rather than the raw data row',()=>{
 const row={resource:'receipt-ranking-1',kind:'receipt',title:'Shop Distributive & Allied Employees Association: $974,058',url:'https://opax.com.au/money?jur=federal&party=party%3ALabor&from=2019&to=2019',snippet:'Shop Distributive & Allied Employees Association: $974,058, 13 disclosed receipt records. Period: 2019–20.',cited:true}
 const coverage={...row,resource:'receipt-ranking-0',snippet:'Opax added the disclosed receipts matching this question, grouped by donor.'}
 const facts=[{id:1,text:'Shop Distributive & Allied Employees Association has the largest disclosed total: $974,058.',source:row},{id:2,text:coverage.snippet,coverage:true,source:coverage}]
 const blocked=api.proseFallback({question:'Who donates the most to Labor in federal records in 2019?',period:{kind:'all',label:''},facts});assert.equal(blocked.answer_decision,'limitation');assert.doesNotMatch(blocked.answer,/provided the most/)
 const question='Who donates the most to Labor in federal disclosures in 2019–20?',out=api.proseFallback({question,period:{kind:'all',label:''},facts})
 assert.match(out.answer.split('\n')[0],/Shop Distributive.*974,058/);assert.match(out.answer.split('\n')[0],/2019[–-]20/);assert.equal(coherenceCheck(question,out).pass,true)
})
for(const [party,amount]of [['Liberal','40,608,922'],['One Nation','161,787']])test('named donor fallback preserves the giving relationship: '+party,()=>{
 const text=`Westpac Banking Corporation gave ${party} $${amount} (federal disclosures; financial years 1998-99 to 2025-26)`,facts=api.writingFacts(undefined,[{id:1,text,cite:{kind:'export',url:'https://example.org',label:'Selected donor receipts'}}])
 const question=`How much did Westpac give to ${party}?`,out=api.groundAnswerPayload(api.proseFallback({question,period:{kind:'all',label:''},facts}),question)
 assert.match(out.answer,/Westpac Banking Corporation/);assert.ok(out.answer.includes('$'+amount));assert.ok(out.citations['fact-1/t/body/0']);assert.equal(coherenceCheck(question,out).pass,true)
})
test('eval harness also retains a streamed error body when no completion frame arrives',async()=>{
 const body={error:'stream failed',research:{cost_usd:0.002}},wire='event: error\ndata: '+JSON.stringify(body)+'\n\n'
 const out=await runOne({q:{question:'Question'},mode:'loop',base:'http://localhost:8978',fetchImpl:async()=>new Response(wire,{headers:{'content-type':'text/event-stream'}})})
 assert.equal(out.error,'missing SSE done');assert.equal(out.response_body,wire);assert.deepEqual(out.payload,body)
})
test('native donor connections keep their selected recipients and amounts through fallback',()=>{
 const raw=[['Labor','3,651,227.00'],['Liberal','3,542,915.00'],['Nationals','294,480.00']].map(([party,amount],i)=>({id:i+1,text:`Disclosed receipt: Woodside Energy Group Ltd → ${party} — $${amount} in disclosed political receipts; 10 records. Aggregated connection, not an individual gift.`,cite:{kind:'record',url:'https://example.org/money',label:'Selected disclosed receipt'}})),facts=api.writingFacts(undefined,raw),question='Which parties received funding from Woodside?'
 const out=api.groundAnswerPayload(api.proseFallback({question,period:{kind:'all',label:''},facts}),question)
 for(const [party,amount]of [['Labor','3,651,227.00'],['Liberal','3,542,915.00'],['Nationals','294,480.00']]){assert.match(out.answer,new RegExp(party));assert.ok(out.answer.includes('$'+amount))}
 assert.equal(Object.keys(out.citations).length,3);assert.equal(coherenceCheck(question,out).pass,true)
})
test('a generic fallback gap keeps its refusal while naming the requested decade',async()=>{
 const out=await(await api.withFallbackPeriod(Response.json({answer:'This selection does not establish their position on that topic.',answer_status:'evidence_gap',sources:[],citations:{}}),{kind:'window',since:'2010-01-01',until:'2019-12-31',label:'2010s'})).json()
 assert.match(out.answer,/do not establish.*2010-01-01.*2019-12-31/);assert.doesNotMatch(out.answer,/provided the most/)
})
test('equivalent partial numerical answers retain citation grading with a limitation first or last',()=>{
 const fact='There were 1800 chamber speeches labelled immigration from 2023-01-01 to 2024-12-31.',limit='The selected records do not establish separate counts for 2023 and 2024.'
 const q={question:'Compare immigration speech counts in 2023 and 2024.',expected:{kind:'answer'},must:[{type:'required_components'}]},source={resource:'s',kind:'count',snippet:fact,cited:true}
 const grades=[fact+'\n\n'+limit,limit+'\n\n'+fact].map(answer=>gradeRow(q,{answer,sources:[source],citations:{'s/t/body/0':[[answer.indexOf(fact),answer.indexOf(fact)+fact.length]]}}))
 assert.equal(grades[0].axes.citations,'pass');assert.equal(grades[1].axes.citations,'pass');assert.equal(grades[0].axes.decline,grades[1].axes.decline);assert.equal(grades[0].axes.correctness,grades[1].axes.correctness)
})
test('a selected donor profile total survives even when recipient connections are absent',()=>{
 const facts=api.writingFacts(undefined,[{id:9,text:'Donor: Woodside Energy Group Ltd — Fossil fuels. $7,488,622.00 in disclosed political receipts across 278 records.',cite:{kind:'record',url:'https://example.org/money',label:'Donor profile'}}]),question='Which parties received funding from Woodside?'
 const out=api.groundAnswerPayload(api.proseFallback({question,period:{kind:'all',label:''},facts}),question)
 assert.match(out.answer,/Woodside.*7,488,622/);assert.match(out.answer,/do not name which parties/);assert.ok(out.citations['fact-9/t/body/0'])
})
