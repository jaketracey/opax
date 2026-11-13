import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
const bundled=await build({stdin:{contents:"export {countedMember,titledSpeaker} from './src/ask-member-label';export {countSpeeches} from './src/tools/speech-data';export {tool as money} from './src/tools/money-totals';export {tool as corpus} from './src/tools/corpus-records';export {factSheet,runAgentic,inferPeriod} from './src/agentic-ask';export {writingFacts,proseFallback} from './src/research-writing';export {createAnswerWriter} from './src/research-writer';export {groundAnswerPayload} from './src/research-grounding';export {withAnswerLanguage} from './src/research-response';export {verifyResearchPoints} from './src/research-evidence';export {auditPayload} from './src/research-claim-audit.mjs';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url)))
const named={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const moneyQuestion='Which industries gave the most to the Liberal Party in 2023-24?'
const trendQuestion='Which members have spoken most about housing affordability since 2022?'
const mdbQuestion='What has parliament said about the Murray–Darling Basin?'
function ranges(payload) {
 const size=Array.from(payload.answer).length
 for(const [id,rs] of Object.entries(payload.citations)) {
  assert.ok(payload.sources.some(s=>id===s.resource||id.startsWith(s.resource+'/')),id)
  for(const [a,b] of rs)assert.ok(a>=0&&b>a&&b<=size,JSON.stringify({id,a,b,size}))
 }
 for(const line of payload.answer.split('\n').filter(s=>s.trim())) {
  const at=payload.answer.indexOf(line)+(/^- /.test(line)?2:0),a=Array.from(payload.answer.slice(0,at)).length,b=a+Array.from(line.replace(/^- /,'')).length
  assert.ok(Object.values(payload.citations).flat().some(([from,to])=>from<=a&&to>=b),line)
 }
}
const graph={nodes:[{id:'party:Liberal',label:'Liberal',kind:'party',total:10,count:2,byYear:{2023:[10,2],2024:[1,1]}},...['finance','property','mining'].map((industry,i)=>({id:'d'+i,label:'Fixture '+i,kind:'donor',industry,total:10,count:2,byYear:{2023:[10,2]}}))],edges:[1360509,1120000,737500].map((total,i)=>({source:'d'+i,target:'party:Liberal',total,count:[101,8,16][i],byYear:{2023:[total,[101,8,16][i]],2024:[1,1]}}))}
const moneyResult=async(args={},fixture=graph)=>api.money.handler({asset:async()=>fixture,origin:'https://opax.test'},{party:'Liberal',group_by:'industry',from_year:2023,to_year:2023,...args})
function fromTool(result,question,tool='money_totals') {
 const sheet=api.factSheet([{tool,ok:true,data:result,cite:result.citations.map(c=>({...c,label:c.text})),notes:result.notes}])
 return api.proseFallback({question,period:api.inferPeriod(question),facts:api.writingFacts(undefined,sheet.facts,sheet.notes)})
}

test('industry prose uses a full party name, one singular FY and short cited repeated rows',async()=>{
 const result=await moneyResult()
 let out=fromTool(result,moneyQuestion)
 for(let i=0;i<2;i++)out=await (await api.withAnswerLanguage(Response.json(out),moneyQuestion)).json()
 assert.match(out.answer,/to the Liberal Party in financial year 2023-24 \(1 July 2023 to 30 June 2024\)/)
 assert.match(out.answer,/Property was next, with \$1,120,000 across 8 receipts\./)
 assert.match(out.answer,/Mining recorded \$737,500 across 16 receipts\./)
 assert.equal((out.answer.match(/financial year/g)??[]).length,1)
 assert.equal((out.answer.match(/1 July 2023/g)??[]).length,1)
 assert.doesNotMatch(out.answer,/to Liberal\b|—/)
 assert.match(out.coverage.note,/not every AEC receipt/)
 assert.match(out.coverage.note,/including more than gifts/)
 assert.deepEqual(result.rows.map(r=>[r.total_aud,r.receipts]),[[1360509,101],[1120000,8],[737500,16]])
 ranges(out)
})

test('industry party labels expand for every published recipient and FY ranges stay plural',async()=>{
 const names={Labor:'the Australian Labor Party',Liberal:'the Liberal Party',Nationals:'the National Party of Australia',Greens:'the Australian Greens',LNP:'the Liberal National Party of Queensland','Country Liberal Party':'the Country Liberal Party','One Nation':"Pauline Hanson's One Nation",'United Australia Party':'the United Australia Party','Family First':'the Family First Party',"Katter's Australian Party":"Katter's Australian Party",'Centre Alliance':'Centre Alliance'}
 const actual=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url)))
 assert.deepEqual(actual.nodes.filter(n=>n.kind==='party').map(n=>n.label).sort(),Object.keys(names).sort())
 for(const [party,name] of Object.entries(names)) {
  const fixture=structuredClone(graph);fixture.nodes[0].label=party
  const result=await moneyResult({party,from_year:2023,to_year:2024},fixture)
  assert.ok(result.citations[0].text.includes('to '+name+' in financial years 2023-24 to 2024-25 (1 July 2023 to 30 June 2025)'))
 }
})

test('member labels use only exact OPAX roster names and prints, with no guessed surname expansion',()=>{
 assert.deepEqual(api.countedMember('Steel',roster),{name:'Chris Steel',parliaments:['ACT Legislative Assembly']})
 assert.deepEqual(api.countedMember('Berry',roster),{name:'Berry',parliaments:['ACT Legislative Assembly']})
 assert.equal(api.countedMember('Unknown',roster),undefined)
 assert.equal(api.countedMember('Bery',roster),undefined)
 assert.equal(api.countedMember('Berry',{people:[{name:'Carol Berry',chambers:['representatives']}]}),undefined)
 assert.equal(api.countedMember('Berry',{people:[{name:'Yvette Berry',prints:['Berry'],chambers:['act_la']},{name:'Carol Berry',prints:['Berry'],chambers:['representatives']}]}),undefined)
 const own={people:[{name:'Berry',full:'Yvette Berry',chambers:['act_la']}]}
 assert.equal(api.countedMember('Berry',own).name,'Yvette Berry','a full name is displayed when OPAX actually records it')
})

test('member ranking metadata survives tool selection and writing, with the period once and mixed-parliament notice',async()=>{
 const names=['Katy Gallagher','Berry','Steel','Harriet Shing']
 const deps={asset:async()=>roster,origin:'https://opax.test',kb:async(path,body)=>path==='/catalog'?{fulltext:{total:660,facets:{'/u/o':Object.fromEntries(names.map((name,i)=>['/u/o/'+name,183-i*10]))}}}:{fulltext:{total:[183,162,158,157][names.findIndex(name=>JSON.stringify(body).includes(name))]??660}}}
 const result=await api.countSpeeches(deps,{topic:'housing',group_by:'speaker',limit:4,since:'2022-01-01'})
 assert.equal(result.data.rows.find(r=>r.name==='Steel').member.name,'Chris Steel')
 assert.match(result.cite[result.data.rows.findIndex(r=>r.name==='Steel')].url,/speaker=Steel/,'identity display never changes the counted filter')
 const step={tool:'count_speeches',args:{topic:'housing',group_by:'speaker',since:'2022-01-01'}}
 const writer=api.createAnswerWriter({modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
 const research=Object.assign(async()=>({steps:[step],results:[{...result,data:{...result.data,filter:{...result.data.filter,topic:'gambling'},described:'chamber speeches labelled gambling from 2022-01-01'}},result],selected:[5],rounds:1,tokens:{input:0,output:0}}),{write:writer})
 const run=await api.runAgentic(trendQuestion,{...deps,research,generate:async()=>{throw Error('A deterministic ranking needs no model')}},async()=>{},40000,api.inferPeriod(trendQuestion),{},named)
 let out=run.qualitative
 assert.ok(out,run.answer)
 for(let i=0;i<2;i++)out=await (await api.withAnswerLanguage(Response.json(out),trendQuestion)).json()
 assert.match(out.answer,/Katy Gallagher \(Australian Parliament\)/)
 assert.match(out.answer,/Berry \(ACT Legislative Assembly\)/)
 assert.match(out.answer,/Chris Steel \(ACT Legislative Assembly\)/)
 assert.match(out.answer,/Harriet Shing \(Parliament of Victoria\)/)
 assert.match(out.answer,/This ranking spans more than one parliament\./)
 assert.equal((out.answer.match(/from 1 January 2022/g)??[]).length,1,out.answer)
 assert.doesNotMatch(out.answer,/Yvette|Carol|gambling|—/)
 assert.ok(out.answer.indexOf('Berry')<out.answer.indexOf('Chris Steel'),'surname-only rows retain their original rank even when the model selects only the leading row')
 assert.ok(out.sources.some(s=>s.cited&&s.url==='https://opax.test/parliamentarians.json'))
 assert.equal(api.auditPayload(trendQuestion,out).findings.length,0)
 const wrong={...out,answer:out.answer.replace('183 chamber speeches','184 chamber speeches')}
 assert.ok(api.auditPayload(trendQuestion,wrong).findings.some(f=>f.type==='figure'),'a parliament qualifier must never admit a wrong count')
 ranges(out)
})

test('one parliament has no mixed-parliament notice and different row periods are retained',()=>{
 const make=(name,n,period)=>({id:n,text:`${name}: ${n} chamber speeches labelled housing from ${period}`,cite:{kind:'count',url:'https://opax.test/search',label:name},entities:['person:'+name],member:{name,parliaments:['Australian Parliament']}})
 const facts=api.writingFacts(undefined,[make('First Member',3,'2022-01-01'),make('Second Member',2,'2023-01-01')])
 const out=api.proseFallback({question:trendQuestion,period:api.inferPeriod(trendQuestion),facts})
 assert.doesNotMatch(out.answer,/more than one parliament/)
 assert.match(out.answer,/1 January 2022/);assert.match(out.answer,/1 January 2023/)
})

test('missing speech collaborators resolve only exact full names in record titles, never anonymous or multi-speaker records',async()=>{
 const record={slug:'speech-820350',title:'Sarah Hanson-Young — Bills — 2012-11-20',origin:{created:'2012-11-20'},usermetadata:{classifications:[{labelset:'kind',label:'speech'}]},data:{texts:{body:{value:{body:'A weak Basin Plan locks in failure for the river system.'}}}}}
 const env={asset:async()=>roster,kb:async()=>record,origin:'https://opax.test'}
 const read=async()=>api.corpus.handler(env,{kind:'speech',record_id:record.slug})
 const resolved=(await read()).rows[0]
 assert.equal(resolved.speaker,'Sarah Hanson-Young')
 assert.equal(resolved.speaker_attribution,'record title')
 record.title='Someone Unknown — Bills — 2012-11-20'
 assert.equal((await read()).rows[0].speaker,null)
 record.title='Sarah Hanson-Young — Bills — 2012-11-20'
 record.usermetadata.classifications.push({labelset:'speaker_type',label:'multi_speaker'})
 assert.equal((await read()).rows[0].speaker,null)
 assert.equal(api.titledSpeaker('Hanson-Young — Bills',roster),undefined)
})

test('broad overview keeps each distinct point as written, an identical anonymous point once',()=>{
 const speakers=['Tony Burke','Amanda Rishworth','Sarah Hanson-Young','Mehreen Faruqi','Tony Zappia',undefined]
 const text='The Basin Plan needs better protection for the river system.'
 const passages=new Map(speakers.map((speaker,i)=>{const id=`speech-${i}/t/body/0`;return [id,{id,resource:'speech-'+i,slug:'speech-'+i,title:speaker??'Basin debate',text,url:'https://opax.test/doc/speech-'+i,kind:'speech',speaker,date:'2012-11-20'}]}))
 const points=[...passages.values()].map(p=>({claim:`${p.speaker==='Sarah Hanson-Young'||!p.speaker?'A speaker':p.speaker} said the Basin Plan needs better protection for the river system.`,id:p.id,quote:text}))
 const out=api.verifyResearchPoints(points,passages,mdbQuestion,named,false,roster)
 assert.ok(out)
 assert.equal(out.answer.split('\n').filter(Boolean).length,5)
 assert.equal((out.answer.match(/A speaker said/g)??[]).length,1)
 ranges(out)
})
