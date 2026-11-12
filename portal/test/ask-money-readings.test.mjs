// A money question with a period or an open name gets an answer, never only
// a question back (Jake, 13 Nov 2026, live web Ask: "Who receives the most
// funding from fossil fuel donors last few years since 2023" answered only
// "Choose the scope"). Stored payloads: the published graph and fixtures; no
// model, provider or network call.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {build} from 'esbuild'
import {graphRanking,dollars} from './money-ranking-eval.mjs'

const bundle=async(entry)=>{
 const b=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
}
const {federalPartyMoneyAnswer,rankedMoneyAnswer}=await bundle('../src/ask-money-routing.ts').then(async m=>({...m,rankedMoneyAnswer:(await bundle('../src/ask-money.ts')).rankedMoneyAnswer}))
const {questionKey,sameQuestion}=await bundle('../src/question-key.ts')
const graph=JSON.parse(await readFile(new URL('../public/graph/money.json',import.meta.url),'utf8'))
const assets={fetch:async req=>{
 const path=new URL(req.url).pathname
 try{return new Response(await readFile(new URL('../public'+path,import.meta.url)))}catch{return new Response('',{status:404})}
}}
// The Worker's order (src/index.ts): the party/industry route, then the ranking route.
const ask=async question=>await federalPartyMoneyAnswer({question},assets)??await rankedMoneyAnswer({question},assets)
const firstSentence=answer=>answer.match(/^.*?[.!?](?=\s|$)/s)?.[0]??answer
const JAKE='Who receives the most funding from fossil fuel donors last few years since 2023'

// Each answer leads with the top recipient and its amount from the published
// graph, states the reading in one line, and offers the other readings.
for(const [question,reading,from,to] of [
 [JAKE,'Reading “since 2023” as the 2022–23 to 2024–25 disclosure years.',2022,2024],
 ['Who receives the most funding from fossil fuel donors since 2023?','Reading “since 2023” as the 2022–23 to 2024–25 disclosure years.',2022,2024],
 ['Who receives the most funding from fossil fuel donors in the last few years?','Reading “in the last few years” as the last three published disclosure years, 2022–23 to 2024–25.',2022,2024],
 ['Who receives the most funding from fossil fuel donors last year?','Reading “last year” as 2024–25, the latest published disclosure year.',2024,2024],
])test('a period is read, stated and answered with ranked figures: '+question,async()=>{
 const out=await ask(question)
 assert.equal(out?.answer_status,'calculated',question)
 const expected=graphRanking(graph,{industry:'fossil_fuels',from,to})
 const top=expected.rows[0],opening=firstSentence(out.answer)
 assert.ok(opening.startsWith(`**${top.name}**`),opening)
 assert.ok(opening.includes(dollars(top.cents)),opening)
 assert.equal(out.money_reading,reading)
 // The reading is its own line, straight after the opening paragraph.
 assert.equal(out.answer.split('\n\n')[1],reading)
 // Ranked rows, donation-only amounts per year and in total, labelled.
 for(const row of expected.rows)assert.match(out.answer,new RegExp(`\\| ${row.name} \\| ${dollars(row.cents).replace('$','\\$')} \\|`))
 for(let y=from;y<=to;y++)assert.match(out.answer,new RegExp(`Donations ${y}–${String((y+1)%100).padStart(2,'0')}`))
 assert.match(out.answer,/Donations received \(AEC receipt type: Donation Received\): \$/)
 assert.match(out.measure_label,/AEC receipt type/)
 // Cited, with the money explorer filtered to the window it read.
 assert.ok(out.sources.length>1&&Object.keys(out.citations).length>0)
 const map=new URL(out.answer.match(/\[See all receipt types on the money map\]\(([^)]+)\)/)[1])
 assert.equal(map.searchParams.get('industry'),'fossil_fuels');assert.equal(map.searchParams.get('from'),String(from));assert.equal(map.searchParams.get('to'),String(to))
 // Other readings are one tap away, and none of them is the question asked.
 const labels=out.money_followups.map(f=>f.label)
 assert.ok(labels.includes('All years'),labels.join())
 if(from!==to)assert.ok(labels.includes('2024–25 only'),labels.join())
 for(const f of out.money_followups){
  assert.equal(sameQuestion(f.question,question),false,f.question)
  assert.ok(out.answer.includes(`[${f.label}](/ask?q=`),f.label)
  const next=await ask(f.question)
  assert.equal(next.answer_status,'calculated',f.question)
 }
 assert.doesNotMatch(out.answer,/Choose the (?:scope|financial years)/)
})

test('a name that matches several parties answers for the one with the most receipts, says so, and offers the other',async()=>{
 const fixture={meta:{generated:'2026-11-11'},nodes:[
  {id:'donor:example',kind:'donor',label:'Example Holdings Pty Ltd',industry:'mining'},
  {id:'party:Example Left',kind:'party',label:'Example Left',aliases:['Example Alliance']},
  {id:'party:Example Right',kind:'party',label:'Example Right',aliases:['Example Alliance']},
 ],edges:[
  {source:'donor:example',target:'party:Example Left',total:1200,count:2,firstYear:2023,lastYear:2023,byYear:{2023:[1200,2]}},
  {source:'donor:example',target:'party:Example Right',total:5000,count:3,firstYear:2023,lastYear:2024,byYear:{2023:[2000,1],2024:[3000,2]}},
 ]}
 const question='Who gives the most money to Example Alliance?'
 const out=await rankedMoneyAnswer({question},{fetch:async()=>Response.json(fixture)})
 assert.equal(out.answer_status,'calculated')
 assert.match(firstSentence(out.answer),/Example Holdings Pty Ltd: \$5,000/)
 assert.equal(out.money_reading,'That name matches Example Right and Example Left in this map; this answer is for Example Right, the party with the most disclosed receipts.')
 assert.deepEqual(out.money_followups.map(f=>f.label),['Example Left'])
 const other=await rankedMoneyAnswer({question:out.money_followups[0].question},{fetch:async()=>Response.json(fixture)})
 assert.equal(other.answer_status,'calculated');assert.match(firstSentence(other.answer),/\$1,200/)
})

test('“Ask something else” and money follow-ups never repeat the question just asked',async()=>{
 // The shared rule: same words, or the asked question without its period phrase.
 for(const [candidate,asked] of [
  ['Who receives the most funding from fossil fuel donors?',JAKE],
  ['who receives the most funding from fossil fuel donors',JAKE+'?'],
  ['Who takes the most money from the gambling lobby?','Who takes the most money from the gambling lobby in 2023–24?'],
  ['Who takes the most money from the gambling lobby?','Who takes the most money from the gambling lobby over the past three years?'],
  ['Who takes the most money from the gambling lobby?','Who takes the most money from the gambling lobby recently?'],
 ])assert.equal(sameQuestion(candidate,asked),true,candidate+' | '+asked)
 for(const [candidate,asked] of [
  ['Who takes the most money from the gambling lobby?',JAKE],
  ['Who takes the most money from the gambling lobby in 2023?','Who takes the most money from the gambling lobby?'],
  ['Who donates the most to Labor?','Who donates the most to Liberal?'],
 ])assert.equal(sameQuestion(candidate,asked),false,candidate+' | '+asked)

 // public/app.js carries the same rule for the web's "Ask something else".
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8')
 const block=app.slice(app.indexOf('// question-key:begin'),app.indexOf('// question-key:end'))
 const picker=app.slice(app.indexOf('function suggestedQuestions('),app.indexOf('\n}\n',app.indexOf('function suggestedQuestions('))+2)
 const suggestions=JSON.parse(await readFile(new URL('../public/suggestions.json',import.meta.url),'utf8'))
 const context=vm.createContext({featuredSuggestions:suggestions.featured,suggestions:suggestions.questions})
 vm.runInContext(block+'\n'+picker+'\nthis.web={questionKey,sameQuestion,suggestedQuestions}',context)
 const web=context.web
 const samples=[JAKE,...suggestions.featured,...suggestions.questions,'And in 2021–22?','Who funds Labor since 2019-20?','What about the last decade?']
 for(const a of samples){
  assert.equal(web.questionKey(a),questionKey(a),a);assert.equal(web.questionKey(a,true),questionKey(a,true),a)
  for(const b of samples.slice(0,12))assert.equal(web.sameQuestion(a,b),sameQuestion(a,b),a+' | '+b)
 }
 // Jake's screenshot: the list offered his own question without its period.
 const offered=web.suggestedQuestions(JAKE)
 assert.equal(offered.length,4)
 assert.ok(!offered.some(q=>sameQuestion(q,JAKE)),offered.join(' / '))
 assert.ok(!offered.includes('Who receives the most funding from fossil fuel donors?'))
 for(const asked of [...suggestions.featured,...suggestions.questions]){
  const picks=web.suggestedQuestions(asked)
  assert.ok(!picks.some(q=>sameQuestion(q,asked)),asked)
  assert.equal(new Set(picks.map(q=>questionKey(q))).size,picks.length,asked)
 }
})
