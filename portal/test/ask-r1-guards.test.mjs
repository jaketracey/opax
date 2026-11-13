import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

// Projections of the lead's gate150-run2-results.json. All execution is offline.
const regressions=JSON.parse(readFileSync(new URL('./fixtures/ask-r1-guards.json',import.meta.url),'utf8'))
const built=await build({stdin:{contents:"export * from './src/ask-exact-lookup';export * from './src/ask-scope-intent';export * from './src/ask-constraints';export * from './src/research-writing';export * from './src/research-grounding';export * from './src/ask-attribution';export * from './src/ask-evidence';export {isNamedPositionQuestion} from './src/ask-scope';export {runAgentic,inferPeriod,extractNamedScope,classifyAgentic,fallbackPlan} from './src/agentic-ask';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const asset=path=>{try{return JSON.parse(readFileSync(new URL('../public'+path,import.meta.url),'utf8'))}catch{return null}}
const roster=asset('/parliamentarians.json'),bills=asset('/bills/index.json')
const deps={origin:'https://offline.test',asset:async path=>asset(path),kb:async()=>{throw Error('No retrieval in guard unit tests')},generate:async()=>{throw Error('No model in guard unit tests')}}
const lookup=question=>api.exactRecordLookup(question,deps,api.inferPeriod(question),api.extractNamedScope(question,roster,bills))
const input=row=>({question:row.question,period:api.inferPeriod(row.question),constraints:row.payload.answer_scope,facts:api.writingFacts({answer:'',citations:{},sources:row.payload.research?.pre_writer_sources??row.payload.sources})})
function checkRanges(payload){
 const text=Array.from(payload.answer)
 for(const [id,ranges] of Object.entries(payload.citations)){
  assert.ok(payload.sources.some(s=>s.cited&&(id===s.resource||id.startsWith(s.resource+'/'))),id)
  for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=text.length,`${id}: ${a},${b}/${text.length}`)
 }
}

for(const id of ['NG-OFFS-007','NG-OFFS-009'])test(`${id}: clear clinical and sports requests decline before retrieval`,async()=>{
 const row=regressions[id]
 const run=await api.runAgentic(row.question,{...deps,asset:async()=>{throw Error('Scope must precede all retrieval')}})
 assert.equal(run.qualitative.answer_decision,'refusal');assert.match(run.answer,/OPAX covers Australian parliament/)
 assert.equal(run.tokens.input,0);assert.deepEqual(run.steps,[])
})
test('health and sport in public parliamentary questions remain in scope',()=>{
 for(const q of ['What did senators say about migraine treatment?','Which government grants fund AFL clubs?','What did the minister say about the AFL grand final?','How much public funding supports sports medicine?'])assert.equal(api.offScopeQuestion(q),false,q)
})
for(const id of ['NG-FUTR-002','NG-NREC-009','DV-PRTY-009','BL-INTR-024'])test(`${id}: a repeated absence never becomes its own supporting bullet`,()=>{
 const row=regressions[id],out=api.groundAnswerPayload(structuredClone(row.payload),row.question)
 assert.equal(out.answer,row.payload.answer.split('\n\n')[0]);assert.doesNotMatch(out.answer,/What the records do show/)
 checkRanges(out);assert.deepEqual(api.groundAnswerPayload(out,row.question).answer,out.answer)
})
test('BL-INTR-024: bracketed reintroduction years match the lifecycle title and discovery record',async()=>{
 const row=regressions['BL-INTR-024']
 assert.equal(await lookup(row.question),null)
 const bill=bills.bills.find(b=>b.title==='Foreign Acquisitions Amendment (Agricultural Land) Bill 2010 [2013]')
 assert.equal(bill.introduced,'2010-11-24')
 const c=api.extractAskConstraints(row.question,api.inferPeriod(row.question),api.extractNamedScope(row.question,roster,bills))
 const result={tool:'find_records',ok:true,data:{rows:[{kind:'bill',title:bill.title,url:'/bill/'+bill.key}]},cite:[],notes:[]}
 assert.equal(api.guardExactLookupResult(result,c).data.rows.length,1)
 assert.equal(api.billTitleMatches(bill.title,'Foreign Acquisitions Amendment (Agricultural Land) Bill 2011'),false)
})
test('DV-PRTY-009: voting lead-ins are excluded from the bill title',async()=>{
 const q=regressions['DV-PRTY-009'].question
 assert.equal(api.requestedBillTitle(q),'Fair Work (Registered Organisations) Amendment (Ensuring Integrity No. 2) Bill 2019')
 assert.equal(await lookup(q),null)
})
test('NG-NREC-009: a date with no recorded divisions falls through to the agent instead of a no-record answer',async()=>{
 assert.equal(await lookup(regressions['NG-NREC-009'].question),null)
})
test('an absent lifecycle entry cannot hide a matching division title on the requested date',async()=>{
 const index={divisions:[{key:'federal-senate-example',date:'1993-07-02',slug:'division-example'}]}
 const files={'/bills/index.json':{bills:[]},'/divisions/index.json':index,'/divisions/division-example.json':{name:'Native Title Bill 1993 - Second Reading',date:'1993-07-02'}}
 const q=regressions['NG-NREC-009'].question
 assert.equal(await api.exactRecordLookup(q,{...deps,asset:async path=>files[path]??null},api.inferPeriod(q)),null)
 files['/divisions/division-example.json']=null
 assert.equal(await api.exactRecordLookup(q,{...deps,asset:async path=>files[path]??null},api.inferPeriod(q)),null,'an unavailable title cannot prove absence')
})
test('NG-FALS-009: the checked party correction leads, climate votes occur once, and citations stay bound',async()=>{
 const row=regressions['NG-FALS-009'],correction=await lookup(row.question)
 assert.match(correction.answer.answer,/^Vanessa Bleyer is recorded as Greens, not Liberal\./)
 const out=api.groundAnswerPayload(api.prependLookupCorrection(structuredClone(row.payload),correction.answer),row.question)
 assert.match(out.answer,/^Vanessa Bleyer is recorded as Greens, not Liberal\./)
 assert.equal((out.answer.match(/Vanessa Bleyer voted in 1 divisions/g)??[]).length,1)
 assert.equal((out.answer.match(/recorded as Greens, not Liberal/g)??[]).length,1);checkRanges(out)
})
test('MN-GRNT-001: courtesy lead-ins do not name Harry Quick and a named grant total keeps its recipient',()=>{
 const row=regressions['MN-GRNT-001'],named=api.extractNamedScope(row.question,roster,bills)
 assert.deepEqual(named.people,[])
 const c=api.extractAskConstraints(row.question,api.inferPeriod(row.question),named)
 const out=api.constrainStep({tool:'grants',args:{query:'SA Department for Health and Wellbeing'}},c,{recipient:{},operation:{},query:{}})
 assert.equal(out.args.recipient,'South Australian Department for Health and Wellbeing');assert.equal(out.args.operation,'totals');assert.equal(out.args.query,undefined)
 assert.deepEqual(api.extractNamedScope('What grants did Harry Quick discuss?',roster,bills).people,['Harry Quick'])
 assert.equal(api.extractAskConstraints('How much was the largest federal grant to Example University?',api.inferPeriod(''),{people:[],parties:[]}).grantRecipient,undefined)
})
test('TT-SPCH-003: party speech comparisons use counts and cannot enter the position guard',()=>{
 const q=regressions['TT-SPCH-003'].question,body={query:q,prompt:{system:'You explain Australian politicians’ documented positions from primary records.'}}
 assert.equal(api.isPositionBody(body),false);assert.equal(api.guardPositionAnswer({answer:'Recorded comparison.'},body).answer,'Recorded comparison.')
 assert.equal(api.classifyAgentic(q).shape,'comparison')
 assert.deepEqual(api.fallbackPlan(q).steps.map(s=>s.args.party),['Greens','Nationals'])
 assert.ok(api.fallbackPlan(q).steps.every(s=>s.tool==='count_speeches'&&!s.args.topic))
 assert.ok(api.fallbackPlan('Did the Greens or Nationals make more speeches about housing?').steps.every(s=>s.args.topic==='housing'))
 assert.equal(api.fallbackPlan('Did the Greens or Nationals make more speeches about quantum dragons?'),null)
 assert.equal(api.isNamedPositionQuestion({question:'How many speeches has Nick McKim made?',speaker:'Nick McKim',kind:'speech'}),false)
 assert.equal(api.isRecordCountQuestion('Show more speeches about housing.'),false)
 assert.equal(api.isRecordCountQuestion('What has Nick McKim said about the total cost of the Housing Bill 2020?'),false)
})
test('MN-CONT-018: a supplier is not sent as the buying agency',()=>{
 const row=regressions['MN-CONT-018'],c=api.extractAskConstraints(row.question,api.inferPeriod(row.question),api.extractNamedScope(row.question,roster,bills))
 const out=api.constrainStep({tool:'contracts',args:{agency:'Centorrino Technologies Pty Ltd'}},c,{agency:{},supplier:{}})
 assert.equal(out.args.supplier,'Centorrino Technologies Pty Ltd');assert.equal(out.args.agency,undefined)
 const actualAgency=api.constrainStep({tool:'contracts',args:{agency:'High Speed Rail Authority'}},c,{agency:{},supplier:{}})
 assert.equal(actualAgency.args.agency,'High Speed Rail Authority')
})
test('DT-TERM-015: the denominator adds the cohort and share without restating the headline count',()=>{
 const row=regressions['DT-TERM-015'],out=api.proseFallback(input(row))
 assert.equal((out.answer.match(/\b176\b/g)??[]).length,1);assert.match(out.answer,/531/);assert.match(out.answer,/33\.15%/)
 checkRanges(out)
})
test('MN-GRNT-014: repeated trailing programme and category fragments are omitted',()=>{
 const row=regressions['MN-GRNT-014'],out=api.distinctSummary(structuredClone(row.payload))
 assert.equal((out.answer.match(/CJBF - Tiwi Islands Workforce Infrastructure and Employ/g)??[]).length,1)
 assert.equal((out.answer.match(/Indigenous Communities/g)??[]).length,1);checkRanges(out)
})
test('NP-INTR-016: a register list keeps fuller company entries instead of repeating bare names',()=>{
 const row=regressions['NP-INTR-016'],out=api.distinctSummary(structuredClone(row.payload))
 assert.equal((out.answer.match(/Agrespond Pty Ltd/g)??[]).length,1)
 assert.equal((out.answer.match(/Mount Barker Mining Pty Ltd/g)??[]).length,1)
 assert.match(out.answer,/consulting, nil/);assert.match(out.answer,/exploration and mining, mining lease, mining equipment/);checkRanges(out)
})
test('duplicate removal remaps Unicode citations and drops an empty supporting section',()=>{
 const answer='😀 Recorded fact.\n\nWhat the records do show:\n\n- 😀 Recorded fact.',payload={answer,citations:{'r/t/body/0':[[0,16],[47,64]]},sources:[{resource:'r',cited:true}]}
 const out=api.distinctSummary(payload);assert.equal(out.answer,'😀 Recorded fact.');checkRanges(out)
 assert.deepEqual(api.distinctSummary(out),out)
})

test('party speech comparison fallback returns both recorded counts after generation fails',async()=>{
 const q=regressions['TT-SPCH-003'].question,calls=[]
 const run=await api.runAgentic(q,{...deps,kb:async(path,body)=>{
  assert.equal(path,'/catalog');calls.push(body)
  return {fulltext:{total:JSON.stringify(body).includes('Nationals')?40048:33072}}
 }})
 assert.equal(run.answered,true);assert.match(run.answer,/Nationals/);assert.match(run.answer,/40,048|40048/)
 assert.match(run.answer,/Greens/);assert.match(run.answer,/33,072|33072/)
 assert.doesNotMatch(run.answer,/establish their position/);assert.equal(calls.length,2)
})
