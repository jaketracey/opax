// An Ask limited to one bill (`bill` on the /api/ask body, the key in /bill/<key>). The app's "Ask about this bill"
// opens Ask scoped to that bill, so every source and citation must be one of the bill's records: its text, its
// record with the summary, and the speeches and divisions the bill file lists. Driven through the real /api/ask
// route, offline, over the real bill files. The knowledge box here applies the request's filter to a pool holding
// the bill's records and records from outside it, as the platform does, so a missing or wrong filter shows up as
// an outside source. The research model fails the test if it is ever called. Speech text is invented.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {StreamingResearchModel as MockLanguageModelV4} from './fixtures/research-scripted-model.mjs'
import {build} from 'esbuild'
import {importBundle} from './fixtures/import-bundle.mjs'
import {loadWorker,offline} from './worker-harness.mjs'
import {budgetDatabase} from './fixtures/research-budget.mjs'
import {AskStream} from './fixtures/research-app-decoders.mjs'

const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
const plugin={name:'scripted-model',setup(b){b.onResolve({filter:/^@openrouter\/ai-sdk-provider$/},()=>({path:'scripted',namespace:'ask-bill'}));b.onLoad({filter:/.*/,namespace:'ask-bill'},()=>({contents:'export const createOpenRouter=()=>()=>globalThis.__researchModel;',loader:'js'}))}}
const publicDir=new URL('../public',import.meta.url).pathname
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,publicDir,ctx,{plugins:[plugin]})
const {askBillKey,billScope,billScopeClause,billScopedBody,inBillScope,BILL_LABEL_ONLY}=await importBundle((await build({entryPoints:[new URL('../src/ask-bill-scope.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false})).outputFiles[0].text,'ask-bill-scope')
const daily=budgetDatabase()
Object.assign(h.env,{OPENROUTER_API_KEY:'test-only-placeholder',AGENTIC_ASK_MODE:'route',RESEARCH_LOOP:'route',AGENTIC_INPUT_USD_PER_MILLION:'0.66',AGENTIC_OUTPUT_USD_PER_MILLION:'1.98',
  COMMUNITY_DB:daily.db,ASK_LIMITER:{limit:async()=>({success:true})},MODEL_LIMITER:{limit:async()=>({success:true})}})
const stored=[]
globalThis.caches={default:{match:async()=>undefined,put:async key=>{stored.push(String(key.url??key))}}}
h.env.GENERATION_CACHE={get:async()=>null,put:async key=>{stored.push(String(key))}}

// The bill in the report: in the Senate at second reading, with no speeches or divisions yet. And an older bill
// whose file lists speeches and divisions, so those kinds are checked too.
const VETERANS='au-federal-s1515',SIBLING='au-federal-s1518',DEBATED='au-federal-r5626'
const file=key=>JSON.parse(readFileSync(`${publicDir}/bills/${key}.json`,'utf8'))
const veterans=file(VETERANS),debated=file(DEBATED)

let n=0
const record=(slug,kind,labels,text)=>{
  const id=(++n).toString(16).padStart(32,'0')
  return [id,{id,slug,title:`Fixture ${slug}`,origin:{created:'2026-09-15T00:00:00Z',collaborators:[]},
    usermetadata:{classifications:[{labelset:'kind',label:kind},...Object.entries(labels).map(([labelset,label])=>({labelset,label}))]},
    extra:{metadata:{date:'2026-09-15',...(labels.bill_key?{bill_key:labels.bill_key,version_id:'first-senate'}:{})}},
    fields:{body:{paragraphs:{[`${id}/t/body/0-${text.length}`]:{text,score:0.9,score_type:'RERANKER'}}}}}]
}
const passage=subject=>`The ${subject} sets out who is affected and what would change. It gives the commencement and the limits that apply.`
const pool=Object.fromEntries([
  record(`bill-text-${VETERANS}-first-senate`,'bill_text',{bill_key:VETERANS,state:'federal'},passage('veterans allied health bill text')),
  record(`bill-${VETERANS}`,'bill',{state:'federal'},passage('veterans allied health bill record and summary')),
  record(`bill-text-${SIBLING}-first-senate`,'bill_text',{bill_key:SIBLING,state:'federal'},passage('other veterans bill text')),
  record(`bill-${SIBLING}`,'bill',{state:'federal'},passage('other veterans bill record')),
  record('speech-990001','speech',{state:'federal',chamber:'senate'},passage('unrelated veterans speech')),
  record('division-federal-senate-990002','division',{state:'federal',chamber:'senate'},passage('unrelated division')),
  record(`bill-text-${DEBATED}-first-reps`,'bill_text',{bill_key:DEBATED,state:'federal'},passage('debated bill text')),
  record(`bill-${DEBATED}`,'bill',{state:'federal'},passage('debated bill record')),
  ...debated.speeches.map(s=>record(s.slug,'speech',{state:'federal',chamber:'representatives'},passage(`speech ${s.slug} on the debated bill`))),
  ...debated.divisions.map(d=>record(`division-${d.key}`,'division',{state:'federal',chamber:d.house},passage(`division ${d.key} on the debated bill`))),
])
// The platform's filter, for the clauses Ask sends. An unknown clause fails the test rather than matching.
const matches=(e,r)=>{
  if(e.and)return e.and.every(x=>matches(x,r))
  if(e.or)return e.or.some(x=>matches(x,r))
  if(e.not)return !matches(e.not,r)
  if(e.prop==='label')return r.usermetadata.classifications.some(c=>c.labelset===e.labelset&&c.label===e.label)
  if(e.prop==='resource')return e.slug?e.slug===r.slug:e.id===r.id
  if(e.prop==='created')return true
  if(e.prop==='field')return false // generated fields; the fixtures have none
  throw new Error('unexpected filter clause '+JSON.stringify(e))
}
// As NucliaDB's parser does (parse_expression: "Cannot find slug"), a resource clause naming a slug that is not in
// the box rejects the whole request. `absent` takes records out of the box for one test.
const absent=new Set();let rejectStatus=412
const inBox=()=>Object.fromEntries(Object.entries(pool).filter(([,r])=>!absent.has(r.slug)))
const unknownSlug=e=>e.and?e.and.map(unknownSlug).find(Boolean):e.or?e.or.map(unknownSlug).find(Boolean):e.not?unknownSlug(e.not):e.prop==='resource'&&e.slug&&!Object.values(inBox()).some(r=>r.slug===e.slug)?e.slug:undefined
const kbAsks=[],rejected=[]
const kbErrors=[]
globalThis.fetch=async(input,init)=>{try{return await kb(input,init)}catch(error){kbErrors.push(error);throw error}}
const kb=async(input,init)=>{
  const url=new URL(String(input)),headers=new Headers(init?.headers)
  assert.ok(url.hostname.startsWith('offline.'),`no network: ${url.href}`)
  if(!url.pathname.endsWith('/ask'))return Response.json({resources:{},fulltext:{total:0,facets:{}}})
  const body=JSON.parse(String(init.body));kbAsks.push(body)
  const field=body.filter_expression?.field
  const unknown=field&&unknownSlug(field)
  if(unknown){rejected.push(unknown);return Response.json({detail:`Cannot find slug ${unknown}`},{status:rejectStatus})}
  const found=Object.fromEntries(Object.entries(inBox()).filter(([,r])=>!field||matches(field,r)))
  const ids=Object.values(found).flatMap(r=>Object.keys(r.fields.body.paragraphs))
  const answer=ids.length?ids.map((_,i)=>`Point ${i+1} from the record.[^${i+1}]`).join(' ')+'\n\n'+ids.map((_,i)=>`[^${i+1}]: block-${i+1}`).join('\n'):''
  const notes=Object.fromEntries(ids.map((id,i)=>[`block-${i+1}`,id]))
  if(headers.get('x-synchronous')==='true')return Response.json({answer,citation_footnote_to_context:notes,retrieval_results:{resources:found}})
  const items=[{type:'retrieval',results:{resources:found}},...(answer?[{type:'answer',text:answer},{type:'footnote_citations',footnote_to_context:notes}]:[]),{type:'status',code:'0'}]
  return new Response(items.map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}})
}
// A research model with nothing to say: the research route, when it runs, fails over to ordinary retrieval.
const modelCalls=()=>globalThis.__researchModel.doStreamCalls.length+globalThis.__researchModel.doGenerateCalls.length
const warned=[]
const ask=async(input,stream=false,{cache=false}={})=>{
  kbAsks.length=0;kbErrors.length=0;rejected.length=0;warned.length=0;stored.length=0
  globalThis.__researchModel=new MockLanguageModelV4({doGenerate:[]})
  const realWarn=console.warn,realLog=console.log,realError=console.error;console.log=console.error=()=>{};console.warn=(...args)=>{warned.push(args.map(String).join(' '))}
  try{
    const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(cache?{}:{'x-opax-nocache':'1'})},body:JSON.stringify(input)})
    const raw=await response.text()
    while(pending.length)await Promise.all(pending.splice(0))
    if(!stream)return {status:response.status,body:JSON.parse(raw)}
    const parser=new AskStream({stage(){},delta(){},retry(){}});parser.push(raw,true)
    return {status:response.status,body:parser.result()}
  }finally{console.warn=realWarn;console.log=realLog;console.error=realError;daily.sqlite.exec('DELETE FROM research_daily_spend')}
}
const billClause=key=>JSON.stringify({prop:'label',labelset:'bill_key',label:key})
/** An answer whose every source and citation is one of the bill's records, with the scope echoed. */
function onlyTheBill({status,body},key,billFile,label){
  const scope=billScope(key,billFile)
  assert.deepEqual(kbErrors.map(String),[],label)
  assert.equal(status,200,label+' '+JSON.stringify(body).slice(0,300))
  assert.ok(String(body.answer??'').trim(),`${label}: an answer`)
  assert.ok(body.sources?.length>0,`${label}: sources listed`)
  for(const s of body.sources)assert.ok(inBillScope(s,scope),`${label}: source ${s.slug} (${s.href}) is one of the bill's records`)
  const inside=new Set(body.sources.map(s=>s.resource))
  assert.ok(Object.keys(body.citations??{}).length>0,`${label}: cited`)
  for(const id of Object.keys(body.citations))assert.ok(inside.has(id.split('/')[0]),`${label}: citation ${id} is to a listed bill record`)
  assert.equal(body.scope?.bill,key,`${label}: the scope names the bill`)
  assert.ok(kbAsks.length>0,`${label}: retrieval ran`)
  for(const sent of kbAsks){
    assert.ok(JSON.stringify(sent.filter_expression).includes(billClause(key)),`${label}: every retrieval carries the bill filter`)
    assert.ok(!(sent.rag_strategies??[]).some(s=>s.name==='prequeries'),`${label}: no pinned pass outside the filter`)
  }
  assert.equal(modelCalls(),0,`${label}: the research tools, which search the whole record, never ran`)
}
test.after(()=>{restore();daily.close()})

test('the report\'s bill (Veterans\' Allied Health Care, au-federal-s1515): every source and citation belongs to the bill, on JSON and on the stream',async()=>{
  assert.match(veterans.title,/^Military Rehabilitation and Compensation Amendment \(Veterans’ Allied Health Care\) Bill 2026$/)
  for(const stream of [false,true]){
    const run=await ask({question:'What would this bill change for veterans?',bill:VETERANS},stream)
    onlyTheBill(run,VETERANS,veterans,stream?'stream':'json')
    assert.deepEqual(run.body.sources.map(s=>s.slug).sort(),[`bill-${VETERANS}`,`bill-text-${VETERANS}-first-senate`],'its text and its record, and not the other veterans bill of the same week')
  }
})

test('a debated bill: the speeches and divisions its file lists are in scope, and nothing else is',async()=>{
  const run=await ask({question:'What did members say about this bill and how did they vote?',bill:DEBATED})
  onlyTheBill(run,DEBATED,debated,'debated')
  const slugs=run.body.sources.map(s=>s.slug)
  assert.equal(rejected.length,0,'every listed record is in the box')
  for(const slug of slugs)assert.ok(slug===`bill-${DEBATED}`||slug===`bill-text-${DEBATED}-first-reps`||debated.speeches.some(s=>s.slug===slug)||debated.divisions.some(d=>`division-${d.key}`===slug),slug)
  assert.ok(slugs.some(slug=>slug.startsWith('speech-'))&&slugs.some(slug=>slug.startsWith('division-')),'speeches and divisions are retrieved')
})

test('questions that other routes answer from outside the bill still go to the bill\'s records',async()=>{
  for(const question of ['How much is a senator paid?','Who donated the most to Labor?','Who is the Prime Minister?','What has Jacqui Lambie said in parliament this year?','What did Jacqui Lambie say about veterans?'])
    onlyTheBill(await ask({question,bill:VETERANS}),VETERANS,veterans,question)
})

test('a follow-up in a bill conversation stays in the bill and pins no earlier record',async()=>{
  const outside=Object.keys(pool).find(id=>pool[id].slug==='speech-990001')
  const run=await ask({question:'When would it start?',bill:VETERANS,prior_resources:[outside],context:[]})
  onlyTheBill(run,VETERANS,veterans,'follow-up')
})

test('the request\'s other filters join the bill filter',async()=>{
  const run=await ask({question:'What did members say about this bill?',bill:DEBATED,kind:'speech'})
  onlyTheBill(run,DEBATED,debated,'speeches')
  assert.ok(run.body.sources.length>0&&run.body.sources.every(s=>debated.speeches.some(x=>x.slug===s.slug)),'only the bill\'s speeches')
})

// The platform rejects a request that names a slug it does not hold. One listed speech or division missing from the
// box, or a bill record not yet published, must not cost the reader the answer: the ask goes again on the bill label
// alone, which is still inside the bill.
for(const stream of [false,true])for(const [name,slug] of [['a listed speech',debated.speeches[5].slug],['a listed division',`division-${debated.divisions[7].key}`],['the bill record',`bill-${DEBATED}`]])
  test(`${name} missing from the box: the reader still gets an answer from the bill, never an error (${stream?'stream':'json'})`,async()=>{
    absent.add(slug)
    try{
      const run=await ask({question:'What does this bill change?',bill:DEBATED},stream)
      assert.ok(rejected.includes(slug),'the platform rejected the slug filter')
      assert.equal(run.status,200,JSON.stringify(run.body).slice(0,200))
      assert.equal(run.body.error,undefined)
      assert.ok(String(run.body.answer??'').trim(),'an answer')
      assert.deepEqual(run.body.sources.map(s=>s.slug),[`bill-text-${DEBATED}-first-reps`],'answered from the bill\'s text')
      assert.ok(Object.keys(run.body.citations).length>0,'cited')
      assert.equal(run.body.scope?.bill,DEBATED)
      for(const sent of kbAsks)assert.ok(JSON.stringify(sent.filter_expression).includes(billClause(DEBATED)),'every request, the second included, is inside the bill')
      assert.equal(modelCalls(),0)
    }finally{absent.clear()}
  })

test('the label-only retry is logged with the bill key and the upstream status, and never the question; 404 is retried too',async()=>{
  const question='What does this bill change for my neighbour Zebedee Quillfeather?'
  absent.add(debated.speeches[5].slug)
  try{
    for(const status of [400,404,412,422])for(const stream of [false,true]){
      rejectStatus=status
      const run=await ask({question,bill:DEBATED},stream)
      assert.equal(run.status,200,`${status} ${stream}`);assert.deepEqual(run.body.sources.map(s=>s.slug),[`bill-text-${DEBATED}-first-reps`],`${status}: answered from the bill's text`)
      const logs=warned.filter(line=>line.includes('ask_bill_label_only'))
      assert.ok(logs.length>0,`${status}: logged`)
      for(const line of logs)assert.deepEqual(JSON.parse(line),{event:'ask_bill_label_only',bill:DEBATED,status})
      assert.ok(!warned.some(line=>/Zebedee|Quillfeather|neighbour/.test(line)),'no question text in any log line')
    }
    // Another upstream failure is not this case: no label-only retry, no log.
    rejectStatus=500
    await ask({question,bill:DEBATED})
    assert.equal(warned.filter(line=>line.includes('ask_bill_label_only')).length,0)
    assert.ok(kbAsks.every(sent=>JSON.stringify(sent.filter_expression).includes('"prop":"resource"')),'500: the full filter only')
  }finally{absent.clear();rejectStatus=412}
  await ask({question,bill:DEBATED})
  assert.equal(warned.filter(line=>line.includes('ask_bill_label_only')).length,0,'nothing logged when the full filter is accepted')
})

test('an answer from the label-only retry is not kept in the answer cache; a full bill answer is',async()=>{
  for(const stream of [false,true]){
    const question=`What does this bill change, asked ${stream?'on the stream':'as JSON'}?`
    absent.add(debated.speeches[5].slug)
    try{
      const run=await ask({question,bill:DEBATED},stream,{cache:true})
      assert.equal(run.status,200);assert.ok(rejected.length>0)
      assert.deepEqual(stored,[],'the degraded answer is not stored')
    }finally{absent.clear()}
    const full=await ask({question,bill:DEBATED},stream,{cache:true})
    assert.equal(full.status,200);assert.equal(rejected.length,0)
    assert.ok(stored.length>0,'the full answer is stored as before')
  }
})

test('a bill key with no file and no records: an answer with no sources, on JSON and on the stream, never an error',async()=>{
  for(const stream of [false,true]){
    const run=await ask({question:'What does this bill do?',bill:'au-federal-zz-no-such-bill'},stream)
    assert.equal(run.status,200,JSON.stringify(run.body).slice(0,200));assert.equal(run.body.error,undefined)
    assert.ok(String(run.body.answer??'').trim(),'an answer, never blank')
    assert.equal(run.body.sources?.length??0,0,'nothing from outside the bill')
    assert.ok(rejected.includes('bill-au-federal-zz-no-such-bill'))
    for(const sent of kbAsks)assert.ok(JSON.stringify(sent.filter_expression).includes(billClause('au-federal-zz-no-such-bill')))
  }
})

// `index` named /bills/index.json, the 1.9 MB list of every bill, as if it were one bill's file.
test('only a bill key is a scope: `index` and other asset names are not, and the ask runs as usual',async()=>{
  for(const bill of ['index','search-catalog','au','au-federal','au-federal-']){
    const run=await ask({question:'What would this bill change for veterans?',bill})
    assert.equal(run.status,200);assert.equal(run.body.scope?.bill,undefined,bill)
    assert.ok(modelCalls()>0,`${bill}: not routed as a bill`)
    for(const sent of kbAsks)assert.ok(!JSON.stringify(sent.filter_expression??{}).includes('bill_key'),`${bill}: no bill filter`)
  }
})

test('without a bill, or with a value that is not a bill key, Ask is as it was',async()=>{
  for(const input of [{question:'What would this bill change for veterans?'},{question:'What would this bill change for veterans?',bill:'Not A Key!'},{question:'What would this bill change for veterans?',bill:42}]){
    const run=await ask(input)
    assert.equal(run.status,200,JSON.stringify(run.body).slice(0,300)+kbErrors.map(String).join())
    assert.ok(modelCalls()>0,'the research route is tried as before')
    assert.equal(run.body.scope?.bill,undefined)
    for(const sent of kbAsks)assert.ok(!JSON.stringify(sent.filter_expression??{}).includes('bill_key'),'no bill filter')
    assert.ok(run.body.sources.some(s=>s.slug==='speech-990001'),'the whole record is searched')
  }
})

test('the key, the clause and the body',()=>{
  assert.equal(askBillKey(' au-federal-s1515 '),VETERANS)
  for(const key of ['au-federal-r7531','au-federal-alrc-1270','au-nsw-18524','au-federal-ed-payday-super-2025'])assert.equal(askBillKey(key),key)
  for(const bad of [undefined,null,'',42,'S1515','au federal','../bills/index','index','au-federal','au-federal-','federal-r7531','au-'+'a'.repeat(200),['au-federal-s1515']])assert.equal(askBillKey(bad),null,String(bad))
  const scope=billScope(DEBATED,debated)
  assert.equal(scope.slugs.length,1+debated.speeches.length+debated.divisions.length)
  assert.deepEqual(billScopeClause(billScope(VETERANS,veterans)),{or:[{prop:'label',labelset:'bill_key',label:VETERANS},{prop:'resource',slug:`bill-${VETERANS}`}]})
  const news={not:{prop:'label',labelset:'kind',label:'news'}}
  const body=billScopedBody({query:'q',filter_expression:{field:{and:[news]}},rag_strategies:[{name:'neighbouring_paragraphs'},{name:'prequeries'}],prompt:{system:'s',user:'u'}},billScope(VETERANS,veterans))
  assert.deepEqual(body.filter_expression.field.and[0],{and:[news]},'the request\'s own filter is kept')
  assert.deepEqual(body.rag_strategies,[{name:'neighbouring_paragraphs'}])
  const labelOnly={field:{and:[{and:[news]},{prop:'label',labelset:'bill_key',label:VETERANS}]}}
  assert.deepEqual(body[BILL_LABEL_ONLY],{key:VETERANS,filter:labelOnly},'the filter to ask again with, and the key to log')
  assert.equal({...body,top_k:12}[BILL_LABEL_ONLY],body[BILL_LABEL_ONLY],'one object, shared with every retry body')
  assert.ok(!JSON.stringify(body).includes('label-only'),'never sent to the platform')
  assert.ok(body.prompt.user.startsWith('Every passage belongs to one bill, the Military Rehabilitation and Compensation Amendment (Veterans’ Allied Health Care) Bill 2026'))
  assert.ok(body.prompt.user.endsWith('u'))
  assert.equal(inBillScope({slug:`bill-text-${SIBLING}-first-senate`,href:`/bill/${SIBLING}?text-version=first-senate#bill-full-text`},billScope(VETERANS,veterans)),false)
})
